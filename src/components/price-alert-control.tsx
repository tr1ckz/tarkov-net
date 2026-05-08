"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPriceAlert, removePriceAlert, upsertPriceAlert } from "@/lib/price-alerts";
import { fullPrice } from "@/lib/utils";

type Props = {
  itemId: string;
  itemName: string;
  itemSlug: string;
  currentPrice: number;
};

export function PriceAlertControl({ itemId, itemName, itemSlug, currentPrice }: Props) {
  const [value, setValue] = useState(String(currentPrice || ""));
  const [savedTarget, setSavedTarget] = useState<number | null>(null);

  useEffect(() => {
    const existing = getPriceAlert(itemId)?.targetPrice ?? null;
    setSavedTarget(existing);
    if (existing) {
      setValue(String(existing));
    }
  }, [itemId]);

  const saveAlert = () => {
    const targetPrice = Number(value);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return;
    }

    upsertPriceAlert({
      itemId,
      itemName,
      itemSlug,
      targetPrice
    });
    setSavedTarget(targetPrice);
  };

  const clearAlert = () => {
    removePriceAlert(itemId);
    setSavedTarget(null);
  };

  return (
    <div className="border border-[#2d2d2d] bg-[#111] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs uppercase text-[#9a9080]">Price Alert</p>
        {savedTarget ? (
          <span className={`text-xs font-semibold ${currentPrice <= savedTarget ? "text-[#e2d2af]" : "text-[#c8bda0]"}`}>
            {currentPrice <= savedTarget ? "Below target" : `Waiting for ${fullPrice(savedTarget)} RUB`}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="number"
          min="1"
          step="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Target flea price"
        />
        <div className="flex gap-2">
          <Button type="button" onClick={saveAlert} className="px-3">
            <Bell className="mr-2 h-4 w-4" />
            Save Alert
          </Button>
          {savedTarget ? (
            <Button type="button" variant="outline" onClick={clearAlert} className="px-3">
              <BellOff className="mr-2 h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}