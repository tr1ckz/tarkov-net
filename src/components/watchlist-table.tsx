import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { CsvExportButton } from "@/components/csv-export-button";
import { FavoriteButton } from "@/components/favorite-button";
import { PriceAlertBadge } from "@/components/price-alert-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelativeTime, fullPrice } from "@/lib/utils";
import { getBestTraderBuyback, getFleaPrice, trendDirection } from "@/lib/tarkov";
import { MarketItem } from "@/types/tarkov";

type WatchlistRow = {
  item: MarketItem;
  itemId: string;
};

type Props = {
  rows: WatchlistRow[];
  trendByItem?: Map<string, { direction: "up" | "down" | "flat"; percentChange: number }>;
};

export function WatchlistTable({ rows, trendByItem }: Props) {
  const exportRows = rows.map(({ item }) => {
    const buyback = getBestTraderBuyback(item);
    const fleaPrice = getFleaPrice(item);
    const snapshotTrend = trendByItem?.get(item.id);

    return {
      item: item.name,
      shortName: item.shortName,
      fleaPrice,
      bestTrader: buyback?.vendor.name ?? "",
      bestTraderPrice: buyback?.priceRUB ?? "",
      trend: snapshotTrend ? snapshotTrend.percentChange.toFixed(1) : trendDirection(item),
      lastSeenAt: item.lastSeenAt ?? ""
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CsvExportButton filename="tarkov-watchlist.csv" rows={exportRows} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Flea Price</TableHead>
              <TableHead>Best Buyback</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>24h Trend</TableHead>
              <TableHead className="text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, itemId }) => {
              const buyback = getBestTraderBuyback(item);
              const fallbackTrend = trendDirection(item);
              const snapshotTrend = trendByItem?.get(item.id);
              const trend = snapshotTrend?.direction ?? fallbackTrend;
              const trendText = snapshotTrend
                ? `${trend} (${snapshotTrend.percentChange >= 0 ? "+" : ""}${snapshotTrend.percentChange.toFixed(1)}%)`
                : trend;
              const fleaPrice = getFleaPrice(item);

              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={`/api/item-icon/${item.id}`}
                        alt={item.name}
                        className="h-7 w-7 rounded border border-border bg-secondary/30 object-cover"
                        loading="lazy"
                      />
                      <div>
                        <Link href={`/tarkov/item/${item.id}`} className="font-semibold hover:underline">
                          {item.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{item.shortName}</span>
                          <PriceAlertBadge itemId={item.id} currentPrice={fleaPrice} />
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{fullPrice(fleaPrice)} RUB</TableCell>
                  <TableCell>{buyback ? `${fullPrice(buyback.priceRUB)} RUB (${buyback.vendor.name})` : "-"}</TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {item.lastSeenAt ? `${formatRelativeTime(item.lastSeenAt)} · ${formatDateTime(item.lastSeenAt)}` : "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1 text-xs uppercase tracking-wide">
                      {trend === "up" && <ArrowUp className="h-3.5 w-3.5 text-green-400" />}
                      {trend === "down" && <ArrowDown className="h-3.5 w-3.5 text-red-400" />}
                      {trend === "flat" && <ArrowRight className="h-3.5 w-3.5 text-yellow-400" />}
                      {trendText}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <FavoriteButton
                      itemId={itemId}
                      itemSlug={item.normalizedName}
                      itemName={item.name}
                      isFavorited
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

