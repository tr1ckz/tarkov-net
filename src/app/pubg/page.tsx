import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { pubgGuides, pubgMaps } from "@/lib/pubg-data";

export default function PubgHubPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="mb-3">PUBG Tactical Hub</CardTitle>
        <p className="text-sm text-muted-foreground">
          Map-by-map control plans, secret room access intel, and practical rotation guidance for squads.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pubgMaps.map((map) => (
            <Link
              key={map.slug}
              href={`/pubg/maps/${map.slug}`}
              className="block border border-[#2d2d2d] bg-[#121212] p-3 transition hover:border-[#d7b67a]"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">{map.sizeKm}</p>
              <h2 className="font-display text-xl uppercase tracking-[0.08em] text-[#e2d2af]">{map.name}</h2>
              <p className="mt-1 text-xs text-[#b4ab9b]">{map.terrain}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#d7b67a]">Secret rooms: {map.secretRooms.length}</p>
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Core PUBG Ops</CardTitle>
        <div className="grid gap-3 md:grid-cols-3">
          {pubgGuides.map((guide) => (
            <div key={guide.title} className="border border-[#2d2d2d] bg-[#111] p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">{guide.title}</p>
              <div className="mt-2 space-y-2 text-sm text-[#c8bda0]">
                {guide.points.map((point) => (
                  <p key={point}>• {point}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Link
        href="/pubg/maps"
        className="inline-flex border border-[#5e4d34] bg-[#1a1510] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#d7b67a]"
      >
        Open Full Map Intel
      </Link>
    </div>
  );
}
