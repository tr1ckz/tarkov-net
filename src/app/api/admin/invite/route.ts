import { getServerSession, Session } from "next-auth";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Session | null) {
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// GET /api/admin/invite — list all invite codes
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      usedBy: { select: { id: true, displayName: true, email: true } }
    }
  });

  return NextResponse.json(codes);
}

// POST /api/admin/invite — create a new invite code
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;

  const code = await prisma.inviteCode.create({
    data: {
      code: randomBytes(9).toString("base64url"),
      createdById: session!.user.id,
      expiresAt
    }
  });

  return NextResponse.json(code, { status: 201 });
}

// PATCH /api/admin/invite — revoke or restore an invite code
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body?.id || typeof body.isRevoked !== "boolean") {
    return NextResponse.json({ error: "Missing id or isRevoked" }, { status: 400 });
  }

  const updated = await prisma.inviteCode.update({
    where: { id: body.id },
    data: { isRevoked: body.isRevoked }
  });

  return NextResponse.json(updated);
}
