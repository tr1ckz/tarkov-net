import { prisma } from "@/lib/prisma";
import {
  getMatchSummary,
  getPlayerWithMatches,
  lookupPlayerAcrossShards,
  getPlayerTelemetryData,
  type PubgPlatform,
} from "@/lib/pubg-api";
import { getVideosByUserId, parseTwitchDurationToSeconds } from "@/lib/twitch";

const db = prisma as any;

type StreamerIdentityInput = {
  twitchUserId: string;
  twitchUserLogin: string;
  twitchUserName: string;
  platform: PubgPlatform;
  shard: string;
  pubgPlayerId: string;
  pubgPlayerName: string;
};

type MatchIndexRow = {
  matchId: string;
  matchCreatedAt: string | null;
  mapName: string | null;
  gameMode: string | null;
  telemetryUrl: string | null;
};

type VodIndexRow = {
  videoId: string;
  createdAt: string | null;
  publishedAt: string | null;
  durationSeconds: number;
  url: string;
  title: string;
  thumbnailUrl: string | null;
};

function parseIso(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function mapConfidence(deltaSeconds: number, insideWindow: boolean) {
  if (insideWindow && deltaSeconds === 0) return "exact_window";
  if (insideWindow) return "inside_vod";
  if (deltaSeconds <= 300) return "nearby_5m";
  if (deltaSeconds <= 900) return "nearby_15m";
  return "weak";
}

function computeEventVodOffset(eventTimestampIso: string, vodStartedAt: Date | null): number | null {
  if (!vodStartedAt) return null;
  const eventTime = parseIso(eventTimestampIso);
  if (!eventTime) return null;
  return Math.max(0, Math.floor((eventTime.getTime() - vodStartedAt.getTime()) / 1000));
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toDistanceMeters(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function getInteractionDetails(input: {
  kind: "killed_by_streamer" | "killed_streamer" | "knocked_by_streamer" | "knocked_streamer";
  streamerName: string;
}) {
  if (input.kind === "killed_by_streamer") {
    return { type: "killed_by_streamer", title: `Killed by ${input.streamerName}` };
  }
  if (input.kind === "killed_streamer") {
    return { type: "killed_streamer", title: `Killed ${input.streamerName}` };
  }
  if (input.kind === "knocked_by_streamer") {
    return { type: "knocked_by_streamer", title: `Knocked by ${input.streamerName}` };
  }
  return { type: "knocked_streamer", title: `Knocked ${input.streamerName}` };
}

function computeMatchVodMapping(
  matchCreatedAtIso: string | null,
  vods: VodIndexRow[]
): { videoId: string; vodOffsetSeconds: number; deltaSeconds: number; confidenceTag: string; vodStartedAt: Date | null } | null {
  const matchTime = parseIso(matchCreatedAtIso);
  if (!matchTime) return null;

  let best: { videoId: string; vodOffsetSeconds: number; deltaSeconds: number; confidenceTag: string; vodStartedAt: Date | null } | null = null;

  for (const vod of vods) {
    const vodStart = parseIso(vod.createdAt);
    if (!vodStart || vod.durationSeconds <= 0) continue;

    const vodEndMs = vodStart.getTime() + vod.durationSeconds * 1000;
    const matchMs = matchTime.getTime();
    const rawOffset = Math.floor((matchMs - vodStart.getTime()) / 1000) - 20;
    const clampedOffset = Math.max(0, Math.min(rawOffset, Math.max(0, vod.durationSeconds - 1)));

    const insideWindow = matchMs >= vodStart.getTime() && matchMs <= vodEndMs;
    const deltaSeconds = insideWindow
      ? 0
      : Math.floor(
          Math.min(
            Math.abs(matchMs - vodStart.getTime()),
            Math.abs(matchMs - vodEndMs)
          ) / 1000
        );

    const confidenceTag = mapConfidence(deltaSeconds, insideWindow);

    if (!best || deltaSeconds < best.deltaSeconds) {
      best = {
        videoId: vod.videoId,
        vodOffsetSeconds: clampedOffset,
        deltaSeconds,
        confidenceTag,
        vodStartedAt: vodStart,
      };
    }
  }

  return best;
}

export async function indexStreamerMatchesAndVods(options: {
  identity: StreamerIdentityInput;
  maxMatches?: number;
  maxVods?: number;
}) {
  const maxMatches = Math.max(1, Math.min(20, options.maxMatches ?? 8));
  const maxVods = Math.max(1, Math.min(20, options.maxVods ?? 12));
  const identity = options.identity;
  let activeShard = identity.shard;
  let activePlayerName = identity.pubgPlayerName;

  let player = await getPlayerWithMatches(identity.shard, identity.pubgPlayerName).catch((err) => {
    console.error("[pubg-match-vod-indexer] getPlayerWithMatches failed", {
      shard: identity.shard,
      pubgPlayerName: identity.pubgPlayerName,
      twitchUserId: identity.twitchUserId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });

  if (!player) {
    const crossShard = await lookupPlayerAcrossShards({
      playerName: identity.pubgPlayerName,
      platform: identity.platform,
      preferredShard: identity.shard,
    }).catch((err) => {
      console.warn("[pubg-match-vod-indexer] lookupPlayerAcrossShards retry failed", {
        preferredShard: identity.shard,
        platform: identity.platform,
        pubgPlayerName: identity.pubgPlayerName,
        twitchUserId: identity.twitchUserId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

    if (crossShard) {
      activeShard = crossShard.shard;
      activePlayerName = crossShard.playerName;
      player = await getPlayerWithMatches(activeShard, activePlayerName).catch((err) => {
        console.warn("[pubg-match-vod-indexer] cross-shard getPlayerWithMatches failed", {
          shard: activeShard,
          pubgPlayerName: activePlayerName,
          twitchUserId: identity.twitchUserId,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
    }
  }

  if (!player) {
    console.warn("[pubg-match-vod-indexer] player not found or lookup failed, aborting indexer", {
      shard: identity.shard,
      pubgPlayerName: identity.pubgPlayerName,
      twitchUserId: identity.twitchUserId,
    });
    return {
      indexed: false,
      reason: "player_not_found",
      matchesScanned: 0,
      matchesIndexed: 0,
      vodsIndexed: 0,
      identityValidated: false,
      linksMapped: 0,
      matchErrors: 0,
    };
  }

  const matchIds = player.matchIds.slice(0, maxMatches);
  console.info("[pubg-match-vod-indexer] fetching match summaries", {
    twitchUserId: identity.twitchUserId,
    pubgPlayerName: activePlayerName,
    shard: activeShard,
    matchCount: matchIds.length,
    maxMatches,
  });
  const matchRows: MatchIndexRow[] = [];
  let matchErrors = 0;

  for (const matchId of matchIds) {
    const summary = await getMatchSummary(activeShard, matchId).catch((err) => {
      console.warn("[pubg-match-vod-indexer] getMatchSummary failed", {
        matchId,
        shard: activeShard,
        twitchUserId: identity.twitchUserId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (!summary) {
      matchErrors += 1;
      continue;
    }

    matchRows.push({
      matchId: summary.matchId,
      matchCreatedAt: summary.createdAt,
      mapName: summary.mapName,
      gameMode: summary.gameMode,
      telemetryUrl: summary.telemetryUrl,
    });

    await prisma.pubgStreamerMatch.upsert({
      where: {
        twitchUserId_matchId: {
          twitchUserId: identity.twitchUserId,
          matchId: summary.matchId,
        }
      },
      create: {
        twitchUserId: identity.twitchUserId,
        twitchUserLogin: identity.twitchUserLogin,
        twitchUserName: identity.twitchUserName,
        platform: identity.platform,
        shard: activeShard,
        pubgPlayerId: identity.pubgPlayerId,
        pubgPlayerName: activePlayerName,
        matchId: summary.matchId,
        matchCreatedAt: parseIso(summary.createdAt),
        mapName: summary.mapName,
        gameMode: summary.gameMode,
        telemetryUrl: summary.telemetryUrl,
        source: "eventsub_stream_online"
      },
      update: {
        twitchUserLogin: identity.twitchUserLogin,
        twitchUserName: identity.twitchUserName,
        platform: identity.platform,
        shard: activeShard,
        pubgPlayerId: identity.pubgPlayerId,
        pubgPlayerName: activePlayerName,
        matchCreatedAt: parseIso(summary.createdAt),
        mapName: summary.mapName,
        gameMode: summary.gameMode,
        telemetryUrl: summary.telemetryUrl,
      }
    });
  }

  const identityValidated = matchRows.length > 0;

  const videos = await getVideosByUserId(identity.twitchUserId, maxVods).catch((err) => {
    console.error("[pubg-match-vod-indexer] getVideosByUserId (Twitch) failed", {
      twitchUserId: identity.twitchUserId,
      twitchUserLogin: identity.twitchUserLogin,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  });
  console.info("[pubg-match-vod-indexer] vod fetch result", {
    twitchUserId: identity.twitchUserId,
    vodsReturned: videos.length,
    matchRowsReady: matchRows.length,
    identityValidated,
    matchErrors,
  });
  const vodRows: VodIndexRow[] = [];

  for (const video of videos) {
    const durationSeconds = parseTwitchDurationToSeconds(video.duration);
    vodRows.push({
      videoId: video.id,
      createdAt: video.created_at ?? null,
      publishedAt: video.published_at ?? null,
      durationSeconds,
      url: video.url,
      title: video.title,
      thumbnailUrl: video.thumbnail_url ?? null,
    });

    await prisma.pubgStreamerVod.upsert({
      where: { videoId: video.id },
      create: {
        twitchUserId: identity.twitchUserId,
        twitchUserLogin: identity.twitchUserLogin,
        twitchUserName: identity.twitchUserName,
        videoId: video.id,
        title: video.title,
        url: video.url,
        thumbnailUrl: video.thumbnail_url ?? null,
        durationSeconds,
        createdAtTwitch: parseIso(video.created_at),
        publishedAtTwitch: parseIso(video.published_at),
      },
      update: {
        twitchUserLogin: identity.twitchUserLogin,
        twitchUserName: identity.twitchUserName,
        title: video.title,
        url: video.url,
        thumbnailUrl: video.thumbnail_url ?? null,
        durationSeconds,
        createdAtTwitch: parseIso(video.created_at),
        publishedAtTwitch: parseIso(video.published_at),
      }
    });
  }

  let linksMapped = 0;
  let encountersProcessed = 0;
  
  for (const match of matchRows) {
    const mapped = computeMatchVodMapping(match.matchCreatedAt, vodRows);
    if (!mapped) continue;

    await prisma.pubgMatchVodLink.upsert({
      where: {
        twitchUserId_matchLink: {
          twitchUserId: identity.twitchUserId,
          matchId: match.matchId,
        }
      },
      create: {
        twitchUserId: identity.twitchUserId,
        twitchUserLogin: identity.twitchUserLogin,
        twitchUserName: identity.twitchUserName,
        matchId: match.matchId,
        videoId: mapped.videoId,
        matchCreatedAt: parseIso(match.matchCreatedAt),
        vodStartedAt: mapped.vodStartedAt,
        vodOffsetSeconds: mapped.vodOffsetSeconds,
        deltaSeconds: mapped.deltaSeconds,
        confidenceTag: mapped.confidenceTag,
      },
      update: {
        twitchUserLogin: identity.twitchUserLogin,
        twitchUserName: identity.twitchUserName,
        videoId: mapped.videoId,
        matchCreatedAt: parseIso(match.matchCreatedAt),
        vodStartedAt: mapped.vodStartedAt,
        vodOffsetSeconds: mapped.vodOffsetSeconds,
        deltaSeconds: mapped.deltaSeconds,
        confidenceTag: mapped.confidenceTag,
        linkedAt: new Date(),
      }
    });

    linksMapped += 1;

    // Extract and map non-streamer interactions from telemetry
    if (match.telemetryUrl) {
      const streamerData = await getPlayerTelemetryData(activePlayerName, match.telemetryUrl).catch((err) => {
        console.warn("[pubg-match-vod-indexer] failed to extract streamer telemetry", {
          matchId: match.matchId,
          playerName: activePlayerName,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });

      if (streamerData) {
        const persistInteraction = async (input: {
          kind: "killed_by_streamer" | "killed_streamer" | "knocked_by_streamer" | "knocked_streamer";
          counterpartyName: string;
          counterpartyPlayerId?: string | null;
          timestamp: string;
          weapon?: string;
          distance?: number;
        }) => {
          const eventVodOffset = computeEventVodOffset(input.timestamp, mapped.vodStartedAt);
          if (eventVodOffset === null || !input.counterpartyName) return;

          const details = getInteractionDetails({
            kind: input.kind,
            streamerName: identity.twitchUserName || identity.twitchUserLogin,
          });

          const counterpartyNameNormalized = normalizeName(input.counterpartyName);
          if (!counterpartyNameNormalized) return;

          const dedupeKey = [
            identity.twitchUserId,
            match.matchId,
            details.type,
            input.counterpartyPlayerId ?? "na",
            counterpartyNameNormalized,
            input.timestamp,
          ].join("|");

          await db.pubgMatchInteraction.upsert({
            where: { dedupeKey },
            create: {
              dedupeKey,
              twitchUserId: identity.twitchUserId,
              twitchUserLogin: identity.twitchUserLogin,
              twitchUserName: identity.twitchUserName,
              streamerPubgPlayerId: identity.pubgPlayerId,
              streamerPubgPlayerName: activePlayerName,
              counterpartyPubgPlayerId: input.counterpartyPlayerId ?? null,
              counterpartyPubgNameRaw: input.counterpartyName,
              counterpartyPubgNameNormalized: counterpartyNameNormalized,
              interactionType: details.type,
              interactionTitle: details.title,
              platform: identity.platform,
              shard: activeShard,
              matchId: match.matchId,
              matchCreatedAt: parseIso(match.matchCreatedAt),
              encounterAt: parseIso(input.timestamp),
              twitchVideoId: mapped.videoId,
              vodOffsetSeconds: eventVodOffset,
              weapon: input.weapon ?? null,
              distanceMeters: toDistanceMeters(input.distance),
              mapTag: match.mapName,
              gameModeTag: match.gameMode,
            },
            update: {
              twitchUserLogin: identity.twitchUserLogin,
              twitchUserName: identity.twitchUserName,
              streamerPubgPlayerId: identity.pubgPlayerId,
              streamerPubgPlayerName: activePlayerName,
              counterpartyPubgPlayerId: input.counterpartyPlayerId ?? null,
              encounterAt: parseIso(input.timestamp),
              twitchVideoId: mapped.videoId,
              vodOffsetSeconds: eventVodOffset,
              interactionType: details.type,
              interactionTitle: details.title,
              weapon: input.weapon ?? null,
              distanceMeters: toDistanceMeters(input.distance),
              mapTag: match.mapName,
              gameModeTag: match.gameMode,
            }
          });

          encountersProcessed += 1;
        };

        // Streamer killed opponent
        for (const kill of streamerData.kills) {
          await persistInteraction({
            kind: "killed_by_streamer",
            counterpartyName: kill.target,
            counterpartyPlayerId: kill.targetId ?? null,
            timestamp: kill.timestamp,
            weapon: kill.weapon,
            distance: kill.distance,
          }).catch((err) => {
            console.warn("[pubg-match-vod-indexer] failed to store kill interaction", {
              matchId: match.matchId,
              target: kill.target,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        // Streamer was killed by opponent
        for (const death of streamerData.deaths) {
          await persistInteraction({
            kind: "killed_streamer",
            counterpartyName: death.killer,
            counterpartyPlayerId: death.killerId ?? null,
            timestamp: death.timestamp,
            weapon: death.weapon,
            distance: death.distance,
          }).catch((err) => {
            console.warn("[pubg-match-vod-indexer] failed to store death interaction", {
              matchId: match.matchId,
              killer: death.killer,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        // Streamer knocked opponent
        for (const knockout of streamerData.knockouts) {
          await persistInteraction({
            kind: "knocked_by_streamer",
            counterpartyName: knockout.target,
            counterpartyPlayerId: knockout.targetId ?? null,
            timestamp: knockout.timestamp,
            weapon: knockout.weapon,
            distance: knockout.distance,
          }).catch((err) => {
            console.warn("[pubg-match-vod-indexer] failed to store knockout interaction", {
              matchId: match.matchId,
              target: knockout.target,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        // Streamer was knocked by opponent
        for (const knockedOut of streamerData.wasKnockedOut) {
          await persistInteraction({
            kind: "knocked_streamer",
            counterpartyName: knockedOut.knocker,
            counterpartyPlayerId: knockedOut.knockerId ?? null,
            timestamp: knockedOut.timestamp,
            weapon: knockedOut.weapon,
            distance: knockedOut.distance,
          }).catch((err) => {
            console.warn("[pubg-match-vod-indexer] failed to store was-knocked-out interaction", {
              matchId: match.matchId,
              knocker: knockedOut.knocker,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }
  }

  console.info("[pubg-match-vod-indexer] indexing complete", {
    twitchUserId: identity.twitchUserId,
    pubgPlayerName: activePlayerName,
    shard: activeShard,
    matchesScanned: matchIds.length,
    matchesIndexed: matchRows.length,
    vodsIndexed: vodRows.length,
    identityValidated,
    linksMapped,
    encountersProcessed,
    matchErrors,
  });

  return {
    indexed: true,
    reason: "ok",
    matchesScanned: matchIds.length,
    matchesIndexed: matchRows.length,
    vodsIndexed: vodRows.length,
    identityValidated,
    linksMapped,
    matchErrors,
  };
}
