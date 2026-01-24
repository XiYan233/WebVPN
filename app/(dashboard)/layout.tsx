import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const permissions = session?.user?.permissions ?? [];
  const canViewLogs = permissions.includes("logs.view");
  const canViewUsers = permissions.includes("admin.users");
  const canViewRoles = permissions.includes("admin.roles");
  const canViewPermissions = permissions.includes("admin.permissions");
  const navItems = [
    { href: "/clients", label: "客户端", show: true },
    { href: "/logs", label: "访问日志", show: canViewLogs },
    { href: "/admin/users", label: "用户", show: canViewUsers },
    { href: "/admin/roles", label: "角色", show: canViewRoles },
    { href: "/admin/permissions", label: "权限", show: canViewPermissions },
  ];

  return (
    <div className="page-shell">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-border bg-white/70 px-6 py-5 backdrop-blur lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:flex-col lg:items-start lg:gap-6">
            <div>
              <p className="font-display text-xl">WebVPN</p>
              <p className="muted-text">Secure internal access</p>
            </div>
            <div className="text-right text-xs text-muted-foreground lg:text-left">
              <p>已登录</p>
              <p className="font-medium text-foreground">{session?.user?.email}</p>
            </div>
          </div>
          <Separator className="my-4 hidden lg:block" />
          <nav className="mt-3 grid gap-2 lg:mt-0">
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
          </nav>
          <Separator className="my-4 hidden lg:block" />
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <Button variant="outline" className="w-full">
              退出
            </Button>
          </form>
        </aside>
        <header className="flex items-center justify-between border-b border-border bg-white/60 px-6 py-4 backdrop-blur lg:hidden">
          <div>
            <p className="font-display text-lg">控制台</p>
            <p className="muted-text">WebVPN</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <Button size="sm" variant="outline">
              退出
            </Button>
          </form>
        </header>
        <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
