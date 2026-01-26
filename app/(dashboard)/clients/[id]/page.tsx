import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ClientKeyGenerator from "@/components/ClientKeyGenerator";
import ClientSettingsForm from "@/components/ClientSettingsForm";
import ClientKeyRevokeButton from "@/components/ClientKeyRevokeButton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return <Card className="p-6">请先登录</Card>;
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: { keys: true },
  });

  if (!client) {
    return <Card className="p-6">客户端不存在</Card>;
  }

  const isAdmin = session.user.permissions?.includes("admin.users");
  if (!isAdmin) {
    return <Card className="p-6">无权限访问</Card>;
  }

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{client.name}</CardTitle>
              <CardDescription>客户端连接状态与访问入口。</CardDescription>
            </div>
            <Badge
              className={
                client.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }
            >
              {client.isActive ? "启用中" : "已禁用"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-secondary/60 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                内网端口
              </p>
              <p className="text-lg font-semibold text-foreground">
                {client.targetPort}
              </p>
            </div>
            <div className="rounded-xl bg-secondary/60 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                基础路径
              </p>
              <p className="text-lg font-semibold text-foreground">
                {client.basePath}
              </p>
            </div>
            <div className="rounded-xl bg-secondary/60 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                访问入口
              </p>
              <p className="text-sm font-semibold text-foreground">
                /tunnel/{client.id}
              </p>
            </div>
          </div>
          <Button asChild className="w-fit">
            <a href={`/tunnel/${client.id}/`} target="_blank">
              直接访问
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>客户端设置</CardTitle>
          <CardDescription>编辑客户端信息并切换启用状态。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ClientSettingsForm
            clientId={client.id}
            name={client.name}
            description={client.description}
            targetPort={client.targetPort}
            basePath={client.basePath}
            isActive={client.isActive}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>客户端 Key</CardTitle>
          <CardDescription>Key 只会在创建时显示一次，请妥善保存。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ClientKeyGenerator clientId={client.id} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>前缀</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.keyPrefix}</TableCell>
                  <TableCell>{key.createdAt.toISOString()}</TableCell>
                  <TableCell>{key.revokedAt ? "已禁用" : "可用"}</TableCell>
                  <TableCell className="text-right">
                    <ClientKeyRevokeButton
                      clientId={client.id}
                      keyId={key.id}
                      disabled={Boolean(key.revokedAt)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            CLI 启动示例:
            <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs text-foreground">
              ./webvpn-client --server{" "}
              {process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"} --key
              YOUR_KEY --port {client.targetPort}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

