import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type CountRow = { count: number };

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

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    totalEvents,
    uniquePubgAccounts,
    uniqueTwitchAccounts,
    last24hEvents,
    last7dEvents,
    sourceBreakdown,
    topPubg,
    topTwitch,
    recent,
    activeIndexerCount,
    uniquePairRows
  ] = await Promise.all([
    prisma.pubgLinkEvent.count(),
    prisma.pubgLinkEvent.groupBy({ by: ["pubgNameNormalized"] }),
    prisma.pubgLinkEvent.groupBy({ by: ["twitchUserId"] }),
    prisma.pubgLinkEvent.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.pubgLinkEvent.count({ where: { createdAt: { gte: weekAgo } } }),
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
    prisma.pubgActiveStreamer.count(),
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
    totals: {
      totalEvents,
      uniquePubgAccounts: uniquePubgAccounts.length,
      uniqueTwitchAccounts: uniqueTwitchAccounts.length,
      uniquePairs: normalizeCount(uniquePairRows[0]?.count),
      last24hEvents,
      last7dEvents,
      activeIndexerCount
    },
    sourceBreakdown: sourceBreakdown.map((row) => ({
      eventType: row.eventType,
      count: row._count._all
    })),
    topPubg: topPubgWithReach,
    topTwitch: topTwitchWithReach,
    recent
  });
}
