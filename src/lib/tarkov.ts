import { GraphQLClient, gql } from "graphql-request";
import { AmmoItem, GameMode, ItemDetail, MarketItem } from "@/types/tarkov";

const ENDPOINT = "https://api.tarkov.dev/graphql";

const client = new GraphQLClient(ENDPOINT, {
  cache: "no-store",
  headers: {
    "Content-Type": "application/json"
  }
});

type ItemsResponse = {
  items: MarketItem[];
};

type ItemResponse = {
  item: ItemDetail | null;
};

type AmmoResponse = {
  items: AmmoItem[];
};

function isTraderVendorName(name: string) {
  return !name.toLowerCase().includes("flea");
}

const ITEM_FRAGMENT = gql`
  fragment MarketFields on Item {
    id
    name
    shortName
    normalizedName
    iconLink
    avg24hPrice
    lastLowPrice
    basePrice
    sellFor {
      price
      priceRUB
      currency
      vendor {
        name
      }
    }
  }
`;

export async function getAllItems(gameMode: GameMode) {
  const query = gql`
    ${ITEM_FRAGMENT}
    query AllItems($gameMode: GameMode) {
      items(gameMode: $gameMode) {
        ...MarketFields
      }
    }
  `;

  const data = await client.request<ItemsResponse>(query, { gameMode });
  return data.items;
}

export async function getItemsByIds(itemIds: string[], gameMode: GameMode) {
  if (!itemIds.length) {
    return [];
  }

  const query = gql`
    ${ITEM_FRAGMENT}
    query ItemsByIds($ids: [ID!], $gameMode: GameMode) {
      items(ids: $ids, gameMode: $gameMode) {
        ...MarketFields
      }
    }
  `;

  const data = await client.request<ItemsResponse>(query, {
    ids: itemIds,
    gameMode
  });

  return data.items;
}

export async function getItemById(id: string, gameMode: GameMode) {
  const query = gql`
    ${ITEM_FRAGMENT}
    query ItemById($id: ID, $gameMode: GameMode) {
      item(id: $id, gameMode: $gameMode) {
        ...MarketFields
        buyFor {
          price
          priceRUB
          currency
          vendor {
            name
          }
        }
        historicalPrices {
          price
          priceMin
          offerCount
          offerCountMin
          timestamp
        }
        bartersFor {
          trader {
            name
          }
          level
          requiredItems {
            count
            item {
              id
              name
              avg24hPrice
              lastLowPrice
            }
          }
        }
        craftsFor {
          station {
            name
          }
          duration
          requiredItems {
            count
            item {
              id
              name
              avg24hPrice
              lastLowPrice
            }
          }
        }
      }
    }
  `;

  const data = await client.request<ItemResponse>(query, {
    id,
    gameMode
  });

  return data.item;
}

export async function getAmmoItems(gameMode: GameMode) {
  const query = gql`
    query AmmoItems($gameMode: GameMode) {
      items(types: [ammo], gameMode: $gameMode) {
        id
        name
        shortName
        normalizedName
        iconLink
        avg24hPrice
        lastLowPrice
        basePrice
        buyFor {
          price
          priceRUB
          currency
          requirements {
            type
            value
            stringValue
          }
          vendor {
            name
            normalizedName
          }
        }
        sellFor {
          price
          priceRUB
          currency
          vendor {
            name
            normalizedName
          }
        }
        properties {
          ... on ItemPropertiesAmmo {
            caliber
            damage
            penetrationPower
            fragmentationChance
            recoilModifier
            accuracyModifier
            initialSpeed
          }
        }
      }
    }
  `;

  const data = await client.request<AmmoResponse>(query, { gameMode });
  return data.items;
}

export function getBestTraderBuyback(item: MarketItem | ItemDetail) {
  const traderBuybacks = item.sellFor.filter((entry) => isTraderVendorName(entry.vendor.name));

  if (!traderBuybacks.length) {
    return null;
  }

  return traderBuybacks.reduce((best, current) => {
    if (!best) {
      return current;
    }
    return current.priceRUB > best.priceRUB ? current : best;
  }, traderBuybacks[0]);
}

export function getFleaPrice(item: MarketItem | ItemDetail) {
  return item.lastLowPrice ?? item.avg24hPrice ?? item.basePrice ?? 0;
}

export function trendDirection(item: MarketItem) {
  if (!item.lastLowPrice || !item.avg24hPrice) {
    return "flat";
  }

  if (item.lastLowPrice > item.avg24hPrice) {
    return "up";
  }

  if (item.lastLowPrice < item.avg24hPrice) {
    return "down";
  }

  return "flat";
}
