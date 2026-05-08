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
  type: z.enum(["hot-drop", "secret-room", "secret-key", "vehicle-route"]),
  x: z.number(),
  y: z.number(),
  notes: z.string().min(1)
});

const patchSchema = z.object({
  calibration: calibrationSchema.nullable().optional(),
  entities: z.array(markerSchema).nullable().optional()
});

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
      updatedAt: true,
      updatedByUserId: true
    }
  });

  return NextResponse.json({
    mapSlug: slug,
    calibration: safeParseJson(config?.calibrationJson),
    entities: safeParseJson(config?.entitiesJson),
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

  if (!hasCalibration && !hasEntities) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updateData: {
    updatedByUserId: string;
    calibrationJson?: string | null;
    entitiesJson?: string | null;
  } = {
    updatedByUserId: session!.user.id
  };

  if (hasCalibration) {
    updateData.calibrationJson = parsed.data.calibration ? JSON.stringify(parsed.data.calibration) : null;
  }

  if (hasEntities) {
    updateData.entitiesJson = parsed.data.entities ? JSON.stringify(parsed.data.entities) : null;
  }

  const saved = await prisma.pubgMapConfig.upsert({
    where: { mapSlug: slug },
    create: {
      mapSlug: slug,
      updatedByUserId: updateData.updatedByUserId,
      calibrationJson: updateData.calibrationJson ?? null,
      entitiesJson: updateData.entitiesJson ?? null
    },
    update: updateData,
    select: {
      mapSlug: true,
      calibrationJson: true,
      entitiesJson: true,
      updatedAt: true,
      updatedByUserId: true
    }
  });

  return NextResponse.json({
    ok: true,
    mapSlug: saved.mapSlug,
    calibration: safeParseJson(saved.calibrationJson),
    entities: safeParseJson(saved.entitiesJson),
    updatedAt: saved.updatedAt,
    updatedByUserId: saved.updatedByUserId
  });
}
