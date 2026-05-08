import { DashboardTable } from "@/components/dashboard-table";
import { RecentlyViewedItems } from "@/components/recently-viewed-items";
import { Card, CardTitle } from "@/components/ui/card";
import { getGameModeFromCookies } from "@/lib/game-mode";
import {
  getDashboardItemsFromCache,
  getDashboardItemsFromLive,
  getTrendMapForItems,
  primeMarketCacheFromItems,
  triggerBackgroundRefresh
} from "@/lib/market-cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type DashboardPageProps = {
  searchParams?: {
    page?: string;
    q?: string;
  };
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();
  const mode = getGameModeFromCookies();
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const query = searchParams?.q?.trim() ?? "";

  let dashboard = await getDashboardItemsFromCache(mode, {
    page,
    pageSize: PAGE_SIZE,
    query
  });

  if (!dashboard.totalCached) {
    const liveDashboard = await getDashboardItemsFromLive(mode, {
      page,
      pageSize: PAGE_SIZE,
      query
    });
    dashboard = {
      items: liveDashboard.items,
      total: liveDashboard.total,
      totalCached: liveDashboard.totalCached,
      page: liveDashboard.page,
      pageSize: liveDashboard.pageSize,
      totalPages: liveDashboard.totalPages
    };
    primeMarketCacheFromItems(mode, liveDashboard.allItems);
  } else {
    triggerBackgroundRefresh(mode);
  }

  const favorites =
    session?.user?.id
      ? await prisma.favorite.findMany({
          where: { userId: session.user.id },
          select: { itemId: true }
        })
      : [];

  const favoriteIds = new Set(favorites.map((favorite) => favorite.itemId));
  const trendByItem = await getTrendMapForItems(
    dashboard.items.map((item) => item.id),
    mode
  );

  return (
    <Card>
      <CardTitle className="mb-4">Market Dashboard</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Search all items and compare flea values against top trader buyback opportunities.
      </p>
      <div className="mb-4">
        <RecentlyViewedItems />
      </div>
      <DashboardTable
        items={dashboard.items}
        favoriteIds={favoriteIds}
        currentPage={dashboard.page}
        totalPages={dashboard.totalPages}
        totalItems={dashboard.total}
        query={query}
        pageSize={dashboard.pageSize}
        trendByItem={trendByItem}
      />
    </Card>
  );
}
