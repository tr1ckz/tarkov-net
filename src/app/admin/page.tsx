"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
  totals: {
    totalEvents: number;
    uniquePubgAccounts: number;
    uniqueTwitchAccounts: number;
    uniquePairs: number;
    last24hEvents: number;
    last7dEvents: number;
    activeIndexerCount: number;
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
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [pubgStats, setPubgStats] = useState<PubgLinkingStats | null>(null);
  const [tab, setTab] = useState<"users" | "invites" | "pubg">("invites");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

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
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Top PUBG Accounts Linked</h2>
              <div className="mt-3 space-y-2">
                {(pubgStats?.topPubg ?? []).map((row) => (
                  <div key={row.normalized} className="flex items-center justify-between border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2 text-xs">
                    <div>
                      <div className="text-[#e2d2af]">{row.pubgName}</div>
                      <div className="text-[#666]">{row.uniqueTwitchAccounts} unique Twitch accounts</div>
                    </div>
                    <div className="text-[#8fa070]">{row.linkEvents} events</div>
                  </div>
                ))}
                {(pubgStats?.topPubg.length ?? 0) === 0 && <p className="text-xs text-[#555]">No linked accounts yet.</p>}
              </div>
            </div>

            <div className="border border-[#2d2d2d] bg-[#111] p-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Top Twitch Accounts Matched</h2>
              <div className="mt-3 space-y-2">
                {(pubgStats?.topTwitch ?? []).map((row) => (
                  <div key={row.twitchUserId} className="flex items-center justify-between border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2 text-xs">
                    <div>
                      <div className="text-[#e2d2af]">{row.twitchUserName}</div>
                      <div className="text-[#666]">@{row.twitchUserLogin || "unknown"} • {row.uniquePubgAccounts} PUBG accounts</div>
                    </div>
                    <div className="text-[#8fa070]">{row.linkEvents} events</div>
                  </div>
                ))}
                {(pubgStats?.topTwitch.length ?? 0) === 0 && <p className="text-xs text-[#555]">No Twitch links yet.</p>}
              </div>
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

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#c8bda0]">Event Type Breakdown</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(pubgStats?.sourceBreakdown ?? []).map((row) => (
                <span key={row.eventType} className="border border-[#3a4430] bg-[#12160e] px-2 py-1 text-[11px] uppercase tracking-widest text-[#8fa070]">
                  {row.eventType}: {row.count}
                </span>
              ))}
              {(pubgStats?.sourceBreakdown.length ?? 0) === 0 && <span className="text-xs text-[#555]">No event data yet.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
