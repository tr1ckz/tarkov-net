import { NextResponse } from "next/server";
import { getCacheStatusToken } from "@/lib/cache-status";
import { resolveGameMode } from "@/lib/game-mode";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = resolveGameMode(searchParams.get("mode"));
  const token = await getCacheStatusToken(mode);

  return NextResponse.json({
    mode,
    token
  });
}
