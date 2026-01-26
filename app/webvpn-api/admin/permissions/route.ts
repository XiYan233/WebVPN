import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const session = await requirePermission("admin.permissions");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const permissions = await prisma.permission.findMany({
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ permissions });
}
