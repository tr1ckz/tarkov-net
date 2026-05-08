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

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [tab, setTab] = useState<"users" | "invites">("invites");
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
      fetch("/api/admin/invite").then((r) => r.json())
    ]).then(([u, inv]) => {
      setUsers(u);
      setInvites(inv);
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
        {(["invites", "users"] as const).map((t) => (
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
    </div>
  );
}
