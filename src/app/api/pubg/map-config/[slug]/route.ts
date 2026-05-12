import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type LegendPayload = {
  legendColors?: Record<string, string> | null;
  categoryLabels?: Record<string, string> | null;
  hiddenCategories?: string[] | null;
  mapTheme?: "dark" | "light" | null;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeLegend(input: unknown): LegendPayload {
  if (!input || typeof input !== "object") {
    return {};
  }

  const parsed = input as Record<string, unknown>;
  const hasStructuredShape =
    Object.prototype.hasOwnProperty.call(parsed, "legendColors") ||
    Object.prototype.hasOwnProperty.call(parsed, "categoryLabels") ||
    Object.prototype.hasOwnProperty.call(parsed, "hiddenCategories") ||
    Object.prototype.hasOwnProperty.call(parsed, "mapTheme");

  if (!hasStructuredShape) {
    return {
      legendColors: parsed as Record<string, string>,
      categoryLabels: {},
      hiddenCategories: [],
      mapTheme: null,
    };
  }

  return {
    legendColors: (parsed.legendColors as Record<string, string> | null | undefined) ?? {},
    categoryLabels: (parsed.categoryLabels as Record<string, string> | null | undefined) ?? {},
    hiddenCategories: Array.isArray(parsed.hiddenCategories)
      ? parsed.hiddenCategories.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    mapTheme:
      parsed.mapTheme === "dark" || parsed.mapTheme === "light"
        ? parsed.mapTheme
        : null,
  };
}

export async function GET(_request: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug;
  if (!slug) {
    return NextResponse.json({ error: "Missing map slug" }, { status: 400 });
  }

  const config = await prisma.pubgMapConfig.findUnique({
    where: { mapSlug: slug },
  });

  if (!config) {
    return NextResponse.json({
      calibration: null,
      entities: null,
      legendColors: null,
      categoryLabels: null,
      hiddenCategories: null,
      mapTheme: null,
      mapImageUrl: null,
    });
  }

  const legend = normalizeLegend(parseJson<unknown>(config.legendJson, {}));

  return NextResponse.json({
    calibration: parseJson(config.calibrationJson, null),
    entities: parseJson(config.entitiesJson, null),
    legendColors: legend.legendColors ?? {},
    categoryLabels: legend.categoryLabels ?? {},
    hiddenCategories: legend.hiddenCategories ?? [],
    mapTheme: legend.mapTheme ?? null,
    mapImageUrl: config.mapImageUrl ?? null,
  });
}

export async function PATCH(request: Request, context: { params: { slug: string } }) {
  const session = await getSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = context.params.slug;
  if (!slug) {
    return NextResponse.json({ error: "Missing map slug" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => null)) as {
    calibration?: unknown;
    entities?: unknown;
    legendColors?: Record<string, string> | null;
    categoryLabels?: Record<string, string> | null;
    hiddenCategories?: string[] | null;
    mapTheme?: "dark" | "light" | null;
    mapImageUrl?: string | null;
  } | null;

  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.pubgMapConfig.findUnique({ where: { mapSlug: slug } });
  const existingLegend = normalizeLegend(parseJson<unknown>(existing?.legendJson, {}));

  const shouldUpdateLegend =
    Object.prototype.hasOwnProperty.call(payload, "legendColors") ||
    Object.prototype.hasOwnProperty.call(payload, "categoryLabels") ||
    Object.prototype.hasOwnProperty.call(payload, "hiddenCategories") ||
    Object.prototype.hasOwnProperty.call(payload, "mapTheme");

  const nextLegend: LegendPayload = {
    legendColors:
      Object.prototype.hasOwnProperty.call(payload, "legendColors")
        ? payload.legendColors ?? {}
        : existingLegend.legendColors ?? {},
    categoryLabels:
      Object.prototype.hasOwnProperty.call(payload, "categoryLabels")
        ? payload.categoryLabels ?? {}
        : existingLegend.categoryLabels ?? {},
    hiddenCategories:
      Object.prototype.hasOwnProperty.call(payload, "hiddenCategories")
        ? (payload.hiddenCategories ?? []).filter((entry) => typeof entry === "string" && entry.trim().length > 0)
        : existingLegend.hiddenCategories ?? [],
    mapTheme:
      Object.prototype.hasOwnProperty.call(payload, "mapTheme")
        ? payload.mapTheme ?? null
        : existingLegend.mapTheme ?? null,
  };

  const updated = await prisma.pubgMapConfig.upsert({
    where: { mapSlug: slug },
    create: {
      mapSlug: slug,
      calibrationJson: Object.prototype.hasOwnProperty.call(payload, "calibration") ? (payload.calibration ? JSON.stringify(payload.calibration) : null) : null,
      entitiesJson: Object.prototype.hasOwnProperty.call(payload, "entities") ? (payload.entities ? JSON.stringify(payload.entities) : null) : null,
      legendJson: shouldUpdateLegend ? JSON.stringify(nextLegend) : null,
      mapImageUrl: Object.prototype.hasOwnProperty.call(payload, "mapImageUrl") ? (payload.mapImageUrl?.trim() || null) : null,
      updatedByUserId: session?.user?.id ?? null,
    },
    update: {
      calibrationJson: Object.prototype.hasOwnProperty.call(payload, "calibration")
        ? (payload.calibration ? JSON.stringify(payload.calibration) : null)
        : existing?.calibrationJson,
      entitiesJson: Object.prototype.hasOwnProperty.call(payload, "entities")
        ? (payload.entities ? JSON.stringify(payload.entities) : null)
        : existing?.entitiesJson,
      legendJson: shouldUpdateLegend
        ? JSON.stringify(nextLegend)
        : existing?.legendJson,
      mapImageUrl: Object.prototype.hasOwnProperty.call(payload, "mapImageUrl")
        ? (payload.mapImageUrl?.trim() || null)
        : existing?.mapImageUrl,
      updatedByUserId: session?.user?.id ?? existing?.updatedByUserId ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    mapSlug: updated.mapSlug,
    updatedAt: updated.updatedAt,
  });
}
