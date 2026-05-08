"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { PubgMapIntel, PubgMapMarker } from "@/lib/pubg-data";

type Props = {
  map: PubgMapIntel;
};

const MARKER_CONFIG: Record<
  PubgMapMarker["type"],
  { label: string; letter: string; ring: string; bg: string; text: string; dot: string }
> = {
  "hot-drop": {
    label: "Hot Drop",
    letter: "H",
    ring: "#c44",
    bg: "#2b1717",
    text: "#efb2b2",
    dot: "#e05555",
  },
  "secret-room": {
    label: "Secret Room",
    letter: "S",
    ring: "#c9a655",
    bg: "#2b2216",
    text: "#f1d39d",
    dot: "#d7b67a",
  },
  "vehicle-route": {
    label: "Vehicle Route",
    letter: "V",
    ring: "#5588cc",
    bg: "#161f2d",
    text: "#b7ccf1",
    dot: "#7ea0d7",
  },
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
  const markerSize = Math.max(18, 26 - zoom * 2.2);
  const fontSize = Math.max(9, 13 - zoom * 0.9);

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
                borderColor: active ? cfg.ring : "#2d2d2d",
                color: active ? cfg.text : "#7f7768",
                opacity: active ? 1 : 0.55,
              }}
            >
              {/* mini circle swatch */}
              <span
                className="inline-block rounded-full border-2"
                style={{
                  width: 12,
                  height: 12,
                  background: active ? cfg.dot : "#2d2d2d",
                  borderColor: active ? cfg.ring : "#444",
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
        style={{ height: "70vh", minHeight: 500, cursor: dragging.current ? "grabbing" : "grab" }}
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
                className="absolute flex items-center justify-center rounded-full font-bold shadow-lg transition-transform hover:scale-125"
                style={{
                  left: `${marker.x}%`,
                  top: `${marker.y}%`,
                  width: markerSize,
                  height: markerSize,
                  fontSize: fontSize,
                  transform: `translate(-50%, -50%) ${isActive ? "scale(1.35)" : ""}`,
                  background: cfg.bg,
                  color: cfg.text,
                  border: `2px solid ${isActive ? "#fff" : cfg.ring}`,
                  boxShadow: isActive
                    ? `0 0 0 3px ${cfg.ring}, 0 2px 8px rgba(0,0,0,0.7)`
                    : `0 0 0 1px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.6)`,
                  zIndex: isActive ? 30 : 10,
                  lineHeight: 1,
                }}
              >
                {cfg.letter}
              </button>
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
        <div className="flex flex-wrap gap-5">
          {(Object.keys(MARKER_CONFIG) as PubgMapMarker["type"][]).map((type) => {
            const cfg = MARKER_CONFIG[type];
            return (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="flex shrink-0 items-center justify-center rounded-full font-bold"
                  style={{
                    width: 22,
                    height: 22,
                    fontSize: 10,
                    background: cfg.bg,
                    color: cfg.text,
                    border: `2px solid ${cfg.ring}`,
                    boxShadow: `0 0 0 1px rgba(0,0,0,0.4)`,
                  }}
                >
                  {cfg.letter}
                </span>
                <span className="text-xs text-[#9a9080]">{cfg.label}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <span
              className="flex shrink-0 items-center justify-center rounded-full font-bold"
              style={{
                width: 22,
                height: 22,
                fontSize: 10,
                background: "#1a1a1a",
                color: "#fff",
                border: "2px solid #fff",
                boxShadow: "0 0 0 3px #d7b67a",
              }}
            >
              S
            </span>
            <span className="text-xs text-[#9a9080]">Selected (white ring)</span>
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
                className="flex shrink-0 items-center justify-center rounded-full font-bold"
                style={{
                  width: 24,
                  height: 24,
                  fontSize: 11,
                  background: MARKER_CONFIG[activeMarker.type].bg,
                  color: MARKER_CONFIG[activeMarker.type].text,
                  border: `2px solid ${MARKER_CONFIG[activeMarker.type].ring}`,
                }}
              >
                {MARKER_CONFIG[activeMarker.type].letter}
              </span>
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
