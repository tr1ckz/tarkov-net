import { prisma } from "@/lib/prisma";
import { GameMode } from "@/types/tarkov";

export async function getCacheStatusToken(mode: GameMode) {
  const [marketMax, raidIntelMax, marketState, raidState] = await Promise.all([
    prisma.cachedItemPrice.aggregate({
      where: { gameMode: mode },
      _max: { fetchedAt: true }
    }),
    prisma.cachedRaidIntel.aggregate({
      where: { gameMode: mode },
      _max: { fetchedAt: true }
    }),
    prisma.cacheState.findUnique({
      where: { key: `market:${mode}` },
      select: { lastRefreshAt: true }
    }),
    prisma.cacheState.findUnique({
      where: { key: `raid-intel:${mode}` },
      select: { lastRefreshAt: true }
    })
  ]);

  return [
    mode,
    marketMax._max.fetchedAt?.toISOString() ?? "market:none",
    raidIntelMax._max.fetchedAt?.toISOString() ?? "raid:none",
    marketState?.lastRefreshAt?.toISOString() ?? "market-state:none",
    raidState?.lastRefreshAt?.toISOString() ?? "raid-state:none"
  ].join("|");
}
