import { prisma } from "@/lib/prisma";
import { getAllLiveStreamsByGameId } from "@/lib/twitch";

const PUBG_TWITCH_GAME_ID = "27971";
const INDEX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOCK_STALE_MS = 2 * 60 * 1000;
const INDEX_LOCK_KEY = "pubg:twitch-index";

type ActiveStreamer = {
  twitchUserId: string;
  streamId: string;
  userLogin: string;
  userName: string;
  streamStartedAt: Date;
  title: string;
  normalizedLogin: string;
  normalizedName: string;
};

function now() {
  return new Date();
}

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripGamingPrefix(value: string) {
  const stripped = value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|twitch)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|twitch)$/g, "");
  return stripped;
}

export function normalizePubgNameForStreamerMatch(pubgName: string) {
  return normalizeForCompare(stripGamingPrefix(pubgName));
}

function hasUsableToken(value: string) {
  return value.length >= 4;
}

function isLikelyMatch(pubgName: string, streamer: ActiveStreamer) {
  const pubg = normalizePubgNameForStreamerMatch(pubgName);
  if (!pubg) return false;

  const login = streamer.normalizedLogin;
  const display = streamer.normalizedName;

  if (pubg === login || pubg === display) return true;

  if (hasUsableToken(pubg) && (login.includes(pubg) || pubg.includes(login))) {
    return true;
  }

  if (hasUsableToken(pubg) && (display.includes(pubg) || pubg.includes(display))) {
    return true;
  }

  return false;
}

async function getState() {
  return prisma.cacheState.upsert({
    where: { key: INDEX_LOCK_KEY },
    update: {},
    create: { key: INDEX_LOCK_KEY }
  });
}

async function acquireLock() {
  const staleThreshold = new Date(Date.now() - LOCK_STALE_MS);
  const updated = await prisma.cacheState.updateMany({
    where: {
      key: INDEX_LOCK_KEY,
      OR: [
        { refreshInProgress: false },
        { refreshStartedAt: null },
        { refreshStartedAt: { lt: staleThreshold } }
      ]
    },
    data: {
      refreshInProgress: true,
      refreshStartedAt: now()
    }
  });

  return updated.count === 1;
}

async function releaseLock(lastRefreshAt?: Date) {
  await prisma.cacheState.update({
    where: { key: INDEX_LOCK_KEY },
    data: {
      refreshInProgress: false,
      refreshStartedAt: null,
      ...(lastRefreshAt ? { lastRefreshAt } : {})
    }
  });
}

export async function refreshPubgStreamerIndex(options?: { force?: boolean }) {
  await getState();
  const state = await getState();

  const shouldRefresh =
    options?.force ||
    !state.lastRefreshAt ||
    Date.now() - state.lastRefreshAt.getTime() >= INDEX_REFRESH_INTERVAL_MS;

  if (!shouldRefresh) {
    return { refreshed: false, count: await prisma.pubgActiveStreamer.count() };
  }

  const hasLock = await acquireLock();
  if (!hasLock) {
    return { refreshed: false, count: await prisma.pubgActiveStreamer.count() };
  }

  try {
    const streams = await getAllLiveStreamsByGameId(PUBG_TWITCH_GAME_ID, 12);
    const activeRows = streams.map((stream) => ({
      twitchUserId: stream.user_id,
      streamId: stream.id,
      userLogin: stream.user_login,
      userName: stream.user_name,
      gameId: stream.game_id,
      streamStartedAt: new Date(stream.started_at),
      title: stream.title,
      normalizedLogin: normalizeForCompare(stripGamingPrefix(stream.user_login)),
      normalizedName: normalizeForCompare(stripGamingPrefix(stream.user_name)),
      indexedAt: now(),
      updatedAt: now()
    }));

    for (const row of activeRows) {
      await prisma.pubgActiveStreamer.upsert({
        where: { twitchUserId: row.twitchUserId },
        create: row,
        update: {
          streamId: row.streamId,
          userLogin: row.userLogin,
          userName: row.userName,
          gameId: row.gameId,
          streamStartedAt: row.streamStartedAt,
          title: row.title,
          normalizedLogin: row.normalizedLogin,
          normalizedName: row.normalizedName,
          indexedAt: row.indexedAt
        }
      });
    }

    if (activeRows.length) {
      await prisma.pubgActiveStreamer.deleteMany({
        where: {
          twitchUserId: {
            notIn: activeRows.map((row) => row.twitchUserId)
          }
        }
      });
    } else {
      await prisma.pubgActiveStreamer.deleteMany();
    }

    const refreshedAt = now();
    await releaseLock(refreshedAt);

    return {
      refreshed: true,
      count: activeRows.length,
      refreshedAt: refreshedAt.toISOString()
    };
  } catch (error) {
    await releaseLock();
    throw error;
  }
}

export async function ensurePubgStreamerIndexFresh() {
  return refreshPubgStreamerIndex();
}

export async function getActivePubgStreamers() {
  const rows = await prisma.pubgActiveStreamer.findMany({
    orderBy: [{ indexedAt: "desc" }, { userLogin: "asc" }]
  });

  return rows.map((row) => ({
    twitchUserId: row.twitchUserId,
    streamId: row.streamId,
    userLogin: row.userLogin,
    userName: row.userName,
    streamStartedAt: row.streamStartedAt,
    title: row.title,
    normalizedLogin: row.normalizedLogin,
    normalizedName: row.normalizedName
  }));
}

export async function findMatchedActiveStreamers(pubgName: string) {
  const streamers = await getActivePubgStreamers();
  return streamers.filter((streamer) => isLikelyMatch(pubgName, streamer));
}

export function computeVodOffsetSeconds(eventTimeIso: string, streamStartIso: string, contextLeadSeconds = 20) {
  const eventMs = Date.parse(eventTimeIso);
  const streamMs = Date.parse(streamStartIso);

  if (Number.isNaN(eventMs) || Number.isNaN(streamMs)) {
    return 0;
  }

  const raw = Math.floor((eventMs - streamMs) / 1000) - contextLeadSeconds;
  return Math.max(0, raw);
}
