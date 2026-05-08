"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GameMode } from "@/types/tarkov";
import { Button } from "@/components/ui/button";

type Props = {
  currentMode: GameMode;
};

export function GameModeToggle({ currentMode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setMode = (mode: GameMode) => {
    startTransition(async () => {
      await fetch("/api/game-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      router.refresh();
    });
  };

  return (
    <div className="inline-flex gap-2 rounded-md border border-border bg-card p-1">
      <Button
        variant={currentMode === "regular" ? "default" : "ghost"}
        onClick={() => setMode("regular")}
        disabled={pending}
      >
        PvP
      </Button>
      <Button
        variant={currentMode === "pve" ? "default" : "ghost"}
        onClick={() => setMode("pve")}
        disabled={pending}
      >
        PvE
      </Button>
    </div>
  );
}
