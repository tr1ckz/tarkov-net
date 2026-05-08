import { NextResponse } from "next/server";
import { refreshPubgStreamerIndex } from "@/lib/pubg-streamer-index";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.PUBG_TWITCH_INDEX_SECRET;
  const providedSecret = request.headers.get("x-index-secret");

  if (configuredSecret && providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshPubgStreamerIndex({ force: true });
  return NextResponse.json({ ok: true, ...result });
}
