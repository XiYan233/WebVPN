import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canViewAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");
  const clients = await prisma.client.findMany({
    where: canViewAll ? {} : { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const ids = clients.map((client) => client.id);
  if (!ids.length) {
    return NextResponse.json({ clients: [] });
  }

  const [onlineValues, lastSeenValues, ipValues, versionValues, lastAccessValues] =
    await Promise.all([
      redis.mget(ids.map((id) => `client:online:${id}`)),
      redis.mget(ids.map((id) => `client:lastSeen:${id}`)),
      redis.mget(ids.map((id) => `client:ip:${id}`)),
      redis.mget(ids.map((id) => `client:version:${id}`)),
      redis.mget(ids.map((id) => `client:lastAccess:${id}`)),
    ]);

  const payload = clients.map((client, index) => ({
    id: client.id,
    online: Boolean(onlineValues[index]),
    lastSeen: lastSeenValues[index] ?? null,
    ip: ipValues[index] ?? null,
    version: versionValues[index] ?? null,
    lastAccess: lastAccessValues[index] ?? null,
  }));

  return NextResponse.json({ clients: payload });
}
