import Link from "next/link";
import Image from "next/image";
import { Crosshair, MapPinned } from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="border border-[#2d2d2d] bg-[radial-gradient(circle_at_20%_20%,#2b2317_0%,#161616_55%,#111_100%)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a9080]">Choose your operation</p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-[0.1em] text-[#e2d2af] sm:text-5xl">Pick A Game</h1>
        <p className="mt-3 max-w-2xl text-sm text-[#b4ab9b] sm:text-base">
          Start with Tarkov market intelligence or jump into PUBG map control guides with secret room callouts.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/tarkov"
          className="group border border-[#49533a] bg-[linear-gradient(145deg,#1a2115_0%,#141a12_50%,#111_100%)] p-5 transition hover:-translate-y-0.5 hover:border-[#8fa070]"
        >
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="Escape from Tarkov" width={72} height={72} className="h-[72px] w-[72px] object-contain" />
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[#8fa070]">Escape from Tarkov</p>
              <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">Tarkov Intel</h2>
            </div>
          </div>
          <p className="mt-4 text-sm text-[#b4ab9b]">Economy, watchlist, raid ops, cultist circle, and live player profile intelligence.</p>
          <div className="mt-4 inline-flex items-center gap-2 border border-[#49533a] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#c8bda0] group-hover:border-[#8fa070]">
            <Crosshair className="h-3.5 w-3.5" />
            Enter Tarkov
          </div>
        </Link>

        <Link
          href="/pubg"
          className="group border border-[#4f4330] bg-[linear-gradient(145deg,#231c12_0%,#1a1711_50%,#111_100%)] p-5 transition hover:-translate-y-0.5 hover:border-[#d7b67a]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-[72px] w-[72px] items-center justify-center border border-[#5e4d34] bg-[#1a1510] text-xs font-black uppercase tracking-[0.14em] text-[#d7b67a]">
              PUBG
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">PlayerUnknown's Battlegrounds</p>
              <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">PUBG Tactical Hub</h2>
            </div>
          </div>
          <p className="mt-4 text-sm text-[#b4ab9b]">Maps, hot drops, secret room key routes, and objective-specific rotation plans.</p>
          <div className="mt-4 inline-flex items-center gap-2 border border-[#5e4d34] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#c8bda0] group-hover:border-[#d7b67a]">
            <MapPinned className="h-3.5 w-3.5" />
            Enter PUBG
          </div>
        </Link>
      </section>
    </div>
  );
}
