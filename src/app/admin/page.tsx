"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  gameName: string | null;
  role: string;
  isSuspended: boolean;
  createdAt: string;
};

type InviteRow = {
  id: string;
  code: string;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
  usedBy: { id: string; displayName: string; email: string } | null;
};

type PubgLinkingStats = {
  build: {
    gitSha: string;
    nodeEnv: string;
  };
  totals: {
    totalEvents: number;
    totalRuns: number;
    uniquePubgAccounts: number;
    uniqueTwitchAccounts: number;
    uniquePairs: number;
    last24hEvents: number;
    last7dEvents: number;
    runs24h: number;
    runs7d: number;
    runs24hOk: number;
    runs24hEmpty: number;
    runs24hError: number;
    activeIndexerCount: number;
    streamerProfileCount: number;
    streamerProfileLiveCount: number;
  };
  sourceBreakdown: Array<{ eventType: string; count: number }>;
  topPubg: Array<{
    pubgName: string;
    normalized: string;
    linkEvents: number;
    uniqueTwitchAccounts: number;
  }>;
  topTwitch: Array<{
    twitchUserId: string;
    twitchUserLogin: string;
    twitchUserName: string;
    linkEvents: number;
    uniquePubgAccounts: number;
  }>;
  recent: Array<{
    createdAt: string;
    eventType: string;
    pubgNameRaw: string;
    twitchUserLogin: string;
    twitchUserName: string;
    shard: string | null;
    platform: string | null;
    encounterAt: string | null;
  }>;
  recentRuns: Array<{
    createdAt: string;
    source: string;
    status: "ok" | "empty" | "error";
    playerName: string | null;
    platform: string | null;
    requestedShard: string | null;
    resolvedShard: string | null;
    encountersFound: number;
    clipsReturned: number;
    activeIndexMatches: number;
    activeOverlapMatches: number;
    directLoginMatches: number;
    searchChannelMatches: number;
    vodMoments: number;
    channelsWithClips: number;
    linkEventsQueued: number;
    linkEventsPersisted: number;
    errorMessage: string | null;
    verboseMessages: string[];
  }>;
};

type LiveTailRun = {
  id: string;
  createdAt: string;
  source: string;
  status: "ok" | "empty" | "error";
  playerName: string | null;
  platform: string | null;
  requestedShard: string | null;
  resolvedShard: string | null;
  encountersFound: number;
  clipsReturned: number;
  activeIndexMatches: number;
  activeOverlapMatches: number;
  directLoginMatches: number;
  searchChannelMatches: number;
  vodMoments: number;
  channelsWithClips: number;
  linkEventsQueued: number;
  linkEventsPersisted: number;
  errorMessage: string | null;
  verboseMessages: string[];
  metadata?: Record<string, unknown> | null;
};

type LiveTailResponse = {
  generatedAt: string;
  count: number;
  runs: LiveTailRun[];
};

type TwitchIndexStatusResponse = {
  key: string;
  activeStreamerCount: number;
  lastRefreshAt: string | null;
  refreshInProgress: boolean;
  refreshStartedAt: string | null;
  jobHealth?: {
    crawlerHealthy: boolean;
    indexFresh: boolean;
    crawlerLastSeenAt: string | null;
    crawlerLastStatus: "ok" | "empty" | "error" | null;
    crawlerLastError: string | null;
    crawlerMetadata?: Record<string, unknown> | null;
  };
  recentDiagnosticRuns?: Array<{
    createdAt: string;
    source: string;
    status: "ok" | "empty" | "error";
    playerName: string | null;
    errorMessage: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [pubgStats, setPubgStats] = useState<PubgLinkingStats | null>(null);
  const [tab, setTab] = useState<"users" | "invites" | "pubg">("invites");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshingPubg, setRefreshingPubg] = useState(false);
  const [probingPubg, setProbingPubg] = useState(false);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [encounterProbePlayer, setEncounterProbePlayer] = useState("");
  const [liveTailRuns, setLiveTailRuns] = useState<LiveTailRun[]>([]);
  const [liveTailLoading, setLiveTailLoading] = useState(false);
  const [liveTailError, setLiveTailError] = useState<string | null>(null);
  const [liveTailSource, setLiveTailSource] = useState("all");
  const [liveTailStatus, setLiveTailStatus] = useState("all");
  const [liveTailMinutes, setLiveTailMinutes] = useState("30");
  const [liveTailLimit, setLiveTailLimit] = useState("120");
  const [liveTailPlayer, setLiveTailPlayer] = useState("");
  const [indexStatus, setIndexStatus] = useState<TwitchIndexStatusResponse | null>(null);
  const [indexStatusError, setIndexStatusError] = useState<string | null>(null);
  const [queryInitialized, setQueryInitialized] = useState(false);

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && !isAdmin) {
      router.push("/");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/invite").then((r) => r.json()),
      fetch("/api/admin/pubg-linking").then((r) => r.json())
    ]).then(([u, inv, stats]) => {
      setUsers(u);
      setInvites(inv);
      setPubgStats(stats);
      setLoading(false);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (queryInitialized) return;

    const tabParam = searchParams.get("tab");
    if (tabParam === "users" || tabParam === "invites" || tabParam === "pubg") {
      setTab(tabParam);
    }

    const sourceParam = searchParams.get("ltSource");
    if (sourceParam) setLiveTailSource(sourceParam);
    const statusParam = searchParams.get("ltStatus");
    if (statusParam) setLiveTailStatus(statusParam);
    const playerParam = searchParams.get("ltPlayer");
    if (playerParam) setLiveTailPlayer(playerParam);
    const minutesParam = searchParams.get("ltMinutes");
    if (minutesParam) setLiveTailMinutes(minutesParam);
    const limitParam = searchParams.get("ltLimit");
    if (limitParam) setLiveTailLimit(limitParam);

    setQueryInitialized(true);
  }, [queryInitialized, searchParams]);

  useEffect(() => {
    if (!queryInitialized) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);

    if (tab === "pubg") {
      params.set("ltSource", liveTailSource);
      params.set("ltStatus", liveTailStatus);
      params.set("ltPlayer", liveTailPlayer);
      params.set("ltMinutes", liveTailMinutes);
      params.set("ltLimit", liveTailLimit);
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [
    queryInitialized,
    tab,
    liveTailSource,
    liveTailStatus,
    liveTailPlayer,
    liveTailMinutes,
    liveTailLimit,
    pathname,
    router,
    searchParams
  ]);

  useEffect(() => {
    if (!isAdmin || tab !== "pubg") return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const stats = await fetch("/api/admin/pubg-linking", { cache: "no-store" }).then((r) => r.json());
        if (!cancelled) {
          setPubgStats(stats);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[admin] failed to auto-refresh pubg stats", error);
        }
      }
    };

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!isAdmin || tab !== "pubg") return;

    let cancelled = false;
    const loadLiveTail = async (showSpinner: boolean) => {
      if (showSpinner) {
        setLiveTailLoading(true);
      }

      try {
        const params = new URLSearchParams({
          source: liveTailSource,
          status: liveTailStatus,
          minutes: liveTailMinutes,
          limit: liveTailLimit,
          player: liveTailPlayer
        });
        const payload = await fetch(`/api/admin/pubg-linking/live-tail?${params.toString()}`, {
          cache: "no-store"
        }).then((response) => response.json() as Promise<LiveTailResponse>);

        if (!cancelled) {
          setLiveTailRuns(payload.runs ?? []);
          setLiveTailError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLiveTailError(error instanceof Error ? error.message : "Failed to load live tail");
        }
      } finally {
        if (!cancelled && showSpinner) {
          setLiveTailLoading(false);
        }
      }
    };

    void loadLiveTail(true);
    const interval = setInterval(() => {
      void loadLiveTail(false);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    isAdmin,
    tab,
    liveTailSource,
    liveTailStatus,
    liveTailMinutes,
    liveTailLimit,
    liveTailPlayer
  ]);

  useEffect(() => {
    if (!isAdmin || tab !== "pubg") return;

    let cancelled = false;
    const loadStatus = async () => {
      try {
        const payload = await fetch("/api/pubg/twitch-index/status", { cache: "no-store" }).then(
          (response) => response.json() as Promise<TwitchIndexStatusResponse>
        );
        if (!cancelled) {
          setIndexStatus(payload);
          setIndexStatusError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setIndexStatusError(error instanceof Error ? error.message : "Failed to load index status");
        }
      }
    };

    void loadStatus();
    const interval = setInterval(() => {
      void loadStatus();
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin, tab]);

  async function refreshPubgStats() {
    setRefreshingPubg(true);
    try {
      const stats = await fetch("/api/admin/pubg-linking").then((r) => r.json());
      setPubgStats(stats);
    } finally {
      setRefreshingPubg(false);
    }
  }

  async function writeProbeLog() {
    setProbingPubg(true);
    setProbeMessage(null);
    try {
      const response = await fetch("/api/admin/pubg-linking/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "manual-admin-probe" })
      });
      const payload = await response.json();
      if (!response.ok) {
        setProbeMessage(payload?.error ?? "Failed to write probe log");
        return;
      }
      setProbeMessage("Probe run log written.");
      await refreshPubgStats();
    } catch (error) {
      setProbeMessage(error instanceof Error ? error.message : "Failed to write probe log");
    } finally {
      setProbingPubg(false);
    }
  }

  async function runClipsProbe() {
    setProbingPubg(true);
    setProbeMessage(null);
    try {
      const response = await fetch("/api/pubg/clips?limit=1&probe=1", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setProbeMessage(payload?.error ?? "Clips probe failed");
        await refreshPubgStats();
        return;
      }
      const count = Array.isArray(payload?.clips) ? payload.clips.length : 0;
      setProbeMessage(`Clips probe completed. Returned ${count} clip(s).`);
      await refreshPubgStats();
    } catch (error) {
      setProbeMessage(error instanceof Error ? error.message : "Clips probe failed");
    } finally {
      setProbingPubg(false);
    }
  }

  async function runEncounterProbe() {
    const player = encounterProbePlayer.trim();
    if (!player) {
      setProbeMessage("Enter a PUBG player name to run encounter probe.");
      return;
    }

    setProbingPubg(true);
    setProbeMessage(null);
    try {
      const params = new URLSearchParams({
        playerName: player,
        platform: "steam",
        limit: "5",
        probe: "1"
      });

      const response = await fetch(`/api/pubg/clips?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setProbeMessage(payload?.error ?? "Encounter probe failed");
        await refreshPubgStats();
        return;
      }

      const count = Array.isArray(payload?.clips) ? payload.clips.length : 0;
      setProbeMessage(`Encounter probe completed for ${player}. Returned ${count} clip(s).`);
      await refreshPubgStats();
    } catch (error) {
      setProbeMessage(error instanceof Error ? error.message : "Encounter probe failed");
    } finally {
      setProbingPubg(false);
    }
  }

  async function generateInvite() {
    const res = await fetch("/api/admin/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const inv = await res.json();
    setInvites((prev) => [inv, ...prev]);
  }

  async function toggleRevoke(invite: InviteRow) {
    const res = await fetch("/api/admin/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invite.id, isRevoked: !invite.isRevoked })
    });
    const updated = await res.json();
    setInvites((prev) => prev.map((i) => (i.id === updated.id ? { ...i, isRevoked: updated.isRevoked } : i)));
  }

  async function toggleSuspend(user: UserRow) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, isSuspended: !user.isSuspended })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
      return;
    }
    const updated = await res.json();
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, isSuspended: updated.isSuspended } : u)));
  }

  async function toggleRole(user: UserRow) {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, role: newRole })
    });
    const updated = await res.json();
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u)));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[#7f7768] text-sm uppercase tracking-widest">
        Loading...
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="font-['Bebas_Neue'] text-3xl tracking-widest text-[#e2d2af]">Admin Panel</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2d2d2d]">
        {(["invites", "users", "pubg"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
              tab === t
                ? "border-b-2 border-[#e2d2af] text-[#e2d2af]"
                : "text-[#7f7768] hover:text-[#c8bda0]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Invite Codes Tab */}
      {tab === "invites" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#7f7768] uppercase tracking-widest">
              {invites.length} code{invites.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={generateInvite}
              className="border border-[#49533a] bg-[#1a1f14] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#e2d2af] hover:bg-[#222a1a] active:scale-95"
            >
              + Generate Invite
            </button>
          </div>

          <div className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className={`flex items-center justify-between border p-3 text-sm ${
                  inv.isRevoked
                    ? "border-[#2d2d2d] bg-[#111] opacity-50"
                    : inv.usedBy
                    ? "border-[#2d2d2d] bg-[#111]"
                    : "border-[#3a4430] bg-[#12160e]"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[#e2d2af] tracking-wider">{inv.code}</span>
                    {!inv.isRevoked && !inv.usedBy && (
                      <button
                        onClick={() => copyCode(inv.code)}
                        className="text-xs text-[#7f7768] hover:text-[#c8bda0] underline"
                      >
                        {copied === inv.code ? "Copied!" : "Copy"}
                      </button>
                    )}
                    {inv.isRevoked && (
                      <span className="text-xs text-[#a32a2a] uppercase tracking-widest">Revoked</span>
                    )}
                    {inv.usedBy && !inv.isRevoked && (
                      <span className="text-xs text-[#7f7768] uppercase tracking-widest">Used</span>
                    )}
                  </div>
                  {inv.usedBy && (
                    <div className="text-xs text-[#7f7768]">
                      Used by: {inv.usedBy.displayName} ({inv.usedBy.email})
                    </div>
                  )}
                  {inv.expiresAt && (
                    <div className="text-xs text-[#7f7768]">
                      Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                    </div>
                  )}
                  <div className="text-xs text-[#555]">
                    Created: {new Date(inv.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {!inv.usedBy && (
                  <button
                    onClick={() => toggleRevoke(inv)}
                    className={`ml-4 shrink-0 border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                      inv.isRevoked
                        ? "border-[#49533a] text-[#8fa070] hover:bg-[#1a1f14]"
                        : "border-[#a32a2a] text-[#e07070] hover:bg-[#1b1111]"
                    }`}
                  >
                    {inv.isRevoked ? "Restore" : "Revoke"}
                  </button>
                )}
              </div>
            ))}
            {invites.length === 0 && (
              <p className="text-center text-xs text-[#555] py-8">No invite codes yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === "users" && (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={`flex items-center justify-between border p-3 text-sm ${
                user.isSuspended ? "border-[#2d2d2d] bg-[#111] opacity-60" : "border-[#2d2d2d] bg-[#111]"
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-3">
                  <span className="text-[#e2d2af] font-semibold">{user.displayName}</span>
                  <span
                    className={`text-xs uppercase tracking-widest px-1.5 py-0.5 border ${
                      user.role === "ADMIN"
                        ? "border-[#49533a] text-[#8fa070] bg-[#1a1f14]"
                        : "border-[#2d2d2d] text-[#7f7768]"
                    }`}
                  >
                    {user.role}
                  </span>
                  {user.isSuspended && (
                    <span className="text-xs uppercase tracking-widest text-[#a32a2a]">Suspended</span>
                  )}
                </div>
                <div className="text-xs text-[#7f7768]">{user.email}</div>
                {user.gameName && <div className="text-xs text-[#555]">IGN: {user.gameName}</div>}
                <div className="text-xs text-[#555]">
                  Joined: {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                {user.id !== session?.user?.id && (
                  <>
                    <button
                      onClick={() => toggleRole(user)}
                      className="border border-[#49533a] px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#8fa070] hover:bg-[#1a1f14]"
                    >
                      {user.role === "ADMIN" ? "→ User" : "→ Admin"}
                    </button>
                    <button
                      onClick={() => toggleSuspend(user)}
                      className={`border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                        user.isSuspended
                          ? "border-[#49533a] text-[#8fa070] hover:bg-[#1a1f14]"
                          : "border-[#a32a2a] text-[#e07070] hover:bg-[#1b1111]"
                      }`}
                    >
                      {user.isSuspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </>
                )}
                {user.id === session?.user?.id && (
                  <span className="text-xs text-[#555] italic">You</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PUBG Linking Tab */}
      {tab === "pubg" && (
        <div className="space-y-5">
          <p className="text-[11px] uppercase tracking-widest text-[#7f7768]">
            Build: {pubgStats?.build?.gitSha?.slice(0, 12) || "unknown"} | env: {pubgStats?.build?.nodeEnv || "unknown"}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-[#555]">Auto-refresh: stats 15s, jobs 10s, log tail 5s while this tab is open.</p>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">What's Going On</h2>
            <p className="mt-2 text-xs text-[#8b816f]">
              This panel exposes live linker activity and crawler/EventSub health. If mappings are missing, start with ACTIVE JOBS status and then inspect LOG TAIL errors.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-[#7f7768]">
              Last 24h runs: {pubgStats?.totals.runs24h ?? 0} | ok {pubgStats?.totals.runs24hOk ?? 0} | empty {pubgStats?.totals.runs24hEmpty ?? 0} | errors {pubgStats?.totals.runs24hError ?? 0}
            </p>
            <div className="flex gap-2">
              <input
                value={encounterProbePlayer}
                onChange={(event) => setEncounterProbePlayer(event.target.value)}
                placeholder="PUBG name for encounter probe"
                className="w-56 border border-[#2d2d2d] bg-[#0d0d0d] px-2 py-1.5 text-[11px] text-[#c8bda0] placeholder:text-[#666] focus:border-[#666] focus:outline-none"
              />
              <button
                onClick={refreshPubgStats}
                disabled={refreshingPubg}
                className="border border-[#49533a] bg-[#1a1f14] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#e2d2af] hover:bg-[#222a1a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshingPubg ? "Refreshing..." : "Refresh Stats"}
              </button>
              <button
                onClick={writeProbeLog}
                disabled={probingPubg}
                className="border border-[#5e4d34] bg-[#1a1510] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#e2d2af] hover:border-[#f5c842] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Write Probe Log
              </button>
              <button
                onClick={runClipsProbe}
                disabled={probingPubg}
                className="border border-[#2d2d2d] bg-[#111] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#c8bda0] hover:border-[#666] hover:text-[#e2d2af] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run Clips Probe
              </button>
              <button
                onClick={runEncounterProbe}
                disabled={probingPubg}
                className="border border-[#3a4430] bg-[#12160e] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#8fa070] hover:border-[#8fa070] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Run Encounter Probe
              </button>
            </div>
          </div>

          {probeMessage && <p className="text-xs text-[#c8bda0]">{probeMessage}</p>}
          {(pubgStats?.totals.totalRuns ?? 0) === 0 && (
            <p className="text-xs text-[#a58f62]">
              No runs recorded yet. Use "Run Clips Probe" to force one and verify logging wiring.
            </p>
          )}

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Active Crawlers / Jobs</h2>
            {indexStatusError && <p className="mt-2 text-xs text-[#e07070]">{indexStatusError}</p>}
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="border border-[#1f1f1f] bg-[#0d0d0d] p-2 text-xs">
                <div className="text-[#666] uppercase tracking-widest">Crawler Health</div>
                <div className={indexStatus?.jobHealth?.crawlerHealthy ? "text-[#8fa070]" : "text-[#e07070]"}>
                  {indexStatus?.jobHealth?.crawlerHealthy ? "RUNNING" : "STALE / DOWN"}
                </div>
              </div>
              <div className="border border-[#1f1f1f] bg-[#0d0d0d] p-2 text-xs">
                <div className="text-[#666] uppercase tracking-widest">Index Freshness</div>
                <div className={indexStatus?.jobHealth?.indexFresh ? "text-[#8fa070]" : "text-[#d8b46b]"}>
                  {indexStatus?.jobHealth?.indexFresh ? "FRESH" : "STALE"}
                </div>
              </div>
              <div className="border border-[#1f1f1f] bg-[#0d0d0d] p-2 text-xs">
                <div className="text-[#666] uppercase tracking-widest">Last Crawler Seen</div>
                <div className="text-[#c8bda0]">
                  {indexStatus?.jobHealth?.crawlerLastSeenAt ? new Date(indexStatus.jobHealth.crawlerLastSeenAt).toLocaleString() : "n/a"}
                </div>
              </div>
              <div className="border border-[#1f1f1f] bg-[#0d0d0d] p-2 text-xs">
                <div className="text-[#666] uppercase tracking-widest">Active Indexed Streamers</div>
                <div className="text-[#e2d2af]">{indexStatus?.activeStreamerCount ?? pubgStats?.totals.activeIndexerCount ?? 0}</div>
              </div>
            </div>
            {indexStatus?.jobHealth?.crawlerLastError && (
              <p className="mt-2 text-xs text-[#e07070]">Last crawler error: {indexStatus.jobHealth.crawlerLastError}</p>
            )}
            <div className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1">
              {(indexStatus?.recentDiagnosticRuns ?? []).map((row, idx) => (
                <div key={`${row.createdAt}-${row.source}-${idx}`} className="text-[11px] text-[#8e8e8e]">
                  <span className="text-[#c8bda0]">{new Date(row.createdAt).toLocaleTimeString()}</span>
                  <span className="text-[#666]"> · </span>
                  <span className="text-[#e2d2af]">{row.source}</span>
                  <span className="text-[#666]"> · </span>
                  <span className={row.status === "ok" ? "text-[#8fa070]" : row.status === "empty" ? "text-[#d8b46b]" : "text-[#e07070]"}>{row.status}</span>
                  {row.playerName && <span className="text-[#666]"> · {row.playerName}</span>}
                  {row.errorMessage && <span className="text-[#e07070]"> · {row.errorMessage}</span>}
                </div>
              ))}
              {(indexStatus?.recentDiagnosticRuns?.length ?? 0) === 0 && (
                <p className="text-[11px] text-[#555]">No diagnostics runs yet from eventsub/index routes.</p>
              )}
            </div>
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Logs (Live Tail)</h2>
              <p className="text-[10px] uppercase tracking-widest text-[#666]">Polling every 5s</p>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-6">
              <select
                value={liveTailSource}
                onChange={(event) => setLiveTailSource(event.target.value)}
                className="border border-[#2d2d2d] bg-[#0d0d0d] px-2 py-1.5 text-[11px] uppercase tracking-widest text-[#c8bda0] focus:border-[#666] focus:outline-none"
              >
                <option value="all">All Sources</option>
                <option value="encounters">Encounters</option>
                <option value="eventsub">EventSub</option>
                <option value="twitch-index-refresh">Index Refresh</option>
                <option value="crawler-index">Crawler Index</option>
                <option value="pubg">PUBG</option>
                <option value="streamer">Streamer</option>
                <option value="admin_probe">Admin Probe</option>
              </select>
              <select
                value={liveTailStatus}
                onChange={(event) => setLiveTailStatus(event.target.value)}
                className="border border-[#2d2d2d] bg-[#0d0d0d] px-2 py-1.5 text-[11px] uppercase tracking-widest text-[#c8bda0] focus:border-[#666] focus:outline-none"
              >
                <option value="all">All Status</option>
                <option value="ok">OK</option>
                <option value="empty">Empty</option>
                <option value="error">Error</option>
              </select>
              <input
                value={liveTailPlayer}
                onChange={(event) => setLiveTailPlayer(event.target.value)}
                placeholder="Player contains"
                className="border border-[#2d2d2d] bg-[#0d0d0d] px-2 py-1.5 text-[11px] text-[#c8bda0] placeholder:text-[#666] focus:border-[#666] focus:outline-none"
              />
              <input
                value={liveTailMinutes}
                onChange={(event) => setLiveTailMinutes(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Minutes"
                className="border border-[#2d2d2d] bg-[#0d0d0d] px-2 py-1.5 text-[11px] text-[#c8bda0] placeholder:text-[#666] focus:border-[#666] focus:outline-none"
              />
              <input
                value={liveTailLimit}
                onChange={(event) => setLiveTailLimit(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Limit"
                className="border border-[#2d2d2d] bg-[#0d0d0d] px-2 py-1.5 text-[11px] text-[#c8bda0] placeholder:text-[#666] focus:border-[#666] focus:outline-none"
              />
              <button
                onClick={() => {
                  setLiveTailLoading(true);
                  fetch(`/api/admin/pubg-linking/live-tail?${new URLSearchParams({
                    source: liveTailSource,
                    status: liveTailStatus,
                    player: liveTailPlayer,
                    minutes: liveTailMinutes,
                    limit: liveTailLimit
                  }).toString()}`, { cache: "no-store" })
                    .then((response) => response.json() as Promise<LiveTailResponse>)
                    .then((payload) => {
                      setLiveTailRuns(payload.runs ?? []);
                      setLiveTailError(null);
                    })
                    .catch((error) => {
                      setLiveTailError(error instanceof Error ? error.message : "Failed to load live tail");
                    })
                    .finally(() => {
                      setLiveTailLoading(false);
                    });
                }}
                className="border border-[#49533a] bg-[#1a1f14] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#e2d2af] hover:bg-[#222a1a]"
              >
                Refresh Tail
              </button>
            </div>

            {liveTailError && <p className="mt-2 text-xs text-[#e07070]">{liveTailError}</p>}
            {liveTailLoading && <p className="mt-2 text-xs text-[#7f7768]">Loading live tail...</p>}

            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {liveTailRuns.map((run) => (
                <div key={run.id} className="border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2 text-xs text-[#b9af95]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#e2d2af]">{run.source}</span>
                    <span className={`px-1.5 py-0.5 uppercase tracking-widest ${run.status === "ok" ? "text-[#8fa070]" : run.status === "empty" ? "text-[#d8b46b]" : "text-[#e07070]"}`}>{run.status}</span>
                    <span className="text-[#666]">{new Date(run.createdAt).toLocaleString()}</span>
                    {run.playerName && <span className="text-[#c8bda0]">player: {run.playerName}</span>}
                    <span className="text-[#666]">enc: {run.encountersFound}</span>
                    <span className="text-[#666]">clips: {run.clipsReturned}</span>
                    <span className="text-[#666]">persisted: {run.linkEventsPersisted}</span>
                  </div>
                  {run.errorMessage && <div className="mt-1 text-[#e07070]">{run.errorMessage}</div>}
                  {run.verboseMessages?.length > 0 && (
                    <div className="mt-2 border border-[#1a1a1a] bg-[#090909] px-2 py-1 text-[11px] text-[#8e8e8e]">
                      {run.verboseMessages.slice(-3).map((line, lineIdx) => (
                        <div key={`${run.id}-verbose-${lineIdx}`}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!liveTailRuns.length && !liveTailLoading && <p className="text-xs text-[#555]">No runs for current live tail filters.</p>}
            </div>
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Stats</h2>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Linker Runs</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.totalRuns ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Link Events</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.totalEvents ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Unique PUBG</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.uniquePubgAccounts ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Unique Twitch</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.uniqueTwitchAccounts ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Unique Pairs</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.uniquePairs ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Last 24h</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.last24hEvents ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Indexed Streamers</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.activeIndexerCount ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Profile DB Total</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.streamerProfileCount ?? 0}</div>
            </div>
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#7f7768]">Profile DB Live</div>
              <div className="mt-1 text-xl font-semibold text-[#e2d2af]">{pubgStats?.totals.streamerProfileLiveCount ?? 0}</div>
            </div>
          </div>
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Recent Linker Runs (Diagnostics)</h2>
            <div className="mt-3 space-y-2">
              {(pubgStats?.recentRuns ?? []).map((run, idx) => (
                <div key={`${run.createdAt}-${run.source}-${idx}`} className="border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2 text-xs text-[#b9af95]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#e2d2af]">{run.source}</span>
                    <span className={`px-1.5 py-0.5 uppercase tracking-widest ${run.status === "ok" ? "text-[#8fa070]" : run.status === "empty" ? "text-[#d8b46b]" : "text-[#e07070]"}`}>{run.status}</span>
                    <span className="text-[#666]">{new Date(run.createdAt).toLocaleString()}</span>
                    {run.playerName && <span className="text-[#c8bda0]">player: {run.playerName}</span>}
                    <span className="text-[#666]">clips: {run.clipsReturned}</span>
                    <span className="text-[#666]">encounters: {run.encountersFound}</span>
                    <span className="text-[#666]">index matches: {run.activeIndexMatches}</span>
                    <span className="text-[#666]">persisted: {run.linkEventsPersisted}</span>
                  </div>
                  {run.errorMessage && <div className="mt-1 text-[#e07070]">{run.errorMessage}</div>}
                  {run.verboseMessages?.length > 0 && (
                    <div className="mt-2 border border-[#1a1a1a] bg-[#090909] px-2 py-1 text-[11px] text-[#8e8e8e]">
                      {run.verboseMessages.slice(-4).map((line, lineIdx) => (
                        <div key={`${run.createdAt}-${idx}-line-${lineIdx}`}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(pubgStats?.recentRuns.length ?? 0) === 0 && <p className="text-xs text-[#555]">No linker runs captured yet. Trigger a PUBG clip lookup to generate logs.</p>}
            </div>
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Recent Link Events</h2>
            <div className="mt-3 space-y-2">
              {(pubgStats?.recent ?? []).map((event, idx) => (
                <div key={`${event.createdAt}-${event.eventType}-${idx}`} className="border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2 text-xs text-[#b9af95]">
                  <span className="text-[#e2d2af]">{event.pubgNameRaw}</span>
                  <span className="text-[#666]"> linked to </span>
                  <span className="text-[#8fa070]">{event.twitchUserName || event.twitchUserLogin || "Unknown Twitch"}</span>
                  <span className="text-[#666]"> via {event.eventType} • {new Date(event.createdAt).toLocaleString()}</span>
                </div>
              ))}
              {(pubgStats?.recent.length ?? 0) === 0 && <p className="text-xs text-[#555]">No link events captured yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
