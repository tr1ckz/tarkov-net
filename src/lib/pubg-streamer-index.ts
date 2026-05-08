import { prisma } from "@/lib/prisma";
import { getAllLiveStreamsByGameId } from "@/lib/twitch";

const DEFAULT_PUBG_TWITCH_GAME_IDS = ["493057", "27971"];
const INDEX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOCK_STALE_MS = 2 * 60 * 1000;
const INDEX_LOCK_KEY = "pubg:twitch-index";
const STREAM_OVERLAP_GRACE_SECONDS = 120;

function getPubgTwitchGameIds() {
  const configured = process.env.PUBG_TWITCH_GAME_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return Array.from(new Set(configured));
  }

  return DEFAULT_PUBG_TWITCH_GAME_IDS;
}

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

export type StreamerNameMatch = {
  streamer: ActiveStreamer;
  score: number;
  reasons: string[];
};

function now() {
  return new Date();
}

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripGamingPrefix(value: string) {
  return value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|twitch|tt|live)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|twitch|tt|live)$/g, "");
}

export function normalizePubgNameForStreamerMatch(pubgName: string) {
  return normalizeForCompare(stripGamingPrefix(pubgName));
}

function hasUsableToken(value: string) {
  return value.length >= 4;
}

function buildComparableTokens(value: string) {
  const lower = value.toLowerCase().trim();
  if (!lower) return [];

  const stripped = stripGamingPrefix(lower);
  const compact = normalizeForCompare(stripped);
  const plain = normalizeForCompare(lower);

  return Array.from(new Set([compact, plain])).filter(Boolean);
}

export function scorePubgNameAgainstStreamer(pubgName: string, streamer: ActiveStreamer): StreamerNameMatch | null {
  const pubg = normalizePubgNameForStreamerMatch(pubgName);
  if (!pubg) return null;

  const login = streamer.normalizedLogin;
  const display = streamer.normalizedName;
  const reasons: string[] = [];
  let score = 0;

  if (pubg === login) {
    score += 120;
    reasons.push("exact_login");
  }

  if (pubg === display) {
    score += 100;
    reasons.push("exact_display");
  }

  if (hasUsableToken(pubg) && (login.includes(pubg) || pubg.includes(login))) {
    score += 40;
    reasons.push("login_substring");
  }

  if (hasUsableToken(pubg) && (display.includes(pubg) || pubg.includes(display))) {
    score += 30;
    reasons.push("display_substring");
  }

  const pubgTokens = buildComparableTokens(pubgName);
  const loginTokens = buildComparableTokens(streamer.userLogin);
  const displayTokens = buildComparableTokens(streamer.userName);
  const tokenOverlap = pubgTokens.some(
    (token) => loginTokens.includes(token) || displayTokens.includes(token)
  );
  if (tokenOverlap) {
    score += 20;
    reasons.push("token_overlap");
  }

  if (score <= 0) {
    return null;
  }

  return { streamer, score, reasons };
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
  const refreshStartedAt = Date.now();
  await getState();
  const state = await getState();

  const shouldRefresh =
    options?.force ||
    !state.lastRefreshAt ||
    Date.now() - state.lastRefreshAt.getTime() >= INDEX_REFRESH_INTERVAL_MS;

  if (!shouldRefresh) {
    console.info("[pubg-streamer-index] skip refresh", {
      reason: "interval_not_elapsed",
      lastRefreshAt: state.lastRefreshAt?.toISOString() ?? null,
      force: Boolean(options?.force)
    });
    return { refreshed: false, count: await prisma.pubgActiveStreamer.count() };
  }

  const hasLock = await acquireLock();
  if (!hasLock) {
    console.warn("[pubg-streamer-index] lock unavailable", {
      reason: "refresh_in_progress",
      force: Boolean(options?.force)
    });
    return { refreshed: false, count: await prisma.pubgActiveStreamer.count() };
  }

  try {
    const gameIds = getPubgTwitchGameIds();
    console.info("[pubg-streamer-index] refresh started", {
      force: Boolean(options?.force),
      gameIds
    });

    const streamsByGameId = await Promise.all(
      gameIds.map(async (gameId) => ({
        gameId,
        streams: await getAllLiveStreamsByGameId(gameId, 12)
      }))
    );

    const streamMap = new Map<string, (typeof streamsByGameId)[number]["streams"][number]>();
    for (const batch of streamsByGameId) {
      for (const stream of batch.streams) {
        streamMap.set(stream.user_id, stream);
      }
    }

    const streams = Array.from(streamMap.values());
    const indexedAt = now();
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
      indexedAt,
      updatedAt: indexedAt
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

      await prisma.pubgStreamerProfile.upsert({
        where: { twitchUserId: row.twitchUserId },
        create: {
          twitchUserId: row.twitchUserId,
          userLogin: row.userLogin,
          userName: row.userName,
          normalizedLogin: row.normalizedLogin,
          normalizedName: row.normalizedName,
          firstSeenAt: indexedAt,
          lastSeenAt: indexedAt,
          lastSeenLiveAt: indexedAt,
          isLive: true,
          lastStreamId: row.streamId,
          lastTitle: row.title,
          lastGameId: row.gameId,
          lastStreamStartAt: row.streamStartedAt,
          indexedAt
        },
        update: {
          userLogin: row.userLogin,
          userName: row.userName,
          normalizedLogin: row.normalizedLogin,
          normalizedName: row.normalizedName,
          lastSeenAt: indexedAt,
          lastSeenLiveAt: indexedAt,
          isLive: true,
          lastStreamId: row.streamId,
          lastTitle: row.title,
          lastGameId: row.gameId,
          lastStreamStartAt: row.streamStartedAt,
          indexedAt
        }
      });
    }

    const activeIds = activeRows.map((row) => row.twitchUserId);
    if (activeIds.length) {
      await prisma.pubgStreamerProfile.updateMany({
        where: {
          twitchUserId: { notIn: activeIds },
          isLive: true
        },
        data: {
          isLive: false,
          indexedAt
        }
      });
    } else {
      await prisma.pubgStreamerProfile.updateMany({
        where: { isLive: true },
        data: {
          isLive: false,
          indexedAt
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

    console.info("[pubg-streamer-index] refresh completed", {
      refreshedAt: refreshedAt.toISOString(),
      gameIds,
      gameCounts: streamsByGameId.map((batch) => ({ gameId: batch.gameId, count: batch.streams.length })),
      indexedCount: activeRows.length,
      durationMs: Date.now() - refreshStartedAt
    });

    return {
      refreshed: true,
      count: activeRows.length,
      refreshedAt: refreshedAt.toISOString()
    };
  } catch (error) {
    console.error("[pubg-streamer-index] refresh failed", {
      durationMs: Date.now() - refreshStartedAt,
      error: error instanceof Error ? error.message : String(error)
    });
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
  return streamers
    .map((streamer) => scorePubgNameAgainstStreamer(pubgName, streamer))
    .filter((match): match is StreamerNameMatch => Boolean(match))
    .sort((a, b) => b.score - a.score)
    .map((match) => match.streamer);
}

export async function findMatchedActiveStreamersWithReason(pubgName: string) {
  const streamers = await getActivePubgStreamers();
  return streamers
    .map((streamer) => scorePubgNameAgainstStreamer(pubgName, streamer))
    .filter((match): match is StreamerNameMatch => Boolean(match))
    .sort((a, b) => b.score - a.score);
}

export function doesEncounterOverlapLiveStream(encounterIso: string, streamStartIso: string, graceSeconds = STREAM_OVERLAP_GRACE_SECONDS) {
  const encounterMs = Date.parse(encounterIso);
  const streamStartMs = Date.parse(streamStartIso);
  if (Number.isNaN(encounterMs) || Number.isNaN(streamStartMs)) {
    return false;
  }

  const upperBoundMs = Date.now() + graceSeconds * 1000;
  return encounterMs >= streamStartMs && encounterMs <= upperBoundMs;
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
