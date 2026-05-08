import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwitchEventSubSignature } from "@/lib/twitch";

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

  const indexedAt = new Date();
  const streamStartAt = event.started_at ? new Date(event.started_at) : indexedAt;
  const normalizedLogin = normalizeForCompare(stripGamingPrefix(event.broadcaster_user_login));
  const normalizedName = normalizeForCompare(stripGamingPrefix(event.broadcaster_user_name));
  const streamId = event.id ?? `eventsub-${event.broadcaster_user_id}-${indexedAt.getTime()}`;

  try {
    await db.pubgActiveStreamer.upsert({
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

    console.info("[twitch-eventsub] stream.online processed", {
      messageId,
      subscriptionId: payload.subscription?.id ?? null,
      broadcasterId: event.broadcaster_user_id,
      broadcasterLogin: event.broadcaster_user_login,
      streamId,
      streamStartAt: streamStartAt.toISOString()
    });
    await writeEventSubRunLog({
      status: "ok",
      playerName: event.broadcaster_user_login,
      metadata: {
        messageType,
        messageId,
        subscriptionId: payload.subscription?.id ?? null,
        broadcasterId: event.broadcaster_user_id,
        broadcasterLogin: event.broadcaster_user_login,
        streamId,
        streamStartAt: streamStartAt.toISOString()
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
        broadcasterId: event.broadcaster_user_id,
        broadcasterLogin: event.broadcaster_user_login
      }
    });
    return NextResponse.json({ error: "Failed to persist event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
