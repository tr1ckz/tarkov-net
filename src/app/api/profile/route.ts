import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { lookupTarkovProfilesByIgn } from "@/lib/tarkov-player";

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  gameName: z.string().trim().max(15).optional().or(z.literal(""))
});

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload" }, { status: 400 });
  }

  const gameName = parsed.data.gameName?.trim() ? parsed.data.gameName.trim() : null;

  let lookup = {
    regularProfileId: null as string | null,
    pveProfileId: null as string | null,
    arenaProfileId: null as string | null
  };

  if (gameName) {
    lookup = await lookupTarkovProfilesByIgn(gameName);

    if (!lookup.regularProfileId && !lookup.pveProfileId && !lookup.arenaProfileId) {
      return NextResponse.json(
        { error: "No Tarkov.dev profile found for that IGN in PvP, PvE, or Arena indexes yet." },
        { status: 400 }
      );
    }
  }

  const defaultMode = lookup.regularProfileId
    ? "regular"
    : lookup.pveProfileId
      ? "pve"
      : lookup.arenaProfileId
        ? "arena"
        : null;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      displayName: parsed.data.displayName.trim(),
      gameName,
      tarkovProfileId: lookup.regularProfileId,
      tarkovProfileMode: defaultMode,
      tarkovPveProfileId: lookup.pveProfileId,
      tarkovArenaProfileId: lookup.arenaProfileId
    },
    select: {
      displayName: true,
      gameName: true,
      tarkovProfileId: true,
      tarkovProfileMode: true,
      tarkovPveProfileId: true,
      tarkovArenaProfileId: true
    }
  });

  return NextResponse.json({ ok: true, user });
}