import { NextResponse } from "next/server";
import { refreshPubgStreamerIndex } from "@/lib/pubg-streamer-index";
import { autoLinkPubgStreamerProfiles } from "@/lib/pubg-streamer-linking";
import { indexStreamerMatchesAndVods } from "@/lib/pubg-match-vod-indexer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PubgPlatform = "steam" | "xbox" | "psn";

function parsePlatform(value: string): PubgPlatform | null {
  if (value === "steam" || value === "xbox" || value === "psn") return value;
  return null;
}

const WEAK_LINK_SOURCES = [
  "eventsub_login_heuristic",
  "eventsub_profile_claim",
  "eventsub_known_player_unverified",
  "eventsub_login_heuristic_unverified",
];

async function reindexMappedLiveStreamers() {
  const limitRaw = Number(process.env.PUBG_LIVE_REINDEX_LIMIT ?? "30");
  const maxStreamers = Number.isFinite(limitRaw) ? Math.max(1, Math.min(120, Math.floor(limitRaw))) : 30;

  const maxMatchesRaw = Number(process.env.PUBG_LIVE_REINDEX_MAX_MATCHES ?? "8");
  const maxMatches = Number.isFinite(maxMatchesRaw) ? Math.max(1, Math.min(20, Math.floor(maxMatchesRaw))) : 8;

  const maxVodsRaw = Number(process.env.PUBG_LIVE_REINDEX_MAX_VODS ?? process.env.PUBG_EVENTSUB_VOD_INDEX_LIMIT ?? "12");
  const maxVods = Number.isFinite(maxVodsRaw) ? Math.max(1, Math.min(20, Math.floor(maxVodsRaw))) : 12;

  const minConfidenceRaw = Number(process.env.PUBG_LIVE_REINDEX_MIN_CONFIDENCE ?? "80");
  const minConfidence = Number.isFinite(minConfidenceRaw)
    ? Math.max(0, Math.min(100, Math.floor(minConfidenceRaw)))
    : 80;

  const liveProfiles = await prisma.pubgStreamerProfile.findMany({
    where: { isLive: true },
    orderBy: [{ lastSeenLiveAt: "desc" }, { lastSeenAt: "desc" }],
    take: maxStreamers * 4,
    select: {
      twitchUserId: true,
      userLogin: true,
      userName: true,
    }
  });

  if (!liveProfiles.length) {
    return {
      attempted: 0,
      indexed: 0,
      candidates: 0,
      skippedNoLink: 0,
      totalMatchesIndexed: 0,
      totalVodsIndexed: 0,
      totalLinksMapped: 0,
      totalMatchErrors: 0,
      reasons: [] as string[],
    };
  }

  const profileById = new Map(liveProfiles.map((row) => [row.twitchUserId, row]));
  const liveIds = liveProfiles.map((row) => row.twitchUserId);

  const links = await prisma.pubgStreamerIdentityLink.findMany({
    where: {
      twitchUserId: { in: liveIds },
      confidenceScore: { gte: minConfidence },
      source: { notIn: WEAK_LINK_SOURCES },
      pubgPlayerName: { not: "" },
    },
    orderBy: [{ confidenceScore: "desc" }, { lastLinkedAt: "desc" }],
    select: {
      twitchUserId: true,
      twitchUserLogin: true,
      twitchUserName: true,
      platform: true,
      shard: true,
      pubgPlayerId: true,
      pubgPlayerName: true,
      confidenceScore: true,
      source: true,
    }
  });

  const byTwitchUser = new Map<string, (typeof links)[number]>();
  for (const row of links) {
    if (!byTwitchUser.has(row.twitchUserId)) {
      byTwitchUser.set(row.twitchUserId, row);
    }
  }

  const candidates = Array.from(byTwitchUser.values()).slice(0, maxStreamers);
  const skippedNoLink = Math.max(0, liveProfiles.length - byTwitchUser.size);

  let indexed = 0;
  let totalMatchesIndexed = 0;
  let totalVodsIndexed = 0;
  let totalLinksMapped = 0;
  let totalMatchErrors = 0;
  const reasons: string[] = [];

  for (const link of candidates) {
    const profile = profileById.get(link.twitchUserId);
    const platform = parsePlatform(link.platform);
    if (!profile || !platform) continue;

    try {
      const result = await indexStreamerMatchesAndVods({
        identity: {
          twitchUserId: link.twitchUserId,
          twitchUserLogin: profile.userLogin || link.twitchUserLogin,
          twitchUserName: profile.userName || link.twitchUserName,
          platform,
          shard: link.shard,
          pubgPlayerId: link.pubgPlayerId,
          pubgPlayerName: link.pubgPlayerName,
        },
        maxMatches,
        maxVods,
      });

      indexed += 1;
      totalMatchesIndexed += result.matchesIndexed;
      totalVodsIndexed += result.vodsIndexed;
      totalLinksMapped += result.linksMapped;
      totalMatchErrors += result.matchErrors;
      reasons.push(`${link.twitchUserLogin}:${result.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reasons.push(`${link.twitchUserLogin}:exception:${message}`);
    }
  }

  return {
    attempted: liveProfiles.length,
    indexed,
    candidates: candidates.length,
    skippedNoLink,
    totalMatchesIndexed,
    totalVodsIndexed,
    totalLinksMapped,
    totalMatchErrors,
    reasons,
    maxMatches,
    maxVods,
    minConfidence,
  };
}

async function writeIndexerRunLog(input: {
  status: "ok" | "empty" | "error";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.pubgLinkRunLog.create({
      data: {
        source: "twitch-index-refresh",
        status: input.status,
        clipsReturned: 0,
        encountersFound: 0,
        errorMessage: input.errorMessage,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
      }
    });
  } catch (error) {
    console.error("[pubg-twitch-index-refresh] failed to write run log", error);
  }
}

export async function POST(request: Request) {
  const configuredSecret = process.env.PUBG_TWITCH_INDEX_SECRET;
  const providedSecret = request.headers.get("x-index-secret");

  if (configuredSecret && providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshPubgStreamerIndex({ force: true });
    const linking = await autoLinkPubgStreamerProfiles({ liveOnly: true, prioritizeVods: true, limit: 80 });
    const liveReindex = await reindexMappedLiveStreamers();
    await writeIndexerRunLog({
      status: result.refreshed ? "ok" : "empty",
      metadata: {
        refreshed: result.refreshed,
        count: result.count,
        refreshedAt: result.refreshedAt ?? null,
        linkAttempted: linking.attempted,
        linkSucceeded: linking.linked,
        vodPriorityAttempted: linking.vodPriorityAttempted,
        liveReindex,
        force: true
      }
    });
    return NextResponse.json({ ok: true, ...result, linking, liveReindex });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeIndexerRunLog({
      status: "error",
      errorMessage: message,
      metadata: { force: true }
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
