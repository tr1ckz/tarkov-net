import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BucketRow = {
  bucket: string;
  total: number;
  success: number;
  failed: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const granularity = searchParams.get("granularity") ?? "hour"; // "minute" | "hour" | "day"
  const rangeHours = Math.min(Math.max(Number(searchParams.get("rangeHours") ?? "48"), 1), 720);

  const since = new Date(Date.now() - rangeHours * 60 * 60 * 1000);

  // Raw logs for the window
  const logs = await prisma.pubgApiCallLog.findMany({
    where: { calledAt: { gte: since } },
    select: {
      calledAt: true,
      callType: true,
      success: true,
      triggeredBy: true,
      durationMs: true,
      statusCode: true,
    },
    orderBy: { calledAt: "asc" },
  });

  // Aggregate into buckets
  const bucketMap = new Map<string, { total: number; success: number; failed: number }>();

  for (const row of logs) {
    const d = new Date(row.calledAt);
    let bucket: string;
    if (granularity === "minute") {
      bucket = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    } else if (granularity === "day") {
      bucket = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    } else {
      bucket = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
    }
    const existing = bucketMap.get(bucket) ?? { total: 0, success: 0, failed: 0 };
    existing.total += 1;
    if (row.success) existing.success += 1;
    else existing.failed += 1;
    bucketMap.set(bucket, existing);
  }

  const buckets: BucketRow[] = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, counts]) => ({ bucket, ...counts }));

  // Breakdown by callType
  const callTypeMap = new Map<string, number>();
  const triggeredByMap = new Map<string, number>();
  let totalCalls = 0;
  let successCalls = 0;
  let avgDurationMs = 0;

  for (const row of logs) {
    totalCalls += 1;
    if (row.success) successCalls += 1;
    avgDurationMs += row.durationMs ?? 0;
    const ct = row.callType ?? "unknown";
    callTypeMap.set(ct, (callTypeMap.get(ct) ?? 0) + 1);
    const tb = row.triggeredBy ?? "unknown";
    triggeredByMap.set(tb, (triggeredByMap.get(tb) ?? 0) + 1);
  }

  if (totalCalls > 0) avgDurationMs = Math.round(avgDurationMs / totalCalls);

  const callTypeBreakdown = Array.from(callTypeMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([callType, count]) => ({ callType, count }));

  const triggeredByBreakdown = Array.from(triggeredByMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([triggeredBy, count]) => ({ triggeredBy, count }));

  // Per-minute rate for the last 60 min
  const last60minSince = new Date(Date.now() - 60 * 60 * 1000);
  const last60minCount = logs.filter((r) => r.calledAt >= last60minSince).length;
  const callsPerMinuteLast60 = +(last60minCount / 60).toFixed(2);

  return NextResponse.json({
    summary: {
      totalCalls,
      successCalls,
      failedCalls: totalCalls - successCalls,
      successRate: totalCalls > 0 ? +((successCalls / totalCalls) * 100).toFixed(1) : 100,
      avgDurationMs,
      callsPerMinuteLast60,
      rangeHours,
      granularity,
      since: since.toISOString(),
    },
    buckets,
    callTypeBreakdown,
    triggeredByBreakdown,
  });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
