import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/favorite-button";
import { PriceAlertControl } from "@/components/price-alert-control";
import { PriceHistoryPanel } from "@/components/price-history-panel";
import { RecentlyViewedTracker } from "@/components/recently-viewed-tracker";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { getGameModeFromCookies } from "@/lib/game-mode";
import { getCachedItemMarketMeta } from "@/lib/market-cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getBestTraderBuyback, getFleaPrice, getItemById } from "@/lib/tarkov";
import { formatDateTime, formatRelativeTime, fullPrice } from "@/lib/utils";

type PageProps = {
  params: {
    slug: string;
  };
};

function craftOrBarterCost(
  requiredItems: {
    count: number;
    item: { avg24hPrice: number | null; lastLowPrice: number | null };
  }[]
) {
  return requiredItems.reduce((sum, entry) => {
    const unitPrice = entry.item.lastLowPrice ?? entry.item.avg24hPrice ?? 0;
    return sum + unitPrice * entry.count;
  }, 0);
}

export default async function ItemDetailPage({ params }: PageProps) {
  const mode = getGameModeFromCookies();
  const item = await getItemById(params.slug, mode);

  if (!item) {
    notFound();
  }

  const session = await getSession();
  const favorite =
    session?.user?.id &&
    (await prisma.favorite.findUnique({
      where: {
        userId_itemId: {
          userId: session.user.id,
          itemId: item.id
        }
      }
    }));

  const fleaPrice = getFleaPrice(item);
  const bestBuyback = getBestTraderBuyback(item);
  const computedSpread = bestBuyback ? fleaPrice - bestBuyback.priceRUB : null;
  const spread = computedSpread !== null && Number.isFinite(computedSpread) ? computedSpread : null;
  const cachedMeta = await getCachedItemMarketMeta(item.id, mode);

  return (
    <div className="space-y-4">
      <RecentlyViewedTracker
        itemId={item.id}
        itemName={item.name}
        shortName={item.shortName}
        itemSlug={item.normalizedName}
        lastPrice={fleaPrice}
      />

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={`/api/item-icon/${item.id}`}
              alt={item.name}
              className="h-12 w-12 rounded-md border border-border bg-secondary/30 object-cover"
              loading="lazy"
            />
            <div>
              <CardTitle>{item.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{item.shortName}</p>
            </div>
          </div>
          {session?.user?.id ? (
            <FavoriteButton
              itemId={item.id}
              itemSlug={item.normalizedName}
              itemName={item.name}
              isFavorited={Boolean(favorite)}
            />
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Flea</p>
            <p className="text-lg font-bold">{fullPrice(fleaPrice)} RUB</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Best Trader Buyback</p>
            <p className="text-lg font-bold">
              {bestBuyback ? `${fullPrice(bestBuyback.priceRUB)} RUB` : "-"}
            </p>
            {bestBuyback && <p className="text-xs text-muted-foreground">{bestBuyback.vendor.name}</p>}
          </div>
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Flea vs Trader Spread</p>
            <p
              className={`text-lg font-bold ${
                spread === null ? "text-muted-foreground" : spread > 0 ? "text-green-400" : spread < 0 ? "text-red-400" : "text-foreground"
              }`}
            >
              {spread !== null ? `${spread > 0 ? "+" : ""}${fullPrice(spread)} RUB` : "-"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Last Seen</p>
            <p className="text-xs text-muted-foreground">
              {cachedMeta?.lastSeenAt
                ? `${formatRelativeTime(cachedMeta.lastSeenAt)} · ${formatDateTime(cachedMeta.lastSeenAt)}`
                : "No cached observation yet"}
            </p>
            {cachedMeta?.previousSeenAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Previous observation: {formatDateTime(cachedMeta.previousSeenAt)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <PriceAlertControl
            itemId={item.id}
            itemName={item.name}
            itemSlug={item.normalizedName}
            currentPrice={fleaPrice}
          />
        </div>
      </Card>

      <PriceHistoryPanel points={item.historicalPrices ?? []} />

      <Card>
        <CardTitle className="mb-3">Craft Profitability</CardTitle>
        <div className="space-y-3">
          {item.craftsFor?.length ? (
            item.craftsFor.map((craft, index) => {
              const cost = craftOrBarterCost(craft.requiredItems ?? []);
              const profit = fleaPrice - cost;

              return (
                <div key={`${craft.station.name}-${index}`} className="rounded-md border border-border bg-secondary/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge>{craft.station.name}</Badge>
                    <span className="text-sm text-muted-foreground">{Math.ceil(craft.duration / 60)} min</span>
                  </div>
                  <p className="text-sm">Input Cost: {fullPrice(cost)} RUB</p>
                  <p className={`text-sm font-semibold ${profit > 0 ? "text-green-400" : "text-red-400"}`}>
                    Estimated Profit: {profit > 0 ? "+" : ""}
                    {fullPrice(profit)} RUB
                  </p>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No craft data available for this item.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Barter Profitability</CardTitle>
        <div className="space-y-3">
          {item.bartersFor?.length ? (
            item.bartersFor.map((barter, index) => {
              const cost = craftOrBarterCost(barter.requiredItems ?? []);
              const profit = fleaPrice - cost;

              return (
                <div key={`${barter.trader.name}-${index}`} className="rounded-md border border-border bg-secondary/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge>{barter.trader.name}</Badge>
                    <span className="text-sm text-muted-foreground">LL {barter.level}</span>
                  </div>
                  <p className="text-sm">Input Cost: {fullPrice(cost)} RUB</p>
                  <p className={`text-sm font-semibold ${profit > 0 ? "text-green-400" : "text-red-400"}`}>
                    Estimated Profit: {profit > 0 ? "+" : ""}
                    {fullPrice(profit)} RUB
                  </p>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No barter data available for this item.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Trader Sell Prices</CardTitle>
        <div className="space-y-2 text-sm">
          {item.sellFor?.length ? (
            item.sellFor.map((entry) => (
              <div key={`${entry.vendor.name}-${entry.priceRUB}`} className="flex justify-between rounded border border-border p-2">
                <span>{entry.vendor.name}</span>
                <span>{fullPrice(entry.priceRUB)} RUB</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No trader pricing found.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Trader Buy Prices</CardTitle>
        <div className="space-y-2 text-sm">
          {item.buyFor?.length ? (
            item.buyFor.map((entry) => (
              <div key={`${entry.vendor.name}-${entry.priceRUB}`} className="flex justify-between rounded border border-border p-2">
                <div>
                  <span>{entry.vendor.name}</span>
                  {entry.requirements?.length ? (
                    <div className="text-xs text-muted-foreground">
                      {entry.requirements
                        .map((requirement) => requirement.stringValue ?? requirement.value ?? requirement.type)
                        .join(" · ")}
                    </div>
                  ) : null}
                </div>
                <span>{fullPrice(entry.priceRUB)} RUB</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No trader purchase pricing found.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
