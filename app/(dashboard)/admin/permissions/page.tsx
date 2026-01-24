import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user?.permissions?.includes("admin.permissions")) {
    return <Card className="p-6">无权限访问</Card>;
  }

  const permissions = await prisma.permission.findMany({
    orderBy: { key: "asc" },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>权限列表</CardTitle>
        <CardDescription>系统内置与自定义权限。</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>描述</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((permission) => (
              <TableRow key={permission.id}>
                <TableCell className="font-medium">{permission.key}</TableCell>
                <TableCell>{permission.label}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
