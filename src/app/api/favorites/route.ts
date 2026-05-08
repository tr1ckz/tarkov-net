import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const favoriteSchema = z.object({
  itemId: z.string().min(2),
  itemSlug: z.string().min(2),
  itemName: z.string().min(1)
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ favorites });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = favoriteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const favorite = await prisma.favorite.upsert({
    where: {
      userId_itemId: {
        userId: session.user.id,
        itemId: parsed.data.itemId
      }
    },
    update: {
      itemSlug: parsed.data.itemSlug,
      itemName: parsed.data.itemName
    },
    create: {
      userId: session.user.id,
      itemId: parsed.data.itemId,
      itemSlug: parsed.data.itemSlug,
      itemName: parsed.data.itemName
    }
  });

  return NextResponse.json({ favorite });
}
