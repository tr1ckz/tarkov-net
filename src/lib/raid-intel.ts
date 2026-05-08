import { GraphQLClient, gql } from "graphql-request";
import { prisma } from "@/lib/prisma";
import { GameMode } from "@/types/tarkov";

const GOON_TRACKER_BASE = "https://www.tarkov-goon-tracker.com";
const TARKOV_DEV_API = "https://api.tarkov.dev/graphql";
const RAID_INTEL_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const RAID_INTEL_LOCK_STALE_MS = 20 * 60 * 1000;

type GoonTrackerTracking = {
  currentDate?: string;
  username?: string;
  map?: { name?: string };
};

type GoonTrackerNextData = {
  props?: {
    pageProps?: {
      trackings?: GoonTrackerTracking[];
    };
  };
};

type CommunityGoonData = {
  map: string | null;
  timestamp: string | null;
  reportCount: number | null;
};

type RaidIntel = {
  reportedMap: string | null;
  reportedServer: string | null;
  reportedTime: string | null;
  reportedTimeType: string | null;
  reportCount: number | null;
  goonsMap: string | null;
  goonsTimestamp: string | null;
  raidDurationMinutes: number | null;
};

type RaidIntelCacheEntry = {
  reportedMap: string | null;
  reportedServer: string | null;
  reportedTime: string | null;
  reportedTimeType: string | null;
  reportCount: number | null;
  goonsMap: string | null;
  goonsTimestamp: string | null;
  raidDurationMinutes: number | null;
  fetchedAt: Date;
};

type GoonsAndMapResponse = {
  goonReports: { map: { name: string } | null; timestamp: string | null }[];
  maps: { name: string; raidDuration: number | null }[];
};

const TRACKER_VALID_MAPS = new Set(["Customs", "Woods", "Shoreline", "Lighthouse"]);

const tarkovDevClient = new GraphQLClient(TARKOV_DEV_API, {
  cache: "no-store",
  headers: {
    "Content-Type": "application/json"
  }
});

function normalizeMapName(input: string | null) {
  if (!input) {
    return null;
  }

  const lower = input.trim().toLowerCase();
  if (lower === "interchange") return "Interchange";
  if (lower === "customs") return "Customs";
  if (lower === "woods") return "Woods";
  if (lower === "factory") return "Factory";
  if (lower === "shoreline") return "Shoreline";
  if (lower === "reserve") return "Reserve";
  if (lower === "lighthouse") return "Lighthouse";
  if (lower === "streets" || lower === "streets of tarkov") return "Streets of Tarkov";
  if (lower === "ground zero") return "Ground Zero";
  if (lower === "the lab" || lower === "labs") return "The Lab";

  return input;
}

function raidIntelStateKey(mode: GameMode) {
  return `raid-intel:${mode}`;
}

function now() {
  return new Date();
}

async function getState(mode: GameMode) {
  return prisma.cacheState.upsert({
    where: { key: raidIntelStateKey(mode) },
    update: {},
    create: { key: raidIntelStateKey(mode) }
  });
}

async function acquireRefreshLock(mode: GameMode) {
  const staleLockThreshold = new Date(Date.now() - RAID_INTEL_LOCK_STALE_MS);

  const updated = await prisma.cacheState.updateMany({
    where: {
      key: raidIntelStateKey(mode),
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

async function releaseRefreshLock(mode: GameMode, refreshedAt?: Date) {
  await prisma.cacheState.update({
    where: { key: raidIntelStateKey(mode) },
    data: {
      refreshInProgress: false,
      refreshStartedAt: null,
      ...(refreshedAt ? { lastRefreshAt: refreshedAt } : {})
    }
  });
}

function parseNextData(html: string) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as GoonTrackerNextData;
  } catch {
    return null;
  }
}

function getLatestValidTracking(trackings: GoonTrackerTracking[]) {
  for (const tracking of trackings) {
    const rawMap = tracking.map?.name ?? null;
    const normalizedMap = normalizeMapName(rawMap);
    const currentDate = tracking.currentDate ?? null;
    const date = currentDate ? new Date(currentDate) : null;

    if (!normalizedMap || !TRACKER_VALID_MAPS.has(normalizedMap)) {
      continue;
    }

    if (!date || Number.isNaN(date.getTime())) {
      continue;
    }

    return {
      map: normalizedMap,
      timestamp: date.toISOString()
    };
  }

  return null;
}

function countValidTrackings(trackings: GoonTrackerTracking[]) {
  return trackings.filter((tracking) => {
    const rawMap = tracking.map?.name ?? null;
    const normalizedMap = normalizeMapName(rawMap);
    const currentDate = tracking.currentDate ?? null;
    const date = currentDate ? new Date(currentDate) : null;

    return Boolean(normalizedMap && TRACKER_VALID_MAPS.has(normalizedMap) && date && !Number.isNaN(date.getTime()));
  }).length;
}

async function fetchCommunityGoonData(gameMode: GameMode): Promise<CommunityGoonData> {
  const path = gameMode === "pve" ? "/pve" : "/";
  const response = await fetch(`${GOON_TRACKER_BASE}${path}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Goon tracker page failed with status ${response.status}`);
  }

  const html = await response.text();
  const nextData = parseNextData(html);
  const trackings = nextData?.props?.pageProps?.trackings ?? [];
  const latest = getLatestValidTracking(trackings);

  return {
    map: latest?.map ?? null,
    timestamp: latest?.timestamp ?? null,
    reportCount: countValidTrackings(trackings)
  };
}

async function fetchGoonAndRaidDurationData(gameMode: GameMode, mapName: string | null) {
  const query = gql`
    query RaidIntelWidget($gameMode: GameMode, $name: [String!]) {
      goonReports(gameMode: $gameMode, limit: 1) {
        timestamp
        map {
          name
        }
      }
      maps(gameMode: $gameMode, name: $name, limit: 1) {
        name
        raidDuration
      }
    }
  `;

  const variables = {
    gameMode,
    name: mapName ? [mapName] : undefined
  };

  return tarkovDevClient.request<GoonsAndMapResponse>(query, variables);
}

async function fetchLiveRaidIntel(gameMode: GameMode): Promise<RaidIntel> {
  const community = await fetchCommunityGoonData(gameMode);
  const normalizedMap = normalizeMapName(community.map);
  const intel = await fetchGoonAndRaidDurationData(gameMode, normalizedMap);

  return {
    reportedMap: normalizedMap,
    reportedServer: null,
    reportedTime: null,
    reportedTimeType: null,
    reportCount: Number.isFinite(community.reportCount) ? community.reportCount : null,
    goonsMap: community.map ?? intel.goonReports?.[0]?.map?.name ?? null,
    goonsTimestamp: community.timestamp ?? intel.goonReports?.[0]?.timestamp ?? null,
    raidDurationMinutes: intel.maps?.[0]?.raidDuration ?? null
  };
}

function toRaidIntel(entry: RaidIntelCacheEntry): RaidIntel {
  return {
    reportedMap: entry.reportedMap,
    reportedServer: entry.reportedServer,
    reportedTime: entry.reportedTime,
    reportedTimeType: entry.reportedTimeType,
    reportCount: entry.reportCount,
    goonsMap: entry.goonsMap,
    goonsTimestamp: entry.goonsTimestamp,
    raidDurationMinutes: entry.raidDurationMinutes
  };
}

async function getRaidIntelFromCache(mode: GameMode) {
  return prisma.cachedRaidIntel.findUnique({
    where: { gameMode: mode }
  });
}

export async function refreshRaidIntelCache(mode: GameMode, options?: { force?: boolean }) {
  await getState(mode);
  const state = await getState(mode);
  const shouldRefresh =
    options?.force ||
    !state.lastRefreshAt ||
    Date.now() - state.lastRefreshAt.getTime() >= RAID_INTEL_REFRESH_INTERVAL_MS;

  if (!shouldRefresh) {
    return;
  }

  const hasLock = await acquireRefreshLock(mode);
  if (!hasLock) {
    return;
  }

  try {
    const live = await fetchLiveRaidIntel(mode);

    await prisma.cachedRaidIntel.upsert({
      where: { gameMode: mode },
      update: {
        reportedMap: live.reportedMap,
        reportedServer: live.reportedServer,
        reportedTime: live.reportedTime,
        reportedTimeType: live.reportedTimeType,
        reportCount: live.reportCount,
        goonsMap: live.goonsMap,
        goonsTimestamp: live.goonsTimestamp,
        raidDurationMinutes: live.raidDurationMinutes,
        fetchedAt: now()
      },
      create: {
        gameMode: mode,
        reportedMap: live.reportedMap,
        reportedServer: live.reportedServer,
        reportedTime: live.reportedTime,
        reportedTimeType: live.reportedTimeType,
        reportCount: live.reportCount,
        goonsMap: live.goonsMap,
        goonsTimestamp: live.goonsTimestamp,
        raidDurationMinutes: live.raidDurationMinutes,
        fetchedAt: now()
      }
    });

    await releaseRefreshLock(mode, now());
  } catch (error) {
    await releaseRefreshLock(mode);
    throw error;
  }
}

function triggerBackgroundRaidIntelRefresh(mode: GameMode) {
  void refreshRaidIntelCache(mode).catch((error) => {
    console.error("Background raid intel refresh failed", error);
  });
}

export async function getRaidIntel(gameMode: GameMode): Promise<RaidIntel> {
  try {
    const cached = await getRaidIntelFromCache(gameMode);

    if (!cached) {
      await refreshRaidIntelCache(gameMode, { force: true });
      const seeded = await getRaidIntelFromCache(gameMode);
      if (seeded) {
        return toRaidIntel(seeded);
      }
    }

    if (cached) {
      if (Date.now() - cached.fetchedAt.getTime() >= RAID_INTEL_REFRESH_INTERVAL_MS) {
        triggerBackgroundRaidIntelRefresh(gameMode);
      }
      return toRaidIntel(cached);
    }

    const live = await fetchLiveRaidIntel(gameMode);
    return live;
  } catch (error) {
    console.error("Failed to load raid intel", error);

    return {
      reportedMap: null,
      reportedServer: null,
      reportedTime: null,
      reportedTimeType: null,
      reportCount: null,
      goonsMap: null,
      goonsTimestamp: null,
      raidDurationMinutes: null
    };
  }
}
