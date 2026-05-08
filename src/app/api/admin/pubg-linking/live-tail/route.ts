import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

type RunMetadata = {
  verboseMessages?: string[];
  [key: string]: unknown;
};

function parseRunMetadata(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as RunMetadata;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source")?.trim() || "all";
  const status = searchParams.get("status")?.trim() || "all";
  const player = searchParams.get("player")?.trim() || "";
  const minutes = clampInt(searchParams.get("minutes"), 30, 1, 24 * 60);
  const limit = clampInt(searchParams.get("limit"), 120, 10, 500);

  const since = new Date(Date.now() - minutes * 60 * 1000);

  const runs = await prisma.pubgLinkRunLog.findMany({
    where: {
      createdAt: { gte: since },
      ...(source !== "all" ? { source } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(player ? { playerName: { contains: player } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
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
  });

  return NextResponse.json({
    filters: { source, status, player, minutes, limit },
    generatedAt: new Date().toISOString(),
    count: runs.length,
    runs: runs.map((run) => {
      const metadata = parseRunMetadata(run.metadataJson);
      return {
        ...run,
        metadata,
        verboseMessages: metadata?.verboseMessages ?? []
      };
    })
  });
}
