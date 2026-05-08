import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { CsvExportButton } from "@/components/csv-export-button";
import { DashboardSearch } from "@/components/dashboard-search";
import { FavoriteButton } from "@/components/favorite-button";
import { PriceAlertBadge } from "@/components/price-alert-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compactPrice, formatDateTime, formatRelativeTime, fullPrice } from "@/lib/utils";
import { getBestTraderBuyback, getFleaPrice, trendDirection } from "@/lib/tarkov";
import { GameMode, MarketItem } from "@/types/tarkov";

type TrendSnapshot = {
  direction: "up" | "down" | "flat";
  percentChange: number;
};

type Props = {
  items: MarketItem[];
  favoriteIds: Set<string>;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  query: string;
  pageSize: number;
  mode: GameMode;
  basePath: string;
  trendByItem?: Map<string, TrendSnapshot>;
};

function TrendSparkline({ item }: { item: MarketItem }) {
  const values = [item.previousSeenPrice, item.avg24hPrice, item.lastSeenPrice]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length < 2) {
    return <span className="text-[10px] uppercase tracking-wide text-[#6d6658]">No spark</span>;
  }

  const width = 72;
  const height = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = values[values.length - 1] > values[0] ? "#5e6a4b" : values[values.length - 1] < values[0] ? "#a32a2a" : "#9a8b4f";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-[72px] shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="square" />
    </svg>
  );
}

function buildPageHref(basePath: string, page: number, query: string) {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set("page", String(page));
  }
  if (query) {
    params.set("q", query);
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

export function DashboardTable({ items, favoriteIds, currentPage, totalPages, totalItems, query, pageSize, mode, basePath, trendByItem }: Props) {
  const start = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalItems);
  const exportRows = items.map((item) => {
    const bestBuyback = getBestTraderBuyback(item);
    const fleaPrice = getFleaPrice(item);
    const spread = bestBuyback ? fleaPrice - bestBuyback.priceRUB : null;
    const snapshotTrend = trendByItem?.get(item.id);

    return {
      item: item.name,
      shortName: item.shortName,
      fleaPrice,
      bestTrader: bestBuyback?.vendor.name ?? "",
      bestTraderPrice: bestBuyback?.priceRUB ?? "",
      spread: spread ?? "",
      trend: snapshotTrend ? snapshotTrend.percentChange.toFixed(1) : "",
      lastSeenAt: item.lastSeenAt ?? ""
    };
  });
  const pageTerms = Array.from(
    new Set(
      items
        .flatMap((item) => [item.name, item.shortName, item.normalizedName])
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <DashboardSearch initialQuery={query} pageTerms={pageTerms} mode={mode} />
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <div className="text-sm text-muted-foreground">
            {totalItems ? `Showing ${start}-${end} of ${totalItems}` : "No items found"}
          </div>
          <CsvExportButton filename="tarkov-dashboard.csv" rows={exportRows} />
        </div>
      </div>

      <div className="overflow-x-auto border border-[#2d2d2d]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#111] hover:bg-[#111]">
              <TableHead>Item</TableHead>
              <TableHead>Flea</TableHead>
              <TableHead>Best Trader</TableHead>
              <TableHead>Spread</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>24h Trend</TableHead>
              <TableHead>Move</TableHead>
              <TableHead className="text-right">Watchlist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const bestBuyback = getBestTraderBuyback(item);
              const fleaPrice = getFleaPrice(item);
              const fallbackTrend = trendDirection(item);
              const snapshotTrend = trendByItem?.get(item.id);
              const trend = snapshotTrend?.direction ?? fallbackTrend;
              const spread = bestBuyback ? fleaPrice - bestBuyback.priceRUB : null;

              return (
                <TableRow key={item.id} className={index % 2 === 1 ? "bg-[#151515]" : "bg-[#1a1a1a]"}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={`/api/item-icon/${item.id}`}
                        alt={item.name}
                        className="h-7 w-7 border border-[#2d2d2d] bg-[#111] object-cover"
                        loading="lazy"
                      />
                      <div>
                        <Link href={`/tarkov/item/${item.id}`} className="font-semibold text-[#e2d2af] hover:underline">
                          {item.name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#9a9080]">
                          <span>{item.shortName}</span>
                          <PriceAlertBadge itemId={item.id} currentPrice={fleaPrice} />
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-[#c8bda0]">{fullPrice(fleaPrice)} RUB</TableCell>
                  <TableCell className="text-[#c8bda0]">
                    {bestBuyback ? `${compactPrice(bestBuyback.priceRUB)} RUB (${bestBuyback.vendor.name})` : "-"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        spread === null
                          ? "text-[#6d6658]"
                          : spread > 0
                            ? "text-[#5e6a4b]"
                            : spread < 0
                              ? "text-[#a32a2a]"
                              : "text-[#9a8b4f]"
                      }
                    >
                      {spread === null ? "-" : `${spread > 0 ? "+" : ""}${compactPrice(spread)} RUB`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-[#9a9080]">
                      {item.lastSeenAt ? `${formatRelativeTime(item.lastSeenAt)} · ${formatDateTime(item.lastSeenAt)}` : "Live fetch"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1 text-xs uppercase tracking-wide">
                      {trend === "up" && <ArrowUp className="h-3.5 w-3.5 text-[#5e6a4b]" />}
                      {trend === "down" && <ArrowDown className="h-3.5 w-3.5 text-[#a32a2a]" />}
                      {trend === "flat" && <ArrowRight className="h-3.5 w-3.5 text-[#9a8b4f]" />}
                      {snapshotTrend
                        ? `${trend} (${snapshotTrend.percentChange >= 0 ? "+" : ""}${snapshotTrend.percentChange.toFixed(1)}%)`
                        : trend}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TrendSparkline item={item} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FavoriteButton
                      itemId={item.id}
                      itemSlug={item.normalizedName}
                      itemName={item.name}
                      isFavorited={favoriteIds.has(item.id)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[#9a9080]">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildPageHref(basePath, Math.max(1, currentPage - 1), query)}
              className={`inline-flex items-center justify-center border px-3 py-2 text-sm font-semibold uppercase tracking-wider ${
                currentPage === 1 ? "pointer-events-none border-[#2d2d2d] text-[#555] opacity-50" : "border-[#2d2d2d] text-[#c8bda0] hover:bg-[#5e6a4b] hover:border-[#5e6a4b] hover:text-[#e2d2af]"
              }`}
            >
              Prev
            </Link>
            {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
              const windowStart = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              const pageNumber = windowStart + index;
              if (pageNumber > totalPages) {
                return null;
              }

              return (
                <Link
                  key={pageNumber}
                  href={buildPageHref(basePath, pageNumber, query)}
                  className={`inline-flex min-w-10 items-center justify-center border px-3 py-2 text-sm font-semibold uppercase tracking-wider ${
                    pageNumber === currentPage
                      ? "border-[#e2d2af] bg-[#e2d2af] text-[#0e0e0e]"
                      : "border-[#2d2d2d] text-[#c8bda0] hover:bg-[#5e6a4b] hover:border-[#5e6a4b] hover:text-[#e2d2af]"
                  }`}
                >
                  {pageNumber}
                </Link>
              );
            })}
            <Link
              href={buildPageHref(basePath, Math.min(totalPages, currentPage + 1), query)}
              className={`inline-flex items-center justify-center border px-3 py-2 text-sm font-semibold uppercase tracking-wider ${
                currentPage === totalPages
                  ? "pointer-events-none border-[#2d2d2d] text-[#555] opacity-50"
                  : "border-[#2d2d2d] text-[#c8bda0] hover:bg-[#5e6a4b] hover:border-[#5e6a4b] hover:text-[#e2d2af]"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

