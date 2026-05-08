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

// GET /api/admin/users — list all users
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      gameName: true,
      role: true,
      isSuspended: true,
      createdAt: true
    }
  });

  return NextResponse.json(users);
}

// PATCH /api/admin/users — suspend/unsuspend or change role
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  // Prevent admin from suspending themselves
  if (body.id === session!.user.id && body.isSuspended === true) {
    return NextResponse.json({ error: "Cannot suspend your own account" }, { status: 400 });
  }

  const updateData: { isSuspended?: boolean; role?: string } = {};
  if (typeof body.isSuspended === "boolean") updateData.isSuspended = body.isSuspended;
  if (body.role === "ADMIN" || body.role === "USER") updateData.role = body.role;

  const updated = await prisma.user.update({
    where: { id: body.id },
    data: updateData,
    select: { id: true, email: true, displayName: true, role: true, isSuspended: true }
  });

  return NextResponse.json(updated);
}
