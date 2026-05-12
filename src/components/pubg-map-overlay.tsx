"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { PubgMapIntel, PubgMapMarker } from "@/lib/pubg-data";
import { pubgImportedMarkersBySlug } from "@/lib/pubg-map-pois";

type Props = {
  map: PubgMapIntel;
  isAdmin: boolean;
};

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  "hot-drop": "Hot Drop",
  "secret-room": "Secret Room",
  "secret-key": "Key Location",
  "vehicle-route": "Vehicle Route",
};

type MarkerPalette = Record<string, string>;
type MapTheme = "dark" | "light";

const DEFAULT_MARKER_COLORS: MarkerPalette = {
  "hot-drop": "#e85555",
  "secret-room": "#f5c842",
  "secret-key": "#9fd46a",
  "vehicle-route": "#5599ee",
};

function humanizeCategory(type: string) {
  return type
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function sanitizeCategoryKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function fallbackColorForCategory(type: string) {
  const known = DEFAULT_MARKER_COLORS[type];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < type.length; i += 1) {
    hash = (hash * 31 + type.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) % 0xffffff;
  return `#${normalized.toString(16).padStart(6, "0")}`;
}

function MarkerIcon({ type, className }: { type: string; className?: string }) {
  const normalized = type.toLowerCase();

  if (normalized.includes("secret-room")) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 3h10v18H7z" />
        <path d="M10 7h4" />
        <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (normalized.includes("secret-key")) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="8" cy="12" r="3" />
        <path d="M11 12h8" />
        <path d="M16 12v3" />
        <path d="M19 12v2" />
      </svg>
    );
  }

  if (normalized.includes("vehicle") || normalized.includes("route") || normalized.includes("glider")) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12 10V5" />
        <path d="M12 14l-4 3" />
        <path d="M12 14l4 3" />
      </svg>
    );
  }

  if (normalized.includes("hot") || normalized.includes("drop")) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none" aria-hidden>
        <path d="M12 2C9.3 5.6 6.2 8 6.2 12.4A5.8 5.8 0 0012 18.2a5.8 5.8 0 005.8-5.8c0-3.8-2.5-6.1-5.8-10.4zm0 7.3c1.5 1.7 2.5 2.9 2.5 4.3A2.5 2.5 0 019.5 13.6c0-1.3.8-2.4 2.5-4.3z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l6 6-6 12L6 9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

type MapCalibration = {
  xOffset: number;
  yOffset: number;
  xScale: number;
  yScale: number;
};

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

export function PubgMapOverlay({ map, isAdmin }: Props) {
  const [activeTypes, setActiveTypes] = useState<Record<string, boolean>>({
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
  const [newEntityType, setNewEntityType] = useState<string>("hot-drop");
  const [newEntityNotes, setNewEntityNotes] = useState("Added in admin editor");
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>(DEFAULT_CATEGORY_LABELS);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [newCategoryKey, setNewCategoryKey] = useState("");
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [categoriesDirty, setCategoriesDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [palette, setPalette] = useState<MarkerPalette>(DEFAULT_MARKER_COLORS);
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  const [mapImageUrl, setMapImageUrl] = useState(map.mapImage);
  const [lastLoadedMapUrl, setLastLoadedMapUrl] = useState(map.mapImage);

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

    const imported = pubgImportedMarkersBySlug[map.slug] ?? [];
    const base = [...map.markers, ...derived, ...destonKeys];
    const existing = new Set(base.map((m) => `${m.type}|${Math.round(m.x * 10)}|${Math.round(m.y * 10)}`));
    const extras = imported.filter((m) => {
      const key = `${m.type}|${Math.round(m.x * 10)}|${Math.round(m.y * 10)}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });

    return [...base, ...extras];
  }, [map.markers, map.secretRooms, map.slug]);

  const visibleMarkers = useMemo(
    () => editableMarkers.filter((m) => !hiddenCategories.includes(m.type) && activeTypes[m.type]),
    [editableMarkers, activeTypes, hiddenCategories]
  );

  const activeMarker = visibleMarkers.find((m) => m.id === activeMarkerId) ?? null;

  const categoryKeys = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(categoryLabels),
      ...Object.keys(palette),
      ...editableMarkers.map((m) => m.type),
    ]);
    return Array.from(keys)
      .filter((key) => Boolean(key) && !hiddenCategories.includes(key))
      .sort((a, b) => a.localeCompare(b));
  }, [categoryLabels, editableMarkers, hiddenCategories, palette]);

  useEffect(() => {
    setActiveTypes((prev) => {
      const next = { ...prev };
      for (const key of categoryKeys) {
        if (typeof next[key] === "undefined") next[key] = true;
      }
      return next;
    });
  }, [categoryKeys]);

  useEffect(() => {
    setCategoryLabels((prev) => {
      const next = { ...prev };
      for (const key of categoryKeys) {
        if (!next[key]) next[key] = DEFAULT_CATEGORY_LABELS[key] ?? humanizeCategory(key);
      }
      return next;
    });
  }, [categoryKeys]);

  useEffect(() => {
    setPalette((prev) => {
      const next = { ...prev };
      for (const key of categoryKeys) {
        if (!next[key]) next[key] = fallbackColorForCategory(key);
      }
      return next;
    });
  }, [categoryKeys]);

  const recomputeRenderBox = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return;
    setRenderBox(computeRenderBox(width, height, imageRatio));
  }, [imageRatio]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminMode(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const urlAdmin = params.get("admin") === "1";
    const savedAdmin = localStorage.getItem("pubg-map-admin-enabled") === "1";
    setAdminMode(urlAdmin || savedAdmin);
  }, [isAdmin]);

  useEffect(() => {
    setCalibration(getBaseCalibration(map.slug));
    setCapturedPoint(null);
    setEditableMarkers(mergedMarkers);
    setSaveStatus("idle");
    setCategoriesDirty(false);
    setPalette({});
    setCategoryLabels({});
    setHiddenCategories([]);
    setActiveTypes({});
    const storedTheme = localStorage.getItem(`pubg-map-theme-${map.slug}`);
    if (storedTheme === "dark" || storedTheme === "light") {
      setMapTheme(storedTheme);
    } else {
      setMapTheme("dark");
    }
    setMapImageUrl(map.mapImage);
    setLastLoadedMapUrl(map.mapImage);

    let cancelled = false;

    async function loadServerConfig() {
      try {
        const response = await fetch(`/api/pubg/map-config/${map.slug}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          calibration?: MapCalibration | null;
          entities?: PubgMapMarker[] | null;
          legendColors?: MarkerPalette | null;
          categoryLabels?: Record<string, string> | null;
          hiddenCategories?: string[] | null;
          mapTheme?: MapTheme | null;
          mapImageUrl?: string | null;
        };

        if (cancelled) return;

        if (payload.calibration) {
          setCalibration(payload.calibration);
        }

        if (payload.entities && payload.entities.length) {
          setEditableMarkers(payload.entities);
        }

        if (payload.legendColors) {
          setPalette(payload.legendColors);
        }

        if (payload.categoryLabels) {
          setCategoryLabels((prev) => ({ ...prev, ...payload.categoryLabels }));
        }

        if (Array.isArray(payload.hiddenCategories)) {
          setHiddenCategories(payload.hiddenCategories.filter(Boolean));
        }

        if (payload.mapTheme === "dark" || payload.mapTheme === "light") {
          setMapTheme(payload.mapTheme);
        }

        if (payload.mapImageUrl) {
          setMapImageUrl(payload.mapImageUrl);
          setLastLoadedMapUrl(payload.mapImageUrl);
        }
      } catch {
        // fall back to defaults if server config cannot be loaded
      }
    }

    void loadServerConfig();

    return () => {
      cancelled = true;
    };
  }, [map.slug, mergedMarkers]);

  useEffect(() => {
    localStorage.setItem(`pubg-map-theme-${map.slug}`, mapTheme);
  }, [map.slug, mapTheme]);

  useEffect(() => {
    markersRef.current = editableMarkers;
  }, [editableMarkers]);

  useEffect(() => {
    recomputeRenderBox();
  }, [recomputeRenderBox, zoom]);

  async function saveServerConfig(payload: {
    calibration?: MapCalibration | null;
    entities?: PubgMapMarker[] | null;
    legendColors?: MarkerPalette | null;
    categoryLabels?: Record<string, string> | null;
    hiddenCategories?: string[] | null;
    mapTheme?: MapTheme | null;
    mapImageUrl?: string | null;
  }) {
    setSaveStatus("saving");
    try {
      const response = await fetch(`/api/pubg/map-config/${map.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Map config save failed");
      }

      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1400);
      return true;
    } catch {
      setSaveStatus("error");
      return false;
    }
  }

  function persistCalibration(nextCalibration: MapCalibration) {
    setCalibration(nextCalibration);
    void saveServerConfig({ calibration: nextCalibration });
  }

  function persistEntities(nextMarkers: PubgMapMarker[]) {
    setEditableMarkers(nextMarkers);
    void saveServerConfig({ entities: nextMarkers });
  }

  function resetEntitiesToDefaults() {
    setEditableMarkers(mergedMarkers);
    setActiveMarkerId(null);
    void saveServerConfig({ entities: null });
  }

  function resetCalibration() {
    setCalibration(getBaseCalibration(map.slug));
    void saveServerConfig({ calibration: null });
  }

  function persistPalette(nextPalette: MarkerPalette) {
    setPalette(nextPalette);
    void saveServerConfig({ legendColors: nextPalette });
  }

  function saveCategoryConfiguration() {
    void saveServerConfig({ categoryLabels, legendColors: palette, hiddenCategories }).then((ok) => {
      if (ok) setCategoriesDirty(false);
    });
  }

  function resetPaletteToDefaults() {
    const next: MarkerPalette = {};
    for (const key of categoryKeys) {
      next[key] = DEFAULT_MARKER_COLORS[key] ?? fallbackColorForCategory(key);
    }
    setPalette(next);
    void saveServerConfig({ legendColors: next });
  }

  function persistMapTheme(nextTheme: MapTheme) {
    setMapTheme(nextTheme);
    void saveServerConfig({ mapTheme: nextTheme });
  }

  function saveMapImageOverride() {
    const next = mapImageUrl.trim();
    if (!next) {
      setMapImageUrl(map.mapImage);
      setLastLoadedMapUrl(map.mapImage);
      void saveServerConfig({ mapImageUrl: null });
      return;
    }

    setMapImageUrl(next);
    void saveServerConfig({ mapImageUrl: next });
  }

  function resetMapImageOverride() {
    setMapImageUrl(map.mapImage);
    setLastLoadedMapUrl(map.mapImage);
    void saveServerConfig({ mapImageUrl: null });
  }

  function getKnownResolutionVariant(slug: string, variant: "low" | "hq") {
    const base = slug.charAt(0).toUpperCase() + slug.slice(1);
    const ext = slug === "sanhok" || slug === "karakin" ? "jpg" : "png";
    const low = `/pubg/maps/${base}_Main_No_Text_Low_Res.${ext}`;
    const hq = `/pubg/maps/${base}_Main_No_Text_HQ.jpg`;
    return variant === "hq" ? hq : low;
  }

  function applyKnownMapResolution(variant: "low" | "hq") {
    const next = getKnownResolutionVariant(map.slug, variant);
    setMapImageUrl(next);
    void saveServerConfig({ mapImageUrl: next });
  }

  function guessHighResVariant(url: string) {
    if (url.includes("_Low_Res")) {
      return url
        .replace("_Low_Res", "_HQ")
        .replace(/\.png$/i, ".jpg")
        .replace(/\.jpeg$/i, ".jpg");
    }
    if (/\/image\/[^/]+\/map\.jpg$/i.test(url)) {
      // External map.jpg sources already appear to be full-size assets.
      return url;
    }
    return url.replace(/_low/i, "_hq");
  }

  function toggleAdminMode() {
    if (!isAdmin) return;
    setAdminMode((prev) => {
      const next = !prev;
      localStorage.setItem("pubg-map-admin-enabled", next ? "1" : "0");
      return next;
    });
  }

  const toggleType = (type: string) => {
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
        {categoryKeys.map((type) => {
          const label = categoryLabels[type] ?? humanizeCategory(type);
          const color = palette[type] ?? fallbackColorForCategory(type);
          const active = activeTypes[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className="flex items-center gap-1.5 border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-opacity"
              style={{
                borderColor: active ? color : "#2d2d2d",
                color: active ? "#e2d2af" : "#7f7768",
                opacity: active ? 1 : 0.45,
              }}
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full"
                style={{
                  border: `2px solid ${active ? color : "#444"}`,
                  background: "transparent",
                  color: active ? color : "#444",
                }}
              >
                <MarkerIcon type={type} className="h-[70%] w-[70%]" />
              </span>
              {label}
            </button>
          );
        })}

        {/* zoom controls */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMapTheme("light")}
            className="border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]"
            style={{
              borderColor: mapTheme === "light" ? "#f5c842" : "#3a3a3a",
              background: mapTheme === "light" ? "#2a2314" : "#1a1a1a",
              color: mapTheme === "light" ? "#f5c842" : "#c8bda0",
            }}
            title="Light map mode"
          >Light</button>
          <button
            type="button"
            onClick={() => setMapTheme("dark")}
            className="border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]"
            style={{
              borderColor: mapTheme === "dark" ? "#f5c842" : "#3a3a3a",
              background: mapTheme === "dark" ? "#2a2314" : "#1a1a1a",
              color: mapTheme === "dark" ? "#f5c842" : "#c8bda0",
            }}
            title="Dark map mode"
          >Dark</button>
          {isAdmin ? (
            <button
              type="button"
              onClick={toggleAdminMode}
              className="border border-[#3a3a3a] bg-[#1a1a1a] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[#c8bda0] hover:border-[#666] hover:text-white"
              title="Toggle admin pinpoint editor"
            >{adminMode ? "Admin On" : "Admin"}</button>
          ) : null}
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
        style={{
          cursor: dragging.current ? "grabbing" : "grab",
          background: mapTheme === "dark" ? "#070707" : "#d6d8db"
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onMapClick}
      >
        {/* header badge */}
        <div className="pointer-events-none absolute left-2 top-2 z-20 border px-2 py-1 text-[10px] uppercase tracking-[0.14em]"
          style={{
            borderColor: mapTheme === "dark" ? "#2d2d2d" : "#7a7f86",
            background: mapTheme === "dark" ? "rgba(17,17,17,0.9)" : "rgba(245,247,250,0.86)",
            color: mapTheme === "dark" ? "#7f7768" : "#384250"
          }}
        >
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
            src={mapImageUrl}
            alt={`${map.name} map`}
            className="h-full w-full object-contain select-none"
            style={{
              filter:
                mapTheme === "dark"
                  ? "brightness(0.72) contrast(1.05) saturate(0.9)"
                  : "brightness(1.06) contrast(1.02) saturate(1.08)",
            }}
            draggable={false}
            loading="eager"
            onError={() => {
              const fallback = lastLoadedMapUrl || map.mapImage;
              if (mapImageUrl !== fallback) setMapImageUrl(fallback);
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              setLastLoadedMapUrl(mapImageUrl);
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setImageRatio(img.naturalWidth / img.naturalHeight);
              }
              recomputeRenderBox();
            }}
          />

          {visibleMarkers.map((marker) => {
            const color = palette[marker.type] ?? fallbackColorForCategory(marker.type);
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
                  transform: `translate(-50%, -50%) ${isActive ? "scale(1.35)" : ""}`,
                  background: mapTheme === "dark" ? "rgba(8,8,8,0.16)" : "rgba(255,255,255,0.16)",
                  border: `2px solid ${color}`,
                  boxShadow: isActive
                    ? `0 0 0 2px ${mapTheme === "dark" ? "#fff" : "#101010"}, 0 0 10px 2px ${color}`
                    : `0 0 6px 1px ${color}66`,
                  zIndex: isActive ? 30 : 10,
                  color,
                }}
              >
                <MarkerIcon type={marker.type} className="h-[62%] w-[62%]" />
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

      {adminMode && (
        <div className="border border-[#3a3426] bg-[#14110b] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#d2b277]">Admin Pinpoint Editor (Global)</p>
          <p className="mt-1 text-xs text-[#a69475]">
            Tune calibration for {map.name}. Click anywhere on map to capture coordinates (copied to clipboard).
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#8f826a]">
            Save status: {saveStatus}
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

          <div className="mt-4 border-t border-[#2a2418] pt-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#8f826a]">Legend/Icon Color Groups</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {categoryKeys.map((type) => (
                <label key={`color-${type}`} className="flex items-center justify-between gap-3 text-xs text-[#b8aa90]">
                  <span>{categoryLabels[type] ?? humanizeCategory(type)}</span>
                  <input
                    type="color"
                    value={palette[type] ?? fallbackColorForCategory(type)}
                    onChange={(e) => setPalette((prev) => ({ ...prev, [type]: e.target.value }))}
                    className="h-8 w-10 border border-[#3a3426] bg-[#0e0c09]"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => persistPalette(palette)}
                className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
              >Save Colors</button>
              <button
                type="button"
                onClick={resetPaletteToDefaults}
                className="border border-[#3a3a3a] bg-[#1a1a1a] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-white"
              >Reset Colors</button>
            </div>
          </div>

          <div className="mt-4 border-t border-[#2a2418] pt-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#8f826a]">Category Manager</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                value={newCategoryKey}
                onChange={(e) => setNewCategoryKey(e.target.value)}
                className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
                placeholder="new category key (example: loot-route)"
              />
              <input
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
                placeholder="display label"
              />
              <button
                type="button"
                onClick={() => {
                  const key = sanitizeCategoryKey(newCategoryKey || newCategoryLabel);
                  if (!key) return;
                  const label = (newCategoryLabel || humanizeCategory(key)).trim();
                  const nextLabels = { ...categoryLabels, [key]: label };
                  const nextPalette = { ...palette, [key]: palette[key] ?? fallbackColorForCategory(key) };
                  setNewEntityType(key);
                  setNewCategoryKey("");
                  setNewCategoryLabel("");
                  setCategoryLabels(nextLabels);
                  setPalette(nextPalette);
                  setHiddenCategories((prev) => prev.filter((entry) => entry !== key));
                  setCategoriesDirty(true);
                }}
                className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
              >Add Category</button>
            </div>
            <div className="mt-2 space-y-2">
              {categoryKeys.map((type) => (
                <div key={`category-row-${type}`} className="grid gap-2 sm:grid-cols-[1fr,1fr,auto,auto] items-center">
                  <div className="text-xs text-[#8f826a]">{type}</div>
                  <input
                    value={categoryLabels[type] ?? humanizeCategory(type)}
                    onChange={(e) => {
                      setCategoryLabels((prev) => ({ ...prev, [type]: e.target.value }));
                      setCategoriesDirty(true);
                    }}
                    className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextLabels = { ...categoryLabels };
                      delete nextLabels[type];
                      const nextPalette = { ...palette };
                      delete nextPalette[type];
                      setCategoryLabels(nextLabels);
                      setPalette(nextPalette);
                      setHiddenCategories((prev) => (prev.includes(type) ? prev : [...prev, type]));
                      setCategoriesDirty(true);

                      setActiveTypes((prev) => {
                        const next = { ...prev };
                        delete next[type];
                        return next;
                      });
                      if (newEntityType === type) setNewEntityType("hot-drop");
                    }}
                    className="border border-[#5e2a2a] bg-[#1a1010] px-2 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[#e3b8b8] hover:border-[#d36a6a]"
                  >Remove</button>
                  <button
                    type="button"
                    onClick={() => setNewEntityType(type)}
                    className="border border-[#3a3a3a] bg-[#1a1a1a] px-2 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[#c8bda0] hover:border-[#666]"
                  >Use</button>
                </div>
              ))}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveCategoryConfiguration}
                  disabled={!categoriesDirty}
                  className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842] disabled:opacity-50"
                >Save Categories</button>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-[#2a2418] pt-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#8f826a]">Map Image Source</p>
            <p className="mt-1 text-xs text-[#8f826a]">Use a higher-resolution URL if available; fallback returns to default map texture.</p>
            <p className="mt-1 text-xs text-[#8f826a]">Map theme currently set to {mapTheme.toUpperCase()}.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <input
                value={mapImageUrl}
                onChange={(e) => setMapImageUrl(e.target.value)}
                className="sm:col-span-4 w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
                placeholder="/pubg/maps/Erangel_Main_No_Text_HQ.jpg"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveMapImageOverride}
                className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
              >Save Map Image</button>
              <button
                type="button"
                onClick={() => {
                  const next = guessHighResVariant(mapImageUrl || map.mapImage);
                  setMapImageUrl(next);
                  void saveServerConfig({ mapImageUrl: next });
                }}
                className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
              >Try High-Res Variant</button>
              <button
                type="button"
                onClick={() => applyKnownMapResolution("hq")}
                className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
              >Use Known HQ</button>
              <button
                type="button"
                onClick={() => applyKnownMapResolution("low")}
                className="border border-[#3a3a3a] bg-[#1a1a1a] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-white"
              >Use Known Low</button>
              <button
                type="button"
                onClick={resetMapImageOverride}
                className="border border-[#3a3a3a] bg-[#1a1a1a] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#9a9080] hover:border-[#666] hover:text-white"
              >Reset Map Image</button>
              <button
                type="button"
                onClick={() => persistMapTheme(mapTheme)}
                className="border border-[#6d5834] bg-[#20180e] px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[#e2d2af] hover:border-[#f5c842]"
              >Save Theme</button>
            </div>
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
              onChange={(e) => setNewEntityType(e.target.value)}
              className="w-full border border-[#3a3426] bg-[#0e0c09] px-2 py-1.5 text-xs text-[#e2d2af]"
            >
              {categoryKeys.map((type) => (
                <option key={type} value={type}>{categoryLabels[type] ?? humanizeCategory(type)}</option>
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

      {/* ── info panel ── */}
      <div className="border border-[#2d2d2d] bg-[#111] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[#9a9080]">Marker Intel</p>
        {activeMarker ? (
          <div className="mt-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
              style={{
                border: `2px solid ${palette[activeMarker.type] ?? fallbackColorForCategory(activeMarker.type)}`,
                background: "transparent",
                color: palette[activeMarker.type] ?? fallbackColorForCategory(activeMarker.type)
              }}
            >
              <MarkerIcon type={activeMarker.type} className="h-[70%] w-[70%]" />
            </span>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#e2d2af]">
                {activeMarker.label}
              </p>
            </div>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#9a9080]">
              {categoryLabels[activeMarker.type] ?? humanizeCategory(activeMarker.type)}
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
