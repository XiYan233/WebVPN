import { auth } from "@/lib/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id || session.user.isActive === false) {
    return null;
  }
  return session;
}

export async function requirePermission(permission: string) {
  const session = await auth();
  if (!session?.user?.permissions?.includes(permission) || session.user.isActive === false) {
    return null;
  }
  return session;
}
