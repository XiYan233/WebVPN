import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string; keyId: string }> }
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

  const isAdmin = session.user?.permissions?.includes("admin.users") ?? false;
  if (!isAdmin && client.ownerId !== session.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = await prisma.clientKey.update({
    where: { id: resolvedParams.keyId },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ key });
}
