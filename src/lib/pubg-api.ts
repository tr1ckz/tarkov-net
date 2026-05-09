type PubgPlayerResponse = {
  data?: Array<{
    id: string;
    attributes: { name: string };
    relationships?: {
      matches?: {
        data?: Array<{ id: string }>;
      };
    };
  }>;
};

type PubgMatchResponse = {
  data?: {
    id?: string;
    attributes?: {
      createdAt?: string;
      mapName?: string;
      gameMode?: string;
    };
  };
  included?: Array<{
    type: string;
    attributes?: {
      URL?: string;
      stats?: {
        name?: string;
      };
    };
  }>;
};

type TelemetryCharacterRef = {
  name?: string | null;
} | null;

type PubgTelemetryEvent = {
  _T?: string;
  _D?: string;
  killer?: TelemetryCharacterRef;
  victim?: TelemetryCharacterRef;
  attacker?: TelemetryCharacterRef;
  damageCauserName?: string | null;
  distance?: number | null;
};

export type PubgEncounterActionType =
  | "knocking_out_streamer"
  | "getting_knocked_out_by_streamer"
  | "killing_streamer"
  | "getting_killed_by_streamer";

export type PubgEncounterPovTag = "TEAMMATE_POV" | "STREAMER_POV";

export type PubgEncounterEvent = {
  name: string;
  count: number;
  lastSeenAt: string | null;
  actionType: PubgEncounterActionType;
  weapon: string | null;
  distanceMeters: number | null;
  mapTag: string | null;
  gameModeTag: string | null;
  teamSizeModeTag: string | null;
  povTag: PubgEncounterPovTag;
};

export type PubgPlatform = "steam" | "xbox" | "psn";

export type PubgMatchSummary = {
  matchId: string;
  createdAt: string | null;
  mapName: string | null;
  gameMode: string | null;
  telemetryUrl: string | null;
};

export type CachedPubgPlayerProfile = {
  source: "identity_link" | "known_player";
  playerName: string;
  shard: string;
  platform: PubgPlatform;
  playerId: string | null;
  matchCount: number;
};

const PUBG_API_MAX_CALLS_PER_MINUTE = (() => {
  const parsed = Number(process.env.PUBG_API_MAX_CALLS_PER_MINUTE ?? "5");
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(120, Math.floor(parsed)));
})();

const PUBG_API_RATE_WINDOW_MS = 60_000;
const pubgApiCallTimestamps: number[] = [];
let pubgRateLimitMutex: Promise<void> = Promise.resolve();

// Async context key for propagating triggeredBy through the call stack
const triggeredByStorage = new Map<string, string>();
let _triggeredByContext: string | undefined;

export function setPubgCallContext(triggeredBy: string) {
  _triggeredByContext = triggeredBy;
}

export function clearPubgCallContext() {
  _triggeredByContext = undefined;
}

async function logPubgApiCall(opts: {
  callType: string;
  endpoint: string;
  shard?: string | null;
  statusCode?: number | null;
  durationMs: number;
  success: boolean;
  errorMessage?: string | null;
}) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.pubgApiCallLog.create({
      data: {
        callType: opts.callType,
        endpoint: opts.endpoint,
        shard: opts.shard ?? null,
        statusCode: opts.statusCode ?? null,
        durationMs: Math.round(opts.durationMs),
        success: opts.success,
        triggeredBy: _triggeredByContext ?? null,
        errorMessage: opts.errorMessage?.slice(0, 500) ?? null,
      }
    });
  } catch {
    // Non-critical — never let logging failures break the API call
  }
}

/**
 * Public helper for modules that make raw PUBG API calls outside of pubgGet.
 * E.g. pubg-streamer-linking.ts which has its own fetch wrapper.
 */
export async function recordPubgApiCall(opts: {
  callType: string;
  endpoint: string;
  shard?: string | null;
  statusCode?: number | null;
  durationMs: number;
  success: boolean;
  errorMessage?: string | null;
}) {
  return logPubgApiCall(opts);
}

function cleanErrorMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function pruneOldCallTimestamps(nowMs: number) {
  while (pubgApiCallTimestamps.length > 0 && nowMs - pubgApiCallTimestamps[0] >= PUBG_API_RATE_WINDOW_MS) {
    pubgApiCallTimestamps.shift();
  }
}

async function reservePubgApiCallSlot() {
  const withLock = async () => {
    while (true) {
      const nowMs = Date.now();
      pruneOldCallTimestamps(nowMs);

      if (pubgApiCallTimestamps.length < PUBG_API_MAX_CALLS_PER_MINUTE) {
        pubgApiCallTimestamps.push(nowMs);
        return;
      }

      const waitMs = Math.max(25, pubgApiCallTimestamps[0] + PUBG_API_RATE_WINDOW_MS - nowMs + 5);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  };

  const run = pubgRateLimitMutex.then(withLock, withLock);
  pubgRateLimitMutex = run.then(() => undefined, () => undefined);
  await run;
}

function getPubgApiKey() {
  const apiKey = process.env.PUBG_DEV_API ?? process.env.PUBG_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PUBG API key (PUBG_DEV_API or PUBG_API_KEY)");
  }
  return apiKey;
}

function shardFromPath(path: string): string | null {
  const m = path.match(/\/shards\/([^/]+)\//);
  return m ? m[1] : null;
}

function callTypeFromPath(path: string): string {
  if (path.includes("/players")) return "player_lookup";
  if (path.includes("/matches")) return "match_fetch";
  if (path.includes("/samples")) return "samples_fetch";
  return "api_fetch";
}

async function pubgGet<T>(path: string): Promise<T> {
  const apiKey = getPubgApiKey();
  const start = Date.now();
  let statusCode: number | undefined;
  let errorMessage: string | null = null;
  try {
    await reservePubgApiCallSlot();
    const response = await fetch(`https://api.pubg.com${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json"
      },
      cache: "no-store"
    });
    statusCode = response.status;
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      errorMessage = cleanErrorMessage(`PUBG API error (${response.status}) ${bodyText || ""}`);
      void logPubgApiCall({
        callType: callTypeFromPath(path),
        endpoint: path,
        shard: shardFromPath(path),
        statusCode,
        durationMs: Date.now() - start,
        success: false,
        errorMessage,
      });
      throw new Error(errorMessage || `PUBG API error (${response.status})`);
    }
    const data = (await response.json()) as T;
    void logPubgApiCall({ callType: callTypeFromPath(path), endpoint: path, shard: shardFromPath(path), statusCode, durationMs: Date.now() - start, success: true, errorMessage: null });
    return data;
  } catch (err) {
    const message = err instanceof Error ? cleanErrorMessage(err.message) : cleanErrorMessage(String(err));
    if (statusCode === undefined) {
      void logPubgApiCall({
        callType: callTypeFromPath(path),
        endpoint: path,
        shard: shardFromPath(path),
        statusCode: null,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: message,
      });
    }
    throw err;
  }
}

async function fetchTelemetryEvents(url: string) {
  const start = Date.now();
  const response = await fetch(url, { cache: "no-store" });
  const telemetryError = response.ok ? null : cleanErrorMessage(`PUBG telemetry fetch error (${response.status})`);
  void logPubgApiCall({ callType: "telemetry_fetch", endpoint: "telemetry", shard: null, statusCode: response.status, durationMs: Date.now() - start, success: response.ok, errorMessage: telemetryError });
  if (!response.ok) {
    throw new Error(telemetryError || `PUBG telemetry fetch error (${response.status})`);
  }
  return (await response.json()) as PubgTelemetryEvent[];
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  return normalizeName(left) === normalizeName(right);
}

function parseWeaponName(value: string | null | undefined) {
  if (!value) return null;

  const cleaned = value
    .replace(/^Item_Weapon_/i, "")
    .replace(/^Item_/i, "")
    .replace(/^Weap/i, "")
    .replace(/_C$/i, "")
    .replace(/Proj/i, "")
    .replace(/_/g, " ")
    .trim();

  return cleaned || value;
}

function deriveTeamSizeModeTag(gameMode: string | null | undefined) {
  if (!gameMode) return null;

  const lower = gameMode.toLowerCase();
  if (lower.includes("solo")) return "SOLO";
  if (lower.includes("duo")) return "DUO";
  if (lower.includes("squad")) return "SQUAD";
  return "UNKNOWN";
}

export async function getPlayerWithMatches(shard: string, playerName: string) {
  const payload = await pubgGet<PubgPlayerResponse>(
    `/shards/${encodeURIComponent(shard)}/players?filter[playerNames]=${encodeURIComponent(playerName)}`
  );

  const player = payload.data?.[0];
  if (!player) {
    return null;
  }

  const matchIds = player.relationships?.matches?.data?.map((entry) => entry.id) ?? [];

  return {
    playerId: player.id,
    playerName: player.attributes.name,
    matchIds
  };
}

export async function resolveCachedPubgPlayer(options: {
  playerName: string;
  platform: PubgPlatform;
  preferredShard?: string;
}): Promise<CachedPubgPlayerProfile | null> {
  const playerName = options.playerName.trim();
  if (!playerName) return null;

  const preferredShard = options.preferredShard?.trim().toLowerCase() || null;
  const normalized = normalizeName(playerName);
  const lower = playerName.toLowerCase();
  const { prisma } = await import("@/lib/prisma");

  const findIdentityLink = (shard: string | null) =>
    prisma.pubgStreamerIdentityLink.findFirst({
      where: {
        platform: options.platform,
        pubgNameNormalized: normalized,
        pubgPlayerName: { not: "" },
        ...(shard ? { shard } : {}),
      },
      select: {
        shard: true,
        pubgPlayerId: true,
        pubgPlayerName: true,
      },
      orderBy: [{ lastLinkedAt: "desc" }, { confidenceScore: "desc" }],
    });

  const identityLink = preferredShard
    ? (await findIdentityLink(preferredShard)) ?? (await findIdentityLink(null))
    : await findIdentityLink(null);

  if (identityLink) {
    return {
      source: "identity_link",
      playerName: identityLink.pubgPlayerName,
      shard: identityLink.shard,
      platform: options.platform,
      playerId: identityLink.pubgPlayerId,
      matchCount: 0,
    };
  }

  const findKnownPlayer = (shard: string | null) =>
    prisma.pubgKnownPlayer.findFirst({
      where: {
        platform: options.platform,
        playerNameLower: lower,
        ...(shard ? { shard } : {}),
      },
      select: {
        playerName: true,
        shard: true,
        seenCount: true,
      },
      orderBy: [{ seenCount: "desc" }, { lastSeenAt: "desc" }],
    });

  const knownPlayer = preferredShard
    ? (await findKnownPlayer(preferredShard)) ?? (await findKnownPlayer(null))
    : await findKnownPlayer(null);

  if (!knownPlayer) return null;

  return {
    source: "known_player",
    playerName: knownPlayer.playerName,
    shard: knownPlayer.shard,
    platform: options.platform,
    playerId: null,
    matchCount: knownPlayer.seenCount,
  };
}

export function getCandidateShards(platform: PubgPlatform): string[] {
  if (platform === "xbox") {
    return ["xbox-na", "xbox-eu", "xbox-as", "xbox-oc", "xbox-sa"];
  }

  if (platform === "psn") {
    return ["psn-na", "psn-eu", "psn-as", "psn-oc", "psn-sa"];
  }

  return ["pc-na", "pc-eu", "pc-as", "pc-sa", "pc-oc", "pc-krjp"];
}

export async function lookupPlayerAcrossShards(options: {
  playerName: string;
  preferredShard?: string;
  platform: PubgPlatform;
}) {
  const { playerName, platform, preferredShard } = options;
  const candidates = getCandidateShards(platform);
  const orderedShards = preferredShard
    ? [preferredShard, ...candidates.filter((shard) => shard !== preferredShard)]
    : candidates;

  for (const shard of orderedShards) {
    try {
      const found = await getPlayerWithMatches(shard, playerName);
      if (found) {
        return {
          shard,
          playerId: found.playerId,
          playerName: found.playerName,
          matchCount: found.matchIds.length
        };
      }
    } catch (error) {
      // Log shard failure but continue to next candidate
      // 404 means player not on this shard, other errors (5xx, network) should be retried on next shard
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[pubg-api] player lookup failed on shard ${shard}: ${errorMsg}`);
      continue;
    }
  }

  return null;
}

export async function getMatchTelemetryUrl(shard: string, matchId: string) {
  const payload = await pubgGet<PubgMatchResponse>(
    `/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`
  );

  const telemetry = payload.included?.find((entry) => entry.type === "asset")?.attributes?.URL;
  return telemetry ?? null;
}

export async function getMatchSummary(shard: string, matchId: string): Promise<PubgMatchSummary> {
  const payload = await pubgGet<PubgMatchResponse>(
    `/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`
  );

  const telemetryUrl = payload.included?.find((entry) => entry.type === "asset")?.attributes?.URL ?? null;

  return {
    matchId,
    createdAt: payload.data?.attributes?.createdAt ?? null,
    mapName: payload.data?.attributes?.mapName ?? null,
    gameMode: payload.data?.attributes?.gameMode ?? null,
    telemetryUrl,
  };
}

export async function getMatchParticipantNames(shard: string, matchId: string) {
  const payload = await pubgGet<PubgMatchResponse>(
    `/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`
  );

  const seen = new Set<string>();
  for (const item of payload.included ?? []) {
    if (item.type !== "participant") continue;
    const name = item.attributes?.stats?.name;
    if (!name || typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }

  return Array.from(seen);
}

export type MatchTelemetryEvent = {
  timestamp: string;
  type: string;
  killer?: string;
  victim?: string;
  attacker?: string;
  weapon?: string;
  distance?: number;
};

export type PlayerTelemetryData = {
  playerName: string;
  kills: Array<{ target: string; timestamp: string; weapon?: string; distance?: number }>;
  deaths: Array<{ killer: string; timestamp: string; weapon?: string; distance?: number }>;
  knockouts: Array<{ target: string; timestamp: string }>;
  wasKnockedOut: Array<{ knocker: string; timestamp: string }>;
};

export async function getMatchTelemetryEvents(telemetryUrl: string): Promise<MatchTelemetryEvent[]> {
  if (!telemetryUrl) return [];

  try {
    const response = await fetch(telemetryUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[pubg-api] telemetry fetch failed", {
        status: response.status,
        url: telemetryUrl,
      });
      return [];
    }

    const events = await response.json() as PubgTelemetryEvent[];
    const result: MatchTelemetryEvent[] = [];

    for (const event of events) {
      if (!event._T) continue; // skip events without type

      const timestamp = event._D ?? new Date().toISOString();

      // LogPlayerKill
      if (event._T === "LogPlayerKill" && event.killer?.name && event.victim?.name) {
        result.push({
          timestamp,
          type: "kill",
          killer: event.killer.name,
          victim: event.victim.name,
          weapon: event.damageCauserName ?? undefined,
          distance: event.distance ?? undefined,
        });
      }

      // LogPlayerTakeDamage
      if (event._T === "LogPlayerTakeDamage" && event.attacker?.name && event.victim?.name) {
        result.push({
          timestamp,
          type: "damage",
          attacker: event.attacker.name,
          victim: event.victim.name,
          weapon: event.damageCauserName ?? undefined,
          distance: event.distance ?? undefined,
        });
      }
    }

    return result;
  } catch (err) {
    console.warn("[pubg-api] telemetry parse failed", {
      url: telemetryUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function getPlayerTelemetryData(playerName: string, telemetryUrl: string): Promise<PlayerTelemetryData> {
  const events = await getMatchTelemetryEvents(telemetryUrl);
  const normalizedName = playerName.toLowerCase();

  return {
    playerName,
    kills: events
      .filter(e => e.type === "kill" && e.killer?.toLowerCase() === normalizedName)
      .map(e => ({
        target: e.victim!,
        timestamp: e.timestamp,
        weapon: e.weapon,
        distance: e.distance,
      })),
    deaths: events
      .filter(e => e.type === "kill" && e.victim?.toLowerCase() === normalizedName)
      .map(e => ({
        killer: e.killer!,
        timestamp: e.timestamp,
        weapon: e.weapon,
        distance: e.distance,
      })),
    knockouts: events
      .filter(e => e.type === "knockout" && e.killer?.toLowerCase() === normalizedName)
      .map(e => ({
        target: e.victim!,
        timestamp: e.timestamp,
      })),
    wasKnockedOut: events
      .filter(e => e.type === "knockout" && e.victim?.toLowerCase() === normalizedName)
      .map(e => ({
        knocker: e.killer!,
        timestamp: e.timestamp,
      })),
  };
}

export async function validatePlayerInMatch(playerName: string, telemetryUrl: string): Promise<boolean> {
  const data = await getPlayerTelemetryData(playerName, telemetryUrl);
  // Player is in the match if they have any events
  return data.kills.length > 0 || data.deaths.length > 0 || data.knockouts.length > 0 || data.wasKnockedOut.length > 0;
}

export async function indexSeenPlayersFromRecentMatches(options: {
  platform: PubgPlatform;
  shard: string;
  playerName: string;
  maxMatches?: number;
  maxPlayersPerMatch?: number;
  discoveredBy?: {
    twitchUserId: string;
    twitchUserLogin: string;
    twitchUserName: string;
  };
  eventSource?: string;
}) {
  const { platform, shard, playerName } = options;
  const maxMatches = Math.max(1, Math.min(20, options.maxMatches ?? 5));
  const maxPlayersPerMatch = Math.max(10, Math.min(120, options.maxPlayersPerMatch ?? 80));

  const player = await getPlayerWithMatches(shard, playerName).catch(() => null);
  if (!player) {
    return {
      indexed: false,
      reason: "source_player_not_found",
      scannedMatches: 0,
      namesFound: 0,
      upserted: 0,
      discoveredNew: 0,
      observationsLogged: 0,
      matchFetchErrors: 0
    };
  }

  const { prisma } = await import("@/lib/prisma");
  const matchIds = player.matchIds.slice(0, maxMatches);
  let namesFound = 0;
  let upserted = 0;
  let discoveredNew = 0;
  let observationsLogged = 0;
  let matchFetchErrors = 0;

  const discoveredBy = options.discoveredBy ?? {
    twitchUserId: "system",
    twitchUserLogin: "system",
    twitchUserName: "System"
  };
  const eventSource = options.eventSource?.trim() || "seen_player_discovery";

  for (const matchId of matchIds) {
    const names = await getMatchParticipantNames(shard, matchId).catch(() => {
      matchFetchErrors += 1;
      return [] as string[];
    });

    if (!names.length) continue;

    const cappedNames = names.slice(0, maxPlayersPerMatch);
    namesFound += cappedNames.length;

    for (const seenName of cappedNames) {
      const normalizedSeenName = normalizeName(seenName) || seenName.toLowerCase();
      try {
        await prisma.pubgKnownPlayer.create({
          data: {
            playerName: seenName,
            playerNameLower: seenName.toLowerCase(),
            platform,
            shard,
            seenCount: 1
          }
        });
        discoveredNew += 1;
        upserted += 1;
      } catch {
        try {
          await prisma.pubgKnownPlayer.update({
            where: {
              playerName_platform_shard: {
                playerName: seenName,
                platform,
                shard
              }
            },
            data: {
              playerNameLower: seenName.toLowerCase(),
              lastSeenAt: new Date(),
              seenCount: { increment: 1 }
            }
          });
          upserted += 1;
        } catch {
          // Never fail caller because of one bad row.
        }
      }

      try {
        const dedupeKey = [
          "seen_player_discovery",
          platform,
          shard,
          matchId,
          normalizedSeenName,
          discoveredBy.twitchUserId
        ].join(":");
        await prisma.pubgLinkEvent.upsert({
          where: { dedupeKey },
          create: {
            dedupeKey,
            eventType: "seen_player_discovery",
            pubgNameRaw: seenName,
            pubgNameNormalized: normalizedSeenName,
            twitchUserId: discoveredBy.twitchUserId,
            twitchUserLogin: discoveredBy.twitchUserLogin,
            twitchUserName: discoveredBy.twitchUserName,
            twitchStreamId: null,
            twitchVideoId: null,
            shard,
            platform,
            encounterAt: null
          },
          update: {
            pubgNameRaw: seenName,
            pubgNameNormalized: normalizedSeenName,
            twitchUserLogin: discoveredBy.twitchUserLogin,
            twitchUserName: discoveredBy.twitchUserName,
            shard,
            platform
          }
        });
        observationsLogged += 1;
      } catch {
        // Keep discovery resilient even if event log write fails.
      }
    }
  }

  return {
    indexed: true,
    reason: "ok",
    scannedMatches: matchIds.length,
    namesFound,
    upserted,
    discoveredNew,
    observationsLogged,
    eventSource,
    matchFetchErrors
  };
}

export async function getRecentEncounterNames(options: {
  shard: string;
  playerName: string;
  maxMatches?: number;
  maxOpponents?: number;
  restrictToKnownNormalizedNames?: Set<string>;
}): Promise<PubgEncounterEvent[]> {
  const { shard, playerName } = options;
  const maxMatches = Math.max(1, Math.min(options.maxMatches ?? 6, 15));
  const maxOpponents = Math.max(1, Math.min(options.maxOpponents ?? 80, 120));
  const knownNormalized = options.restrictToKnownNormalizedNames;
  const hasKnownFilter = Boolean(knownNormalized && knownNormalized.size > 0);

  const knownGate = (name: string) => {
    if (!hasKnownFilter || !knownNormalized) return true;
    const normalized = normalizeName(name);
    if (!normalized) return false;

    if (knownNormalized.has(normalized)) return true;

    for (const known of knownNormalized) {
      if (!known) continue;
      if (normalized.includes(known) || known.includes(normalized)) {
        return true;
      }
    }

    return false;
  };

  const player = await getPlayerWithMatches(shard, playerName).catch((error) => {
    console.warn("[pubg-api] player not found for encounter extraction", { shard, playerName, error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  if (!player) {
    return [];
  }

  console.info("[pubg-api] encounter extraction started", {
    shard,
    playerName,
    matchCount: player.matchIds.length,
    maxMatches,
    maxOpponents,
    knownFilterSize: knownNormalized?.size ?? 0
  });

  const encounterStats = new Map<string, PubgEncounterEvent>();
  const matchIds = player.matchIds.slice(0, maxMatches);
  let telemetryEventsVisited = 0;
  let participantsSkippedByKnownFilter = 0;
  let telemetryFetchErrors = 0;

  for (const matchId of matchIds) {
    const matchPayload = await pubgGet<PubgMatchResponse>(
      `/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`
    );
    const matchCreatedAt = matchPayload.data?.attributes?.createdAt ?? null;
    const mapTag = matchPayload.data?.attributes?.mapName ?? null;
    const gameModeTag = matchPayload.data?.attributes?.gameMode ?? null;
    const teamSizeModeTag = deriveTeamSizeModeTag(gameModeTag);
    const telemetryUrl = matchPayload.included?.find((entry) => entry.type === "asset")?.attributes?.URL;

    if (!telemetryUrl) {
      continue;
    }

    let telemetry: PubgTelemetryEvent[] = [];
    try {
      telemetry = await fetchTelemetryEvents(telemetryUrl);
    } catch (error) {
      telemetryFetchErrors += 1;
      console.warn("[pubg-api] telemetry fetch failed", {
        shard,
        matchId,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    for (const event of telemetry) {
      const type = event._T;
      if (type !== "LogPlayerKillV2" && type !== "LogPlayerMakeGroggy") {
        continue;
      }

      telemetryEventsVisited += 1;

      const attackerName = event.killer?.name ?? event.attacker?.name ?? null;
      const victimName = event.victim?.name ?? null;
      let encounterName: string | null = null;
      let actionType: PubgEncounterActionType | null = null;
      let povTag: PubgEncounterPovTag | null = null;

      if (type === "LogPlayerKillV2") {
        if (namesEqual(attackerName, playerName) && victimName && !namesEqual(victimName, playerName)) {
          encounterName = victimName;
          actionType = "killing_streamer";
          povTag = "TEAMMATE_POV";
        } else if (namesEqual(victimName, playerName) && attackerName && !namesEqual(attackerName, playerName)) {
          encounterName = attackerName;
          actionType = "getting_killed_by_streamer";
          povTag = "STREAMER_POV";
        }
      }

      if (type === "LogPlayerMakeGroggy") {
        if (namesEqual(attackerName, playerName) && victimName && !namesEqual(victimName, playerName)) {
          encounterName = victimName;
          actionType = "knocking_out_streamer";
          povTag = "TEAMMATE_POV";
        } else if (namesEqual(victimName, playerName) && attackerName && !namesEqual(attackerName, playerName)) {
          encounterName = attackerName;
          actionType = "getting_knocked_out_by_streamer";
          povTag = "STREAMER_POV";
        }
      }

      if (!encounterName || !actionType || !povTag) {
        continue;
      }

      if (!knownGate(encounterName)) {
        participantsSkippedByKnownFilter += 1;
        continue;
      }

      const encounterAt = event._D ?? matchCreatedAt;
      const current = encounterStats.get(encounterName) ?? {
        name: encounterName,
        count: 0,
        lastSeenAt: null,
        actionType,
        weapon: null,
        distanceMeters: null,
        mapTag,
        gameModeTag,
        teamSizeModeTag,
        povTag
      };

      const previousLastSeenMs = current.lastSeenAt ? Date.parse(current.lastSeenAt) : Number.NaN;
      const encounterAtMs = encounterAt ? Date.parse(encounterAt) : Number.NaN;
      const isNewerTimestamp = !Number.isNaN(encounterAtMs) && (Number.isNaN(previousLastSeenMs) || encounterAtMs >= previousLastSeenMs);
      const distanceMeters = typeof event.distance === "number" && Number.isFinite(event.distance)
        ? Math.max(0, Math.round(event.distance))
        : null;

      encounterStats.set(encounterName, {
        ...current,
        count: current.count + 1,
        lastSeenAt: isNewerTimestamp ? encounterAt : current.lastSeenAt,
        actionType: isNewerTimestamp ? actionType : current.actionType,
        weapon: isNewerTimestamp ? parseWeaponName(event.damageCauserName) : current.weapon,
        distanceMeters: isNewerTimestamp ? distanceMeters : current.distanceMeters,
        mapTag: isNewerTimestamp ? mapTag : current.mapTag,
        gameModeTag: isNewerTimestamp ? gameModeTag : current.gameModeTag,
        teamSizeModeTag: isNewerTimestamp ? teamSizeModeTag : current.teamSizeModeTag,
        povTag: isNewerTimestamp ? povTag : current.povTag
      });
    }
  }

  console.info("[pubg-api] encounter extraction completed", {
    shard,
    playerName,
    uniqueOpponents: encounterStats.size,
    telemetryEventsVisited,
    participantsSkippedByKnownFilter,
    hasKnownFilter,
    telemetryFetchErrors
  });

  return Array.from(encounterStats.values())
    .sort((a, b) => {
      const left = a.lastSeenAt ? Date.parse(a.lastSeenAt) : Number.NaN;
      const right = b.lastSeenAt ? Date.parse(b.lastSeenAt) : Number.NaN;
      if (!Number.isNaN(left) && !Number.isNaN(right) && right !== left) {
        return right - left;
      }
      return b.count - a.count;
    })
    .slice(0, maxOpponents)
    .map((entry) => ({ ...entry }));
}
