import bcrypt from "bcryptjs";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() }
        });

        if (!user) {
          return null;
        }

        if (user.isSuspended) {
          return null;
        }

        const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!validPassword) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
          gameName: user.gameName ?? null,
          tarkovProfileId: user.tarkovProfileId ?? null,
          tarkovProfileMode: user.tarkovProfileMode ?? null,
          tarkovPveProfileId: user.tarkovPveProfileId ?? null,
          tarkovArenaProfileId: user.tarkovArenaProfileId ?? null
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.name = user.name ?? "Observer";
        token.role = (user as { role?: string }).role ?? "USER";
        token.gameName = (user as { gameName?: string | null }).gameName ?? null;
        token.tarkovProfileId = (user as { tarkovProfileId?: string | null }).tarkovProfileId ?? null;
        token.tarkovProfileMode = (user as { tarkovProfileMode?: string | null }).tarkovProfileMode ?? null;
        token.tarkovPveProfileId = (user as { tarkovPveProfileId?: string | null }).tarkovPveProfileId ?? null;
        token.tarkovArenaProfileId = (user as { tarkovArenaProfileId?: string | null }).tarkovArenaProfileId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: {
            displayName: true,
            email: true,
            role: true,
            gameName: true,
            tarkovProfileId: true,
            tarkovProfileMode: true,
            tarkovPveProfileId: true,
            tarkovArenaProfileId: true
          }
        });

        session.user.id = token.userId;
        session.user.name = dbUser?.displayName ?? token.name;
        session.user.email = dbUser?.email ?? (token.email as string);
        session.user.role = dbUser?.role ?? token.role ?? "USER";
        session.user.gameName = dbUser?.gameName ?? token.gameName ?? null;
        session.user.tarkovProfileId = dbUser?.tarkovProfileId ?? token.tarkovProfileId ?? null;
        session.user.tarkovProfileMode = dbUser?.tarkovProfileMode ?? token.tarkovProfileMode ?? null;
        session.user.tarkovPveProfileId = dbUser?.tarkovPveProfileId ?? token.tarkovPveProfileId ?? null;
        session.user.tarkovArenaProfileId = dbUser?.tarkovArenaProfileId ?? token.tarkovArenaProfileId ?? null;
      }
      return session;
    }
  }
};
