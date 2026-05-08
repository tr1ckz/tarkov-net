import { notFound } from "next/navigation";
import { pubgMaps } from "@/lib/pubg-data";
import { PubgMapOverlay } from "@/components/pubg-map-overlay";

type Props = {
  params: { slug: string };
};

export default function PubgMapDetailPage({ params }: Props) {
  const map = pubgMaps.find((entry) => entry.slug === params.slug);

  if (!map) {
    notFound();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">{map.name}</h1>
        <span className="text-xs uppercase tracking-[0.12em] text-[#7f7768]">{map.sizeKm}</span>
      </div>

      <PubgMapOverlay map={map} />
    </div>
  );
}
