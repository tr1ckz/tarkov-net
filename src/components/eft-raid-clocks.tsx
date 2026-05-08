"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEftClock, realTimeToTarkovTime } from "@/lib/eft-time";

export function EftRaidClocks() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    const timer = setInterval(() => {
      setNow(new Date());
    }, 250);

    return () => clearInterval(timer);
  }, []);

  const clocks = useMemo(() => {
    if (!now) {
      return {
        primary: "--:--:--",
        secondary: "--:--:--"
      };
    }

    const primary = realTimeToTarkovTime(now, true);
    const secondary = realTimeToTarkovTime(now, false);

    return {
      primary: formatEftClock(primary),
      secondary: formatEftClock(secondary)
    };
  }, [now]);

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex-1 border border-[#2d2d2d] bg-[#111] px-2 py-3 text-center font-bold text-3xl tracking-[0.18em] text-[#e2d2af] tabular-nums sm:text-4xl">
          {clocks.primary}
        </span>
        <span className="text-xl text-[#9a9080] sm:text-2xl">/</span>
        <span className="flex-1 border border-[#2d2d2d] bg-[#111] px-2 py-3 text-center font-bold text-3xl tracking-[0.18em] text-[#e2d2af] tabular-nums sm:text-4xl">
          {clocks.secondary}
        </span>
      </div>
      <p className="text-sm text-[#9a9080]">Primary and opposite 12-hour raid cycle</p>
    </>
  );
}


