import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import RolePermissionEditor from "@/components/RolePermissionEditor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function RolesPage() {
  const session = await auth();
  if (!session?.user?.permissions?.includes("admin.roles")) {
    return <Card className="p-6">无权限访问</Card>;
  }

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.permission.findMany({ orderBy: { key: "asc" } }),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>角色管理</CardTitle>
        <CardDescription>为角色分配可用权限。</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>角色</TableHead>
              <TableHead>权限</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">{role.name}</TableCell>
                <TableCell>
                  <RolePermissionEditor
                    roleId={role.id}
                    permissions={permissions}
                    assignedPermissionIds={role.permissions.map(
                      (permission) => permission.permissionId
                    )}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
