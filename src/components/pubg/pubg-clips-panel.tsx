"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Clip = {
  id: string;
  url: string;
  video_id?: string;
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
  matchupText?: string;
  summaryText?: string;
  eventTone?: "kill" | "knocked" | "death" | "knocked_by" | "neutral";
  eventLabel?: string;
  opponentName?: string;
  subjectName?: string;
  targetName?: string;
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

const RECENT_PLAYERS_COOKIE = "pubg_recent_players";
const MAX_RECENT_PLAYERS = 5;

function readRecentPlayersCookie(): string[] {
  if (typeof document === "undefined") return [];
  const entry = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${RECENT_PLAYERS_COOKIE}=`));
  if (!entry) return [];

  try {
    const raw = decodeURIComponent(entry.split("=")[1] ?? "[]");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map((value) => String(value).trim()).filter(Boolean))).slice(0, MAX_RECENT_PLAYERS);
  } catch {
    return [];
  }
}

function writeRecentPlayersCookie(players: string[]) {
  if (typeof document === "undefined") return;
  const payload = encodeURIComponent(JSON.stringify(players.slice(0, MAX_RECENT_PLAYERS)));
  document.cookie = `${RECENT_PLAYERS_COOKIE}=${payload}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

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

function toneClasses(tone?: Clip["eventTone"]) {
  switch (tone) {
    case "kill":
      return {
        shell: "border-emerald-700/70 bg-emerald-950/35",
        title: "text-emerald-300",
        badge: "border-emerald-700/70 bg-emerald-950/70 text-emerald-200",
        name: "text-emerald-200",
      };
    case "knocked":
      return {
        shell: "border-lime-700/70 bg-lime-950/35",
        title: "text-lime-300",
        badge: "border-lime-700/70 bg-lime-950/70 text-lime-200",
        name: "text-lime-200",
      };
    case "death":
      return {
        shell: "border-red-700/70 bg-red-950/35",
        title: "text-red-300",
        badge: "border-red-700/70 bg-red-950/70 text-red-200",
        name: "text-red-200",
      };
    case "knocked_by":
      return {
        shell: "border-rose-700/70 bg-rose-950/35",
        title: "text-rose-300",
        badge: "border-rose-700/70 bg-rose-950/70 text-rose-200",
        name: "text-rose-200",
      };
    default:
      return {
        shell: "border-[#2d2d2d] bg-[#111]",
        title: "text-[#e2d2af]",
        badge: "border-[#2d2d2d] bg-[#0f0f0f] text-[#9a9080]",
        name: "text-[#e2d2af]",
      };
  }
}

function displayFocusLabel(submitted: { mode: "encounters" | "streamer"; playerName: string; streamer: string } | null) {
  if (!submitted) return "Player";
  return submitted.mode === "streamer" ? submitted.streamer || "Streamer" : "You";
}

function labelFromName(name: string, submitted: { mode: "encounters" | "streamer"; playerName: string; streamer: string } | null) {
  if (!submitted) return name;
  const focus = submitted.mode === "streamer" ? submitted.streamer : submitted.playerName;
  if (focus && name.toLowerCase() === focus.toLowerCase()) {
    return displayFocusLabel(submitted);
  }
  return name;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decorateSummaryText(text: string, submitted: { mode: "encounters" | "streamer"; playerName: string; streamer: string } | null) {
  if (!submitted) return text;
  const focus = submitted.mode === "streamer" ? submitted.streamer : submitted.playerName;
  if (!focus) return text;
  const replacement = displayFocusLabel(submitted);
  return text.replace(new RegExp(`\\b${escapeRegExp(focus)}\\b`, "gi"), replacement);
}

function formatParticipantName(name: string | undefined, submitted: { mode: "encounters" | "streamer"; playerName: string; streamer: string } | null) {
  if (!name) return "Unknown";
  return labelFromName(name, submitted);
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
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [recentPlayers, setRecentPlayers] = useState<string[]>([]);
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

    setRecentPlayers(readRecentPlayersCookie());
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

  useEffect(() => {
    if (!activeClip) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activeClip]);

  useEffect(() => {
    setCopiedClipId(null);
  }, [activeClip]);

  const embedUrl = useMemo(() => {
    if (!activeClip) return "";
    const videoId = activeClip.video_id;
    if (!videoId) return "";

    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";

    let timecode = "0h0m0s";
    try {
      const parsed = new URL(activeClip.url);
      timecode = parsed.searchParams.get("t") || timecode;
    } catch {
      timecode = "0h0m0s";
    }

    return `https://player.twitch.tv/?video=v${encodeURIComponent(videoId)}&parent=${encodeURIComponent(host)}&t=${encodeURIComponent(timecode)}`;
  }, [activeClip]);

  function onAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = playerName.trim();
    if (!nextName) return;

    const nextRecentPlayers = [nextName, ...recentPlayers.filter((name) => name.toLowerCase() !== nextName.toLowerCase())]
      .slice(0, MAX_RECENT_PLAYERS);
    setRecentPlayers(nextRecentPlayers);
    writeRecentPlayersCookie(nextRecentPlayers);

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

  function runRecentPlayer(name: string) {
    const nextRecentPlayers = [name, ...recentPlayers.filter((entry) => entry.toLowerCase() !== name.toLowerCase())]
      .slice(0, MAX_RECENT_PLAYERS);
    setRecentPlayers(nextRecentPlayers);
    writeRecentPlayersCookie(nextRecentPlayers);
    setPlayerName(name);
    setSubmitted({
      mode: "encounters",
      playerName: name,
      streamer: "",
      platform,
    });
    localStorage.setItem(
      "pubg-clips-profile",
      JSON.stringify({
        mode: "encounters",
        playerName: name,
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

  async function copyClipLink() {
    if (!activeClip) return;

    try {
      await navigator.clipboard.writeText(activeClip.url);
      setCopiedClipId(activeClip.id);
    } catch {
      setError("Could not copy the link in this browser.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#9a8050]">PUBG Clips Feed</p>

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
              list="pubg-player-history"
              className="sm:col-span-2 w-full border border-[#2d2d2d] bg-[#0b0b0b] px-3 py-2 text-sm text-[#e2d2af] outline-none focus:border-[#f5c842]"
            />
            <datalist id="pubg-player-history">
              {recentPlayers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
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

            {recentPlayers.length > 0 && (
              <div className="sm:col-span-4">
                <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[#7f7768]">Recent local searches</p>
                <div className="flex flex-wrap gap-2">
                  {recentPlayers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => runRecentPlayer(name)}
                      className="border border-[#2d2d2d] bg-[#0f0f0f] px-2 py-1 text-xs text-[#b9ad96] hover:border-[#f5c842] hover:text-[#e2d2af]"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            (() => {
              const classes = toneClasses(clip.eventTone);
              return (
            <button
              key={clip.id}
              type="button"
              onClick={() => setActiveClip(clip)}
              className={`group block overflow-hidden border transition hover:scale-[1.01] hover:border-[#f5c842] ${classes.shell}`}
            >
              <img
                src={clip.thumbnail_url}
                alt={clip.title}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/pubg.avif";
                }}
                className="h-40 w-full object-cover transition group-hover:scale-[1.03]"
                loading="lazy"
              />
              <div className="p-3">
                <p className={`line-clamp-2 text-sm font-semibold uppercase tracking-[0.12em] ${classes.title}`}>
                  {clip.eventLabel || clip.title || "Player Event"}
                </p>
                <p className={`mt-2 text-[12px] font-medium uppercase tracking-[0.14em] ${classes.name}`}>
                  {formatParticipantName(clip.subjectName || clip.broadcaster_name, submitted)} vs {formatParticipantName(clip.targetName || clip.creator_name, submitted)}
                </p>
                {clip.summaryText && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#d6b376]">
                    {decorateSummaryText(clip.summaryText, submitted)}
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
            </button>
              );
            })()
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

      {activeClip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="PUBG clip video player"
          onClick={() => setActiveClip(null)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden border border-[#2d2d2d] bg-[#111]"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const classes = toneClasses(activeClip.eventTone);
              const leftName = formatParticipantName(activeClip.subjectName || activeClip.broadcaster_name, submitted);
              const rightName = formatParticipantName(activeClip.targetName || activeClip.creator_name, submitted);
              const summaryText = activeClip.summaryText ? decorateSummaryText(activeClip.summaryText, submitted) : "";

              return (
            <>
            <div className="flex items-center justify-between border-b border-[#2d2d2d] px-4 py-3">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-[0.12em] ${classes.title}`}>
                  {activeClip.eventLabel || activeClip.title || "Player Event"}
                </p>
                <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-[#b9ad96]">
                  {leftName} vs {rightName}
                </p>
                {summaryText && (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#d6b376]">
                    {summaryText}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveClip(null)}
                className="border border-[#2d2d2d] px-2 py-1 text-xs uppercase tracking-[0.1em] text-[#9a9080] hover:border-[#f5c842] hover:text-[#e2d2af]"
              >
                Close
              </button>
            </div>

            <div className="aspect-video w-full bg-black">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={activeClip.title || "PUBG clip"}
                  className="h-full w-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#9a9080]">
                  Unable to load video player for this event.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#2d2d2d] px-4 py-3">
              <p className={`text-xs uppercase tracking-[0.1em] ${classes.name}`}>
                {leftName} vs {rightName}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyClipLink}
                  className="border border-[#2d2d2d] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#b9ad96] hover:border-[#f5c842] hover:text-[#e2d2af]"
                >
                  {copiedClipId === activeClip.id ? "Copied" : "Copy link"}
                </button>
                <a
                  href={activeClip.url}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[#5e4d34] bg-[#1a1510] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#e2d2af] hover:border-[#f5c842]"
                >
                  Open on Twitch
                </a>
              </div>
            </div>
            </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}
