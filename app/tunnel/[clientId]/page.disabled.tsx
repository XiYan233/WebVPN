import { redirect } from "next/navigation";

export default async function ClientTunnelPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/tunnel/${clientId}/`);
}
