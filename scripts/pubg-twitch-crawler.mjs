import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PUBG_GAME_ID = "27971";
const INTERVAL_MS = 300000;
const MAX_RETRIES = 3;

let tokenState = null;

function log(level, message, data = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope: "pubg-twitch-crawler",
    message,
    ...data
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

function getCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID ?? process.env.TWITCH_CLIENT;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? process.env.TWITCH_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch credentials for crawler");
  }

  return { clientId, clientSecret };
}

async function getToken() {
  const now = Date.now();
  if (tokenState && tokenState.expiresAt > now + 60000) {
    return tokenState;
  }

  const { clientId, clientSecret } = getCredentials();
  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST" }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to fetch Twitch app token (${response.status}) ${detail}`);
  }

  const payload = await response.json();
  tokenState = {
    token: payload.access_token,
    clientId,
    expiresAt: now + payload.expires_in * 1000
  };

  return tokenState;
}

function normalizeForCompare(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripGamingPrefix(value) {
  return value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|twitch)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|twitch)$/g, "");
}

async function fetchAllStreams() {
  const { token, clientId } = await getToken();
  const all = [];
  let cursor = "";

  for (let page = 0; page < 12; page += 1) {
    const cursorPart = cursor ? `&after=${encodeURIComponent(cursor)}` : "";
    let response = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      response = await fetch(
        `https://api.twitch.tv/helix/streams?game_id=${PUBG_GAME_ID}&first=100${cursorPart}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Client-Id": clientId
          }
        }
      );

      if (response.ok) {
        break;
      }

      const transient = response.status === 429 || response.status >= 500;
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      log("warn", "stream page request failed", {
        page,
        attempt,
        status: response.status,
        transient,
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0
      });

      if (!transient || attempt >= MAX_RETRIES) {
        const detail = await response.text();
        throw new Error(`Failed to fetch Twitch streams (${response.status}) ${detail}`);
      }

      const waitMs = Math.max(1000, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 1250));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (!response || !response.ok) {
      throw new Error("Failed to fetch Twitch streams after retries");
    }

    const payload = await response.json();
    const data = payload.data ?? [];
    if (!data.length) break;

    all.push(...data);
    cursor = payload.pagination?.cursor ?? "";
    if (!cursor) break;
  }

  return all;
}

async function indexStreams() {
  const startedAt = Date.now();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  log("info", "index run started", { runId, gameId: PUBG_GAME_ID, intervalMs: INTERVAL_MS });
  await prisma.cacheState.upsert({
    where: { key: "pubg:twitch-index" },
    create: {
      key: "pubg:twitch-index",
      refreshInProgress: true,
      refreshStartedAt: new Date()
    },
    update: {
      refreshInProgress: true,
      refreshStartedAt: new Date()
    }
  });

  const streams = await fetchAllStreams();
  const indexedAt = new Date();

  for (const stream of streams) {
    await prisma.pubgActiveStreamer.upsert({
      where: { twitchUserId: stream.user_id },
      create: {
        twitchUserId: stream.user_id,
        streamId: stream.id,
        userLogin: stream.user_login,
        userName: stream.user_name,
        gameId: stream.game_id,
        streamStartedAt: new Date(stream.started_at),
        title: stream.title,
        normalizedLogin: normalizeForCompare(stripGamingPrefix(stream.user_login)),
        normalizedName: normalizeForCompare(stripGamingPrefix(stream.user_name)),
        indexedAt
      },
      update: {
        streamId: stream.id,
        userLogin: stream.user_login,
        userName: stream.user_name,
        gameId: stream.game_id,
        streamStartedAt: new Date(stream.started_at),
        title: stream.title,
        normalizedLogin: normalizeForCompare(stripGamingPrefix(stream.user_login)),
        normalizedName: normalizeForCompare(stripGamingPrefix(stream.user_name)),
        indexedAt
      }
    });
  }

  if (streams.length) {
    await prisma.pubgActiveStreamer.deleteMany({
      where: {
        twitchUserId: {
          notIn: streams.map((stream) => stream.user_id)
        }
      }
    });
  } else {
    await prisma.pubgActiveStreamer.deleteMany();
  }

  await prisma.cacheState.upsert({
    where: { key: "pubg:twitch-index" },
    create: {
      key: "pubg:twitch-index",
      lastRefreshAt: indexedAt,
      refreshInProgress: false,
      refreshStartedAt: null
    },
    update: {
      lastRefreshAt: indexedAt,
      refreshInProgress: false,
      refreshStartedAt: null
    }
  });

  log("info", "index run completed", {
    runId,
    indexedCount: streams.length,
    indexedAt: indexedAt.toISOString(),
    durationMs: Date.now() - startedAt
  });
}

async function runForever() {
  await indexStreams().catch(async (error) => {
    log("error", "startup index failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    await prisma.cacheState.updateMany({
      where: { key: "pubg:twitch-index" },
      data: { refreshInProgress: false, refreshStartedAt: null }
    });
    throw error;
  });

  setInterval(() => {
    indexStreams().catch((error) => {
      log("error", "scheduled refresh failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      prisma.cacheState
        .updateMany({
          where: { key: "pubg:twitch-index" },
          data: { refreshInProgress: false, refreshStartedAt: null }
        })
        .catch((stateError) => {
          log("error", "failed to reset refresh lock after error", {
            error: stateError instanceof Error ? stateError.message : String(stateError)
          });
        });
    });
  }, INTERVAL_MS);
}

const runOnce = process.argv.includes("--once");

if (runOnce) {
  indexStreams()
    .catch((error) => {
      log("error", "one-shot refresh failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
} else {
  runForever().catch((error) => {
    console.error("[pubg-twitch-crawler] startup failed", error);
    process.exitCode = 1;
  });
}
