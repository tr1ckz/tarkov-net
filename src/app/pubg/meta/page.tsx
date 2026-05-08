import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { pubgRegions } from "@/lib/pubg-data";

export default function PubgMetaPage() {
  return (
    <Card>
      <CardTitle className="mb-3">Regional PUBG Meta</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">Queue behavior changes by region. Use these as baseline plans for ranked squads.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {pubgRegions.map((region) => (
          <Link
            key={region.region}
            href={`/pubg/meta/${region.region}`}
            className="border border-[#2d2d2d] bg-[#121212] p-3 transition hover:border-[#d7b67a]"
          >
            <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">{region.region}</p>
            <h2 className="mt-1 font-display text-xl uppercase tracking-[0.08em] text-[#e2d2af]">{region.title}</h2>
            <p className="mt-2 text-sm text-[#b4ab9b]">{region.rankedTempo}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
