import { BossHotZonesWidget } from "@/components/boss-hot-zones-widget";
import { RaidIntelWidget } from "@/components/raid-intel-widget";
import { TransitRiskWidget } from "@/components/transit-risk-widget";
import { Card, CardTitle } from "@/components/ui/card";
import { getGameModeFromCookies } from "@/lib/game-mode";

export const dynamic = "force-dynamic";

export default async function RaidInfoPage() {
  const mode = getGameModeFromCookies();

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="mb-2">Raid Ops Center</CardTitle>
        <p className="text-sm text-[#9a9080]">
          Raid-only intel surfaces: live reports, boss pressure, and transit risk.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <RaidIntelWidget mode={mode} />
        </div>
        <BossHotZonesWidget mode={mode} />
        <TransitRiskWidget mode={mode} />
      </div>
    </div>
  );
}
