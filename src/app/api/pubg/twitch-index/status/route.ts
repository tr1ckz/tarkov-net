import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [state, count, recentDiagnosticRuns, latestCrawlerRun] = await Promise.all([
    prisma.cacheState.findUnique({ where: { key: "pubg:twitch-index" } }),
    prisma.pubgActiveStreamer.count(),
    prisma.pubgLinkRunLog.findMany({
      where: {
        source: {
          in: ["twitch-index-refresh", "eventsub"]
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        createdAt: true,
        source: true,
        status: true,
        playerName: true,
        errorMessage: true,
        metadataJson: true
      }
    }),
    prisma.pubgLinkRunLog.findFirst({
      where: { source: "crawler-index" },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        status: true,
        errorMessage: true,
        metadataJson: true
      }
    })
  ]);

  let crawlerMetadata: Record<string, unknown> | null = null;
  if (latestCrawlerRun?.metadataJson) {
    try {
      crawlerMetadata = JSON.parse(latestCrawlerRun.metadataJson) as Record<string, unknown>;
    } catch {
      crawlerMetadata = null;
    }
  }

  const now = Date.now();
  const crawlerLastSeenMs = latestCrawlerRun?.createdAt ? latestCrawlerRun.createdAt.getTime() : Number.NaN;
  const indexLastRefreshMs = state?.lastRefreshAt ? state.lastRefreshAt.getTime() : Number.NaN;
  const crawlerHealthy = !Number.isNaN(crawlerLastSeenMs) && now - crawlerLastSeenMs <= 15 * 60 * 1000;
  const indexFresh = !Number.isNaN(indexLastRefreshMs) && now - indexLastRefreshMs <= 15 * 60 * 1000;

  return NextResponse.json({
    key: "pubg:twitch-index",
    activeStreamerCount: count,
    lastRefreshAt: state?.lastRefreshAt ?? null,
    refreshInProgress: state?.refreshInProgress ?? false,
    refreshStartedAt: state?.refreshStartedAt ?? null,
    jobHealth: {
      crawlerHealthy,
      indexFresh,
      crawlerLastSeenAt: latestCrawlerRun?.createdAt ?? null,
      crawlerLastStatus: latestCrawlerRun?.status ?? null,
      crawlerLastError: latestCrawlerRun?.errorMessage ?? null,
      crawlerMetadata
    },
    recentDiagnosticRuns: recentDiagnosticRuns.map((row) => {
      let metadata: Record<string, unknown> | null = null;
      if (row.metadataJson) {
        try {
          metadata = JSON.parse(row.metadataJson) as Record<string, unknown>;
        } catch {
          metadata = null;
        }
      }

      return {
        createdAt: row.createdAt,
        source: row.source,
        status: row.status,
        playerName: row.playerName,
        errorMessage: row.errorMessage,
        metadata
      };
    })
  });
}
