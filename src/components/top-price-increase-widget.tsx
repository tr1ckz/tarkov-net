import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { getTopPriceIncreases } from "@/lib/market-cache";
import { formatRelativeTime, fullPrice } from "@/lib/utils";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

export async function TopPriceIncreaseWidget({ mode }: Props) {
  const movers = await getTopPriceIncreases(mode, { limit: 6, minAvgPrice: 10_000 });

  return (
    <Card className="h-fit">
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle>Highest Price Increase</CardTitle>
        <Badge>24h vs flea</Badge>
      </div>

      {movers.length ? (
        <div className="space-y-2">
          {movers.map((item, index) => (
            <div key={item.itemId} className="border border-[#2d2d2d] bg-[#111] p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-[0.08em] text-[#9a9080]">#{index + 1}</span>
                <span className="text-xs font-semibold text-[#e2d2af]">+{item.percentChange.toFixed(1)}%</span>
              </div>

              <Link href={`/tarkov/item/${item.itemId}`} className="block text-sm font-semibold text-[#e2d2af] hover:underline">
                {item.name}
              </Link>

              <div className="mt-1 text-xs text-[#9a9080]">{item.shortName}</div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="uppercase text-[#7f7768]">Flea</div>
                  <div className="text-[#c8bda0]">{fullPrice(item.fleaPrice)} RUB</div>
                </div>
                <div>
                  <div className="uppercase text-[#7f7768]">24h Avg</div>
                  <div className="text-[#c8bda0]">{fullPrice(item.avg24hPrice)} RUB</div>
                </div>
              </div>

              <div className="mt-2 text-xs text-[#5e6a4b]">+{fullPrice(item.delta)} RUB</div>
            </div>
          ))}

          <div className="text-xs text-[#7f7768]">
            Last refresh: {formatRelativeTime(movers[0]?.fetchedAt ?? null)}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#9a9080]">Not enough cached data yet to compute movers.</p>
      )}
    </Card>
  );
}

