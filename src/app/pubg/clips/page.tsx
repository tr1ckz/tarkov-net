import { PubgClipsPanel } from "@/components/pubg/pubg-clips-panel";

export default function PubgClipsPage() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-[#e2d2af]">PUBG Streamer Clips</h2>
        <p className="mt-1 text-sm text-[#9a9080]">
          PUBG Twitch clips feed. Filter by streamer login if you want one channel only.
        </p>
      </div>
      <PubgClipsPanel />
    </div>
  );
}
