import { BallisticsTable } from "@/components/ballistics-table";
import { getGameModeFromCookies } from "@/lib/game-mode";
import { getAmmoItems } from "@/lib/tarkov";

export const dynamic = "force-dynamic";

export default async function BallisticsPage() {
  const mode = getGameModeFromCookies();
  const ammo = await getAmmoItems(mode);

  return (
    <div className="border border-[#2d2d2d] bg-[#1a1a1a] p-5">
      <h1 className="mb-1 font-display text-2xl uppercase tracking-[0.1em] text-[#e2d2af]">Ballistics Reference</h1>
      <p className="mb-5 text-sm text-[#9a9080]">
        Tarkov.dev ammo intelligence with armor-class penetration mapping and fast live filtering.
      </p>
      <BallisticsTable ammo={ammo} />
    </div>
  );
}
