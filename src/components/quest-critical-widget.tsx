import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getQuestCriticalMarketList } from "@/lib/market-cache";
import { fullPrice } from "@/lib/utils";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
};

export async function QuestCriticalWidget({ mode }: Props) {
  const rows = await getQuestCriticalMarketList(mode, { limit: 6 });

  return (
    <Card className="h-fit">
      <CardTitle className="mb-3">Quest-Critical Market</CardTitle>
      {rows.length ? (
        <div className="space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.itemId} className="border border-[#2d2d2d] bg-[#111] p-2.5">
              <Link href={`/tarkov/item/${row.itemId}`} className="font-semibold text-[#e2d2af] hover:underline">
                {row.name}
              </Link>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-[#9a9080]">{fullPrice(row.currentPrice)} RUB</span>
                <span className={row.percentChange >= 0 ? "text-[#5e6a4b]" : "text-[#a32a2a]"}>
                  {row.percentChange >= 0 ? "+" : ""}
                  {row.percentChange.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#9a9080]">No quest-critical movers found in cache.</p>
      )}
    </Card>
  );
}

