/* WebVPN Service Worker
 * Intercepts same-origin requests from tunneled pages and rewrites
 * root-relative URLs (e.g. /api/data) to /tunnel/{clientId}/api/data.
 */

const state = {
  basePath: "",
  activeClientId: "",
};

function normalizeBasePath(value) {
  if (!value) return "";
  let base = String(value).trim();
  if (!base) return "";
  if (!base.startsWith("/")) base = `/${base}`;
  if (base !== "/" && base.endsWith("/")) base = base.slice(0, -1);
  return base === "/" ? "" : base;
}

function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

function extractClientIdFromPath(pathname, basePath) {
  const appPath = stripBasePath(pathname, basePath);
  const match = appPath.match(/^\/tunnel\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? "";
}

function isWebVpnPath(appPath) {
  return (
    appPath === "/" ||
    appPath.startsWith("/_next/") ||
    appPath.startsWith("/clients") ||
    appPath.startsWith("/admin") ||
    appPath.startsWith("/logs") ||
    appPath.startsWith("/unauthorized") ||
    appPath.startsWith("/webvpn-api") ||
    appPath.startsWith("/ws") ||
    appPath.startsWith("/tunnel/") ||
    appPath === "/favicon.ico" ||
    appPath === "/webvpn-sw.js"
  );
}

function getClientIdFromReferrer(referrer, basePath) {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    return extractClientIdFromPath(url.pathname, basePath);
  } catch {
    return "";
  }
}

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.type !== "WEBVPN_SET_CLIENT") return;
  const basePath = normalizeBasePath(data.basePath);
  state.basePath = basePath;
  state.activeClientId = data.clientId || state.activeClientId;
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const basePath = state.basePath;
  const appPath = stripBasePath(requestUrl.pathname, basePath);

  const directClientId = extractClientIdFromPath(requestUrl.pathname, basePath);
  const referrerClientId = getClientIdFromReferrer(event.request.referrer, basePath);
  const clientId = directClientId || referrerClientId || state.activeClientId;

  if (!clientId) {
    return;
  }

  if (isWebVpnPath(appPath)) {
    return;
  }

  const tunnelPrefix = `${basePath}/tunnel/${clientId}`;
  const rewrittenUrl = new URL(`${tunnelPrefix}${appPath}${requestUrl.search}`, requestUrl.origin);

  const rewrittenRequest = new Request(rewrittenUrl.toString(), event.request);
  event.respondWith(fetch(rewrittenRequest));
});