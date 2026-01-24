import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SearchParams = {
  clientId?: string;
  userEmail?: string;
  method?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth();
  if (!session?.user?.permissions?.includes("logs.view")) {
    return <Card className="p-6">无权限访问</Card>;
  }

  const filters = {
    clientId: resolvedSearchParams.clientId || undefined,
    method: resolvedSearchParams.method || undefined,
    status: resolvedSearchParams.status
      ? Number(resolvedSearchParams.status)
      : undefined,
  };

  const [clients, users] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    resolvedSearchParams.userEmail
      ? prisma.user.findMany({
          where: { email: { contains: resolvedSearchParams.userEmail } },
          orderBy: { email: "asc" },
        })
      : prisma.user.findMany({ orderBy: { email: "asc" } }),
  ]);

  const userIds = resolvedSearchParams.userEmail
    ? users.map((user) => user.id)
    : undefined;

  const fromDate = resolvedSearchParams.from
    ? new Date(resolvedSearchParams.from)
    : undefined;
  const toDate = resolvedSearchParams.to
    ? new Date(resolvedSearchParams.to)
    : undefined;

  const pageSize = 50;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);

  const where = {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(userIds ? { userId: { in: userIds } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    userIds === undefined || userIds.length > 0
      ? prisma.accessLog.count({ where })
      : Promise.resolve(0),
    userIds === undefined || userIds.length > 0
      ? prisma.accessLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { client: true, user: true },
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const exportParams = new URLSearchParams();
  if (resolvedSearchParams.clientId) {
    exportParams.set("clientId", resolvedSearchParams.clientId);
  }
  if (resolvedSearchParams.userEmail) {
    exportParams.set("userEmail", resolvedSearchParams.userEmail);
  }
  if (resolvedSearchParams.method) {
    exportParams.set("method", resolvedSearchParams.method);
  }
  if (resolvedSearchParams.status) {
    exportParams.set("status", resolvedSearchParams.status);
  }
  if (resolvedSearchParams.from) {
    exportParams.set("from", resolvedSearchParams.from);
  }
  if (resolvedSearchParams.to) {
    exportParams.set("to", resolvedSearchParams.to);
  }
  const exportUrl = `/api/logs/export?${exportParams.toString()}`;

  const buildPageUrl = (nextPage: number) => {
    const params = new URLSearchParams(exportParams);
    params.set("page", String(nextPage));
    return `/logs?${params.toString()}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>访问日志</CardTitle>
            <CardDescription>
              共 {total} 条记录，第 {page} / {totalPages} 页（每页 {pageSize}
              条）
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <a href={exportUrl}>导出 CSV</a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Select
              name="clientId"
              defaultValue={resolvedSearchParams.clientId ?? ""}
            >
              <option value="">全部客户端</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
            <Input
              name="userEmail"
              placeholder="用户邮箱（模糊）"
              defaultValue={resolvedSearchParams.userEmail ?? ""}
            />
            <Select name="method" defaultValue={resolvedSearchParams.method ?? ""}>
              <option value="">全部方法</option>
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
                (method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                )
              )}
            </Select>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Input
              name="status"
              placeholder="状态码"
              type="number"
              defaultValue={resolvedSearchParams.status ?? ""}
            />
            <Input
              name="from"
              type="datetime-local"
              defaultValue={resolvedSearchParams.from ?? ""}
            />
            <Input
              name="to"
              type="datetime-local"
              defaultValue={resolvedSearchParams.to ?? ""}
            />
          </div>
          <Button type="submit" className="w-fit">
            筛选
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>客户端</TableHead>
              <TableHead>方法</TableHead>
              <TableHead>路径</TableHead>
              <TableHead>状态码</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length ? (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.createdAt.toISOString()}</TableCell>
                  <TableCell>{log.user?.email}</TableCell>
                  <TableCell>{log.client?.name}</TableCell>
                  <TableCell>{log.method}</TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    {log.path}
                  </TableCell>
                  <TableCell>{log.status}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  暂无匹配记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            显示 {(page - 1) * pageSize + (total ? 1 : 0)} -{" "}
            {Math.min(page * pageSize, total)} / {total}
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" disabled={page <= 1}>
              <a href={buildPageUrl(Math.max(1, page - 1))}>上一页</a>
            </Button>
            <Button asChild variant="outline" disabled={page >= totalPages}>
              <a href={buildPageUrl(Math.min(totalPages, page + 1))}>下一页</a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
