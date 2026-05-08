import { Card, CardTitle } from "@/components/ui/card";
import { getHideoutUpgradeCostTracker } from "@/lib/market-cache";
import { fullPrice } from "@/lib/utils";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

export async function HideoutCostWidget({ mode }: Props) {
  const tracker = await getHideoutUpgradeCostTracker(mode);

  return (
    <Card className="h-fit">
      <CardTitle className="mb-3">Hideout Upgrade Cost</CardTitle>
      <div className="mb-2 border border-[#2d2d2d] bg-[#111] p-2.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#9a9080]">Tracked basket</span>
          <span className="text-[#e2d2af]">{tracker.trackedCount} items</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[#9a9080]">Now</span>
          <span className="text-[#e2d2af]">{fullPrice(tracker.currentTotal)} RUB</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[#9a9080]">24h baseline</span>
          <span className="text-[#c8bda0]">{fullPrice(tracker.avg24hTotal)} RUB</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[#9a9080]">Delta</span>
          <span className={tracker.percentChange >= 0 ? "text-[#a32a2a]" : "text-[#5e6a4b]"}>
            {tracker.percentChange >= 0 ? "+" : ""}
            {tracker.percentChange.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-[#9a9080]">
        {tracker.topInflators.slice(0, 3).map((row) => (
          <div key={row.itemId} className="flex items-center justify-between gap-2 border border-[#2d2d2d] bg-[#111] px-2 py-1.5">
            <span className="truncate">{row.shortName || row.name}</span>
            <span className="text-[#a32a2a]">+{row.percentChange.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
