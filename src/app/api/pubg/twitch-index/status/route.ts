import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [state, count, recentDiagnosticRuns] = await Promise.all([
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
    })
  ]);

  return NextResponse.json({
    key: "pubg:twitch-index",
    activeStreamerCount: count,
    lastRefreshAt: state?.lastRefreshAt ?? null,
    refreshInProgress: state?.refreshInProgress ?? false,
    refreshStartedAt: state?.refreshStartedAt ?? null,
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
