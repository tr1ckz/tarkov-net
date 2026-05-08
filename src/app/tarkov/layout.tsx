import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  BookOpen,
  CircleDollarSign,
  Compass,
  Crosshair,
  ShieldAlert,
  type LucideIcon
} from "lucide-react";
import { AuthNav } from "@/components/auth-nav";
import { GlobalCommandPalette } from "@/components/global-command-palette";
import { GameModeToggle } from "@/components/game-mode-toggle";
import { LiveCacheRefresh } from "@/components/live-cache-refresh";
import { getCacheStatusToken } from "@/lib/cache-status";
import { gameModeLabel, getGameModeFromCookies } from "@/lib/game-mode";
import { getSession } from "@/lib/session";

const TARKOV_NAV = [
  { href: "/tarkov", label: "Dashboard", icon: BarChart3 },
  { href: "/tarkov/watchlist", label: "Watchlist", icon: BookOpen },
  { href: "/tarkov/ballistics", label: "Ballistics", icon: Crosshair },
  { href: "/tarkov/raid-info", label: "Raid Ops", icon: Compass },
  { href: "/tarkov/market-intel", label: "Economy", icon: CircleDollarSign },
  { href: "/tarkov/cultist-circle", label: "Cultist Circle", icon: ShieldAlert }
];

export default async function TarkovLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const mode = getGameModeFromCookies();
  const refreshToken = await getCacheStatusToken(mode);

  return (
    <>
      <LiveCacheRefresh mode={mode} initialToken={refreshToken} />
      <div className="flex flex-col gap-4">
        <header className="border border-[#2d2d2d] bg-[linear-gradient(90deg,#1a1a1a_0%,#171717_45%,#131313_100%)] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="Escape from Tarkov" width={64} height={64} className="h-16 w-16 object-contain" priority />
                <div>
                  <p className="font-display text-xl uppercase tracking-[0.12em] text-[#e2d2af]">Escape from Tarkov</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">Live EFT economy intelligence for {gameModeLabel(mode)} markets</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <GlobalCommandPalette mode={mode} />
              <GameModeToggle currentMode={mode} />
              <AuthNav
                signedIn={Boolean(session?.user)}
                displayName={session?.user?.name ?? undefined}
                gameName={session?.user?.gameName ?? null}
                role={(session?.user as { role?: string })?.role ?? null}
                basePath="/tarkov"
              />
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 md:flex-row">
          <aside className="border border-[#2d2d2d] bg-[#171717] p-2 md:w-56 md:shrink-0">
            <nav className="flex flex-wrap gap-2 md:flex-col md:gap-1">
              {TARKOV_NAV.map((entry) => (
                <NavLink key={entry.href} href={entry.href} label={entry.label} icon={entry.icon} />
              ))}
            </nav>
          </aside>

          <main className="flex-1">{children}</main>
        </div>
      </div>
    </>
  );
}

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 border border-[#2d2d2d] bg-[#121212] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af] md:px-4"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </Link>
  );
}
