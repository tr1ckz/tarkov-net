"use client";

import { useEffect } from "react";
import { trackRecentlyViewed } from "@/lib/recently-viewed";

type Props = {
  itemId: string;
  itemName: string;
  shortName: string;
  itemSlug: string;
  lastPrice: number;
};

export function RecentlyViewedTracker({ itemId, itemName, shortName, itemSlug, lastPrice }: Props) {
  useEffect(() => {
    trackRecentlyViewed({ itemId, itemName, shortName, itemSlug, lastPrice });
  }, [itemId, itemName, shortName, itemSlug, lastPrice]);

  return null;
}