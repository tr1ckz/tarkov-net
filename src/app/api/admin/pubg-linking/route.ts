import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type CountRow = { count: number };

type RunMetadata = {
  verboseMessages?: string[];
  [key: string]: unknown;
};

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function normalizeCount(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return Number(value ?? 0);
}

function parseRunMetadata(value: string | null): RunMetadata | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as RunMetadata;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    totalEvents,
    totalRuns,
    uniquePubgAccounts,
    uniqueTwitchAccounts,
    last24hEvents,
    last7dEvents,
    runs24h,
    runs7d,
    runs24hOk,
    runs24hEmpty,
    runs24hError,
    sourceBreakdown,
    topPubg,
    topTwitch,
    recent,
    recentRuns,
    activeIndexerCount,
    streamerProfileCount,
    streamerProfileLiveCount,
    streamerIdentityLinkCount,
    uniquePairRows
  ] = await Promise.all([
    prisma.pubgLinkEvent.count(),
    prisma.pubgLinkRunLog.count(),
    prisma.pubgLinkEvent.groupBy({ by: ["pubgNameNormalized"] }),
    prisma.pubgLinkEvent.groupBy({ by: ["twitchUserId"] }),
    prisma.pubgLinkEvent.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.pubgLinkEvent.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.pubgLinkRunLog.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.pubgLinkRunLog.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.pubgLinkRunLog.count({ where: { createdAt: { gte: dayAgo }, status: "ok" } }),
    prisma.pubgLinkRunLog.count({ where: { createdAt: { gte: dayAgo }, status: "empty" } }),
    prisma.pubgLinkRunLog.count({ where: { createdAt: { gte: dayAgo }, status: "error" } }),
    prisma.pubgLinkEvent.groupBy({ by: ["eventType"], _count: { _all: true } }),
    prisma.pubgLinkEvent.groupBy({
      by: ["pubgNameNormalized", "pubgNameRaw"],
      _count: { _all: true },
      orderBy: { _count: { pubgNameNormalized: "desc" } },
      take: 10
    }),
    prisma.pubgLinkEvent.groupBy({
      by: ["twitchUserId", "twitchUserLogin", "twitchUserName"],
      _count: { _all: true },
      orderBy: { _count: { twitchUserId: "desc" } },
      take: 10
    }),
    prisma.pubgLinkEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        createdAt: true,
        eventType: true,
        pubgNameRaw: true,
        twitchUserLogin: true,
        twitchUserName: true,
        shard: true,
        platform: true,
        encounterAt: true
      }
    }),
    prisma.pubgLinkRunLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        createdAt: true,
        source: true,
        status: true,
        playerName: true,
        platform: true,
        requestedShard: true,
        resolvedShard: true,
        encountersFound: true,
        clipsReturned: true,
        activeIndexMatches: true,
        activeOverlapMatches: true,
        directLoginMatches: true,
        searchChannelMatches: true,
        vodMoments: true,
        channelsWithClips: true,
        linkEventsQueued: true,
        linkEventsPersisted: true,
        errorMessage: true,
        metadataJson: true
      }
    }),
    prisma.pubgActiveStreamer.count(),
    prisma.pubgStreamerProfile.count(),
    prisma.pubgStreamerProfile.count({ where: { isLive: true } }),
    prisma.pubgStreamerIdentityLink.count(),
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) as count
      FROM (
        SELECT DISTINCT "pubgNameNormalized", "twitchUserId"
        FROM "PubgLinkEvent"
      )
    `
  ]);

  const topPubgWithReach = await Promise.all(
    topPubg.map(async (row) => {
      const uniqueTwitch = await prisma.pubgLinkEvent.groupBy({
        by: ["twitchUserId"],
        where: { pubgNameNormalized: row.pubgNameNormalized }
      });

      return {
        pubgName: row.pubgNameRaw,
        normalized: row.pubgNameNormalized,
        linkEvents: row._count._all,
        uniqueTwitchAccounts: uniqueTwitch.length
      };
    })
  );

  const topTwitchWithReach = await Promise.all(
    topTwitch.map(async (row) => {
      const uniquePubg = await prisma.pubgLinkEvent.groupBy({
        by: ["pubgNameNormalized"],
        where: { twitchUserId: row.twitchUserId }
      });

      return {
        twitchUserId: row.twitchUserId,
        twitchUserLogin: row.twitchUserLogin,
        twitchUserName: row.twitchUserName,
        linkEvents: row._count._all,
        uniquePubgAccounts: uniquePubg.length
      };
    })
  );

  return NextResponse.json({
    build: {
      gitSha:
        process.env.GIT_SHA ??
        process.env.NEXT_PUBLIC_GIT_SHA ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        "unknown",
      nodeEnv: process.env.NODE_ENV ?? "unknown"
    },
    totals: {
      totalEvents,
      totalRuns,
      uniquePubgAccounts: uniquePubgAccounts.length,
      uniqueTwitchAccounts: uniqueTwitchAccounts.length,
      uniquePairs: normalizeCount(uniquePairRows[0]?.count),
      last24hEvents,
      last7dEvents,
      runs24h,
      runs7d,
      runs24hOk,
      runs24hEmpty,
      runs24hError,
      activeIndexerCount,
      streamerProfileCount,
      streamerProfileLiveCount,
      streamerIdentityLinkCount
    },
    sourceBreakdown: sourceBreakdown.map((row) => ({
      eventType: row.eventType,
      count: row._count._all
    })),
    topPubg: topPubgWithReach,
    topTwitch: topTwitchWithReach,
    recent,
    recentRuns: recentRuns.map((run) => {
      const metadata = parseRunMetadata(run.metadataJson);
      return {
        ...run,
        verboseMessages: metadata?.verboseMessages ?? []
      };
    })
  });
}
