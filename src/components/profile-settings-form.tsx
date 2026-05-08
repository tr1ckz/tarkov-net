"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  displayName: string;
  gameName: string | null;
  tarkovProfileId: string | null;
  tarkovPveProfileId: string | null;
  tarkovArenaProfileId: string | null;
};

export function ProfileSettingsForm({
  displayName: initialDisplayName,
  gameName: initialGameName,
  tarkovProfileId,
  tarkovPveProfileId,
  tarkovArenaProfileId
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [gameName, setGameName] = useState(initialGameName ?? "");
  const [pvpProfileId, setPvpProfileId] = useState(tarkovProfileId ?? "");
  const [pveProfileId, setPveProfileId] = useState(tarkovPveProfileId ?? "");
  const [arenaProfileId, setArenaProfileId] = useState(tarkovArenaProfileId ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaved("");

    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          gameName
        })
      });

      const data = await response.json().catch(() => ({ error: "Profile update failed" }));
      if (!response.ok) {
        setError(data.error ?? "Profile update failed");
        return;
      }

      setPvpProfileId(data.user?.tarkovProfileId ?? "");
      setPveProfileId(data.user?.tarkovPveProfileId ?? "");
      setArenaProfileId(data.user?.tarkovArenaProfileId ?? "");
      setSaved("Profile saved and IDs synced from IGN");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9a9080]">Display Name</p>
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9a9080]">Escape From Tarkov IGN</p>
        <Input
          value={gameName}
          onChange={(event) => setGameName(event.target.value)}
          placeholder="Your actual in-game name"
          maxLength={15}
        />
      </div>

      <div className="space-y-2 border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9a9080]">Auto Linked Profile IDs</p>
        <p className="text-xs text-[#7f7768]">
          Enter your IGN and save. We resolve PvP, PvE, and Arena IDs automatically from Tarkov.dev indexes.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7f7768]">PvP</p>
            <p className="text-sm font-semibold text-[#e2d2af]">{pvpProfileId || "Not found"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7f7768]">PvE</p>
            <p className="text-sm font-semibold text-[#e2d2af]">{pveProfileId || "Not found"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7f7768]">Arena</p>
            <p className="text-sm font-semibold text-[#e2d2af]">{arenaProfileId || "Not found"}</p>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-[#d27d7d]">{error}</p> : null}
      {saved ? <p className="text-sm text-[#c8d1b2]">{saved}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save Profile"}</Button>
        <Link href="/player-stats">
          <Button type="button" variant="outline">View Player Stats</Button>
        </Link>
        <Link href="https://tarkov.dev/players" target="_blank" rel="noreferrer">
          <Button type="button" variant="outline">Open Tarkov.dev Search</Button>
        </Link>
      </div>
    </form>
  );
}