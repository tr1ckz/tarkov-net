import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { pubgMaps } from "@/lib/pubg-data";

export default function PubgMapsPage() {
  return (
    <Card>
      <CardTitle className="mb-3">PUBG Maps Intel</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">Choose a map to view terrain, hot drops, endgame patterns, and secret-room routes.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pubgMaps.map((map) => (
          <Link
            key={map.slug}
            href={`/pubg/maps/${map.slug}`}
            className="border border-[#2d2d2d] bg-[#121212] p-3 transition hover:border-[#d7b67a]"
          >
            <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">{map.sizeKm}</p>
            <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">{map.name}</h2>
            <p className="mt-1 text-xs text-[#b4ab9b]">{map.bestFor}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#d7b67a]">Secret rooms: {map.secretRooms.length}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
