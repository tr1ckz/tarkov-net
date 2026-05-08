import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { pubgMaps } from "@/lib/pubg-data";

type Props = {
  params: { slug: string };
};

export default function PubgMapDetailPage({ params }: Props) {
  const map = pubgMaps.find((entry) => entry.slug === params.slug);

  if (!map) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="mb-2">{map.name}</CardTitle>
        <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">{map.sizeKm} • {map.terrain}</p>
        <p className="mt-2 text-sm text-[#c8bda0]"><span className="text-[#d7b67a]">Best for:</span> {map.bestFor}</p>
      </Card>

      <Card>
        <CardTitle className="mb-3">Hot Drops and Flow</CardTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-[#2d2d2d] bg-[#121212] p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">Hot Drops</p>
            <div className="mt-2 space-y-1 text-sm text-[#c8bda0]">
              {map.hotDrops.map((drop) => (
                <p key={drop}>• {drop}</p>
              ))}
            </div>
          </div>
          <div className="border border-[#2d2d2d] bg-[#121212] p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">Midgame Focus</p>
            <p className="mt-2 text-sm text-[#c8bda0]">{map.midgameFocus}</p>
          </div>
          <div className="border border-[#2d2d2d] bg-[#121212] p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">Endgame Notes</p>
            <p className="mt-2 text-sm text-[#c8bda0]">{map.endgameNotes}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Secret Rooms and High-Value Access</CardTitle>
        {map.secretRooms.length ? (
          <div className="space-y-3">
            {map.secretRooms.map((room) => (
              <div key={room.name} className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#e2d2af]">{room.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#9a9080]">Location: {room.mapGridArea}</p>
                <p className="mt-2 text-sm text-[#c8bda0]"><span className="text-[#d7b67a]">Access:</span> {room.howToOpen}</p>
                <p className="mt-1 text-sm text-[#c8bda0]"><span className="text-[#d7b67a]">Expected loot:</span> {room.expectedLoot}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#9a9080]">Risk level: {room.risk}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#c8bda0]">No stable secret-room route is currently listed for this map. Focus on high-value compounds and vehicle timing.</p>
        )}
      </Card>

      <Link href="/pubg/maps" className="inline-flex border border-[#5e4d34] bg-[#1a1510] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#d7b67a]">
        Back to PUBG Maps
      </Link>
    </div>
  );
}
