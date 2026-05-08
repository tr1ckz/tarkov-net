import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await request.json().catch(() => ({} as { note?: string }));
  const note = (body?.note || "").toString().slice(0, 200);

  const run = await prisma.pubgLinkRunLog.create({
    data: {
      source: "admin_probe",
      status: "ok",
      clipsReturned: 0,
      metadataJson: JSON.stringify({
        note,
        triggeredBy: session?.user?.id ?? null,
        triggeredAt: new Date().toISOString()
      })
    },
    select: {
      id: true,
      source: true,
      status: true,
      createdAt: true
    }
  });

  return NextResponse.json({ ok: true, run }, { status: 201 });
}
