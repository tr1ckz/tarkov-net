import Link from "next/link";
import { pubgMaps } from "@/lib/pubg-data";

export default function PubgHubPage() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pubgMaps.map((map) => (
        <Link
          key={map.slug}
          href={`/pubg/maps/${map.slug}`}
          className="group relative block overflow-hidden border border-[#2d2d2d] bg-[#111] p-4 transition hover:border-[#f5c842]"
        >
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center opacity-35 transition duration-500 group-hover:scale-110 group-hover:opacity-45"
            style={{
              backgroundImage: `url(${map.mapImage.replace("_High_Res", "_Low_Res")})`
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(10,10,10,0.92)_20%,rgba(12,12,12,0.7)_55%,rgba(10,10,10,0.88)_100%)]" />
          <div className="relative z-10 min-h-[118px]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#5a5450]">{map.sizeKm}</p>
            <h2 className="mt-1 font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af] group-hover:text-[#f5c842]">{map.name}</h2>
            <p className="mt-2 text-xs text-[#7f7768]">{map.terrain}</p>
            {map.secretRooms.length > 0 && (
              <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-[#9a8050]">{map.secretRooms.length} secret rooms</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
