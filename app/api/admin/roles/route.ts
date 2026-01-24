import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const session = await requirePermission("admin.roles");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ roles });
}

export async function POST(req: Request) {
  const session = await requirePermission("admin.roles");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description } = body ?? {};
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const role = await prisma.role.create({
    data: { name, description },
  });

  return NextResponse.json({ role });
}
