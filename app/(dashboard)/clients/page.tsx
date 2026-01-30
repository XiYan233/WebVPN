import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ClientStatusTable from "@/components/ClientStatusTable";

export default async function ClientsPage() {
  const session = await auth();
  const isAdmin = session?.user?.permissions?.includes("admin.users") ?? false;
  const canManageClients =
    isAdmin || (session?.user?.permissions?.includes("clients.manage") ?? false);
  const canViewAll = canManageClients;

  const clients = await prisma.client.findMany({
    where: canViewAll ? {} : { ownerId: session?.user?.id },
    orderBy: { createdAt: "desc" },
  });

  const clientIds = clients.map((client) => client.id);
  const [onlineValues, lastSeenValues, ipValues, versionValues, lastAccessValues] =
    clientIds.length
      ? await Promise.all([
          redis.mget(clientIds.map((id) => `client:online:${id}`)),
          redis.mget(clientIds.map((id) => `client:lastSeen:${id}`)),
          redis.mget(clientIds.map((id) => `client:ip:${id}`)),
          redis.mget(clientIds.map((id) => `client:version:${id}`)),
          redis.mget(clientIds.map((id) => `client:lastAccess:${id}`)),
        ])
      : [[], [], [], [], []];

  const initialStatus = Object.fromEntries(
    clients.map((client, index) => [
      client.id,
      {
        online: Boolean(onlineValues[index]),
        lastSeen: lastSeenValues[index] ?? null,
        ip: ipValues[index] ?? null,
        version: versionValues[index] ?? null,
        lastAccess: lastAccessValues[index] ?? null,
      },
    ])
  );

  const clientRows = clients.map((client) => ({
    id: client.id,
    name: client.name,
    targetPort: client.targetPort,
    isActive: client.isActive,
  }));

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="section-title">客户端</h1>
        <p className="muted-text">集中管理内网客户端与访问入口。</p>
      </div>

      {canManageClients && (
        <Card>
          <CardHeader>
            <CardTitle>创建客户端</CardTitle>
            <CardDescription>注册新的内网代理入口。</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData) => {
                "use server";
                const currentSession = await auth();
                const name = formData.get("name")?.toString() ?? "";
                const targetPort = Number(formData.get("targetPort"));
                const basePath = formData.get("basePath")?.toString() ?? "/";
                const description = formData.get("description")?.toString() ?? "";

                if (!name || !targetPort) return;
                const userId = currentSession?.user?.id;
                const canManage =
                  currentSession?.user?.permissions?.includes("clients.manage") ||
                  currentSession?.user?.permissions?.includes("admin.users");
                if (!canManage || !userId) return;

                await prisma.client.create({
                  data: {
                    name,
                    targetPort,
                    basePath,
                    description,
                    ownerId: userId,
                  },
                });
              }}
              className="grid gap-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input name="name" placeholder="名称" required />
                <Input
                  name="targetPort"
                  placeholder="内网端口"
                  type="number"
                  required
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input name="basePath" placeholder="基础路径 /" defaultValue="/" />
                <Input name="description" placeholder="描述" />
              </div>
              <div>
                <Button type="submit">创建客户端</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>客户端列表</CardTitle>
          <CardDescription>所有可访问的内网服务实例。</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientStatusTable
            clients={clientRows}
            initialStatus={initialStatus}
            isAdmin={canManageClients}
          />
        </CardContent>
      </Card>
    </div>
  );
}
