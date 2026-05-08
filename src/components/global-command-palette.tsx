"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchResult = {
  id: string;
  name: string;
  shortName: string;
  price: number;
};

type Props = {
  mode: "regular" | "pve";
};

export function GlobalCommandPalette({ mode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const response = await fetch(`/api/items/search?q=${encodeURIComponent(query)}&mode=${mode}`, {
        signal: controller.signal
      }).catch(() => null);
      if (!response?.ok) {
        setResults([]);
        return;
      }

      const data = (await response.json()) as { items?: SearchResult[] };
      setResults(Array.isArray(data.items) ? data.items : []);
      setSelectedIndex(0);
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [mode, open, query]);

  const selected = useMemo(() => results[selectedIndex] ?? null, [results, selectedIndex]);

  const navigateToResult = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/item/${id}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-[#2d2d2d] bg-[#111] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#c8bda0] hover:border-[#49533a] hover:text-[#e2d2af]"
      >
        <Search className="h-4 w-4" />
        Search
        <span className="border border-[#2d2d2d] px-1.5 py-0.5 text-[10px] text-[#9a9080]">Ctrl+K</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="mx-auto mt-[10vh] w-full max-w-2xl border border-[#2d2d2d] bg-[#111] p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 border border-[#2d2d2d] bg-[#0e0e0e] px-3">
              <Search className="h-4 w-4 text-[#9a9080]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedIndex((current) => Math.max(0, current - 1));
                  }
                  if (event.key === "Enter" && selected) {
                    event.preventDefault();
                    navigateToResult(selected.id);
                  }
                }}
                placeholder="Jump to any item"
                autoFocus
                className="border-0 bg-transparent pl-0 focus:border-0"
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto border border-[#2d2d2d] bg-[#0e0e0e]">
              {query.trim().length < 2 ? (
                <div className="px-3 py-4 text-sm text-[#9a9080]">Type at least 2 characters to search cached items.</div>
              ) : results.length ? (
                results.map((item, index) => (
                  <Link
                    key={item.id}
                    href={`/item/${item.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex items-center justify-between gap-3 border-b border-[#1c1c1c] px-3 py-3 ${
                      index === selectedIndex ? "bg-[#171d13]" : "hover:bg-[#141414]"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#e2d2af]">{item.name}</div>
                      <div className="text-xs uppercase tracking-[0.08em] text-[#9a9080]">{item.shortName}</div>
                    </div>
                    <div className="text-sm text-[#c8bda0]">{item.price.toLocaleString()} RUB</div>
                  </Link>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-[#9a9080]">No cached matches. Try a different term.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}