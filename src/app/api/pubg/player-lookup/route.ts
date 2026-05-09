import { NextResponse } from "next/server";
import { lookupPlayerAcrossShards, type PubgPlatform } from "@/lib/pubg-api";

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

  try {
    const found = await lookupPlayerAcrossShards({
      playerName,
      preferredShard: preferredShard || undefined,
      platform
    });

    if (!found) {
      return NextResponse.json(
        { found: false, error: `Player '${playerName}' not found for platform '${platform}'` },
        { status: 404 }
      );
    }

    return NextResponse.json({ found: true, profile: found });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed";

    if (message.toLowerCase().includes("missing pubg api key")) {
      return NextResponse.json(
        {
          found: false,
          error: "PUBG API key is not configured",
          setup: "Set PUBG_DEV_API (or PUBG_API_KEY) in your .env"
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ found: false, error: message }, { status: 500 });
  }
}
