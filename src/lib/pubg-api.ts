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
    attributes?: {
      createdAt?: string;
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

type KillEvent = {
  _T?: string;
  _D?: string;
  killer?: { name?: string | null } | null;
  victim?: { name?: string | null } | null;
  attacker?: { name?: string | null } | null;
};

export type PubgPlatform = "steam" | "xbox" | "psn" | "kakao";

function getPubgApiKey() {
  const apiKey = process.env.PUBG_DEV_API ?? process.env.PUBG_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PUBG API key (PUBG_DEV_API or PUBG_API_KEY)");
  }
  return apiKey;
}

async function pubgGet<T>(path: string): Promise<T> {
  const apiKey = getPubgApiKey();
  const response = await fetch(`https://api.pubg.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`PUBG API error (${response.status})`);
  }

  return (await response.json()) as T;
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

export function getCandidateShards(platform: PubgPlatform): string[] {
  if (platform === "xbox") {
    return ["xbox-na", "xbox-eu", "xbox-as", "xbox-oc", "xbox-sa"];
  }

  if (platform === "psn") {
    return ["psn-na", "psn-eu", "psn-as", "psn-oc", "psn-sa"];
  }

  if (platform === "kakao") {
    return ["pc-kakao", "pc-krjp", "pc-as"];
  }

  return ["pc-na", "pc-eu", "pc-as", "pc-kakao", "pc-krjp", "pc-sa", "pc-oc"];
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
    const found = await getPlayerWithMatches(shard, playerName);
    if (found) {
      return {
        shard,
        playerId: found.playerId,
        playerName: found.playerName,
        matchCount: found.matchIds.length
      };
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

export async function getRecentEncounterNames(options: {
  shard: string;
  playerName: string;
  maxMatches?: number;
  maxOpponents?: number;
}) {
  const { shard, playerName } = options;
  const maxMatches = Math.max(1, Math.min(options.maxMatches ?? 6, 15));
  const maxOpponents = Math.max(1, Math.min(options.maxOpponents ?? 40, 80));

  const player = await getPlayerWithMatches(shard, playerName);
  if (!player) {
    return [];
  }

  const encounterStats = new Map<string, { count: number; lastSeenAt: string | null }>();
  const matchIds = player.matchIds.slice(0, maxMatches);

  for (const matchId of matchIds) {
    const matchPayload = await pubgGet<PubgMatchResponse>(
      `/shards/${encodeURIComponent(shard)}/matches/${encodeURIComponent(matchId)}`
    );
    const matchCreatedAt = matchPayload.data?.attributes?.createdAt ?? null;

    const participantNames = Array.from(
      new Set(
        (matchPayload.included ?? [])
          .filter((entry) => entry.type === "participant")
          .map((entry) => entry.attributes?.stats?.name?.trim())
          .filter((name): name is string => Boolean(name))
      )
    );

    for (const participantName of participantNames) {
      if (participantName === playerName) continue;

      const current = encounterStats.get(participantName) ?? { count: 0, lastSeenAt: null };
      const previousLastSeenMs = current.lastSeenAt ? Date.parse(current.lastSeenAt) : Number.NaN;
      const matchCreatedAtMs = matchCreatedAt ? Date.parse(matchCreatedAt) : Number.NaN;
      const lastSeenAt =
        Number.isNaN(matchCreatedAtMs) || (!Number.isNaN(previousLastSeenMs) && previousLastSeenMs >= matchCreatedAtMs)
          ? current.lastSeenAt
          : matchCreatedAt;

      encounterStats.set(participantName, {
        count: current.count + 1,
        lastSeenAt
      });
    }
  }

  return Array.from(encounterStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, maxOpponents)
    .map(([name, stats]) => ({ name, count: stats.count, lastSeenAt: stats.lastSeenAt }));
}
