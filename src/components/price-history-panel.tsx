"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { HistoricalPricePoint } from "@/types/tarkov";
import { fullPrice } from "@/lib/utils";

// Chart inner padding (px in SVG coordinate space)
const PAD_L = 58;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 26;

function compactK(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

function yTickValues(min: number, max: number, count = 5): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const step = range / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

function formatXLabel(date: Date, range: RangeKey): string {
  if (range === "24h") return `${date.getHours().toString().padStart(2, "0")}:00`;
  if (range === "7d") return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

type PricePoint = {
  timestamp: Date;
  price: number;
};

type Props = {
  points: HistoricalPricePoint[];
};

type RangeKey = "24h" | "7d" | "30d" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string; windowMs: number | null }[] = [
  { key: "24h", label: "24H", windowMs: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7D", windowMs: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30D", windowMs: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All", windowMs: null }
];

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const isEpochString = /^\d+$/.test(value);
  const date = isEpochString ? new Date(Number(value)) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizePoints(points: HistoricalPricePoint[]) {
  return points
    .map((point) => {
      const rawPrice = point.price ?? point.priceMin ?? null;
      const price = typeof rawPrice === "number" && Number.isFinite(rawPrice) ? rawPrice : null;
      const timestamp = parseTimestamp(point.timestamp ?? null);

      if (price === null || !timestamp) {
        return null;
      }

      return { timestamp, price };
    })
    .filter((point): point is PricePoint => Boolean(point))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function computeDeltaPercent(from: number, to: number) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

export function PriceHistoryPanel({ points }: Props) {
  const parsed = useMemo(() => normalizePoints(points), [points]);
  const [activeRange, setActiveRange] = useState<RangeKey>("7d");

  const filtered = useMemo(() => {
    if (!parsed.length) {
      return parsed;
    }

    const selectedRange = RANGE_OPTIONS.find((option) => option.key === activeRange);
    if (!selectedRange?.windowMs) {
      return parsed;
    }

    const cutOff = Date.now() - selectedRange.windowMs;
    const inRange = parsed.filter((point) => point.timestamp.getTime() >= cutOff);

    // If a range is sparse, fall back to a recent slice so the chart stays usable.
    return inRange.length >= 2 ? inRange : parsed.slice(-Math.min(50, parsed.length));
  }, [activeRange, parsed]);

  const summary = useMemo(() => {
    if (!filtered.length) {
      return null;
    }

    const prices = filtered.map((point) => point.price);
    const first = filtered[0].price;
    const latest = filtered[filtered.length - 1].price;
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const average = Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length);
    const delta = latest - first;
    const deltaPct = computeDeltaPercent(first, latest);

    return {
      latest,
      low,
      high,
      average,
      delta,
      deltaPct
    };
  }, [filtered]);

  const timing = useMemo(() => {
    const source = filtered.length ? filtered : parsed;
    const hourlyBuckets = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
    const weekdayBuckets = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));

    for (const point of source) {
      const hour = point.timestamp.getHours();
      const day = point.timestamp.getDay();
      hourlyBuckets[hour].sum += point.price;
      hourlyBuckets[hour].count += 1;
      weekdayBuckets[day].sum += point.price;
      weekdayBuckets[day].count += 1;
    }

    const hourlyAvg = hourlyBuckets.map((bucket) =>
      bucket.count ? Math.round(bucket.sum / bucket.count) : 0
    );
    const weekdayAvg = weekdayBuckets.map((bucket) =>
      bucket.count ? Math.round(bucket.sum / bucket.count) : 0
    );

    const bestHourPrice = Math.max(...hourlyAvg);
    const bestHour = hourlyAvg.findIndex((value) => value === bestHourPrice);
    const bestWeekdayPrice = Math.max(...weekdayAvg);
    const bestWeekday = weekdayAvg.findIndex((value) => value === bestWeekdayPrice);

    return {
      bestHour,
      bestHourPrice,
      bestWeekday,
      bestWeekdayPrice,
      hourlyAvg
    };
  }, [filtered, parsed]);

  if (!parsed.length) {
    return (
      <Card>
        <CardTitle className="mb-2">Market Timing Intelligence</CardTitle>
        <p className="text-sm text-[#9a9080]">No historical pricing data returned for this item.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle className="mb-3">Market Timing Intelligence</CardTitle>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setActiveRange(option.key)}
            className={`border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              activeRange === option.key
                ? "border-[#e2d2af] bg-[#e2d2af] text-[#0e0e0e]"
                : "border-[#2d2d2d] bg-[#111] text-[#c8bda0] hover:bg-[#5e6a4b] hover:border-[#5e6a4b]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="border border-[#2d2d2d] bg-[#111] p-3">
          <p className="text-xs uppercase text-[#9a9080]">Range Delta</p>
          <p className={`text-lg font-semibold ${summary && summary.delta >= 0 ? "text-[#5e6a4b]" : "text-[#a32a2a]"}`}>
            {summary && summary.delta >= 0 ? "+" : ""}
            {fullPrice(summary?.delta ?? 0)} RUB
          </p>
          <p className="text-xs text-[#9a9080]">
            {summary ? `${summary.deltaPct >= 0 ? "+" : ""}${summary.deltaPct.toFixed(2)}%` : "-"}
          </p>
        </div>
        <div className="border border-[#2d2d2d] bg-[#111] p-3">
          <p className="text-xs uppercase text-[#9a9080]">Range Low / High</p>
          <p className="text-lg font-semibold text-[#e2d2af]">
            {fullPrice(summary?.low ?? 0)} / {fullPrice(summary?.high ?? 0)}
          </p>
          <p className="text-xs text-[#9a9080]">Avg {fullPrice(summary?.average ?? 0)} RUB</p>
        </div>
        <div className="border border-[#2d2d2d] bg-[#111] p-3">
          <p className="text-xs uppercase text-[#9a9080]">Current Snapshot</p>
          <p className="text-lg font-semibold text-[#e2d2af]">{fullPrice(summary?.latest ?? 0)} RUB</p>
          <p className="text-xs text-[#9a9080]">{filtered.length} points in selected range</p>
        </div>
      </div>

      <TrendChart points={filtered} activeRange={activeRange} />

      <HourlyChart
        hourlyAvg={timing.hourlyAvg}
        bestHour={timing.bestHour}
        bestHourPrice={timing.bestHourPrice}
        bestWeekday={timing.bestWeekday}
        bestWeekdayPrice={timing.bestWeekdayPrice}
      />
    </Card>
  );
}

// ── Trend chart ────────────────────────────────────────────────────────────────

type TrendChartProps = {
  points: PricePoint[];
  activeRange: RangeKey;
};

function TrendChart({ points, activeRange }: TrendChartProps) {
  if (points.length < 2) {
    return <p className="mb-4 text-xs text-[#9a9080]">Not enough data points for selected range.</p>;
  }

  const IW = 620;
  const IH = 180;
  const VW = IW + PAD_L + PAD_R;
  const VH = IH + PAD_T + PAD_B;

  const prices = points.map((p) => p.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const pad = Math.max(1, (rawMax - rawMin) * 0.12);
  const pMin = rawMin - pad;
  const pMax = rawMax + pad;
  const pRange = pMax - pMin;
  const tMin = points[0].timestamp.getTime();
  const tMax = points[points.length - 1].timestamp.getTime();
  const tRange = Math.max(1, tMax - tMin);

  const toX = (t: number) => PAD_L + ((t - tMin) / tRange) * IW;
  const toY = (p: number) => PAD_T + (1 - (p - pMin) / pRange) * IH;

  const pathD = points
    .map(({ timestamp, price }, i) =>
      `${i === 0 ? "M" : "L"}${toX(timestamp.getTime()).toFixed(1)},${toY(price).toFixed(1)}`
    )
    .join(" ");

  const yTickVals = yTickValues(rawMin, rawMax, 5);
  const tickCount = Math.min(6, points.length);
  const xTickIndices = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i / Math.max(1, tickCount - 1)) * (points.length - 1))
  );

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#e2d2af]">Price Trend</p>
      <div className="border border-[#2d2d2d] bg-[#0e0e0e] p-2">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ display: "block" }}>
          {yTickVals.map((val, i) => {
            const y = toY(val);
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={PAD_L + IW} y2={y} stroke="#222" strokeWidth="1" />
                <text x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize="11" fill="#9a9080" fontFamily="Rajdhani, sans-serif">
                  {compactK(val)}
                </text>
              </g>
            );
          })}
          {xTickIndices.map((idx, i) => {
            const pt = points[idx];
            const x = toX(pt.timestamp.getTime());
            return (
              <g key={i}>
                <line x1={x} y1={PAD_T + IH} x2={x} y2={PAD_T + IH + 4} stroke="#3d3d3d" strokeWidth="1" />
                <text x={x} y={PAD_T + IH + 18} textAnchor="middle" fontSize="11" fill="#9a9080" fontFamily="Rajdhani, sans-serif">
                  {formatXLabel(pt.timestamp, activeRange)}
                </text>
              </g>
            );
          })}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + IH} stroke="#3d3d3d" strokeWidth="1" />
          <line x1={PAD_L} y1={PAD_T + IH} x2={PAD_L + IW} y2={PAD_T + IH} stroke="#3d3d3d" strokeWidth="1" />
          <path d={pathD} fill="none" stroke="#5e6a4b" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// ── Hourly chart ───────────────────────────────────────────────────────────────

type HourlyChartProps = {
  hourlyAvg: number[];
  bestHour: number;
  bestHourPrice: number;
  bestWeekday: number;
  bestWeekdayPrice: number;
};

function HourlyChart({ hourlyAvg, bestHour, bestHourPrice, bestWeekday, bestWeekdayPrice }: HourlyChartProps) {
  const nonZero = hourlyAvg.filter((v) => v > 0);

  if (nonZero.length < 2) {
    return <p className="text-xs text-[#9a9080]">Not enough hourly data.</p>;
  }

  const IW = 620;
  const IH = 130;
  const VW = IW + PAD_L + PAD_R;
  const VH = IH + PAD_T + PAD_B;

  const rawMin = Math.min(...nonZero);
  const rawMax = Math.max(...nonZero);
  const pad = Math.max(1, (rawMax - rawMin) * 0.12);
  const pMin = rawMin - pad;
  const pMax = rawMax + pad;
  const pRange = pMax - pMin;

  const pts = hourlyAvg.map((val, hour) => ({ hour, val })).filter((p) => p.val > 0);

  const toX = (hour: number) => PAD_L + (hour / 23) * IW;
  const toY = (p: number) => PAD_T + (1 - (p - pMin) / pRange) * IH;

  const pathD = pts
    .map(({ hour, val }, i) =>
      `${i === 0 ? "M" : "L"}${toX(hour).toFixed(1)},${toY(val).toFixed(1)}`
    )
    .join(" ");

  const yTickVals = yTickValues(rawMin, rawMax, 4);
  const xHourTicks = [0, 4, 8, 12, 16, 20, 23];
  const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#e2d2af]">Hourly Sell Window</p>
      <div className="border border-[#2d2d2d] bg-[#0e0e0e] p-2">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ display: "block" }}>
          {yTickVals.map((val, i) => {
            const y = toY(val);
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={PAD_L + IW} y2={y} stroke="#222" strokeWidth="1" />
                <text x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize="11" fill="#9a9080" fontFamily="Rajdhani, sans-serif">
                  {compactK(val)}
                </text>
              </g>
            );
          })}
          {xHourTicks.map((hour) => {
            const x = toX(hour);
            return (
              <g key={hour}>
                <line x1={x} y1={PAD_T + IH} x2={x} y2={PAD_T + IH + 4} stroke="#3d3d3d" strokeWidth="1" />
                <text x={x} y={PAD_T + IH + 18} textAnchor="middle" fontSize="11" fill="#9a9080" fontFamily="Rajdhani, sans-serif">
                  {hour.toString().padStart(2, "0")}:00
                </text>
              </g>
            );
          })}
          <line
            x1={toX(bestHour)} y1={PAD_T}
            x2={toX(bestHour)} y2={PAD_T + IH}
            stroke="#9a8b4f" strokeWidth="1" strokeDasharray="3 3"
          />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + IH} stroke="#3d3d3d" strokeWidth="1" />
          <line x1={PAD_L} y1={PAD_T + IH} x2={PAD_L + IW} y2={PAD_T + IH} stroke="#3d3d3d" strokeWidth="1" />
          <path d={pathD} fill="none" stroke="#9a8b4f" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="mt-2 text-xs text-[#9a9080]">
        Best hour:{" "}
        <span className="text-[#e2d2af]">{bestHour.toString().padStart(2, "0")}:00</span>{" "}
        ({fullPrice(bestHourPrice)} RUB) · Best day:{" "}
        <span className="text-[#e2d2af]">{weekdays[bestWeekday]}</span>{" "}
        ({fullPrice(bestWeekdayPrice)} RUB)
      </p>
    </div>
  );
}
