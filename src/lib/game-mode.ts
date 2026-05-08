import { cookies } from "next/headers";
import { GameMode } from "@/types/tarkov";

const COOKIE_NAME = "tarkov-game-mode";

export function resolveGameMode(input?: string | null): GameMode {
  return input === "pve" ? "pve" : "regular";
}

export function getGameModeFromCookies(): GameMode {
  const cookieStore = cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return resolveGameMode(value);
}

export function gameModeCookieName() {
  return COOKIE_NAME;
}

export function gameModeLabel(mode: GameMode) {
  return mode === "pve" ? "PvE" : "PvP";
}
