import { NextResponse } from "next/server";
import { refreshMarketCache } from "@/lib/market-cache";
import { refreshRaidIntelCache } from "@/lib/raid-intel";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.CACHE_REFRESH_SECRET;
  const providedSecret = request.headers.get("x-cache-secret");

  if (configuredSecret && providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await Promise.all([
    refreshMarketCache("regular", { force: true }),
    refreshMarketCache("pve", { force: true }),
    refreshRaidIntelCache("regular", { force: true }),
    refreshRaidIntelCache("pve", { force: true })
  ]);

  return NextResponse.json({ ok: true, refreshed: ["regular", "pve"], raidIntelRefreshed: true });
}
