import Image from "next/image";
import type { Metadata } from "next";
import "./globals.css";
import { AuthNav } from "@/components/auth-nav";
import { AppSessionProvider } from "@/components/session-provider";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Game Intel Hub",
  description: "Pick a game and jump into live intelligence and tactical guides",
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

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppSessionProvider>
          <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <header className="mb-6 border border-[#2d2d2d] bg-[linear-gradient(90deg,#1a1a1a_0%,#171717_45%,#131313_100%)] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Image src="/logo.png" alt="Game Intel Hub logo" width={64} height={64} className="h-16 w-16 object-contain" priority />
                  <div>
                    <p className="font-display text-xl uppercase tracking-[0.12em] text-[#e2d2af]">Game Intel Hub</p>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">Tarkov and PUBG tactical intelligence</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="/"
                    className="inline-flex h-9 items-center border border-[#5e4d34] bg-[#1a1510] px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#d7b67a]"
                  >
                    Main Hub
                  </a>
                  <AuthNav
                    signedIn={Boolean(session?.user)}
                    displayName={session?.user?.name ?? undefined}
                    gameName={session?.user?.gameName ?? null}
                    role={(session?.user as { role?: string })?.role ?? null}
                    showPlayerStats={false}
                  />
                </div>
              </div>
            </header>
            <main>{children}</main>
          </div>
        </AppSessionProvider>
      </body>
    </html>
  );
}
