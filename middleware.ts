import { NextResponse, type NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
  const appPath = req.nextUrl.pathname;
  const basePath = req.nextUrl.basePath || "/webvpn";
  if (appPath === "/" && !req.nextUrl.basePath) {
    const url = new URL(basePath, req.url);
    return NextResponse.redirect(url);
  }
  const tunnelMatch = appPath.match(/^\/tunnel\/([^/]+)(?:\/|$)/);
  if (tunnelMatch) {
    const response = NextResponse.next();
    response.cookies.set("webvpn_tunnel", tunnelMatch[1], {
      path: "/",
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
    return response;
  };

  const isWebVpnPath =
    appPath.startsWith("/clients") ||
    appPath.startsWith("/admin") ||
    appPath.startsWith("/logs") ||
    appPath.startsWith("/tunnel") ||
    appPath.startsWith("/webvpn-api/clients") ||
    appPath.startsWith("/webvpn-api/admin") ||
    appPath.startsWith("/webvpn-api/auth") ||
    appPath.startsWith("/webvpn-api/logs") ||
    appPath === "/" ||
    appPath.startsWith("/unauthorized");

  const hasSessionCookie =
    req.cookies.get("authjs.session-token") ||
    req.cookies.get("__Secure-authjs.session-token");

  if (appPath.startsWith(`/_next/`)) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(
      new RegExp(`${basePath}/tunnel/([^/]+)(?:/|$)`)
    );
    const clientId = refererMatch?.[1];
    if (clientId && hasSessionCookie) {
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${appPath}`,
        req.url
      );
      rewriteUrl.search = req.nextUrl.search;
      return setTunnelCookie(NextResponse.rewrite(rewriteUrl), clientId);
    }
    return setTunnelCookie(NextResponse.next(), clientId);
  }

  if (appPath.startsWith("/_next/")) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(
      new RegExp(`${basePath}/tunnel/([^/]+)(?:/|$)`)
    );
    const clientId = refererMatch?.[1] ?? req.cookies.get("webvpn_tunnel")?.value;
    if (clientId && hasSessionCookie) {
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${appPath}`,
        req.url
      );
      rewriteUrl.search = req.nextUrl.search;
      return setTunnelCookie(NextResponse.rewrite(rewriteUrl), clientId);
    }
    return NextResponse.next();
  }

  if (
    !isWebVpnPath &&
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
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/((?!webvpn/webvpn-api/auth|favicon.ico|ws).*)"],
};
