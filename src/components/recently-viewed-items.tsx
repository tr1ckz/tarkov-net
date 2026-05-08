"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readRecentlyViewed, RECENTLY_VIEWED_EVENT, type RecentlyViewedItem } from "@/lib/recently-viewed";
import { formatRelativeTime, fullPrice } from "@/lib/utils";

export function RecentlyViewedItems() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readRecentlyViewed());
    sync();
    window.addEventListener(RECENTLY_VIEWED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!items.length) {
    return null;
  }

  return (
    <div className="border border-[#2d2d2d] bg-[#1a1a1a] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl uppercase tracking-[0.1em] text-[#e2d2af]">Recently Viewed</h2>
        <span className="text-xs uppercase tracking-[0.1em] text-[#9a9080]">Local history</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.itemId}
            href={`/item/${item.itemId}`}
            className="border border-[#2d2d2d] bg-[#111] p-3 transition-colors hover:border-[#49533a]"
          >
            <div className="mb-1 text-sm font-semibold text-[#e2d2af]">{item.itemName}</div>
            <div className="text-xs uppercase tracking-[0.08em] text-[#9a9080]">{item.shortName}</div>
            <div className="mt-2 text-sm text-[#c8bda0]">{fullPrice(item.lastPrice)} RUB</div>
            <div className="mt-1 text-xs text-[#7f7768]">{formatRelativeTime(new Date(item.viewedAt))}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}