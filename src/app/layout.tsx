import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  BarChart3,
  BookOpen,
  CircleDollarSign,
  Compass,
  Crosshair,
  ShieldAlert,
  type LucideIcon
} from "lucide-react";
import "./globals.css";
import { AuthNav } from "@/components/auth-nav";
import { GlobalCommandPalette } from "@/components/global-command-palette";
import { GameModeToggle } from "@/components/game-mode-toggle";
import { LiveCacheRefresh } from "@/components/live-cache-refresh";
import { getCacheStatusToken } from "@/lib/cache-status";
import { gameModeLabel, getGameModeFromCookies } from "@/lib/game-mode";
import { getSession } from "@/lib/session";

const PRIMARY_NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/watchlist", label: "Watchlist", icon: BookOpen },
  { href: "/ballistics", label: "Ballistics", icon: Crosshair },
  { href: "/raid-info", label: "Raid Ops", icon: Compass },
  { href: "/market-intel", label: "Economy", icon: CircleDollarSign },
  { href: "/cultist-circle", label: "Cultist Circle", icon: ShieldAlert }
];

export const metadata: Metadata = {
  title: "TARKOV NET",
  description: "A dark-web styled Tarkov market network with PvP, PvE, and Arena intelligence",
  icons: {
    icon: "/logo.png"
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const mode = getGameModeFromCookies();
  const refreshToken = await getCacheStatusToken(mode);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <LiveCacheRefresh mode={mode} initialToken={refreshToken} />
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-4 border border-[#2d2d2d] bg-[linear-gradient(90deg,#1a1a1a_0%,#171717_45%,#131313_100%)] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <Image src="/logo.png" alt="TARKOV NET logo" width={44} height={44} className="h-11 w-11 object-contain" priority />
                  <h1 className="font-display text-3xl uppercase tracking-[0.12em] text-[#e2d2af]">TARKOV NET</h1>
                </div>
                <p className="text-sm text-[#9a9080]">
                  Live EFT economy intelligence for {gameModeLabel(mode)} markets
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <GlobalCommandPalette mode={mode} />
                <GameModeToggle currentMode={mode} />
                <AuthNav
                  signedIn={Boolean(session?.user)}
                  displayName={session?.user?.name ?? undefined}
                  gameName={session?.user?.gameName ?? null}
                />
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 md:flex-row">
            <aside className="border border-[#2d2d2d] bg-[#171717] p-2 md:w-56 md:shrink-0">
              <nav className="flex flex-wrap gap-2 md:flex-col md:gap-1">
                {PRIMARY_NAV.map((entry) => (
                  <NavLink key={entry.href} href={entry.href} label={entry.label} icon={entry.icon} />
                ))}
              </nav>
            </aside>

            <main className="flex-1">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
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
