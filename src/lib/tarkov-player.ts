export const TARKOV_PROFILE_MODES = ["regular", "pve", "arena"] as const;

export type TarkovProfileMode = (typeof TARKOV_PROFILE_MODES)[number];

export type TarkovPlayerProfile = {
  aid: number;
  updated?: number;
  info?: {
    nickname?: string;
    side?: string;
    experience?: number;
    prestigeLevel?: number;
  };
  pmcStats?: {
    eft?: {
      totalInGameTime?: number;
      overAllCounters?: {
        Items?: Array<{
          Key?: string[];
          Value?: number;
        }>;
      };
    };
  };
  scavStats?: {
    eft?: {
      overAllCounters?: {
        Items?: Array<{
          Key?: string[];
          Value?: number;
        }>;
      };
    };
  };
  skills?: {
    Common?: Array<{
      Id?: string;
      Progress?: number;
      LastAccess?: number;
    }>;
    Mastering?: Array<{
      Id?: string;
      Progress?: number;
      level?: number;
    }>;
  };
};

type TarkovPlayerIndex = Record<string, string>;

type IgnLookupResult = {
  regularProfileId: string | null;
  pveProfileId: string | null;
  arenaProfileId: string | null;
};

const TARKOV_PLAYER_INDEX_URLS: Record<TarkovProfileMode, string> = {
  regular: "https://players.tarkov.dev/profile/index.json",
  pve: "https://players.tarkov.dev/pve/index.json",
  arena: "https://players.tarkov.dev/arena/index.json"
};

export function buildTarkovProfileUrl(profileId: string, mode: TarkovProfileMode) {
  return `https://tarkov.dev/players/${mode}/${profileId}`;
}

export function buildTarkovProfileJsonUrl(profileId: string, mode: TarkovProfileMode = "regular") {
  if (mode === "pve") {
    return `https://players.tarkov.dev/pve/${profileId}.json`;
  }

  if (mode === "arena") {
    return `https://players.tarkov.dev/arena/${profileId}.json`;
  }

  return `https://players.tarkov.dev/profile/${profileId}.json`;
}

export function parseTarkovProfileInput(
  input: string | null | undefined,
  fallbackMode: TarkovProfileMode = "regular"
) {
  const trimmed = input?.trim();

  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/tarkov\.dev\/players\/(regular|pve|arena)\/(\d+)/i);
  if (urlMatch) {
    return {
      profileId: urlMatch[2],
      mode: urlMatch[1].toLowerCase() as TarkovProfileMode
    };
  }

  const jsonUrlMatch = trimmed.match(/players\.tarkov\.dev\/(profile|pve|arena)\/(\d+)(?:\.json)?/i);
  if (jsonUrlMatch) {
    const jsonMode = jsonUrlMatch[1].toLowerCase();

    return {
      profileId: jsonUrlMatch[2],
      mode: (jsonMode === "profile" ? fallbackMode : jsonMode) as TarkovProfileMode
    };
  }

  const idMatch = trimmed.match(/^(\d+)$/);
  if (idMatch) {
    return {
      profileId: idMatch[1],
      mode: fallbackMode
    };
  }

  return null;
}

export async function validateTarkovProfile(profileId: string, mode: TarkovProfileMode) {
  const [jsonResponse, profileResponse] = await Promise.all([
    fetch(buildTarkovProfileJsonUrl(profileId, mode), {
      cache: "no-store",
      redirect: "follow"
    }),
    fetch(buildTarkovProfileUrl(profileId, mode), {
      cache: "no-store",
      redirect: "follow"
    })
  ]);

  return jsonResponse.ok || profileResponse.ok;
}

export async function getTarkovProfileJson(profileId: string, mode: TarkovProfileMode = "regular") {
  const response = await fetch(buildTarkovProfileJsonUrl(profileId, mode), {
    cache: "no-store",
    redirect: "follow"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as TarkovPlayerProfile;
}

function findProfileIdByIgn(index: TarkovPlayerIndex, ign: string) {
  const target = ign.trim().toLowerCase();

  if (!target) {
    return null;
  }

  for (const [profileId, name] of Object.entries(index)) {
    if (typeof name === "string" && name.trim().toLowerCase() === target) {
      return profileId;
    }
  }

  return null;
}

async function fetchModeIndex(mode: TarkovProfileMode) {
  const response = await fetch(TARKOV_PLAYER_INDEX_URLS[mode], {
    cache: "no-store",
    redirect: "follow"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as TarkovPlayerIndex;
}

export async function lookupTarkovProfilesByIgn(ign: string): Promise<IgnLookupResult> {
  const normalizedIgn = ign.trim();

  if (!normalizedIgn) {
    return {
      regularProfileId: null,
      pveProfileId: null,
      arenaProfileId: null
    };
  }

  const [regularIndex, pveIndex, arenaIndex] = await Promise.all([
    fetchModeIndex("regular"),
    fetchModeIndex("pve"),
    fetchModeIndex("arena")
  ]);

  return {
    regularProfileId: regularIndex ? findProfileIdByIgn(regularIndex, normalizedIgn) : null,
    pveProfileId: pveIndex ? findProfileIdByIgn(pveIndex, normalizedIgn) : null,
    arenaProfileId: arenaIndex ? findProfileIdByIgn(arenaIndex, normalizedIgn) : null
  };
}