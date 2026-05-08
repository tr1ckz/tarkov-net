import { NextResponse } from "next/server";
import { refreshPubgStreamerIndex } from "@/lib/pubg-streamer-index";
import { autoLinkPubgStreamerProfiles } from "@/lib/pubg-streamer-linking";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function writeIndexerRunLog(input: {
  status: "ok" | "empty" | "error";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.pubgLinkRunLog.create({
      data: {
        source: "twitch-index-refresh",
        status: input.status,
        clipsReturned: 0,
        encountersFound: 0,
        errorMessage: input.errorMessage,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
      }
    });
  } catch (error) {
    console.error("[pubg-twitch-index-refresh] failed to write run log", error);
  }
}

export async function POST(request: Request) {
  const configuredSecret = process.env.PUBG_TWITCH_INDEX_SECRET;
  const providedSecret = request.headers.get("x-index-secret");

  if (configuredSecret && providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshPubgStreamerIndex({ force: true });
    const linking = await autoLinkPubgStreamerProfiles({ liveOnly: true, prioritizeVods: true, limit: 80 });
    await writeIndexerRunLog({
      status: result.refreshed ? "ok" : "empty",
      metadata: {
        refreshed: result.refreshed,
        count: result.count,
        refreshedAt: result.refreshedAt ?? null,
        linkAttempted: linking.attempted,
        linkSucceeded: linking.linked,
        vodPriorityAttempted: linking.vodPriorityAttempted,
        force: true
      }
    });
    return NextResponse.json({ ok: true, ...result, linking });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeIndexerRunLog({
      status: "error",
      errorMessage: message,
      metadata: { force: true }
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
