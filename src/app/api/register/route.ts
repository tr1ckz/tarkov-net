import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  displayName: z.string().min(2).max(40),
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().optional()
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid registration payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  // Count existing users — first user becomes admin, no invite needed
  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;

  let inviteRecord = null;

  if (!isFirstUser) {
    const code = parsed.data.inviteCode?.trim();
    if (!code) {
      return NextResponse.json({ error: "An invite code is required to register" }, { status: 403 });
    }

    inviteRecord = await prisma.inviteCode.findUnique({
      where: { code },
      include: { usedBy: { select: { id: true } } }
    });

    if (!inviteRecord || inviteRecord.isRevoked) {
      return NextResponse.json({ error: "Invalid or revoked invite code" }, { status: 403 });
    }

    if (inviteRecord.usedBy !== null) {
      return NextResponse.json({ error: "Invite code has already been used" }, { status: 403 });
    }

    if (inviteRecord.expiresAt && inviteRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invite code has expired" }, { status: 403 });
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      displayName: parsed.data.displayName,
      email,
      passwordHash,
      role: isFirstUser ? "ADMIN" : "USER",
      ...(inviteRecord ? { usedInviteId: inviteRecord.id } : {})
    }
  });

  return NextResponse.json({ ok: true, role: user.role }, { status: 201 });
}
