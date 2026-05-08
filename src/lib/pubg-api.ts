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
  included?: Array<{
    type: string;
    attributes?: {
      URL?: string;
    };
  }>;
};

type KillEvent = {
  _T?: string;
  killer?: { name?: string | null } | null;
  victim?: { name?: string | null } | null;
  attacker?: { name?: string | null } | null;
};

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

  const encounterCounts = new Map<string, number>();
  const matchIds = player.matchIds.slice(0, maxMatches);

  for (const matchId of matchIds) {
    const telemetryUrl = await getMatchTelemetryUrl(shard, matchId);
    if (!telemetryUrl) continue;

    const telemetryResponse = await fetch(telemetryUrl, { cache: "no-store" });
    if (!telemetryResponse.ok) continue;

    const events = (await telemetryResponse.json()) as KillEvent[];

    for (const event of events) {
      if (event?._T !== "LogPlayerKill") continue;

      const killerName = event.killer?.name ?? event.attacker?.name ?? null;
      const victimName = event.victim?.name ?? null;

      if (!killerName || !victimName) continue;

      if (killerName === playerName && victimName !== playerName) {
        encounterCounts.set(victimName, (encounterCounts.get(victimName) ?? 0) + 1);
      }

      if (victimName === playerName && killerName !== playerName) {
        encounterCounts.set(killerName, (encounterCounts.get(killerName) ?? 0) + 1);
      }
    }
  }

  return Array.from(encounterCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxOpponents)
    .map(([name, count]) => ({ name, count }));
}
