"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  source: "pubg" | "streamer" | "encounters";
  streamer?: string;
  profile?: { playerName: string; shard: string; platform: string };
  encountersScanned?: number;
  lookupNeeded?: boolean;
  debug?: {
    encountersFound: number;
    directLoginMatches: number;
    searchChannelMatches: number;
    channelsWithClips: number;
    vodMoments?: number;
    resolvedShard?: string;
  };
  error?: string;
  setup?: string;
};

type PlayerLookupResponse = {
  found?: boolean;
  error?: string;
  setup?: string;
  profile?: {
    playerName: string;
    shard: string;
    matchCount: number;
  };
};

type Mode = "pubg" | "streamer" | "encounters";

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = (await response.json()) as T;

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

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function PubgClipsPanel() {
  const [mode, setMode] = useState<Mode>("pubg");
  const [streamer, setStreamer] = useState("");
  const [pendingStreamer, setPendingStreamer] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [pendingPlayerName, setPendingPlayerName] = useState("");
  const [platform, setPlatform] = useState("steam");
  const [pendingPlatform, setPendingPlatform] = useState("steam");
  const [resolvedShard, setResolvedShard] = useState("");
  const [pendingShardHint, setPendingShardHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [liveLookupLoading, setLiveLookupLoading] = useState(false);
  const [liveLookupError, setLiveLookupError] = useState<string | null>(null);
  const [liveLookupProfile, setLiveLookupProfile] = useState<{
    playerName: string;
    shard: string;
    matchCount: number;
  } | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ playerName: string; shard: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [resultMeta, setResultMeta] = useState<{
    encountersScanned?: number;
    debug?: {
      encountersFound: number;
      directLoginMatches: number;
      searchChannelMatches: number;
      channelsWithClips: number;
      vodMoments?: number;
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
        shard?: string;
      };

      if (parsed.playerName) {
        setPendingPlayerName(parsed.playerName);
        setPlayerName(parsed.playerName);
        setMode("encounters");
      }

      if (parsed.platform) {
        setPendingPlatform(parsed.platform);
        setPlatform(parsed.platform);
      }

      if (parsed.shard) {
        setResolvedShard(parsed.shard);
        setPendingShardHint(parsed.shard);
      }
    } catch {
      // ignore malformed local cache
    }
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "24");
    if (mode === "streamer" && streamer) {
      params.set("streamer", streamer);
    }
    if (mode === "encounters" && playerName) {
      params.set("playerName", playerName);
      params.set("platform", platform);
      if (resolvedShard && resolvedShard !== "unresolved") {
        params.set("shard", resolvedShard);
      }
    }
    return `/api/pubg/clips?${params.toString()}`;
  }, [mode, playerName, platform, streamer, resolvedShard]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setSetupHint(null);
      setResultMeta(null);

      try {
        const payload = await fetchJsonWithTimeout<ClipsResponse>(query, 30000);

        if (cancelled) return;

        setClips(payload.clips ?? []);
        setResultMeta({ encountersScanned: payload.encountersScanned, debug: payload.debug });
        if (mode === "encounters") {
          const shard = payload.profile?.shard || payload.debug?.resolvedShard || "unresolved";
          setResolvedShard(shard);
        }
      } catch (err) {
        if (cancelled) return;
        setClips([]);
        setError(err instanceof Error ? err.message : "Failed to load clips");
        if (mode === "encounters") {
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
  }, [query]);

  useEffect(() => {
    const candidate = pendingPlayerName.trim();
    if (candidate.length < 3) {
      setLiveLookupProfile(null);
      setLiveLookupError(null);
      setLiveLookupLoading(false);
      setSearchSuggestions([]);
      setShowSuggestions(false);
      setPendingShardHint("");
      return;
    }

    // Debounce local player-search suggestions (300ms)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: candidate, platform: pendingPlatform, limit: "8" });
      fetch(`/api/pubg/player-search?${params.toString()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((payload: { results?: Array<{ playerName: string; shard: string }> }) => {
          setSearchSuggestions(payload.results ?? []);
          setShowSuggestions((payload.results?.length ?? 0) > 0);
        })
        .catch(() => {
          setSearchSuggestions([]);
        });
    }, 300);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLiveLookupLoading(true);
      setLiveLookupError(null);

      const params = new URLSearchParams({
        playerName: candidate,
        platform: pendingPlatform
      });

      fetch(`/api/pubg/player-lookup?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal
      })
        .then(async (response) => {
          const payload = (await response.json()) as PlayerLookupResponse;
          if (!response.ok || !payload?.found || !payload.profile) {
            throw new Error(payload?.error ?? "Player lookup failed");
          }

          setLiveLookupProfile(payload.profile);
          setLiveLookupError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
          setLiveLookupProfile(null);
          setLiveLookupError(err instanceof Error ? err.message : "Player lookup failed");
        })
        .finally(() => {
          setLiveLookupLoading(false);
        });
    }, 500);

    return () => {
      clearTimeout(timeout);
      controller.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [pendingPlayerName, pendingPlatform]);

  function applyLookupProfile(profile: { playerName: string; shard: string; matchCount: number }) {
    setPendingPlayerName(profile.playerName);
    setPlayerName(profile.playerName);
    setResolvedShard(profile.shard);
    setPendingShardHint(profile.shard);
    setPlatform(pendingPlatform);
    setMode("encounters");

    localStorage.setItem(
      "pubg-clips-profile",
      JSON.stringify({
        playerName: profile.playerName,
        platform: pendingPlatform,
        shard: profile.shard
      })
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMode("streamer");
    setStreamer(pendingStreamer.trim().toLowerCase());
  }

  function onAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = pendingPlayerName.trim();
    if (!nextName) return;

    if (
      liveLookupProfile &&
      normalizeName(liveLookupProfile.playerName) === normalizeName(nextName)
    ) {
      applyLookupProfile(liveLookupProfile);
      return;
    }

    setMode("encounters");
    setPlayerName(nextName);
    setPlatform(pendingPlatform);
    const fallbackShard = pendingShardHint || resolvedShard;
    setResolvedShard(fallbackShard || "");

    localStorage.setItem(
      "pubg-clips-profile",
      JSON.stringify({
        playerName: nextName,
        platform: pendingPlatform,
        shard: fallbackShard || undefined
      })
    );
  }

  async function lookupAccount() {
    const nextName = pendingPlayerName.trim();
    if (!nextName) return;

    setLookupLoading(true);
    setError(null);
    setSetupHint(null);

    try {
      const params = new URLSearchParams({
        playerName: nextName,
        platform: pendingPlatform
      });
      const payload = await fetchJsonWithTimeout<PlayerLookupResponse>(`/api/pubg/player-lookup?${params.toString()}`);

      if (!payload?.found || !payload.profile) {
        setError(payload?.error ?? "Player lookup failed");
        setSetupHint(payload?.setup ?? null);
        return;
      }

      const profile = payload.profile;
      setLiveLookupProfile(profile);
      setLiveLookupError(null);
      applyLookupProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Player lookup failed");
      setResolvedShard("unresolved");
    } finally {
      setLookupLoading(false);
    }
  }

  function loadGlobalPubg() {
    setMode("pubg");
    setStreamer("");
    setPlayerName("");
    setLiveLookupProfile(null);
    setLiveLookupError(null);
  }

  function clearFilter() {
    setPendingStreamer("");
    setStreamer("");
    setPendingPlayerName("");
    setPendingShardHint("");
    setPlayerName("");
    setResolvedShard("");
    setMode("pubg");
    setLiveLookupProfile(null);
    setLiveLookupError(null);
    localStorage.removeItem("pubg-clips-profile");
  }

  return (
    <section className="space-y-4">
      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#9a8050]">PUBG Clips Feed</p>
        <p className="mt-2 text-sm text-[#b9ad96]">
          Enter your PUBG account below to find clips from players you recently fought.
        </p>

        <form onSubmit={onAccountSubmit} className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <input
              value={pendingPlayerName}
              onChange={(e) => {
                setPendingPlayerName(e.target.value);
                setPendingShardHint("");
                setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => searchSuggestions.length > 0 && setShowSuggestions(true)}
              placeholder="your PUBG username"
              className="w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
            />
            {showSuggestions && searchSuggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 border border-[#3d3d3d] bg-[#0f0f0f] shadow-lg">
                {searchSuggestions.map((s) => (
                  <li key={`${s.playerName}:${s.shard}`}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setPendingPlayerName(s.playerName);
                        setPendingShardHint(s.shard);
                        setResolvedShard(s.shard);
                        setShowSuggestions(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-[#e2d2af] hover:bg-[#1a1a1a] flex justify-between"
                    >
                      <span>{s.playerName}</span>
                      <span className="text-[10px] text-[#7f7768]">{s.shard}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            value={pendingPlatform}
            onChange={(e) => {
              const next = e.target.value;
              setPendingPlatform(next);
              setPendingShardHint("");
              setResolvedShard("");
            }}
            className="w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
          >
            <option value="steam">Steam</option>
            <option value="xbox">Xbox</option>
            <option value="psn">PSN</option>
          </select>
          <div className="w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#7f7768]">
            shard auto-resolve
          </div>
          <button
            type="submit"
            className="sm:col-span-4 border border-[#5e4d34] bg-[#1a1510] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
          >
            Find My Encounter Clips
          </button>
          <button
            type="button"
            onClick={lookupAccount}
            disabled={lookupLoading}
            className="sm:col-span-4 border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-[#e2d2af] disabled:opacity-50"
          >
            {lookupLoading ? "Looking up..." : "Lookup Player"}
          </button>
        </form>

        {pendingPlayerName.trim().length >= 3 && (
          <div className="mt-2 text-xs text-[#8c826f]">
            {liveLookupLoading && <span>Checking case-sensitive PUBG name...</span>}
            {!liveLookupLoading && liveLookupProfile && (
              <span>
                Found: <span className="text-[#e2d2af]">{liveLookupProfile.playerName}</span> on {liveLookupProfile.shard} ({liveLookupProfile.matchCount} matches)
              </span>
            )}
            {!liveLookupLoading && !liveLookupProfile && liveLookupError && (
              <span className="text-[#c78f8f]">{liveLookupError}</span>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-[#2a2a2a] pt-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#7f7768]">Manual Twitch Filter</p>
          <p className="mt-1 text-xs text-[#7f7768]">Optional fallback if you want one specific streamer.</p>

          <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
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
            onClick={loadGlobalPubg}
            className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-[#e2d2af]"
          >
            Global PUBG
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
      </div>

      {mode === "encounters" && playerName && (
        <div className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#9a9080]">
          My account: <span className="text-[#e2d2af]">{playerName}</span> · {platform} · {
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
          No clips found for this filter.
          {mode === "encounters" && resultMeta?.debug && (
            <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[#6f675a]">
              Debug: encounters {resultMeta.debug.encountersFound}, candidate channels {resultMeta.debug.directLoginMatches}, clips channels {resultMeta.debug.channelsWithClips}, vod moments {resultMeta.debug.vodMoments ?? 0}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
