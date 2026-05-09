import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SHARDS = ["pc-na", "pc-eu", "pc-as", "pc-krjp", "pc-kakao", "pc-sa", "pc-oc"];

function parseArgs(argv) {
  const args = {
    streamerLogin: null,
    pubgPlayerName: null,
    shard: null,
    matchLimit: 4,
    eventLimit: 40,
    dryRun: false,
    maxCandidates: 120,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--streamer-login" && next) {
      args.streamerLogin = next;
      i += 1;
      continue;
    }
    if (key === "--pubg-player" && next) {
      args.pubgPlayerName = next;
      i += 1;
      continue;
    }
    if (key === "--shard" && next) {
      args.shard = next;
      i += 1;
      continue;
    }
    if (key === "--match-limit" && next) {
      args.matchLimit = Math.max(1, Math.min(12, Number(next)));
      i += 1;
      continue;
    }
    if (key === "--event-limit" && next) {
      args.eventLimit = Math.max(1, Math.min(200, Number(next)));
      i += 1;
      continue;
    }
    if (key === "--max-candidates" && next) {
      args.maxCandidates = Math.max(1, Math.min(500, Number(next)));
      i += 1;
      continue;
    }
    if (key === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function normalizeName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseIso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function parseTwitchDurationToSeconds(raw) {
  if (!raw) return 0;
  const regex = /(\d+)([hms])/g;
  let total = 0;
  let match = regex.exec(raw);
  while (match) {
    const value = Number(match[1]);
    const unit = match[2];
    if (unit === "h") total += value * 3600;
    if (unit === "m") total += value * 60;
    if (unit === "s") total += value;
    match = regex.exec(raw);
  }
  return total;
}

async function getTwitchToken() {
  const clientId = process.env.TWITCH_CLIENT_ID ?? process.env.TWITCH_CLIENT;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? process.env.TWITCH_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch credentials");
  }

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error(`Twitch token fetch failed: ${response.status}`);
  }

  const payload = await response.json();
  return {
    token: payload.access_token,
    clientId,
  };
}

async function getTwitchUserByLogin(login, token, clientId) {
  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
  const response = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.data?.[0] ?? null;
}

async function getVideosByUserId(userId, token, clientId, limit = 12) {
  const url = `https://api.twitch.tv/helix/videos?user_id=${encodeURIComponent(userId)}&type=archive&first=${Math.max(1, Math.min(limit, 20))}`;
  const response = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function pubgGet(path) {
  const apiKey = process.env.PUBG_DEV_API ?? process.env.PUBG_API_KEY;
  if (!apiKey) throw new Error("Missing PUBG API key");

  const response = await fetch(`https://api.pubg.com${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return response.json();
}

async function findPlayerWithMatches(playerName, preferredShard = null) {
  const shards = preferredShard ? [preferredShard, ...DEFAULT_SHARDS.filter((s) => s !== preferredShard)] : DEFAULT_SHARDS;
  for (const shard of shards) {
    const payload = await pubgGet(`/shards/${encodeURIComponent(shard)}/players?filter[playerNames]=${encodeURIComponent(playerName)}`);
    const player = payload?.data?.[0];
    const matchIds = player?.relationships?.matches?.data?.map((entry) => entry.id) ?? [];
    if (player && matchIds.length > 0) {
      return {
        shard,
        playerId: player.id,
        playerName: player.attributes?.name ?? playerName,
        matchIds,
      };
    }
  }
  return null;
}

function chooseBestVodForMatch(matchCreatedAt, vodRows) {
  const matchTime = parseIso(matchCreatedAt);
  if (!matchTime) return null;

  let best = null;
  for (const vod of vodRows) {
    if (!vod.createdAtTwitch || !vod.durationSeconds || vod.durationSeconds <= 0) continue;

    const vodStart = vod.createdAtTwitch;
    const vodEnd = new Date(vodStart.getTime() + vod.durationSeconds * 1000);
    const insideWindow = matchTime >= vodStart && matchTime <= vodEnd;
    const deltaSeconds = insideWindow
      ? 0
      : Math.floor(
          Math.min(
            Math.abs(matchTime.getTime() - vodStart.getTime()),
            Math.abs(matchTime.getTime() - vodEnd.getTime())
          ) / 1000
        );

    if (!best || deltaSeconds < best.deltaSeconds) {
      best = {
        videoId: vod.videoId,
        vodStartedAt: vodStart,
        vodOffsetSeconds: Math.max(0, Math.floor((matchTime.getTime() - vodStart.getTime()) / 1000)),
        deltaSeconds,
        confidenceTag: insideWindow ? "inside_vod" : deltaSeconds <= 900 ? "nearby_15m" : "manual_weak",
      };
    }
  }

  return best;
}

function extractEncounterEvents(telemetryEvents, streamerPubgName, eventLimit) {
  const out = [];
  const normalizedStreamer = normalizeName(streamerPubgName);

  for (const event of telemetryEvents) {
    if (out.length >= eventLimit) break;
    if (event?._T !== "LogPlayerKillV2" && event?._T !== "LogPlayerTakeDamage") continue;

    const attacker = event?.killer?.name ?? event?.attacker?.name ?? null;
    const victim = event?.victim?.name ?? null;
    const eventTs = event?._D ?? null;

    let opponent = null;
    let action = null;

    if (attacker && normalizeName(attacker) === normalizedStreamer && victim && normalizeName(victim) !== normalizedStreamer) {
      opponent = victim;
      action = "attacked_or_killed";
    } else if (victim && normalizeName(victim) === normalizedStreamer && attacker && normalizeName(attacker) !== normalizedStreamer) {
      opponent = attacker;
      action = "attacked_or_killed_by";
    }

    if (!opponent || !eventTs) continue;

    out.push({
      opponent,
      eventTs,
      action,
    });
  }

  return out;
}

async function buildCandidateStreamers(args, token, clientId) {
  if (!args.streamerLogin) {
    return prisma.pubgActiveStreamer.findMany({
      orderBy: { indexedAt: "desc" },
      take: args.maxCandidates,
      select: {
        twitchUserId: true,
        userLogin: true,
        userName: true,
      },
    });
  }

  const twitchUser = await getTwitchUserByLogin(args.streamerLogin, token, clientId);
  if (!twitchUser) return [];
  return [
    {
      twitchUserId: String(twitchUser.id),
      userLogin: String(twitchUser.login),
      userName: String(twitchUser.display_name ?? twitchUser.login),
    },
  ];
}

async function run() {
  const args = parseArgs(process.argv);
  const { token, clientId } = await getTwitchToken();

  const candidates = await buildCandidateStreamers(args, token, clientId);
  if (!candidates.length) {
    console.log(JSON.stringify({ success: false, reason: "no_streamer_candidates" }, null, 2));
    return;
  }

  for (const streamer of candidates) {
    const twitchVideos = await getVideosByUserId(streamer.twitchUserId, token, clientId, 12);
    if (!twitchVideos.length) continue;

    for (const video of twitchVideos) {
      if (args.dryRun) continue;
      await prisma.pubgStreamerVod.upsert({
        where: { videoId: video.id },
        create: {
          twitchUserId: streamer.twitchUserId,
          twitchUserLogin: streamer.userLogin,
          twitchUserName: streamer.userName,
          videoId: video.id,
          title: video.title ?? "",
          url: video.url,
          thumbnailUrl: video.thumbnail_url ?? null,
          durationSeconds: parseTwitchDurationToSeconds(video.duration),
          createdAtTwitch: parseIso(video.created_at),
          publishedAtTwitch: parseIso(video.published_at),
        },
        update: {
          twitchUserLogin: streamer.userLogin,
          twitchUserName: streamer.userName,
          title: video.title ?? "",
          url: video.url,
          thumbnailUrl: video.thumbnail_url ?? null,
          durationSeconds: parseTwitchDurationToSeconds(video.duration),
          createdAtTwitch: parseIso(video.created_at),
          publishedAtTwitch: parseIso(video.published_at),
        },
      });
    }

    const vodRows = await prisma.pubgStreamerVod.findMany({
      where: { twitchUserId: streamer.twitchUserId },
      orderBy: { createdAtTwitch: "desc" },
      take: 12,
    });
    if (!vodRows.length) continue;

    const identityRows = await prisma.pubgStreamerIdentityLink.findMany({
      where: { twitchUserId: streamer.twitchUserId },
      orderBy: [{ confidenceScore: "desc" }, { lastLinkedAt: "desc" }],
      take: 5,
      select: {
        pubgPlayerName: true,
        shard: true,
      },
    });

    const candidatePubgNames = Array.from(
      new Set([
        args.pubgPlayerName,
        streamer.userLogin,
        streamer.userName,
        ...identityRows.map((row) => row.pubgPlayerName),
      ].filter(Boolean))
    );

    let resolved = null;
    for (const candidateName of candidatePubgNames) {
      const preferredShard = args.shard || identityRows.find((row) => row.pubgPlayerName === candidateName)?.shard || null;
      resolved = await findPlayerWithMatches(candidateName, preferredShard);
      if (resolved) break;
    }

    if (!resolved) continue;

    for (const matchId of resolved.matchIds.slice(0, args.matchLimit)) {
      const matchPayload = await pubgGet(`/shards/${encodeURIComponent(resolved.shard)}/matches/${encodeURIComponent(matchId)}`);
      if (!matchPayload?.data) continue;

      const matchCreatedAt = matchPayload.data.attributes?.createdAt ?? null;
      const mapName = matchPayload.data.attributes?.mapName ?? null;
      const gameMode = matchPayload.data.attributes?.gameMode ?? null;
      const telemetryUrl = (matchPayload.included ?? []).find((entry) => entry.type === "asset")?.attributes?.URL ?? null;
      if (!telemetryUrl) continue;

      const telemetryResponse = await fetch(telemetryUrl, { cache: "no-store" }).catch(() => null);
      if (!telemetryResponse?.ok) continue;
      const telemetryEvents = await telemetryResponse.json().catch(() => null);
      if (!Array.isArray(telemetryEvents)) continue;

      const encounters = extractEncounterEvents(telemetryEvents, resolved.playerName, args.eventLimit);
      if (!encounters.length) continue;

      const bestVod = chooseBestVodForMatch(matchCreatedAt, vodRows) || {
        videoId: vodRows[0].videoId,
        vodStartedAt: vodRows[0].createdAtTwitch,
        vodOffsetSeconds: 0,
        deltaSeconds: 999999,
        confidenceTag: "manual_fallback_first_vod",
      };

      if (!args.dryRun) {
        await prisma.pubgStreamerMatch.upsert({
          where: {
            twitchUserId_matchId: {
              twitchUserId: streamer.twitchUserId,
              matchId,
            },
          },
          create: {
            twitchUserId: streamer.twitchUserId,
            twitchUserLogin: streamer.userLogin,
            twitchUserName: streamer.userName,
            platform: "steam",
            shard: resolved.shard,
            pubgPlayerId: resolved.playerId,
            pubgPlayerName: resolved.playerName,
            matchId,
            matchCreatedAt: parseIso(matchCreatedAt),
            mapName,
            gameMode,
            telemetryUrl,
            source: "manual_encounter_map",
          },
          update: {
            twitchUserLogin: streamer.userLogin,
            twitchUserName: streamer.userName,
            platform: "steam",
            shard: resolved.shard,
            pubgPlayerId: resolved.playerId,
            pubgPlayerName: resolved.playerName,
            matchCreatedAt: parseIso(matchCreatedAt),
            mapName,
            gameMode,
            telemetryUrl,
          },
        });

        await prisma.pubgMatchVodLink.upsert({
          where: {
            twitchUserId_matchLink: {
              twitchUserId: streamer.twitchUserId,
              matchId,
            },
          },
          create: {
            twitchUserId: streamer.twitchUserId,
            twitchUserLogin: streamer.userLogin,
            twitchUserName: streamer.userName,
            matchId,
            videoId: bestVod.videoId,
            matchCreatedAt: parseIso(matchCreatedAt),
            vodStartedAt: bestVod.vodStartedAt,
            vodOffsetSeconds: bestVod.vodOffsetSeconds,
            deltaSeconds: bestVod.deltaSeconds,
            confidenceTag: bestVod.confidenceTag,
          },
          update: {
            twitchUserLogin: streamer.userLogin,
            twitchUserName: streamer.userName,
            videoId: bestVod.videoId,
            matchCreatedAt: parseIso(matchCreatedAt),
            vodStartedAt: bestVod.vodStartedAt,
            vodOffsetSeconds: bestVod.vodOffsetSeconds,
            deltaSeconds: bestVod.deltaSeconds,
            confidenceTag: bestVod.confidenceTag,
            linkedAt: new Date(),
          },
        });

        for (const encounter of encounters) {
          const dedupeKey = [
            streamer.twitchUserId,
            matchId,
            "vod_moment",
            normalizeName(encounter.opponent),
            encounter.eventTs,
          ].join(":");

          await prisma.pubgLinkEvent.upsert({
            where: { dedupeKey },
            create: {
              dedupeKey,
              eventType: "vod_moment",
              pubgNameRaw: encounter.opponent,
              pubgNameNormalized: normalizeName(encounter.opponent),
              twitchUserId: streamer.twitchUserId,
              twitchUserLogin: streamer.userLogin,
              twitchUserName: streamer.userName,
              twitchVideoId: bestVod.videoId,
              shard: resolved.shard,
              platform: "steam",
              encounterAt: parseIso(encounter.eventTs),
            },
            update: {
              twitchUserLogin: streamer.userLogin,
              twitchUserName: streamer.userName,
              twitchVideoId: bestVod.videoId,
              shard: resolved.shard,
              platform: "steam",
              encounterAt: parseIso(encounter.eventTs),
            },
          });
        }
      }

      console.log(
        JSON.stringify(
          {
            success: true,
            dryRun: args.dryRun,
            streamer: {
              twitchUserId: streamer.twitchUserId,
              twitchUserLogin: streamer.userLogin,
              twitchUserName: streamer.userName,
            },
            player: {
              pubgPlayerId: resolved.playerId,
              pubgPlayerName: resolved.playerName,
              shard: resolved.shard,
            },
            match: {
              matchId,
              createdAt: matchCreatedAt,
              mapName,
              gameMode,
            },
            mappedToVideoId: bestVod.videoId,
            encountersInserted: encounters.length,
            sampleEncounter: encounters[0],
          },
          null,
          2
        )
      );
      return;
    }
  }

  console.log(JSON.stringify({ success: false, reason: "no_candidate_with_match_telemetry_encounters" }, null, 2));
}

run()
  .catch((error) => {
    console.error("[manual-pubg-encounter-map] failed", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
