import Link from "next/link";
import { pubgMaps } from "@/lib/pubg-data";

export default function PubgMapsPage() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pubgMaps.map((map) => (
        <Link
          key={map.slug}
          href={`/pubg/maps/${map.slug}`}
          className="group block border border-[#2d2d2d] bg-[#111] p-4 transition hover:border-[#f5c842]"
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#5a5450]">{map.sizeKm}</p>
          <h2 className="mt-1 font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af] group-hover:text-[#f5c842]">{map.name}</h2>
          <p className="mt-2 text-xs text-[#7f7768]">{map.terrain}</p>
          {map.secretRooms.length > 0 && (
            <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-[#9a8050]">{map.secretRooms.length} secret rooms</p>
          )}
        </Link>
      ))}
    </div>
  );
}
