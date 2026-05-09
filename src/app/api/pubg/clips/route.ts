import { NextResponse } from "next/server";
import {
  findBroadcasterIdByLogin,
  findGameIdByName,
  getClipsByBroadcasterId,
  getClipsByGameId,
  getVideosByUserId,
  parseTwitchDurationToSeconds,
  searchChannelsByName
} from "@/lib/twitch";
import {
  clearPubgCallContext,
  resolveCachedPubgPlayer,
  setPubgCallContext,
  type PubgPlatform
} from "@/lib/pubg-api";
import { computeVodOffsetSeconds } from "@/lib/pubg-streamer-index";
import { prisma } from "@/lib/prisma";

const db = prisma as any;

export const dynamic = "force-dynamic";

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getLoginCandidates(pubgName: string) {
  const raw = pubgName.trim();
  const lower = raw.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const underscore = lower.replace(/\s+/g, "_");
  const stripped = lower.replace(/[^a-z0-9_]/g, "");

  return Array.from(new Set([lower, compact, underscore, stripped])).filter(Boolean);
}

function parsePlatform(value: string): PubgPlatform {
  if (value === "xbox" || value === "psn") return value;
  return "steam";
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(raw ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

type EncounterClipResponseRow = {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
  encounterWith: string;
  encounterActionText: string;
  encounterActionType: string;
  encounterWeapon?: string | null;
  encounterDistanceMeters?: number | null;
  mapTag?: string | null;
  gameModeTag?: string | null;
  teamSizeModeTag?: string | null;
  povTag?: string | null;
  sourceType: "vod" | "clip";
};

async function getCachedEncounterClips(options: {
  playerName: string;
  platform: string;
  shard?: string;
  limit: number;
}) {
  const normalized = normalizeName(options.playerName);
  if (!normalized) return [] as EncounterClipResponseRow[];

  const cacheWindowDays = parseBoundedInt(
    process.env.PUBG_ENCOUNTER_CACHE_WINDOW_DAYS,
    30,
    1,
    365
  );
  const cutoff = new Date(Date.now() - cacheWindowDays * 24 * 60 * 60 * 1000);

  const linkRows = await prisma.pubgLinkEvent.findMany({
    where: {
      pubgNameNormalized: normalized,
      platform: options.platform,
      shard: options.shard || undefined,
      createdAt: { gte: cutoff },
      eventType: { in: ["vod_moment", "clip_match", "active_live"] }
    },
    orderBy: [{ encounterAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(options.limit * 6, 60)
  });

  if (!linkRows.length) return [] as EncounterClipResponseRow[];

  const vodIds = Array.from(
    new Set(
      linkRows
        .filter((row) => row.eventType === "vod_moment" && row.twitchVideoId)
        .map((row) => row.twitchVideoId as string)
    )
  );

  const vodRows = vodIds.length
    ? await prisma.pubgStreamerVod.findMany({
        where: { videoId: { in: vodIds } },
        select: {
          videoId: true,
          twitchUserId: true,
          twitchUserName: true,
          title: true,
          url: true,
          thumbnailUrl: true,
          createdAtTwitch: true,
          durationSeconds: true
        }
      })
    : [];

  const vodById = new Map(vodRows.map((row) => [row.videoId, row]));
  const out: EncounterClipResponseRow[] = [];
  const seen = new Set<string>();

  for (const row of linkRows) {
    const uniqueKey = [row.eventType, row.twitchUserId, row.twitchVideoId ?? row.twitchStreamId ?? "na", row.encounterAt?.toISOString() ?? "na"].join(":");
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    const encounterAtIso = row.encounterAt?.toISOString() ?? row.createdAt.toISOString();
    const encounterWith = row.pubgNameRaw || options.playerName;

    if (row.eventType === "vod_moment" && row.twitchVideoId) {
      const vod = vodById.get(row.twitchVideoId);
      if (!vod) continue;

      const offset = vod.createdAtTwitch
        ? computeVodOffsetSeconds(encounterAtIso, vod.createdAtTwitch.toISOString())
        : 0;

      out.push({
        id: `cached-vod-${row.twitchVideoId}-${row.id}`,
        url: `${vod.url}?t=${Math.max(0, offset)}s`,
        embed_url: `${vod.url}?t=${Math.max(0, offset)}s`,
        broadcaster_id: vod.twitchUserId,
        broadcaster_name: row.twitchUserName || vod.twitchUserName || row.twitchUserLogin,
        creator_id: vod.twitchUserId,
        creator_name: row.twitchUserName || vod.twitchUserName || row.twitchUserLogin,
        video_id: vod.videoId,
        game_id: "27971",
        language: "",
        title: `[Cached VOD] ${vod.title}`,
        view_count: 0,
        created_at: vod.createdAtTwitch?.toISOString() ?? encounterAtIso,
        thumbnail_url: (vod.thumbnailUrl ?? "")
          .replace("%{width}", "640")
          .replace("%{height}", "360"),
        duration: Math.max(0, vod.durationSeconds ?? 0),
        encounterWith,
        encounterActionText: `YOU encountered ${encounterWith}`,
        encounterActionType: "cached_vod_moment",
        sourceType: "vod"
      });
    } else if (row.eventType === "clip_match" && row.twitchVideoId) {
      const clipUrl = `https://clips.twitch.tv/${row.twitchVideoId}`;
      out.push({
        id: `cached-clip-${row.twitchVideoId}-${row.id}`,
        url: clipUrl,
        embed_url: clipUrl,
        broadcaster_id: row.twitchUserId,
        broadcaster_name: row.twitchUserName || row.twitchUserLogin,
        creator_id: row.twitchUserId,
        creator_name: row.twitchUserName || row.twitchUserLogin,
        video_id: row.twitchVideoId,
        game_id: "27971",
        language: "",
        title: `[Cached Clip] ${row.twitchUserName || row.twitchUserLogin}`,
        view_count: 0,
        created_at: encounterAtIso,
        thumbnail_url: "",
        duration: 0,
        encounterWith,
        encounterActionText: `YOU encountered ${encounterWith}`,
        encounterActionType: "cached_clip_match",
        sourceType: "clip"
      });
    } else if (row.eventType === "active_live" && row.twitchUserLogin) {
      const liveUrl = `https://www.twitch.tv/${row.twitchUserLogin}`;
      out.push({
        id: `cached-live-${row.twitchStreamId ?? row.id}`,
        url: liveUrl,
        embed_url: liveUrl,
        broadcaster_id: row.twitchUserId,
        broadcaster_name: row.twitchUserName || row.twitchUserLogin,
        creator_id: row.twitchUserId,
        creator_name: row.twitchUserName || row.twitchUserLogin,
        video_id: "",
        game_id: "27971",
        language: "",
        title: `[Cached Live] ${row.twitchUserName || row.twitchUserLogin}`,
        view_count: 0,
        created_at: encounterAtIso,
        thumbnail_url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${row.twitchUserLogin}-640x360.jpg`,
        duration: 0,
        encounterWith,
        encounterActionText: `YOU encountered ${encounterWith}`,
        encounterActionType: "cached_live_overlap",
        sourceType: "vod"
      });
    }

    if (out.length >= options.limit) break;
  }

  return out;
}

function mapVodRowsToClipShape(
  vodRows: Array<{
    videoId: string;
    twitchUserId: string;
    twitchUserLogin: string;
    twitchUserName: string;
    title: string;
    url: string;
    thumbnailUrl: string | null;
    createdAtTwitch: Date | null;
    durationSeconds: number;
  }>
) {
  return vodRows.map((row) => ({
    id: `db-vod-${row.videoId}`,
    url: row.url,
    embed_url: row.url,
    broadcaster_id: row.twitchUserId,
    broadcaster_name: row.twitchUserName,
    creator_id: row.twitchUserId,
    creator_name: row.twitchUserName,
    video_id: row.videoId,
    game_id: "27971",
    language: "",
    title: `[DB VOD] ${row.title}`,
    view_count: 0,
    created_at: row.createdAtTwitch?.toISOString() ?? new Date().toISOString(),
    thumbnail_url: (row.thumbnailUrl ?? "")
      .replace("%{width}", "640")
      .replace("%{height}", "360"),
    duration: row.durationSeconds,
  }));
}

type PubgLinkRunLogInput = {
  source: string;
  status: "ok" | "empty" | "error";
  playerName?: string;
  platform?: string;
  requestedShard?: string;
  resolvedShard?: string;
  encountersFound?: number;
  clipsReturned?: number;
  activeIndexMatches?: number;
  activeOverlapMatches?: number;
  directLoginMatches?: number;
  searchChannelMatches?: number;
  vodMoments?: number;
  channelsWithClips?: number;
  linkEventsQueued?: number;
  linkEventsPersisted?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

async function writePubgLinkRunLog(input: PubgLinkRunLogInput) {
  try {
    await prisma.pubgLinkRunLog.create({
      data: {
        source: input.source,
        status: input.status,
        playerName: input.playerName,
        platform: input.platform,
        requestedShard: input.requestedShard,
        resolvedShard: input.resolvedShard,
        encountersFound: input.encountersFound ?? 0,
        clipsReturned: input.clipsReturned ?? 0,
        activeIndexMatches: input.activeIndexMatches ?? 0,
        activeOverlapMatches: input.activeOverlapMatches ?? 0,
        directLoginMatches: input.directLoginMatches ?? 0,
        searchChannelMatches: input.searchChannelMatches ?? 0,
        vodMoments: input.vodMoments ?? 0,
        channelsWithClips: input.channelsWithClips ?? 0,
        linkEventsQueued: input.linkEventsQueued ?? 0,
        linkEventsPersisted: input.linkEventsPersisted ?? 0,
        errorMessage: input.errorMessage,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
      }
    });
  } catch (error) {
    console.error("[pubg-clips] failed to write run log", error);
  }
}

function pickClosestVodMoment(
  videos: Array<{
    created_at: string;
    duration: string;
    url: string;
    thumbnail_url: string;
    title: string;
    user_name: string;
    user_login: string;
    user_id: string;
    id: string;
  }>,
  encounterIso: string | null
) {
  if (!encounterIso || !videos.length) return null;

  const encounterTime = Date.parse(encounterIso);
  if (Number.isNaN(encounterTime)) return null;

  let best: {
    video: (typeof videos)[number];
    offsetSeconds: number;
    delta: number;
  } | null = null;

  for (const video of videos) {
    const start = Date.parse(video.created_at);
    if (Number.isNaN(start)) continue;

    const durationSeconds = parseTwitchDurationToSeconds(video.duration);
    if (durationSeconds <= 0) continue;

    const end = start + durationSeconds * 1000;
    const rawOffset = Math.floor((encounterTime - start) / 1000) - 20;
    const offsetSeconds = Math.max(0, Math.min(rawOffset, Math.max(0, durationSeconds - 1)));

    const outside = encounterTime < start || encounterTime > end;
    const delta = outside ? Math.min(Math.abs(encounterTime - start), Math.abs(encounterTime - end)) : 0;

    if (!best || delta < best.delta) {
      best = { video, offsetSeconds, delta };
    }
  }

  return best;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const probeMode = searchParams.get("probe") === "1";
  const streamer = searchParams.get("streamer")?.trim().toLowerCase() ?? "";
  const playerName = searchParams.get("playerName")?.trim() ?? "";
  const requestedShard = searchParams.get("shard")?.trim().toLowerCase() ?? "";
  const platform = parsePlatform(searchParams.get("platform")?.trim().toLowerCase() ?? "steam");
  const limit = Number(searchParams.get("limit") ?? "20");
  const verboseMessages: string[] = [];

  const pushVerbose = (message: string) => {
    if (verboseMessages.length >= 200) return;
    verboseMessages.push(`${new Date().toISOString()} ${message}`);
  };

  pushVerbose(
    `request start mode=${playerName ? "encounters" : streamer ? "streamer" : "pubg"} player=${playerName || "-"} streamer=${streamer || "-"} platform=${platform} requestedShard=${requestedShard || "-"} limit=${limit} probe=${probeMode ? "1" : "0"}`
  );

  setPubgCallContext(playerName ? "clips_encounters" : streamer ? "clips_streamer" : "clips_pubg");
  try {
    if (playerName) {
      pushVerbose(`encounters lookup start player=${playerName}`);
      const cachedPlayer = await resolveCachedPubgPlayer({
        playerName,
        platform,
        preferredShard: requestedShard || undefined,
      }).catch(() => null);

      if (cachedPlayer) {
        pushVerbose(
          `encounters lookup cache-hit source=${cachedPlayer.source} player=${cachedPlayer.playerName} shard=${cachedPlayer.shard}`
        );
      }

      if (!cachedPlayer) {
        pushVerbose("encounters lookup result=not_found");
        await writePubgLinkRunLog({
          source: "encounters",
          status: "empty",
          playerName,
          platform,
          requestedShard,
          encountersFound: 0,
          clipsReturned: 0,
          errorMessage: "Player not found in local DB cache",
          metadata: { dbOnly: true, verboseMessages }
        });

        return NextResponse.json(
          {
            clips: [],
            source: "encounters",
            error: "Player not found in local DB cache.",
            lookupNeeded: true
          },
          { status: 404 }
        );
      }

      const resolvedPlayer = {
        playerName: cachedPlayer.playerName,
        shard: cachedPlayer.shard,
        matchCount: cachedPlayer.matchCount,
      };

      pushVerbose(`encounters lookup resolved player=${resolvedPlayer.playerName} shard=${resolvedPlayer.shard}`);

      const cachedEncounterClips = await getCachedEncounterClips({
        playerName: resolvedPlayer.playerName,
        platform,
        shard: resolvedPlayer.shard,
        limit
      });
      if (cachedEncounterClips.length) {
        pushVerbose(`cache hit clips=${cachedEncounterClips.length} source=pubgLinkEvent/pubgStreamerVod`);

        await writePubgLinkRunLog({
          source: "encounters",
          status: "ok",
          playerName: resolvedPlayer.playerName,
          platform,
          requestedShard,
          resolvedShard: resolvedPlayer.shard,
          encountersFound: cachedEncounterClips.length,
          clipsReturned: cachedEncounterClips.length,
          metadata: {
            cacheHit: true,
            cacheSource: "pubg_link_event",
            probeMode,
            verboseMessages
          }
        });

        return NextResponse.json({
          clips: cachedEncounterClips,
          source: "encounters",
          profile: { playerName: resolvedPlayer.playerName, shard: resolvedPlayer.shard, platform },
          encountersScanned: 0,
          debug: {
            encountersFound: cachedEncounterClips.length,
            encountersAfterKnownFilter: cachedEncounterClips.length,
            directLoginMatches: 0,
            searchChannelMatches: 0,
            channelsWithClips: 0,
            vodMoments: 0,
            activeIndexMatches: 0,
            activeOverlapMatches: 0,
            linkEventsQueued: 0,
            linkEventsPersisted: 0,
            resolvedShard: resolvedPlayer.shard,
            cacheHit: true
          }
        });
      }

      pushVerbose("cache miss in DB-only mode; returning empty without external lookups");
      await writePubgLinkRunLog({
        source: "encounters",
        status: "empty",
        playerName: resolvedPlayer.playerName,
        platform,
        requestedShard,
        resolvedShard: resolvedPlayer.shard,
        encountersFound: 0,
        clipsReturned: 0,
        metadata: {
          dbOnly: true,
          cacheHit: false,
          probeMode,
          verboseMessages
        }
      });

      return NextResponse.json({
        clips: [],
        source: "encounters",
        profile: { playerName: resolvedPlayer.playerName, shard: resolvedPlayer.shard, platform },
        encountersScanned: 0,
        debug: {
          encountersFound: 0,
          encountersAfterKnownFilter: 0,
          directLoginMatches: 0,
          searchChannelMatches: 0,
          channelsWithClips: 0,
          vodMoments: 0,
          activeIndexMatches: 0,
          activeOverlapMatches: 0,
          linkEventsQueued: 0,
          linkEventsPersisted: 0,
          resolvedShard: resolvedPlayer.shard,
          dbOnly: true,
          cacheHit: false
        }
      });
    }

    if (streamer) {
      pushVerbose(`streamer mode start streamer=${streamer}`);
      const vodRows = await prisma.pubgStreamerVod.findMany({
        where: { twitchUserLogin: streamer },
        orderBy: [{ createdAtTwitch: "desc" }, { indexedAt: "desc" }],
        take: Math.max(1, Math.min(limit, 60)),
        select: {
          videoId: true,
          twitchUserId: true,
          twitchUserLogin: true,
          twitchUserName: true,
          title: true,
          url: true,
          thumbnailUrl: true,
          createdAtTwitch: true,
          durationSeconds: true
        }
      });

      const clips = mapVodRowsToClipShape(vodRows);
      pushVerbose(`streamer mode db rows=${vodRows.length}`);
      await writePubgLinkRunLog({
        source: "streamer",
        status: clips.length ? "ok" : "empty",
        playerName: streamer,
        clipsReturned: clips.length,
        metadata: { limit, probeMode, dbOnly: true, verboseMessages }
      });
      return NextResponse.json({ clips, source: "streamer", streamer });
    }

    pushVerbose("pubg mode start");
    const vodRows = await prisma.pubgStreamerVod.findMany({
      orderBy: [{ createdAtTwitch: "desc" }, { indexedAt: "desc" }],
      take: Math.max(1, Math.min(limit, 60)),
      select: {
        videoId: true,
        twitchUserId: true,
        twitchUserLogin: true,
        twitchUserName: true,
        title: true,
        url: true,
        thumbnailUrl: true,
        createdAtTwitch: true,
        durationSeconds: true
      }
    });
    const clips = mapVodRowsToClipShape(vodRows);
    pushVerbose(`pubg mode db rows=${vodRows.length}`);
    await writePubgLinkRunLog({
      source: "pubg",
      status: clips.length ? "ok" : "empty",
      clipsReturned: clips.length,
      metadata: { limit, probeMode, dbOnly: true, verboseMessages }
    });
    return NextResponse.json({ clips, source: "pubg" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load clips";
    pushVerbose(`request failed message=${message}`);

    await writePubgLinkRunLog({
      source: playerName ? "encounters" : streamer ? "streamer" : "pubg",
      status: "error",
      playerName: playerName || streamer || undefined,
      platform: playerName ? platform : undefined,
      requestedShard: playerName ? requestedShard : undefined,
      errorMessage: message,
      metadata: { verboseMessages }
    });

    // Missing credentials is a setup issue, return a clear message.
    if (message.toLowerCase().includes("missing twitch credentials")) {
      return NextResponse.json(
        {
          clips: [],
          source: streamer ? "streamer" : "pubg",
          error: "Twitch credentials are not configured",
          setup: "Set TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET or TWITCH_CLIENT/TWITCH_SECRET in your .env"
        },
        { status: 500 }
      );
    }

    if (message.toLowerCase().includes("missing pubg api key")) {
      return NextResponse.json(
        {
          clips: [],
          source: playerName ? "encounters" : streamer ? "streamer" : "pubg",
          error: "PUBG API key is not configured",
          setup: "Set PUBG_DEV_API (or PUBG_API_KEY) in your .env"
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        clips: [],
        source: playerName ? "encounters" : streamer ? "streamer" : "pubg",
        error: message
      },
      { status: 500 }
    );
  } finally {
    clearPubgCallContext();
  }
}
