import { NextResponse } from "next/server";
import {
  findBroadcasterIdByLogin,
  findGameIdByName,
  getClipsByBroadcasterId,
  getClipsByGameId
} from "@/lib/twitch";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamer = searchParams.get("streamer")?.trim().toLowerCase() ?? "";
  const limit = Number(searchParams.get("limit") ?? "20");

  try {
    if (streamer) {
      const broadcasterId = await findBroadcasterIdByLogin(streamer);
      if (!broadcasterId) {
        return NextResponse.json({ clips: [], source: "streamer", streamer });
      }

      const clips = await getClipsByBroadcasterId(broadcasterId, limit);
      return NextResponse.json({ clips, source: "streamer", streamer });
    }

    // Twitch canonical PUBG name is currently PUBG: BATTLEGROUNDS.
    const pubgGameId = await findGameIdByName("PUBG: BATTLEGROUNDS");
    if (!pubgGameId) {
      return NextResponse.json({ clips: [], source: "pubg" });
    }

    const clips = await getClipsByGameId(pubgGameId, limit);
    return NextResponse.json({ clips, source: "pubg" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load clips";

    // Missing credentials is a setup issue, return a clear message.
    if (message.includes("TWITCH_CLIENT_ID") || message.includes("TWITCH_CLIENT_SECRET")) {
      return NextResponse.json(
        {
          clips: [],
          source: streamer ? "streamer" : "pubg",
          error: "Twitch credentials are not configured",
          setup: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in your .env"
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        clips: [],
        source: streamer ? "streamer" : "pubg",
        error: message
      },
      { status: 500 }
    );
  }
}
