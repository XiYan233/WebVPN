import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function GET(req: Request) {
  const session = await requirePermission("logs.view");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const userEmail = url.searchParams.get("userEmail") ?? undefined;
  const method = url.searchParams.get("method") ?? undefined;
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const users = userEmail
    ? await prisma.user.findMany({
        where: { email: { contains: userEmail } },
        select: { id: true },
      })
    : [];

  const userIds = users.length ? users.map((u) => u.id) : undefined;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  const statusValue = status ? Number(status) : undefined;

  const logs = await prisma.accessLog.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(method ? { method } : {}),
      ...(statusValue ? { status: statusValue } : {}),
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { client: true, user: true },
    take: 1000,
  });

  const header = ["time", "user", "client", "method", "path", "status", "ip"];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.user?.email ?? "",
    log.client?.name ?? "",
    log.method,
    log.path,
    String(log.status),
    log.ip ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"access-logs.csv\"",
    },
  });
}
