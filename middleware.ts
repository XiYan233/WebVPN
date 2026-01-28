import { NextResponse, type NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
  const basePath = req.nextUrl.basePath ?? "";
  const hasBasePath = basePath.length > 0;
  const pathname = req.nextUrl.pathname;
  const toAppPath = (path: string) =>
    hasBasePath && path.startsWith(basePath)
      ? path.slice(basePath.length) || "/"
      : path;
  const appPath = toAppPath(pathname);

  const isWebVpnPathFor = (path: string) =>
    path.startsWith("/clients") ||
    path.startsWith("/admin") ||
    path.startsWith("/logs") ||
    path.startsWith("/tunnel") ||
    path.startsWith("/webvpn-api/clients") ||
    path.startsWith("/webvpn-api/admin") ||
    path.startsWith("/webvpn-api/auth") ||
    path.startsWith("/webvpn-api/logs") ||
    path === "/webvpn-sw.js" ||
    path === "/" ||
    path.startsWith("/unauthorized");

  const isWebVpnPath = isWebVpnPathFor(appPath);

  const shouldClearTunnelAssetsCookie =
    isWebVpnPath && !appPath.startsWith("/tunnel");
  const finalize = (response: NextResponse) => {
    if (shouldClearTunnelAssetsCookie) {
      response.cookies.set("webvpn_tunnel_assets", "", {
        path: "/_next",
        sameSite: "lax",
        maxAge: 0,
      });
    }
    return response;
  };

  if (hasBasePath && appPath.startsWith("/webvpn-api") && !pathname.startsWith(basePath)) {
    const url = new URL(`${basePath}${appPath}`, req.url);
    url.search = req.nextUrl.search;
    return finalize(NextResponse.redirect(url));
  }

  if (hasBasePath && appPath === "/" && !req.nextUrl.basePath) {
    const url = new URL(basePath, req.url);
    return finalize(NextResponse.redirect(url));
  }
  const tunnelMatch = appPath.match(/^\/tunnel\/([^/]+)(?:\/|$)/);
  if (tunnelMatch) {
    const response = NextResponse.next();
    response.cookies.set("webvpn_tunnel", tunnelMatch[1], {
      path: "/",
      sameSite: "lax",
      maxAge: 300,
    });
    response.cookies.set("webvpn_tunnel_assets", tunnelMatch[1], {
      path: "/_next",
      sameSite: "lax",
      maxAge: 300,
    });
    return response;
  }

  const setTunnelCookie = (response: NextResponse, clientId?: string) => {
    if (!clientId) return response;
    response.cookies.set("webvpn_tunnel", clientId, {
      path: "/",
      sameSite: "lax",
      maxAge: 300,
    });
    response.cookies.set("webvpn_tunnel_assets", clientId, {
      path: "/_next",
      sameSite: "lax",
      maxAge: 300,
    });
    return response;
  };

  const sessionCookieNames = [
    "webvpn.session-token",
    "__Secure-webvpn.session-token",
    "authjs.session-token",
    "__Secure-authjs.session-token",
  ];
  const hasSessionCookie = sessionCookieNames.some((name) =>
    Boolean(req.cookies.get(name))
  );

  if (appPath.startsWith("/_next/")) {
    if (hasBasePath && pathname.startsWith(basePath)) {
      return NextResponse.next();
    }
    const referer = req.headers.get("referer");
    let refererAppPath: string | undefined;
    if (referer) {
      try {
        refererAppPath = toAppPath(new URL(referer, req.url).pathname);
      } catch {
        refererAppPath = undefined;
      }
    }
    const refererTunnelMatch = refererAppPath?.match(
      /^\/tunnel\/([^/]+)(?:\/|$)/
    );
    const refererIsTunnel = Boolean(refererTunnelMatch?.[1]);
    const refererIsWebVpnNonTunnel = Boolean(
      refererAppPath && isWebVpnPathFor(refererAppPath) && !refererIsTunnel
    );

    if (refererIsTunnel && refererTunnelMatch?.[1]) {
      const clientId = refererTunnelMatch[1];
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${appPath}`,
        req.url
      );
      rewriteUrl.search = req.nextUrl.search;
      return setTunnelCookie(NextResponse.rewrite(rewriteUrl), clientId);
    }
    return finalize(NextResponse.next());
  }

  if (
    !isWebVpnPath &&
    !appPath.startsWith("/_next/") &&
    !appPath.startsWith("/unauthorized") &&
    !appPath.startsWith("/webvpn-api/auth/callback")
  ) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(
      new RegExp(`${basePath}/tunnel/([^/]+)(?:/|$)`)
    );
    const cookieClientId = req.cookies.get("webvpn_tunnel")?.value;
    const clientId = refererMatch?.[1] ?? cookieClientId;
    if (clientId && hasSessionCookie) {
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${appPath}`,
        req.url
      );
      rewriteUrl.search = req.nextUrl.search;
      return setTunnelCookie(NextResponse.rewrite(rewriteUrl), clientId);
    }
    if (refererMatch?.[1]) {
      return setTunnelCookie(NextResponse.next(), refererMatch[1]);
    }
  }
  const protectedPrefixes = [
    "/clients",
    "/admin",
    "/logs",
    "/tunnel",
    "/webvpn-api/clients",
    "/webvpn-api/admin",
  ];

  const requiresAuth = protectedPrefixes.some((prefix) =>
    appPath.startsWith(prefix)
  );

  if (requiresAuth) {
    if (!hasSessionCookie) {
      const url = new URL(`${basePath}/`, req.url);
      return finalize(NextResponse.redirect(url));
    }
  }

  return finalize(NextResponse.next());
}

export const config = {
  matcher: ["/", "/((?!webvpn/webvpn-api/auth|favicon.ico|ws).*)"],
};
