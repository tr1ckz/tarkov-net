import { NextResponse } from "next/server";
import {
  findBroadcasterIdByLogin,
  findGameIdByName,
  getClipsByBroadcasterId,
  getClipsByGameId,
  searchChannelsByName
} from "@/lib/twitch";
import { getRecentEncounterNames } from "@/lib/pubg-api";

export const dynamic = "force-dynamic";

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getLoginCandidates(pubgName: string) {
  const raw = pubgName.trim();
  const lower = raw.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const underscore = lower.replace(/\s+/g, "_");
  const stripped = lower.replace(/[^a-z0-9_]/g, "");

  return Array.from(new Set([lower, compact, underscore, stripped])).filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamer = searchParams.get("streamer")?.trim().toLowerCase() ?? "";
  const playerName = searchParams.get("playerName")?.trim() ?? "";
  const shard = searchParams.get("shard")?.trim().toLowerCase() || "pc-na";
  const platform = searchParams.get("platform")?.trim().toLowerCase() ?? "steam";
  const limit = Number(searchParams.get("limit") ?? "20");

  try {
    if (playerName) {
      const encounters = await getRecentEncounterNames({
        shard,
        playerName,
        maxMatches: 7,
        maxOpponents: 25
      });

      const debug = {
        encountersFound: encounters.length,
        directLoginMatches: 0,
        searchChannelMatches: 0,
        channelsWithClips: 0
      };

      const clips = [] as Array<{
        id: string;
        url: string;
        embed_url: string;
        broadcaster_id: string;
        broadcaster_name: string;
        creator_id: string;
        creator_name: string;
        video_id: string;
        game_id: string;
        language: string;
        title: string;
        view_count: number;
        created_at: string;
        thumbnail_url: string;
        duration: number;
        encounterWith: string;
      }>;

      for (const encounter of encounters) {
        const candidates = new Set<string>(getLoginCandidates(encounter.name));
        const encounterNormalized = normalizeName(encounter.name);

        const searched = await searchChannelsByName(encounter.name, 8);
        for (const channel of searched) {
          const loginNormalized = normalizeName(channel.broadcaster_login);
          const displayNormalized = normalizeName(channel.display_name);
          if (
            loginNormalized.includes(encounterNormalized) ||
            encounterNormalized.includes(loginNormalized) ||
            displayNormalized.includes(encounterNormalized) ||
            encounterNormalized.includes(displayNormalized)
          ) {
            candidates.add(channel.broadcaster_login.toLowerCase());
            debug.searchChannelMatches += 1;
          }
        }

        for (const login of candidates) {
          const broadcasterId = await findBroadcasterIdByLogin(login);
          if (!broadcasterId) continue;
          debug.directLoginMatches += 1;

          const found = await getClipsByBroadcasterId(broadcasterId, 2);
          if (found.length) debug.channelsWithClips += 1;

          for (const clip of found) {
            clips.push({
              ...clip,
              encounterWith: encounter.name
            });
            if (clips.length >= limit) break;
          }

          if (clips.length >= limit) break;
        }

        if (clips.length >= limit) break;
      }

      return NextResponse.json({
        clips,
        source: "encounters",
        profile: { playerName, shard, platform },
        encountersScanned: encounters.length,
        debug
      });
    }

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
    if (message.toLowerCase().includes("missing twitch credentials")) {
      return NextResponse.json(
        {
          clips: [],
          source: streamer ? "streamer" : "pubg",
          error: "Twitch credentials are not configured",
          setup: "Set TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET or TWITCH_CLIENT/TWITCH_SECRET in your .env"
        },
        { status: 500 }
      );
    }

    if (message.toLowerCase().includes("missing pubg api key")) {
      return NextResponse.json(
        {
          clips: [],
          source: playerName ? "encounters" : streamer ? "streamer" : "pubg",
          error: "PUBG API key is not configured",
          setup: "Set PUBG_DEV_API (or PUBG_API_KEY) in your .env"
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        clips: [],
        source: playerName ? "encounters" : streamer ? "streamer" : "pubg",
        error: message
      },
      { status: 500 }
    );
  }
}
