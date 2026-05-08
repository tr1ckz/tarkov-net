import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gameModeCookieName, resolveGameMode } from "@/lib/game-mode";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const mode = resolveGameMode(payload.mode);

  cookies().set(gameModeCookieName(), mode, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return NextResponse.json({ ok: true, mode });
}
