import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwitchEventSubSignature } from "@/lib/twitch";

export const dynamic = "force-dynamic";

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

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageId = request.headers.get("twitch-eventsub-message-id") ?? "";
  const timestamp = request.headers.get("twitch-eventsub-message-timestamp") ?? "";
  const signature = request.headers.get("twitch-eventsub-message-signature") ?? "";
  const messageType = request.headers.get("twitch-eventsub-message-type") ?? "";
  const secret = process.env.TWITCH_EVENTSUB_SECRET ?? "";

  if (!secret) {
    console.error("[twitch-eventsub] webhook rejected: missing TWITCH_EVENTSUB_SECRET");
    return NextResponse.json({ error: "EventSub secret not configured" }, { status: 500 });
  }

  if (!messageId || !timestamp || !signature || !messageType) {
    console.warn("[twitch-eventsub] webhook rejected: missing required headers", {
      messageType,
      hasMessageId: Boolean(messageId),
      hasTimestamp: Boolean(timestamp),
      hasSignature: Boolean(signature)
    });
    return NextResponse.json({ error: "Missing EventSub headers" }, { status: 400 });
  }

  if (!isFreshTimestamp(timestamp)) {
    console.warn("[twitch-eventsub] webhook rejected: stale timestamp", { timestamp });
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
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: EventSubEnvelope;
  try {
    payload = JSON.parse(rawBody) as EventSubEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (messageType === "webhook_callback_verification") {
    console.info("[twitch-eventsub] webhook challenge accepted", {
      subscriptionId: payload.subscription?.id ?? null,
      subscriptionType: payload.subscription?.type ?? null
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
    return NextResponse.json({ ok: true, revoked: true });
  }

  if (messageType !== "notification") {
    console.warn("[twitch-eventsub] unsupported message type", { messageType, messageId });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = payload.event;
  if (!event?.broadcaster_user_id || !event.broadcaster_user_login || !event.broadcaster_user_name) {
    console.warn("[twitch-eventsub] notification missing broadcaster identity", {
      messageId,
      eventKeys: event ? Object.keys(event) : []
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const indexedAt = new Date();
  const streamStartAt = event.started_at ? new Date(event.started_at) : indexedAt;
  const normalizedLogin = normalizeForCompare(stripGamingPrefix(event.broadcaster_user_login));
  const normalizedName = normalizeForCompare(stripGamingPrefix(event.broadcaster_user_name));
  const streamId = event.id ?? `eventsub-${event.broadcaster_user_id}-${indexedAt.getTime()}`;

  try {
    await prisma.pubgActiveStreamer.upsert({
      where: { twitchUserId: event.broadcaster_user_id },
      create: {
        twitchUserId: event.broadcaster_user_id,
        streamId,
        userLogin: event.broadcaster_user_login,
        userName: event.broadcaster_user_name,
        gameId: "27971",
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
        gameId: "27971",
        streamStartedAt: streamStartAt,
        title: "Live (EventSub)",
        normalizedLogin,
        normalizedName,
        indexedAt
      }
    });

    await prisma.pubgStreamerProfile.upsert({
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
        lastGameId: "27971",
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
        lastGameId: "27971",
        lastStreamStartAt: streamStartAt,
        indexedAt
      }
    });

    await prisma.cacheState.upsert({
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

    console.info("[twitch-eventsub] stream.online processed", {
      messageId,
      subscriptionId: payload.subscription?.id ?? null,
      broadcasterId: event.broadcaster_user_id,
      broadcasterLogin: event.broadcaster_user_login,
      streamId,
      streamStartAt: streamStartAt.toISOString()
    });
  } catch (error) {
    console.error("[twitch-eventsub] failed to persist stream.online", {
      messageId,
      broadcasterId: event.broadcaster_user_id,
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "Failed to persist event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
