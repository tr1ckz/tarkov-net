import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { buildTarkovProfileUrl, getTarkovProfileJson, type TarkovPlayerProfile } from "@/lib/tarkov-player";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function getCounter(stats: TarkovPlayerProfile["pmcStats"] | TarkovPlayerProfile["scavStats"], ...key: string[]) {
  const counters = stats?.eft?.overAllCounters?.Items ?? [];
  const row = counters.find((entry) => JSON.stringify(entry.Key ?? []) === JSON.stringify(key));
  return row?.Value ?? 0;
}

function formatDuration(totalSeconds?: number) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "n/a";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatLastUpdated(epoch?: number) {
  if (!epoch) {
    return "n/a";
  }

  return new Date(epoch * 1000).toLocaleString();
}

export default async function PlayerStatsPage({
  searchParams
}: {
  searchParams?: { mode?: string };
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      displayName: true,
      gameName: true,
      tarkovProfileId: true,
      tarkovProfileMode: true,
      tarkovPveProfileId: true,
      tarkovArenaProfileId: true
    }
  });

  if (!user) {
    redirect("/login");
  }

  const requestedMode = searchParams?.mode === "pve" ? "pve" : searchParams?.mode === "arena" ? "arena" : "pvp";
  const activeProfileId =
    requestedMode === "pve"
      ? (user.tarkovPveProfileId ?? null)
      : requestedMode === "arena"
        ? (user.tarkovArenaProfileId ?? null)
        : (user.tarkovProfileId ?? null);
  const activeMode = requestedMode === "pve" ? "pve" : requestedMode === "arena" ? "arena" : "regular";

  const profileUrl = activeProfileId
    ? buildTarkovProfileUrl(activeProfileId, activeMode as "regular" | "pve" | "arena")
    : null;

  const profileData = activeProfileId ? await getTarkovProfileJson(activeProfileId, activeMode) : null;
  const pmcRaids = getCounter(profileData?.pmcStats, "Sessions", "Pmc");
  const pmcSurvived = getCounter(profileData?.pmcStats, "ExitStatus", "Survived", "Pmc");
  const pmcDeaths = getCounter(profileData?.pmcStats, "Deaths");
  const pmcKills = getCounter(profileData?.pmcStats, "Kills");
  const pmcKilledPmc = getCounter(profileData?.pmcStats, "KilledPmc");
  const pmcWinStreak = getCounter(profileData?.pmcStats, "LongestWinStreak", "Pmc");
  const survivalRate = pmcRaids > 0 ? Math.round((pmcSurvived / pmcRaids) * 100) : 0;
  const kd = pmcDeaths > 0 ? (pmcKills / pmcDeaths).toFixed(2) : pmcKills > 0 ? "INF" : "0.00";
  const topSkills = [...(profileData?.skills?.Common ?? [])]
    .filter((skill) => typeof skill.Progress === "number" && skill.Id)
    .sort((a, b) => (b.Progress ?? 0) - (a.Progress ?? 0))
    .slice(0, 6);
  const topMastering = [...(profileData?.skills?.Mastering ?? [])]
    .filter((entry) => typeof entry.Progress === "number" && entry.Id)
    .sort((a, b) => (b.Progress ?? 0) - (a.Progress ?? 0))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="mb-2">Player Stats</CardTitle>
            <p className="text-sm text-[#9a9080]">
              Saved player identity for {user.displayName}. Live data is pulled from players.tarkov.dev JSON using IDs auto-resolved from your IGN.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(user.tarkovProfileId || user.tarkovPveProfileId || user.tarkovArenaProfileId) && (
              <>
                <Link
                  href="/tarkov/player-stats"
                  className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] ${
                    requestedMode === "pvp"
                      ? "border-[#e2d2af] bg-[#1a1a1a] text-[#e2d2af]"
                      : "border-[#2d2d2d] bg-[#111] text-[#9a9080] hover:border-[#49533a] hover:text-[#e2d2af]"
                  }`}
                >
                  PvP
                </Link>
                {user.tarkovPveProfileId && (
                  <Link
                    href="/tarkov/player-stats?mode=pve"
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] ${
                      requestedMode === "pve"
                        ? "border-[#e2d2af] bg-[#1a1a1a] text-[#e2d2af]"
                        : "border-[#2d2d2d] bg-[#111] text-[#9a9080] hover:border-[#49533a] hover:text-[#e2d2af]"
                    }`}
                  >
                    PvE
                  </Link>
                )}
                {user.tarkovArenaProfileId && (
                  <Link
                    href="/tarkov/player-stats?mode=arena"
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] ${
                      requestedMode === "arena"
                        ? "border-[#e2d2af] bg-[#1a1a1a] text-[#e2d2af]"
                        : "border-[#2d2d2d] bg-[#111] text-[#9a9080] hover:border-[#49533a] hover:text-[#e2d2af]"
                    }`}
                  >
                    Arena
                  </Link>
                )}
              </>
            )}
            <Link
              href="/tarkov/profile"
              className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af]"
            >
              Edit Profile
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 lg:col-span-2">
          <CardTitle className="mb-1">Linked Player</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Display Name</p>
              <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{user.displayName}</p>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">In-Game Name</p>
              <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{user.gameName ?? "Not set"}</p>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Profile Target</p>
              <p className="mt-1 text-sm font-semibold text-[#e2d2af]">
                {activeProfileId ? `${requestedMode.toUpperCase()} / ${activeProfileId}` : "Not linked"}
              </p>
            </div>
          </div>

          {profileData ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Live Nickname</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{profileData.info?.nickname ?? "n/a"}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Account Time</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{formatDuration(profileData.pmcStats?.eft?.totalInGameTime)}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Last Sync</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{formatLastUpdated(profileData.updated)}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">PMC Raids</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{pmcRaids}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Survival</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{survivalRate}%</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">K/D</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{kd}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Kills</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{pmcKills}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">PMC Kills</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{pmcKilledPmc}</p>
              </div>
              <div className="border border-[#2d2d2d] bg-[#111] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[#7f7768]">Best Win Streak</p>
                <p className="mt-1 text-sm font-semibold text-[#e2d2af]">{pmcWinStreak}</p>
              </div>
            </div>
          ) : null}

          {profileUrl ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="border border-[#49533a] bg-[#151a12] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8d1b2] hover:border-[#5e6a4b] hover:text-[#e2d2af]"
              >
                Open Live Player Profile
              </Link>
              <Link
                href="https://tarkov.dev/players"
                target="_blank"
                rel="noreferrer"
                className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af]"
              >
                Search Tarkov.dev
              </Link>
            </div>
          ) : (
            <div className="border border-[#a32a2a] bg-[#170d0d] p-3 text-sm text-[#d7abab]">
              Add your in-game name on the profile page, then save to auto-link PvP/PvE/Arena profile IDs.
            </div>
          )}

          {user.tarkovProfileId && !profileData && requestedMode === "pvp" ? (
            <div className="border border-[#a32a2a] bg-[#170d0d] p-3 text-sm text-[#d7abab]">
              Unable to load player JSON from players.tarkov.dev for ID {user.tarkovProfileId}. Recheck the ID in Profile settings.
            </div>
          ) : null}
          {user.tarkovPveProfileId && !profileData && requestedMode === "pve" ? (
            <div className="border border-[#a32a2a] bg-[#170d0d] p-3 text-sm text-[#d7abab]">
              Unable to load player JSON from players.tarkov.dev for PvE ID {user.tarkovPveProfileId}. Recheck the ID in Profile settings.
            </div>
          ) : null}
          {user.tarkovArenaProfileId && !profileData && requestedMode === "arena" ? (
            <div className="border border-[#a32a2a] bg-[#170d0d] p-3 text-sm text-[#d7abab]">
              Unable to load player JSON from players.tarkov.dev for Arena ID {user.tarkovArenaProfileId}. Recheck your IGN in Profile settings.
            </div>
          ) : null}
        </Card>

        <Card className="space-y-2">
          <CardTitle className="mb-1">Top Skills</CardTitle>
          {topSkills.length ? (
            <div className="space-y-2">
              {topSkills.map((skill) => (
                <div key={skill.Id} className="border border-[#2d2d2d] bg-[#111] p-2 text-xs">
                  <p className="font-semibold uppercase tracking-[0.08em] text-[#c8bda0]">{skill.Id}</p>
                  <p className="mt-1 text-[#9a9080]">Progress {Math.round(skill.Progress ?? 0)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#9a9080]">No skill data available.</p>
          )}
        </Card>

        <Card className="space-y-2 lg:col-span-3">
          <CardTitle className="mb-1">Weapon Mastery Snapshot</CardTitle>
          {topMastering.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {topMastering.map((entry) => (
                <div key={entry.Id} className="border border-[#2d2d2d] bg-[#111] p-2 text-xs">
                  <p className="font-semibold uppercase tracking-[0.08em] text-[#c8bda0]">{entry.Id}</p>
                  <p className="mt-1 text-[#9a9080]">Progress {Math.round(entry.Progress ?? 0)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#9a9080]">No mastering data available.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
