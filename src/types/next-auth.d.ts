import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      gameName: string | null;
      tarkovProfileId: string | null;
      tarkovProfileMode: string | null;
      tarkovPveProfileId: string | null;
      tarkovArenaProfileId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    name: string;
    role?: string;
    gameName?: string | null;
    tarkovProfileId?: string | null;
    tarkovProfileMode?: string | null;
    tarkovPveProfileId?: string | null;
    tarkovArenaProfileId?: string | null;
  }
}
