'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type {
  IvoMapFacets,
  MapListingPoint,
  MapRegionSummary,
} from '../lib/ivoMapListings';
import IvoCompsPanel from './IvoCompsPanel';

type Props = {
  onNavigate: (tabId: string) => void;
};

type LayerMode = 'pin' | 'heat-density' | 'heat-price';
type StatusFilter = 'satilik' | 'kiralik' | 'pasif';
type BaseMap = 'street' | 'satellite' | 'terrain';
type ColorMode = 'status' | 'signal';
type SavedArea = {
  id: string;
  name: string;
  ring: number[][]; // [lng,lat][]
};

const COLORS = {
  satilik: '#2563eb',
  kiralik: '#ca8a04',
  pasif: '#9ca3af',
  fsbo: '#16a34a',
  dusen: '#dc2626',
  artan: '#7c3aed',
} as const;

const DEFAULT = { lat: 38.446, lng: 27.206 };
const SAVED_KEY = 'zebra-map-saved-areas';

const TILES: Record<
  BaseMap,
  { url: string; attribution: string; maxZoom: number }
> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap, SRTM | OpenTopoMap',
    maxZoom: 17,
  },
};

function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('tr-TR').format(Math.round(n))} ₺`;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

function pointKind(p: MapListingPoint): StatusFilter {
  if (!p.isActive) return 'pasif';
  const s = (p.status || '').toLocaleLowerCase('tr-TR');
  if (s.includes('kira')) return 'kiralik';
  return 'satilik';
}

function isFsbo(p: MapListingPoint): boolean {
  const w = (p.whom || '').toLocaleLowerCase('tr-TR');
  return w.includes('sahibinden') || w.includes('fsbo');
}

function pointColor(p: MapListingPoint, mode: ColorMode): string {
  if (mode === 'signal') {
    if (!p.isActive) return COLORS.pasif;
    if (isFsbo(p)) return COLORS.fsbo;
    if (p.priceDelta != null && p.priceDelta < 0) return COLORS.dusen;
    if (p.priceDelta != null && p.priceDelta > 0) return COLORS.artan;
    return COLORS.satilik;
  }
  return COLORS[pointKind(p)];
}

function loadSavedAreas(): SavedArea[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedArea[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type PlaceHit = { label: string; lat: number; lng: number };

export default function IvoMapStudio({ onNavigate }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const radiusCircleRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysisLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const HeatLayerRef = useRef<any>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeAbort = useRef<AbortController | null>(null);
  const pickAnalysisRef = useRef(false);
  const drawModeRef = useRef(false);
  const drawRingRef = useRef<number[][]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'live' | 'db' | 'mixed' | null>(null);
  const [points, setPoints] = useState<MapListingPoint[]>([]);
  const [radiusM, setRadiusM] = useState(1200);
  const [radiusOn, setRadiusOn] = useState(true);
  const [compsNo, setCompsNo] = useState<string | null>(null);
  const [center, setCenter] = useState(DEFAULT);
  const [layerMode, setLayerMode] = useState<LayerMode>('pin');
  const [baseMap, setBaseMap] = useState<BaseMap>('street');
  const [colorMode, setColorMode] = useState<ColorMode>('status');
  const [filters, setFilters] = useState<Record<StatusFilter, boolean>>({
    satilik: true,
    kiralik: true,
    pasif: true,
  });
  const [facetStatus, setFacetStatus] = useState<string[]>([]);
  const [facetRooms, setFacetRooms] = useState<string[]>([]);
  const [facetKind, setFacetKind] = useState<string[]>([]);
  const [facetWhom, setFacetWhom] = useState<string[]>([]);
  const [facets, setFacets] = useState<IvoMapFacets>({});
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [summary, setSummary] = useState<MapRegionSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showList, setShowList] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [placeLabel, setPlaceLabel] = useState('Bornova');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  // Analiz noktası
  const [analysisPoint, setAnalysisPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [analysisRadius, setAnalysisRadius] = useState<500 | 1000>(1000);
  const [pickAnalysis, setPickAnalysis] = useState(false);

  // Alan çiz
  const [drawMode, setDrawMode] = useState(false);
  const [drawRing, setDrawRing] = useState<number[][]>([]);
  const [activePolygon, setActivePolygon] = useState<number[][] | null>(null);
  const [savedAreas, setSavedAreas] = useState<SavedArea[]>([]);

  useEffect(() => {
    setSavedAreas(loadSavedAreas());
  }, []);

  useEffect(() => {
    pickAnalysisRef.current = pickAnalysis;
  }, [pickAnalysis]);
  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);
  useEffect(() => {
    drawRingRef.current = drawRing;
  }, [drawRing]);

  const visiblePoints = useMemo(() => {
    const pMin = priceMin.trim() ? Number(priceMin.replace(/\./g, '')) : null;
    const pMax = priceMax.trim() ? Number(priceMax.replace(/\./g, '')) : null;
    return points.filter((p) => {
      if (!filters[pointKind(p)]) return false;
      if (
        pMin != null &&
        Number.isFinite(pMin) &&
        (p.price == null || p.price < pMin)
      )
        return false;
      if (
        pMax != null &&
        Number.isFinite(pMax) &&
        (p.price == null || p.price > pMax)
      )
        return false;
      return true;
    });
  }, [points, filters, priceMin, priceMax]);

  const localStats = useMemo(
    () => ({
      count: visiblePoints.length,
      satilik: visiblePoints.filter((p) => pointKind(p) === 'satilik').length,
      kiralik: visiblePoints.filter((p) => pointKind(p) === 'kiralik').length,
      pasif: visiblePoints.filter((p) => pointKind(p) === 'pasif').length,
    }),
    [visiblePoints]
  );

  const topRoom = useMemo(() => {
    const rooms = (facets.rooms || []) as Array<{
      value: string | boolean | number;
      count: number;
    }>;
    if (!rooms.length) return null;
    const top = [...rooms].sort((a, b) => b.count - a.count)[0];
    return top ? { value: String(top.value), count: top.count } : null;
  }, [facets]);

  const listSorted = useMemo(
    () => [...visiblePoints].sort((a, b) => (b.price || 0) - (a.price || 0)),
    [visiblePoints]
  );

  const currentBounds = useCallback((): {
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  } | null => {
    const map = mapRef.current;
    if (!map) return null;
    const b = map.getBounds();
    return {
      swLat: b.getSouthWest().lat,
      swLng: b.getSouthWest().lng,
      neLat: b.getNorthEast().lat,
      neLng: b.getNorthEast().lng,
    };
  }, []);

  const buildQs = useCallback(
    (
      view: string,
      c: { lat: number; lng: number },
      r: number,
      opts?: {
        radiusEnabled?: boolean;
        polygon?: number[][] | null;
        analysis?: boolean;
      }
    ) => {
      const qs = new URLSearchParams({
        view,
        lat: String(c.lat),
        lng: String(c.lng),
        radiusM: String(r),
        limit: '150',
      });
      const poly = opts?.polygon ?? activePolygon;
      if (poly && poly.length >= 3) {
        qs.set('mode', 'polygon');
        qs.set('polygon', JSON.stringify(poly));
      } else if (opts?.radiusEnabled ?? radiusOn) {
        qs.set('mode', 'radius');
      } else {
        const b = currentBounds();
        if (b) {
          qs.set('mode', 'bbox');
          qs.set('swLat', String(b.swLat));
          qs.set('swLng', String(b.swLng));
          qs.set('neLat', String(b.neLat));
          qs.set('neLng', String(b.neLng));
        } else {
          qs.set('mode', 'radius');
        }
      }
      if (facetStatus.length) qs.set('status', facetStatus.join(','));
      if (facetRooms.length) qs.set('rooms', facetRooms.join(','));
      if (facetKind.length) qs.set('kind', facetKind.join(','));
      if (facetWhom.length) qs.set('whom', facetWhom.join(','));
      return qs;
    },
    [
      activePolygon,
      radiusOn,
      currentBounds,
      facetStatus,
      facetRooms,
      facetKind,
      facetWhom,
    ]
  );

  const loadPoints = useCallback(
    async (
      c: { lat: number; lng: number },
      r: number,
      opts?: { radiusEnabled?: boolean; polygon?: number[][] | null }
    ) => {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQs('map', c, r, opts);
        const res = await fetch(`/api/ivo/listings?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Harita yüklenemedi');
        setPoints(json.points || []);
        setSource(json.source || null);
        if (json.error) setError(json.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Harita yüklenemedi');
        setPoints([]);
      } finally {
        setLoading(false);
      }
    },
    [buildQs]
  );

  const loadSummary = useCallback(
    async (
      c: { lat: number; lng: number },
      r: number,
      opts?: { radiusEnabled?: boolean; polygon?: number[][] | null }
    ) => {
      setSummaryError(null);
      try {
        const qs = buildQs('map-summary', c, r, opts);
        const res = await fetch(`/api/ivo/listings?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Özet alınamadı');
        setSummary(json.summary || null);
        if (json.error) setSummaryError(json.error);
      } catch (e) {
        setSummary(null);
        setSummaryError(
          e instanceof Error ? e.message : 'Bölge özeti alınamadı'
        );
      }
    },
    [buildQs]
  );

  const loadFacets = useCallback(
    async (c: { lat: number; lng: number }, r: number) => {
      try {
        const qs = buildQs('map-facets', c, r);
        const res = await fetch(`/api/ivo/listings?${qs.toString()}`);
        const json = await res.json();
        if (res.ok) setFacets(json.facets || {});
      } catch {
        /* ignore */
      }
    },
    [buildQs]
  );

  const scanHere = useCallback(
    (alsoSummary: boolean) => {
      const map = mapRef.current;
      const c = map
        ? { lat: map.getCenter().lat, lng: map.getCenter().lng }
        : center;
      setCenter(c);
      void loadPoints(c, radiusM);
      void loadFacets(c, radiusM);
      if (alsoSummary || showAnalysis) void loadSummary(c, radiusM);
    },
    [center, radiusM, loadPoints, loadSummary, loadFacets, showAnalysis]
  );

  const runPointAnalysis = useCallback(() => {
    const pt = analysisPoint || center;
    setShowAnalysis(true);
    void loadSummary(pt, analysisRadius, {
      radiusEnabled: true,
      polygon: null,
    });
    void loadPoints(pt, analysisRadius, {
      radiusEnabled: true,
      polygon: null,
    });
    void loadFacets(pt, analysisRadius);
  }, [
    analysisPoint,
    center,
    analysisRadius,
    loadSummary,
    loadPoints,
    loadFacets,
  ]);

  const updateRadiusCircle = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (radiusCircleRef.current) {
      map.removeLayer(radiusCircleRef.current);
      radiusCircleRef.current = null;
    }
    if (!radiusOn || activePolygon) return;
    const c = map.getCenter();
    radiusCircleRef.current = L.circle([c.lat, c.lng], {
      radius: radiusM,
      color: '#2563eb',
      weight: 1.5,
      fillColor: '#2563eb',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(map);
  }, [radiusOn, radiusM, activePolygon]);

  const updateAnalysisLayer = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (analysisLayerRef.current) {
      map.removeLayer(analysisLayerRef.current);
      analysisLayerRef.current = null;
    }
    if (!analysisPoint) return;
    const g = L.layerGroup().addTo(map);
    L.circleMarker([analysisPoint.lat, analysisPoint.lng], {
      radius: 8,
      color: '#111',
      fillColor: '#f59e0b',
      fillOpacity: 1,
      weight: 2,
    }).addTo(g);
    L.circle([analysisPoint.lat, analysisPoint.lng], {
      radius: analysisRadius,
      color: '#f59e0b',
      weight: 2,
      dashArray: '6 4',
      fillColor: '#f59e0b',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(g);
    analysisLayerRef.current = g;
  }, [analysisPoint, analysisRadius]);

  const updateDrawLayer = useCallback(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (drawLayerRef.current) {
      map.removeLayer(drawLayerRef.current);
      drawLayerRef.current = null;
    }
    const g = L.layerGroup().addTo(map);
    const ring = activePolygon || drawRing;
    if (ring.length) {
      const latlngs = ring.map((c) => [c[1], c[0]] as [number, number]);
      for (const ll of latlngs) {
        L.circleMarker(ll, {
          radius: 4,
          color: '#0f766e',
          fillColor: '#14b8a6',
          fillOpacity: 1,
        }).addTo(g);
      }
      if (latlngs.length >= 2) {
        L.polyline(latlngs, { color: '#0f766e', weight: 2 }).addTo(g);
      }
      if (activePolygon && latlngs.length >= 3) {
        L.polygon(latlngs, {
          color: '#0f766e',
          weight: 2,
          fillColor: '#14b8a6',
          fillOpacity: 0.12,
        }).addTo(g);
      }
    }
    drawLayerRef.current = g;
  }, [drawRing, activePolygon]);

  // Init
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!mapEl.current || mapRef.current) return;
      const L = (await import('leaflet')).default;
      const { HeatLayer } = await import('leaflet.heat');
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      HeatLayerRef.current = HeatLayer;

      // @ts-expect-error leaflet icon hack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapEl.current, {
        center: [DEFAULT.lat, DEFAULT.lng],
        zoom: 14,
        zoomControl: true,
      });
      const t = TILES.street;
      tileRef.current = L.tileLayer(t.url, {
        attribution: t.attribution,
        maxZoom: t.maxZoom,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        if (pickAnalysisRef.current) {
          setAnalysisPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
          setPickAnalysis(false);
          return;
        }
        if (drawModeRef.current) {
          const next = [
            ...drawRingRef.current,
            [e.latlng.lng, e.latlng.lat],
          ];
          setDrawRing(next);
          drawRingRef.current = next;
        }
      });

      map.on('dblclick', (e: { originalEvent: Event }) => {
        if (!drawModeRef.current) return;
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        const ring = drawRingRef.current;
        if (ring.length >= 3) {
          setActivePolygon(ring);
          setDrawMode(false);
          setDrawRing([]);
          const c = {
            lat: ring.reduce((s, p) => s + p[1], 0) / ring.length,
            lng: ring.reduce((s, p) => s + p[0], 0) / ring.length,
          };
          void loadPoints(c, radiusM, { polygon: ring });
          void loadSummary(c, radiusM, { polygon: ring });
          void loadFacets(c, radiusM);
        }
      });

      void loadPoints(DEFAULT, radiusM, { radiusEnabled: true });
      void loadSummary(DEFAULT, radiusM, { radiusEnabled: true });
      void loadFacets(DEFAULT, radiusM);
    })();

    return () => {
      cancelled = true;
      if (scanTimer.current) clearTimeout(scanTimer.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      HeatLayerRef.current = null;
      LRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const t = TILES[baseMap];
    tileRef.current = L.tileLayer(t.url, {
      attribution: t.attribution,
      maxZoom: t.maxZoom,
    }).addTo(map);
  }, [baseMap, mapReady]);

  useEffect(() => {
    updateRadiusCircle();
  }, [updateRadiusCircle, mapReady, center]);

  useEffect(() => {
    updateAnalysisLayer();
  }, [updateAnalysisLayer, mapReady]);

  useEffect(() => {
    updateDrawLayer();
  }, [updateDrawLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
      if (!autoScan || activePolygon || pickAnalysis || drawMode) return;
      if (scanTimer.current) clearTimeout(scanTimer.current);
      scanTimer.current = setTimeout(() => {
        void loadPoints({ lat: c.lat, lng: c.lng }, radiusM);
        void loadFacets({ lat: c.lat, lng: c.lng }, radiusM);
      }, 900);
    };
    map.off('moveend');
    map.on('moveend', handler);
    return () => {
      map.off('moveend', handler);
    };
  }, [
    autoScan,
    radiusM,
    loadPoints,
    loadFacets,
    radiusOn,
    activePolygon,
    pickAnalysis,
    drawMode,
  ]);

  // Draw pins / heat
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (layerRef.current) {
      layerRef.current.clearLayers();
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }

    if (layerMode === 'pin') {
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      for (const p of visiblePoints) {
        const color = pointColor(p, colorMode);
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 1,
        });
        const signal =
          colorMode === 'signal'
            ? isFsbo(p)
              ? 'FSBO'
              : p.priceDelta != null && p.priceDelta < 0
                ? 'Fiyat düştü'
                : p.priceDelta != null && p.priceDelta > 0
                  ? 'Fiyat arttı'
                  : ''
            : '';
        const html = `
          <div style="min-width:180px;font:12px/1.4 system-ui,sans-serif">
            <strong>${(p.title || '#' + p.listingNo).replace(/</g, '')}</strong>
            <div style="margin-top:4px">${formatPrice(p.price)}</div>
            <div style="color:#666;margin-top:2px">${[p.status, p.rooms, p.kind, p.whom, signal].filter(Boolean).join(' · ')}</div>
            <div style="margin-top:6px;display:flex;gap:8px">
              <a href="https://www.sahibinden.com/ilan/${p.listingNo}" target="_blank" rel="noreferrer">İlan</a>
              <button type="button" data-comps="${p.listingNo}" style="cursor:pointer;border:0;background:none;padding:0;text-decoration:underline;color:inherit">Emsaller</button>
            </div>
          </div>`;
        marker.bindPopup(html);
        marker.on('popupopen', () => {
          const el = document.querySelector(
            `button[data-comps="${p.listingNo}"]`
          );
          if (el) {
            el.addEventListener(
              'click',
              () => setCompsNo(p.listingNo),
              { once: true }
            );
          }
        });
        marker.addTo(layer);
      }
      return;
    }

    const prices = visiblePoints
      .map((p) => p.price)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const minP = prices.length ? Math.min(...prices) : 0;
    const maxP = prices.length ? Math.max(...prices) : 1;
    const span = Math.max(maxP - minP, 1);
    const heatData = visiblePoints.map((p) => {
      let intensity = 0.65;
      if (layerMode === 'heat-price' && p.price != null) {
        intensity = 0.2 + (0.8 * (p.price - minP)) / span;
      }
      return [p.lat, p.lng, intensity] as [number, number, number];
    });
    const HeatLayer = HeatLayerRef.current;
    if (!HeatLayer) return;
    const heatLayer = new HeatLayer(heatData, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      minOpacity: 0.35,
    });
    heatLayer.addTo(map);
    heatRef.current = heatLayer;
  }, [visiblePoints, layerMode, mapReady, colorMode]);

  // Place search
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setPlaceHits([]);
      return;
    }
    if (placeAbort.current) placeAbort.current.abort();
    const ac = new AbortController();
    placeAbort.current = ac;
    const t = setTimeout(() => {
      void (async () => {
        setPlaceLoading(true);
        try {
          const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=tr&countryCode=TR`;
          const res = await fetch(url, { signal: ac.signal });
          if (!res.ok) throw new Error('Arama başarısız');
          const data = await res.json();
          const hits: PlaceHit[] = (data?.results || [])
            .filter(
              (r: { latitude?: number; longitude?: number }) =>
                r.latitude != null && r.longitude != null
            )
            .map(
              (r: {
                name?: string;
                admin1?: string;
                admin2?: string;
                latitude: number;
                longitude: number;
              }) => ({
                label: [r.name, r.admin2, r.admin1].filter(Boolean).join(', '),
                lat: Number(r.latitude),
                lng: Number(r.longitude),
              })
            );
          setPlaceHits(hits);
          setPlaceOpen(true);
        } catch (e) {
          if ((e as Error).name !== 'AbortError') setPlaceHits([]);
        } finally {
          setPlaceLoading(false);
        }
      })();
    }, 320);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [placeQuery]);

  // Re-scan when server facet chips change
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const c = map
      ? { lat: map.getCenter().lat, lng: map.getCenter().lng }
      : center;
    void loadPoints(c, radiusM);
    void loadFacets(c, radiusM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetStatus, facetRooms, facetKind, facetWhom]);

  const goToPlace = (hit: PlaceHit) => {
    setPlaceLabel(hit.label.split(',')[0] || hit.label);
    setPlaceQuery('');
    setPlaceHits([]);
    setPlaceOpen(false);
    setActivePolygon(null);
    mapRef.current?.setView([hit.lat, hit.lng], Math.max(mapRef.current.getZoom(), 14));
    setCenter({ lat: hit.lat, lng: hit.lng });
    void loadPoints({ lat: hit.lat, lng: hit.lng }, radiusM);
    void loadSummary({ lat: hit.lat, lng: hit.lng }, radiusM);
    void loadFacets({ lat: hit.lat, lng: hit.lng }, radiusM);
  };

  const goMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Tarayıcı konum desteklemiyor');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPlaceLabel('Konumum');
        setActivePolygon(null);
        mapRef.current?.setView([c.lat, c.lng], 15);
        setCenter(c);
        void loadPoints(c, radiusM);
        void loadSummary(c, radiusM);
        void loadFacets(c, radiusM);
        setLocating(false);
      },
      () => {
        setError('Konum alınamadı — izin verildi mi?');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const toggleFilter = (key: StatusFilter) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  const toggleFacet = (
    list: string[],
    setList: (v: string[]) => void,
    value: string
  ) => {
    setList(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
    );
  };

  const cycleBaseMap = () => {
    setBaseMap((b) =>
      b === 'street' ? 'satellite' : b === 'satellite' ? 'terrain' : 'street'
    );
  };

  const baseMapLabel =
    baseMap === 'street' ? 'Sokak' : baseMap === 'satellite' ? 'Uydu' : 'Arazi';

  const finishPolygon = () => {
    if (drawRing.length < 3) return;
    setActivePolygon(drawRing);
    setDrawMode(false);
    const ring = drawRing;
    setDrawRing([]);
    const c = {
      lat: ring.reduce((s, p) => s + p[1], 0) / ring.length,
      lng: ring.reduce((s, p) => s + p[0], 0) / ring.length,
    };
    void loadPoints(c, radiusM, { polygon: ring });
    void loadSummary(c, radiusM, { polygon: ring });
    void loadFacets(c, radiusM);
  };

  const saveCurrentPolygon = () => {
    if (!activePolygon || activePolygon.length < 3) return;
    const name =
      window.prompt('Alan adı', `Alan ${savedAreas.length + 1}`) ||
      `Alan ${savedAreas.length + 1}`;
    const next = [
      ...savedAreas,
      { id: String(Date.now()), name, ring: activePolygon },
    ];
    setSavedAreas(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  const loadSaved = (area: SavedArea) => {
    setActivePolygon(area.ring);
    setDrawMode(false);
    setDrawRing([]);
    const c = {
      lat: area.ring.reduce((s, p) => s + p[1], 0) / area.ring.length,
      lng: area.ring.reduce((s, p) => s + p[0], 0) / area.ring.length,
    };
    mapRef.current?.setView([c.lat, c.lng], 14);
    void loadPoints(c, radiusM, { polygon: area.ring });
    void loadSummary(c, radiusM, { polygon: area.ring });
    void loadFacets(c, radiusM);
  };

  const deleteSaved = (id: string) => {
    const next = savedAreas.filter((a) => a.id !== id);
    setSavedAreas(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  const pasifAktif =
    summary?.aktif != null && summary?.pasif != null && summary.aktif > 0
      ? summary.pasif / summary.aktif
      : null;

  const facetChips = (
    key: string,
    selected: string[],
    setSelected: (v: string[]) => void,
    limit = 8
  ) => {
    const buckets = (facets[key] || [])
      .map((b) => ({ value: String(b.value), count: b.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    if (!buckets.length) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {buckets.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => toggleFacet(selected, setSelected, b.value)}
            className={`px-2 py-1 text-[11px] rounded-lg border ${
              selected.includes(b.value)
                ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)]'
                : 'border-[var(--z-border)] text-[var(--z-muted)]'
            }`}
          >
            {b.value}{' '}
            <span className="tabular-nums opacity-70">{b.count}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
          Harita
        </h1>
        <p className="mt-1 text-[14px] text-[var(--z-muted)]">
          IVO harita — nokta analiz, facet, alan çiz, sinyal renkleri
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ivo-ofis', 'Ofis ilanları'],
            ['ivo-harita', 'Harita'],
            ['ivo-ilan-takibi', 'İlan takibi'],
            ['ivo-fsbo', 'FSBO'],
            ['ivo-ilanlar', 'Son ilanlar'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className="z-btn-ghost px-3 py-1.5 text-[12px]"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setShowFilters((v) => !v);
            setShowTools(false);
          }}
          className={`z-btn-ghost px-3 h-9 text-[12px] ${showFilters ? 'bg-[var(--z-hover)]' : ''}`}
        >
          Filtrele
        </button>

        <div className="relative min-w-[160px] flex-1 max-w-sm">
          <input
            type="search"
            className="z-field h-9 w-full rounded-full px-4 text-[13px]"
            placeholder={placeLabel || 'Yer ara…'}
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            onFocus={() => placeHits.length && setPlaceOpen(true)}
            aria-label="Yer ara"
          />
          {placeLoading ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--z-muted)]">
              …
            </span>
          ) : null}
          {placeOpen && placeHits.length > 0 ? (
            <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-[700] max-h-56 overflow-auto rounded-xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)] py-1 shadow-lg">
              {placeHits.map((h) => (
                <li key={`${h.lat}-${h.lng}-${h.label}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--z-hover)]"
                    onClick={() => goToPlace(h)}
                  >
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          onClick={goMyLocation}
          className="z-btn-ghost px-3 h-9 text-[12px]"
          disabled={locating}
        >
          {locating ? '…' : 'Konumum'}
        </button>
        <button
          type="button"
          onClick={cycleBaseMap}
          className="z-btn-ghost px-3 h-9 text-[12px]"
        >
          {baseMapLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowAnalysis(true);
            if (!analysisPoint) {
              setPickAnalysis(true);
              setDrawMode(false);
            }
          }}
          className="z-btn-ghost px-3 h-9 text-[12px]"
        >
          Bölge analizi
        </button>
        <button
          type="button"
          onClick={() => {
            setShowTools((v) => !v);
            setShowFilters(false);
          }}
          className="z-btn-primary px-3 h-9 text-[12px]"
        >
          Araçlar
        </button>
      </div>

      {pickAnalysis ? (
        <p className="text-[12px] text-amber-700">
          Haritaya tıklayarak analiz noktası seç…
        </p>
      ) : null}
      {drawMode ? (
        <p className="text-[12px] text-teal-700">
          Köşe eklemek için tıkla · bitirmek için çift tık veya “Bitir”
          {drawRing.length ? ` (${drawRing.length} nokta)` : ''}
        </p>
      ) : null}

      {showFilters ? (
        <div className="rounded-xl border border-[var(--z-border)] bg-[var(--z-bg-soft,#fafafa)] p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[12px] text-[var(--z-muted)]">Durum (pin)</span>
            {(
              [
                ['satilik', 'Satılık', COLORS.satilik],
                ['kiralik', 'Kiralık', COLORS.kiralik],
                ['pasif', 'Pasif', COLORS.pasif],
              ] as const
            ).map(([id, label, color]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleFilter(id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-lg border ${
                  filters[id]
                    ? 'border-[var(--z-border-strong)]'
                    : 'border-[var(--z-border)] opacity-45'
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-[12px] text-[var(--z-muted)]">
              Sunucu filtreleri (facet)
            </p>
            <p className="text-[11px] text-[var(--z-muted)]">Status</p>
            {facetChips('status', facetStatus, setFacetStatus)}
            <p className="text-[11px] text-[var(--z-muted)] mt-2">Oda</p>
            {facetChips('rooms', facetRooms, setFacetRooms, 10)}
            <p className="text-[11px] text-[var(--z-muted)] mt-2">Tür</p>
            {facetChips('kind', facetKind, setFacetKind)}
            <p className="text-[11px] text-[var(--z-muted)] mt-2">Kimden</p>
            {facetChips('whom', facetWhom, setFacetWhom)}
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[12px] text-[var(--z-muted)]">
              Min fiyat
              <input
                className="z-field mt-1 h-9 w-28 px-2 text-[12px] block"
                inputMode="numeric"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
            </label>
            <label className="text-[12px] text-[var(--z-muted)]">
              Max fiyat
              <input
                className="z-field mt-1 h-9 w-28 px-2 text-[12px] block"
                inputMode="numeric"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="z-btn-ghost h-9 px-3 text-[12px]"
              onClick={() => {
                setPriceMin('');
                setPriceMax('');
                setFilters({ satilik: true, kiralik: true, pasif: true });
                setFacetStatus([]);
                setFacetRooms([]);
                setFacetKind([]);
                setFacetWhom([]);
              }}
            >
              Temizle
            </button>
          </div>
        </div>
      ) : null}

      {showTools ? (
        <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-[var(--z-muted)]">Katman</span>
            {(
              [
                ['pin', 'Pin'],
                ['heat-density', 'Isı — yoğunluk'],
                ['heat-price', 'Isı — fiyat'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayerMode(id)}
                className={`px-3 py-1.5 text-[12px] rounded-lg border ${
                  layerMode === id
                    ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)]'
                    : 'border-[var(--z-border)] text-[var(--z-muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-[var(--z-muted)]">Renk</span>
            <button
              type="button"
              onClick={() => setColorMode('status')}
              className={`px-3 py-1.5 text-[12px] rounded-lg border ${
                colorMode === 'status'
                  ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)]'
                  : 'border-[var(--z-border)] text-[var(--z-muted)]'
              }`}
            >
              Satılık/Kiralık
            </button>
            <button
              type="button"
              onClick={() => setColorMode('signal')}
              className={`px-3 py-1.5 text-[12px] rounded-lg border ${
                colorMode === 'signal'
                  ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)]'
                  : 'border-[var(--z-border)] text-[var(--z-muted)]'
              }`}
            >
              FSBO / fiyat değişimi
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[12px]">
              <span className="text-[var(--z-muted)]">Yarıçap</span>
              <button
                type="button"
                role="switch"
                aria-checked={radiusOn}
                onClick={() => {
                  const next = !radiusOn;
                  setRadiusOn(next);
                  if (activePolygon) return;
                  const map = mapRef.current;
                  const c = map
                    ? { lat: map.getCenter().lat, lng: map.getCenter().lng }
                    : center;
                  void loadPoints(c, radiusM, { radiusEnabled: next });
                }}
                className={`relative h-6 w-11 rounded-full ${
                  radiusOn ? 'bg-blue-600' : 'bg-[var(--z-border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    radiusOn ? 'translate-x-5' : ''
                  }`}
                />
              </button>
              <span className="text-[var(--z-muted)]">
                {radiusOn ? 'Açık' : 'Kapalı'}
              </span>
            </label>
            {radiusOn && !activePolygon ? (
              <select
                className="z-field h-9 px-2 text-[12px]"
                value={radiusM}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  setRadiusM(r);
                  const map = mapRef.current;
                  const c = map
                    ? { lat: map.getCenter().lat, lng: map.getCenter().lng }
                    : center;
                  void loadPoints(c, r, { radiusEnabled: true });
                }}
              >
                <option value={800}>800 m</option>
                <option value={1200}>1.2 km</option>
                <option value={1800}>1.8 km</option>
                <option value={2500}>2.5 km</option>
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => scanHere(true)}
              className="z-btn-primary px-3 h-9 text-[12px]"
              disabled={loading}
            >
              {loading ? '…' : 'Bu alanı tara'}
            </button>
            <label className="flex items-center gap-1.5 text-[12px] text-[var(--z-muted)]">
              <input
                type="checkbox"
                checked={autoScan}
                onChange={(e) => setAutoScan(e.target.checked)}
              />
              Otomatik tara
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--z-border)] pt-3">
            <span className="text-[12px] text-[var(--z-muted)]">Alan</span>
            <button
              type="button"
              className={`z-btn-ghost px-3 h-9 text-[12px] ${drawMode ? 'bg-[var(--z-hover)]' : ''}`}
              onClick={() => {
                setDrawMode((v) => !v);
                setPickAnalysis(false);
                if (!drawMode) {
                  setDrawRing([]);
                  setActivePolygon(null);
                }
              }}
            >
              Alan çiz
            </button>
            {drawMode ? (
              <>
                <button
                  type="button"
                  className="z-btn-primary px-3 h-9 text-[12px]"
                  disabled={drawRing.length < 3}
                  onClick={finishPolygon}
                >
                  Bitir
                </button>
                <button
                  type="button"
                  className="z-btn-ghost px-3 h-9 text-[12px]"
                  onClick={() => {
                    setDrawRing([]);
                    setDrawMode(false);
                  }}
                >
                  İptal
                </button>
              </>
            ) : null}
            {activePolygon ? (
              <>
                <button
                  type="button"
                  className="z-btn-ghost px-3 h-9 text-[12px]"
                  onClick={saveCurrentPolygon}
                >
                  Alanı kaydet
                </button>
                <button
                  type="button"
                  className="z-btn-ghost px-3 h-9 text-[12px]"
                  onClick={() => {
                    setActivePolygon(null);
                    scanHere(true);
                  }}
                >
                  Alanı kaldır
                </button>
              </>
            ) : null}
          </div>

          {savedAreas.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--z-muted)]">
                Kayıtlı alanlarım
              </p>
              <ul className="space-y-1">
                {savedAreas.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <button
                      type="button"
                      className="underline text-left"
                      onClick={() => loadSaved(a)}
                    >
                      {a.name}
                    </button>
                    <button
                      type="button"
                      className="text-[var(--z-muted)]"
                      onClick={() => deleteSaved(a.id)}
                    >
                      Sil
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {colorMode === 'status' ? (
            <>
              {(
                [
                  ['satilik', 'Satılık', COLORS.satilik],
                  ['kiralik', 'Kiralık', COLORS.kiralik],
                  ['pasif', 'Pasif', COLORS.pasif],
                ] as const
              ).map(([id, label, color]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleFilter(id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-lg border ${
                    filters[id]
                      ? 'border-[var(--z-border-strong)]'
                      : 'border-[var(--z-border)] opacity-45'
                  }`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  {label}
                  <span className="tabular-nums text-[var(--z-muted)]">
                    {localStats[id]}
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              {(
                [
                  ['FSBO', COLORS.fsbo],
                  ['Fiyat düştü', COLORS.dusen],
                  ['Fiyat arttı', COLORS.artan],
                  ['Diğer', COLORS.satilik],
                ] as const
              ).map(([label, color]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--z-muted)]"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  {label}
                </span>
              ))}
            </>
          )}
        </div>
        <p className="text-[12px] text-[var(--z-muted)]">
          {visiblePoints.length}/{points.length} nokta
          {activePolygon
            ? ' · polygon'
            : radiusOn
              ? ` · r=${radiusM}m`
              : ' · bbox'}
          {source === 'live'
            ? ' · canlı'
            : source === 'mixed'
              ? ' · canlı+önbellek'
              : source === 'db'
                ? ' · önbellek'
                : ''}
        </p>
      </div>

      {error ? (
        <p className="text-[13px] text-amber-700 whitespace-pre-wrap">{error}</p>
      ) : null}

      <div className="relative">
        <div
          ref={mapEl}
          className="h-[min(68vh,620px)] w-full overflow-hidden rounded-xl border border-[var(--z-border)] z-0"
          style={{
            cursor: pickAnalysis || drawMode ? 'crosshair' : undefined,
          }}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:right-auto z-[500]">
          <div className="pointer-events-auto inline-flex flex-wrap items-center gap-3 rounded-xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)]/95 px-3 py-2 text-[12px] shadow-sm backdrop-blur">
            <span className="tabular-nums font-medium text-[var(--z-fg)]">
              {summary?.aktif ?? localStats.count} ilan
            </span>
            <span className="text-[var(--z-muted)]">
              Ort. m²{' '}
              <span className="tabular-nums text-[var(--z-fg-soft)]">
                {formatPrice(summary?.ort_m2_fiyat)}
              </span>
            </span>
            <span className="text-[var(--z-muted)]">
              Ort. yayında{' '}
              <span className="tabular-nums text-[var(--z-fg-soft)]">
                {summary?.ort_yayinda_kalma_gun != null
                  ? `${Math.round(summary.ort_yayinda_kalma_gun)} gün`
                  : '—'}
              </span>
            </span>
            <button
              type="button"
              className="z-btn-ghost px-2 py-1 text-[11px]"
              onClick={() => {
                setShowList(true);
                setShowAnalysis(false);
              }}
            >
              Listele
            </button>
            <button
              type="button"
              className="z-btn-ghost px-2 py-1 text-[11px]"
              onClick={() => setShowAnalysis(true)}
            >
              Analiz
            </button>
          </div>
        </div>

        {showList ? (
          <aside className="absolute top-3 left-3 z-[600] w-[min(100%,340px)] max-h-[min(62vh,560px)] overflow-y-auto rounded-xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)] p-3 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold">Liste</h2>
                <p className="text-[11px] text-[var(--z-muted)]">
                  {listSorted.length} ilan · {placeLabel}
                </p>
              </div>
              <button
                type="button"
                className="z-btn-ghost px-2 py-1 text-[11px]"
                onClick={() => setShowList(false)}
              >
                Kapat
              </button>
            </div>
            <ul className="mt-2 divide-y divide-[var(--z-border)]">
              {listSorted.length === 0 ? (
                <li className="py-3 text-[12px] text-[var(--z-muted)]">
                  Filtreye uyan ilan yok
                </li>
              ) : (
                listSorted.map((p) => (
                  <li key={p.listingNo} className="py-2">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        mapRef.current?.setView([p.lat, p.lng], 16);
                        setCompsNo(p.listingNo);
                      }}
                    >
                      <p className="text-[12px] font-medium line-clamp-2">
                        {p.title || `#${p.listingNo}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--z-muted)]">
                        {formatPrice(p.price)}
                        {p.m2 ? ` · ${p.m2} m²` : ''}
                        {p.rooms ? ` · ${p.rooms}` : ''}
                        {p.whom ? ` · ${p.whom}` : ''}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>
        ) : null}

        {showAnalysis ? (
          <aside className="absolute top-3 right-3 z-[600] w-[min(100%,340px)] max-h-[min(62vh,560px)] overflow-y-auto rounded-xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)] p-3 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold">Bölge analizi</h2>
                <p className="text-[11px] text-[var(--z-muted)]">
                  {analysisPoint
                    ? `Seçili nokta: ${analysisPoint.lat.toFixed(5)} · ${analysisPoint.lng.toFixed(5)}`
                    : activePolygon
                      ? 'Çizilen alan'
                      : `Merkez ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`}
                </p>
              </div>
              <button
                type="button"
                className="z-btn-ghost px-2 py-1 text-[11px]"
                onClick={() => setShowAnalysis(false)}
              >
                Kapat
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-[var(--z-muted)]">Analiz noktası</p>
              <div className="flex flex-wrap gap-1.5">
                {([500, 1000] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAnalysisRadius(r)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border ${
                      analysisRadius === r
                        ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)]'
                        : 'border-[var(--z-border)]'
                    }`}
                  >
                    {r >= 1000 ? '1 km' : '500 m'}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="z-btn-primary px-3 h-8 text-[11px]"
                  onClick={runPointAnalysis}
                >
                  Analiz et
                </button>
                <button
                  type="button"
                  className="z-btn-ghost px-3 h-8 text-[11px]"
                  onClick={() => {
                    setPickAnalysis(true);
                    setDrawMode(false);
                    setActivePolygon(null);
                  }}
                >
                  Noktayı değiştir
                </button>
                <button
                  type="button"
                  className="z-btn-ghost px-3 h-8 text-[11px]"
                  onClick={() => {
                    setAnalysisPoint(null);
                    setPickAnalysis(false);
                  }}
                >
                  Kaldır
                </button>
              </div>
            </div>

            {summaryError ? (
              <p className="mt-3 text-[12px] text-amber-700">{summaryError}</p>
            ) : !summary ? (
              <p className="mt-3 text-[12px] text-[var(--z-muted)]">
                Analiz et’e bas veya tarama bekle…
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-[12px]">
                {summary.firsat ? (
                  <div className="rounded-lg border border-[var(--z-border)] p-2">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                        style={{
                          background:
                            summary.firsat.color ||
                            summary.firsat.renk ||
                            '#6B7280',
                        }}
                      >
                        {summary.firsat.etiket || '—'}
                      </span>
                      <span className="text-[18px] font-semibold tabular-nums">
                        {summary.firsat.sufficient
                          ? summary.firsat.skor ?? '—'
                          : '—'}
                      </span>
                    </div>
                    {summary.firsat.not ? (
                      <p className="mt-1.5 text-[11px] text-[var(--z-muted)]">
                        {summary.firsat.not}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-1 text-[11px] underline text-[var(--z-muted)]"
                      onClick={() => setShowWhy((v) => !v)}
                    >
                      Neden? {showWhy ? '▴' : '▾'}
                    </button>
                    {showWhy && summary.firsat.components ? (
                      <div className="mt-2 space-y-1 border-t border-[var(--z-border)] pt-2">
                        {Object.entries(summary.firsat.components).map(
                          ([k, v]) => (
                            <div
                              key={k}
                              className="flex justify-between gap-2 text-[11px]"
                            >
                              <span className="text-[var(--z-muted)]">{k}</span>
                              <span className="tabular-nums">
                                {typeof v === 'number'
                                  ? Number.isInteger(v)
                                    ? v
                                    : v.toFixed(2)
                                  : String(v)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {(
                  [
                    ['Aktif ilan', summary.aktif],
                    [
                      'Satılık / Kiralık',
                      `${summary.satilik ?? '—'} / ${summary.kiralik ?? '—'}`,
                    ],
                    ['Ortalama fiyat', formatPrice(summary.ort_fiyat)],
                    [
                      'Ort. satılık / kiralık',
                      `${formatPrice(summary.ort_fiyat_satilik)} / ${formatPrice(summary.ort_fiyat_kiralik)}`,
                    ],
                    ['Ortalama m²', formatPrice(summary.ort_m2_fiyat)],
                    [
                      'm² satılık / kiralık',
                      `${formatPrice(summary.ort_m2_satilik)} / ${formatPrice(summary.ort_m2_kiralik)}`,
                    ],
                    [
                      'Fiyat p25–p75',
                      `${formatPrice(summary.fiyat_p25)} – ${formatPrice(summary.fiyat_p75)}`,
                    ],
                    [
                      'Ort. yayında',
                      summary.ort_yayinda_kalma_gun != null
                        ? `${Math.round(summary.ort_yayinda_kalma_gun)} gün`
                        : '—',
                    ],
                    [
                      'En yaygın oda',
                      topRoom
                        ? `${topRoom.value} (${topRoom.count})`
                        : '—',
                    ],
                    [
                      'Pasif / aktif',
                      pasifAktif != null
                        ? pasifAktif.toLocaleString('tr-TR', {
                            maximumFractionDigits: 2,
                          })
                        : '—',
                    ],
                    ['FSBO payı', formatPct(summary.sahibinden_payi)],
                    ['Son 30 gün yeni', summary.son_30_gun_yeni],
                    ['Fiyatı düşen', summary.fiyati_dusen],
                    ['Rakip ofis', summary.rakip_ofis_sayisi],
                    [
                      'Nüfus',
                      summary.nufus?.toplam != null
                        ? `${new Intl.NumberFormat('tr-TR').format(summary.nufus.toplam)}${
                            summary.nufus.degisim_yuzde != null
                              ? ` (${summary.nufus.degisim_yuzde > 0 ? '+' : ''}${summary.nufus.degisim_yuzde}%)`
                              : ''
                          }`
                        : '—',
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-2 border-b border-[var(--z-border)] py-1.5 last:border-0"
                  >
                    <span className="text-[var(--z-muted)]">{label}</span>
                    <span className="tabular-nums text-right">{value ?? '—'}</span>
                  </div>
                ))}

                {summary.nufus?.mahalleler?.length ? (
                  <div className="pt-1">
                    <p className="text-[11px] text-[var(--z-muted)] mb-1">
                      Mahalle nüfus
                    </p>
                    {summary.nufus.mahalleler.slice(0, 5).map((m, i) => (
                      <div
                        key={`${m.ad}-${i}`}
                        className="flex justify-between gap-2 text-[11px] py-0.5"
                      >
                        <span className="truncate">{m.ad || '—'}</span>
                        <span className="tabular-nums shrink-0">
                          {m.nufus != null
                            ? new Intl.NumberFormat('tr-TR').format(m.nufus)
                            : '—'}
                          {m.aktif_ilan != null ? ` · ${m.aktif_ilan} ilan` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {compsNo ? (
        <IvoCompsPanel listingNo={compsNo} onClose={() => setCompsNo(null)} />
      ) : null}
    </section>
  );
}
