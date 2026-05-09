import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  clearPubgCallContext,
  indexSeenPlayersFromRecentMatches,
  setPubgCallContext,
  type PubgPlatform,
} from "@/lib/pubg-api";
import { indexStreamerMatchesAndVods } from "@/lib/pubg-match-vod-indexer";

export const dynamic = "force-dynamic";

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function parsePlatform(value: string): PubgPlatform | null {
  if (value === "steam" || value === "xbox" || value === "psn") return value;
  return null;
}

function clampLimit(value: unknown, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(40, Math.floor(n)));
}

function clampMatches(value: unknown, fallback = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await request.json().catch(() => ({} as { limit?: number; maxMatches?: number }));
  const limit = clampLimit(body?.limit ?? 10);
  const maxMatches = clampMatches(body?.maxMatches ?? 4);

  const candidates = await prisma.pubgStreamerIdentityLink.findMany({
    where: {
      source: {
        notIn: ["eventsub_login_heuristic", "eventsub_profile_claim"]
      }
    },
    orderBy: [{ lastLinkedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      twitchUserId: true,
      twitchUserLogin: true,
      twitchUserName: true,
      platform: true,
      shard: true,
      pubgPlayerId: true,
      pubgPlayerName: true,
    }
  });

  if (!candidates.length) {
    return NextResponse.json({ ok: true, processed: 0, message: "No eligible linked streamers" });
  }

  let processed = 0;
  let indexedRuns = 0;
  let totalDiscoveredNew = 0;
  let totalObservations = 0;
  let totalUpserted = 0;
  let totalMatchesIndexed = 0;
  let totalVodsIndexed = 0;
  let totalMatchVodLinks = 0;
  const results: Array<{
    identityLinkId: string;
    twitchUserLogin: string;
    status: "ok" | "skipped" | "error";
    reason?: string;
    discoveredNew?: number;
    upserted?: number;
    observationsLogged?: number;
    matchesIndexed?: number;
    vodsIndexed?: number;
    linksMapped?: number;
  }> = [];

  setPubgCallContext("admin_discovery_processor");
  try {
    for (const row of candidates) {
      processed += 1;
      const platform = parsePlatform(row.platform);
      if (!platform) {
        results.push({
          identityLinkId: row.id,
          twitchUserLogin: row.twitchUserLogin,
          status: "skipped",
          reason: "unsupported_platform",
        });
        continue;
      }

      const run = await indexSeenPlayersFromRecentMatches({
        platform,
        shard: row.shard,
        playerName: row.pubgPlayerName,
        maxMatches,
        maxPlayersPerMatch: Number(process.env.PUBG_EVENTSUB_DISCOVERY_PLAYERS_PER_MATCH ?? "80"),
        discoveredBy: {
          twitchUserId: row.twitchUserId,
          twitchUserLogin: row.twitchUserLogin,
          twitchUserName: row.twitchUserName,
        },
        eventSource: "admin_discovery_process"
      }).catch((error) => {
        results.push({
          identityLinkId: row.id,
          twitchUserLogin: row.twitchUserLogin,
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

      if (!run) continue;
      indexedRuns += 1;
      totalDiscoveredNew += run.discoveredNew;
      totalObservations += run.observationsLogged;
      totalUpserted += run.upserted;

      const matchVod = await indexStreamerMatchesAndVods({
        identity: {
          twitchUserId: row.twitchUserId,
          twitchUserLogin: row.twitchUserLogin,
          twitchUserName: row.twitchUserName,
          platform,
          shard: row.shard,
          pubgPlayerId: row.pubgPlayerId,
          pubgPlayerName: row.pubgPlayerName,
        },
        maxMatches,
        maxVods: Number(process.env.PUBG_EVENTSUB_VOD_INDEX_LIMIT ?? "12"),
      }).catch(() => {
        return null;
      });

      if (matchVod) {
        totalMatchesIndexed += matchVod.matchesIndexed;
        totalVodsIndexed += matchVod.vodsIndexed;
        totalMatchVodLinks += matchVod.linksMapped;
      }

      results.push({
        identityLinkId: row.id,
        twitchUserLogin: row.twitchUserLogin,
        status: "ok",
        discoveredNew: run.discoveredNew,
        upserted: run.upserted,
        observationsLogged: run.observationsLogged,
        matchesIndexed: matchVod?.matchesIndexed ?? 0,
        vodsIndexed: matchVod?.vodsIndexed ?? 0,
        linksMapped: matchVod?.linksMapped ?? 0,
      });
    }
  } finally {
    clearPubgCallContext();
  }

  await prisma.pubgLinkRunLog.create({
    data: {
      source: "admin_discovery_process",
      status: "ok",
      linkEventsQueued: processed,
      linkEventsPersisted: totalObservations,
      metadataJson: JSON.stringify({
        processed,
        indexedRuns,
        maxMatches,
        totalDiscoveredNew,
        totalObservations,
        totalUpserted,
        totalMatchesIndexed,
        totalVodsIndexed,
        totalMatchVodLinks,
        results,
      }),
    }
  });

  return NextResponse.json({
    ok: true,
    processed,
    indexedRuns,
    totalDiscoveredNew,
    totalObservations,
    totalUpserted,
    totalMatchesIndexed,
    totalVodsIndexed,
    totalMatchVodLinks,
    results,
  });
}
