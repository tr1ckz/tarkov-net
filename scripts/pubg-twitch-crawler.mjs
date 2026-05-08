import { PrismaClient } from "@prisma/client";
import stringSimilarity from "string-similarity";

const prisma = new PrismaClient();
const DEFAULT_PUBG_GAME_IDS = ["493057", "27971"];
const INTERVAL_MS = 300000;
const MAX_RETRIES = 3;
const EVENTSUB_SYNC_INTERVAL_MS = Math.max(300000, Number(process.env.EVENTSUB_SYNC_INTERVAL_MS ?? "1800000"));
const EVENTSUB_SYNC_LIMIT = Math.max(1, Math.min(2000, Number(process.env.EVENTSUB_SYNC_LIMIT ?? "400")));
const EVENTSUB_CREATE_LIMIT_PER_SYNC = Math.max(1, Math.min(500, Number(process.env.EVENTSUB_CREATE_LIMIT_PER_SYNC ?? "80")));
const PROFILE_MAPPING_LIMIT = Math.max(1, Math.min(500, Number(process.env.PUBG_PROFILE_MAPPING_LIMIT ?? "200")));
const KNOWN_PLAYER_MAPPING_LIMIT = Math.max(1, Math.min(500, Number(process.env.PUBG_KNOWN_PLAYER_MAPPING_LIMIT ?? "120")));
const KNOWN_PLAYER_CANDIDATES_LIMIT = Math.max(1000, Math.min(100000, Number(process.env.PUBG_KNOWN_PLAYER_CANDIDATES_LIMIT ?? "30000")));
const KNOWN_PLAYER_SIMILARITY_MIN = Math.max(0.75, Math.min(0.99, Number(process.env.PUBG_KNOWN_PLAYER_SIMILARITY_MIN ?? "0.91")));

let tokenState = null;
let lastEventSubSyncMs = 0;

function getPubgGameIds() {
  const configured = process.env.PUBG_TWITCH_GAME_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return Array.from(new Set(configured));
  }

  return DEFAULT_PUBG_GAME_IDS;
}

async function writeCrawlerRunLog(input) {
  try {
    await prisma.pubgLinkRunLog.create({
      data: {
        source: "crawler-index",
        status: input.status,
        clipsReturned: 0,
        encountersFound: 0,
        errorMessage: input.errorMessage,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
      }
    });
  } catch (error) {
    log("error", "failed to write crawler run log", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

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

function inferEventSubCallbackUrl() {
  const explicit = process.env.TWITCH_EVENTSUB_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.NEXTAUTH_URL?.trim();
  if (!base) return null;

  return `${base.replace(/\/+$/, "")}/api/twitch/eventsub/stream-online`;
}

function shouldAutoSyncEventSub() {
  const toggle = (process.env.AUTO_EVENTSUB_SYNC ?? "1").trim().toLowerCase();
  return toggle !== "0" && toggle !== "false";
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

function normalizeForLinking(value) {
  return normalizeForCompare(stripGamingPrefix(value));
}

function stripGamingPrefix(value) {
  return value
    .toLowerCase()
    // Strip well-known streaming/gaming prefix tags
    .replace(/^(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official)[\s._-]*/g, "")
    // Strip well-known streaming/gaming suffix tags
    .replace(/[\s._-]*(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official|tv)$/g, "")
    // Strip trailing numbers (e.g. player123 → player)
    .replace(/\d+$/, "");
}

function getPubgApiKey() {
  const apiKey = process.env.PUBG_DEV_API ?? process.env.PUBG_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PUBG API key (PUBG_DEV_API or PUBG_API_KEY)");
  }
  return apiKey;
}

async function pubgGet(path) {
  const response = await fetch(`https://api.pubg.com${path}`, {
    headers: {
      Authorization: `Bearer ${getPubgApiKey()}`,
      Accept: "application/vnd.api+json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`PUBG API error (${response.status})`);
  }

  return response.json();
}

function getCandidateShards(platform) {
  if (platform === "xbox") return ["xbox-na", "xbox-eu", "xbox-as", "xbox-oc", "xbox-sa"];
  if (platform === "psn") return ["psn-na", "psn-eu", "psn-as", "psn-oc", "psn-sa"];
  if (platform === "kakao") return ["pc-kakao", "pc-krjp", "pc-as"];
  return ["pc-na", "pc-eu", "pc-as", "pc-kakao", "pc-krjp", "pc-sa", "pc-oc"];
}

async function getPlayerWithMatches(shard, playerName) {
  const payload = await pubgGet(
    `/shards/${encodeURIComponent(shard)}/players?filter[playerNames]=${encodeURIComponent(playerName)}`
  );

  const player = payload.data?.[0];
  if (!player) return null;

  return {
    playerId: player.id,
    playerName: player.attributes?.name ?? playerName,
    matchIds: player.relationships?.matches?.data?.map((entry) => entry.id) ?? []
  };
}

async function lookupPlayerAcrossShards(playerName, platform) {
  const shards = getCandidateShards(platform);
  for (const shard of shards) {
    const player = await getPlayerWithMatches(shard, playerName);
    if (player) {
      return {
        shard,
        playerId: player.playerId,
        playerName: player.playerName,
        matchCount: player.matchIds.length
      };
    }
  }
  return null;
}

function parseUserPubgClaims(user) {
  const claims = [];

  if (user.pubgSteamUser?.trim()) {
    claims.push({ platform: "steam", playerName: user.pubgSteamUser.trim() });
  }
  if (user.pubgXboxUser?.trim()) {
    claims.push({ platform: "xbox", playerName: user.pubgXboxUser.trim() });
  }
  if (user.pubgPsnUser?.trim()) {
    claims.push({ platform: "psn", playerName: user.pubgPsnUser.trim() });
  }
  if (user.pubgKakaoUser?.trim()) {
    claims.push({ platform: "kakao", playerName: user.pubgKakaoUser.trim() });
  }

  return claims;
}

function getBestExactStreamerMatch(streamers, playerName) {
  const normalizedClaim = normalizeForLinking(playerName);
  if (!normalizedClaim) {
    return { status: "none", streamer: null };
  }

  const loginExact = streamers.filter((stream) => stream.normalizedLogin === normalizedClaim);
  if (loginExact.length === 1) {
    return { status: "matched", streamer: loginExact[0], normalizedClaim, reason: "exact_login" };
  }
  if (loginExact.length > 1) {
    return { status: "ambiguous", streamer: null, normalizedClaim, reason: "exact_login_collision" };
  }

  const displayExact = streamers.filter((stream) => stream.normalizedName === normalizedClaim);
  if (displayExact.length === 1) {
    return { status: "matched", streamer: displayExact[0], normalizedClaim, reason: "exact_display" };
  }
  if (displayExact.length > 1) {
    return { status: "ambiguous", streamer: null, normalizedClaim, reason: "exact_display_collision" };
  }

  return { status: "none", streamer: null, normalizedClaim };
}

async function upsertIdentityLinkEvent(input) {
  const dedupeKey = [
    "identity_map",
    input.platform,
    normalizeForCompare(input.pubgNameNormalized || input.pubgPlayerName || ""),
    input.twitchUserId
  ].join(":");

  try {
    await prisma.pubgLinkEvent.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        eventType: "identity_map",
        pubgNameRaw: input.pubgPlayerName,
        pubgNameNormalized: input.pubgNameNormalized,
        twitchUserId: input.twitchUserId,
        twitchUserLogin: input.twitchUserLogin,
        twitchUserName: input.twitchUserName,
        shard: input.shard,
        platform: input.platform
      },
      update: {
        pubgNameRaw: input.pubgPlayerName,
        pubgNameNormalized: input.pubgNameNormalized,
        twitchUserLogin: input.twitchUserLogin,
        twitchUserName: input.twitchUserName,
        shard: input.shard,
        platform: input.platform
      }
    });
  } catch (error) {
    log("warn", "identity map link event upsert failed", {
      twitchUserId: input.twitchUserId,
      twitchUserLogin: input.twitchUserLogin,
      pubgPlayerName: input.pubgPlayerName,
      platform: input.platform,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function resolvePubgPlayerIdentity({ playerName, platform, preferredShard }, cache) {
  const lowerName = String(playerName ?? "").toLowerCase();
  const scopedKey = `${platform}:${preferredShard || "*"}:${lowerName}`;
  if (cache.has(scopedKey)) {
    return cache.get(scopedKey);
  }

  let resolved = null;

  if (preferredShard) {
    try {
      const scoped = await getPlayerWithMatches(preferredShard, playerName);
      if (scoped) {
        resolved = {
          shard: preferredShard,
          playerId: scoped.playerId,
          playerName: scoped.playerName,
          matchCount: scoped.matchIds.length
        };
      }
    } catch {
      // fallback below
    }
  }

  if (!resolved) {
    resolved = await lookupPlayerAcrossShards(playerName, platform);
  }

  cache.set(scopedKey, resolved);
  return resolved;
}

async function reconcileProfileIdentityLinks(streams) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { pubgSteamUser: { not: null } },
        { pubgXboxUser: { not: null } },
        { pubgPsnUser: { not: null } },
        { pubgKakaoUser: { not: null } }
      ]
    },
    select: {
      id: true,
      pubgSteamUser: true,
      pubgXboxUser: true,
      pubgPsnUser: true,
      pubgKakaoUser: true
    },
    take: PROFILE_MAPPING_LIMIT
  });

  const lookupCache = new Map();
  let claimsScanned = 0;
  let exactMatches = 0;
  let ambiguousMatches = 0;
  let lookupMisses = 0;
  let identityLinksUpserted = 0;
  let linkEventsUpserted = 0;

  for (const user of users) {
    const claims = parseUserPubgClaims(user);
    for (const claim of claims) {
      claimsScanned += 1;

      const match = getBestExactStreamerMatch(streams, claim.playerName);
      if (match.status === "ambiguous") {
        ambiguousMatches += 1;
        continue;
      }
      if (match.status !== "matched" || !match.streamer) {
        continue;
      }

      exactMatches += 1;
      let resolved = null;
      try {
        resolved = await resolvePubgPlayerIdentity(
          { playerName: claim.playerName, platform: claim.platform },
          lookupCache
        );
      } catch (error) {
        log("warn", "profile mapping pubg lookup failed", {
          userId: user.id,
          platform: claim.platform,
          playerName: claim.playerName,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      if (!resolved) {
        lookupMisses += 1;
        continue;
      }

      await prisma.pubgStreamerIdentityLink.upsert({
        where: {
          twitchUserId_platform: {
            twitchUserId: match.streamer.user_id,
            platform: claim.platform
          }
        },
        create: {
          twitchUserId: match.streamer.user_id,
          twitchUserLogin: match.streamer.user_login,
          twitchUserName: match.streamer.user_name,
          platform: claim.platform,
          shard: resolved.shard,
          pubgPlayerId: resolved.playerId,
          pubgPlayerName: resolved.playerName,
          pubgNameNormalized: match.normalizedClaim,
          confidenceScore: 130,
          confidenceReasonsJson: JSON.stringify(["profile_claim", match.reason]),
          source: "profile_claim",
          firstLinkedAt: new Date(),
          lastLinkedAt: new Date()
        },
        update: {
          twitchUserLogin: match.streamer.user_login,
          twitchUserName: match.streamer.user_name,
          shard: resolved.shard,
          pubgPlayerId: resolved.playerId,
          pubgPlayerName: resolved.playerName,
          pubgNameNormalized: match.normalizedClaim,
          confidenceScore: 130,
          confidenceReasonsJson: JSON.stringify(["profile_claim", match.reason]),
          source: "profile_claim",
          lastLinkedAt: new Date()
        }
      });

      identityLinksUpserted += 1;

      await upsertIdentityLinkEvent({
        twitchUserId: match.streamer.user_id,
        twitchUserLogin: match.streamer.user_login,
        twitchUserName: match.streamer.user_name,
        platform: claim.platform,
        shard: resolved.shard,
        pubgPlayerName: resolved.playerName,
        pubgNameNormalized: match.normalizedClaim
      });
      linkEventsUpserted += 1;
    }
  }

  log("info", "profile mapping completed", {
    usersScanned: users.length,
    claimsScanned,
    exactMatches,
    ambiguousMatches,
    lookupMisses,
    identityLinksUpserted,
    linkEventsUpserted,
    limit: PROFILE_MAPPING_LIMIT
  });

  return {
    usersScanned: users.length,
    claimsScanned,
    exactMatches,
    ambiguousMatches,
    lookupMisses,
    identityLinksUpserted,
    linkEventsUpserted,
    limit: PROFILE_MAPPING_LIMIT
  };
}

function chooseBestKnownPlayerMatch(stream, knownPlayersByPrefix) {
  const loginNorm = normalizeForLinking(stream.user_login || "");
  const nameNorm = normalizeForLinking(stream.user_name || "");
  const keys = Array.from(new Set([loginNorm.slice(0, 2), nameNorm.slice(0, 2)].filter((k) => k.length === 2)));

  const candidates = [];
  for (const key of keys) {
    const rows = knownPlayersByPrefix.get(key);
    if (rows && rows.length) candidates.push(...rows);
  }

  if (!candidates.length) return null;

  let best = null;
  let second = null;
  for (const row of candidates) {
    const scoreLogin = loginNorm ? stringSimilarity.compareTwoStrings(loginNorm, row.normalized) : 0;
    const scoreName = nameNorm ? stringSimilarity.compareTwoStrings(nameNorm, row.normalized) : 0;
    const similarity = Math.max(scoreLogin, scoreName);
    if (similarity < KNOWN_PLAYER_SIMILARITY_MIN) continue;

    const candidate = {
      row,
      similarity,
      matcher: scoreLogin >= scoreName ? "login" : "display"
    };

    if (!best || candidate.similarity > best.similarity) {
      second = best;
      best = candidate;
    } else if (!second || candidate.similarity > second.similarity) {
      second = candidate;
    }
  }

  if (!best) return null;
  if (second && best.similarity - second.similarity < 0.04) {
    return null;
  }

  return best;
}

async function reconcileKnownPlayerIdentityLinks(streams) {
  const [knownPlayers, existingLinks] = await Promise.all([
    prisma.pubgKnownPlayer.findMany({
      orderBy: [{ lastSeenAt: "desc" }, { seenCount: "desc" }],
      take: KNOWN_PLAYER_CANDIDATES_LIMIT,
      select: {
        playerName: true,
        platform: true,
        shard: true,
        seenCount: true,
        lastSeenAt: true
      }
    }),
    prisma.pubgStreamerIdentityLink.findMany({
      select: { twitchUserId: true, platform: true }
    })
  ]);

  const existing = new Set(existingLinks.map((row) => `${row.twitchUserId}:${row.platform}`));

  const knownPlayersByPrefix = new Map();
  for (const row of knownPlayers) {
    const normalized = normalizeForLinking(row.playerName);
    if (!normalized || normalized.length < 4) continue;
    const key = normalized.slice(0, 2);
    const next = {
      ...row,
      normalized
    };
    if (!knownPlayersByPrefix.has(key)) {
      knownPlayersByPrefix.set(key, [next]);
    } else {
      knownPlayersByPrefix.get(key).push(next);
    }
  }

  const lookupCache = new Map();
  let scanned = 0;
  let candidatesFound = 0;
  let ambiguousSkipped = 0;
  let lookupMisses = 0;
  let upserted = 0;
  let linkEventsUpserted = 0;

  const boundedStreams = streams.slice(0, KNOWN_PLAYER_MAPPING_LIMIT);
  for (const stream of boundedStreams) {
    scanned += 1;
    const best = chooseBestKnownPlayerMatch(stream, knownPlayersByPrefix);
    if (!best) {
      ambiguousSkipped += 1;
      continue;
    }

    candidatesFound += 1;
    const existingKey = `${stream.user_id}:${best.row.platform}`;
    if (existing.has(existingKey)) {
      continue;
    }

    let resolved = null;
    try {
      resolved = await resolvePubgPlayerIdentity(
        {
          playerName: best.row.playerName,
          platform: best.row.platform,
          preferredShard: best.row.shard
        },
        lookupCache
      );
    } catch (error) {
      log("warn", "known-player mapping pubg lookup failed", {
        twitchUserId: stream.user_id,
        twitchUserLogin: stream.user_login,
        pubgPlayerName: best.row.playerName,
        platform: best.row.platform,
        shard: best.row.shard,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (!resolved) {
      lookupMisses += 1;
      continue;
    }

    const normalizedPubg = normalizeForLinking(resolved.playerName || best.row.playerName);
    await prisma.pubgStreamerIdentityLink.upsert({
      where: {
        twitchUserId_platform: {
          twitchUserId: stream.user_id,
          platform: best.row.platform
        }
      },
      create: {
        twitchUserId: stream.user_id,
        twitchUserLogin: stream.user_login,
        twitchUserName: stream.user_name,
        platform: best.row.platform,
        shard: resolved.shard,
        pubgPlayerId: resolved.playerId,
        pubgPlayerName: resolved.playerName,
        pubgNameNormalized: normalizedPubg,
        confidenceScore: Math.round(best.similarity * 100),
        confidenceReasonsJson: JSON.stringify([
          "known_player_index",
          `matcher_${best.matcher}`,
          `similarity_${Math.round(best.similarity * 100)}pct`
        ]),
        source: "known_player_index",
        firstLinkedAt: new Date(),
        lastLinkedAt: new Date()
      },
      update: {
        twitchUserLogin: stream.user_login,
        twitchUserName: stream.user_name,
        shard: resolved.shard,
        pubgPlayerId: resolved.playerId,
        pubgPlayerName: resolved.playerName,
        pubgNameNormalized: normalizedPubg,
        confidenceScore: Math.round(best.similarity * 100),
        confidenceReasonsJson: JSON.stringify([
          "known_player_index",
          `matcher_${best.matcher}`,
          `similarity_${Math.round(best.similarity * 100)}pct`
        ]),
        source: "known_player_index",
        lastLinkedAt: new Date()
      }
    });
    existing.add(existingKey);
    upserted += 1;

    await upsertIdentityLinkEvent({
      twitchUserId: stream.user_id,
      twitchUserLogin: stream.user_login,
      twitchUserName: stream.user_name,
      platform: best.row.platform,
      shard: resolved.shard,
      pubgPlayerName: resolved.playerName,
      pubgNameNormalized: normalizedPubg
    });
    linkEventsUpserted += 1;
  }

  log("info", "known-player mapping completed", {
    scanned,
    candidatesFound,
    ambiguousSkipped,
    lookupMisses,
    upserted,
    linkEventsUpserted,
    streamLimit: KNOWN_PLAYER_MAPPING_LIMIT,
    candidatePool: KNOWN_PLAYER_CANDIDATES_LIMIT,
    similarityMin: KNOWN_PLAYER_SIMILARITY_MIN
  });

  return {
    scanned,
    candidatesFound,
    ambiguousSkipped,
    lookupMisses,
    upserted,
    linkEventsUpserted,
    streamLimit: KNOWN_PLAYER_MAPPING_LIMIT,
    candidatePool: KNOWN_PLAYER_CANDIDATES_LIMIT,
    similarityMin: KNOWN_PLAYER_SIMILARITY_MIN
  };
}

async function fetchAllStreamsForGameId(gameId) {
  const { token, clientId } = await getToken();
  const all = [];
  let cursor = "";

  for (let page = 0; page < 12; page += 1) {
    const cursorPart = cursor ? `&after=${encodeURIComponent(cursor)}` : "";
    let response = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      response = await fetch(
        `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=100${cursorPart}`,
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

async function fetchAllStreams() {
  const gameIds = getPubgGameIds();
  const byGame = await Promise.all(
    gameIds.map(async (gameId) => ({
      gameId,
      streams: await fetchAllStreamsForGameId(gameId)
    }))
  );

  const uniqueByUserId = new Map();
  for (const batch of byGame) {
    for (const stream of batch.streams) {
      uniqueByUserId.set(String(stream.user_id), stream);
    }
  }

  return {
    gameIds,
    gameCounts: byGame.map((batch) => ({ gameId: batch.gameId, count: batch.streams.length })),
    streams: Array.from(uniqueByUserId.values())
  };
}

async function fetchAllEventSubStreamOnlineBroadcasterIds() {
  const { token, clientId } = await getToken();
  const ids = new Set();
  let cursor = "";

  for (let page = 0; page < 40; page += 1) {
    const cursorPart = cursor ? `&after=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(
      `https://api.twitch.tv/helix/eventsub/subscriptions?type=stream.online&first=100${cursorPart}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId
        }
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Failed to list EventSub subscriptions (${response.status}) ${detail}`);
    }

    const payload = await response.json();
    const data = payload.data ?? [];
    for (const sub of data) {
      const broadcasterId = sub?.condition?.broadcaster_user_id;
      if (broadcasterId) {
        ids.add(String(broadcasterId));
      }
    }

    cursor = payload.pagination?.cursor ?? "";
    if (!cursor) break;
  }

  return ids;
}

async function createEventSubStreamOnlineSubscription(broadcasterUserId, callbackUrl, secret) {
  const { token, clientId } = await getToken();
  const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "stream.online",
      version: "1",
      condition: {
        broadcaster_user_id: broadcasterUserId
      },
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to create EventSub subscription (${response.status}) ${detail}`);
  }

  const payload = await response.json();
  return payload.data?.[0] ?? null;
}

async function syncEventSubSubscriptions(streams) {
  if (!shouldAutoSyncEventSub()) {
    return;
  }

  const now = Date.now();
  if (now - lastEventSubSyncMs < EVENTSUB_SYNC_INTERVAL_MS) {
    return;
  }

  const callbackUrl = inferEventSubCallbackUrl();
  const eventSubSecret = process.env.TWITCH_EVENTSUB_SECRET?.trim();
  if (!callbackUrl || !eventSubSecret) {
    log("warn", "eventsub sync skipped", {
      reason: "missing_callback_or_secret",
      hasCallbackUrl: Boolean(callbackUrl),
      hasEventSubSecret: Boolean(eventSubSecret)
    });
    lastEventSubSyncMs = now;
    return;
  }

  const knownProfiles = await prisma.pubgStreamerProfile.findMany({
    where: { twitchUserId: { not: "" } },
    select: { twitchUserId: true },
    orderBy: { lastSeenAt: "desc" },
    take: EVENTSUB_SYNC_LIMIT
  });

  const candidateIds = new Set(knownProfiles.map((row) => row.twitchUserId));
  for (const stream of streams) {
    if (stream?.user_id) {
      candidateIds.add(String(stream.user_id));
    }
  }

  if (!candidateIds.size) {
    log("info", "eventsub sync skipped", { reason: "no_candidate_ids" });
    lastEventSubSyncMs = now;
    return;
  }

  const existingIds = await fetchAllEventSubStreamOnlineBroadcasterIds();
  const missingIds = Array.from(candidateIds).filter((id) => !existingIds.has(id));
  const plannedCreates = missingIds.slice(0, EVENTSUB_CREATE_LIMIT_PER_SYNC);

  let created = 0;
  let failed = 0;
  for (const broadcasterId of plannedCreates) {
    try {
      await createEventSubStreamOnlineSubscription(broadcasterId, callbackUrl, eventSubSecret);
      created += 1;
    } catch (error) {
      failed += 1;
      log("warn", "eventsub create failed", {
        broadcasterId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  lastEventSubSyncMs = now;
  log("info", "eventsub sync completed", {
    callbackUrl,
    knownProfiles: knownProfiles.length,
    activeStreams: streams.length,
    candidateCount: candidateIds.size,
    existingCount: existingIds.size,
    missingCount: missingIds.length,
    plannedCreates: plannedCreates.length,
    created,
    failed,
    syncIntervalMs: EVENTSUB_SYNC_INTERVAL_MS
  });
}

async function indexStreams() {
  const startedAt = Date.now();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const gameIds = getPubgGameIds();

  log("info", "index run started", { runId, gameIds, intervalMs: INTERVAL_MS });
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

  const streamPayload = await fetchAllStreams();
  const streams = streamPayload.streams;
  const indexedAt = new Date();
  let profileMappingSummary = {
    usersScanned: 0,
    claimsScanned: 0,
    exactMatches: 0,
    ambiguousMatches: 0,
    lookupMisses: 0,
    identityLinksUpserted: 0,
    linkEventsUpserted: 0,
    limit: PROFILE_MAPPING_LIMIT
  };
  let knownPlayerMappingSummary = {
    scanned: 0,
    candidatesFound: 0,
    ambiguousSkipped: 0,
    lookupMisses: 0,
    upserted: 0,
    linkEventsUpserted: 0,
    streamLimit: KNOWN_PLAYER_MAPPING_LIMIT,
    candidatePool: KNOWN_PLAYER_CANDIDATES_LIMIT,
    similarityMin: KNOWN_PLAYER_SIMILARITY_MIN
  };

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

  try {
    await syncEventSubSubscriptions(streams);
  } catch (error) {
    log("error", "eventsub sync failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    profileMappingSummary = await reconcileProfileIdentityLinks(streams);
  } catch (error) {
    log("error", "profile mapping failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    knownPlayerMappingSummary = await reconcileKnownPlayerIdentityLinks(streams);
  } catch (error) {
    log("error", "known-player mapping failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Run discovery worker (self-throttled to DISCOVERY_INTERVAL_MS, default 1 hour)
  try {
    await runDiscoveryWorker();
  } catch (error) {
    log("error", "discovery worker failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log("info", "index run completed", {
    runId,
    gameIds: streamPayload.gameIds,
    gameCounts: streamPayload.gameCounts,
    indexedCount: streams.length,
    indexedAt: indexedAt.toISOString(),
    durationMs: Date.now() - startedAt
  });

  await writeCrawlerRunLog({
    status: "ok",
    metadata: {
      runId,
      gameIds: streamPayload.gameIds,
      gameCounts: streamPayload.gameCounts,
      indexedCount: streams.length,
      indexedAt: indexedAt.toISOString(),
      durationMs: Date.now() - startedAt,
      eventSubSyncIntervalMs: EVENTSUB_SYNC_INTERVAL_MS,
      profileMapping: profileMappingSummary,
      knownPlayerMapping: knownPlayerMappingSummary
    }
  });
}

// ─── DISCOVERY WORKER ────────────────────────────────────────────────────────
// Polls the PUBG /samples endpoint hourly to build a local player name index.
// This enables fast case-insensitive search without hitting the PUBG API live.

const DISCOVERY_INTERVAL_MS = Number(process.env.PUBG_DISCOVERY_INTERVAL_MS ?? "3600000"); // 1 hour
const DISCOVERY_MATCHES_PER_RUN = Math.max(1, Math.min(100, Number(process.env.PUBG_DISCOVERY_MATCHES ?? "50")));
const DISCOVERY_SHARDS = (process.env.PUBG_DISCOVERY_SHARDS ?? "pc-na,pc-eu,pc-as").split(",").map((s) => s.trim()).filter(Boolean);
let lastDiscoveryMs = 0;

async function fetchSampleMatchIds(shard) {
  try {
    const payload = await pubgGet(`/shards/${encodeURIComponent(shard)}/samples`);
    return (payload.data?.relationships?.matches?.data ?? []).map((m) => m.id);
  } catch (error) {
    log("warn", "discovery: samples fetch failed", {
      shard,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

async function fetchMatchParticipantNames(shard, matchId) {
  try {
    const payload = await pubgGet(`/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`);
    const names = [];
    for (const item of payload.included ?? []) {
      if (item.type === "participant") {
        const name = item.attributes?.stats?.name;
        if (name && typeof name === "string" && name.trim().length > 0) {
          names.push(name.trim());
        }
      }
    }
    return names;
  } catch {
    return [];
  }
}

async function runDiscoveryWorker() {
  const now = Date.now();
  const shouldRun = now - lastDiscoveryMs >= DISCOVERY_INTERVAL_MS;
  if (!shouldRun) return;

  lastDiscoveryMs = now;
  const startedAt = Date.now();
  log("info", "discovery: started", { shards: DISCOVERY_SHARDS, matchesPerRun: DISCOVERY_MATCHES_PER_RUN });

  let totalNames = 0;
  let totalUpserted = 0;

  for (const shard of DISCOVERY_SHARDS) {
    const platform = shard.startsWith("xbox") ? "xbox" : shard.startsWith("psn") ? "psn" : "steam";
    let matchIds = await fetchSampleMatchIds(shard);
    if (matchIds.length === 0) continue;

    // Shuffle and cap so we don't hammer the API
    matchIds = matchIds.sort(() => Math.random() - 0.5).slice(0, DISCOVERY_MATCHES_PER_RUN);

    for (const matchId of matchIds) {
      const names = await fetchMatchParticipantNames(shard, matchId);
      if (names.length === 0) continue;
      totalNames += names.length;

      // Batch upsert names
      for (const name of names) {
        try {
          await prisma.pubgKnownPlayer.upsert({
            where: { playerName_platform_shard: { playerName: name, platform, shard } },
            create: {
              playerName: name,
              playerNameLower: name.toLowerCase(),
              platform,
              shard,
              seenCount: 1
            },
            update: {
              playerNameLower: name.toLowerCase(),
              lastSeenAt: new Date(),
              seenCount: { increment: 1 }
            }
          });
          totalUpserted += 1;
        } catch {
          // ignore individual upsert failures
        }
      }

      // Small delay between match fetches to respect PUBG rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  log("info", "discovery: completed", {
    shards: DISCOVERY_SHARDS,
    totalNamesFound: totalNames,
    totalUpserted,
    durationMs: Date.now() - startedAt
  });
}

async function runForever() {
  await indexStreams().catch(async (error) => {
    log("error", "startup index failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    await writeCrawlerRunLog({
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { stage: "startup" }
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
      void writeCrawlerRunLog({
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { stage: "scheduled_refresh" }
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
      void writeCrawlerRunLog({
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { stage: "one_shot" }
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
