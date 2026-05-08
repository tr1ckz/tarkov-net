import { Card, CardTitle } from "@/components/ui/card";
import { getConfidence, getFreshness } from "@/lib/raid-intel-metrics";
import { getRaidIntel } from "@/lib/raid-intel";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

const TRANSITS: { from: string; to: string }[] = [
  { from: "Customs", to: "Woods" },
  { from: "Customs", to: "Factory" },
  { from: "Shoreline", to: "Lighthouse" },
  { from: "Reserve", to: "Streets of Tarkov" },
  { from: "Interchange", to: "Streets of Tarkov" },
  { from: "Ground Zero", to: "Streets of Tarkov" },
  { from: "Woods", to: "Lighthouse" }
];

function confidenceRisk(label: "High" | "Medium" | "Low") {
  if (label === "High") return 12;
  if (label === "Medium") return 7;
  return 3;
}

function freshnessRisk(label: "Fresh" | "Cooling" | "Stale" | "Unknown") {
  if (label === "Fresh") return 14;
  if (label === "Cooling") return 8;
  if (label === "Stale") return 4;
  return 0;
}

export async function TransitRiskWidget({ mode }: Props) {
  const intel = await getRaidIntel(mode);
  const freshness = getFreshness(intel.goonsTimestamp);
  const confidence = getConfidence(intel.reportCount, freshness.minutesOld);

  const ranked = TRANSITS.map((link) => {
    const map = intel.goonsMap?.toLowerCase() ?? "";
    const isNearby = link.from.toLowerCase() === map || link.to.toLowerCase() === map;
    const score = 20 + confidenceRisk(confidence.label) + freshnessRisk(freshness.label) + (isNearby ? 22 : 0);

    return {
      ...link,
      score,
      isNearby
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return (
    <Card className="h-fit">
      <CardTitle className="mb-3">Transit Risk</CardTitle>
      <div className="space-y-2 text-sm">
        {ranked.map((link) => (
          <div key={`${link.from}-${link.to}`} className="border border-[#2d2d2d] bg-[#111] p-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-semibold text-[#e2d2af]">
                {link.from} → {link.to}
              </p>
              <span className={`text-xs font-semibold ${link.isNearby ? "text-[#a32a2a]" : "text-[#9a8b4f]"}`}>
                Risk {link.score}
              </span>
            </div>
            <p className="text-xs text-[#9a9080]">
              {link.isNearby ? "Shares lane with latest goons signal" : "No direct goons overlap in latest signal"}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
