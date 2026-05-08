import Link from "next/link";
import { unstable_cache } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getAllItems } from "@/lib/tarkov";
import {
  CULTIST_CONTAINER_AND_QUEST_RECIPES,
  CULTIST_FIGURE_RECIPES,
  CULTIST_KEY_AND_ACCESS_RECIPES,
  CULTIST_OTHER_FIXED_RECIPES,
  CULTIST_SOURCES,
  CULTIST_THRESHOLD_NOTES,
  type CultistRecipe
} from "@/lib/cultist-circle";

export const dynamic = "force-dynamic";

type IconItem = {
  id: string;
  name: string;
  shortName: string;
  normalizedName: string;
  iconLink?: string | null;
};

const CULTIST_ICON_ALIASES: Record<string, string[]> = {
  "Rusty Bloody Key": ["Rusted bloody key"],
  "Video cassette with Cyborg killer movie": ["Video cassette with the Cyborg Killer movie"],
  "Golden TT-33": ["Tokarev TT-33 7.62x25 TT pistol", "Golden TT", "Golden 1TT"],
  "Odolbos": ["Obdolbos cocktail injector", "Obdolbos 2 cocktail injector"],
  "Tagilla": ["Tagilla's welding mask", "Gorilla balaclava", "UBEY"],
  "Cultist Knife": ["Cultist's knife"],
  "Ded Moroz figurine": ["Ded Moroz Figurine"],
  "Santa's Bag": ["Santa's bag"],
  "Tigzresq splint": ["Tigz decorative splint", "Tigz"],
  "Pumpkin with sweets": ["Pumpkin with sweets"],
  "Scav Backpack": ["Scav backpack"],
  "Waist pouch": ["Waist pouch"],
  "Voron's Hideout Key": ["Voron's hideout key"],
  "Old house toilet key": ["Old house toilet Key"],
  "Jack-o'-lantern tactical pumpkin helmet": ["Jack-o'-lantern tactical pumpkin helmet"]
};

const getCultistIconCatalog = unstable_cache(
  async () => getAllItems("regular"),
  ["cultist-icon-catalog"],
  { revalidate: 60 * 60 * 12 }
);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSlug(value: string) {
  return normalizeText(value).replace(/ /g, "-");
}

function buildSearchVariants(term: string) {
  const variants = [term, ...(CULTIST_ICON_ALIASES[term] ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      variants.flatMap((value) => {
        const normalized = normalizeText(value);
        const slug = normalizeSlug(value);
        return [value, normalized, slug];
      })
    )
  );
}

function getCandidateKeys(item: IconItem) {
  return Array.from(
    new Set([
      item.name,
      item.shortName,
      item.normalizedName,
      normalizeText(item.name),
      normalizeText(item.shortName),
      normalizeText(item.normalizedName),
      normalizeSlug(item.name),
      normalizeSlug(item.shortName)
    ])
  ).filter(Boolean);
}

function findBestIconMatch(term: string, items: IconItem[]) {
  const variants = buildSearchVariants(term);

  for (const variant of variants) {
    const exact = items.find((item) => getCandidateKeys(item).includes(variant));
    if (exact) {
      return exact;
    }
  }

  let bestMatch: IconItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const keys = getCandidateKeys(item);
    let score = 0;

    for (const variant of variants) {
      for (const key of keys) {
        if (key.includes(variant) || variant.includes(key)) {
          score = Math.max(score, Math.min(variant.length, key.length));
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestScore >= 6 ? bestMatch : null;
}

function ConfidenceBadge({ confidence }: { confidence?: "high" | "medium" }) {
  if (!confidence) {
    return null;
  }

  return (
    <Badge className={confidence === "high" ? "border-[#49533a] bg-[#151a12] text-[#c8d1b2]" : "border-[#9a8b4f] bg-[#1b1a12] text-[#d8cc9b]"}>
      {confidence} confidence
    </Badge>
  );
}

function RecipeIcon({ itemId, label, unresolved }: { itemId?: string; label?: string; unresolved?: boolean }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#2d2d2d] bg-[#0e0e0e]">
      {itemId ? (
        <img src={`/api/item-icon/${itemId}`} alt={label} className="h-8 w-8 object-cover" loading="lazy" />
      ) : !label ? null : unresolved ? (
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#a32a2a]">NA</span>
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7f7768]">?</span>
      )}
    </div>
  );
}

function RecipeTable({ title, rows, iconIds }: { title: string; rows: CultistRecipe[]; iconIds: Map<string, string> }) {
  return (
    <Card>
      <CardTitle className="mb-3">{title}</CardTitle>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={`${row.sacrifice}-${row.reward}`} className="border border-[#2d2d2d] bg-[#111] p-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col justify-center gap-1 self-center">
                <RecipeIcon
                  itemId={row.sacrificeIcon ? iconIds.get(row.sacrificeIcon) : undefined}
                  label={row.sacrifice}
                  unresolved={Boolean(row.sacrificeIcon && !iconIds.get(row.sacrificeIcon))}
                />
                <RecipeIcon
                  itemId={row.rewardIcon ? iconIds.get(row.rewardIcon) : undefined}
                  label={row.rewardIcon}
                  unresolved={Boolean(row.rewardIcon && !iconIds.get(row.rewardIcon))}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#e2d2af]">{row.sacrifice}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.08em] text-[#9a9080]">{row.timer}</span>
                    <ConfidenceBadge confidence={row.confidence} />
                  </div>
                </div>
                <p className="text-sm text-[#c8bda0]">{row.reward}</p>
                {row.note ? <p className="mt-1 text-xs text-[#9a9080]">{row.note}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

async function buildCultistIconMap(rows: CultistRecipe[]) {
  const searchTerms = Array.from(
    new Set(
      rows.flatMap((row) => [row.sacrificeIcon, row.rewardIcon]).filter((value): value is string => Boolean(value))
    )
  );

  const cachedItems = await prisma.cachedItem.findMany({
    select: {
      id: true,
      name: true,
      shortName: true,
      normalizedName: true,
      iconLink: true
    }
  });

  const resolved = new Map<string, string>();
  const unresolved: string[] = [];

  for (const term of searchTerms) {
    const item = findBestIconMatch(term, cachedItems);

    if (item) {
      resolved.set(term, item.id);
      continue;
    }

    unresolved.push(term);
  }

  if (!unresolved.length) {
    return resolved;
  }

  const liveItems = (await getCultistIconCatalog()).filter((item) => item.iconLink) as IconItem[];
  const newCachedItems: IconItem[] = [];

  for (const term of unresolved) {
    const item = findBestIconMatch(term, liveItems);

    if (!item?.iconLink) {
      continue;
    }

    resolved.set(term, item.id);
    newCachedItems.push(item);
  }

  if (newCachedItems.length) {
    await prisma.$transaction(
      newCachedItems.map((item) =>
        prisma.cachedItem.upsert({
          where: { id: item.id },
          update: {
            name: item.name,
            shortName: item.shortName,
            normalizedName: item.normalizedName,
            iconLink: item.iconLink
          },
          create: {
            id: item.id,
            name: item.name,
            shortName: item.shortName,
            normalizedName: item.normalizedName,
            iconLink: item.iconLink
          }
        })
      )
    );
  }

  return resolved;
}

export default async function CultistCirclePage() {
  const allRows = [
    ...CULTIST_FIGURE_RECIPES,
    ...CULTIST_CONTAINER_AND_QUEST_RECIPES,
    ...CULTIST_KEY_AND_ACCESS_RECIPES,
    ...CULTIST_OTHER_FIXED_RECIPES
  ];
  const iconIds = await buildCultistIconMap(allRows);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="mb-2">Cultist Circle Reference</CardTitle>
            <p className="text-sm text-[#9a9080]">
              Full working sheet for special recipes, figure trades, Kappa-adjacent exchanges, and key-focused setups.
            </p>
          </div>
          <Link
            href="/tarkov/market-intel"
            className="border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af]"
          >
            Back to Economy
          </Link>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Threshold Logic</CardTitle>
        <div className="space-y-2">
          {CULTIST_THRESHOLD_NOTES.map((note) => (
            <div key={note} className="border border-[#2d2d2d] bg-[#111] p-3 text-sm text-[#c8bda0]">
              {note}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <RecipeTable title="All Figure Recipes" rows={CULTIST_FIGURE_RECIPES} iconIds={iconIds} />
        <RecipeTable title="Containers, Quest Items, Kappa" rows={CULTIST_CONTAINER_AND_QUEST_RECIPES} iconIds={iconIds} />
        <RecipeTable title="Keys and Access Items" rows={CULTIST_KEY_AND_ACCESS_RECIPES} iconIds={iconIds} />
        <RecipeTable title="Other Fixed Specials" rows={CULTIST_OTHER_FIXED_RECIPES} iconIds={iconIds} />
      </div>

      <Card>
        <CardTitle className="mb-3">Source Quality</CardTitle>
        <div className="space-y-2 text-sm text-[#c8bda0]">
          <p>
            This page favors cross-sourced fixed exchanges. Where community reports conflict, entries are marked as medium confidence instead of pretending they are settled.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {CULTIST_SOURCES.map((source) => (
              <div key={source} className="border border-[#2d2d2d] bg-[#111] p-3 text-[#9a9080]">
                {source}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

