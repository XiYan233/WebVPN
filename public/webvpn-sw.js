/* WebVPN Service Worker
 * Intercepts same-origin requests from tunneled pages and rewrites
 * root-relative URLs (e.g. /api/data) to /tunnel/{clientId}/api/data.
 */

const state = {
  basePath: "",
  activeClientId: "",
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isApiRequest = requestUrl.pathname.startsWith("/api/");
  if (!isSameOrigin && !isApiRequest) {
    return;
  }

  const basePath = state.basePath;
  const appPath = stripBasePath(requestUrl.pathname, basePath);

  const directClientId = extractClientIdFromPath(requestUrl.pathname, basePath);
  const referrerClientId = getClientIdFromReferrer(event.request.referrer, basePath);
  const isFromTunnel = Boolean(referrerClientId);
  const clientId = directClientId || referrerClientId || state.activeClientId;

  if (!clientId) {
    return;
  }

  if (appPath.startsWith("/tunnel/")) {
    return;
  }

  if (isWebVpnPath(appPath) && !(isFromTunnel && appPath.startsWith("/webvpn-api"))) {
    return;
  }

  const tunnelPrefix = `${basePath}/tunnel/${clientId}`;
  const rewrittenUrl = new URL(
    `${tunnelPrefix}${appPath}${requestUrl.search}`,
    self.location.origin
  );

  event.respondWith(
    (async () => {
      const method = event.request.method;
      const init = {
        method,
        headers: event.request.headers,
        mode: event.request.mode,
        credentials: event.request.credentials,
        cache: event.request.cache,
        redirect: event.request.redirect,
        referrer: event.request.referrer,
        referrerPolicy: event.request.referrerPolicy,
        integrity: event.request.integrity,
        keepalive: event.request.keepalive,
      };

      if (method !== "GET" && method !== "HEAD") {
        const body = await event.request.clone().arrayBuffer();
        init.body = body;
      }

      try {
        return await fetch(rewrittenUrl.toString(), init);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch";
        return new Response(
          JSON.stringify(
            {
              error: message,
              method,
              originalUrl: event.request.url,
              rewrittenUrl: rewrittenUrl.toString(),
            },
            null,
            2
          ),
          {
            status: 502,
            headers: { "content-type": "application/json" },
          }
        );
      }
    })()
  );
});
