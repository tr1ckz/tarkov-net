export type RecentlyViewedItem = {
  itemId: string;
  itemName: string;
  shortName: string;
  itemSlug: string;
  lastPrice: number;
  viewedAt: number;
};

const STORAGE_KEY = "tarkov-observer-recently-viewed-v1";
export const RECENTLY_VIEWED_EVENT = "tarkov:recently-viewed-changed";

function hasWindow() {
  return typeof window !== "undefined";
}

export function readRecentlyViewed() {
  if (!hasWindow()) {
    return [] as RecentlyViewedItem[];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [] as RecentlyViewedItem[];
    }

    const parsed = JSON.parse(raw) as RecentlyViewedItem[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            typeof entry?.itemId === "string" &&
            typeof entry?.itemName === "string" &&
            typeof entry?.itemSlug === "string" &&
            typeof entry?.shortName === "string" &&
            typeof entry?.lastPrice === "number"
        )
      : [];
  } catch {
    return [] as RecentlyViewedItem[];
  }
}

export function trackRecentlyViewed(entry: Omit<RecentlyViewedItem, "viewedAt">) {
  if (!hasWindow()) {
    return;
  }

  const next = readRecentlyViewed().filter((item) => item.itemId !== entry.itemId);
  next.unshift({ ...entry, viewedAt: Date.now() });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 8)));
  window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
}