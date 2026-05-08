"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DiscoveryAnalyticsResponse = {
  summary: {
    days: number;
    since: string;
    totalIndexedPlayers: number;
    newIndexedPlayersInRange: number;
    seenPlayerObservationsInRange: number;
    activeContributorsInRange: number;
  };
  dailyNewPlayers: Array<{ day: string; count: number }>;
  dailyObservations: Array<{ day: string; count: number }>;
  shardBreakdown: Array<{ platform: string; shard: string; count: number }>;
  streamerContribution: Array<{
    twitchUserId: string;
    twitchUserLogin: string;
    twitchUserName: string;
    observations: number;
    uniquePlayers: number;
  }>;
  recentEventSubRuns: Array<{
    createdAt: string;
    status: "ok" | "empty" | "error";
    playerName: string | null;
    seenIndexing: Record<string, unknown> | null;
  }>;
};

type ProcessResponse = {
  ok: boolean;
  processed: number;
  indexedRuns: number;
  totalDiscoveredNew: number;
  totalObservations: number;
  totalUpserted: number;
};

export default function PubgDiscoveryDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiscoveryAnalyticsResponse | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && !isAdmin) {
      router.push("/");
    }
  }, [isAdmin, router, status]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pubg-discovery/analytics?days=${days}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as DiscoveryAnalyticsResponse;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchData();
  }, [isAdmin, fetchData]);

  const runBackgroundProcess = useCallback(async () => {
    setProcessing(true);
    try {
      const response = await fetch("/api/admin/pubg-discovery/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 12, maxMatches: 4 })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as ProcessResponse;
      setProcessResult(payload);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run discovery process");
    } finally {
      setProcessing(false);
    }
  }, [fetchData]);

  const chartRows = useMemo(() => {
    if (!data) return [] as Array<{ day: string; newPlayers: number; observations: number }>;

    const observationMap = new Map(data.dailyObservations.map((row) => [row.day, row.count]));
    const newPlayersMap = new Map(data.dailyNewPlayers.map((row) => [row.day, row.count]));

    const allDays = Array.from(new Set([...observationMap.keys(), ...newPlayersMap.keys()])).sort();
    return allDays.map((day) => ({
      day,
      newPlayers: newPlayersMap.get(day) ?? 0,
      observations: observationMap.get(day) ?? 0,
    }));
  }, [data]);

  if (status === "loading" || (status === "authenticated" && !isAdmin)) {
    return <div className="p-6 text-sm text-[#9a9080]">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6 text-sm text-[#cfc0a0]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-[#f1d6aa]">
            PUBG Discovery Dashboard
          </h1>
          <p className="mt-1 text-[#9a9080]">
            Background analysis of streamer matches to build a live PUBG player index.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14, 30].map((value) => (
            <button
              key={value}
              onClick={() => setDays(value)}
              className={`rounded border px-3 py-1 text-xs font-medium ${
                days === value
                  ? "border-[#c8a96e] bg-[#c8a96e]/20 text-[#f1d6aa]"
                  : "border-[#3a3020] bg-[#1a1508] text-[#9a9080]"
              }`}
            >
              {value}d
            </button>
          ))}
          <button
            onClick={() => void fetchData()}
            className="rounded border border-[#3a3020] bg-[#1a1508] px-3 py-1 text-xs text-[#9a9080]"
          >
            Refresh
          </button>
          <button
            onClick={() => void runBackgroundProcess()}
            disabled={processing}
            className="rounded border border-[#49533a] bg-[#1a1f14] px-3 py-1 text-xs font-semibold text-[#e2d2af] disabled:opacity-60"
          >
            {processing ? "Running..." : "Run Background Discovery"}
          </button>
        </div>
      </div>

      {loading && <p className="text-[#9a9080]">Loading analytics...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {processResult && (
        <div className="rounded border border-[#2a2010] bg-[#12100a] p-3 text-xs">
          Last background run: processed {processResult.processed}, indexed runs {processResult.indexedRuns},
          new players {processResult.totalDiscoveredNew}, observations {processResult.totalObservations}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Indexed Players" value={data.summary.totalIndexedPlayers.toLocaleString()} />
            <MetricCard label="New In Window" value={data.summary.newIndexedPlayersInRange.toLocaleString()} />
            <MetricCard label="Observations" value={data.summary.seenPlayerObservationsInRange.toLocaleString()} />
            <MetricCard label="Contributors" value={data.summary.activeContributorsInRange.toLocaleString()} />
            <MetricCard label="Window" value={`${data.summary.days} days`} />
            <MetricCard label="Since" value={new Date(data.summary.since).toLocaleDateString()} />
          </div>

          <div className="rounded border border-[#2a2010] bg-[#12100a] p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9a9080]">
              Daily Discovery Throughput
            </h2>
            {chartRows.length === 0 ? (
              <p className="text-[#9a9080]">No discovery rows in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2010" />
                  <XAxis dataKey="day" angle={-45} textAnchor="end" tick={{ fill: "#7a7060", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#7a7060", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1508",
                      border: "1px solid #3a3020",
                      color: "#cfc0a0",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ color: "#9a9080", fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="newPlayers" name="New Indexed Players" fill="#4a7c4e" />
                  <Bar dataKey="observations" name="Seen-Player Observations" fill="#8b6b3a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded border border-[#2a2010] bg-[#12100a] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9a9080]">
                Top Shards/Platforms (New Players)
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#7a7060]">
                    <th className="pb-2">Platform</th>
                    <th className="pb-2">Shard</th>
                    <th className="pb-2 text-right">New Players</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shardBreakdown.map((row) => (
                    <tr key={`${row.platform}:${row.shard}`} className="border-t border-[#1e1a10]">
                      <td className="py-1 text-[#c8a96e]">{row.platform}</td>
                      <td className="py-1 text-[#c8a96e]">{row.shard}</td>
                      <td className="py-1 text-right text-[#f1d6aa]">{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.shardBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-[#7a7060]">No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded border border-[#2a2010] bg-[#12100a] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9a9080]">
                Streamer Contribution Leaderboard
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#7a7060]">
                    <th className="pb-2">Streamer</th>
                    <th className="pb-2 text-right">Unique Players</th>
                    <th className="pb-2 text-right">Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {data.streamerContribution.slice(0, 15).map((row) => (
                    <tr key={row.twitchUserId} className="border-t border-[#1e1a10]">
                      <td className="py-1 text-[#c8a96e]">{row.twitchUserLogin}</td>
                      <td className="py-1 text-right text-[#f1d6aa]">{row.uniquePlayers.toLocaleString()}</td>
                      <td className="py-1 text-right text-[#f1d6aa]">{row.observations.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.streamerContribution.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-[#7a7060]">No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#2a2010] bg-[#12100a] p-3">
      <div className="text-xs text-[#7a7060]">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-[#f1d6aa]">{props.value}</div>
    </div>
  );
}
