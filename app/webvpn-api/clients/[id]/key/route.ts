import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requirePermission("clients.manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({
    where: { id: resolvedParams.id },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const canManageAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");
  if (!canManageAll && client.ownerId !== session.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = crypto.randomBytes(32).toString("base64url");
  const keyHash = await bcrypt.hash(key, 10);
  const keyPrefix = key.slice(0, 8);

  await prisma.clientKey.create({
    data: {
      clientId: resolvedParams.id,
      keyHash,
      keyPrefix,
    },
  });

  return NextResponse.json({ key });
}
