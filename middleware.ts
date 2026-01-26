import { NextResponse, type NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const basePath = req.nextUrl.basePath || "/webvpn";
  if (pathname === "/" && !req.nextUrl.basePath) {
    const url = new URL(basePath, req.url);
    return NextResponse.redirect(url);
  }
  const tunnelMatch = pathname.match(
    new RegExp(`^${basePath}/tunnel/([^/]+)(?:/|$)`)
  );
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
    pathname.startsWith(`${basePath}/clients`) ||
    pathname.startsWith(`${basePath}/admin`) ||
    pathname.startsWith(`${basePath}/logs`) ||
    pathname.startsWith(`${basePath}/tunnel`) ||
    pathname.startsWith(`${basePath}/webvpn-api/clients`) ||
    pathname.startsWith(`${basePath}/webvpn-api/admin`) ||
    pathname.startsWith(`${basePath}/webvpn-api/auth`) ||
    pathname.startsWith(`${basePath}/webvpn-api/logs`) ||
    pathname === basePath ||
    pathname.startsWith(`${basePath}/unauthorized`);

  const hasSessionCookie =
    req.cookies.get("authjs.session-token") ||
    req.cookies.get("__Secure-authjs.session-token");

  if (pathname.startsWith(`/_next/`)) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(
      new RegExp(`${basePath}/tunnel/([^/]+)(?:/|$)`)
    );
    const clientId = refererMatch?.[1];
    if (clientId && hasSessionCookie) {
      const rewritePath = pathname.slice(basePath.length);
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${rewritePath}`,
        req.url
      );
      rewriteUrl.search = req.nextUrl.search;
      return setTunnelCookie(NextResponse.rewrite(rewriteUrl), clientId);
    }
    return setTunnelCookie(NextResponse.next(), clientId);
  }

  if (pathname.startsWith("/_next/")) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(
      new RegExp(`${basePath}/tunnel/([^/]+)(?:/|$)`)
    );
    const clientId = refererMatch?.[1] ?? req.cookies.get("webvpn_tunnel")?.value;
    if (clientId && hasSessionCookie) {
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${pathname}`,
        req.url
      );
      rewriteUrl.search = req.nextUrl.search;
      return setTunnelCookie(NextResponse.rewrite(rewriteUrl), clientId);
    }
    return NextResponse.next();
  }

  if (
    !isWebVpnPath &&
    !pathname.startsWith(`${basePath}/unauthorized`) &&
    !pathname.startsWith(`${basePath}/webvpn-api/auth/callback`)
  ) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(
      new RegExp(`${basePath}/tunnel/([^/]+)(?:/|$)`)
    );
    const cookieClientId = req.cookies.get("webvpn_tunnel")?.value;
    const clientId = refererMatch?.[1] ?? cookieClientId;
    if (clientId && hasSessionCookie) {
      const rewritePath = pathname.startsWith(basePath)
        ? pathname.slice(basePath.length)
        : pathname;
      const rewriteUrl = new URL(
        `${basePath}/tunnel/${clientId}${rewritePath}`,
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
    `${basePath}/clients`,
    `${basePath}/admin`,
    `${basePath}/logs`,
    `${basePath}/tunnel`,
    `${basePath}/webvpn-api/clients`,
    `${basePath}/webvpn-api/admin`,
  ];

  const requiresAuth = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
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
