"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fullPrice } from "@/lib/utils";
import { AmmoItem, TraderPrice } from "@/types/tarkov";

type Props = {
  ammo: AmmoItem[];
};

type LegendRow = {
  value: number;
  effectiveness: string;
  avgShotsToKill: string;
  description: string;
  color: string;
};

// Muted tactical colors — no bright neon
const EFFECTIVENESS_COLORS = [
  "#7a2a2a", // 0 — Pointless
  "#7a3d28", // 1 — Possible
  "#7a5520", // 2 — Magdump Only
  "#9a8b4f", // 3 — Slightly Effective
  "#6e7f46", // 4 — Effective
  "#627a4a", // 5 — Very Effective
  "#5e6a4b", // 6 — Basically Ignores
];

const LEGEND_ROWS: LegendRow[] = [
  {
    value: 0,
    effectiveness: "Pointless",
    avgShotsToKill: "20+",
    description: "Cannot penetrate in a practical number of hits.",
    color: EFFECTIVENESS_COLORS[0]
  },
  {
    value: 1,
    effectiveness: "Possible",
    avgShotsToKill: "13 to 20",
    description: "May eventually penetrate after many hits.",
    color: EFFECTIVENESS_COLORS[1]
  },
  {
    value: 2,
    effectiveness: "Magdump Only",
    avgShotsToKill: "9 to 13",
    description: "Very low chance at first, slowly improves over hits.",
    color: EFFECTIVENESS_COLORS[2]
  },
  {
    value: 3,
    effectiveness: "Slightly Effective",
    avgShotsToKill: "5 to 9",
    description: "Starts low, becomes viable with repeated hits.",
    color: EFFECTIVENESS_COLORS[3]
  },
  {
    value: 4,
    effectiveness: "Effective",
    avgShotsToKill: "3-5",
    description: "Low-medium chance initially, rises quickly.",
    color: EFFECTIVENESS_COLORS[4]
  },
  {
    value: 5,
    effectiveness: "Very Effective",
    avgShotsToKill: "1 to 3",
    description: "High initial chance, climbs to near-certain quickly.",
    color: EFFECTIVENESS_COLORS[5]
  },
  {
    value: 6,
    effectiveness: "Basically Ignores",
    avgShotsToKill: "<1",
    description: "Penetrates immediately the vast majority of the time.",
    color: EFFECTIVENESS_COLORS[6]
  }
];

function toPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function getBestTraderSellPrice(sellFor: TraderPrice[]) {
  const traderSell = sellFor.filter((entry) => entry.vendor.normalizedName !== "flea-market");
  if (!traderSell.length) {
    return null;
  }

  return traderSell.reduce((best, current) => (current.priceRUB > best.priceRUB ? current : best), traderSell[0]);
}

function getBestTraderBuyPrice(buyFor: TraderPrice[]) {
  const traderBuy = buyFor.filter((entry) => entry.vendor.normalizedName !== "flea-market");
  if (!traderBuy.length) {
    return null;
  }

  return traderBuy.reduce((best, current) => (current.priceRUB < best.priceRUB ? current : best), traderBuy[0]);
}

function getOfferLoyaltyLevel(offer: TraderPrice) {
  const fromRequirement = offer.requirements?.find((requirement) => requirement.type === "loyaltyLevel")?.value;
  if (typeof fromRequirement === "number") {
    return fromRequirement;
  }

  return null;
}

function getClassEffectivenessValue(penetrationPower: number, armorClass: number) {
  const threshold = armorClass * 10;

  if (penetrationPower >= threshold + 10) {
    return 6;
  }
  if (penetrationPower >= threshold + 5) {
    return 5;
  }
  if (penetrationPower >= threshold) {
    return 4;
  }
  if (penetrationPower >= threshold - 5) {
    return 3;
  }
  if (penetrationPower >= threshold - 10) {
    return 2;
  }
  if (penetrationPower >= threshold - 15) {
    return 1;
  }
  return 0;
}

function getEffectivenessStyle(value: number): React.CSSProperties {
  return {
    backgroundColor: EFFECTIVENESS_COLORS[value] ?? "#2d2d2d",
    color: "#f0ead8"
  };
}

export function BallisticsTable({ ammo }: Props) {
  const [search, setSearch] = useState("");
  const [selectedLoyalty, setSelectedLoyalty] = useState(4);

  const maxDamage = useMemo(() => Math.max(100, ...ammo.map((entry) => entry.properties?.damage ?? 0)), [ammo]);
  const maxPen = useMemo(() => Math.max(60, ...ammo.map((entry) => entry.properties?.penetrationPower ?? 0)), [ammo]);
  const maxSpeed = useMemo(() => Math.max(1400, ...ammo.map((entry) => entry.properties?.initialSpeed ?? 0)), [ammo]);

  const [damageMin, setDamageMin] = useState(0);
  const [damageMax, setDamageMax] = useState(maxDamage);
  const [penMin, setPenMin] = useState(0);
  const [penMax, setPenMax] = useState(maxPen);
  const [speedMin, setSpeedMin] = useState(0);
  const [speedMax, setSpeedMax] = useState(maxSpeed);
  const [collapsedCalibers, setCollapsedCalibers] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return ammo
      .filter((entry) => {
        const damage = entry.properties?.damage ?? 0;
        const penetration = entry.properties?.penetrationPower ?? 0;
        const speed = entry.properties?.initialSpeed ?? 0;

        if (damage < damageMin || damage > damageMax) {
          return false;
        }
        if (penetration < penMin || penetration > penMax) {
          return false;
        }
        if (speed < speedMin || speed > speedMax) {
          return false;
        }

        const traderLevels = entry.buyFor
          .filter((offer) => offer.vendor.normalizedName !== "flea-market")
          .map((offer) => getOfferLoyaltyLevel(offer))
          .filter((value): value is number => typeof value === "number");

        if (traderLevels.length && !traderLevels.some((level) => level <= selectedLoyalty)) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const caliber = entry.properties?.caliber ?? "";
        const nameText = `${entry.name} ${entry.shortName} ${caliber}`.toLowerCase();
        return nameText.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aCaliber = a.properties?.caliber ?? "Unknown";
        const bCaliber = b.properties?.caliber ?? "Unknown";
        const caliberSort = aCaliber.localeCompare(bCaliber);
        if (caliberSort !== 0) {
          return caliberSort;
        }

        return a.name.localeCompare(b.name);
      });
  }, [ammo, damageMax, damageMin, penMax, penMin, search, selectedLoyalty, speedMax, speedMin]);

  const grouped = useMemo(() => {
    const groups = new Map<string, AmmoItem[]>();

    for (const entry of filtered) {
      const caliber = entry.properties?.caliber ?? "Unknown";
      const existing = groups.get(caliber);
      if (existing) {
        existing.push(entry);
      } else {
        groups.set(caliber, [entry]);
      }
    }

    return Array.from(groups.entries());
  }, [filtered]);

  const toggleCaliber = (caliber: string) => {
    setCollapsedCalibers((previous) => {
      const next = new Set(previous);
      if (next.has(caliber)) {
        next.delete(caliber);
      } else {
        next.add(caliber);
      }
      return next;
    });
  };

  const showAllCalibers = () => {
    setCollapsedCalibers(new Set());
  };

  const hideAllCalibers = () => {
    setCollapsedCalibers(new Set(grouped.map(([caliber]) => caliber)));
  };

  const resetFilters = () => {
    setDamageMin(0);
    setDamageMax(maxDamage);
    setPenMin(0);
    setPenMax(maxPen);
    setSpeedMin(0);
    setSpeedMax(maxSpeed);
    setSelectedLoyalty(4);
    setSearch("");
  };

  return (
    <div className="space-y-5">
      <div className="border border-[#2d2d2d] bg-[#1a1a1a] p-4">
        <h3 className="mb-3 font-display text-base uppercase tracking-[0.12em] text-[#e2d2af]">Ballistics Legend</h3>
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="border-[#2d2d2d] hover:bg-transparent">
                <TableHead className="text-[#e2d2af] tracking-[0.1em]">Value</TableHead>
                <TableHead className="text-[#e2d2af] tracking-[0.1em]">Effectiveness</TableHead>
                <TableHead className="text-[#e2d2af] tracking-[0.1em]">Avg Shots to Kill</TableHead>
                <TableHead className="text-[#e2d2af] tracking-[0.1em]">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LEGEND_ROWS.map((row) => (
                <TableRow key={row.value} className="border-[#2d2d2d] hover:bg-[#222]">
                  <TableCell>
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: row.color, color: "#f0ead8" }}
                    >
                      {row.value}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-[#e2d2af]">{row.effectiveness}</TableCell>
                  <TableCell className="text-[#c8bda0]">{row.avgShotsToKill}</TableCell>
                  <TableCell className="text-[#9a9080]">{row.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="border border-[#2d2d2d] bg-[#1a1a1a] p-4">
        <h3 className="mb-4 font-display text-base uppercase tracking-[0.12em] text-[#e2d2af]">Filter Engine</h3>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#e2d2af]">Damage</p>
            <p className="mb-2 text-xs text-[#9a9080]">{damageMin} - {damageMax}</p>
            <input
              type="range"
              min={0}
              max={maxDamage}
              value={damageMin}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDamageMin(value > damageMax ? damageMax : value);
              }}
              className="w-full accent-[#e2d2af]"
            />
            <input
              type="range"
              min={0}
              max={maxDamage}
              value={damageMax}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDamageMax(value < damageMin ? damageMin : value);
              }}
              className="mt-2 w-full accent-[#e2d2af]"
            />
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#e2d2af]">Penetration</p>
            <p className="mb-2 text-xs text-[#9a9080]">{penMin} - {penMax}</p>
            <input
              type="range"
              min={0}
              max={maxPen}
              value={penMin}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPenMin(value > penMax ? penMax : value);
              }}
              className="w-full accent-[#e2d2af]"
            />
            <input
              type="range"
              min={0}
              max={maxPen}
              value={penMax}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPenMax(value < penMin ? penMin : value);
              }}
              className="mt-2 w-full accent-[#e2d2af]"
            />
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#e2d2af]">Speed</p>
            <p className="mb-2 text-xs text-[#9a9080]">{speedMin} - {speedMax}</p>
            <input
              type="range"
              min={0}
              max={maxSpeed}
              value={speedMin}
              onChange={(event) => {
                const value = Number(event.target.value);
                setSpeedMin(value > speedMax ? speedMax : value);
              }}
              className="w-full accent-[#e2d2af]"
            />
            <input
              type="range"
              min={0}
              max={maxSpeed}
              value={speedMax}
              onChange={(event) => {
                const value = Number(event.target.value);
                setSpeedMax(value < speedMin ? speedMin : value);
              }}
              className="mt-2 w-full accent-[#e2d2af]"
            />
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <label htmlFor="ll-filter" className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[#e2d2af]">
              Trader LL
            </label>
            <select
              id="ll-filter"
              value={selectedLoyalty}
              onChange={(event) => setSelectedLoyalty(Number(event.target.value))}
              className="h-10 w-full border border-[#2d2d2d] bg-[#0e0e0e] px-3 text-sm text-[#e2d2af] focus:border-[#e2d2af] focus:outline-none"
            >
              <option value={1}>LL1</option>
              <option value={2}>LL2</option>
              <option value={3}>LL3</option>
              <option value={4}>LL4</option>
            </select>
          </div>

          <div className="border border-[#2d2d2d] bg-[#111] p-3">
            <label htmlFor="ammo-search" className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[#e2d2af]">
              Search
            </label>
            <Input
              id="ammo-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ammo or caliber (e.g. 5.45)"
              className="border-[#2d2d2d] bg-[#0e0e0e] text-[#e2d2af] placeholder:text-[#555] focus:border-[#e2d2af]"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" variant="outline" className="h-8 border-[#2d2d2d] bg-[#1a1a1a] px-3 text-xs uppercase tracking-wider text-[#e2d2af] hover:bg-[#5e6a4b] hover:border-[#5e6a4b]" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-[#2d2d2d] bg-[#1a1a1a] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base uppercase tracking-[0.12em] text-[#e2d2af]">Ammo Data ({filtered.length})</h3>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-8 border-[#2d2d2d] bg-[#1a1a1a] px-3 text-xs uppercase tracking-wider text-[#e2d2af] hover:bg-[#5e6a4b] hover:border-[#5e6a4b]" onClick={showAllCalibers}>
              Show All
            </Button>
            <Button type="button" variant="outline" className="h-8 border-[#2d2d2d] bg-[#1a1a1a] px-3 text-xs uppercase tracking-wider text-[#e2d2af] hover:bg-[#5e6a4b] hover:border-[#5e6a4b]" onClick={hideAllCalibers}>
              Hide All
            </Button>
          </div>
        </div>

        <div>
          <Table className="w-full table-fixed text-xs">
            <TableHeader>
              <TableRow className="border-[#2d2d2d] bg-[#111] hover:bg-[#111]">
                <TableHead className="w-[18%] tracking-[0.1em] text-[#e2d2af]">Item Name</TableHead>
                <TableHead className="w-[14%] tracking-[0.1em] text-[#e2d2af]">Buy / Sell</TableHead>
                <TableHead className="w-[5%] tracking-[0.1em] text-[#e2d2af]">Dmg</TableHead>
                <TableHead className="w-[5%] tracking-[0.1em] text-[#e2d2af]">Pen</TableHead>
                <TableHead className="w-[5%] tracking-[0.1em] text-[#e2d2af]">Frag</TableHead>
                <TableHead className="w-[5%] tracking-[0.1em] text-[#e2d2af]">Recoil</TableHead>
                <TableHead className="w-[5%] tracking-[0.1em] text-[#e2d2af]">Acc</TableHead>
                <TableHead className="w-[6%] tracking-[0.1em] text-[#e2d2af]">Speed</TableHead>
                <TableHead className="text-center tracking-[0.1em] text-[#e2d2af]">C1</TableHead>
                <TableHead className="text-center tracking-[0.1em] text-[#e2d2af]">C2</TableHead>
                <TableHead className="text-center tracking-[0.1em] text-[#e2d2af]">C3</TableHead>
                <TableHead className="text-center tracking-[0.1em] text-[#e2d2af]">C4</TableHead>
                <TableHead className="text-center tracking-[0.1em] text-[#e2d2af]">C5</TableHead>
                <TableHead className="text-center tracking-[0.1em] text-[#e2d2af]">C6</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([caliber, rows]) => (
                <Fragment key={caliber}>
                  <TableRow key={`${caliber}-header`} className="border-[#2d2d2d] bg-[#222] hover:bg-[#262626]">
                    <TableCell colSpan={14} className="py-2">
                      <button
                        type="button"
                        onClick={() => toggleCaliber(caliber)}
                        className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-[0.12em] text-[#e2d2af] hover:text-white"
                      >
                        {collapsedCalibers.has(caliber) ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {caliber}
                        <span className="text-xs text-[#9a9080]">({rows.length})</span>
                      </button>
                    </TableCell>
                  </TableRow>
                  {!collapsedCalibers.has(caliber) && rows.map((entry, rowIndex) => {
                    const pen = entry.properties?.penetrationPower ?? 0;
                    const buy = getBestTraderBuyPrice(entry.buyFor);
                    const sell = getBestTraderSellPrice(entry.sellFor);

                    return (
                      <TableRow key={entry.id} className={`border-[#2d2d2d] text-[#c8bda0] hover:bg-[#1f1f1f] ${rowIndex % 2 === 1 ? "bg-[#151515]" : "bg-[#1a1a1a]"}`}>
                        <TableCell>
                          <div className="truncate font-medium text-[#e2d2af]" title={entry.name}>{entry.name}</div>
                          <div className="text-xs text-[#9a9080]">{entry.shortName}</div>
                        </TableCell>
                        <TableCell className="text-xs text-[#c8bda0]">
                          <div>
                            B: {buy ? `${fullPrice(buy.priceRUB)} RUB` : "-"}
                          </div>
                          <div>
                            S: {sell ? `${fullPrice(sell.priceRUB)} RUB` : "-"}
                          </div>
                        </TableCell>
                        <TableCell>{entry.properties?.damage ?? "-"}</TableCell>
                        <TableCell>{entry.properties?.penetrationPower ?? "-"}</TableCell>
                        <TableCell>{toPercent(entry.properties?.fragmentationChance)}</TableCell>
                        <TableCell>{toPercent(entry.properties?.recoilModifier)}</TableCell>
                        <TableCell>{toPercent(entry.properties?.accuracyModifier)}</TableCell>
                        <TableCell>{entry.properties?.initialSpeed ? `${entry.properties.initialSpeed}` : "-"}</TableCell>
                        {[1, 2, 3, 4, 5, 6].map((armorClass) => (
                          <TableCell key={`${entry.id}-c${armorClass}`} className="p-2 text-center">
                            <div
                              className="px-2 py-1 text-xs font-bold"
                              style={getEffectivenessStyle(getClassEffectivenessValue(pen, armorClass))}
                            >
                              {getClassEffectivenessValue(pen, armorClass)}
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
