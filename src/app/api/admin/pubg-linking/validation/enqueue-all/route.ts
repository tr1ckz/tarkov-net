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

export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;
  const adminEmail = (session?.user as { email?: string } | undefined)?.email ?? null;

  const links = await prisma.pubgStreamerIdentityLink.findMany({
    select: { id: true },
  });

  let queued = 0;
  let reset = 0;

  for (const link of links) {
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
    newlyQueued: queued,
    reQueued: reset,
    totalQueuedNow: queued + reset,
  });
}
