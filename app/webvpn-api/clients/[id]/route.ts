import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, requirePermission } from "@/lib/rbac";

async function canAccessClient(
  clientId: string,
  userId: string,
  canViewAll: boolean
) {
  if (canViewAll) return true;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  return client?.ownerId === userId;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canViewAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");
  const allowed = await canAccessClient(
    resolvedParams.id,
    session.user?.id ?? "",
    Boolean(canViewAll)
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({
    where: { id: resolvedParams.id },
    include: { keys: true },
  });

  return NextResponse.json({ client });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requirePermission("clients.manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canViewAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");
  const allowed = await canAccessClient(
    resolvedParams.id,
    session.user?.id ?? "",
    Boolean(canViewAll)
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, targetPort, basePath, isActive } = body ?? {};

  const client = await prisma.client.update({
    where: { id: resolvedParams.id },
    data: {
      name,
      description,
      targetPort: targetPort ? Number(targetPort) : undefined,
      basePath,
      isActive,
    },
  });

  return NextResponse.json({ client });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requirePermission("clients.manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canViewAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");
  const allowed = await canAccessClient(
    resolvedParams.id,
    session.user?.id ?? "",
    Boolean(canViewAll)
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.client.delete({ where: { id: resolvedParams.id } });
  return NextResponse.json({ ok: true });
}
