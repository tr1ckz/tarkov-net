import { Card, CardTitle } from "@/components/ui/card";
import { getConfidence, getFreshness } from "@/lib/raid-intel-metrics";
import { getRaidIntel } from "@/lib/raid-intel";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

const BOSS_DENSITY: { map: string; bosses: number }[] = [
  { map: "Customs", bosses: 2 },
  { map: "Shoreline", bosses: 2 },
  { map: "Woods", bosses: 2 },
  { map: "Lighthouse", bosses: 2 },
  { map: "Interchange", bosses: 1 },
  { map: "Reserve", bosses: 1 },
  { map: "Factory", bosses: 1 },
  { map: "Streets of Tarkov", bosses: 2 },
  { map: "Ground Zero", bosses: 1 },
  { map: "The Lab", bosses: 1 }
];

function confidenceBonus(label: "High" | "Medium" | "Low") {
  if (label === "High") return 7;
  if (label === "Medium") return 4;
  return 2;
}

function freshnessBonus(label: "Fresh" | "Cooling" | "Stale" | "Unknown") {
  if (label === "Fresh") return 10;
  if (label === "Cooling") return 6;
  if (label === "Stale") return 2;
  return 0;
}

export async function BossHotZonesWidget({ mode }: Props) {
  const intel = await getRaidIntel(mode);
  const freshness = getFreshness(intel.goonsTimestamp);
  const confidence = getConfidence(intel.reportCount, freshness.minutesOld);

  const ranked = BOSS_DENSITY.map((entry) => {
    const goonsBoost = intel.goonsMap && entry.map.toLowerCase() === intel.goonsMap.toLowerCase() ? 20 : 0;
    const score = entry.bosses * 10 + goonsBoost + confidenceBonus(confidence.label) + freshnessBonus(freshness.label);

    return {
      ...entry,
      score,
      boosted: goonsBoost > 0
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <Card className="h-fit">
      <CardTitle className="mb-3">Boss Hot Zones</CardTitle>
      <div className="space-y-2 text-sm">
        {ranked.map((zone, index) => (
          <div key={zone.map} className="border border-[#2d2d2d] bg-[#111] p-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-[0.08em] text-[#9a9080]">#{index + 1}</span>
              <span className="text-xs font-semibold text-[#e2d2af]">Score {zone.score}</span>
            </div>
            <p className="font-semibold text-[#e2d2af]">{zone.map}</p>
            <p className="text-xs text-[#9a9080]">
              {zone.bosses} known boss lane{zone.bosses > 1 ? "s" : ""}
              {zone.boosted ? " · Goons boosted" : ""}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
