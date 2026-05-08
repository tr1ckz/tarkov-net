"use client";

import { useEffect, useState } from "react";
import { getPriceAlert, PRICE_ALERT_EVENT } from "@/lib/price-alerts";

type Props = {
  itemId: string;
  currentPrice: number;
};

export function PriceAlertBadge({ itemId, currentPrice }: Props) {
  const [targetPrice, setTargetPrice] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setTargetPrice(getPriceAlert(itemId)?.targetPrice ?? null);
    sync();
    window.addEventListener(PRICE_ALERT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PRICE_ALERT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [itemId]);

  if (!targetPrice) {
    return null;
  }

  const isHit = currentPrice <= targetPrice;

  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        isHit
          ? "border-[#e2d2af] bg-[#e2d2af] text-[#0e0e0e]"
          : "border-[#49533a] bg-[#151a12] text-[#c8d1b2]"
      }`}
    >
      {isHit ? "Alert hit" : `Alert ${targetPrice.toLocaleString()}`}
    </span>
  );
}