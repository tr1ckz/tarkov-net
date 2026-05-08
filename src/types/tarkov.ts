export type GameMode = "regular" | "pve";

export interface HistoricalPricePoint {
  price: number | null;
  priceMin: number | null;
  offerCount: number | null;
  offerCountMin: number | null;
  timestamp: string | null;
}

export interface TraderPrice {
  price: number;
  priceRUB: number;
  currency: string;
  requirements?: {
    type: string;
    value?: number | null;
    stringValue?: string | null;
  }[];
  vendor: {
    name: string;
    normalizedName?: string;
  };
}

export interface AmmoProperties {
  caliber?: string | null;
  damage?: number | null;
  penetrationPower?: number | null;
  fragmentationChance?: number | null;
  recoilModifier?: number | null;
  accuracyModifier?: number | null;
  initialSpeed?: number | null;
}

export interface MarketItem {
  id: string;
  name: string;
  shortName: string;
  normalizedName: string;
  iconLink: string | null;
  avg24hPrice: number | null;
  lastLowPrice: number | null;
  basePrice: number | null;
  lastSeenPrice?: number | null;
  lastSeenAt?: string | null;
  previousSeenPrice?: number | null;
  previousSeenAt?: string | null;
  sellFor: TraderPrice[];
}

export interface ItemDetail extends MarketItem {
  buyFor: TraderPrice[];
  historicalPrices: HistoricalPricePoint[];
  bartersFor: {
    trader: { name: string };
    level: number;
    requiredItems: {
      count: number;
      item: {
        id: string;
        name: string;
        avg24hPrice: number | null;
        lastLowPrice: number | null;
      };
    }[];
  }[];
  craftsFor: {
    station: { name: string };
    duration: number;
    requiredItems: {
      count: number;
      item: {
        id: string;
        name: string;
        avg24hPrice: number | null;
        lastLowPrice: number | null;
      };
    }[];
  }[];
}

export interface AmmoItem extends MarketItem {
  buyFor: TraderPrice[];
  properties: AmmoProperties | null;
}
