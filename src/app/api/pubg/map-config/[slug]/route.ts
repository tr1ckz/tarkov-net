import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const calibrationSchema = z.object({
  xOffset: z.number(),
  yOffset: z.number(),
  xScale: z.number(),
  yScale: z.number()
});

const markerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1).max(64),
  x: z.number(),
  y: z.number(),
  notes: z.string().min(1)
});

const colorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/, "Expected 6-digit hex color");

const legendColorsSchema = z.record(z.string().min(1).max(64), colorSchema);
const categoryLabelsSchema = z.record(z.string().min(1).max(64), z.string().trim().min(1).max(80));
const mapThemeSchema = z.enum(["dark", "light"]);

const patchSchema = z.object({
  calibration: calibrationSchema.nullable().optional(),
  entities: z.array(markerSchema).nullable().optional(),
  legendColors: legendColorsSchema.nullable().optional(),
  categoryLabels: categoryLabelsSchema.nullable().optional(),
  mapTheme: mapThemeSchema.nullable().optional(),
  mapImageUrl: z.string().trim().min(1).max(500).nullable().optional()
});

type LegendPayload = {
  colors?: Record<string, string>;
  labels?: Record<string, string>;
  theme?: "dark" | "light";
};

function parseLegend(value: string | null | undefined): LegendPayload | null {
  const parsed = safeParseJson<unknown>(value);
  if (!parsed || typeof parsed !== "object") return null;

  // Backward compatibility: previous shape was a plain color record.
  const maybeColorRecord = Object.values(parsed as Record<string, unknown>).every(
    (v) => typeof v === "string" && /^#([0-9a-fA-F]{6})$/.test(v)
  );
  if (maybeColorRecord) {
    return { colors: parsed as Record<string, string>, labels: {} };
  }

  const obj = parsed as { colors?: unknown; labels?: unknown; theme?: unknown };
  const colors = obj.colors && typeof obj.colors === "object" ? (obj.colors as Record<string, string>) : {};
  const labels = obj.labels && typeof obj.labels === "object" ? (obj.labels as Record<string, string>) : {};
  const theme = obj.theme === "dark" || obj.theme === "light" ? obj.theme : undefined;
  return { colors, labels, theme };
}

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function safeParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "Missing map slug" }, { status: 400 });
  }

  const config = await prisma.pubgMapConfig.findUnique({
    where: { mapSlug: slug },
    select: {
      mapSlug: true,
      calibrationJson: true,
      entitiesJson: true,
      legendJson: true,
      mapImageUrl: true,
      updatedAt: true,
      updatedByUserId: true
    }
  });

  const legend = parseLegend(config?.legendJson);

  return NextResponse.json({
    mapSlug: slug,
    calibration: safeParseJson(config?.calibrationJson),
    entities: safeParseJson(config?.entitiesJson),
    legendColors: legend?.colors ?? null,
    categoryLabels: legend?.labels ?? null,
    mapTheme: legend?.theme ?? null,
    mapImageUrl: config?.mapImageUrl ?? null,
    updatedAt: config?.updatedAt ?? null,
    updatedByUserId: config?.updatedByUserId ?? null
  });
}

export async function PATCH(request: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const slug = params.slug?.trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "Missing map slug" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid map config payload" }, { status: 400 });
  }

  const hasCalibration = Object.prototype.hasOwnProperty.call(parsed.data, "calibration");
  const hasEntities = Object.prototype.hasOwnProperty.call(parsed.data, "entities");
  const hasLegend = Object.prototype.hasOwnProperty.call(parsed.data, "legendColors");
  const hasLabels = Object.prototype.hasOwnProperty.call(parsed.data, "categoryLabels");
  const hasMapTheme = Object.prototype.hasOwnProperty.call(parsed.data, "mapTheme");
  const hasMapImage = Object.prototype.hasOwnProperty.call(parsed.data, "mapImageUrl");

  if (!hasCalibration && !hasEntities && !hasLegend && !hasLabels && !hasMapTheme && !hasMapImage) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updateData: {
    updatedByUserId: string;
    calibrationJson?: string | null;
    entitiesJson?: string | null;
    legendJson?: string | null;
    mapImageUrl?: string | null;
  } = {
    updatedByUserId: session!.user.id
  };

  if (hasCalibration) {
    updateData.calibrationJson = parsed.data.calibration ? JSON.stringify(parsed.data.calibration) : null;
  }

  if (hasEntities) {
    updateData.entitiesJson = parsed.data.entities ? JSON.stringify(parsed.data.entities) : null;
  }

  if (hasLegend || hasLabels || hasMapTheme) {
    const current = await prisma.pubgMapConfig.findUnique({
      where: { mapSlug: slug },
      select: { legendJson: true }
    });
    const existing = parseLegend(current?.legendJson);
    const colors = hasLegend ? (parsed.data.legendColors ?? null) : (existing?.colors ?? null);
    const labels = hasLabels ? (parsed.data.categoryLabels ?? null) : (existing?.labels ?? null);
    const theme = hasMapTheme ? (parsed.data.mapTheme ?? null) : (existing?.theme ?? null);

    updateData.legendJson =
      colors || labels || theme
        ? JSON.stringify({
            colors: colors ?? {},
            labels: labels ?? {},
            theme: theme ?? null
          })
        : null;
  }

  if (hasMapImage) {
    updateData.mapImageUrl = parsed.data.mapImageUrl ? parsed.data.mapImageUrl : null;
  }

  const saved = await prisma.pubgMapConfig.upsert({
    where: { mapSlug: slug },
    create: {
      mapSlug: slug,
      updatedByUserId: updateData.updatedByUserId,
      calibrationJson: updateData.calibrationJson ?? null,
      entitiesJson: updateData.entitiesJson ?? null,
      legendJson: updateData.legendJson ?? null,
      mapImageUrl: updateData.mapImageUrl ?? null
    },
    update: updateData,
    select: {
      mapSlug: true,
      calibrationJson: true,
      entitiesJson: true,
      legendJson: true,
      mapImageUrl: true,
      updatedAt: true,
      updatedByUserId: true
    }
  });

  return NextResponse.json({
    ok: true,
    mapSlug: saved.mapSlug,
    calibration: safeParseJson(saved.calibrationJson),
    entities: safeParseJson(saved.entitiesJson),
    legendColors: parseLegend(saved.legendJson)?.colors ?? null,
    categoryLabels: parseLegend(saved.legendJson)?.labels ?? null,
    mapTheme: parseLegend(saved.legendJson)?.theme ?? null,
    mapImageUrl: saved.mapImageUrl,
    updatedAt: saved.updatedAt,
    updatedByUserId: saved.updatedByUserId
  });
}
