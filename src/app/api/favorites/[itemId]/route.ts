import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteContext = {
  params: {
    itemId: string;
  };
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.favorite.deleteMany({
    where: {
      userId: session.user.id,
      itemId: context.params.itemId
    }
  });

  return NextResponse.json({ ok: true });
}
