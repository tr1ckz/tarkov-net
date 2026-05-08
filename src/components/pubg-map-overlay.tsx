"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { PubgMapIntel, PubgMapMarker } from "@/lib/pubg-data";

type Props = {
  map: PubgMapIntel;
};

const MARKER_CONFIG: Record<PubgMapMarker["type"], { label: string; color: string }> = {
  "hot-drop":      { label: "Hot Drop",      color: "#e85555" },
  "secret-room":   { label: "Secret Room",   color: "#f5c842" },
  "vehicle-route": { label: "Vehicle Route", color: "#5599ee" },
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.18;

export function PubgMapOverlay({ map }: Props) {
  const [activeTypes, setActiveTypes] = useState<Record<PubgMapMarker["type"], boolean>>({
    "hot-drop": true,
    "secret-room": true,
    "vehicle-route": true,
  });
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  // pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const mergedMarkers = useMemo(() => {
    const existingSecretKeys = new Set(
      map.markers
        .filter((m) => m.type === "secret-room")
        .map((m) => `${Math.round(m.x * 10)}:${Math.round(m.y * 10)}`)
    );
    const derived: PubgMapMarker[] = map.secretRooms
      .map((room, i) => ({
        id: `secret-room-${map.slug}-${i}`,
        label: room.name,
        type: "secret-room" as const,
        x: room.x,
        y: room.y,
        notes: `${room.mapGridArea} — ${room.howToOpen}`,
      }))
      .filter(
        (m) =>
          !existingSecretKeys.has(`${Math.round(m.x * 10)}:${Math.round(m.y * 10)}`)
      );
    return [...map.markers, ...derived];
  }, [map.markers, map.secretRooms, map.slug]);

  const visibleMarkers = useMemo(
    () => mergedMarkers.filter((m) => activeTypes[m.type]),
    [mergedMarkers, activeTypes]
  );

  const activeMarker = visibleMarkers.find((m) => m.id === activeMarkerId) ?? null;

  const toggleType = (type: PubgMapMarker["type"]) => {
    setActiveTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    setActiveMarkerId(null);
  };

  // ── zoom via wheel ──────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setZoom((prevZoom) => {
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));

      // adjust pan so the point under the cursor stays fixed
      const scale = nextZoom / prevZoom;
      setPan((prevPan) => ({
        x: mouseX - scale * (mouseX - prevPan.x),
        y: mouseY - scale * (mouseY - prevPan.y),
      }));

      return nextZoom;
    });
  }, []);

  // ── drag to pan ─────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.mx),
      y: dragStart.current.py + (e.clientY - dragStart.current.my),
    });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // prevent native scroll on the map area
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // marker size inversely scales with zoom so they don't get huge
  const markerSize = Math.max(14, 22 - zoom * 2);

  return (
    <div className="space-y-4">
      {/* ── controls bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MARKER_CONFIG) as PubgMapMarker["type"][]).map((type) => {
          const cfg = MARKER_CONFIG[type];
          const active = activeTypes[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className="flex items-center gap-1.5 border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-opacity"
              style={{
                borderColor: active ? cfg.color : "#2d2d2d",
                color: active ? "#e2d2af" : "#7f7768",
                opacity: active ? 1 : 0.45,
              }}
            >
              <span
                className="inline-block rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  border: `2px solid ${active ? cfg.color : "#444"}`,
                  background: "transparent",
                }}
              />
              {cfg.label}
            </button>
          );
        })}

        {/* zoom controls */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2))); }}
            className="border border-[#3a3a3a] bg-[#1a1a1a] px-2.5 py-1 text-sm text-[#c8bda0] hover:border-[#666] hover:text-white"
            title="Zoom in"
          >+</button>
          <button
            type="button"
            onClick={() => { setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))); }}
            className="border border-[#3a3a3a] bg-[#1a1a1a] px-2.5 py-1 text-sm text-[#c8bda0] hover:border-[#666] hover:text-white"
            title="Zoom out"
          >−</button>
          <button
            type="button"
            onClick={resetView}
            className="border border-[#3a3a3a] bg-[#1a1a1a] px-2.5 py-1 text-xs uppercase tracking-wider text-[#9a9080] hover:border-[#666] hover:text-white"
            title="Reset view"
          >Reset</button>
          <span className="ml-1 text-xs text-[#5a5a5a]">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* ── map canvas ── */}
      <div
        ref={containerRef}
        className="relative overflow-hidden border border-[#2d2d2d] bg-[#0a0a0a]"
        style={{ height: "85vh", minHeight: 600, cursor: dragging.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* header badge */}
        <div className="pointer-events-none absolute left-2 top-2 z-20 border border-[#2d2d2d] bg-[#111]/90 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#7f7768]">
          {map.name} · Scroll/Drag to Navigate · {visibleMarkers.length} markers
        </div>

        {/* zoom+pan container */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: "100%",
            height: "100%",
          }}
        >
          <img
            src={map.mapImage}
            alt={`${map.name} map`}
            className="h-full w-full object-cover select-none"
            draggable={false}
            loading="eager"
          />

          {visibleMarkers.map((marker) => {
            const cfg = MARKER_CONFIG[marker.type];
            const isActive = activeMarkerId === marker.id;
            return (
              <button
                key={marker.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveMarkerId(isActive ? null : marker.id); }}
                title={marker.label}
                className="absolute rounded-full transition-transform hover:scale-125"
                style={{
                  left: `${marker.x}%`,
                  top: `${marker.y}%`,
                  width: markerSize,
                  height: markerSize,
                  transform: `translate(-50%, -50%) ${isActive ? "scale(1.4)" : ""}`,
                  background: "transparent",
                  border: `2px solid ${cfg.color}`,
                  boxShadow: isActive
                    ? `0 0 0 2px #fff, 0 0 8px 2px ${cfg.color}`
                    : `0 0 4px 1px ${cfg.color}55`,
                  zIndex: isActive ? 30 : 10,
                }}
              />
            );
          })}
        </div>

        {!visibleMarkers.length && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-xs uppercase tracking-[0.12em] text-[#c8bda0]">
            No markers visible — enable a layer above
          </div>
        )}
      </div>

      {/* ── legend ── */}
      <div className="border border-[#2d2d2d] bg-[#0e0e0e] px-4 py-3">
        <p className="mb-2.5 text-[10px] uppercase tracking-[0.16em] text-[#5a5450]">Legend</p>
        <div className="flex flex-wrap gap-6">
          {(Object.keys(MARKER_CONFIG) as PubgMapMarker["type"][]).map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="shrink-0 rounded-full"
                style={{ width: 16, height: 16, border: `2px solid ${MARKER_CONFIG[type].color}`, background: "transparent" }}
              />
              <span className="text-xs text-[#9a9080]">{MARKER_CONFIG[type].label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 16,
                height: 16,
                border: `2px solid #f5c842`,
                background: "transparent",
                boxShadow: `0 0 0 2px #fff, 0 0 6px 2px #f5c842`,
              }}
            />
            <span className="text-xs text-[#9a9080]">Selected</span>
          </div>
        </div>
      </div>

      {/* ── info panel ── */}
      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">Marker Intel</p>
        {activeMarker ? (
          <div className="mt-2">
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 16,
                height: 16,
                border: `2px solid ${MARKER_CONFIG[activeMarker.type].color}`,
                background: "transparent",
              }}
            />
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#e2d2af]">
                {activeMarker.label}
              </p>
            </div>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#9a9080]">
              {activeMarker.type.replace(/-/g, " ")}
            </p>
            <p className="mt-2 text-sm text-[#c8bda0]">{activeMarker.notes}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#7f7768]">
            Click any marker on the map to view tactical notes.
          </p>
        )}
      </div>
    </div>
  );
}
