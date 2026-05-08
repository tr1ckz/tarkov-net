import { Card, CardTitle } from "@/components/ui/card";
import { getWipeMetaPulse } from "@/lib/market-cache";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

export async function WipeMetaPulseWidget({ mode }: Props) {
  const pulse = await getWipeMetaPulse(mode);

  return (
    <Card className="h-fit">
      <CardTitle className="mb-3">Wipe Meta Pulse</CardTitle>
      {pulse.buckets.length ? (
        <div className="space-y-2 text-sm">
          {pulse.buckets.map((bucket) => (
            <div key={bucket.label} className="border border-[#2d2d2d] bg-[#111] p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#e2d2af]">{bucket.label}</span>
                <span className={bucket.avgPercentChange >= 0 ? "text-[#5e6a4b]" : "text-[#a32a2a]"}>
                  {bucket.avgPercentChange >= 0 ? "+" : ""}
                  {bucket.avgPercentChange.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-[#9a9080]">{bucket.itemCount} tracked items</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#9a9080]">Not enough cached data for category pulse.</p>
      )}
    </Card>
  );
}
