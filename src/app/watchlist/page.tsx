import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { WatchlistTable } from "@/components/watchlist-table";
import { getGameModeFromCookies } from "@/lib/game-mode";
import {
  getItemsByIdsFromCache,
  getTrendMapForItems,
  triggerBackgroundRefresh
} from "@/lib/market-cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getItemsByIds } from "@/lib/tarkov";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const mode = getGameModeFromCookies();

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  const favoriteIds = favorites.map((favorite) => favorite.itemId);

  let items = await getItemsByIdsFromCache(favoriteIds, mode);
  if (favoriteIds.length && items.length !== favoriteIds.length) {
    items = await getItemsByIds(favoriteIds, mode);
    triggerBackgroundRefresh(mode);
  } else {
    triggerBackgroundRefresh(mode);
  }

  const trendByItem = await getTrendMapForItems(favoriteIds, mode);

  const rows = favorites
    .map((favorite) => {
      const item = items.find((entry) => entry.id === favorite.itemId);
      return item ? { item, itemId: favorite.itemId } : null;
    })
    .filter((row): row is { item: (typeof items)[number]; itemId: string } => Boolean(row));

  return (
    <Card>
      <CardTitle className="mb-4">Your Watchlist</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        SQLite-cached watchlist with background market refresh and 24h snapshot trend indicators.
      </p>
      {rows.length ? (
        <WatchlistTable rows={rows} trendByItem={trendByItem} />
      ) : (
        <div className="rounded-md border border-border bg-secondary/30 p-6 text-sm text-muted-foreground">
          No watched items yet. Add favorites from the dashboard.
        </div>
      )}
    </Card>
  );
}
