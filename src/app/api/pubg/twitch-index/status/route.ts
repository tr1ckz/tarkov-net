import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [state, count] = await Promise.all([
    prisma.cacheState.findUnique({ where: { key: "pubg:twitch-index" } }),
    prisma.pubgActiveStreamer.count()
  ]);

  return NextResponse.json({
    key: "pubg:twitch-index",
    activeStreamerCount: count,
    lastRefreshAt: state?.lastRefreshAt ?? null,
    refreshInProgress: state?.refreshInProgress ?? false,
    refreshStartedAt: state?.refreshStartedAt ?? null
  });
}
