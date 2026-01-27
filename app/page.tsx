import Link from "next/link";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string }>;
}) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  const fromParam = resolvedSearchParams?.from;
  const redirectTo =
    fromParam && fromParam.startsWith("/") ? fromParam : "/clients";

  return (
    <main className="page-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Secure Access
            </div>
            <h1 className="font-display text-4xl leading-tight md:text-6xl">
              WebVPN
            </h1>
            <p className="text-lg text-muted-foreground">
              通过 OAuth 登录后即可访问已授权的内网服务，快速建立可信的安全通道。
            </p>
            <div className="flex flex-wrap gap-3">
              {session?.user ? (
                <>
                  <Button asChild size="lg">
                    <Link href="/clients">进入控制台</Link>
                  </Button>
                  <form
                    action={async () => {
                      "use server";
                      await signIn("custom", { redirectTo });
                    }}
                  >
                    <Button type="submit" size="lg" variant="secondary">
                      重新登录
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <form
                    action={async () => {
                      "use server";
                      await signIn("custom", { redirectTo });
                    }}
                  >
                    <Button type="submit" size="lg">
                      使用 OAuth 登录
                    </Button>
                  </form>
                  <Button variant="secondary" size="lg" asChild>
                    <a href="#local-login">账号密码登录</a>
                  </Button>
                </>
              )}
            </div>
          </div>

          <Card id="local-login" className="border-none bg-white/80 shadow-soft-lg">
            <CardHeader>
              <CardTitle>账号密码登录</CardTitle>
              <CardDescription>使用管理员创建的本地账号登录。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground">
              <form
                className="grid gap-4"
                action={async (formData) => {
                  "use server";
                  const email = formData.get("email")?.toString() ?? "";
                  const password = formData.get("password")?.toString() ?? "";
                  await signIn("credentials", {
                    email,
                    password,
                    redirectTo,
                  });
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
                <Button type="submit">登录</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

