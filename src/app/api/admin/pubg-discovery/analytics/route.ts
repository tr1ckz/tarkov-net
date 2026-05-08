import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CountRow = { count: number | bigint | null };
type DayCountRow = { day: string | null; count: number | bigint | null };
type ShardBreakdownRow = {
  platform: string | null;
  shard: string | null;
  count: number | bigint | null;
};
type StreamerContributionRow = {
  twitchUserId: string | null;
  twitchUserLogin: string | null;
  twitchUserName: string | null;
  observations: number | bigint | null;
  uniquePlayers: number | bigint | null;
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

function clampDays(value: string | null) {
  const n = Number(value ?? "7");
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(60, Math.floor(n)));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get("days"));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalIndexedRows,
    newPlayersInRangeRows,
    observationsInRangeRows,
    contributorsInRangeRows,
    indexedMatchesInRangeRows,
    indexedVodsInRangeRows,
    mappedLinksInRangeRows,
    dailyNewPlayers,
    dailyObservations,
    dailyIndexedMatches,
    dailyMappedLinks,
    shardBreakdown,
    streamerContribution,
    recentDiscoveryRuns
  ] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) as count FROM "PubgKnownPlayer"`,
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) as count FROM "PubgKnownPlayer" WHERE "firstSeenAt" >= ${since}`,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) as count
      FROM "PubgLinkEvent"
      WHERE "eventType" = 'seen_player_discovery' AND "createdAt" >= ${since}
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT "twitchUserId") as count
      FROM "PubgLinkEvent"
      WHERE "eventType" = 'seen_player_discovery' AND "createdAt" >= ${since}
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) as count
      FROM "PubgStreamerMatch"
      WHERE "indexedAt" >= ${since}
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) as count
      FROM "PubgStreamerVod"
      WHERE "indexedAt" >= ${since}
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) as count
      FROM "PubgMatchVodLink"
      WHERE "linkedAt" >= ${since}
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT strftime('%Y-%m-%d', "firstSeenAt") as day, COUNT(*) as count
      FROM "PubgKnownPlayer"
      WHERE "firstSeenAt" >= ${since}
      GROUP BY strftime('%Y-%m-%d', "firstSeenAt")
      ORDER BY day ASC
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT strftime('%Y-%m-%d', "createdAt") as day, COUNT(*) as count
      FROM "PubgLinkEvent"
      WHERE "eventType" = 'seen_player_discovery' AND "createdAt" >= ${since}
      GROUP BY strftime('%Y-%m-%d', "createdAt")
      ORDER BY day ASC
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT strftime('%Y-%m-%d', "indexedAt") as day, COUNT(*) as count
      FROM "PubgStreamerMatch"
      WHERE "indexedAt" >= ${since}
      GROUP BY strftime('%Y-%m-%d', "indexedAt")
      ORDER BY day ASC
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT strftime('%Y-%m-%d', "linkedAt") as day, COUNT(*) as count
      FROM "PubgMatchVodLink"
      WHERE "linkedAt" >= ${since}
      GROUP BY strftime('%Y-%m-%d', "linkedAt")
      ORDER BY day ASC
    `,
    prisma.$queryRaw<ShardBreakdownRow[]>`
      SELECT "platform" as platform, "shard" as shard, COUNT(*) as count
      FROM "PubgKnownPlayer"
      WHERE "firstSeenAt" >= ${since}
      GROUP BY "platform", "shard"
      ORDER BY count DESC
      LIMIT 20
    `,
    prisma.$queryRaw<StreamerContributionRow[]>`
      SELECT
        "twitchUserId" as twitchUserId,
        "twitchUserLogin" as twitchUserLogin,
        "twitchUserName" as twitchUserName,
        COUNT(*) as observations,
        COUNT(DISTINCT "pubgNameNormalized") as uniquePlayers
      FROM "PubgLinkEvent"
      WHERE "eventType" = 'seen_player_discovery' AND "createdAt" >= ${since}
      GROUP BY "twitchUserId", "twitchUserLogin", "twitchUserName"
      ORDER BY uniquePlayers DESC, observations DESC
      LIMIT 30
    `,
    prisma.pubgLinkRunLog.findMany({
      where: {
        source: "eventsub",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        createdAt: true,
        status: true,
        playerName: true,
        metadataJson: true,
      }
    })
  ]);

  const summary = {
    days,
    since: since.toISOString(),
    totalIndexedPlayers: normalizeCount(totalIndexedRows[0]?.count),
    newIndexedPlayersInRange: normalizeCount(newPlayersInRangeRows[0]?.count),
    seenPlayerObservationsInRange: normalizeCount(observationsInRangeRows[0]?.count),
    activeContributorsInRange: normalizeCount(contributorsInRangeRows[0]?.count),
    indexedMatchesInRange: normalizeCount(indexedMatchesInRangeRows[0]?.count),
    indexedVodsInRange: normalizeCount(indexedVodsInRangeRows[0]?.count),
    mappedMatchVodLinksInRange: normalizeCount(mappedLinksInRangeRows[0]?.count),
  };

  return NextResponse.json({
    summary,
    dailyNewPlayers: dailyNewPlayers.map((row) => ({
      day: row.day ?? "unknown",
      count: normalizeCount(row.count),
    })),
    dailyObservations: dailyObservations.map((row) => ({
      day: row.day ?? "unknown",
      count: normalizeCount(row.count),
    })),
    dailyIndexedMatches: dailyIndexedMatches.map((row) => ({
      day: row.day ?? "unknown",
      count: normalizeCount(row.count),
    })),
    dailyMappedLinks: dailyMappedLinks.map((row) => ({
      day: row.day ?? "unknown",
      count: normalizeCount(row.count),
    })),
    shardBreakdown: shardBreakdown.map((row) => ({
      platform: row.platform ?? "unknown",
      shard: row.shard ?? "unknown",
      count: normalizeCount(row.count),
    })),
    streamerContribution: streamerContribution.map((row) => ({
      twitchUserId: row.twitchUserId ?? "unknown",
      twitchUserLogin: row.twitchUserLogin ?? "unknown",
      twitchUserName: row.twitchUserName ?? "unknown",
      observations: normalizeCount(row.observations),
      uniquePlayers: normalizeCount(row.uniquePlayers),
    })),
    recentEventSubRuns: recentDiscoveryRuns.map((run) => {
      let seenIndexing: Record<string, unknown> | null = null;
      let matchVodIndexing: Record<string, unknown> | null = null;
      if (run.metadataJson) {
        try {
          const parsed = JSON.parse(run.metadataJson) as Record<string, unknown>;
          seenIndexing = (parsed.seenIndexing as Record<string, unknown> | null) ?? null;
          matchVodIndexing = (parsed.matchVodIndexing as Record<string, unknown> | null) ?? null;
        } catch {
          seenIndexing = null;
          matchVodIndexing = null;
        }
      }
      return {
        createdAt: run.createdAt,
        status: run.status,
        playerName: run.playerName,
        seenIndexing,
        matchVodIndexing,
      };
    })
  });
}
