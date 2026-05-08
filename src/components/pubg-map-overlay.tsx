"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { PubgMapIntel, PubgMapMarker } from "@/lib/pubg-data";

type Props = {
  map: PubgMapIntel;
};

const MARKER_CONFIG: Record<PubgMapMarker["type"], { label: string; color: string }> = {
  "hot-drop":      { label: "Hot Drop",      color: "#e85555" },
  "secret-room":   { label: "Secret Room",   color: "#f5c842" },
  "secret-key":    { label: "Key Location",  color: "#9fd46a" },
  "vehicle-route": { label: "Vehicle Route", color: "#5599ee" },
};

type MapCalibration = {
  xOffset: number;
  yOffset: number;
  xScale: number;
  yScale: number;
};

type CalibrationOverrides = Partial<Record<PubgMapIntel["slug"], MapCalibration>>;
type EntityOverrides = Partial<Record<PubgMapIntel["slug"], PubgMapMarker[]>>;

type RenderBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const MAP_CALIBRATION: Partial<Record<PubgMapIntel["slug"], MapCalibration>> = {
  sanhok: { xOffset: 2.2, yOffset: 2.3, xScale: 95.4, yScale: 95.0 },
  miramar: { xOffset: 1.4, yOffset: 1.3, xScale: 97.2, yScale: 97.1 },
  taego: { xOffset: 1.8, yOffset: 2.0, xScale: 95.8, yScale: 95.6 },
  deston: { xOffset: 2.6, yOffset: 2.1, xScale: 94.6, yScale: 94.9 },
  vikendi: { xOffset: 1.6, yOffset: 1.8, xScale: 96.6, yScale: 96.4 },
};

const DEFAULT_CALIBRATION: MapCalibration = {
  xOffset: 0,
  yOffset: 0,
  xScale: 100,
  yScale: 100,
};

function getBaseCalibration(slug: PubgMapIntel["slug"]): MapCalibration {
  return MAP_CALIBRATION[slug] ?? DEFAULT_CALIBRATION;
}

function clampPercent(value: number) {
  return Math.max(0.2, Math.min(99.8, value));
}

function applyCalibration(x: number, y: number, calibration: MapCalibration) {
  const c = calibration;

  return {
    x: clampPercent(c.xOffset + (x * c.xScale) / 100),
    y: clampPercent(c.yOffset + (y * c.yScale) / 100),
  };
}

function removeCalibration(x: number, y: number, calibration: MapCalibration) {
  const safeXScale = Math.abs(calibration.xScale) < 0.01 ? 100 : calibration.xScale;
  const safeYScale = Math.abs(calibration.yScale) < 0.01 ? 100 : calibration.yScale;
  return {
    x: clampPercent(((x - calibration.xOffset) * 100) / safeXScale),
    y: clampPercent(((y - calibration.yOffset) * 100) / safeYScale),
  };
}

function readOverrides(): CalibrationOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("pubg-map-calibration-overrides");
    if (!raw) return {};
    return JSON.parse(raw) as CalibrationOverrides;
  } catch {
    return {};
  }
}

function readEntityOverrides(): EntityOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("pubg-map-entity-overrides");
    if (!raw) return {};
    return JSON.parse(raw) as EntityOverrides;
  } catch {
    return {};
  }
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.18;

function computeRenderBox(containerWidth: number, containerHeight: number, imageRatio: number): RenderBox {
  const containerRatio = containerWidth / containerHeight;

  if (containerRatio > imageRatio) {
    const height = containerHeight;
    const width = height * imageRatio;
    return {
      left: (containerWidth - width) / 2,
      top: 0,
      width,
      height,
    };
  }

  const width = containerWidth;
  const height = width / imageRatio;
  return {
    left: 0,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function PubgMapOverlay({ map }: Props) {
  const [activeTypes, setActiveTypes] = useState<Record<PubgMapMarker["type"], boolean>>({
    "hot-drop": true,
    "secret-room": true,
    "secret-key": true,
    "vehicle-route": true,
  });
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [calibration, setCalibration] = useState<MapCalibration>(getBaseCalibration(map.slug));
  const [capturedPoint, setCapturedPoint] = useState<{
    rawX: number;
    rawY: number;
    calibratedX: number;
    calibratedY: number;
  } | null>(null);
  const [renderBox, setRenderBox] = useState<RenderBox>({ left: 0, top: 0, width: 1, height: 1 });
  const [imageRatio, setImageRatio] = useState(1);
  const [editableMarkers, setEditableMarkers] = useState<PubgMapMarker[]>([]);
  const [newEntityLabel, setNewEntityLabel] = useState("New Marker");
  const [newEntityType, setNewEntityType] = useState<PubgMapMarker["type"]>("hot-drop");
  const [newEntityNotes, setNewEntityNotes] = useState("Added in admin editor");

  // pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const draggingMarkerId = useRef<string | null>(null);
  const movedMarkerDuringDrag = useRef(false);
  const markersRef = useRef<PubgMapMarker[]>([]);
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
    const destonKeys: PubgMapMarker[] =
      map.slug === "deston"
        ? map.secretRooms.map((room, i) => ({
            id: `deston-key-${map.slug}-${i}`,
            label: `${room.name.replace("Security Room", "Keycard Spot")}`,
            type: "secret-key" as const,
            x: Math.min(99.5, room.x + 0.35),
            y: Math.min(99.5, room.y + 0.35),
            notes: `Key location marker linked to ${room.name}. ${room.howToOpen}`,
          }))
        : [];

    return [...map.markers, ...derived, ...destonKeys];
  }, [map.markers, map.secretRooms, map.slug]);

  const visibleMarkers = useMemo(
    () => editableMarkers.filter((m) => activeTypes[m.type]),
    [editableMarkers, activeTypes]
  );

  const activeMarker = visibleMarkers.find((m) => m.id === activeMarkerId) ?? null;

  const recomputeRenderBox = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return;
    setRenderBox(computeRenderBox(width, height, imageRatio));
  }, [imageRatio]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAdmin = params.get("admin") === "1";
    const savedAdmin = localStorage.getItem("pubg-map-admin-enabled") === "1";
    setAdminMode(urlAdmin || savedAdmin);
  }, []);

  useEffect(() => {
    const overrides = readOverrides();
    setCalibration(overrides[map.slug] ?? getBaseCalibration(map.slug));
    setCapturedPoint(null);
  }, [map.slug]);

  useEffect(() => {
    const overrides = readEntityOverrides();
    const mapEntities = overrides[map.slug];
    if (mapEntities?.length) {
      setEditableMarkers(mapEntities);
    } else {
      setEditableMarkers(mergedMarkers);
    }
  }, [map.slug, mergedMarkers]);

  useEffect(() => {
    markersRef.current = editableMarkers;
  }, [editableMarkers]);

  useEffect(() => {
    recomputeRenderBox();
  }, [recomputeRenderBox, zoom]);

  function persistCalibration(nextCalibration: MapCalibration) {
    const overrides = readOverrides();
    const nextOverrides: CalibrationOverrides = {
      ...overrides,
      [map.slug]: nextCalibration,
    };
    localStorage.setItem("pubg-map-calibration-overrides", JSON.stringify(nextOverrides));
    setCalibration(nextCalibration);
  }

  function persistEntities(nextMarkers: PubgMapMarker[]) {
    const overrides = readEntityOverrides();
    const nextOverrides: EntityOverrides = {
      ...overrides,
      [map.slug]: nextMarkers,
    };
    localStorage.setItem("pubg-map-entity-overrides", JSON.stringify(nextOverrides));
    setEditableMarkers(nextMarkers);
  }

  function resetEntitiesToDefaults() {
    const overrides = readEntityOverrides();
    delete overrides[map.slug];
    localStorage.setItem("pubg-map-entity-overrides", JSON.stringify(overrides));
    setEditableMarkers(mergedMarkers);
    setActiveMarkerId(null);
  }

  function resetCalibration() {
    const overrides = readOverrides();
    delete overrides[map.slug];
    localStorage.setItem("pubg-map-calibration-overrides", JSON.stringify(overrides));
    setCalibration(getBaseCalibration(map.slug));
  }

  function toggleAdminMode() {
    setAdminMode((prev) => {
      const next = !prev;
      localStorage.setItem("pubg-map-admin-enabled", next ? "1" : "0");
      return next;
    });
  }

  const toggleType = (type: PubgMapMarker["type"]) => {
    setActiveTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    setActiveMarkerId(null);
  };

  const getPointerCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;

      const localX = (clientX - rect.left - pan.x) / zoom;
      const localY = (clientY - rect.top - pan.y) / zoom;
      const calibratedX = clampPercent(((localX - renderBox.left) / Math.max(1, renderBox.width)) * 100);
      const calibratedY = clampPercent(((localY - renderBox.top) / Math.max(1, renderBox.height)) * 100);
      const raw = removeCalibration(calibratedX, calibratedY, calibration);

      return {
        rawX: Number(raw.x.toFixed(2)),
        rawY: Number(raw.y.toFixed(2)),
        calibratedX: Number(calibratedX.toFixed(2)),
        calibratedY: Number(calibratedY.toFixed(2)),
      };
    },
    [calibration, pan.x, pan.y, renderBox.height, renderBox.left, renderBox.top, renderBox.width, zoom]
  );

  function addEntityAtCapturedPoint() {
    if (!capturedPoint) return;
    const nextEntity: PubgMapMarker = {
      id: `admin-${map.slug}-${Date.now().toString(36)}`,
      label: newEntityLabel.trim() || "New Marker",
      type: newEntityType,
      x: capturedPoint.rawX,
      y: capturedPoint.rawY,
      notes: newEntityNotes.trim() || "Added in admin editor",
    };
    const next = [...editableMarkers, nextEntity];
    persistEntities(next);
    setActiveMarkerId(nextEntity.id);
  }

  function removeActiveEntity() {
    if (!activeMarkerId) return;
    const next = editableMarkers.filter((m) => m.id !== activeMarkerId);
    persistEntities(next);
    setActiveMarkerId(null);
  }

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
    if (adminMode && draggingMarkerId.current) {
      const coords = getPointerCoords(e.clientX, e.clientY);
      if (!coords) return;
      movedMarkerDuringDrag.current = true;
      setEditableMarkers((prev) =>
        prev.map((marker) =>
          marker.id === draggingMarkerId.current
            ? { ...marker, x: coords.rawX, y: coords.rawY }
            : marker
        )
      );
      return;
    }

    if (!dragging.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.mx),
      y: dragStart.current.py + (e.clientY - dragStart.current.my),
    });
  }, [adminMode, getPointerCoords]);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    if (adminMode && draggingMarkerId.current) {
      const moved = movedMarkerDuringDrag.current;
      draggingMarkerId.current = null;
      movedMarkerDuringDrag.current = false;
      if (moved) {
        persistEntities(markersRef.current);
      }
    }
  }, [adminMode]);

  const onMapClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!adminMode) return;
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      const captured = getPointerCoords(e.clientX, e.clientY);
      if (!captured) return;
      setCapturedPoint(captured);

      try {
        await navigator.clipboard.writeText(JSON.stringify(captured));
      } catch {
        // ignore clipboard permission failures
      }
    },
    [adminMode, getPointerCoords]
  );

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // prevent native scroll on the map area
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      recomputeRenderBox();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [recomputeRenderBox]);

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
            onClick={toggleAdminMode}
            className="border border-[#3a3a3a] bg-[#1a1a1a] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[#c8bda0] hover:border-[#666] hover:text-white"
            title="Toggle admin pinpoint editor"
          >{adminMode ? "Admin On" : "Admin"}</button>
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
        className="relative mx-auto aspect-square w-full max-w-[85vh] overflow-hidden border border-[#2d2d2d] bg-[#0a0a0a]"
        style={{ cursor: dragging.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onMapClick}
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
            className="h-full w-full object-contain select-none"
            draggable={false}
            loading="eager"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setImageRatio(img.naturalWidth / img.naturalHeight);
              }
              recomputeRenderBox();
            }}
          />

          {visibleMarkers.map((marker) => {
            const cfg = MARKER_CONFIG[marker.type];
            const isActive = activeMarkerId === marker.id;
            const calibrated = applyCalibration(marker.x, marker.y, calibration);
            return (
              <button
                key={marker.id}
                type="button"
                onMouseDown={(e) => {
                  if (!adminMode) return;
                  e.preventDefault();
                  e.stopPropagation();
                  draggingMarkerId.current = marker.id;
                  movedMarkerDuringDrag.current = false;
                  setActiveMarkerId(marker.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (adminMode && movedMarkerDuringDrag.current) {
                    movedMarkerDuringDrag.current = false;
                    return;
                  }
                  setActiveMarkerId(isActive ? null : marker.id);
                }}
                title={marker.label}
                className="absolute rounded-full transition-transform hover:scale-125"
                style={{
                  left: `${renderBox.left + (calibrated.x / 100) * renderBox.width}px`,
                  top: `${renderBox.top + (calibrated.y / 100) * renderBox.height}px`,
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

      {adminMode && (
        <div className="border border-[#3a3426] bg-[#14110b] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#d2b277]">Admin Pinpoint Editor (Local)</p>
          <p className="mt-1 text-xs text-[#a69475]">
            Tune calibration for {map.name}. Click anywhere on map to capture coordinates (copied to clipboard).
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-[#b8aa90]">
              X Offset
              <input
                type="range"
                min={-8}
                max={8}
                step={0.1}
                value={calibration.xOffset}
                onChange={(e) => setCalibration((prev) => ({ ...prev, xOffset: Number(e.target.value) }))}
                className="mt-1 w-full"
              />
              <span className="text-[11px] text-[#8f826a]">{calibration.xOffset.toFixed(2)}</span>
            </label>
            <label className="text-xs text-[#b8aa90]">
              Y Offset
              <input
                type="range"
                min={-8}
                max={8}
                step={0.1}
                value={calibration.yOffset}
                onChange={(e) => setCalibration((prev) => ({ ...prev, yOffset: Number(e.target.value) }))}
                className="mt-1 w-full"
              />
              <span className="text-[11px] text-[#8f826a]">{calibration.yOffset.toFixed(2)}</span>
            </label>
            <label className="text-xs text-[#b8aa90]">
              X Scale (%)
              <input
                type="range"
                min={90}
                max={110}
                step={0.1}
                value={calibration.xScale}
                onChange={(e) => setCalibration((prev) => ({ ...prev, xScale: Number(e.target.value) }))}
                className="mt-1 w-full"
              />
              <span className="text-[11px] text-[#8f826a]">{calibration.xScale.toFixed(2)}</span>
            </label>
            <label className="text-xs text-[#b8aa90]">
              Y Scale (%)
              <input
                type="range"
                min={90}
                max={110}
                step={0.1}
                value={calibration.yScale}
                onChange={(e) => setCalibration((prev) => ({ ...prev, yScale: Number(e.target.value) }))}
                className="mt-1 w-full"
              />
              <span className="text-[11px] text-[#8f826a]">{calibration.yScale.toFixed(2)}</span>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => persistCalibration(calibration)}
              className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
            >Save Calibration</button>
            <button
              type="button"
              onClick={resetCalibration}
              className="border border-[#3a3a3a] bg-[#1a1a1a] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-white"
            >Reset Map</button>
            <button
              type="button"
              onClick={addEntityAtCapturedPoint}
              disabled={!capturedPoint}
              className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842] disabled:opacity-50"
            >Add Entity At Click</button>
            <button
              type="button"
              onClick={removeActiveEntity}
              disabled={!activeMarkerId}
              className="border border-[#5e2a2a] bg-[#1a1010] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e3b8b8] hover:border-[#d36a6a] disabled:opacity-50"
            >Delete Selected</button>
            <button
              type="button"
              onClick={resetEntitiesToDefaults}
              className="border border-[#3a3a3a] bg-[#1a1a1a] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-white"
            >Reset Entities</button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              value={newEntityLabel}
              onChange={(e) => setNewEntityLabel(e.target.value)}
              className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
              placeholder="Entity label"
            />
            <select
              value={newEntityType}
              onChange={(e) => setNewEntityType(e.target.value as PubgMapMarker["type"])}
              className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
            >
              {(Object.keys(MARKER_CONFIG) as PubgMapMarker["type"][]).map((type) => (
                <option key={type} value={type}>{MARKER_CONFIG[type].label}</option>
              ))}
            </select>
            <input
              value={newEntityNotes}
              onChange={(e) => setNewEntityNotes(e.target.value)}
              className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
              placeholder="Entity notes"
            />
          </div>

          {capturedPoint && (
            <p className="mt-3 text-xs text-[#b8aa90]">
              Captured raw ({capturedPoint.rawX}, {capturedPoint.rawY}) · rendered ({capturedPoint.calibratedX}, {capturedPoint.calibratedY})
            </p>
          )}
          <p className="mt-2 text-xs text-[#8f826a]">
            Admin entity controls: click map to set capture point, Add Entity At Click, drag circles to move, select then Delete Selected.
          </p>
        </div>
      )}

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
