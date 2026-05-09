import { NextResponse } from "next/server";
import {
  resolveCachedPubgPlayer,
  type PubgPlatform,
} from "@/lib/pubg-api";

export const dynamic = "force-dynamic";

function parsePlatform(value: string | null): PubgPlatform {
  if (value === "xbox" || value === "psn") return value;
  return "steam";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerName = searchParams.get("playerName")?.trim() ?? "";
  const preferredShard = searchParams.get("shard")?.trim().toLowerCase() ?? "";
  const platform = parsePlatform(searchParams.get("platform")?.trim().toLowerCase() ?? null);

  if (!playerName) {
    return NextResponse.json({ error: "Missing playerName" }, { status: 400 });
  }

  const cached = await resolveCachedPubgPlayer({
    playerName,
    platform,
    preferredShard: preferredShard || undefined,
  }).catch(() => null);

  if (cached) {
    return NextResponse.json({
      found: true,
      profile: {
        playerName: cached.playerName,
        shard: cached.shard,
        matchCount: cached.matchCount,
      },
      cacheHit: true,
      source: cached.source,
    });
  }

  return NextResponse.json(
    {
      found: false,
      error: `Player '${playerName}' not found in local cache for platform '${platform}'`
    },
    { status: 404 }
  );
}
