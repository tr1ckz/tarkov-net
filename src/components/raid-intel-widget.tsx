import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EftRaidClocks } from "@/components/eft-raid-clocks";
import { gameModeLabel } from "@/lib/game-mode";
import { getConfidence, getFreshness } from "@/lib/raid-intel-metrics";
import { getRaidIntel } from "@/lib/raid-intel";
import { formatDateTime, formatRelativeTime, formatTimeOfDay } from "@/lib/utils";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

function getEstimatedRaidEnd(goonsTimestamp: string | null, raidDurationMinutes: number | null) {
  if (!goonsTimestamp || !raidDurationMinutes) {
    return null;
  }

  const start = new Date(goonsTimestamp);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start.getTime() + raidDurationMinutes * 60 * 1000);
  const isExpired = end.getTime() < Date.now();

  return {
    end,
    isExpired
  };
}

export async function RaidIntelWidget({ mode }: Props) {
  const intel = await getRaidIntel(mode);
  const freshness = getFreshness(intel.goonsTimestamp);
  const confidence = getConfidence(intel.reportCount, freshness.minutesOld);
  const estimatedRaidEnd = getEstimatedRaidEnd(intel.goonsTimestamp, intel.raidDurationMinutes);

  return (
    <Card className="h-fit">
      <CardTitle className="mb-3">Raid Intel</CardTitle>

      <div className="mb-3 flex items-center justify-between">
        <Badge>{gameModeLabel(mode)} feed</Badge>
        <span className="text-xs text-muted-foreground">Live</span>
      </div>

      <div className="space-y-3 text-sm">
        <div className="rounded border border-border bg-secondary/30 p-3">
          <p className="text-xs uppercase text-muted-foreground">EFT Raid Clocks</p>
          <EftRaidClocks />
        </div>

        <div className="rounded border border-border bg-secondary/30 p-3">
          <p className="text-xs uppercase text-muted-foreground">Goons Last Reported</p>
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-semibold">{intel.goonsMap ?? "Unknown"}</p>
            <span className={`text-xs font-semibold uppercase tracking-[0.08em] ${freshness.tone}`}>
              {freshness.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {intel.goonsTimestamp
              ? `${formatRelativeTime(intel.goonsTimestamp)} · ${formatDateTime(intel.goonsTimestamp)}`
              : "No recent goon report"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className={`font-semibold ${confidence.tone}`}>Confidence: {confidence.label}</span>
            <span className="text-muted-foreground">
              {intel.reportCount ? `${intel.reportCount} reports` : "No report count"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {freshness.minutesOld === null ? "No timestamp available" : `${freshness.minutesOld}m old signal`}
          </p>
        </div>

        <div className="rounded border border-border bg-secondary/30 p-3">
          <p className="text-xs uppercase text-muted-foreground">Map + Duration</p>
          <p className="font-semibold">{intel.reportedMap ?? "Unknown map"}</p>
          <p className="text-xs text-muted-foreground">
            {intel.raidDurationMinutes ? `${intel.raidDurationMinutes} min raid (${gameModeLabel(mode)})` : "No raid duration data"}
          </p>
        </div>

        <div className="rounded border border-border bg-secondary/30 p-3">
          <p className="text-xs uppercase text-muted-foreground">Estimated Raid End</p>
          {estimatedRaidEnd ? (
            <>
              <p className={`font-semibold ${estimatedRaidEnd.isExpired ? "text-[#a32a2a]" : "text-[#e2d2af]"}`}>
                {formatTimeOfDay(estimatedRaidEnd.end)}
              </p>
              <p className="text-xs text-muted-foreground">
                {estimatedRaidEnd.isExpired
                  ? `Ended ${formatRelativeTime(estimatedRaidEnd.end)}`
                  : `Ends ${formatRelativeTime(estimatedRaidEnd.end)}`}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Need both timestamp and raid duration.</p>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Source: TarkovPal + tarkov.dev
          {intel.reportCount ? ` · ${intel.reportCount} reports` : ""}
        </div>
      </div>
    </Card>
  );
}
