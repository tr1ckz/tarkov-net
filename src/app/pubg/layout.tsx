import { pubgMaps } from "@/lib/pubg-data";

export default function PubgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="border border-[#2d2d2d] bg-[linear-gradient(120deg,#20180f_0%,#171310_45%,#111_100%)] p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-[#d7b67a]">PLAYERUNKNOWN'S BATTLEGROUNDS</p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-[0.1em] text-[#f1d6aa]">PUBG Maps</h1>
      </header>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <aside className="border border-[#2d2d2d] bg-[#141414] p-2 lg:w-48 lg:shrink-0">
          <nav className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            <a
              href="/pubg/clips"
              className="flex items-center justify-between border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#f5c842] hover:text-[#f5c842]"
            >
              <span>Clips</span>
              <span className="text-[10px] text-[#5a5450]">Live</span>
            </a>
            {pubgMaps.map((map) => (
              <a
                key={map.slug}
                href={`/pubg/maps/${map.slug}`}
                className="flex items-center justify-between border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#f5c842] hover:text-[#f5c842]"
              >
                <span>{map.name}</span>
                <span className="text-[10px] text-[#5a5450]">{map.sizeKm}</span>
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
