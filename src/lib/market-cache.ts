import { prisma } from "@/lib/prisma";
import { getAllItems } from "@/lib/tarkov";
import { GameMode, MarketItem } from "@/types/tarkov";

// tarkov.dev price data is server-updated every 5 minutes, so polling faster is wasteful.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
const LOCK_STALE_MS = 20 * 60 * 1000;

function modeKey(mode: GameMode) {
  return `market:${mode}`;
}

function now() {
  return new Date();
}

function isTraderVendorName(name: string) {
  return !name.toLowerCase().includes("flea");
}

function toMarketItem(entry: {
  itemId: string;
  avg24hPrice: number | null;
  lastLowPrice: number | null;
  basePrice: number | null;
  bestTraderName: string | null;
  bestTraderPrice: number | null;
  fetchedAt: Date;
  item: {
    id: string;
    name: string;
    shortName: string;
    normalizedName: string;
    iconLink: string | null;
    snapshots?: { lastLowPrice: number | null; capturedAt: Date }[];
  };
}): MarketItem {
  return {
    id: entry.item.id,
    name: entry.item.name,
    shortName: entry.item.shortName,
    normalizedName: entry.item.normalizedName,
    iconLink: entry.item.iconLink,
    avg24hPrice: entry.avg24hPrice,
    lastLowPrice: entry.lastLowPrice,
    basePrice: entry.basePrice,
    lastSeenPrice: entry.lastLowPrice ?? entry.avg24hPrice ?? entry.basePrice,
    lastSeenAt: entry.fetchedAt.toISOString(),
    previousSeenPrice: entry.item.snapshots?.[0]?.lastLowPrice ?? null,
    previousSeenAt: entry.item.snapshots?.[0]?.capturedAt?.toISOString() ?? null,
    sellFor:
      entry.bestTraderName && entry.bestTraderPrice
        ? [
            {
              price: entry.bestTraderPrice,
              priceRUB: entry.bestTraderPrice,
              currency: "RUB",
              vendor: { name: entry.bestTraderName }
            }
          ]
        : []
  };
}

async function getState(mode: GameMode) {
  return prisma.cacheState.upsert({
    where: { key: modeKey(mode) },
    update: {},
    create: { key: modeKey(mode) }
  });
}

async function acquireRefreshLock(mode: GameMode) {
  const staleLockThreshold = new Date(Date.now() - LOCK_STALE_MS);

  const updated = await prisma.cacheState.updateMany({
    where: {
      key: modeKey(mode),
      OR: [
        { refreshInProgress: false },
        { refreshStartedAt: null },
        { refreshStartedAt: { lt: staleLockThreshold } }
      ]
    },
    data: {
      refreshInProgress: true,
      refreshStartedAt: now()
    }
  });

  return updated.count === 1;
}

async function releaseRefreshLock(mode: GameMode, data?: Partial<{ lastRefreshAt: Date; lastFullSyncAt: Date; lastSnapshotAt: Date }>) {
  await prisma.cacheState.update({
    where: { key: modeKey(mode) },
    data: {
      refreshInProgress: false,
      refreshStartedAt: null,
      ...(data?.lastRefreshAt ? { lastRefreshAt: data.lastRefreshAt } : {}),
      ...(data?.lastFullSyncAt ? { lastFullSyncAt: data.lastFullSyncAt } : {}),
      ...(data?.lastSnapshotAt ? { lastSnapshotAt: data.lastSnapshotAt } : {})
    }
  });
}

function getBestTrader(item: MarketItem) {
  const traderBuybacks = item.sellFor.filter((entry) => isTraderVendorName(entry.vendor.name));

  if (!traderBuybacks.length) {
    return { name: null as string | null, price: null as number | null };
  }

  const best = traderBuybacks.reduce((top, current) => {
    if (!top || current.priceRUB > top.priceRUB) {
      return current;
    }
    return top;
  }, traderBuybacks[0]);

  return {
    name: best.vendor.name,
    price: best.priceRUB
  };
}

async function persistBatch(
  items: MarketItem[],
  mode: GameMode,
  captureSnapshots: boolean,
  snapshotItemIds: Set<string>
) {
  for (const item of items) {
    await prisma.cachedItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        shortName: item.shortName,
        normalizedName: item.normalizedName,
        iconLink: item.iconLink
      },
      create: {
        id: item.id,
        name: item.name,
        shortName: item.shortName,
        normalizedName: item.normalizedName,
        iconLink: item.iconLink
      }
    });
  }

  for (const item of items) {
    const best = getBestTrader(item);

    await prisma.cachedItemPrice.upsert({
      where: {
        itemId_gameMode: {
          itemId: item.id,
          gameMode: mode
        }
      },
      update: {
        avg24hPrice: item.avg24hPrice,
        lastLowPrice: item.lastLowPrice,
        basePrice: item.basePrice,
        bestTraderName: best.name,
        bestTraderPrice: best.price,
        fetchedAt: now()
      },
      create: {
        itemId: item.id,
        gameMode: mode,
        avg24hPrice: item.avg24hPrice,
        lastLowPrice: item.lastLowPrice,
        basePrice: item.basePrice,
        bestTraderName: best.name,
        bestTraderPrice: best.price,
        fetchedAt: now()
      }
    });

    if (captureSnapshots && snapshotItemIds.has(item.id)) {
      await prisma.cachedPricePoint.create({
        data: {
          itemId: item.id,
          gameMode: mode,
          avg24hPrice: item.avg24hPrice,
          lastLowPrice: item.lastLowPrice,
          capturedAt: now()
        }
      });
    }
  }
}

export async function refreshMarketCache(mode: GameMode, options?: { force?: boolean }) {
  await getState(mode);
  const state = await getState(mode);

  const current = Date.now();
  const shouldRefresh =
    options?.force || !state.lastRefreshAt || current - state.lastRefreshAt.getTime() >= REFRESH_INTERVAL_MS;

  if (!shouldRefresh) {
    return;
  }

  const hasLock = await acquireRefreshLock(mode);
  if (!hasLock) {
    return;
  }

  try {
    const beforeRefresh = await getState(mode);
    const shouldFullSync =
      options?.force ||
      !beforeRefresh.lastFullSyncAt ||
      current - beforeRefresh.lastFullSyncAt.getTime() >= FULL_SYNC_INTERVAL_MS;
    const shouldCaptureSnapshots =
      !beforeRefresh.lastSnapshotAt ||
      current - beforeRefresh.lastSnapshotAt.getTime() >= SNAPSHOT_INTERVAL_MS;
    const favoriteRows = shouldCaptureSnapshots
      ? await prisma.favorite.findMany({
          select: { itemId: true },
          distinct: ["itemId"]
        })
      : [];
    const snapshotItemIds = new Set(favoriteRows.map((row) => row.itemId));

    const items = await getAllItems(mode);

    const batchSize = 150;
    for (let i = 0; i < items.length; i += batchSize) {
      await persistBatch(
        items.slice(i, i + batchSize),
        mode,
        shouldCaptureSnapshots,
        snapshotItemIds
      );
    }

    if (shouldFullSync) {
      const pruneBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.cachedPricePoint.deleteMany({
        where: {
          gameMode: mode,
          capturedAt: { lt: pruneBefore }
        }
      });
    }

    await releaseRefreshLock(mode, {
      lastRefreshAt: now(),
      ...(shouldFullSync ? { lastFullSyncAt: now() } : {}),
      ...(shouldCaptureSnapshots ? { lastSnapshotAt: now() } : {})
    });
  } catch (error) {
    await releaseRefreshLock(mode);
    throw error;
  }
}

export function triggerBackgroundRefresh(mode: GameMode) {
  void refreshMarketCache(mode).catch((error) => {
    console.error("Background market refresh failed", error);
  });
}

export function primeMarketCacheFromItems(mode: GameMode, items: MarketItem[]) {
  void (async () => {
    await getState(mode);
    const hasLock = await acquireRefreshLock(mode);
    if (!hasLock) {
      return;
    }

    try {
      const beforePrime = await getState(mode);
      const shouldCaptureSnapshots =
        !beforePrime.lastSnapshotAt || Date.now() - beforePrime.lastSnapshotAt.getTime() >= SNAPSHOT_INTERVAL_MS;
      const favoriteRows = shouldCaptureSnapshots
        ? await prisma.favorite.findMany({ select: { itemId: true }, distinct: ["itemId"] })
        : [];
      const snapshotItemIds = new Set(favoriteRows.map((row) => row.itemId));

      const batchSize = 150;
      for (let i = 0; i < items.length; i += batchSize) {
        await persistBatch(items.slice(i, i + batchSize), mode, shouldCaptureSnapshots, snapshotItemIds);
      }

      await releaseRefreshLock(mode, {
        lastRefreshAt: now(),
        ...(shouldCaptureSnapshots ? { lastSnapshotAt: now() } : {})
      });
    } catch (error) {
      await releaseRefreshLock(mode);
      throw error;
    }
  })().catch((error) => {
    console.error("Cache priming failed", error);
  });
}

export async function getDashboardItemsFromCache(
  mode: GameMode,
  options?: { page?: number; pageSize?: number; query?: string }
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, options?.pageSize ?? 100));
  const query = options?.query?.trim();

  const where = {
    gameMode: mode,
    ...(query
      ? {
          item: {
            OR: [
              { name: { contains: query } },
              { shortName: { contains: query } },
              { normalizedName: { contains: query } }
            ]
          }
        }
      : {})
  };

  const [total, totalCached, rows] = await Promise.all([
    prisma.cachedItemPrice.count({ where }),
    prisma.cachedItemPrice.count({ where: { gameMode: mode } }),
    prisma.cachedItemPrice.findMany({
      where,
      include: {
        item: {
          select: {
            id: true,
            name: true,
            shortName: true,
            normalizedName: true,
            iconLink: true,
            snapshots: {
              take: 1,
              orderBy: { capturedAt: "desc" },
              where: { gameMode: mode },
              select: {
                lastLowPrice: true,
                capturedAt: true
              }
            }
          }
        }
      },
      orderBy: [{ lastLowPrice: "desc" }, { avg24hPrice: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return {
    items: rows.map(toMarketItem),
    total,
    totalCached,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getDashboardItemsFromLive(
  mode: GameMode,
  options?: { page?: number; pageSize?: number; query?: string }
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, options?.pageSize ?? 100));
  const query = options?.query?.trim().toLowerCase();

  const allItems = await getAllItems(mode);
  const filtered = query
    ? allItems.filter((item) =>
        [item.name, item.shortName, item.normalizedName].some((value) =>
          value.toLowerCase().includes(query)
        )
      )
    : allItems;

  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    totalCached: 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    allItems
  };
}

export async function getItemsByIdsFromCache(itemIds: string[], mode: GameMode) {
  if (!itemIds.length) {
    return [];
  }

  const rows = await prisma.cachedItemPrice.findMany({
    where: {
      gameMode: mode,
      itemId: { in: itemIds }
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          shortName: true,
          normalizedName: true,
          iconLink: true,
          snapshots: {
            take: 1,
            orderBy: { capturedAt: "desc" },
            where: { gameMode: mode },
            select: {
              lastLowPrice: true,
              capturedAt: true
            }
          }
        }
      }
    }
  });

  return rows.map(toMarketItem);
}

export async function getCachedItemMarketMeta(itemId: string, mode: GameMode) {
  const row = await prisma.cachedItemPrice.findUnique({
    where: {
      itemId_gameMode: {
        itemId,
        gameMode: mode
      }
    },
    select: {
      avg24hPrice: true,
      lastLowPrice: true,
      basePrice: true,
      fetchedAt: true,
      item: {
        select: {
          snapshots: {
            take: 1,
            orderBy: { capturedAt: "desc" },
            where: { gameMode: mode },
            select: {
              lastLowPrice: true,
              capturedAt: true
            }
          }
        }
      }
    }
  });

  if (!row) {
    return null;
  }

  return {
    lastSeenPrice: row.lastLowPrice ?? row.avg24hPrice ?? row.basePrice,
    lastSeenAt: row.fetchedAt,
    previousSeenPrice: row.item.snapshots[0]?.lastLowPrice ?? null,
    previousSeenAt: row.item.snapshots[0]?.capturedAt ?? null
  };
}

export async function getTrendMapForItems(itemIds: string[], mode: GameMode) {
  if (!itemIds.length) {
    return new Map<string, { direction: "up" | "down" | "flat"; percentChange: number }>();
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const points = await prisma.cachedPricePoint.findMany({
    where: {
      gameMode: mode,
      itemId: { in: itemIds },
      capturedAt: { gte: since }
    },
    orderBy: [{ itemId: "asc" }, { capturedAt: "asc" }],
    select: {
      itemId: true,
      lastLowPrice: true,
      capturedAt: true
    }
  });

  const byItem = new Map<string, { first: number | null; last: number | null }>();

  for (const point of points) {
    const existing = byItem.get(point.itemId) ?? { first: null, last: null };
    if (existing.first === null && point.lastLowPrice !== null) {
      existing.first = point.lastLowPrice;
    }
    if (point.lastLowPrice !== null) {
      existing.last = point.lastLowPrice;
    }
    byItem.set(point.itemId, existing);
  }

  const trend = new Map<string, { direction: "up" | "down" | "flat"; percentChange: number }>();
  for (const itemId of itemIds) {
    const prices = byItem.get(itemId);
    if (!prices || prices.first === null || prices.last === null || prices.first === 0) {
      trend.set(itemId, { direction: "flat", percentChange: 0 });
      continue;
    }

    const delta = prices.last - prices.first;
    const percentChange = (delta / prices.first) * 100;

    trend.set(itemId, {
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      percentChange
    });
  }

  return trend;
}

export type TopPriceIncrease = {
  itemId: string;
  name: string;
  shortName: string;
  normalizedName: string;
  fleaPrice: number;
  avg24hPrice: number;
  delta: number;
  percentChange: number;
  fetchedAt: Date;
};

export async function getTopPriceIncreases(
  mode: GameMode,
  options?: { limit?: number; minAvgPrice?: number }
) {
  const limit = Math.max(1, Math.min(20, options?.limit ?? 6));
  const minAvgPrice = Math.max(1, options?.minAvgPrice ?? 10_000);

  const rows = await prisma.cachedItemPrice.findMany({
    where: {
      gameMode: mode,
      avg24hPrice: { gt: minAvgPrice },
      lastLowPrice: { gt: 0 }
    },
    select: {
      avg24hPrice: true,
      lastLowPrice: true,
      fetchedAt: true,
      item: {
        select: {
          id: true,
          name: true,
          shortName: true,
          normalizedName: true
        }
      }
    },
    take: 1500
  });

  const increases = rows
    .map((row) => {
      const avg = row.avg24hPrice ?? 0;
      const flea = row.lastLowPrice ?? 0;
      const delta = flea - avg;
      const percentChange = avg > 0 ? (delta / avg) * 100 : 0;

      return {
        itemId: row.item.id,
        name: row.item.name,
        shortName: row.item.shortName,
        normalizedName: row.item.normalizedName,
        fleaPrice: flea,
        avg24hPrice: avg,
        delta,
        percentChange,
        fetchedAt: row.fetchedAt
      } satisfies TopPriceIncrease;
    })
    .filter((row) => row.delta > 0)
    .sort((a, b) => {
      if (b.percentChange !== a.percentChange) {
        return b.percentChange - a.percentChange;
      }
      return b.delta - a.delta;
    })
    .slice(0, limit);

  return increases;
}

type InsightRow = {
  itemId: string;
  name: string;
  shortName: string;
  normalizedName: string;
  avg24hPrice: number;
  currentPrice: number;
  delta: number;
  percentChange: number;
  fetchedAt: Date;
};

export type QuestCriticalRow = InsightRow;

export type HideoutCostTracker = {
  currentTotal: number;
  avg24hTotal: number;
  delta: number;
  percentChange: number;
  trackedCount: number;
  topInflators: InsightRow[];
};

export type WipeMetaBucket = {
  label: string;
  itemCount: number;
  avgPercentChange: number;
};

const QUEST_CRITICAL_KEYWORDS = [
  "salewa",
  "flash drive",
  "gas analyzer",
  "morphine",
  "spark plug",
  "car battery",
  "wd-40",
  "toolset",
  "medical bloodset",
  "isul",
  "virtex",
  "military cable",
  "corrugated hose",
  "bolts",
  "screws",
  "nuts"
];

const HIDEOUT_UPGRADE_KEYWORDS = [
  "corrugated hose",
  "bolts",
  "screws",
  "nuts",
  "power cord",
  "wires",
  "cpu fan",
  "phase control relay",
  "pressure gauge",
  "electric drill",
  "toolset",
  "car battery",
  "spark plug",
  "light bulb",
  "fuel conditioner"
];

const WIPE_META_BUCKETS: { label: string; keywords: string[] }[] = [
  {
    label: "Ammo",
    keywords: ["ammo", "5.45", "5.56", "7.62", "9x19", "12/70", "ap", "bp"]
  },
  {
    label: "Keys",
    keywords: ["key", "keycard", "marked"]
  },
  {
    label: "Meds",
    keywords: ["salewa", "ifak", "afak", "grizzly", "cms", "surv", "morphine", "med"]
  },
  {
    label: "Electronics",
    keywords: ["cpu", "cable", "wires", "relay", "battery", "graphics card", "tetriz"]
  },
  {
    label: "Barter",
    keywords: ["hose", "bolts", "screws", "nuts", "fuel", "filter", "toolset", "drill"]
  }
];

function toInsightRow(entry: {
  avg24hPrice: number | null;
  lastLowPrice: number | null;
  basePrice: number | null;
  fetchedAt: Date;
  item: {
    id: string;
    name: string;
    shortName: string;
    normalizedName: string;
  };
}): InsightRow {
  const avg24hPrice = entry.avg24hPrice ?? 0;
  const currentPrice = entry.lastLowPrice ?? entry.avg24hPrice ?? entry.basePrice ?? 0;
  const delta = currentPrice - avg24hPrice;
  const percentChange = avg24hPrice > 0 ? (delta / avg24hPrice) * 100 : 0;

  return {
    itemId: entry.item.id,
    name: entry.item.name,
    shortName: entry.item.shortName,
    normalizedName: entry.item.normalizedName,
    avg24hPrice,
    currentPrice,
    delta,
    percentChange,
    fetchedAt: entry.fetchedAt
  };
}

async function getInsightRows(mode: GameMode) {
  const rows = await prisma.cachedItemPrice.findMany({
    where: {
      gameMode: mode,
      OR: [{ avg24hPrice: { gt: 0 } }, { lastLowPrice: { gt: 0 } }]
    },
    select: {
      avg24hPrice: true,
      lastLowPrice: true,
      basePrice: true,
      fetchedAt: true,
      item: {
        select: {
          id: true,
          name: true,
          shortName: true,
          normalizedName: true
        }
      }
    },
    take: 3000
  });

  return rows.map(toInsightRow);
}

function nameMatchesKeywords(name: string, keywords: string[]) {
  const lower = name.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

export async function getQuestCriticalMarketList(
  mode: GameMode,
  options?: { limit?: number }
) {
  const limit = Math.max(1, Math.min(20, options?.limit ?? 8));
  const rows = await getInsightRows(mode);

  return rows
    .filter((row) => row.avg24hPrice > 0 && nameMatchesKeywords(row.name, QUEST_CRITICAL_KEYWORDS))
    .sort((a, b) => {
      if (b.percentChange !== a.percentChange) {
        return b.percentChange - a.percentChange;
      }
      return b.delta - a.delta;
    })
    .slice(0, limit);
}

export async function getHideoutUpgradeCostTracker(mode: GameMode): Promise<HideoutCostTracker> {
  const rows = await getInsightRows(mode);
  const tracked = rows.filter((row) =>
    row.avg24hPrice > 0 && nameMatchesKeywords(row.name, HIDEOUT_UPGRADE_KEYWORDS)
  );

  const currentTotal = tracked.reduce((sum, row) => sum + row.currentPrice, 0);
  const avg24hTotal = tracked.reduce((sum, row) => sum + row.avg24hPrice, 0);
  const delta = currentTotal - avg24hTotal;
  const percentChange = avg24hTotal > 0 ? (delta / avg24hTotal) * 100 : 0;
  const topInflators = [...tracked]
    .sort((a, b) => {
      if (b.percentChange !== a.percentChange) {
        return b.percentChange - a.percentChange;
      }
      return b.delta - a.delta;
    })
    .slice(0, 5);

  return {
    currentTotal,
    avg24hTotal,
    delta,
    percentChange,
    trackedCount: tracked.length,
    topInflators
  };
}

export async function getWipeMetaPulse(mode: GameMode) {
  const rows = await getInsightRows(mode);

  const buckets: WipeMetaBucket[] = WIPE_META_BUCKETS.map((bucket) => {
    const matches = rows.filter((row) => row.avg24hPrice > 0 && nameMatchesKeywords(row.name, bucket.keywords));
    const avgPercentChange =
      matches.length > 0
        ? matches.reduce((sum, row) => sum + row.percentChange, 0) / matches.length
        : 0;

    return {
      label: bucket.label,
      itemCount: matches.length,
      avgPercentChange
    };
  }).sort((a, b) => b.avgPercentChange - a.avgPercentChange);

  return {
    leader: buckets[0] ?? null,
    buckets
  };
}
