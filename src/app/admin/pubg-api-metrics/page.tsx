"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type MetricsResponse = {
  summary: {
    totalCalls: number;
    successCalls: number;
    notFoundCalls: number;
    failedCalls: number;
    successRate: number;
    avgDurationMs: number;
    callsPerMinuteLast60: number;
    rangeHours: number;
    granularity: string;
    since: string;
  };
  buckets: Array<{ bucket: string; total: number; success: number; notFound: number; failed: number }>;
  callTypeBreakdown: Array<{ callType: string; count: number }>;
  triggeredByBreakdown: Array<{ triggeredBy: string; count: number }>;
};

const GRANULARITY_OPTIONS = [
  { label: "Per minute (last 2h)", granularity: "minute", rangeHours: 2 },
  { label: "Per hour (last 48h)", granularity: "hour", rangeHours: 48 },
  { label: "Per hour (last 7d)", granularity: "hour", rangeHours: 168 },
  { label: "Per day (last 30d)", granularity: "day", rangeHours: 720 },
];

export default function PubgApiMetricsPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(1); // default: per hour 48h

  const fetchData = useCallback(async (idx: number) => {
    setLoading(true);
    setError(null);
    try {
      const opt = GRANULARITY_OPTIONS[idx];
      const res = await fetch(
        `/api/pubg/api-metrics?granularity=${opt.granularity}&rangeHours=${opt.rangeHours}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(selected);
  }, [selected, fetchData]);

  const s = data?.summary;

  return (
    <div className="space-y-6 p-6 text-sm text-[#cfc0a0]">
      <div>
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-[#f1d6aa]">
          PUBG API Call Metrics
        </h1>
        <p className="mt-1 text-[#9a9080]">
          Live instrumentation of every PUBG Developer API call made by this server.
        </p>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-2">
        {GRANULARITY_OPTIONS.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => setSelected(idx)}
            className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
              selected === idx
                ? "border-[#c8a96e] bg-[#c8a96e]/20 text-[#f1d6aa]"
                : "border-[#3a3020] bg-[#1a1508] text-[#9a9080] hover:border-[#c8a96e]/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => fetchData(selected)}
          className="rounded border border-[#3a3020] bg-[#1a1508] px-3 py-1 text-xs text-[#9a9080] hover:border-[#c8a96e]/50"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-[#9a9080]">Loading...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {s && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total Calls", value: s.totalCalls.toLocaleString() },
              { label: "Successful", value: s.successCalls.toLocaleString() },
              { label: "Not Found (404)", value: s.notFoundCalls.toLocaleString() },
              { label: "Failed (Errors)", value: s.failedCalls.toLocaleString() },
              { label: "Success Rate", value: `${s.successRate}%` },
              { label: "Avg Latency", value: `${s.avgDurationMs}ms` },
              { label: "Calls/min (last 60m)", value: String(s.callsPerMinuteLast60) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded border border-[#2a2010] bg-[#12100a] p-3"
              >
                <div className="text-xs text-[#7a7060]">{card.label}</div>
                <div className="mt-1 text-lg font-semibold text-[#f1d6aa]">{card.value}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="rounded border border-[#2a2010] bg-[#12100a] p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9a9080]">
              API Calls Over Time — {GRANULARITY_OPTIONS[selected].label}
            </h2>
            {data!.buckets.length === 0 ? (
              <p className="text-[#9a9080]">No calls recorded in this window yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data!.buckets} margin={{ top: 4, right: 8, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2010" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fill: "#7a7060", fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    interval="preserveStartEnd"
                  />
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
                  <Bar dataKey="success" name="Success" stackId="a" fill="#4a7c4e" />
                  <Bar dataKey="notFound" name="Not Found (404)" stackId="a" fill="#8b6b3a" />
                  <Bar dataKey="failed" name="Failed (Errors)" stackId="a" fill="#8b3a3a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Breakdown tables */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded border border-[#2a2010] bg-[#12100a] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9a9080]">
                By Call Type
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#7a7060]">
                    <th className="pb-2">Type</th>
                    <th className="pb-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.callTypeBreakdown.map((row) => (
                    <tr key={row.callType} className="border-t border-[#1e1a10]">
                      <td className="py-1 font-mono text-[#c8a96e]">{labelCallType(row.callType)}</td>
                      <td className="py-1 text-right text-[#f1d6aa]">{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data!.callTypeBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-2 text-[#7a7060]">No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded border border-[#2a2010] bg-[#12100a] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9a9080]">
                By Trigger Source
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#7a7060]">
                    <th className="pb-2">Source</th>
                    <th className="pb-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.triggeredByBreakdown.map((row) => (
                    <tr key={row.triggeredBy} className="border-t border-[#1e1a10]">
                      <td className="py-1 font-mono text-[#c8a96e]">{labelTriggeredBy(row.triggeredBy)}</td>
                      <td className="py-1 text-right text-[#f1d6aa]">{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data!.triggeredByBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-2 text-[#7a7060]">No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-[#6a6050]">
            Since {new Date(s.since).toLocaleString()} UTC · {s.totalCalls.toLocaleString()} total calls in window
          </p>
        </>
      )}
    </div>
  );
}

function labelCallType(value: string) {
  if (value === "player_lookup") return "Player Lookup";
  if (value === "match_fetch") return "Match Fetch";
  if (value === "telemetry_fetch") return "Telemetry Fetch";
  if (value === "samples_fetch") return "Samples Fetch";
  if (value === "api_fetch") return "Generic API Fetch";
  if (value === "uncategorized") return "Uncategorized";
  return value.replace(/_/g, " ");
}

function labelTriggeredBy(value: string) {
  if (value === "stream_online") return "Stream Online Webhook";
  if (value === "batch_linker") return "Batch Linker";
  if (value === "clips_encounters") return "Clips: Encounter Request";
  if (value === "clips_streamer") return "Clips: Streamer Request";
  if (value === "clips_pubg") return "Clips: PUBG Feed Request";
  if (value === "system_unspecified") return "System (Unspecified)";
  return value.replace(/_/g, " ");
}
