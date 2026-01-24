import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { requireSession } from "@/lib/rbac";
import { createProxyRequest } from "@/lib/tunnelRegistry";

async function canAccess(clientId: string, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
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

  const isAdmin = session.user?.permissions?.includes("admin.users") ?? false;
  const userId = session.user?.id ?? "";
  const allowed = await canAccess(clientId, userId, isAdmin);
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
  const url = new URL(req.url);
  const path = `/${pathParts?.join("/") ?? ""}${url.search}`;

  let response;
  try {
    const whitelist = new Set([
      "accept",
      "accept-language",
      "user-agent",
      "content-type",
      "content-length",
    ]);
    const forwardHeaders = Object.fromEntries(
      Array.from(req.headers.entries()).filter(([key]) =>
        whitelist.has(key.toLowerCase())
      )
    );

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
      path,
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

  const headers = new Headers(response.headers ?? {});
  headers.delete("content-length");

  return new NextResponse(responseBody, {
    status: response.status ?? 200,
    headers,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
export const OPTIONS = handleProxy;
