import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requirePermission("admin.users");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const roleIds: string[] = body?.roleIds ?? [];

  await prisma.userRole.deleteMany({
    where: { userId: resolvedParams.id },
  });

  if (roleIds.length) {
    await prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({
        userId: resolvedParams.id,
        roleId,
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
