"use client";

import { useMemo, useState } from "react";
import type { PubgMapIntel, PubgMapMarker } from "@/lib/pubg-data";

type Props = {
  map: PubgMapIntel;
};

function markerClasses(type: PubgMapMarker["type"]) {
  if (type === "secret-room") return "border-[#d7b67a] bg-[#2b2216] text-[#f1d39d]";
  if (type === "vehicle-route") return "border-[#7ea0d7] bg-[#161f2d] text-[#b7ccf1]";
  return "border-[#a87070] bg-[#2b1717] text-[#efb2b2]";
}

export function PubgMapOverlay({ map }: Props) {
  const [activeTypes, setActiveTypes] = useState<Record<PubgMapMarker["type"], boolean>>({
    "hot-drop": true,
    "secret-room": true,
    "vehicle-route": true
  });
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const visibleMarkers = useMemo(
    () => map.markers.filter((marker) => activeTypes[marker.type]),
    [map.markers, activeTypes]
  );

  const activeMarker = visibleMarkers.find((marker) => marker.id === activeMarkerId) ?? null;

  const toggleType = (type: PubgMapMarker["type"]) => {
    setActiveTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    setActiveMarkerId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggleType("hot-drop")}
          className={`border px-3 py-1.5 text-xs uppercase tracking-[0.12em] ${activeTypes["hot-drop"] ? "border-[#a87070] text-[#efb2b2]" : "border-[#2d2d2d] text-[#7f7768]"}`}
        >
          Hot Drops
        </button>
        <button
          type="button"
          onClick={() => toggleType("secret-room")}
          className={`border px-3 py-1.5 text-xs uppercase tracking-[0.12em] ${activeTypes["secret-room"] ? "border-[#d7b67a] text-[#f1d39d]" : "border-[#2d2d2d] text-[#7f7768]"}`}
        >
          Secret Rooms
        </button>
        <button
          type="button"
          onClick={() => toggleType("vehicle-route")}
          className={`border px-3 py-1.5 text-xs uppercase tracking-[0.12em] ${activeTypes["vehicle-route"] ? "border-[#7ea0d7] text-[#b7ccf1]" : "border-[#2d2d2d] text-[#7f7768]"}`}
        >
          Vehicle Routes
        </button>
      </div>

      <div className="relative overflow-hidden border border-[#2d2d2d] bg-[radial-gradient(circle_at_20%_20%,#252525_0%,#171717_55%,#101010_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#2a2a2a_1px,transparent_1px),linear-gradient(to_bottom,#2a2a2a_1px,transparent_1px)] bg-[size:10%_10%] opacity-55" />
        <div className="pointer-events-none absolute left-2 top-2 text-[10px] uppercase tracking-[0.14em] text-[#7f7768]">{map.name} Tactical Grid</div>

        <div className="relative h-[420px] w-full">
          {visibleMarkers.map((marker) => (
            <button
              key={marker.id}
              type="button"
              onClick={() => setActiveMarkerId(marker.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] shadow-[0_0_0_1px_rgba(0,0,0,0.35)] transition hover:scale-105 ${markerClasses(marker.type)} ${activeMarkerId === marker.id ? "ring-1 ring-[#e2d2af]" : ""}`}
              style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            >
              {marker.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">Selected Marker Intel</p>
        {activeMarker ? (
          <div className="mt-2">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#e2d2af]">{activeMarker.label}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#9a9080]">{activeMarker.type.replace("-", " ")}</p>
            <p className="mt-2 text-sm text-[#c8bda0]">{activeMarker.notes}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#7f7768]">Click any marker on the grid to view tactical notes.</p>
        )}
      </div>
    </div>
  );
}
