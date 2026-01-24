import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const session = await requirePermission("admin.users");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { isActive, password } = body ?? {};
  const data: { isActive?: boolean; passwordHash?: string } = {};

  if (typeof isActive === "boolean") {
    data.isActive = isActive;
  }

  if (typeof password === "string" && password.trim().length >= 6) {
    data.passwordHash = await bcrypt.hash(password.trim(), 10);
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: resolvedParams.id },
    data,
  });

  return NextResponse.json({ user });
}
