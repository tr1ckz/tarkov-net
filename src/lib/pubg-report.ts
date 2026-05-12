import type { PubgPlatform } from "@/lib/pubg-api";

type PubgReportSearchRow = {
  id?: string;
  shard?: string;
  name?: string;
  playerName?: string;
};

export type PubgReportIdentity = {
  pubgPlayerId: string;
  pubgPlayerName: string;
  shard: string;
  platform: PubgPlatform;
  query: string;
};

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripGamingPrefix(value: string) {
  return value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official|tv)$/g, "")
    .replace(/\d+$/, "")
    .trim();
}

function getPlatformFromShard(shard: string): PubgPlatform | null {
  if (shard.startsWith("pc-")) return "steam";
  if (shard.startsWith("xbox-")) return "xbox";
  if (shard.startsWith("psn-")) return "psn";
  return null;
}

async function fetchSearchRows(query: string): Promise<PubgReportSearchRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.pubg.report/search/${encodeURIComponent(query)}`, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];
    return payload as PubgReportSearchRow[];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolvePubgReportIdentityForStreamer(input: {
  twitchUserLogin: string;
  twitchUserName: string;
}): Promise<PubgReportIdentity | null> {
  const rawCandidates = [
    input.twitchUserLogin,
    stripGamingPrefix(input.twitchUserLogin),
    input.twitchUserName,
    stripGamingPrefix(input.twitchUserName),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const candidateQueries = Array.from(new Set(rawCandidates)).slice(0, 4);

  for (const query of candidateQueries) {
    const normalizedQuery = normalizeForCompare(query);
    if (normalizedQuery.length < 3) continue;

    const rows = await fetchSearchRows(query);
    if (!rows.length) continue;

    const supportedRows = rows
      .map((row) => {
        const shard = String(row.shard || "").trim();
        const platform = getPlatformFromShard(shard);
        const pubgPlayerId = String(row.id || "").trim();
        const pubgPlayerName = String(row.name || row.playerName || "").trim();

        if (!platform || !shard || !pubgPlayerId || !pubgPlayerName) return null;
        return { platform, shard, pubgPlayerId, pubgPlayerName };
      })
      .filter((row): row is { platform: PubgPlatform; shard: string; pubgPlayerId: string; pubgPlayerName: string } => Boolean(row));

    if (!supportedRows.length) continue;

    const exact = supportedRows.find((row) => normalizeForCompare(row.pubgPlayerName) === normalizedQuery);
    const selected = exact ?? supportedRows[0];

    return {
      ...selected,
      query,
    };
  }

  return null;
}
