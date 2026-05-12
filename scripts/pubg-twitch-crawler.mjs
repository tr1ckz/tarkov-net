import { PrismaClient } from "@prisma/client";
import stringSimilarity from "string-similarity";
import { createScriptLogger } from "./logging.mjs";

const prisma = new PrismaClient();
const logger = createScriptLogger("pubg-twitch-crawler", {
  envKeys: ["PUBG_CRAWLER_LOG_LEVEL"],
});
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
const INTERACTION_BACKFILL_ENABLED = (process.env.PUBG_INTERACTION_BACKFILL_ENABLED ?? "1").trim() !== "0";
const INTERACTION_BACKFILL_STREAMERS = Math.max(1, Math.min(200, Number(process.env.PUBG_INTERACTION_BACKFILL_STREAMERS ?? "30")));
const INTERACTION_BACKFILL_MATCHES = Math.max(1, Math.min(20, Number(process.env.PUBG_INTERACTION_BACKFILL_MATCHES ?? "6")));
const INTERACTION_BACKFILL_VODS = Math.max(1, Math.min(20, Number(process.env.PUBG_INTERACTION_BACKFILL_VODS ?? "12")));
const BACKLOG_RETRY_MINUTES = Math.max(10, Math.min(720, Number(process.env.PUBG_BACKLOG_RETRY_MINUTES ?? "60")));
const PUBG_RATE_LIMIT_FALLBACK_MS = Math.max(15000, Math.min(300000, Number(process.env.PUBG_RATE_LIMIT_FALLBACK_MS ?? "60000")));
const IDENTITY_VALIDATION_BATCH = Math.max(1, Math.min(500, Number(process.env.PUBG_IDENTITY_VALIDATION_BATCH ?? "120")));
const IDENTITY_VALIDATION_NOT_FOUND_RETRY_LIMIT = Math.max(1, Math.min(10, Number(process.env.PUBG_IDENTITY_VALIDATION_NOT_FOUND_RETRY_LIMIT ?? "4")));

let tokenState = null;
let lastEventSubSyncMs = 0;
let pubgUnauthorizedError = null;
let pubgRateLimitedUntil = 0;

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

async function upsertIndexBacklogCandidate(input) {
  try {
    const existing = await prisma.pubgIndexBacklog.findUnique({
      where: { twitchUserId: input.twitchUserId },
      select: {
        attempts: true,
        reason: true,
        lastAttemptAt: true,
        status: true
      }
    });

    const now = Date.now();
    const lastAttemptMs = existing?.lastAttemptAt ? new Date(existing.lastAttemptAt).getTime() : 0;
    const shouldIncrementAttempts = !existing?.lastAttemptAt || now - lastAttemptMs >= BACKLOG_RETRY_MINUTES * 60_000;

    const updateData = {
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      status: "pending",
      reason: input.reason,
      lastSeenAt: new Date(),
      lastAttemptAt: new Date(),
      platformHint: input.platformHint ?? null,
      shardHint: input.shardHint ?? null,
      pubgPlayerNameHint: input.pubgPlayerNameHint ?? null,
      identityLinkId: input.identityLinkId ?? null,
      resolvedAt: null,
      resolutionNote: null
    };

    if (shouldIncrementAttempts) {
      updateData.attempts = { increment: 1 };
    }

    await prisma.pubgIndexBacklog.upsert({
      where: { twitchUserId: input.twitchUserId },
      create: {
        twitchUserId: input.twitchUserId,
        twitchUserLogin: input.twitchUserLogin,
        twitchUserName: input.twitchUserName,
        status: "pending",
        reason: input.reason,
        attempts: 1,
        lastSeenAt: new Date(),
        lastAttemptAt: new Date(),
        platformHint: input.platformHint ?? null,
        shardHint: input.shardHint ?? null,
        pubgPlayerNameHint: input.pubgPlayerNameHint ?? null,
        identityLinkId: input.identityLinkId ?? null
      },
      update: updateData
    });
  } catch (error) {
    log("warn", "failed to upsert index backlog candidate", {
      twitchUserId: input.twitchUserId,
      twitchUserLogin: input.twitchUserLogin,
      reason: input.reason,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function resolveIndexBacklogCandidate(twitchUserId, note) {
  try {
    await prisma.pubgIndexBacklog.updateMany({
      where: { twitchUserId },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolutionNote: String(note || "indexed").slice(0, 500),
        lastSeenAt: new Date()
      }
    });
  } catch (error) {
    log("warn", "failed to resolve index backlog candidate", {
      twitchUserId,
      note,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function cleanupResolvedIndexBacklog() {
  try {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = await prisma.pubgIndexBacklog.deleteMany({
      where: {
        status: "resolved",
        resolvedAt: { lt: cutoff }
      }
    });
    return result.count;
  } catch (error) {
    log("warn", "failed to cleanup resolved index backlog", {
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

function isSyntheticPlayerId(playerId) {
  return (
    String(playerId || "").startsWith("unverified:") ||
    String(playerId || "").startsWith("profile-claim:") ||
    String(playerId || "").startsWith("login-heuristic:") ||
    String(playerId || "").startsWith("autolink:")
  );
}

function isWeakValidationTarget(link) {
  return (
    isSyntheticPlayerId(link.pubgPlayerId) ||
    link.source === "eventsub_login_heuristic" ||
    link.source === "eventsub_profile_claim" ||
    link.source === "eventsub_known_player_unverified" ||
    link.source === "eventsub_login_heuristic_unverified"
  );
}

function parsePlatform(value) {
  if (value === "steam" || value === "xbox" || value === "psn") return value;
  return null;
}

async function resolveIdentityValidationCandidate(link, platform) {
  const candidateNames = Array.from(
    new Set([
      String(link.pubgPlayerName || "").trim(),
      stripGamingPrefix(String(link.pubgPlayerName || "").trim())
    ].filter(Boolean))
  );

  for (const candidateName of candidateNames) {
    if (link.shard) {
      const preferred = await getPlayerWithMatches(link.shard, candidateName).catch(() => null);
      if (preferred) {
        return {
          shard: link.shard,
          playerId: preferred.playerId,
          playerName: preferred.playerName,
          matchCount: preferred.matchIds.length
        };
      }
    }

    const crossShard = await lookupPlayerAcrossShards(candidateName, platform).catch(() => null);
    if (crossShard) {
      return crossShard;
    }
  }

  return null;
}

async function processIdentityValidationQueue(limit = IDENTITY_VALIDATION_BATCH) {
  const now = new Date();

  // Drop queued jobs referencing deleted identity links so they never clog processing again.
  const orphanedDeleted = Number(
    await prisma.$executeRaw`
      DELETE FROM "PubgIdentityValidationQueue"
      WHERE status = 'queued'
        AND NOT EXISTS (
          SELECT 1
          FROM "PubgStreamerIdentityLink" l
          WHERE l.id = "PubgIdentityValidationQueue"."identityLinkId"
        )
    `
  );

  const queuedRows = await prisma.$queryRaw`
    SELECT q.id
    FROM "PubgIdentityValidationQueue" q
    INNER JOIN "PubgStreamerIdentityLink" l ON l.id = q."identityLinkId"
    WHERE q.status = 'queued'
      AND (q."nextAttemptAt" IS NULL OR q."nextAttemptAt" <= ${now})
    ORDER BY q."queuedAt" ASC
    LIMIT ${limit}
  `;

  const jobIds = Array.isArray(queuedRows)
    ? queuedRows.map((row) => String(row.id || "")).filter(Boolean)
    : [];

  const jobs = jobIds.length
    ? await prisma.pubgIdentityValidationQueue.findMany({
        where: { id: { in: jobIds } },
        orderBy: [{ queuedAt: "asc" }],
      })
    : [];

  if (!jobs.length) {
    return { processed: 0, completed: 0, invalid: 0, errored: 0, retried: 0, orphanedDeleted };
  }

  const summary = { processed: jobs.length, completed: 0, invalid: 0, errored: 0, retried: 0, orphanedDeleted };

  for (const job of jobs) {
    const attempts = (job.attempts || 0) + 1;
    await prisma.pubgIdentityValidationQueue.update({
      where: { id: job.id },
      data: { status: "processing", attempts, startedAt: new Date(), lastError: null }
    });

    try {
      const link = await prisma.pubgStreamerIdentityLink.findUnique({ where: { id: job.identityLinkId } });
      if (!link) {
        // This should be rare due to join prefilter; hard-delete to prevent queue churn.
        await prisma.pubgIdentityValidationQueue.deleteMany({ where: { id: job.id } });
        summary.orphanedDeleted += 1;
        continue;
      }

      if (!isWeakValidationTarget(link)) {
        summary.completed += 1;
        await prisma.pubgIdentityValidationQueue.update({
          where: { id: job.id },
          data: {
            status: "completed",
            lastError: "trusted_source_skipped",
            completedAt: new Date(),
          }
        });
        continue;
      }

      const platform = parsePlatform(link.platform);
      if (!platform) {
        summary.invalid += 1;
        await prisma.pubgIdentityValidationQueue.update({
          where: { id: job.id },
          data: {
            status: "invalid",
            lastError: "unsupported_platform",
            completedAt: new Date(),
          }
        });
        continue;
      }

      const resolved = await resolveIdentityValidationCandidate(link, platform);
      if (!resolved) {
        const notFoundShouldRetry = attempts < IDENTITY_VALIDATION_NOT_FOUND_RETRY_LIMIT;
        if (notFoundShouldRetry) {
          summary.retried += 1;
        } else {
          summary.invalid += 1;
        }

        const retryDelayMinutes = Math.min(60, 5 * Math.max(1, attempts));
        await prisma.pubgIdentityValidationQueue.update({
          where: { id: job.id },
          data: {
            status: notFoundShouldRetry ? "queued" : "invalid",
            lastError: notFoundShouldRetry ? "player_not_found_retrying" : "player_not_found",
            nextAttemptAt: notFoundShouldRetry ? new Date(Date.now() + retryDelayMinutes * 60 * 1000) : null,
            completedAt: notFoundShouldRetry ? null : new Date(),
          }
        });
        continue;
      }

      const synthetic = isSyntheticPlayerId(link.pubgPlayerId);
      const idMismatch = !synthetic && resolved.playerId !== link.pubgPlayerId;

      if (idMismatch) {
        summary.invalid += 1;
        await prisma.pubgIdentityValidationQueue.update({
          where: { id: job.id },
          data: {
            status: "invalid",
            lastError: `player_id_mismatch:${link.pubgPlayerId}->${resolved.playerId}`,
            lastValidatedPubgId: resolved.playerId,
            lastValidatedPubgName: resolved.playerName,
            lastValidatedShard: resolved.shard,
            completedAt: new Date(),
          }
        });
        continue;
      }

      const currentReasons = (() => {
        if (!link.confidenceReasonsJson) return [];
        try {
          const parsed = JSON.parse(link.confidenceReasonsJson);
          return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
        } catch {
          return [];
        }
      })();
      const reasonsSet = new Set([...currentReasons, "validated_by_job_pubg_api"]);

      await prisma.pubgStreamerIdentityLink.update({
        where: { id: link.id },
        data: {
          pubgPlayerId: resolved.playerId,
          pubgPlayerName: resolved.playerName,
          shard: resolved.shard,
          source: synthetic ? "identity_validation_promoted" : link.source,
          confidenceScore: synthetic ? Math.max(link.confidenceScore || 0, 95) : link.confidenceScore,
          confidenceReasonsJson: JSON.stringify(Array.from(reasonsSet)),
          lastLinkedAt: new Date(),
        }
      });

      summary.completed += 1;
      await prisma.pubgIdentityValidationQueue.update({
        where: { id: job.id },
        data: {
          status: "completed",
          lastError: null,
          completedAt: new Date(),
          lastValidatedPubgId: resolved.playerId,
          lastValidatedPubgName: resolved.playerName,
          lastValidatedShard: resolved.shard,
        }
      });
    } catch (error) {
      summary.errored += 1;
      const message = error instanceof Error ? error.message : String(error);
      const maxAttempts = Math.max(1, Number(job.maxAttempts || 3));
      const shouldRetry = attempts < maxAttempts;
      if (shouldRetry) {
        summary.retried += 1;
      }

      await prisma.pubgIdentityValidationQueue.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? "queued" : "error",
          lastError: message.slice(0, 500),
          nextAttemptAt: shouldRetry ? new Date(Date.now() + 5 * 60 * 1000) : null,
          completedAt: shouldRetry ? null : new Date(),
        }
      });
    }
  }

  return summary;
}

function log(level, message, data = {}) {
  if (level === "verbose") {
    logger.verbose(message, data);
    return;
  }

  if (level === "debug") {
    logger.debug(message, data);
    return;
  }

  if (level === "error") {
    logger.error(message, data);
    return;
  }

  if (level === "warn") {
    logger.warn(message, data);
    return;
  }

  logger.info(message, data);
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

function getPubgRateLimitBackoffMs(response) {
  const retryAfterRaw = Number(response.headers.get("retry-after") ?? "0");
  if (Number.isFinite(retryAfterRaw) && retryAfterRaw > 0) {
    return Math.max(1000, Math.min(retryAfterRaw * 1000, 300000));
  }
  return PUBG_RATE_LIMIT_FALLBACK_MS;
}

function isPubgRateLimitError(error) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PUBG API error (429)") || message.includes("PUBG API rate limited");
}

async function pubgGet(path) {
  if (pubgUnauthorizedError) {
    throw new Error(pubgUnauthorizedError);
  }

  if (pubgRateLimitedUntil > Date.now()) {
    throw new Error(`PUBG API rate limited until ${new Date(pubgRateLimitedUntil).toISOString()}`);
  }

  log("verbose", "pubg api request", { path });

  const response = await fetch(`https://api.pubg.com${path}`, {
    headers: {
      Authorization: `Bearer ${getPubgApiKey()}`,
      Accept: "application/vnd.api+json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    log("debug", "pubg api non-ok response", { path, status: response.status });
    if (response.status === 401) {
      pubgUnauthorizedError = "PUBG API unauthorized (401). Verify PUBG_DEV_API/PUBG_API_KEY in the runtime environment.";
      throw new Error(pubgUnauthorizedError);
    }

    if (response.status === 429) {
      const backoffMs = getPubgRateLimitBackoffMs(response);
      pubgRateLimitedUntil = Date.now() + backoffMs;
      throw new Error(`PUBG API error (429) rate_limited_backoff_ms=${backoffMs}`);
    }

    throw new Error(`PUBG API error (${response.status})`);
  }

  log("debug", "pubg api response ok", { path, status: response.status });

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

async function getPlayerWithMatchesById(shard, playerId) {
  const payload = await pubgGet(
    `/shards/${encodeURIComponent(shard)}/players?filter[playerIds]=${encodeURIComponent(playerId)}`
  );

  const player = payload.data?.[0];
  if (!player) return null;

  return {
    playerId: player.id,
    playerName: player.attributes?.name ?? playerId,
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

async function lookupPlayerByIdAcrossShards(playerId, platform, preferredShard) {
  const shards = getCandidateShards(platform);
  const ordered = preferredShard
    ? [preferredShard, ...shards.filter((shard) => shard !== preferredShard)]
    : shards;

  for (const shard of ordered) {
    const player = await getPlayerWithMatchesById(shard, playerId).catch(() => null);
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

function parseIso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function computeBestVodForMatch(matchCreatedAt, vodRows) {
  const matchTime = parseIso(matchCreatedAt);
  if (!matchTime) return null;

  let best = null;
  for (const vod of vodRows) {
    if (!vod.createdAtTwitch || !vod.durationSeconds || vod.durationSeconds <= 0) continue;
    const vodStart = vod.createdAtTwitch;
    const vodEnd = new Date(vodStart.getTime() + vod.durationSeconds * 1000);
    const insideWindow = matchTime >= vodStart && matchTime <= vodEnd;
    const deltaSeconds = insideWindow
      ? 0
      : Math.floor(
          Math.min(
            Math.abs(matchTime.getTime() - vodStart.getTime()),
            Math.abs(matchTime.getTime() - vodEnd.getTime())
          ) / 1000
        );

    if (!best || deltaSeconds < best.deltaSeconds) {
      best = {
        videoId: vod.videoId,
        vodStartedAt: vodStart,
        deltaSeconds,
        vodOffsetSeconds: Math.max(0, Math.floor((matchTime.getTime() - vodStart.getTime()) / 1000)),
        confidenceTag: insideWindow ? "inside_vod" : deltaSeconds <= 900 ? "nearby_15m" : "weak"
      };
    }
  }

  return best;
}

function buildVodMomentDedupeKey(input) {
  return [
    input.twitchUserId,
    input.matchId,
    "vod_moment",
    normalizeForCompare(input.opponent),
    input.eventTimestamp
  ].join(":");
}

function getBacklogRetryMinutes(reason) {
  const normalized = String(reason || "").toLowerCase();
  if (normalized.startsWith("no_recent_matches_available_yet")) {
    return Math.min(BACKLOG_RETRY_MINUTES, 20);
  }
  if (normalized.startsWith("no_match_summaries_resolved_yet")) {
    return Math.min(BACKLOG_RETRY_MINUTES, 30);
  }
  return BACKLOG_RETRY_MINUTES;
}

async function runInteractionBackfill() {
  if (!INTERACTION_BACKFILL_ENABLED) {
    return {
      enabled: false,
      streamersScanned: 0,
      streamersWithIdentity: 0,
      streamersWithMatches: 0,
      matchesPersisted: 0,
      linksPersisted: 0,
      vodMomentsPersisted: 0,
      errors: 0,
      backlogQueued: 0,
      backlogResolved: 0,
      rateLimitedSkips: 0
    };
  }

  const summary = {
    enabled: true,
    streamersScanned: 0,
    streamersWithIdentity: 0,
    streamersWithMatches: 0,
    matchesPersisted: 0,
    linksPersisted: 0,
    vodMomentsPersisted: 0,
    errors: 0,
    backlogQueued: 0,
    backlogResolved: 0,
    rateLimitedSkips: 0
  };

  const recentVods = await prisma.pubgStreamerVod.findMany({
    orderBy: { createdAtTwitch: "desc" },
    take: Math.max(INTERACTION_BACKFILL_STREAMERS * INTERACTION_BACKFILL_VODS, 200),
    select: {
      twitchUserId: true,
      twitchUserLogin: true,
      twitchUserName: true,
      videoId: true,
      title: true,
      url: true,
      thumbnailUrl: true,
      durationSeconds: true,
      createdAtTwitch: true,
      publishedAtTwitch: true
    }
  });

  const byStreamer = new Map();
  for (const vod of recentVods) {
    if (!byStreamer.has(vod.twitchUserId)) {
      byStreamer.set(vod.twitchUserId, {
        twitchUserId: vod.twitchUserId,
        twitchUserLogin: vod.twitchUserLogin,
        twitchUserName: vod.twitchUserName,
        vods: []
      });
    }
    const bucket = byStreamer.get(vod.twitchUserId);
    if (bucket.vods.length < INTERACTION_BACKFILL_VODS) {
      bucket.vods.push(vod);
    }
  }

  const pendingBacklog = await prisma.pubgIndexBacklog.findMany({
    where: { status: "pending" },
    orderBy: [{ attempts: "asc" }, { lastSeenAt: "desc" }],
    take: INTERACTION_BACKFILL_STREAMERS * 4,
    select: {
      twitchUserId: true,
      twitchUserLogin: true,
      twitchUserName: true,
      reason: true,
      lastAttemptAt: true,
    }
  });

  const nowMs = Date.now();
  const prioritizedBacklog = pendingBacklog
    .filter((row) => {
      if (!row.lastAttemptAt) return true;
      const retryMinutes = getBacklogRetryMinutes(row.reason);
      const elapsedMs = nowMs - new Date(row.lastAttemptAt).getTime();
      return elapsedMs >= retryMinutes * 60 * 1000;
    })
    .slice(0, INTERACTION_BACKFILL_STREAMERS);

  const prioritizedIds = new Set(prioritizedBacklog.map((row) => row.twitchUserId));
  const prioritizedRows = prioritizedBacklog.map((row) => {
    const existing = byStreamer.get(row.twitchUserId);
    if (existing) return existing;
    return {
      twitchUserId: row.twitchUserId,
      twitchUserLogin: row.twitchUserLogin,
      twitchUserName: row.twitchUserName,
      vods: []
    };
  });

  const fallbackRows = Array.from(byStreamer.values()).filter(
    (row) => !prioritizedIds.has(row.twitchUserId)
  );

  const streamerRows = [...prioritizedRows, ...fallbackRows].slice(0, INTERACTION_BACKFILL_STREAMERS);

  for (const streamer of streamerRows) {
    summary.streamersScanned += 1;
    try {
      const identityLinks = await prisma.pubgStreamerIdentityLink.findMany({
        where: {
          twitchUserId: streamer.twitchUserId,
          platform: { in: ["steam", "xbox", "psn"] },
          pubgPlayerName: { not: "" },
          confidenceScore: { gte: 80 },
          source: {
            notIn: [
              "eventsub_login_heuristic",
              "eventsub_profile_claim",
              "eventsub_known_player_unverified",
              "eventsub_login_heuristic_unverified"
            ]
          }
        },
        orderBy: [
          { confidenceScore: "desc" },
          { lastLinkedAt: "desc" }
        ],
        take: 3,
        select: {
          platform: true,
          shard: true,
          pubgPlayerName: true,
          pubgPlayerId: true,
          source: true
        }
      });

      if (!identityLinks.length) {
        await upsertIndexBacklogCandidate({
          twitchUserId: streamer.twitchUserId,
          twitchUserLogin: streamer.twitchUserLogin,
          twitchUserName: streamer.twitchUserName,
          reason: "missing_identity_for_backfill"
        });
        summary.backlogQueued += 1;
        continue;
      }
      summary.streamersWithIdentity += 1;

      let resolved = null;
      let rateLimited = false;
      for (const link of identityLinks) {
        const direct = await getPlayerWithMatchesById(link.shard, link.pubgPlayerId).catch((error) => {
          if (isPubgRateLimitError(error)) rateLimited = true;
          return null;
        });
        if (direct && direct.matchIds.length > 0) {
          resolved = {
            platform: link.platform,
            shard: link.shard,
            pubgPlayerName: direct.playerName ?? link.pubgPlayerName,
            pubgPlayerId: link.pubgPlayerId,
            matchIds: direct.matchIds.slice(0, INTERACTION_BACKFILL_MATCHES)
          };
          break;
        }

        const cross = await lookupPlayerByIdAcrossShards(link.pubgPlayerId, link.platform, link.shard).catch((error) => {
          if (isPubgRateLimitError(error)) rateLimited = true;
          return null;
        });
        if (cross && cross.matchCount > 0) {
          const playerWithMatches = await getPlayerWithMatchesById(cross.shard, link.pubgPlayerId).catch((error) => {
            if (isPubgRateLimitError(error)) rateLimited = true;
            return null;
          });
          if (playerWithMatches && playerWithMatches.matchIds.length > 0) {
            resolved = {
              platform: link.platform,
              shard: cross.shard,
              pubgPlayerName: playerWithMatches.playerName ?? cross.playerName,
              pubgPlayerId: link.pubgPlayerId,
              matchIds: playerWithMatches.matchIds.slice(0, INTERACTION_BACKFILL_MATCHES)
            };
            break;
          }
        }

        const byNameCross = await lookupPlayerAcrossShards(link.pubgPlayerName, link.platform).catch((error) => {
          if (isPubgRateLimitError(error)) rateLimited = true;
          return null;
        });
        if (byNameCross && byNameCross.matchCount > 0) {
          const playerWithMatches = await getPlayerWithMatches(byNameCross.shard, byNameCross.playerName).catch((error) => {
            if (isPubgRateLimitError(error)) rateLimited = true;
            return null;
          });
          if (playerWithMatches && playerWithMatches.matchIds.length > 0) {
            resolved = {
              platform: link.platform,
              shard: byNameCross.shard,
              pubgPlayerName: playerWithMatches.playerName ?? byNameCross.playerName,
              pubgPlayerId: link.pubgPlayerId,
              matchIds: playerWithMatches.matchIds.slice(0, INTERACTION_BACKFILL_MATCHES)
            };
            break;
          }
        }

        if (rateLimited) {
          break;
        }
      }

      if (!resolved || !resolved.matchIds.length) {
        const topLink = identityLinks[0];
        const reason = rateLimited
          ? "pubg_rate_limited_backfill"
          : "no_matches_for_resolved_identity";
        await upsertIndexBacklogCandidate({
          twitchUserId: streamer.twitchUserId,
          twitchUserLogin: streamer.twitchUserLogin,
          twitchUserName: streamer.twitchUserName,
          reason,
          platformHint: topLink?.platform ?? null,
          shardHint: topLink?.shard ?? null,
          pubgPlayerNameHint: topLink?.pubgPlayerName ?? null
        });
        summary.backlogQueued += 1;
        if (rateLimited) {
          summary.rateLimitedSkips += 1;
          break;
        }
        continue;
      }
      summary.streamersWithMatches += 1;

      let streamerLinksPersisted = 0;
      let streamerMatchesPersisted = 0;

      for (const matchId of resolved.matchIds) {
        const matchPayload = await pubgGet(`/shards/${encodeURIComponent(resolved.shard)}/matches/${encodeURIComponent(matchId)}`).catch(() => null);
        if (!matchPayload?.data) continue;

        const matchCreatedAt = matchPayload.data.attributes?.createdAt ?? null;
        const mapName = matchPayload.data.attributes?.mapName ?? null;
        const gameMode = matchPayload.data.attributes?.gameMode ?? null;
        const telemetryAsset = (matchPayload.included ?? []).find((entry) => entry.type === "asset");
        const telemetryUrl = telemetryAsset?.attributes?.URL ?? null;
        if (!telemetryUrl) continue;

        await prisma.pubgStreamerMatch.upsert({
          where: {
            twitchUserId_matchId: {
              twitchUserId: streamer.twitchUserId,
              matchId
            }
          },
          create: {
            twitchUserId: streamer.twitchUserId,
            twitchUserLogin: streamer.twitchUserLogin,
            twitchUserName: streamer.twitchUserName,
            platform: resolved.platform,
            shard: resolved.shard,
            pubgPlayerId: resolved.pubgPlayerId,
            pubgPlayerName: resolved.pubgPlayerName,
            matchId,
            matchCreatedAt: parseIso(matchCreatedAt),
            mapName,
            gameMode,
            telemetryUrl,
            source: "crawler_interaction_backfill"
          },
          update: {
            twitchUserLogin: streamer.twitchUserLogin,
            twitchUserName: streamer.twitchUserName,
            platform: resolved.platform,
            shard: resolved.shard,
            pubgPlayerId: resolved.pubgPlayerId,
            pubgPlayerName: resolved.pubgPlayerName,
            matchCreatedAt: parseIso(matchCreatedAt),
            mapName,
            gameMode,
            telemetryUrl
          }
        });
        summary.matchesPersisted += 1;
        streamerMatchesPersisted += 1;

        const bestVod = computeBestVodForMatch(matchCreatedAt, streamer.vods);
        if (!bestVod) continue;

        await prisma.pubgMatchVodLink.upsert({
          where: {
            twitchUserId_matchLink: {
              twitchUserId: streamer.twitchUserId,
              matchId
            }
          },
          create: {
            twitchUserId: streamer.twitchUserId,
            twitchUserLogin: streamer.twitchUserLogin,
            twitchUserName: streamer.twitchUserName,
            matchId,
            videoId: bestVod.videoId,
            matchCreatedAt: parseIso(matchCreatedAt),
            vodStartedAt: bestVod.vodStartedAt,
            vodOffsetSeconds: bestVod.vodOffsetSeconds,
            deltaSeconds: bestVod.deltaSeconds,
            confidenceTag: bestVod.confidenceTag
          },
          update: {
            twitchUserLogin: streamer.twitchUserLogin,
            twitchUserName: streamer.twitchUserName,
            videoId: bestVod.videoId,
            matchCreatedAt: parseIso(matchCreatedAt),
            vodStartedAt: bestVod.vodStartedAt,
            vodOffsetSeconds: bestVod.vodOffsetSeconds,
            deltaSeconds: bestVod.deltaSeconds,
            confidenceTag: bestVod.confidenceTag,
            linkedAt: new Date()
          }
        });
        summary.linksPersisted += 1;
        streamerLinksPersisted += 1;

        const telemetryResponse = await fetch(telemetryUrl, { cache: "no-store" }).catch(() => null);
        if (!telemetryResponse?.ok) continue;
        const telemetryEvents = await telemetryResponse.json().catch(() => null);
        if (!Array.isArray(telemetryEvents)) continue;

        for (const event of telemetryEvents) {
          if (event?._T !== "LogPlayerKillV2" && event?._T !== "LogPlayerTakeDamage") continue;

          const attacker = event?.killer?.name ?? event?.attacker?.name ?? null;
          const victim = event?.victim?.name ?? null;
          const eventTimestamp = event?._D ?? matchCreatedAt;

          let opponent = null;
          if (
            attacker &&
            normalizeForCompare(attacker) === normalizeForCompare(resolved.pubgPlayerName) &&
            victim &&
            normalizeForCompare(victim) !== normalizeForCompare(resolved.pubgPlayerName)
          ) {
            opponent = victim;
          } else if (
            victim &&
            normalizeForCompare(victim) === normalizeForCompare(resolved.pubgPlayerName) &&
            attacker &&
            normalizeForCompare(attacker) !== normalizeForCompare(resolved.pubgPlayerName)
          ) {
            opponent = attacker;
          }

          if (!opponent) continue;

          const dedupeKey = buildVodMomentDedupeKey({
            twitchUserId: streamer.twitchUserId,
            matchId,
            opponent,
            eventTimestamp
          });

          await prisma.pubgLinkEvent.upsert({
            where: { dedupeKey },
            create: {
              dedupeKey,
              eventType: "vod_moment",
              pubgNameRaw: opponent,
              pubgNameNormalized: normalizeForCompare(opponent),
              twitchUserId: streamer.twitchUserId,
              twitchUserLogin: streamer.twitchUserLogin,
              twitchUserName: streamer.twitchUserName,
              twitchVideoId: bestVod.videoId,
              shard: resolved.shard,
              platform: resolved.platform,
              encounterAt: parseIso(eventTimestamp)
            },
            update: {
              twitchUserLogin: streamer.twitchUserLogin,
              twitchUserName: streamer.twitchUserName,
              twitchVideoId: bestVod.videoId,
              encounterAt: parseIso(eventTimestamp),
              shard: resolved.shard,
              platform: resolved.platform
            }
          });
          summary.vodMomentsPersisted += 1;
        }
      }

      if (streamerLinksPersisted > 0 || streamerMatchesPersisted > 0) {
        await resolveIndexBacklogCandidate(
          streamer.twitchUserId,
          `crawler_backfill_indexed:matches=${streamerMatchesPersisted}:links=${streamerLinksPersisted}`
        );
        summary.backlogResolved += 1;
      }
    } catch (error) {
      summary.errors += 1;
      log("warn", "interaction backfill failed for streamer", {
        twitchUserId: streamer.twitchUserId,
        twitchUserLogin: streamer.twitchUserLogin,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return summary;
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
  let interactionBackfillSummary = {
    enabled: INTERACTION_BACKFILL_ENABLED,
    streamersScanned: 0,
    streamersWithIdentity: 0,
    streamersWithMatches: 0,
    matchesPersisted: 0,
    linksPersisted: 0,
    vodMomentsPersisted: 0,
    errors: 0,
    backlogQueued: 0,
    backlogResolved: 0
  };
  let identityValidationSummary = {
    processed: 0,
    completed: 0,
    invalid: 0,
    errored: 0,
    retried: 0
  };
  let backlogCleaned = 0;

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

  try {
    identityValidationSummary = await processIdentityValidationQueue();
    if (identityValidationSummary.processed > 0) {
      log("info", "identity validation queue processed", identityValidationSummary);
    }
  } catch (error) {
    log("error", "identity validation queue processing failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    interactionBackfillSummary = await runInteractionBackfill();
    log("info", "interaction backfill completed", interactionBackfillSummary);
  } catch (error) {
    log("error", "interaction backfill failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    backlogCleaned = await cleanupResolvedIndexBacklog();
    if (backlogCleaned > 0) {
      log("info", "resolved index backlog cleaned", { backlogCleaned });
    }
  } catch (error) {
    log("error", "resolved index backlog cleanup failed", {
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
      knownPlayerMapping: knownPlayerMappingSummary,
      identityValidation: identityValidationSummary,
      interactionBackfill: interactionBackfillSummary,
      backlogCleaned
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
    log("error", "startup failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });
}
