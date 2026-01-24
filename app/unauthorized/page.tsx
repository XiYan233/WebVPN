import Link from "next/link";

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const from = resolvedSearchParams?.from;

  return (
    <main className="page-shell flex items-center justify-center px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border bg-card/90 p-8 shadow-xl shadow-black/5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          WebVPN
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          未授权访问
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          你尚未登录或会话已过期，无法访问客户端资源。
        </p>
        {from ? (
          <p className="mt-2 text-sm text-muted-foreground">
            请求路径：{from}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
