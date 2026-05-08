import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const platform = searchParams.get("platform")?.trim().toLowerCase() ?? "steam";
  const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") ?? "10")));

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const lower = q.toLowerCase();

  // Case-insensitive LIKE search against the local player index
  const rows = await prisma.pubgKnownPlayer.findMany({
    where: {
      playerNameLower: { contains: lower },
      platform
    },
    select: {
      playerName: true,
      platform: true,
      shard: true,
      seenCount: true,
      lastSeenAt: true
    },
    orderBy: [
      { seenCount: "desc" },
      { lastSeenAt: "desc" }
    ],
    take: limit
  });

  return NextResponse.json({
    results: rows.map((r) => ({
      playerName: r.playerName,
      platform: r.platform,
      shard: r.shard,
      seenCount: r.seenCount
    })),
    indexSize: await prisma.pubgKnownPlayer.count({ where: { platform } })
  });
}
