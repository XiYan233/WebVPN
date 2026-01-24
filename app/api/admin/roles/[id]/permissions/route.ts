import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requirePermission("admin.roles");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const permissionIds: string[] = body?.permissionIds ?? [];

  await prisma.rolePermission.deleteMany({
    where: { roleId: resolvedParams.id },
  });

  if (permissionIds.length) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: resolvedParams.id,
        permissionId,
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
