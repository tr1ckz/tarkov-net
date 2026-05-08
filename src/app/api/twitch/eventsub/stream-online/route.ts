import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwitchEventSubSignature } from "@/lib/twitch";
import stringSimilarity from "string-similarity";

export const dynamic = "force-dynamic";
const db = prisma as any;

type EventSubEnvelope = {
  subscription?: {
    id?: string;
    status?: string;
    type?: string;
    condition?: Record<string, string>;
  };
  challenge?: string;
  event?: {
    id?: string;
    broadcaster_user_id?: string;
    broadcaster_user_login?: string;
    broadcaster_user_name?: string;
    type?: string;
    started_at?: string;
  };
};

type StreamOnlineEvent = NonNullable<EventSubEnvelope["event"]>;

async function writeEventSubRunLog(input: {
  status: "ok" | "empty" | "error";
  playerName?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.pubgLinkRunLog.create({
      data: {
        source: "eventsub",
        status: input.status,
        playerName: input.playerName,
        clipsReturned: 0,
        encountersFound: 0,
        errorMessage: input.errorMessage,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
      }
    });
  } catch (error) {
    console.error("[twitch-eventsub] failed to write run log", error);
  }
}

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripGamingPrefix(value: string) {
  return value
    .toLowerCase()
    .replace(/^(ttv|tv|yt|twitch|tt|live)[\s._-]*/g, "")
    .replace(/[\s._-]*(ttv|tv|yt|twitch|tt|live)$/g, "");
}

function isFreshTimestamp(value: string) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return false;
  const ageMs = Math.abs(Date.now() - ms);
  return ageMs <= 10 * 60 * 1000;
}

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

  const response = await fetch(
    `https://api.pubg.com/shards/${encodeURIComponent(shard)}/players?filter[playerNames]=${encodeURIComponent(playerName)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json"
      },
      cache: "no-store"
    }
  );

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

async function maybeAutoLinkKnownPlayer(event: StreamOnlineEvent) {
  const twitchUserId = event.broadcaster_user_id;
  const twitchUserLogin = event.broadcaster_user_login;
  const twitchUserName = event.broadcaster_user_name;
  if (!twitchUserId || !twitchUserLogin || !twitchUserName) return null;

  const loginNorm = normalizeForLinking(twitchUserLogin);
  const displayNorm = normalizeForLinking(twitchUserName);
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
        twitchUserId,
        platform: best.row.platform
      }
    },
    create: {
      twitchUserId,
      twitchUserLogin,
      twitchUserName,
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
      twitchUserLogin,
      twitchUserName,
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
    twitchUserId,
    twitchUserLogin,
    twitchUserName
  });

  return {
    platform: best.row.platform,
    shard,
    pubgPlayerName: resolved?.playerName ?? best.row.playerName,
    similarity: Math.round(best.similarity * 100),
    verified: Boolean(resolved)
  };
}

async function processStreamOnlineNotification(input: {
  event: StreamOnlineEvent;
  messageId: string;
  messageType: string;
  subscriptionId: string | null;
}) {
  const { event, messageId, messageType, subscriptionId } = input;
  const indexedAt = new Date();
  const streamStartAt = event.started_at ? new Date(event.started_at) : indexedAt;
  const normalizedLogin = normalizeForCompare(stripGamingPrefix(event.broadcaster_user_login ?? ""));
  const normalizedName = normalizeForCompare(stripGamingPrefix(event.broadcaster_user_name ?? ""));
  const streamId = event.id ?? `eventsub-${event.broadcaster_user_id}-${indexedAt.getTime()}`;

  try {
    await db.pubgActiveStreamer.upsert({
      where: { twitchUserId: event.broadcaster_user_id },
      create: {
        twitchUserId: event.broadcaster_user_id,
        streamId,
        userLogin: event.broadcaster_user_login,
        userName: event.broadcaster_user_name,
        gameId: "493057",
        streamStartedAt: streamStartAt,
        title: "Live (EventSub)",
        normalizedLogin,
        normalizedName,
        indexedAt
      },
      update: {
        streamId,
        userLogin: event.broadcaster_user_login,
        userName: event.broadcaster_user_name,
        gameId: "493057",
        streamStartedAt: streamStartAt,
        title: "Live (EventSub)",
        normalizedLogin,
        normalizedName,
        indexedAt
      }
    });

    await db.pubgStreamerProfile.upsert({
      where: { twitchUserId: event.broadcaster_user_id },
      create: {
        twitchUserId: event.broadcaster_user_id,
        userLogin: event.broadcaster_user_login,
        userName: event.broadcaster_user_name,
        normalizedLogin,
        normalizedName,
        firstSeenAt: indexedAt,
        lastSeenAt: indexedAt,
        lastSeenLiveAt: indexedAt,
        isLive: true,
        lastStreamId: streamId,
        lastTitle: "Live (EventSub)",
        lastGameId: "493057",
        lastStreamStartAt: streamStartAt,
        indexedAt
      },
      update: {
        userLogin: event.broadcaster_user_login,
        userName: event.broadcaster_user_name,
        normalizedLogin,
        normalizedName,
        lastSeenAt: indexedAt,
        lastSeenLiveAt: indexedAt,
        isLive: true,
        lastStreamId: streamId,
        lastTitle: "Live (EventSub)",
        lastGameId: "493057",
        lastStreamStartAt: streamStartAt,
        indexedAt
      }
    });

    await db.cacheState.upsert({
      where: { key: "pubg:twitch-index" },
      create: {
        key: "pubg:twitch-index",
        lastRefreshAt: indexedAt,
        refreshInProgress: false,
        refreshStartedAt: null
      },
      update: {
        lastRefreshAt: indexedAt,
        refreshInProgress: false,
        refreshStartedAt: null
      }
    });

    const autoLink = await maybeAutoLinkKnownPlayer(event).catch((error) => {
      console.warn("[twitch-eventsub] known-player auto-link failed", {
        broadcasterId: event.broadcaster_user_id,
        broadcasterLogin: event.broadcaster_user_login,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });

    console.info("[twitch-eventsub] stream.online processed", {
      messageId,
      subscriptionId,
      broadcasterId: event.broadcaster_user_id,
      broadcasterLogin: event.broadcaster_user_login,
      streamId,
      streamStartAt: streamStartAt.toISOString(),
      autoLink
    });
    await writeEventSubRunLog({
      status: "ok",
      playerName: event.broadcaster_user_login,
      metadata: {
        messageType,
        messageId,
        subscriptionId,
        broadcasterId: event.broadcaster_user_id,
        broadcasterLogin: event.broadcaster_user_login,
        streamId,
        streamStartAt: streamStartAt.toISOString(),
        autoLink,
        backgroundProcessed: true
      }
    });
  } catch (error) {
    console.error("[twitch-eventsub] failed to persist stream.online", {
      messageId,
      broadcasterId: event.broadcaster_user_id,
      error: error instanceof Error ? error.message : String(error)
    });
    await writeEventSubRunLog({
      status: "error",
      playerName: event.broadcaster_user_login,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: {
        messageType,
        messageId,
        subscriptionId,
        broadcasterId: event.broadcaster_user_id,
        broadcasterLogin: event.broadcaster_user_login,
        backgroundProcessed: true
      }
    });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageId = request.headers.get("twitch-eventsub-message-id") ?? "";
  const timestamp = request.headers.get("twitch-eventsub-message-timestamp") ?? "";
  const signature = request.headers.get("twitch-eventsub-message-signature") ?? "";
  const messageType = request.headers.get("twitch-eventsub-message-type") ?? "";
  const secret = process.env.TWITCH_EVENTSUB_SECRET ?? "";

  if (!secret) {
    console.error("[twitch-eventsub] webhook rejected: missing TWITCH_EVENTSUB_SECRET");
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "TWITCH_EVENTSUB_SECRET missing",
      metadata: { messageType: "unknown", reason: "missing_secret" }
    });
    return NextResponse.json({ error: "EventSub secret not configured" }, { status: 500 });
  }

  if (!messageId || !timestamp || !signature || !messageType) {
    console.warn("[twitch-eventsub] webhook rejected: missing required headers", {
      messageType,
      hasMessageId: Boolean(messageId),
      hasTimestamp: Boolean(timestamp),
      hasSignature: Boolean(signature)
    });
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "Missing EventSub headers",
      metadata: {
        messageType,
        hasMessageId: Boolean(messageId),
        hasTimestamp: Boolean(timestamp),
        hasSignature: Boolean(signature)
      }
    });
    return NextResponse.json({ error: "Missing EventSub headers" }, { status: 400 });
  }

  if (!isFreshTimestamp(timestamp)) {
    console.warn("[twitch-eventsub] webhook rejected: stale timestamp", { timestamp });
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "Stale EventSub message",
      metadata: { messageType, messageId, timestamp, reason: "stale_timestamp" }
    });
    return NextResponse.json({ error: "Stale EventSub message" }, { status: 403 });
  }

  const signatureValid = verifyTwitchEventSubSignature({
    messageId,
    timestamp,
    body: rawBody,
    signatureHeader: signature,
    secret
  });
  if (!signatureValid) {
    console.warn("[twitch-eventsub] webhook rejected: invalid signature", { messageId, messageType });
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "Invalid EventSub signature",
      metadata: { messageType, messageId, reason: "invalid_signature" }
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: EventSubEnvelope;
  try {
    payload = JSON.parse(rawBody) as EventSubEnvelope;
  } catch {
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "Invalid EventSub JSON payload",
      metadata: { messageType, messageId }
    });
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (messageType === "webhook_callback_verification") {
    console.info("[twitch-eventsub] webhook challenge accepted", {
      subscriptionId: payload.subscription?.id ?? null,
      subscriptionType: payload.subscription?.type ?? null
    });
    await writeEventSubRunLog({
      status: "ok",
      metadata: {
        messageType,
        messageId,
        subscriptionId: payload.subscription?.id ?? null,
        subscriptionType: payload.subscription?.type ?? null,
        verification: true
      }
    });
    return new NextResponse(payload.challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }

  if (messageType === "revocation") {
    console.warn("[twitch-eventsub] subscription revoked", {
      subscriptionId: payload.subscription?.id ?? null,
      status: payload.subscription?.status ?? null,
      type: payload.subscription?.type ?? null,
      condition: payload.subscription?.condition ?? null
    });
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "EventSub subscription revoked",
      metadata: {
        messageType,
        messageId,
        subscriptionId: payload.subscription?.id ?? null,
        status: payload.subscription?.status ?? null
      }
    });
    return NextResponse.json({ ok: true, revoked: true });
  }

  if (messageType !== "notification") {
    console.warn("[twitch-eventsub] unsupported message type", { messageType, messageId });
    await writeEventSubRunLog({
      status: "empty",
      metadata: { messageType, messageId, ignored: true }
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = payload.event;
  if (!event?.broadcaster_user_id || !event.broadcaster_user_login || !event.broadcaster_user_name) {
    console.warn("[twitch-eventsub] notification missing broadcaster identity", {
      messageId,
      eventKeys: event ? Object.keys(event) : []
    });
    await writeEventSubRunLog({
      status: "error",
      errorMessage: "Notification missing broadcaster identity",
      metadata: { messageType, messageId, eventKeys: event ? Object.keys(event) : [] }
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Queue notification processing in background so webhook returns immediately.
  setTimeout(() => {
    void processStreamOnlineNotification({
      event,
      messageId,
      messageType,
      subscriptionId: payload.subscription?.id ?? null
    });
  }, 0);

  await writeEventSubRunLog({
    status: "ok",
    playerName: event.broadcaster_user_login,
    metadata: {
      messageType,
      messageId,
      subscriptionId: payload.subscription?.id ?? null,
      broadcasterId: event.broadcaster_user_id,
      broadcasterLogin: event.broadcaster_user_login,
      queued: true,
      backgroundProcessing: true
    }
  });

  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
