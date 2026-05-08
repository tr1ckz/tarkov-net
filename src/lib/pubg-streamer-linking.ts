import stringSimilarity from "string-similarity";
import { prisma } from "@/lib/prisma";
import { recordPubgApiCall, setPubgCallContext, clearPubgCallContext } from "@/lib/pubg-api";

const db = prisma as any;

export type PubgTwitchIdentityInput = {
  twitchUserId: string;
  twitchUserLogin: string;
  twitchUserName: string;
};

function normalizeForLinking(value: string) {
  return value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official|tv)$/g, "")
    .replace(/\d+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

function getCandidateShards(platform: string) {
  if (platform === "xbox") return ["xbox-na", "xbox-eu", "xbox-as", "xbox-oc", "xbox-sa"];
  if (platform === "psn") return ["psn-na", "psn-eu", "psn-as", "psn-oc", "psn-sa"];
  if (platform === "kakao") return ["pc-kakao", "pc-krjp", "pc-as"];
  return ["pc-na", "pc-eu", "pc-as", "pc-kakao", "pc-krjp", "pc-sa", "pc-oc"];
}

function getPubgApiKey() {
  return process.env.PUBG_DEV_API ?? process.env.PUBG_API_KEY ?? "";
}

async function getPlayerWithMatches(shard: string, playerName: string) {
  const apiKey = getPubgApiKey();
  if (!apiKey) return null;

  const endpoint = `/shards/${shard}/players?filter[playerNames]=${encodeURIComponent(playerName)}`;
  const start = Date.now();
  const response = await fetch(
    `https://api.pubg.com${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json"
      },
      cache: "no-store"
    }
  );
  void recordPubgApiCall({ callType: "player_lookup", endpoint, shard, statusCode: response.status, durationMs: Date.now() - start, success: response.ok });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    data?: Array<{ id: string; attributes?: { name?: string } }>;
  };
  const player = payload.data?.[0];
  if (!player) return null;

  return {
    playerId: player.id,
    playerName: player.attributes?.name ?? playerName
  };
}

async function lookupPlayerAcrossShards(playerName: string, platform: string, preferredShard?: string | null) {
  const shards = preferredShard
    ? [preferredShard, ...getCandidateShards(platform).filter((s) => s !== preferredShard)]
    : getCandidateShards(platform);

  for (const shard of shards) {
    const found = await getPlayerWithMatches(shard, playerName);
    if (found) {
      return {
        shard,
        playerId: found.playerId,
        playerName: found.playerName,
        verified: true
      };
    }
  }

  return null;
}

async function upsertIdentityLinkEvent(input: {
  platform: string;
  shard: string;
  pubgNameNormalized: string;
  pubgPlayerName: string;
  twitchUserId: string;
  twitchUserLogin: string;
  twitchUserName: string;
}) {
  const dedupeKey = ["identity_map", input.platform, input.pubgNameNormalized, input.twitchUserId].join(":");

  await db.pubgLinkEvent.upsert({
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
}

async function maybeAutoLinkKnownPlayer(input: PubgTwitchIdentityInput) {
  const loginNorm = normalizeForLinking(input.twitchUserLogin);
  const displayNorm = normalizeForLinking(input.twitchUserName);
  const prefixes = Array.from(new Set([loginNorm.slice(0, 3), displayNorm.slice(0, 3)].filter((p) => p.length >= 2)));
  if (!prefixes.length) return null;

  const rows = await db.pubgKnownPlayer.findMany({
    where: {
      OR: prefixes.flatMap((prefix) => [
        { playerNameLower: { startsWith: prefix } },
        { playerNameLower: { contains: prefix } }
      ])
    },
    orderBy: [{ lastSeenAt: "desc" }, { seenCount: "desc" }],
    take: 250
  });

  if (!rows.length) return null;

  let best: { row: (typeof rows)[number]; similarity: number } | null = null;
  let second: { row: (typeof rows)[number]; similarity: number } | null = null;
  for (const row of rows) {
    const normalized = normalizeForLinking(row.playerName);
    if (!normalized || normalized.length < 4) continue;
    const score = Math.max(
      loginNorm ? stringSimilarity.compareTwoStrings(loginNorm, normalized) : 0,
      displayNorm ? stringSimilarity.compareTwoStrings(displayNorm, normalized) : 0
    );
    if (score < 0.92) continue;

    const candidate = { row, similarity: score };
    if (!best || candidate.similarity > best.similarity) {
      second = best;
      best = candidate;
    } else if (!second || candidate.similarity > second.similarity) {
      second = candidate;
    }
  }

  if (!best) return null;
  if (second && best.similarity - second.similarity < 0.04) return null;

  const resolved = await lookupPlayerAcrossShards(best.row.playerName, best.row.platform, best.row.shard).catch(() => null);
  const normalizedPubg = normalizeForLinking(resolved?.playerName ?? best.row.playerName);
  const playerId = resolved?.playerId ?? `unverified:${best.row.platform}:${best.row.shard}:${normalizedPubg}`;
  const shard = resolved?.shard ?? best.row.shard;

  await db.pubgStreamerIdentityLink.upsert({
    where: {
      twitchUserId_platform: {
        twitchUserId: input.twitchUserId,
        platform: best.row.platform
      }
    },
    create: {
      twitchUserId: input.twitchUserId,
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      platform: best.row.platform,
      shard,
      pubgPlayerId: playerId,
      pubgPlayerName: resolved?.playerName ?? best.row.playerName,
      pubgNameNormalized: normalizedPubg,
      confidenceScore: Math.round(best.similarity * 100),
      confidenceReasonsJson: JSON.stringify([
        "eventsub_known_player",
        `similarity_${Math.round(best.similarity * 100)}pct`,
        resolved ? "verified_pubg_api" : "unverified_fallback"
      ]),
      source: resolved ? "eventsub_known_player" : "eventsub_known_player_unverified",
      firstLinkedAt: new Date(),
      lastLinkedAt: new Date()
    },
    update: {
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      shard,
      pubgPlayerId: playerId,
      pubgPlayerName: resolved?.playerName ?? best.row.playerName,
      pubgNameNormalized: normalizedPubg,
      confidenceScore: Math.round(best.similarity * 100),
      confidenceReasonsJson: JSON.stringify([
        "eventsub_known_player",
        `similarity_${Math.round(best.similarity * 100)}pct`,
        resolved ? "verified_pubg_api" : "unverified_fallback"
      ]),
      source: resolved ? "eventsub_known_player" : "eventsub_known_player_unverified",
      lastLinkedAt: new Date()
    }
  });

  await upsertIdentityLinkEvent({
    platform: best.row.platform,
    shard,
    pubgNameNormalized: normalizedPubg,
    pubgPlayerName: resolved?.playerName ?? best.row.playerName,
    twitchUserId: input.twitchUserId,
    twitchUserLogin: input.twitchUserLogin,
    twitchUserName: input.twitchUserName
  });

  return {
    source: "known_player",
    platform: best.row.platform,
    shard,
    pubgPlayerName: resolved?.playerName ?? best.row.playerName,
    similarity: Math.round(best.similarity * 100),
    verified: Boolean(resolved)
  };
}

function parseUserPubgClaims(user: {
  pubgSteamUser?: string | null;
  pubgXboxUser?: string | null;
  pubgPsnUser?: string | null;
  pubgKakaoUser?: string | null;
}) {
  const claims: Array<{ platform: string; playerName: string; normalized: string }> = [];

  if (user.pubgSteamUser?.trim()) {
    const playerName = user.pubgSteamUser.trim();
    claims.push({ platform: "steam", playerName, normalized: normalizeForLinking(playerName) });
  }
  if (user.pubgXboxUser?.trim()) {
    const playerName = user.pubgXboxUser.trim();
    claims.push({ platform: "xbox", playerName, normalized: normalizeForLinking(playerName) });
  }
  if (user.pubgPsnUser?.trim()) {
    const playerName = user.pubgPsnUser.trim();
    claims.push({ platform: "psn", playerName, normalized: normalizeForLinking(playerName) });
  }
  if (user.pubgKakaoUser?.trim()) {
    const playerName = user.pubgKakaoUser.trim();
    claims.push({ platform: "kakao", playerName, normalized: normalizeForLinking(playerName) });
  }

  return claims.filter((c) => c.normalized.length >= 4);
}

async function maybeAutoLinkByUserClaims(input: PubgTwitchIdentityInput) {
  const users = await db.user.findMany({
    where: {
      OR: [
        { pubgSteamUser: { not: null } },
        { pubgXboxUser: { not: null } },
        { pubgPsnUser: { not: null } },
        { pubgKakaoUser: { not: null } }
      ]
    },
    select: {
      pubgSteamUser: true,
      pubgXboxUser: true,
      pubgPsnUser: true,
      pubgKakaoUser: true
    },
    take: 1200
  });

  const loginNorm = normalizeForLinking(input.twitchUserLogin);
  const displayNorm = normalizeForLinking(input.twitchUserName);

  let best: { platform: string; playerName: string; normalized: string; score: number } | null = null;
  let second: { platform: string; playerName: string; normalized: string; score: number } | null = null;

  for (const user of users) {
    const claims = parseUserPubgClaims(user);
    for (const claim of claims) {
      const score = Math.max(
        loginNorm ? stringSimilarity.compareTwoStrings(loginNorm, claim.normalized) : 0,
        displayNorm ? stringSimilarity.compareTwoStrings(displayNorm, claim.normalized) : 0
      );
      if (score < 0.9) continue;

      const candidate = { ...claim, score };
      if (!best || candidate.score > best.score) {
        second = best;
        best = candidate;
      } else if (!second || candidate.score > second.score) {
        second = candidate;
      }
    }
  }

  if (!best) return null;
  if (second && best.score - second.score < 0.03) return null;

  const fallbackShard = getCandidateShards(best.platform)[0] ?? "pc-na";
  const fallbackPlayerId = `profile-claim:${best.platform}:${best.normalized}`;

  await db.pubgStreamerIdentityLink.upsert({
    where: {
      twitchUserId_platform: {
        twitchUserId: input.twitchUserId,
        platform: best.platform
      }
    },
    create: {
      twitchUserId: input.twitchUserId,
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      platform: best.platform,
      shard: fallbackShard,
      pubgPlayerId: fallbackPlayerId,
      pubgPlayerName: best.playerName,
      pubgNameNormalized: best.normalized,
      confidenceScore: Math.round(best.score * 100),
      confidenceReasonsJson: JSON.stringify([
        "eventsub_profile_claim",
        `similarity_${Math.round(best.score * 100)}pct`,
        "unverified_fallback"
      ]),
      source: "eventsub_profile_claim",
      firstLinkedAt: new Date(),
      lastLinkedAt: new Date()
    },
    update: {
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      shard: fallbackShard,
      pubgPlayerId: fallbackPlayerId,
      pubgPlayerName: best.playerName,
      pubgNameNormalized: best.normalized,
      confidenceScore: Math.round(best.score * 100),
      confidenceReasonsJson: JSON.stringify([
        "eventsub_profile_claim",
        `similarity_${Math.round(best.score * 100)}pct`,
        "unverified_fallback"
      ]),
      source: "eventsub_profile_claim",
      lastLinkedAt: new Date()
    }
  });

  await upsertIdentityLinkEvent({
    platform: best.platform,
    shard: fallbackShard,
    pubgNameNormalized: best.normalized,
    pubgPlayerName: best.playerName,
    twitchUserId: input.twitchUserId,
    twitchUserLogin: input.twitchUserLogin,
    twitchUserName: input.twitchUserName
  });

  return {
    source: "profile_claim",
    platform: best.platform,
    shard: fallbackShard,
    pubgPlayerName: best.playerName,
    similarity: Math.round(best.score * 100),
    verified: false
  };
}

async function maybeAutoLinkByLoginHeuristic(input: PubgTwitchIdentityInput) {
  const normalized = normalizeForLinking(input.twitchUserLogin);
  if (normalized.length < 4) return null;

  const platform = "steam";
  const shard = "pc-na";
  const playerName = input.twitchUserLogin;
  const playerId = `login-heuristic:${platform}:${normalized}`;

  await db.pubgStreamerIdentityLink.upsert({
    where: {
      twitchUserId_platform: {
        twitchUserId: input.twitchUserId,
        platform
      }
    },
    create: {
      twitchUserId: input.twitchUserId,
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      platform,
      shard,
      pubgPlayerId: playerId,
      pubgPlayerName: playerName,
      pubgNameNormalized: normalized,
      confidenceScore: 60,
      confidenceReasonsJson: JSON.stringify(["eventsub_login_heuristic", "unverified_fallback"]),
      source: "eventsub_login_heuristic",
      firstLinkedAt: new Date(),
      lastLinkedAt: new Date()
    },
    update: {
      twitchUserLogin: input.twitchUserLogin,
      twitchUserName: input.twitchUserName,
      shard,
      pubgPlayerId: playerId,
      pubgPlayerName: playerName,
      pubgNameNormalized: normalized,
      confidenceScore: 60,
      confidenceReasonsJson: JSON.stringify(["eventsub_login_heuristic", "unverified_fallback"]),
      source: "eventsub_login_heuristic",
      lastLinkedAt: new Date()
    }
  });

  await upsertIdentityLinkEvent({
    platform,
    shard,
    pubgNameNormalized: normalized,
    pubgPlayerName: playerName,
    twitchUserId: input.twitchUserId,
    twitchUserLogin: input.twitchUserLogin,
    twitchUserName: input.twitchUserName
  });

  return {
    source: "login_heuristic",
    platform,
    shard,
    pubgPlayerName: playerName,
    similarity: 60,
    verified: false
  };
}

export async function autoLinkPubgStreamerIdentity(input: PubgTwitchIdentityInput) {
  let autoLink = await maybeAutoLinkKnownPlayer(input).catch(() => null);
  if (!autoLink) {
    autoLink = await maybeAutoLinkByUserClaims(input).catch(() => null);
  }
  if (!autoLink) {
    autoLink = await maybeAutoLinkByLoginHeuristic(input).catch(() => null);
  }
  return autoLink;
}

export async function autoLinkPubgStreamerProfiles(options?: { liveOnly?: boolean; prioritizeVods?: boolean; limit?: number }) {
  const liveOnly = options?.liveOnly ?? true;
  const prioritizeVods = options?.prioritizeVods ?? true;
  const limit = options?.limit ?? 60;

  setPubgCallContext("batch_linker");

  const candidateProfiles = await db.pubgStreamerProfile.findMany({
    where: {
      ...(liveOnly ? { isLive: true } : {}),
      twitchUserId: { not: "" }
    },
    orderBy: [
      ...(prioritizeVods ? [{ vodsEnabled: "desc" as const }] : []),
      { lastSeenLiveAt: "desc" as const },
      { lastSeenAt: "desc" as const }
    ],
    take: limit
  });

  const existingLinks = await db.pubgStreamerIdentityLink.findMany({
    where: {
      twitchUserId: {
        in: candidateProfiles.map((profile: { twitchUserId: string }) => profile.twitchUserId)
      }
    },
    select: {
      twitchUserId: true
    }
  });
  const linkedTwitchIds = new Set(existingLinks.map((row: { twitchUserId: string }) => row.twitchUserId));
  const profiles = candidateProfiles.filter((profile: { twitchUserId: string }) => !linkedTwitchIds.has(profile.twitchUserId));

  let attempted = 0;
  let linked = 0;
  let vodPriorityAttempted = 0;
  const results: Array<{ twitchUserId: string; twitchUserLogin: string; vodsEnabled: boolean; autoLink: unknown | null }> = [];

  try {
    for (const profile of profiles) {
      attempted += 1;
      if (profile.vodsEnabled) {
        vodPriorityAttempted += 1;
      }
      const autoLink = await autoLinkPubgStreamerIdentity({
        twitchUserId: profile.twitchUserId,
      twitchUserLogin: profile.userLogin,
      twitchUserName: profile.userName
    });
    if (autoLink) {
      linked += 1;
    }
      results.push({
        twitchUserId: profile.twitchUserId,
        twitchUserLogin: profile.userLogin,
        vodsEnabled: profile.vodsEnabled,
        autoLink
      });
    }
  } finally {
    clearPubgCallContext();
  }

  return {
    attempted,
    linked,
    vodPriorityAttempted,
    results
  };
}