import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { OAuthConfig } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const customOAuth: OAuthConfig<any> = {
  id: "custom",
  name: "OAuth",
  type: "oauth",
  clientId: process.env.AUTH_CLIENT_ID,
  clientSecret: process.env.AUTH_CLIENT_SECRET,
  authorization: {
    url: process.env.AUTH_AUTHORIZATION_URL ?? "",
    params: {
      scope: process.env.AUTH_SCOPE ?? "openid profile email",
    },
  },
  token: process.env.AUTH_TOKEN_URL ?? "",
  userinfo: process.env.AUTH_USERINFO_URL ?? "",
  profile(profile) {
    return {
      id: profile.sub ?? profile.id ?? profile.user_id ?? profile.uid,
      name: profile.name ?? profile.nickname ?? profile.username,
      email: profile.email,
      image: profile.picture ?? profile.avatar_url ?? null,
    };
  },
};

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  basePath: "/webvpn-api/auth",
  providers: [
    customOAuth,
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim();
        const password = credentials?.password?.toString() ?? "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user?.passwordHash || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: {
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.isActive = user.isActive;
        const roles = await prisma.userRole.findMany({
          where: { userId: user.id },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        });

        session.user.id = user.id;
        session.user.roles = roles.map((r) => r.role.name);
        session.user.permissions = roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.key)
        );
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user?.id) return;
      const role = await prisma.role.findUnique({ where: { name: "user" } });
      if (role) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
