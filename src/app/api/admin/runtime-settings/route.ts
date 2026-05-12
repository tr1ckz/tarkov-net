import { getServerSession, Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RuntimeSettingInput = {
  key: string;
  value: string;
};

const ALLOWED_KEYS = new Set([
  "WORKER_LOG_LEVEL",
  "SCRIPT_LOG_LEVEL",
  "LOG_LEVEL",
  "STARTUP_LOG_LEVEL",
  "PUBG_CRAWLER_LOG_LEVEL",
  "MANUAL_PUBG_LOG_LEVEL",
  "CLEAN_NEXT_LOG_LEVEL",
]);

const ALLOWED_LEVELS = new Set(["verbose", "debug", "info", "warn", "error", "silent"]);

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const db = prisma as any;
  const rows = await db.runtimeSetting.findMany({
    where: {
      key: { in: Array.from(ALLOWED_KEYS) },
    },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({
    settings: rows,
    allowedKeys: Array.from(ALLOWED_KEYS),
    allowedLevels: Array.from(ALLOWED_LEVELS),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const payload = (await request.json().catch(() => null)) as { settings?: RuntimeSettingInput[] } | null;
  const settings = Array.isArray(payload?.settings) ? payload.settings : [];

  if (!settings.length) {
    return NextResponse.json({ error: "No settings provided" }, { status: 400 });
  }

  const sanitized: RuntimeSettingInput[] = [];
  for (const row of settings) {
    const key = String(row?.key ?? "").trim();
    const value = String(row?.value ?? "").trim().toLowerCase();

    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: `Unsupported key: ${key}` }, { status: 400 });
    }

    if (!ALLOWED_LEVELS.has(value)) {
      return NextResponse.json({ error: `Unsupported level for ${key}: ${value}` }, { status: 400 });
    }

    sanitized.push({ key, value });
  }

  const db = prisma as any;
  await Promise.all(
    sanitized.map((row) =>
      db.runtimeSetting.upsert({
        where: { key: row.key },
        create: { key: row.key, value: row.value },
        update: { value: row.value },
      })
    )
  );

  const rows = await db.runtimeSetting.findMany({
    where: {
      key: { in: Array.from(ALLOWED_KEYS) },
    },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ settings: rows });
}
