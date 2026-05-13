import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="border border-[#2d2d2d] bg-[radial-gradient(circle_at_20%_20%,#2b2317_0%,#161616_55%,#111_100%)] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a9080]">Choose your operation</p>
          <Image src="/logo.png" alt="PMall" width={220} height={70} className="h-12 w-auto object-contain sm:h-14" />
        </div>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-[0.1em] text-[#e2d2af] sm:text-5xl">Pick A Game</h1>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/tarkov"
          className="group relative aspect-[16/6] overflow-hidden border border-[#49533a] bg-[#0f1310] transition hover:-translate-y-0.5 hover:border-[#8fa070]"
        >
          <Image
            src="/tarkov.jpg"
            alt="Escape from Tarkov"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover object-center opacity-95 transition duration-500 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(8,16,9,0.9)_12%,rgba(9,14,10,0.8)_40%,rgba(6,7,7,0.62)_72%,rgba(6,7,7,0.84)_100%)]" />

          <div className="relative z-10 flex min-h-[110px] flex-col justify-end p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[#8fa070]">Escape from Tarkov</p>
              <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">Tarkov Intel</h2>
            </div>
          </div>
        </Link>

        <Link
          href="/pubg"
          className="group relative aspect-[16/6] overflow-hidden border border-[#4f4330] bg-[#15120d] transition hover:-translate-y-0.5 hover:border-[#d7b67a]"
        >
          <Image
            src="/pubg.avif"
            alt="PUBG"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover object-center opacity-95 transition duration-500 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(19,14,8,0.9)_10%,rgba(17,13,9,0.78)_39%,rgba(9,8,7,0.58)_74%,rgba(9,8,7,0.84)_100%)]" />

          <div className="relative z-10 flex min-h-[110px] flex-col justify-end p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[#d7b67a]">PlayerUnknown's Battlegrounds</p>
              <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">PUBG Tactical Hub</h2>
            </div>
          </div>
        </Link>
      </section>
    </div>
  );
}
