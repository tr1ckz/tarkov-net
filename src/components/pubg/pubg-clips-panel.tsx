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
  encounterWith?: string;
  encounterActionText?: string;
  encounterActionType?: string;
  encounterWeapon?: string | null;
  encounterDistanceMeters?: number | null;
  mapTag?: string | null;
  gameModeTag?: string | null;
  teamSizeModeTag?: string | null;
  povTag?: string | null;
  sourceType?: "vod" | "clip";
};

type ClipsResponse = {
  clips: Clip[];
  source: "pubg" | "streamer" | "encounters" | string;
  profile?: { playerName: string; shard: string; platform: string };
  encountersScanned?: number;
  lookupNeeded?: boolean;
  debug?: {
    encountersFound: number;
    channelsWithClips: number;
    resolvedShard?: string;
  };
  error?: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

  if (!raw) {
    throw new Error(`Empty response from server (${response.status}).`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const preview = raw.slice(0, 120).replace(/\s+/g, " ").trim();
    const typeHint = contentType ? `content-type: ${contentType}` : "content-type: unknown";
    throw new Error(`Server returned non-JSON response (${response.status}, ${typeHint}). Preview: ${preview}`);
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await parseJsonResponse<T>(response);

    if (!response.ok) {
      const err = payload as { error?: string };
      throw new Error(err.error ?? "Request failed");
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Try Lookup Player first, then rerun.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

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
  const [activeMode, setActiveMode] = useState<"encounters" | "streamer">("encounters");
  const [playerName, setPlayerName] = useState("");
  const [streamerLogin, setStreamerLogin] = useState("");
  const [platform, setPlatform] = useState("steam");
  const [resolvedShard, setResolvedShard] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [submitted, setSubmitted] = useState<{ mode: "encounters" | "streamer"; playerName: string; streamer: string; platform: string } | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    encountersScanned?: number;
    debug?: {
      encountersFound: number;
      channelsWithClips: number;
      resolvedShard?: string;
    };
  } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("pubg-clips-profile");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        playerName?: string;
        platform?: string;
        mode?: "encounters" | "streamer";
        streamer?: string;
      };

      if (parsed.playerName) {
        setPlayerName(parsed.playerName);
      }

      if (parsed.platform) {
        setPlatform(parsed.platform);
      }

      if (parsed.streamer) {
        setStreamerLogin(parsed.streamer);
      }

      if (parsed.mode === "streamer") {
        setActiveMode("streamer");
      }
    } catch {
      // ignore malformed local cache
    }
  }, []);

  const query = useMemo(() => {
    if (!submitted) return "";

    const params = new URLSearchParams();
    params.set("limit", "30");
    if (submitted.mode === "streamer") {
      params.set("streamer", submitted.streamer);
    }
    if (submitted.mode === "encounters") {
      params.set("playerName", submitted.playerName);
      params.set("platform", submitted.platform);
    }
    return `/api/pubg/clips?${params.toString()}`;
  }, [submitted]);

  useEffect(() => {
    if (!query) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setResultMeta(null);

      try {
        const payload = await fetchJsonWithTimeout<ClipsResponse>(query, 30000);

        if (cancelled) return;

        setClips(payload.clips ?? []);
        setResultMeta({ encountersScanned: payload.encountersScanned, debug: payload.debug });
        if (submitted?.mode === "encounters") {
          const shard = payload.profile?.shard || payload.debug?.resolvedShard || "unresolved";
          setResolvedShard(shard);
        }
      } catch (err) {
        if (cancelled) return;
        setClips([]);
        setError(err instanceof Error ? err.message : "Failed to load clips");
        if (submitted?.mode === "encounters") {
          setResolvedShard("unresolved");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [query, submitted]);

  function onAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = playerName.trim();
    if (!nextName) return;

    setSubmitted({
      mode: "encounters",
      playerName: nextName,
      streamer: "",
      platform,
    });

    localStorage.setItem(
      "pubg-clips-profile",
      JSON.stringify({
        mode: "encounters",
        playerName: nextName,
        platform,
      })
    );
  }

  function onStreamerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = streamerLogin.trim().toLowerCase();
    if (!nextName) return;

    setSubmitted({
      mode: "streamer",
      playerName: "",
      streamer: nextName,
      platform,
    });

    localStorage.setItem(
      "pubg-clips-profile",
      JSON.stringify({
        mode: "streamer",
        streamer: nextName,
        platform,
      })
    );
  }

  function clearFilter() {
    setStreamerLogin("");
    setPlayerName("");
    setResolvedShard("");
    setSubmitted(null);
    setClips([]);
    setResultMeta(null);
    setError(null);
    localStorage.removeItem("pubg-clips-profile");
  }

  return (
    <section className="space-y-4">
      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#9a8050]">PUBG Clips Feed</p>
        <p className="mt-2 text-sm text-[#b9ad96]">
          pubg.report-only test mode. Enter a PUBG player name or streamer login.
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveMode("encounters")}
            className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeMode === "encounters"
                ? "border-[#f5c842] bg-[#1a1510] text-[#e2d2af]"
                : "border-[#2d2d2d] bg-[#111] text-[#9a9080]"
            }`}
          >
            By PUBG Name
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("streamer")}
            className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeMode === "streamer"
                ? "border-[#f5c842] bg-[#1a1510] text-[#e2d2af]"
                : "border-[#2d2d2d] bg-[#111] text-[#9a9080]"
            }`}
          >
            By Streamer
          </button>
        </div>

        {activeMode === "encounters" ? (
          <form onSubmit={onAccountSubmit} className="mt-3 grid gap-2 sm:grid-cols-4">
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="your PUBG username"
              className="sm:col-span-2 w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
            />
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
            >
              <option value="steam">Steam</option>
              <option value="xbox">Xbox</option>
              <option value="psn">PSN</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-4 border border-[#5e4d34] bg-[#1a1510] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
            >
              Find My Encounter Clips
            </button>
          </form>
        ) : (
          <form onSubmit={onStreamerSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={streamerLogin}
              onChange={(e) => setStreamerLogin(e.target.value)}
              placeholder="twitch login (example: tgltn)"
              className="w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
            />
            <button
              type="submit"
              className="border border-[#5e4d34] bg-[#1a1510] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
            >
              Load Streamer Events
            </button>
          </form>
        )}

        <div className="mt-3">
          <button
            type="button"
            onClick={clearFilter}
            className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-[#e2d2af]"
          >
            Clear
          </button>
        </div>
      </div>

      {submitted?.mode === "encounters" && submitted.playerName && (
        <div className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#9a9080]">
          My account: <span className="text-[#e2d2af]">{submitted.playerName}</span> · {submitted.platform} · {
            loading
              ? (resolvedShard && resolvedShard !== "unresolved" ? `${resolvedShard} (refreshing...)` : "resolving...")
              : (resolvedShard || "unresolved")
          }
          {typeof resultMeta?.encountersScanned === "number" && (
            <span className="ml-2 text-[#7f7768]">(encounters scanned: {resultMeta.encountersScanned})</span>
          )}
        </div>
      )}

      {error && (
        <div className="border border-[#5e2a2a] bg-[#1a1010] p-3 text-sm text-[#e6b4b4]">
          <p>{error}</p>
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
                {clip.encounterWith && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#c59a54]">
                    Encounter: {clip.encounterWith}
                  </p>
                )}
                {clip.encounterActionText && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#d6b376]">
                    Event: {clip.encounterActionText}
                  </p>
                )}
                {clip.sourceType && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#6f675a]">
                    Source: {clip.sourceType === "vod" ? "VOD Moment" : "Clip"}
                  </p>
                )}
                {(clip.mapTag || clip.gameModeTag || clip.teamSizeModeTag || clip.povTag) && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#8b816f]">
                    {clip.mapTag ? `Map: ${clip.mapTag}` : "Map: -"} · {clip.gameModeTag ? `Mode: ${clip.gameModeTag}` : "Mode: -"}
                    {clip.teamSizeModeTag ? ` · Team: ${clip.teamSizeModeTag}` : ""}
                    {clip.povTag ? ` · POV: ${clip.povTag === "STREAMER_POV" ? "Streamer POV" : "Teammate POV"}` : ""}
                  </p>
                )}
                {(clip.encounterWeapon || typeof clip.encounterDistanceMeters === "number") && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#8b816f]">
                    {clip.encounterWeapon ? `Gun: ${clip.encounterWeapon}` : "Gun: -"}
                    {typeof clip.encounterDistanceMeters === "number" ? ` · Distance: ${clip.encounterDistanceMeters}m` : ""}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-[#7f7768]">
                  {clip.view_count.toLocaleString()} views · {formatRelativeTime(clip.created_at)}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="border border-[#2d2d2d] bg-[#111] p-4 text-sm text-[#9a9080]">
          {submitted ? "No clips found for this filter." : "Run a search to load pubg.report clips."}
          {submitted?.mode === "encounters" && resultMeta?.debug && (
            <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[#6f675a]">
              Debug: encounters {resultMeta.debug.encountersFound}, clips channels {resultMeta.debug.channelsWithClips}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
