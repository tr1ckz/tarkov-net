"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Clip = {
  id: string;
  url: string;
  title: string;
  creator_name: string;
  broadcaster_name: string;
  thumbnail_url: string;
  created_at: string;
  view_count: number;
};

type ClipsResponse = {
  clips: Clip[];
  source: "pubg" | "streamer";
  streamer?: string;
  error?: string;
  setup?: string;
};

function formatRelativeTime(iso: string) {
  const date = new Date(iso);
  const now = Date.now();
  const deltaMs = now - date.getTime();
  const minutes = Math.floor(deltaMs / 60_000);

  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PubgClipsPanel() {
  const [streamer, setStreamer] = useState("");
  const [pendingStreamer, setPendingStreamer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "24");
    if (streamer) params.set("streamer", streamer);
    return `/api/pubg/clips?${params.toString()}`;
  }, [streamer]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setSetupHint(null);

      try {
        const response = await fetch(query, { cache: "no-store" });
        const payload = (await response.json()) as ClipsResponse;

        if (cancelled) return;

        if (!response.ok) {
          setClips([]);
          setError(payload.error ?? "Failed to load clips");
          setSetupHint(payload.setup ?? null);
          return;
        }

        setClips(payload.clips ?? []);
      } catch (err) {
        if (cancelled) return;
        setClips([]);
        setError(err instanceof Error ? err.message : "Failed to load clips");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [query]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStreamer(pendingStreamer.trim().toLowerCase());
  }

  function clearFilter() {
    setPendingStreamer("");
    setStreamer("");
  }

  return (
    <section className="space-y-4">
      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#9a8050]">PUBG Clips Feed</p>
        <p className="mt-2 text-sm text-[#b9ad96]">
          Live clips from Twitch for PUBG. Add a streamer login to focus on one channel.
        </p>

        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={pendingStreamer}
            onChange={(e) => setPendingStreamer(e.target.value)}
            placeholder="twitch login (example: tgltn)"
            className="w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
          />
          <button
            type="submit"
            className="border border-[#5e4d34] bg-[#1a1510] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
          >
            Load
          </button>
          <button
            type="button"
            onClick={clearFilter}
            className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-[#e2d2af]"
          >
            Clear
          </button>
        </form>
      </div>

      {error && (
        <div className="border border-[#5e2a2a] bg-[#1a1010] p-3 text-sm text-[#e6b4b4]">
          <p>{error}</p>
          {setupHint && <p className="mt-1 text-xs text-[#c78f8f]">{setupHint}</p>}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse border border-[#2d2d2d] bg-[#101010]" />
          ))}
        </div>
      ) : clips.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <a
              key={clip.id}
              href={clip.url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden border border-[#2d2d2d] bg-[#111] hover:border-[#f5c842]"
            >
              <img
                src={clip.thumbnail_url}
                alt={clip.title}
                className="h-40 w-full object-cover transition group-hover:scale-[1.03]"
                loading="lazy"
              />
              <div className="p-3">
                <p className="line-clamp-2 text-sm text-[#e2d2af]">{clip.title || "Untitled clip"}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-[#9a9080]">
                  {clip.broadcaster_name} · {clip.creator_name}
                </p>
                <p className="mt-1 text-[11px] text-[#7f7768]">
                  {clip.view_count.toLocaleString()} views · {formatRelativeTime(clip.created_at)}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="border border-[#2d2d2d] bg-[#111] p-4 text-sm text-[#9a9080]">
          No clips found for this filter.
        </div>
      )}
    </section>
  );
}
