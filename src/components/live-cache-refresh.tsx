"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GameMode } from "@/types/tarkov";

type Props = {
  mode: GameMode;
  initialToken: string;
};

type CacheStatusResponse = {
  token: string;
};

const POLL_INTERVAL_MS = 20 * 1000;
const LIVE_REFRESH_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_LIVE_REFRESH === "1";

export function LiveCacheRefresh({ mode, initialToken }: Props) {
  if (!LIVE_REFRESH_ENABLED) {
    return null;
  }

  const router = useRouter();
  const lastTokenRef = useRef(initialToken);

  useEffect(() => {
    lastTokenRef.current = initialToken;
  }, [initialToken]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/cache/status?mode=${mode}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as CacheStatusResponse;
        if (cancelled) {
          return;
        }

        if (payload.token && payload.token !== lastTokenRef.current) {
          lastTokenRef.current = payload.token;
          router.refresh();
        }
      } catch {
        // Keep polling even if transient network errors occur.
      }
    };

    const intervalId = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [mode, router]);

  return null;
}
