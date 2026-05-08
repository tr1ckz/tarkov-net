import Link from "next/link";
import { Crosshair, MapPinned } from "lucide-react";

type NavEntry = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PUBG_NAV: NavEntry[] = [
  { href: "/pubg", label: "Maps", icon: Crosshair },
  { href: "/pubg/maps", label: "All Maps", icon: MapPinned },
];

export default function PubgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="border border-[#2d2d2d] bg-[linear-gradient(120deg,#20180f_0%,#171310_45%,#111_100%)] p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-[#d7b67a]">PLAYERUNKNOWN'S BATTLEGROUNDS</p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-[0.1em] text-[#f1d6aa]">PUBG Tactical Control Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#c8bda0]">Map overlays, secret room paths, and region-specific ranked plans for squad-level macro play.</p>
      </header>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <aside className="border border-[#2d2d2d] bg-[#141414] p-2 lg:w-56 lg:shrink-0">
          <nav className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {PUBG_NAV.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="flex items-center gap-2 border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#d7b67a] hover:text-[#f1d6aa]"
              >
                <entry.icon className="h-3.5 w-3.5" />
                {entry.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
