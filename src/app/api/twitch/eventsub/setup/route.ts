import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStreamOnlineEventSubSubscription } from "@/lib/twitch";

export const dynamic = "force-dynamic";

type SetupRequest = {
  broadcasterUserIds?: string[];
  callbackUrl?: string;
};

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
}

function inferCallbackUrl(request: Request) {
  const explicit = process.env.TWITCH_EVENTSUB_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.NEXTAUTH_URL?.trim();
  if (base) {
    return `${base.replace(/\/+$/, "")}/api/twitch/eventsub/stream-online`;
  }

  return `${new URL(request.url).origin}/api/twitch/eventsub/stream-online`;
}

export async function POST(request: Request) {
  const configuredSecret = process.env.TWITCH_EVENTSUB_SETUP_SECRET;
  const providedSecret = request.headers.get("x-eventsub-secret");
  if (configuredSecret && providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventSubSecret = process.env.TWITCH_EVENTSUB_SECRET?.trim();
  if (!eventSubSecret) {
    return NextResponse.json(
      { error: "Missing TWITCH_EVENTSUB_SECRET" },
      { status: 500 }
    );
  }

  let payload: SetupRequest = {};
  try {
    payload = (await request.json()) as SetupRequest;
  } catch {
    payload = {};
  }

  const callbackUrl = payload.callbackUrl?.trim() || inferCallbackUrl(request);
  const requestedIds = normalizeIds(payload.broadcasterUserIds);

  const knownFromDb = await prisma.pubgStreamerProfile.findMany({
    where: { twitchUserId: { not: "" } },
    select: { twitchUserId: true },
    take: 5000,
    orderBy: [{ vodsEnabled: "desc" }, { lastSeenAt: "desc" }]
  });

  const dbIds = knownFromDb.map((row) => row.twitchUserId);
  const broadcasterUserIds = requestedIds.length
    ? requestedIds
    : Array.from(new Set(dbIds));

  if (!broadcasterUserIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "No broadcaster IDs to subscribe. Provide broadcasterUserIds or seed PubgStreamerProfile first."
      },
      { status: 400 }
    );
  }

  const results: Array<{
    broadcasterUserId: string;
    ok: boolean;
    subscriptionId?: string;
    status?: string;
    error?: string;
  }> = [];

  for (const broadcasterUserId of broadcasterUserIds) {
    try {
      const created = await createStreamOnlineEventSubSubscription({
        broadcasterUserId,
        callbackUrl,
        secret: eventSubSecret
      });

      results.push({
        broadcasterUserId,
        ok: Boolean(created),
        subscriptionId: created?.id,
        status: created?.status
      });
    } catch (error) {
      results.push({
        broadcasterUserId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const okCount = results.filter((row) => row.ok).length;
  const errorCount = results.length - okCount;

  console.info("[twitch-eventsub] setup completed", {
    callbackUrl,
    requestedIds: requestedIds.length,
    subscribedCount: results.length,
    okCount,
    errorCount
  });

  return NextResponse.json({
    ok: errorCount === 0,
    callbackUrl,
    subscribedCount: results.length,
    okCount,
    errorCount,
    results,
    notes: [
      "stream.online subscriptions are per broadcaster and cannot be filtered globally by category.",
      "Keep the 5-minute PUBG game_id indexer enabled for discovery of new broadcasters."
    ]
  });
}
