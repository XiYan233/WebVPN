import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import UserRoleEditor from "@/components/UserRoleEditor";
import UserAdminActions from "@/components/UserAdminActions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SearchParams = {
  email?: string;
  role?: string;
  status?: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth();
  if (!session?.user?.permissions?.includes("admin.users")) {
    return <Card className="p-6">无权限访问</Card>;
  }

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(resolvedSearchParams.email
            ? {
              email: {
                contains: resolvedSearchParams.email,
              },
            }
          : {}),
        ...(resolvedSearchParams.status === "active"
          ? { isActive: true }
          : resolvedSearchParams.status === "disabled"
            ? { isActive: false }
            : {}),
        ...(resolvedSearchParams.role
          ? {
              roles: { some: { role: { name: resolvedSearchParams.role } } },
            }
          : {}),
      },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  const createUser = async (formData: FormData) => {
    "use server";
    const currentSession = await auth();
    if (!currentSession?.user?.permissions?.includes("admin.users")) return;

    const email = formData.get("email")?.toString().trim().toLowerCase();
    const name = formData.get("name")?.toString().trim() || null;
    const password = formData.get("password")?.toString() ?? "";
    const isActive = formData.get("isActive") === "on";
    const roleIds = formData.getAll("roles").map((value) => value.toString());

    if (!email || password.trim().length < 6) return;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password.trim(), 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        isActive,
      },
    });

    if (roleIds.length) {
      await prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
        })),
      });
    }
  };

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle>创建用户</CardTitle>
          <CardDescription>创建新账号并分配角色。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createUser} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Input name="email" placeholder="邮箱" type="email" required />
              <Input name="name" placeholder="姓名" />
              <Input name="password" placeholder="初始密码" type="password" required />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="isActive" defaultChecked />
                启用
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="roles" value={role.id} />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-fit">
              创建用户
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用户管理</CardTitle>
          <CardDescription>为每个用户分配角色权限。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr_1fr_auto]">
            <Input
              name="email"
              placeholder="按邮箱搜索"
              defaultValue={resolvedSearchParams.email ?? ""}
            />
            <Select name="role" defaultValue={resolvedSearchParams.role ?? ""}>
              <option value="">全部角色</option>
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={resolvedSearchParams.status ?? ""}>
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </Select>
            <Button type="submit" className="w-fit">
              筛选
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        user.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }
                    >
                      {user.isActive ? "启用" : "禁用"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <UserRoleEditor
                      userId={user.id}
                      roles={roles}
                      assignedRoleIds={user.roles.map((role) => role.roleId)}
                    />
                  </TableCell>
                  <TableCell>
                    <UserAdminActions userId={user.id} isActive={user.isActive} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
