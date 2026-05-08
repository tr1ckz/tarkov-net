import Link from "next/link";
import { HideoutCostWidget } from "@/components/hideout-cost-widget";
import { QuestCriticalWidget } from "@/components/quest-critical-widget";
import { TopPriceIncreaseWidget } from "@/components/top-price-increase-widget";
import { WipeMetaPulseWidget } from "@/components/wipe-meta-pulse-widget";
import { Card, CardTitle } from "@/components/ui/card";
import { getGameModeFromCookies } from "@/lib/game-mode";

export const dynamic = "force-dynamic";

export default async function MarketIntelPage() {
  const mode = getGameModeFromCookies();

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="mb-2">Economy Center</CardTitle>
        <p className="text-sm text-[#9a9080]">
          Economy and progression intel: movers, quest pressure, hideout cost drift, and wipe pulse.
        </p>
        <div className="mt-3">
          <Link
            href="/tarkov/cultist-circle"
            className="inline-flex items-center border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af]"
          >
            Full Cultist Circle Sheet
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <TopPriceIncreaseWidget mode={mode} />
        <QuestCriticalWidget mode={mode} />
        <HideoutCostWidget mode={mode} />
        <WipeMetaPulseWidget mode={mode} />
      </div>
    </div>
  );
}

