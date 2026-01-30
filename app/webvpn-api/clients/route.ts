import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, requirePermission } from "@/lib/rbac";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canViewAll =
    session.user?.permissions?.includes("admin.users") ||
    session.user?.permissions?.includes("clients.manage");

  const clients = await prisma.client.findMany({
    where: canViewAll ? {} : { ownerId: session.user?.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ clients });
}

export async function POST(req: Request) {
  const session = await requirePermission("clients.manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ownerId = session.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, targetPort, basePath } = body ?? {};

  if (!name || !targetPort) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name,
      description,
      targetPort: Number(targetPort),
      basePath: basePath || "/",
      ownerId,
    },
  });

  return NextResponse.json({ client });
}
