import { NextResponse } from "next/server";
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireSession } from "@/lib/rbac";
import { createProxyRequest } from "@/lib/tunnelRegistry";

type UpstreamHeaders = Record<string, string | string[] | number | undefined>;

const WEBVPN_COOKIE_PREFIXES = ["webvpn.", "__Secure-webvpn."];
const WEBVPN_COOKIE_NAMES = new Set([
  "webvpn_tunnel",
  "webvpn_tunnel_assets",
]);

function normalizeBasePath(value: string | null | undefined) {
  if (!value) return "";
  let basePath = value.trim();
  if (!basePath) return "";
  if (!basePath.startsWith("/")) basePath = `/${basePath}`;
  if (basePath !== "/" && basePath.endsWith("/")) {
    basePath = basePath.slice(0, -1);
  }
  return basePath === "/" ? "" : basePath;
}

function stripBasePath(pathname: string, basePath: string) {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function extractClientIdFromReferer(referer: string | null, basePath: string) {
  if (!referer) return "";
  try {
    const url = new URL(referer);
    const appPath = stripBasePath(url.pathname, basePath);
    const match = appPath.match(/^\/tunnel\/([^/]+)(?:\/|$)/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

function looksLikeCuid(value: string) {
  return /^c[a-z0-9]{24}$/i.test(value);
}

function applyClientBasePath(pathname: string, basePath: string) {
  if (!basePath) return pathname;
  if (pathname === "/" || pathname === "") return `${basePath}/`;
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    return pathname;
  }
  if (pathname.startsWith("/")) return `${basePath}${pathname}`;
  return `${basePath}/${pathname}`;
}

function escapeHtmlAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function injectBaseAndServiceWorker(html: string, options: {
  baseHref: string;
  clientId: string;
  basePath: string;
}) {
  if (html.includes("data-webvpn-base") || html.includes("data-webvpn-sw")) {
    return html;
  }

  const baseTag = `<base data-webvpn-base href="${escapeHtmlAttr(
    options.baseHref
  )}">`;

  const swUrl = `${options.basePath}/webvpn-sw.js` || "/webvpn-sw.js";
  const swScope = options.basePath ? `${options.basePath}/` : "/";

  const script = [
    '<script data-webvpn-sw>',
    "(() => {",
    "  if (!('serviceWorker' in navigator)) return;",
    `  const clientId = ${JSON.stringify(options.clientId)};`,
    `  const basePath = ${JSON.stringify(options.basePath)};`,
    `  const swUrl = ${JSON.stringify(swUrl)};`,
    `  const swScope = ${JSON.stringify(swScope)};`,
    "  const notify = (sw) => {",
    "    try { sw?.postMessage?.({ type: 'WEBVPN_SET_CLIENT', clientId, basePath }); } catch {}",
    "  };",
    "  navigator.serviceWorker.register(swUrl, { scope: swScope })",
    "    .then((reg) => {",
    "      notify(reg.active || navigator.serviceWorker.controller);",
    "      navigator.serviceWorker.addEventListener('controllerchange', () => {",
    "        notify(navigator.serviceWorker.controller);",
    "      });",
    "    })",
    "    .catch(() => {});",
    "})();",
    "</script>",
  ].join("");

  const injection = `${baseTag}${script}`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return `${html.slice(0, insertAt)}${injection}${html.slice(insertAt)}`;
  }
  return `${injection}${html}`;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function rewriteLocalOrigins(html: string, targetBaseUrl: string) {
  const target = ensureTrailingSlash(targetBaseUrl);
  return html
    .replace(/https?:\/\/localhost:3000\/?/gi, target)
    .replace(/https?:\/\/127\.0\.0\.1:3000\/?/gi, target)
    .replace(/https?:\/\/192\.168\.0\.\d{1,3}:3000\/?/gi, target);
}

function getHeaderValue(headers: UpstreamHeaders, name: string) {
  const lower = name.toLowerCase();
  const value = headers[name] ?? headers[lower];
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function getSetCookieValues(headers: UpstreamHeaders) {
  const raw = headers["set-cookie"] ?? headers["Set-Cookie"];
  if (!raw) return [] as string[];
  if (Array.isArray(raw)) return raw.filter(Boolean) as string[];
  return [String(raw)];
}

function stripWebvpnCookies(cookieHeader: string | null) {
  if (!cookieHeader) return undefined;
  const filtered = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const name = part.split("=")[0]?.trim();
      if (!name) return false;
      if (WEBVPN_COOKIE_NAMES.has(name)) return false;
      return !WEBVPN_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));
    });
  return filtered.length ? filtered.join("; ") : undefined;
}

function rewriteSetCookie(cookie: string, tunnelBasePath: string) {
  const segments = cookie
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return cookie;

  const [nameValue, ...attrs] = segments;
  let hasPath = false;
  const rewrittenAttrs: string[] = [];

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower.startsWith("path=")) {
      rewrittenAttrs.push(`Path=${tunnelBasePath}`);
      hasPath = true;
      continue;
    }
    if (lower.startsWith("domain=")) {
      continue;
    }
    rewrittenAttrs.push(attr);
  }

  if (!hasPath) {
    rewrittenAttrs.unshift(`Path=${tunnelBasePath}`);
  }

  return [nameValue, ...rewrittenAttrs].join("; ");
}

function decodeHtmlBody(body: Buffer, contentEncoding: string | undefined) {
  if (!contentEncoding) {
    return { body, decoded: false, encoding: "" };
  }
  const encoding = contentEncoding
    .toLowerCase()
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  if (!encoding) {
    return { body, decoded: false, encoding: "" };
  }
  try {
    if (encoding === "gzip") {
      return { body: gunzipSync(body), decoded: true, encoding };
    }
    if (encoding === "deflate") {
      return { body: inflateSync(body), decoded: true, encoding };
    }
    if (encoding === "br") {
      return { body: brotliDecompressSync(body), decoded: true, encoding };
    }
  } catch {
    return { body, decoded: false, encoding };
  }
  return { body, decoded: false, encoding };
}

function looksLikeHtml(contentType: string, body: Buffer) {
  const lowerType = contentType.toLowerCase();
  if (lowerType.includes("text/html") || lowerType.includes("application/xhtml+xml")) {
    return true;
  }
  if (!contentType) {
    const sample = body.subarray(0, 512).toString("utf-8").trimStart();
    const lowerSample = sample.toLowerCase();
    return (
      lowerSample.startsWith("<!doctype html") ||
      lowerSample.startsWith("<html") ||
      lowerSample.startsWith("<head") ||
      lowerSample.startsWith("<meta")
    );
  }
  return false;
}

async function canAccess(
  clientId: string,
  userId: string,
  canViewAll: boolean
) {
  if (canViewAll) return true;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  return client?.ownerId === userId;
}

async function handleProxy(
  req: Request,
  { params }: { params: Promise<{ clientId: string; path?: string[] }> }
) {
  const { clientId, path: pathParts } = await params;
  const session = await requireSession();
  if (!session) {
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("text/html")) {
      const forwardedHost = req.headers.get("x-forwarded-host");
      const host = forwardedHost ?? req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const origin = host ? `${proto}://${host}` : req.url;
      const url = new URL("/unauthorized", origin);
      const pathName = new URL(req.url).pathname;
      url.searchParams.set("from", pathName);
      return NextResponse.redirect(url);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const basePath = normalizeBasePath(
    req.headers.get("x-forwarded-prefix") ?? process.env.NEXT_PUBLIC_BASE_PATH
  );
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const publicOrigin = host ? `${proto}://${host}` : url.origin;
  const fallbackClientId =
    extractClientIdFromReferer(req.headers.get("referer"), basePath) ||
    getCookieValue(req.headers.get("cookie"), "webvpn_tunnel");
  if (
    fallbackClientId &&
    fallbackClientId !== clientId &&
    !looksLikeCuid(clientId)
  ) {
    const shiftedSegments = [clientId, ...(pathParts ?? [])].filter(Boolean);
    const shiftedPathname = `/${shiftedSegments.join("/")}`;
    const redirectUrl = new URL(
      `${basePath}/tunnel/${fallbackClientId}${shiftedPathname}`,
      req.url
    );
    redirectUrl.search = url.search;
    return NextResponse.redirect(redirectUrl);
  }

  const canViewAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");
  const userId = session.user?.id ?? "";
  const allowed = await canAccess(clientId, userId, Boolean(canViewAll));
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client || !client.isActive) {
    return NextResponse.json({ error: "Client not available" }, { status: 404 });
  }

  const rawBody = await req.arrayBuffer();
  const body = Buffer.from(rawBody).toString("base64");
  const rawPathname = `/${pathParts?.join("/") ?? ""}`;
  const tunnelBasePath = `${basePath}/tunnel/${clientId}`;
  const tunnelBaseHref = `${tunnelBasePath}/`;
  const tunnelPublicBaseUrl = `${publicOrigin}${tunnelBasePath}/`;
  const clientBasePath = normalizeBasePath(client.basePath);
  const upstreamPathname = applyClientBasePath(rawPathname, clientBasePath);
  const path = `${upstreamPathname}${url.search}`;
  const fallbackPath = `${rawPathname}${url.search}`;
  const appliedBasePath = Boolean(clientBasePath) && upstreamPathname !== rawPathname;
  const canRetryWithoutBasePath =
    appliedBasePath && (req.method === "GET" || req.method === "HEAD");
  let finalPath = path;

  let response;
  try {
    const whitelist = new Set([
      "accept",
      "accept-language",
      "user-agent",
      "content-type",
      "content-length",
      "authorization",
      "cookie",
      "origin",
      "referer",
      "x-requested-with",
      "x-csrf-token",
      "x-xsrf-token",
    ]);
    const forwardHeaders = Object.fromEntries(
      Array.from(req.headers.entries()).filter(([key]) =>
        whitelist.has(key.toLowerCase())
      )
    );
    if ("cookie" in forwardHeaders) {
      const filteredCookie = stripWebvpnCookies(req.headers.get("cookie"));
      if (filteredCookie) {
        forwardHeaders.cookie = filteredCookie;
      } else {
        delete forwardHeaders.cookie;
      }
    }

    response = await createProxyRequest(
      clientId,
      {
        method: req.method,
        path,
        headers: forwardHeaders,
        body,
      },
      30000
    );

    if (response && !response.error && response.status === 404 && canRetryWithoutBasePath) {
      const fallbackResponse = await createProxyRequest(
        clientId,
        {
          method: req.method,
          path: fallbackPath,
          headers: forwardHeaders,
          body,
        },
        30000
      );
      if (fallbackResponse && !fallbackResponse.error && fallbackResponse.status !== 404) {
        response = fallbackResponse;
        finalPath = fallbackPath;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    const status = message === "Proxy timeout" ? 504 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  if (!response) {
    return NextResponse.json({ error: "Client offline" }, { status: 503 });
  }

  if (response.error) {
    return NextResponse.json({ error: response.error }, { status: 502 });
  }

  const responseBody = response.body
    ? Buffer.from(response.body, "base64")
    : Buffer.from("");

  await prisma.accessLog.create({
    data: {
      clientId,
      userId: userId,
      method: req.method,
      path: finalPath,
      status: response.status ?? 200,
      ip: req.headers.get("x-forwarded-for") ?? "",
    },
  });
  await redis.set(
    `client:lastAccess:${clientId}`,
    new Date().toISOString(),
    "EX",
    86400
  );

  const upstreamHeaders = (response.headers ?? {}) as UpstreamHeaders;
  const contentType = getHeaderValue(upstreamHeaders, "content-type") ?? "";
  const contentEncoding = getHeaderValue(upstreamHeaders, "content-encoding");
  const upstreamSetCookies = getSetCookieValues(upstreamHeaders);
  const upstreamLocation = getHeaderValue(upstreamHeaders, "location");

  let finalBody = responseBody;
  let dropContentEncoding = false;
  let injected = false;
  let htmlDetected = false;
  let decoded = false;
  let decodedEncoding = "";
  if (responseBody.length > 0) {
    const decodedResult = decodeHtmlBody(responseBody, contentEncoding);
    decoded = decodedResult.decoded;
    decodedEncoding = decodedResult.encoding;
    if (looksLikeHtml(contentType, decodedResult.body)) {
      htmlDetected = true;
      dropContentEncoding = decodedResult.decoded;
      const html = decodedResult.body.toString("utf-8");
      const rewrittenHtml = rewriteLocalOrigins(html, tunnelPublicBaseUrl);
      const injectedHtml = injectBaseAndServiceWorker(rewrittenHtml, {
        baseHref: tunnelBaseHref,
        clientId,
        basePath,
      });
      injected = injectedHtml !== rewrittenHtml;
      finalBody = Buffer.from(injectedHtml, "utf-8");
    }
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (value === undefined || value === null) continue;
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "set-cookie" ||
      lowerKey === "content-length" ||
      lowerKey === "content-security-policy" ||
      lowerKey === "content-security-policy-report-only" ||
      lowerKey === "location" ||
      (dropContentEncoding && lowerKey === "content-encoding")
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          headers.append(key, String(item));
        }
      }
      continue;
    }
    headers.append(key, String(value));
  }

  const nextResponse = new NextResponse(finalBody, {
    status: response.status ?? 200,
    headers,
  });
  nextResponse.headers.set("x-webvpn-proxy", "1");
  nextResponse.headers.set("x-webvpn-injected", injected ? "1" : "0");
  nextResponse.headers.set("x-webvpn-html", htmlDetected ? "1" : "0");
  nextResponse.headers.set(
    "x-webvpn-encoding",
    decodedEncoding || "none"
  );
  nextResponse.headers.set("x-webvpn-decoded", decoded ? "1" : "0");
  nextResponse.headers.set("x-webvpn-body-len", String(finalBody.length));

  for (const cookie of upstreamSetCookies) {
    const rewritten = rewriteSetCookie(cookie, tunnelBasePath);
    nextResponse.headers.append("set-cookie", rewritten);
  }

  if (upstreamLocation) {
    let rewrittenLocation = upstreamLocation;
    try {
      const absolute = new URL(upstreamLocation);
      rewrittenLocation = absolute.pathname + absolute.search + absolute.hash;
    } catch {
      // keep as-is when relative
    }
    if (rewrittenLocation.startsWith("/")) {
      rewrittenLocation = `${tunnelBasePath}${rewrittenLocation}`;
    }
    nextResponse.headers.set("location", rewrittenLocation);
  }

  return nextResponse;
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
export const OPTIONS = handleProxy;

