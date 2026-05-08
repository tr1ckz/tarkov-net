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
  getCandidateShards,
  getRecentEncounterNames,
  lookupPlayerAcrossShards,
  type PubgPlatform
} from "@/lib/pubg-api";
import {
  computeVodOffsetSeconds,
  ensurePubgStreamerIndexFresh,
  findMatchedActiveStreamers
} from "@/lib/pubg-streamer-index";
import { prisma } from "@/lib/prisma";

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
  if (value === "xbox" || value === "psn" || value === "kakao") return value;
  return "steam";
}

function buildLinkDedupeKey(params: {
  eventType: string;
  pubgNameNormalized: string;
  twitchUserId: string;
  twitchStreamId?: string;
  twitchVideoId?: string;
  encounterAt?: string | null;
}) {
  return [
    params.eventType,
    params.pubgNameNormalized,
    params.twitchUserId,
    params.twitchStreamId ?? "na",
    params.twitchVideoId ?? "na",
    params.encounterAt ?? "na"
  ].join(":");
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
  const streamer = searchParams.get("streamer")?.trim().toLowerCase() ?? "";
  const playerName = searchParams.get("playerName")?.trim() ?? "";
  const requestedShard = searchParams.get("shard")?.trim().toLowerCase() ?? "";
  const platform = parsePlatform(searchParams.get("platform")?.trim().toLowerCase() ?? "steam");
  const limit = Number(searchParams.get("limit") ?? "20");

  try {
    if (playerName) {
      const resolvedPlayer = await lookupPlayerAcrossShards({
        playerName,
        platform,
        preferredShard: requestedShard || undefined
      });
      if (!resolvedPlayer) {
        return NextResponse.json(
          {
            clips: [],
            source: "encounters",
            error: "Player not found. Use Lookup Player to resolve platform/shard.",
            lookupNeeded: true,
            searchedShards: getCandidateShards(platform)
          },
          { status: 404 }
        );
      }

      const encounters = await getRecentEncounterNames({
        shard: resolvedPlayer.shard,
        playerName: resolvedPlayer.playerName,
        maxMatches: 7,
        maxOpponents: 25
      });

      const debug = {
        encountersFound: encounters.length,
        directLoginMatches: 0,
        searchChannelMatches: 0,
        channelsWithClips: 0,
        vodMoments: 0,
        activeIndexMatches: 0,
        activeOverlapMatches: 0,
        linkEventsQueued: 0,
        linkEventsPersisted: 0,
        resolvedShard: resolvedPlayer.shard
      };

      const linkEvents: Array<{
        dedupeKey: string;
        eventType: string;
        pubgNameRaw: string;
        pubgNameNormalized: string;
        twitchUserId: string;
        twitchUserLogin: string;
        twitchUserName: string;
        twitchStreamId?: string;
        twitchVideoId?: string;
        shard: string;
        platform: string;
        encounterAt?: Date;
      }> = [];

      await ensurePubgStreamerIndexFresh();

      const clips = [] as Array<{
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
        sourceType: "vod" | "clip";
      }>;

      for (const encounter of encounters) {
        const candidates = new Set<string>(getLoginCandidates(encounter.name));
        const encounterNormalized = normalizeName(encounter.name);

        const matchedLiveStreamers = await findMatchedActiveStreamers(encounter.name);
        if (matchedLiveStreamers.length) {
          debug.activeIndexMatches += matchedLiveStreamers.length;
          for (const streamerMatch of matchedLiveStreamers) {
            candidates.add(streamerMatch.userLogin.toLowerCase());

            const encounterMs = encounter.lastSeenAt ? Date.parse(encounter.lastSeenAt) : Number.NaN;
            const streamStartMs = streamerMatch.streamStartedAt.getTime();
            if (!Number.isNaN(encounterMs) && encounterMs >= streamStartMs) {
              debug.activeOverlapMatches += 1;
              const offset = computeVodOffsetSeconds(encounter.lastSeenAt!, streamerMatch.streamStartedAt.toISOString());
              const liveUrl = `https://www.twitch.tv/${streamerMatch.userLogin}?t=${offset}s`;

              const dedupeKey = buildLinkDedupeKey({
                eventType: "active_live",
                pubgNameNormalized: encounterNormalized,
                twitchUserId: streamerMatch.twitchUserId,
                twitchStreamId: streamerMatch.streamId,
                encounterAt: encounter.lastSeenAt
              });
              linkEvents.push({
                dedupeKey,
                eventType: "active_live",
                pubgNameRaw: encounter.name,
                pubgNameNormalized: encounterNormalized,
                twitchUserId: streamerMatch.twitchUserId,
                twitchUserLogin: streamerMatch.userLogin,
                twitchUserName: streamerMatch.userName,
                twitchStreamId: streamerMatch.streamId,
                shard: resolvedPlayer.shard,
                platform,
                encounterAt: encounter.lastSeenAt ? new Date(encounter.lastSeenAt) : undefined
              });

              clips.push({
                id: `live-${streamerMatch.streamId}-${encounter.name}`,
                url: liveUrl,
                embed_url: liveUrl,
                broadcaster_id: streamerMatch.twitchUserId,
                broadcaster_name: streamerMatch.userName,
                creator_id: streamerMatch.twitchUserId,
                creator_name: streamerMatch.userName,
                video_id: "",
                game_id: "27971",
                language: "",
                title: `[Live POV] ${streamerMatch.title}`,
                view_count: 0,
                created_at: streamerMatch.streamStartedAt.toISOString(),
                thumbnail_url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamerMatch.userLogin}-640x360.jpg`,
                duration: 0,
                encounterWith: encounter.name,
                sourceType: "vod"
              });
              if (clips.length >= limit) break;
            }
          }
        }

        if (clips.length >= limit) break;

        const searched = await searchChannelsByName(encounter.name, 8);
        for (const channel of searched) {
          const loginNormalized = normalizeName(channel.broadcaster_login);
          const displayNormalized = normalizeName(channel.display_name);
          if (
            loginNormalized.includes(encounterNormalized) ||
            encounterNormalized.includes(loginNormalized) ||
            displayNormalized.includes(encounterNormalized) ||
            encounterNormalized.includes(displayNormalized)
          ) {
            candidates.add(channel.broadcaster_login.toLowerCase());
            debug.searchChannelMatches += 1;
          }
        }

        for (const login of candidates) {
          const broadcasterId = await findBroadcasterIdByLogin(login);
          if (!broadcasterId) continue;
          debug.directLoginMatches += 1;

          const videos = await getVideosByUserId(broadcasterId, 8);
          const bestVod = pickClosestVodMoment(videos, encounter.lastSeenAt ?? null);
          if (bestVod) {
            debug.vodMoments += 1;
            const vodUrl = `${bestVod.video.url}?t=${bestVod.offsetSeconds}s`;

            const dedupeKey = buildLinkDedupeKey({
              eventType: "vod_moment",
              pubgNameNormalized: encounterNormalized,
              twitchUserId: bestVod.video.user_id,
              twitchVideoId: bestVod.video.id,
              encounterAt: encounter.lastSeenAt
            });
            linkEvents.push({
              dedupeKey,
              eventType: "vod_moment",
              pubgNameRaw: encounter.name,
              pubgNameNormalized: encounterNormalized,
              twitchUserId: bestVod.video.user_id,
              twitchUserLogin: bestVod.video.user_login,
              twitchUserName: bestVod.video.user_name,
              twitchVideoId: bestVod.video.id,
              shard: resolvedPlayer.shard,
              platform,
              encounterAt: encounter.lastSeenAt ? new Date(encounter.lastSeenAt) : undefined
            });

            clips.push({
              id: `vod-${bestVod.video.id}-${encounter.name}`,
              url: vodUrl,
              embed_url: vodUrl,
              broadcaster_id: bestVod.video.user_id,
              broadcaster_name: bestVod.video.user_name,
              creator_id: bestVod.video.user_id,
              creator_name: bestVod.video.user_name,
              video_id: bestVod.video.id,
              game_id: "",
              language: "",
              title: `[VOD Moment] ${bestVod.video.title}`,
              view_count: 0,
              created_at: bestVod.video.created_at,
              thumbnail_url: bestVod.video.thumbnail_url
                .replace("%{width}", "640")
                .replace("%{height}", "360"),
              duration: 0,
              encounterWith: encounter.name,
              sourceType: "vod"
            });
            if (clips.length >= limit) break;
            continue;
          }

          const found = await getClipsByBroadcasterId(broadcasterId, 2);
          if (found.length) debug.channelsWithClips += 1;

          for (const clip of found) {
            const dedupeKey = buildLinkDedupeKey({
              eventType: "clip_match",
              pubgNameNormalized: encounterNormalized,
              twitchUserId: clip.broadcaster_id,
              twitchVideoId: clip.id,
              encounterAt: encounter.lastSeenAt
            });
            linkEvents.push({
              dedupeKey,
              eventType: "clip_match",
              pubgNameRaw: encounter.name,
              pubgNameNormalized: encounterNormalized,
              twitchUserId: clip.broadcaster_id,
              twitchUserLogin: login,
              twitchUserName: clip.broadcaster_name,
              twitchVideoId: clip.id,
              shard: resolvedPlayer.shard,
              platform,
              encounterAt: encounter.lastSeenAt ? new Date(encounter.lastSeenAt) : undefined
            });

            clips.push({
              ...clip,
              encounterWith: encounter.name,
              sourceType: "clip"
            });
            if (clips.length >= limit) break;
          }

          if (clips.length >= limit) break;
        }

        if (clips.length >= limit) break;
      }

      if (linkEvents.length) {
        debug.linkEventsQueued = linkEvents.length;
        const dedupeKeys = Array.from(new Set(linkEvents.map((event) => event.dedupeKey)));
        const existing = await prisma.pubgLinkEvent.findMany({
          where: { dedupeKey: { in: dedupeKeys } },
          select: { dedupeKey: true }
        });
        const existingKeys = new Set(existing.map((row) => row.dedupeKey));
        const dataToInsert = linkEvents.filter((event) => !existingKeys.has(event.dedupeKey));

        const createManyResult = await prisma.pubgLinkEvent.createMany({
          data: dataToInsert
        });
        debug.linkEventsPersisted = createManyResult.count;
      }

      console.info("[pubg-clips] link metrics", {
        profile: { playerName: resolvedPlayer.playerName, shard: resolvedPlayer.shard, platform },
        debug
      });

      return NextResponse.json({
        clips,
        source: "encounters",
        profile: { playerName: resolvedPlayer.playerName, shard: resolvedPlayer.shard, platform },
        encountersScanned: encounters.length,
        debug
      });
    }

    if (streamer) {
      const broadcasterId = await findBroadcasterIdByLogin(streamer);
      if (!broadcasterId) {
        return NextResponse.json({ clips: [], source: "streamer", streamer });
      }

      const clips = await getClipsByBroadcasterId(broadcasterId, limit);
      return NextResponse.json({ clips, source: "streamer", streamer });
    }

    // Twitch canonical PUBG name is currently PUBG: BATTLEGROUNDS.
    const pubgGameId = await findGameIdByName("PUBG: BATTLEGROUNDS");
    if (!pubgGameId) {
      return NextResponse.json({ clips: [], source: "pubg" });
    }

    const clips = await getClipsByGameId(pubgGameId, limit);
    return NextResponse.json({ clips, source: "pubg" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load clips";

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
  }
}
