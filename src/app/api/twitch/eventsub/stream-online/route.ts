import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwitchEventSubSignature } from "@/lib/twitch";
import { autoLinkPubgStreamerIdentity } from "@/lib/pubg-streamer-linking";
import { indexStreamerMatchesAndVods } from "@/lib/pubg-match-vod-indexer";
import {
  clearPubgCallContext,
  indexSeenPlayersFromRecentMatches,
  setPubgCallContext,
  type PubgPlatform
} from "@/lib/pubg-api";

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

function parsePubgPlatform(value: unknown): PubgPlatform | null {
  if (value === "steam" || value === "xbox" || value === "psn") return value;
  return null;
}

function getResolvedIdentityForSeenIndexing(value: unknown): {
  platform: PubgPlatform;
  shard: string;
  pubgPlayerName: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.verified !== true) return null;
  const platform = parsePubgPlatform(row.platform);
  const shard = typeof row.shard === "string" ? row.shard.trim() : "";
  const pubgPlayerName = typeof row.pubgPlayerName === "string" ? row.pubgPlayerName.trim() : "";
  if (!platform || !shard || !pubgPlayerName) return null;
  return { platform, shard, pubgPlayerName };
}

function getLooseIdentityForMatchIndexing(value: unknown): {
  platform: PubgPlatform;
  shard: string;
  pubgPlayerName: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const platform = parsePubgPlatform(row.platform);
  const shard = typeof row.shard === "string" ? row.shard.trim() : "";
  const pubgPlayerName = typeof row.pubgPlayerName === "string" ? row.pubgPlayerName.trim() : "";
  if (!platform || !shard || !pubgPlayerName) return null;
  return { platform, shard, pubgPlayerName };
}

function normalizePubgNameForCacheLookup(value: string) {
  return value.toLowerCase().trim();
}

async function isIdentityPresentInKnownPlayerCache(input: {
  platform: PubgPlatform;
  shard: string;
  pubgPlayerName: string;
}) {
  const playerNameLower = normalizePubgNameForCacheLookup(input.pubgPlayerName);
  if (!playerNameLower) return false;

  const recentDaysRaw = Number(process.env.PUBG_MATCH_INDEX_CACHE_WINDOW_DAYS ?? "21");
  const recentDays = Number.isFinite(recentDaysRaw)
    ? Math.max(1, Math.min(90, Math.floor(recentDaysRaw)))
    : 21;
  const seenSince = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);

  const exactOnShard = await db.pubgKnownPlayer.findFirst({
    where: {
      platform: input.platform,
      shard: input.shard,
      playerNameLower,
      lastSeenAt: { gte: seenSince }
    },
    select: { id: true }
  });
  if (exactOnShard) return true;

  const exactAnyShard = await db.pubgKnownPlayer.findFirst({
    where: {
      platform: input.platform,
      playerNameLower,
      lastSeenAt: { gte: seenSince }
    },
    select: { id: true }
  });

  return Boolean(exactAnyShard);
}

const recentMatchIndexAttempts = new Map<string, number>();

function shouldThrottleMatchIndexAttempt(twitchUserId: string) {
  const cooldownMinRaw = Number(process.env.PUBG_EVENTSUB_MATCH_INDEX_COOLDOWN_MIN ?? "20");
  const cooldownMin = Number.isFinite(cooldownMinRaw)
    ? Math.max(1, Math.min(180, Math.floor(cooldownMinRaw)))
    : 20;
  const cooldownMs = cooldownMin * 60_000;

  const now = Date.now();
  const lastAttempt = recentMatchIndexAttempts.get(twitchUserId) ?? 0;
  if (now - lastAttempt < cooldownMs) {
    const waitMs = cooldownMs - (now - lastAttempt);
    return { throttled: true as const, waitMs, cooldownMin };
  }

  recentMatchIndexAttempts.set(twitchUserId, now);
  return { throttled: false as const, waitMs: 0, cooldownMin };
}

async function processStreamOnlineNotification(input: {
  event: StreamOnlineEvent;
  messageId: string;
  messageType: string;
  subscriptionId: string | null;
}) {
  const { event, messageId, messageType, subscriptionId } = input;
  const twitchUserId = event.broadcaster_user_id;
  const twitchUserLogin = event.broadcaster_user_login;
  const twitchUserName = event.broadcaster_user_name;
  if (!twitchUserId || !twitchUserLogin || !twitchUserName) {
    throw new Error("Missing broadcaster identity on stream.online event");
  }
  const indexedAt = new Date();
  const streamStartAt = event.started_at ? new Date(event.started_at) : indexedAt;
  const normalizedLogin = normalizeForCompare(stripGamingPrefix(twitchUserLogin));
  const normalizedName = normalizeForCompare(stripGamingPrefix(twitchUserName));
  const streamId = event.id ?? `eventsub-${twitchUserId}-${indexedAt.getTime()}`;

  try {
    await db.pubgActiveStreamer.upsert({
      where: { twitchUserId: event.broadcaster_user_id },
      create: {
        twitchUserId,
        streamId,
        userLogin: twitchUserLogin,
        userName: twitchUserName,
        gameId: "493057",
        streamStartedAt: streamStartAt,
        title: "Live (EventSub)",
        normalizedLogin,
        normalizedName,
        indexedAt
      },
      update: {
        streamId,
        userLogin: twitchUserLogin,
        userName: twitchUserName,
        gameId: "493057",
        streamStartedAt: streamStartAt,
        title: "Live (EventSub)",
        normalizedLogin,
        normalizedName,
        indexedAt
      }
    });

    await db.pubgStreamerProfile.upsert({
      where: { twitchUserId },
      create: {
        twitchUserId,
        userLogin: twitchUserLogin,
        userName: twitchUserName,
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
        userLogin: twitchUserLogin,
        userName: twitchUserName,
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

    setPubgCallContext("stream_online");
    const autoLink = await autoLinkPubgStreamerIdentity({
      twitchUserId,
      twitchUserLogin,
      twitchUserName
    }).catch((error) => {
      console.warn("[twitch-eventsub] auto-link failed", {
        broadcasterId: twitchUserId,
        broadcasterLogin: twitchUserLogin,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });

    let seenIndexing: {
      indexed: boolean;
      reason: string;
      scannedMatches: number;
      namesFound: number;
      upserted: number;
      discoveredNew: number;
      observationsLogged: number;
      matchFetchErrors: number;
    } | null = null;
    let matchVodIndexing: {
      indexed: boolean;
      reason: string;
      matchesScanned: number;
      matchesIndexed: number;
      vodsIndexed: number;
      linksMapped: number;
      matchErrors: number;
    } | null = null;

    // For seen-player discovery: only run if current autoLink is verified via PUBG API
    const resolvedIdentity = getResolvedIdentityForSeenIndexing(autoLink);
    console.info("[twitch-eventsub] autoLink result", {
      broadcasterId: twitchUserId,
      broadcasterLogin: twitchUserLogin,
      autoLinkSource: autoLink?.source ?? null,
      autoLinkVerified: (autoLink as Record<string, unknown> | null)?.verified ?? null,
      autoLinkPlatform: (autoLink as Record<string, unknown> | null)?.platform ?? null,
      autoLinkShard: (autoLink as Record<string, unknown> | null)?.shard ?? null,
      resolvedIdentityAvailable: Boolean(resolvedIdentity),
    });

    if (resolvedIdentity) {
      seenIndexing = await indexSeenPlayersFromRecentMatches({
        platform: resolvedIdentity.platform,
        shard: resolvedIdentity.shard,
        playerName: resolvedIdentity.pubgPlayerName,
        maxMatches: Number(process.env.PUBG_EVENTSUB_DISCOVERY_MATCHES ?? "4"),
        maxPlayersPerMatch: Number(process.env.PUBG_EVENTSUB_DISCOVERY_PLAYERS_PER_MATCH ?? "80"),
        discoveredBy: {
          twitchUserId,
          twitchUserLogin,
          twitchUserName
        },
        eventSource: "eventsub_stream_online_discovery"
      }).catch((error) => {
        console.warn("[twitch-eventsub] seen-player indexing failed", {
          broadcasterId: twitchUserId,
          broadcasterLogin: twitchUserLogin,
          platform: resolvedIdentity.platform,
          shard: resolvedIdentity.shard,
          pubgPlayerName: resolvedIdentity.pubgPlayerName,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      });
    }

    // Prefer a real verified identity link, but fall back to any supported link or this event's autolink identity.
    const realIdentityLink = await db.pubgStreamerIdentityLink.findFirst({
      where: {
        twitchUserId,
        platform: {
          in: ["steam", "xbox", "psn"]
        },
        pubgPlayerName: {
          not: ""
        },
        NOT: {
          OR: [
            { pubgPlayerId: { startsWith: "unverified:" } },
            { pubgPlayerId: { startsWith: "login-heuristic:" } },
            { pubgPlayerId: { startsWith: "profile-claim:" } },
          ]
        }
      },
      select: {
        platform: true,
        shard: true,
        pubgPlayerId: true,
        pubgPlayerName: true,
      },
      orderBy: { lastLinkedAt: "desc" }
    });

    const fallbackIdentityLink = realIdentityLink
      ? null
      : await db.pubgStreamerIdentityLink.findFirst({
          where: {
            twitchUserId,
            platform: {
              in: ["steam", "xbox", "psn"]
            },
            pubgPlayerName: {
              not: ""
            }
          },
          select: {
            platform: true,
            shard: true,
            pubgPlayerId: true,
            pubgPlayerName: true,
          },
          orderBy: { lastLinkedAt: "desc" }
        });

    const looseAutoLinkIdentity = getLooseIdentityForMatchIndexing(autoLink);

    const selectedIdentity = realIdentityLink
      ? {
          source: "real_identity_link" as const,
          platform: realIdentityLink.platform as PubgPlatform,
          shard: realIdentityLink.shard,
          pubgPlayerId: realIdentityLink.pubgPlayerId,
          pubgPlayerName: realIdentityLink.pubgPlayerName,
        }
      : fallbackIdentityLink
        ? {
            source: "fallback_identity_link" as const,
            platform: fallbackIdentityLink.platform as PubgPlatform,
            shard: fallbackIdentityLink.shard,
            pubgPlayerId: fallbackIdentityLink.pubgPlayerId,
            pubgPlayerName: fallbackIdentityLink.pubgPlayerName,
          }
        : looseAutoLinkIdentity
          ? {
              source: "autolink_identity" as const,
              platform: looseAutoLinkIdentity.platform,
              shard: looseAutoLinkIdentity.shard,
              pubgPlayerId: `autolink:${looseAutoLinkIdentity.platform}:${looseAutoLinkIdentity.pubgPlayerName.toLowerCase()}`,
              pubgPlayerName: looseAutoLinkIdentity.pubgPlayerName,
            }
          : null;

    console.info("[twitch-eventsub] identity link for match/VOD indexer", {
      broadcasterId: twitchUserId,
      broadcasterLogin: twitchUserLogin,
      identityLinkFound: Boolean(selectedIdentity),
      identitySource: selectedIdentity?.source ?? "none",
      platform: selectedIdentity?.platform ?? null,
      shard: selectedIdentity?.shard ?? null,
      pubgPlayerName: selectedIdentity?.pubgPlayerName ?? null,
      pubgPlayerId: selectedIdentity?.pubgPlayerId
        ? selectedIdentity.pubgPlayerId.slice(0, 12) + "..."
        : null,
    });

    if (!selectedIdentity) {
      matchVodIndexing = {
        indexed: false,
        reason: "missing_identity_for_match_indexing",
        matchesScanned: 0,
        matchesIndexed: 0,
        vodsIndexed: 0,
        linksMapped: 0,
        matchErrors: 0,
      };
    } else {
      if (selectedIdentity.source !== "real_identity_link") {
        const cachedIdentityConfirmed = await isIdentityPresentInKnownPlayerCache({
          platform: selectedIdentity.platform,
          shard: selectedIdentity.shard,
          pubgPlayerName: selectedIdentity.pubgPlayerName,
        }).catch(() => false);

        if (!cachedIdentityConfirmed) {
          matchVodIndexing = {
            indexed: false,
            reason: `identity_not_in_known_player_cache:${selectedIdentity.source}`,
            matchesScanned: 0,
            matchesIndexed: 0,
            vodsIndexed: 0,
            linksMapped: 0,
            matchErrors: 0,
          };
          console.info("[twitch-eventsub] skipping match-vod index attempt due to unconfirmed fallback identity", {
            broadcasterId: twitchUserId,
            broadcasterLogin: twitchUserLogin,
            identitySource: selectedIdentity.source,
            platform: selectedIdentity.platform,
            shard: selectedIdentity.shard,
            pubgPlayerName: selectedIdentity.pubgPlayerName,
          });
        }
      }

      if (!matchVodIndexing) {
      const throttle = shouldThrottleMatchIndexAttempt(twitchUserId);
      if (throttle.throttled) {
        matchVodIndexing = {
          indexed: false,
          reason: `match_index_cooldown_${throttle.cooldownMin}m`,
          matchesScanned: 0,
          matchesIndexed: 0,
          vodsIndexed: 0,
          linksMapped: 0,
          matchErrors: 0,
        };
        console.info("[twitch-eventsub] skipping match-vod index attempt due to cooldown", {
          broadcasterId: twitchUserId,
          broadcasterLogin: twitchUserLogin,
          cooldownMin: throttle.cooldownMin,
          waitMs: throttle.waitMs,
        });
      } else {
      matchVodIndexing = await indexStreamerMatchesAndVods({
        identity: {
          twitchUserId,
          twitchUserLogin,
          twitchUserName,
          platform: selectedIdentity.platform,
          shard: selectedIdentity.shard,
          pubgPlayerId: selectedIdentity.pubgPlayerId,
          pubgPlayerName: selectedIdentity.pubgPlayerName,
        },
        maxMatches: Number(process.env.PUBG_EVENTSUB_MATCH_INDEX_MATCHES ?? "8"),
        maxVods: Number(process.env.PUBG_EVENTSUB_VOD_INDEX_LIMIT ?? "12"),
      }).catch((error) => {
        console.error("[twitch-eventsub] match-vod indexing failed", {
          broadcasterId: twitchUserId,
          broadcasterLogin: twitchUserLogin,
          platform: selectedIdentity.platform,
          shard: selectedIdentity.shard,
          pubgPlayerId: selectedIdentity.pubgPlayerId,
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          indexed: false,
          reason: "match_vod_indexer_exception",
          matchesScanned: 0,
          matchesIndexed: 0,
          vodsIndexed: 0,
          linksMapped: 0,
          matchErrors: 0,
        };
      });
      }
      }
    }

    console.info("[twitch-eventsub] stream.online processed", {
      messageId,
      subscriptionId,
      broadcasterId: twitchUserId,
      broadcasterLogin: twitchUserLogin,
      streamId,
      streamStartAt: streamStartAt.toISOString(),
      autoLink,
      seenIndexing,
      matchVodIndexing
    });
    await writeEventSubRunLog({
      status: "ok",
      playerName: twitchUserLogin,
      metadata: {
        messageType,
        messageId,
        subscriptionId,
        broadcasterId: twitchUserId,
        broadcasterLogin: twitchUserLogin,
        streamId,
        streamStartAt: streamStartAt.toISOString(),
        autoLink,
        seenIndexing,
        matchVodIndexing,
        backgroundProcessed: true
      }
    });
  } catch (error) {
    console.error("[twitch-eventsub] failed to persist stream.online", {
      messageId,
      broadcasterId: twitchUserId,
      error: error instanceof Error ? error.message : String(error)
    });
    await writeEventSubRunLog({
      status: "error",
      playerName: twitchUserLogin,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: {
        messageType,
        messageId,
        subscriptionId,
        broadcasterId: twitchUserId,
        broadcasterLogin: twitchUserLogin,
        backgroundProcessed: true
      }
    });
  } finally {
    clearPubgCallContext();
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
