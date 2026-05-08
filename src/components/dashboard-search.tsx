"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GameMode } from "@/types/tarkov";

type Props = {
  initialQuery: string;
  pageTerms: string[];
  mode: GameMode;
};

const STORAGE_KEY = "tarkov-observer-search-index-v1";
const MAX_INDEX_SIZE = 2500;
const MAX_SUGGESTIONS = 8;

function normalizeTerm(value: string) {
  return value.trim().toLowerCase();
}

export function DashboardSearch({ initialQuery, pageTerms, mode }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [indexTerms, setIndexTerms] = useState<string[]>([]);
  const [remoteTerms, setRemoteTerms] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  function navigateToSearch(nextQuery: string) {
    const params = new URLSearchParams();
    const trimmed = nextQuery.trim();
    if (trimmed) {
      params.set("q", trimmed);
    }
    const search = params.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  }

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const fromStorage = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return [] as string[];
        }
        const parsed = JSON.parse(raw) as string[];
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
      } catch {
        return [] as string[];
      }
    })();

    const merged = Array.from(
      new Set([
        ...fromStorage.map((term) => term.trim()).filter(Boolean),
        ...pageTerms.map((term) => term.trim()).filter(Boolean)
      ])
    ).slice(0, MAX_INDEX_SIZE);

    setIndexTerms(merged);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage write errors silently.
    }
  }, [pageTerms]);

  useEffect(() => {
    const value = normalizeTerm(query);
    if (value.length < 2) {
      setRemoteTerms([]);
      return;
    }

    const controller = new AbortController();

    void fetch(`/api/items/search?q=${encodeURIComponent(query)}&mode=${mode}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Search request failed"))))
      .then((payload: { items?: Array<{ name?: string; shortName?: string; normalizedName?: string }> }) => {
        const nextTerms = Array.from(
          new Set(
            (payload.items ?? [])
              .flatMap((item) => [item.name, item.shortName, item.normalizedName])
              .filter((term): term is string => typeof term === "string" && term.trim().length > 0)
          )
        );
        setRemoteTerms(nextTerms);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.warn("[dashboard-search] suggestion fetch failed", error);
        setRemoteTerms([]);
      });

    return () => controller.abort();
  }, [mode, query]);

  const suggestions = useMemo(() => {
    const value = normalizeTerm(query);
    if (!value || value.length < 2) {
      return [];
    }

    return Array.from(new Set([...remoteTerms, ...indexTerms]))
      .filter((term) => normalizeTerm(term).includes(value))
      .sort((a, b) => {
        const aStarts = normalizeTerm(a).startsWith(value) ? 0 : 1;
        const bStarts = normalizeTerm(b).startsWith(value) ? 0 : 1;
        if (aStarts !== bStarts) {
          return aStarts - bStarts;
        }
        return a.localeCompare(b);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [indexTerms, query, remoteTerms]);

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        navigateToSearch(query);
      }}
      className="relative flex flex-col gap-3 md:flex-row md:items-center"
    >
      <div className="relative md:max-w-md md:flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Search item name, shortname, or id"
          autoComplete="off"
          className="pl-8"
        />

        {showSuggestions ? (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary/70"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setQuery(suggestion);
                }}
                onClick={() => {
                  setQuery(suggestion);
                  setFocused(false);
                  navigateToSearch(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button type="submit">Search</Button>
        {query ? (
          <Link
            href={pathname}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
