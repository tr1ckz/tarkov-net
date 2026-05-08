import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { getPubgRegionBySlug } from "@/lib/pubg-data";

type Props = {
  params: { region: string };
};

export default function PubgRegionMetaPage({ params }: Props) {
  const region = getPubgRegionBySlug(params.region);

  if (!region) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="mb-2">{region.title}</CardTitle>
        <p className="text-sm text-[#c8bda0]">{region.rankedTempo}</p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardTitle className="mb-3">Loot Route Focus</CardTitle>
          <div className="space-y-2 text-sm text-[#c8bda0]">
            {region.lootRouteFocus.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-3">Vehicle Spawn Priorities</CardTitle>
          <div className="space-y-2 text-sm text-[#c8bda0]">
            {region.vehicleSpawnPriorities.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-3">Ranked Rotation Plan</CardTitle>
          <div className="space-y-2 text-sm text-[#c8bda0]">
            {region.rankedRotationPlan.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-3">Current Map Bias</CardTitle>
        <div className="flex flex-wrap gap-2">
          {region.mapBias.map((map) => (
            <span key={map} className="border border-[#5e4d34] bg-[#1a1510] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af]">
              {map}
            </span>
          ))}
        </div>
      </Card>

      <Link href="/pubg/meta" className="inline-flex border border-[#5e4d34] bg-[#1a1510] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#d7b67a]">
        Back to Regional Meta
      </Link>
    </div>
  );
}
