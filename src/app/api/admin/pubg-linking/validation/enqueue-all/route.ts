import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function isWeakValidationTarget(link: { source: string; pubgPlayerId: string }) {
  return (
    link.pubgPlayerId.startsWith("unverified:") ||
    link.pubgPlayerId.startsWith("login-heuristic:") ||
    link.pubgPlayerId.startsWith("profile-claim:") ||
    link.source === "eventsub_login_heuristic" ||
    link.source === "eventsub_profile_claim" ||
    link.source === "eventsub_known_player_unverified" ||
    link.source === "eventsub_login_heuristic_unverified"
  );
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;
  const adminEmail = (session?.user as { email?: string } | undefined)?.email ?? null;

  const links = await prisma.pubgStreamerIdentityLink.findMany({
    select: { id: true, source: true, pubgPlayerId: true },
  });

  const targetLinks = links.filter(isWeakValidationTarget);

  let queued = 0;
  let reset = 0;

  for (const link of targetLinks) {
    const existing = await prisma.pubgIdentityValidationQueue.findUnique({
      where: { identityLinkId: link.id },
      select: { status: true }
    });

    if (!existing) {
      await prisma.pubgIdentityValidationQueue.create({
        data: {
          identityLinkId: link.id,
          status: "queued",
          queuedAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
          completedAt: null,
          startedAt: null,
        }
      });
      queued += 1;
      continue;
    }

    if (existing.status !== "queued" && existing.status !== "processing") {
      await prisma.pubgIdentityValidationQueue.update({
        where: { identityLinkId: link.id },
        data: {
          status: "queued",
          nextAttemptAt: null,
          lastError: null,
          completedAt: null,
          startedAt: null,
          queuedAt: new Date(),
        }
      });
      reset += 1;
    }
  }

  await prisma.pubgLinkRunLog.create({
    data: {
      source: "identity_validation_enqueue_all",
      status: "ok",
      linkEventsQueued: queued + reset,
      metadataJson: JSON.stringify({
        totalLinks: links.length,
        weakLinks: targetLinks.length,
        queued,
        reset,
        triggeredBy: adminEmail,
        triggeredAt: new Date().toISOString(),
      })
    }
  });

  return NextResponse.json({
    ok: true,
    totalLinks: links.length,
    weakLinks: targetLinks.length,
    newlyQueued: queued,
    reQueued: reset,
    totalQueuedNow: queued + reset,
  });
}
