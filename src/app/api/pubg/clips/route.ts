import { NextResponse } from "next/server";
import { getTwitchAppToken } from "@/lib/twitch";

export const dynamic = "force-dynamic";

type PubgReportSearchRow = {
  id?: string;
  shard?: string;
  nickname?: string;
  name?: string;
  playerName?: string;
};

type PubgReportStreamEvent = {
  ID?: string;
  Event?: string;
  Killer?: string;
  Victim?: string;
  DamageCauser?: string;
  Distance?: number | string;
  TimeEvent?: string;
  TimeDiff?: string;
  TwitchID?: string;
  VideoID?: string;
  MatchID?: string;
  Map?: string;
  Mode?: string;
};

type ClipTone = "kill" | "knocked" | "death" | "knocked_by" | "neutral";

type ClipRole = "subject" | "target";

type TwitchVideosPayload = {
  data?: Array<{
    id?: string;
    thumbnail_url?: string;
  }>;
};

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parsePlatform(value: string): "steam" | "xbox" | "psn" {
  if (value === "xbox" || value === "psn") return value;
  return "steam";
}

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(raw ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function platformFromShard(shard: string): "steam" | "xbox" | "psn" | null {
  if (shard === "steam" || shard === "xbox" || shard === "psn") {
    return shard;
  }
  if (shard.startsWith("pc-")) return "steam";
  if (shard.startsWith("xbox-")) return "xbox";
  if (shard.startsWith("psn-")) return "psn";
  return null;
}

function stripGamingPrefix(value: string) {
  return value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|youtube|twitch|tt|live|stream|gaming|gamer|plays|official|tv)$/g, "")
    .replace(/\d+$/, "")
    .trim();
}

function parseDurationSeconds(value: string | null | undefined) {
  if (!value) return 0;
  const match = value.match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})/);
  if (!match) return 0;
  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2] ?? "0");
  const seconds = Number(match[3] ?? "0");
  return hours * 3600 + minutes * 60 + seconds;
}

function toTwitchTimecode(value: string | null | undefined) {
  const seconds = parseDurationSeconds(value);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h${m}m${s}s`;
}

function prettifyEventType(value: string) {
  return value
    .replace(/^LogPlayerKillV2$/, "Player Killed")
    .replace(/^LogPlayerKill$/, "Player Killed")
    .replace(/^LogPlayerMakeGroggy$/, "Player Knocked Down")
    .replace(/^Log/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || "Player Event";
}

function prettyName(value: string) {
  return value.trim() || "Unknown";
}

function buildActionState(options: {
  focusName: string;
  killer: string;
  victim: string;
  eventType: string;
}) {
  const focus = normalizeForCompare(options.focusName);
  const killer = normalizeForCompare(options.killer);
  const victim = normalizeForCompare(options.victim);
  const focusInKiller = Boolean(focus) && focus === killer;
  const focusInVictim = Boolean(focus) && focus === victim;
  const isKill = options.eventType === "LogPlayerKill" || options.eventType === "LogPlayerKillV2";
  const isGroggy = options.eventType === "LogPlayerMakeGroggy";

  const opponentName = focusInKiller
    ? prettyName(options.victim)
    : focusInVictim
      ? prettyName(options.killer)
      : prettyName(options.victim || options.killer);

  let tone: ClipTone = "neutral";
  let eventLabel = prettifyEventType(options.eventType);
  let summaryText = `${prettyName(options.killer)} vs ${prettyName(options.victim)}`;
  let matchupText = `${prettyName(options.killer)} vs ${prettyName(options.victim)}`;
  let subjectName = prettyName(options.killer);
  let targetName = prettyName(options.victim);

  if (isKill) {
    eventLabel = "Player Killed";
    if (focusInKiller) {
      tone = "kill";
      subjectName = prettyName(options.focusName);
      targetName = opponentName;
      summaryText = `${prettyName(options.focusName)} killed ${opponentName}`;
      matchupText = `${prettyName(options.focusName)} vs ${opponentName}`;
    } else if (focusInVictim) {
      tone = "death";
      subjectName = prettyName(options.killer);
      targetName = prettyName(options.focusName);
      summaryText = `${prettyName(options.killer)} killed ${prettyName(options.focusName)}`;
      matchupText = `${prettyName(options.killer)} vs ${prettyName(options.focusName)}`;
    }
  }

  if (isGroggy) {
    eventLabel = "Player Knocked Down";
    if (focusInKiller) {
      tone = "knocked";
      subjectName = prettyName(options.focusName);
      targetName = opponentName;
      summaryText = `${prettyName(options.focusName)} knocked down ${opponentName}`;
      matchupText = `${prettyName(options.focusName)} vs ${opponentName}`;
    } else if (focusInVictim) {
      tone = "knocked_by";
      subjectName = prettyName(options.killer);
      targetName = prettyName(options.focusName);
      summaryText = `${prettyName(options.killer)} knocked down ${prettyName(options.focusName)}`;
      matchupText = `${prettyName(options.killer)} vs ${prettyName(options.focusName)}`;
    }
  }

  if (!focusInKiller && !focusInVictim) {
    summaryText = isKill
      ? `${prettyName(options.killer)} killed ${prettyName(options.victim)}`
      : isGroggy
        ? `${prettyName(options.killer)} knocked down ${prettyName(options.victim)}`
        : `${prettyName(options.killer)} vs ${prettyName(options.victim)}`;
    matchupText = `${prettyName(options.killer)} vs ${prettyName(options.victim)}`;
  }

  return {
    tone,
    eventLabel,
    summaryText,
    matchupText,
    opponentName,
    subjectName,
    targetName,
  };
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`pubg.report request failed (${response.status})`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTwitchVideoThumbnailMap(videoIds: string[]) {
  const ids = Array.from(new Set(videoIds.map((id) => id.trim()).filter(Boolean))).slice(0, 100);
  if (!ids.length) return new Map<string, string>();

  try {
    const { token, clientId } = await getTwitchAppToken();
    const params = new URLSearchParams();
    for (const id of ids) {
      params.append("id", id);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`https://api.twitch.tv/helix/videos?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
        },
      });

      if (!response.ok) {
        return new Map<string, string>();
      }

      const payload = (await response.json()) as TwitchVideosPayload;
      const out = new Map<string, string>();

      for (const row of payload.data ?? []) {
        const id = String(row.id || "").trim();
        const thumbnail = String(row.thumbnail_url || "").trim();
        if (!id || !thumbnail) continue;
        out.set(id, thumbnail.replace("%{width}x%{height}", "640x360"));
      }

      return out;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return new Map<string, string>();
  }
}

async function resolvePubgReportAccount(input: {
  query: string;
  platform: "steam" | "xbox" | "psn";
}) {
  const queryCandidates = Array.from(
    new Set([
      input.query.trim(),
      stripGamingPrefix(input.query.trim()),
    ].filter(Boolean))
  );

  for (const query of queryCandidates) {
    const rows = await fetchJsonWithTimeout<PubgReportSearchRow[]>(
      `https://api.pubg.report/search/${encodeURIComponent(query)}`
    ).catch(() => []);

    if (!Array.isArray(rows) || !rows.length) continue;

    const supported = rows
      .map((row) => {
        const id = String(row.id || "").trim();
        const shard = String(row.shard || "").trim();
        const playerName = String(row.nickname || row.name || row.playerName || "").trim();
        const platform = platformFromShard(shard);
        if (!id || !shard || !playerName || !platform) return null;
        return { id, shard, playerName, platform };
      })
      .filter((row): row is { id: string; shard: string; playerName: string; platform: "steam" | "xbox" | "psn" } => Boolean(row));

    if (!supported.length) continue;

    const platformScoped = supported.filter((row) => row.platform === input.platform);
    const pool = platformScoped.length ? platformScoped : supported;

    const normalizedQuery = normalizeForCompare(query);
    const exact = pool.find((row) => normalizeForCompare(row.playerName) === normalizedQuery);
    return exact ?? pool[0];
  }

  return null;
}

function flattenStreamEvents(payload: unknown): PubgReportStreamEvent[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((row): row is PubgReportStreamEvent => typeof row === "object" && row !== null);
  }
  if (typeof payload !== "object") return [];

  const out: PubgReportStreamEvent[] = [];
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (typeof row === "object" && row !== null) {
          out.push(row as PubgReportStreamEvent);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      out.push(value as PubgReportStreamEvent);
    }
  }
  return out;
}

function mapPubgReportEventsToClips(
  events: PubgReportStreamEvent[],
  limit: number,
  playerName: string | undefined,
  thumbnailByVideoId: Map<string, string>
) {
  const dedupe = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  const normalizedPlayer = normalizeForCompare(playerName || "");

  for (const event of events) {
    const videoIdRaw = String(event.VideoID || "").trim();
    const videoId = videoIdRaw.startsWith("v") ? videoIdRaw.slice(1) : videoIdRaw;
    if (!videoId) continue;

    const eventId = String(event.ID || "").trim() || `${videoId}:${event.TimeEvent || "na"}`;
    if (dedupe.has(eventId)) continue;
    dedupe.add(eventId);

    const twitchUserId = String(event.TwitchID || "").trim();
    const killer = String(event.Killer || "").trim();
    const victim = String(event.Victim || "").trim();
    const eventType = String(event.Event || "encounter").trim();
    const createdAt = event.TimeEvent && !Number.isNaN(Date.parse(event.TimeEvent))
      ? new Date(event.TimeEvent).toISOString()
      : new Date().toISOString();
    const timecode = toTwitchTimecode(event.TimeDiff);
    const fallbackThumbnailUrl = twitchUserId
      ? `https://static-cdn.jtvnw.net/s3_vods/${twitchUserId}/${videoId}/thumb/thumb0-320x180.jpg`
      : "/pubg.avif";
    const thumbnailUrl = thumbnailByVideoId.get(videoId) || fallbackThumbnailUrl;
    const actionState = buildActionState({
      focusName: playerName || "",
      killer,
      victim,
      eventType,
    });

    rows.push({
      id: `pubg-report-${eventId}`,
      url: `https://www.twitch.tv/videos/${videoId}?t=${timecode}`,
      embed_url: `https://www.twitch.tv/videos/${videoId}?t=${timecode}`,
      broadcaster_id: twitchUserId,
      broadcaster_name: killer || victim || "Unknown",
      creator_id: twitchUserId,
      creator_name: killer || victim || "Unknown",
      video_id: videoId,
      game_id: "27971",
      language: "",
      title: actionState.eventLabel,
      view_count: 0,
      created_at: createdAt,
      thumbnail_url: thumbnailUrl,
      duration: 0,
      matchupText: actionState.matchupText,
      summaryText: actionState.summaryText,
      eventTone: actionState.tone,
      eventLabel: actionState.eventLabel,
      opponentName: actionState.opponentName,
      subjectName: actionState.subjectName,
      targetName: actionState.targetName,
      encounterWeapon: event.DamageCauser ? String(event.DamageCauser) : null,
      encounterDistanceMeters: event.Distance ? Number(event.Distance) : null,
      mapTag: event.Map ? String(event.Map) : null,
      gameModeTag: event.Mode ? String(event.Mode) : null,
      sourceType: "vod",
    });

    if (rows.length >= limit) break;
  }

  return rows;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamer = searchParams.get("streamer")?.trim() ?? "";
  const playerName = searchParams.get("playerName")?.trim() ?? "";
  const platform = parsePlatform(searchParams.get("platform")?.trim().toLowerCase() ?? "steam");
  const limit = parseBoundedInt(searchParams.get("limit"), 24, 1, 60);

  const mode = playerName ? "encounters" : streamer ? "streamer" : "pubg";
  const lookupName = playerName || streamer;

  if (!lookupName) {
    return NextResponse.json({ clips: [], source: "pubg" });
  }

  try {
    const account = await resolvePubgReportAccount({
      query: lookupName,
      platform,
    });

    if (!account) {
      return NextResponse.json(
        {
          clips: [],
          source: mode,
          error: "No pubg.report account match found for that name.",
          lookupNeeded: true,
          profile: playerName
            ? {
                playerName: lookupName,
                shard: "unresolved",
                platform,
              }
            : undefined,
        },
        { status: 404 }
      );
    }

    const streamsPayload = await fetchJsonWithTimeout<unknown>(
      `https://api.pubg.report/v1/players/${encodeURIComponent(account.id)}/streams`
    );
    const events = flattenStreamEvents(streamsPayload);
    const videoIds = events
      .map((event) => String(event.VideoID || "").trim())
      .map((id) => (id.startsWith("v") ? id.slice(1) : id))
      .filter(Boolean);
    const thumbnailByVideoId = await fetchTwitchVideoThumbnailMap(videoIds);
    const clips = mapPubgReportEventsToClips(events, limit, playerName || account.playerName, thumbnailByVideoId);

    return NextResponse.json({
      clips,
      source: mode,
      streamer: streamer || undefined,
      profile: playerName
        ? {
            playerName: account.playerName,
            shard: account.shard,
            platform: account.platform,
          }
        : undefined,
      encountersScanned: mode === "encounters" ? events.length : undefined,
      debug: mode === "encounters"
        ? {
            encountersFound: events.length,
            directLoginMatches: 0,
            searchChannelMatches: 0,
            channelsWithClips: clips.length,
            resolvedShard: account.shard,
          }
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load pubg.report clips";
    return NextResponse.json(
      {
        clips: [],
        source: mode,
        error: message,
      },
      { status: 500 }
    );
  }
}
