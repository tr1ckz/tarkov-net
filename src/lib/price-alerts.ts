export type PriceAlert = {
  itemId: string;
  itemName: string;
  itemSlug: string;
  targetPrice: number;
  createdAt: number;
};

const STORAGE_KEY = "tarkov-observer-price-alerts-v1";
export const PRICE_ALERT_EVENT = "tarkov:price-alerts-changed";

function hasWindow() {
  return typeof window !== "undefined";
}

export function readPriceAlerts() {
  if (!hasWindow()) {
    return [] as PriceAlert[];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [] as PriceAlert[];
    }

    const parsed = JSON.parse(raw) as PriceAlert[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            typeof entry?.itemId === "string" &&
            typeof entry?.itemName === "string" &&
            typeof entry?.itemSlug === "string" &&
            typeof entry?.targetPrice === "number"
        )
      : [];
  } catch {
    return [] as PriceAlert[];
  }
}

function writePriceAlerts(alerts: PriceAlert[]) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  window.dispatchEvent(new Event(PRICE_ALERT_EVENT));
}

export function getPriceAlert(itemId: string) {
  return readPriceAlerts().find((entry) => entry.itemId === itemId) ?? null;
}

export function upsertPriceAlert(alert: Omit<PriceAlert, "createdAt">) {
  const next = readPriceAlerts().filter((entry) => entry.itemId !== alert.itemId);
  next.unshift({ ...alert, createdAt: Date.now() });
  writePriceAlerts(next.slice(0, 100));
}

export function removePriceAlert(itemId: string) {
  writePriceAlerts(readPriceAlerts().filter((entry) => entry.itemId !== itemId));
}