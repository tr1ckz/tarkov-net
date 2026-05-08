import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDashboardItemsFromLive } from "@/lib/market-cache";
import { GameMode } from "@/types/tarkov";

function parseMode(value: string | null): GameMode {
  return value === "pve" ? "pve" : "regular";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const normalizedQuery = query.toLowerCase();
  const mode = parseMode(searchParams.get("mode"));

  if (query.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const cached = await prisma.cachedItemPrice.findMany({
    where: {
      gameMode: mode,
      item: {
        OR: [
          { name: { contains: query } },
          { shortName: { contains: query } },
          { normalizedName: { contains: normalizedQuery } }
        ]
      }
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          shortName: true,
          normalizedName: true
        }
      }
    },
    orderBy: [{ lastLowPrice: "desc" }, { avg24hPrice: "desc" }],
    take: 20
  });

  if (cached.length) {
    return NextResponse.json({
      items: cached.map((entry) => ({
        id: entry.item.id,
        name: entry.item.name,
        shortName: entry.item.shortName,
        normalizedName: entry.item.normalizedName,
        price: entry.lastLowPrice ?? entry.avg24hPrice ?? entry.basePrice ?? 0
      }))
    });
  }

  const live = await getDashboardItemsFromLive(mode, {
    page: 1,
    pageSize: 20,
    query
  });

  return NextResponse.json({
    items: live.items.map((item) => ({
      id: item.id,
      name: item.name,
      shortName: item.shortName,
      normalizedName: item.normalizedName,
      price: item.lastLowPrice ?? item.avg24hPrice ?? item.basePrice ?? 0
    }))
  });
}