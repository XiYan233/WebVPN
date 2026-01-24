import { NextResponse } from "next/server";

export default function middleware(req: Request & { nextUrl: URL; cookies: any }) {
  const { pathname } = req.nextUrl;
  const tunnelMatch = pathname.match(/^\/tunnel\/([^/]+)(?:\/|$)/);
  if (tunnelMatch) {
    const response = NextResponse.next();
    response.cookies.set("webvpn_tunnel", tunnelMatch[1], {
      path: "/",
      sameSite: "lax",
      maxAge: 300,
    });
    return response;
  }

  const isWebVpnPath =
    pathname.startsWith("/clients") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/tunnel") ||
    pathname.startsWith("/api/clients") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/unauthorized");

  const hasSessionCookie =
    req.cookies.get("authjs.session-token") ||
    req.cookies.get("__Secure-authjs.session-token");

  if (pathname.startsWith("/_next/")) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(/\/tunnel\/([^/]+)(?:\/|$)/);
    const clientId = refererMatch?.[1];
    if (clientId && hasSessionCookie) {
      const rewriteUrl = new URL(`/tunnel/${clientId}${pathname}`, req.url);
      rewriteUrl.search = req.nextUrl.search;
      return NextResponse.rewrite(rewriteUrl);
    }
    return NextResponse.next();
  }

  if (!isWebVpnPath && !pathname.startsWith("/unauthorized")) {
    const referer = req.headers.get("referer");
    const refererMatch = referer?.match(/\/tunnel\/([^/]+)(?:\/|$)/);
    const cookieClientId = req.cookies.get("webvpn_tunnel")?.value;
    const clientId = refererMatch?.[1] ?? cookieClientId;
    if (clientId && hasSessionCookie) {
      const rewriteUrl = new URL(`/tunnel/${clientId}${pathname}`, req.url);
      rewriteUrl.search = req.nextUrl.search;
      return NextResponse.rewrite(rewriteUrl);
    }
  }
  const protectedPrefixes = [
    "/clients",
    "/admin",
    "/logs",
    "/tunnel",
    "/api/clients",
    "/api/admin",
  ];

  const requiresAuth = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (requiresAuth) {
    if (!hasSessionCookie) {
      const url = new URL("/", req.url);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|favicon.ico|ws).*)"],
};
