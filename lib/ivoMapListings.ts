/**
 * Radar harita — canlı IVO map/search (+ DB fallback noktaları).
 */

import { createServiceClient } from '../utils/supabase/admin';
import {
  ivoMapFacets,
  ivoMapSearch,
  ivoMapSummary,
  type IvoMapArea,
  type IvoMapFacets,
  type IvoMapListItem,
  type IvoMapPoint,
  type IvoMapSearchFilters,
} from './ivoMap';

export type MapListingPoint = {
  listingNo: string;
  lat: number;
  lng: number;
  price: number | null;
  title: string | null;
  status: string | null;
  kind: string | null;
  type: string | null;
  rooms: string | null;
  image: string | null;
  isActive: boolean;
  whom: string | null;
  /** prev vs current — negatif = düşüş */
  priceDelta: number | null;
  m2: number | null;
  m2Price: number | null;
  source: 'live' | 'db';
};

export type MapBbox = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

export type MapPolygonRing = number[][]; // [lng,lat][]

export type MapListingsResult = {
  points: MapListingPoint[];
  source: 'live' | 'db' | 'mixed';
  center: { lat: number; lng: number };
  radiusM: number;
  mode: 'radius' | 'bbox' | 'polygon';
  bbox?: MapBbox;
  error?: string;
};

const DEFAULT_CENTER = { lat: 38.446, lng: 27.206 };
const DEFAULT_RADIUS = 1200;
const MAX_AREA_KM2 = 20;

export function clampMapBbox(raw: MapBbox): MapBbox & {
  center: { lat: number; lng: number };
  approxRadiusM: number;
} {
  let { swLat, swLng, neLat, neLng } = raw;
  if (swLat > neLat) [swLat, neLat] = [neLat, swLat];
  if (swLng > neLng) [swLng, neLng] = [neLng, swLng];
  const center = {
    lat: (swLat + neLat) / 2,
    lng: (swLng + neLng) / 2,
  };
  const latSpan = Math.max(neLat - swLat, 1e-6);
  const lngSpan = Math.max(neLng - swLng, 1e-6);
  const hKm = latSpan * 111;
  const wKm =
    lngSpan * 111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const area = hKm * wKm;
  if (area > MAX_AREA_KM2) {
    const scale = Math.sqrt(MAX_AREA_KM2 / area);
    const dLat = (latSpan / 2) * scale;
    const dLng = (lngSpan / 2) * scale;
    swLat = center.lat - dLat;
    neLat = center.lat + dLat;
    swLng = center.lng - dLng;
    neLng = center.lng + dLng;
  }
  const h = Math.abs(neLat - swLat) * 111_000;
  const w =
    Math.abs(neLng - swLng) *
    111_000 *
    Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const approxRadiusM = Math.min(
    2500,
    Math.max(300, Math.round(Math.sqrt(h * h + w * w) / 2))
  );
  return { swLat, swLng, neLat, neLng, center, approxRadiusM };
}

function polygonCenter(ring: MapPolygonRing): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  const n = Math.max(ring.length, 1);
  for (const c of ring) {
    lng += c[0];
    lat += c[1];
  }
  return { lat: lat / n, lng: lng / n };
}

function resolveArea(opts?: {
  lat?: number;
  lng?: number;
  radiusM?: number;
  bbox?: MapBbox | null;
  polygon?: MapPolygonRing | null;
  mode?: 'radius' | 'bbox' | 'polygon';
}): {
  area: IvoMapArea;
  center: { lat: number; lng: number };
  radiusM: number;
  mode: 'radius' | 'bbox' | 'polygon';
  bbox?: MapBbox;
} {
  if (opts?.mode === 'polygon' && opts.polygon && opts.polygon.length >= 3) {
    // IVO: area.polygon = [lng,lat][] (kapalı ring şart değil; en az 3 köşe)
    const ring = opts.polygon.map(([lng, lat]) => [
      Number(lng),
      Number(lat),
    ]);
    const center = polygonCenter(ring);
    return {
      area: { type: 'polygon', polygon: ring },
      center,
      radiusM: DEFAULT_RADIUS,
      mode: 'polygon',
    };
  }
  if (opts?.mode === 'bbox' && opts.bbox) {
    const clamped = clampMapBbox(opts.bbox);
    return {
      area: {
        type: 'bbox',
        bounds: [
          [clamped.swLng, clamped.swLat],
          [clamped.neLng, clamped.neLat],
        ],
      },
      center: clamped.center,
      radiusM: clamped.approxRadiusM,
      mode: 'bbox',
      bbox: {
        swLat: clamped.swLat,
        swLng: clamped.swLng,
        neLat: clamped.neLat,
        neLng: clamped.neLng,
      },
    };
  }
  const center = {
    lat: typeof opts?.lat === 'number' ? opts.lat : DEFAULT_CENTER.lat,
    lng: typeof opts?.lng === 'number' ? opts.lng : DEFAULT_CENTER.lng,
  };
  const radiusM = Math.min(
    Math.max(opts?.radiusM ?? DEFAULT_RADIUS, 300),
    2500
  );
  return {
    area: {
      type: 'radius',
      center: [center.lng, center.lat],
      radius_m: radiusM,
    },
    center,
    radiusM,
    mode: 'radius',
  };
}

export type MapRegionSummary = {
  toplam?: number;
  aktif?: number;
  pasif?: number;
  satilik?: number;
  kiralik?: number;
  ort_fiyat?: number;
  ort_m2_fiyat?: number;
  ort_fiyat_satilik?: number;
  ort_fiyat_kiralik?: number;
  ort_m2_satilik?: number;
  ort_m2_kiralik?: number;
  fiyat_min?: number;
  fiyat_p25?: number;
  fiyat_p75?: number;
  fiyat_max?: number;
  ort_yayinda_kalma_gun?: number;
  sahibinden_payi?: number;
  son_30_gun_yeni?: number;
  fiyati_dusen?: number;
  rakip_ofis_sayisi?: number;
  firsat?: {
    sufficient?: boolean;
    skor?: number;
    etiket?: string;
    not?: string;
    color?: string;
    renk?: string;
    components?: Record<string, number>;
  };
  nufus?: {
    toplam?: number;
    degisim_yuzde?: number;
    yil?: number;
    mahalleler?: Array<{
      ad?: string;
      nufus?: number;
      degisim_yuzde?: number;
      aktif_ilan?: number;
    }>;
    not?: string;
  };
  [key: string]: unknown;
};

export async function fetchMapRegionSummary(opts?: {
  lat?: number;
  lng?: number;
  radiusM?: number;
  bbox?: MapBbox | null;
  polygon?: MapPolygonRing | null;
  mode?: 'radius' | 'bbox' | 'polygon';
}): Promise<{
  summary: MapRegionSummary | null;
  center: { lat: number; lng: number };
  radiusM: number;
  mode: 'radius' | 'bbox' | 'polygon';
  error?: string;
}> {
  const resolved = resolveArea(opts);
  try {
    const res = await ivoMapSummary(resolved.area);
    const data =
      res && typeof res === 'object' && 'data' in (res as object)
        ? ((res as { data?: MapRegionSummary }).data ?? null)
        : (res as MapRegionSummary | null);
    return {
      summary: data,
      center: resolved.center,
      radiusM: resolved.radiusM,
      mode: resolved.mode,
    };
  } catch (e) {
    return {
      summary: null,
      center: resolved.center,
      radiusM: resolved.radiusM,
      mode: resolved.mode,
      error: e instanceof Error ? e.message : 'Bölge özeti alınamadı',
    };
  }
}

export async function fetchMapFacets(opts?: {
  lat?: number;
  lng?: number;
  radiusM?: number;
  bbox?: MapBbox | null;
  polygon?: MapPolygonRing | null;
  mode?: 'radius' | 'bbox' | 'polygon';
  filters?: IvoMapSearchFilters;
}): Promise<{ facets: IvoMapFacets; error?: string }> {
  const resolved = resolveArea(opts);
  try {
    const facets = await ivoMapFacets(resolved.area, opts?.filters);
    return { facets };
  } catch (e) {
    return {
      facets: {},
      error: e instanceof Error ? e.message : 'Facet alınamadı',
    };
  }
}

function priceDeltaFromChange(
  pc: IvoMapPoint['price_change'] | undefined
): number | null {
  if (!pc) return null;
  const cur = pc.current_price;
  const prev = pc.prev_price;
  if (typeof cur !== 'number' || typeof prev !== 'number') return null;
  return cur - prev;
}

function normalizePoint(
  p: IvoMapPoint,
  source: 'live' | 'db',
  enrich?: Partial<MapListingPoint>
): MapListingPoint | null {
  const listingNo = String(p.no ?? '').replace(/\D/g, '');
  if (!listingNo || typeof p.lat !== 'number' || typeof p.lng !== 'number') {
    return null;
  }
  return {
    listingNo,
    lat: p.lat,
    lng: p.lng,
    price: typeof p.price === 'number' ? p.price : null,
    title: p.title ? String(p.title) : null,
    status: p.status ? String(p.status) : null,
    kind: p.kind ? String(p.kind) : null,
    type: p.type ? String(p.type) : enrich?.type ?? null,
    rooms: p.rooms != null ? String(p.rooms) : null,
    image: p.image ? String(p.image) : null,
    isActive: p.is_active !== false,
    whom: p.whom ? String(p.whom) : enrich?.whom ?? null,
    priceDelta: priceDeltaFromChange(p.price_change) ?? enrich?.priceDelta ?? null,
    m2: enrich?.m2 ?? null,
    m2Price: enrich?.m2Price ?? null,
    source,
  };
}

async function dbPointsNear(opts: {
  lat: number;
  lng: number;
  radiusM: number;
  limit: number;
}): Promise<MapListingPoint[]> {
  const admin = createServiceClient();
  const dLat = opts.radiusM / 111_000;
  const dLng =
    opts.radiusM / (111_000 * Math.max(0.2, Math.cos((opts.lat * Math.PI) / 180)));

  const { data, error } = await admin
    .from('ivo_listings')
    .select('listing_no, lat, lng, price_tl, title, kind, rooms, image_url, status, raw')
    .eq('source', 'sahibinden')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .gte('lat', opts.lat - dLat)
    .lte('lat', opts.lat + dLat)
    .gte('lng', opts.lng - dLng)
    .lte('lng', opts.lng + dLng)
    .limit(opts.limit);

  if (error) throw new Error(error.message);

  return (data || [])
    .map((r) => {
      const raw = r.raw as {
        card?: { image?: string; status?: string; whom?: string; type?: string };
      } | null;
      return normalizePoint(
        {
          no: r.listing_no,
          lat: Number(r.lat),
          lng: Number(r.lng),
          price: r.price_tl != null ? Number(r.price_tl) : undefined,
          title: r.title || undefined,
          status: raw?.card?.status || undefined,
          kind: r.kind || undefined,
          type: raw?.card?.type || undefined,
          rooms: r.rooms || undefined,
          image: r.image_url || raw?.card?.image || undefined,
          is_active: r.status === 'active',
          whom: raw?.card?.whom || undefined,
        },
        'db'
      );
    })
    .filter((p): p is MapListingPoint => !!p);
}

async function enrichFromList(
  area: IvoMapArea,
  points: MapListingPoint[],
  filters?: IvoMapSearchFilters,
  limit = 150
): Promise<MapListingPoint[]> {
  try {
    const list = await ivoMapSearch({
      area,
      view: 'list',
      limit,
      filters,
    });
    const byNo = new Map(
      (list.items as IvoMapListItem[]).map((it) => {
        const no = String(it.no ?? '').replace(/\D/g, '');
        return [no, it] as const;
      })
    );
    return points.map((p) => {
      const it = byNo.get(p.listingNo);
      if (!it) return p;
      const delta = priceDeltaFromChange(it.price_change);
      return {
        ...p,
        whom: it.whom ? String(it.whom) : p.whom,
        priceDelta: delta ?? p.priceDelta,
        type: it.type ? String(it.type) : p.type,
        m2: typeof it.m2 === 'number' ? it.m2 : p.m2,
        m2Price: typeof it.m2_price === 'number' ? it.m2_price : p.m2Price,
        title: it.title ? String(it.title) : p.title,
        image: it.image ? String(it.image) : p.image,
      };
    });
  } catch {
    return points;
  }
}

/** Harita noktaları — önce canlı IVO, olmazsa DB. */
export async function listMapListings(opts?: {
  lat?: number;
  lng?: number;
  radiusM?: number;
  bbox?: MapBbox | null;
  polygon?: MapPolygonRing | null;
  mode?: 'radius' | 'bbox' | 'polygon';
  limit?: number;
  preferDb?: boolean;
  filters?: IvoMapSearchFilters;
  enrich?: boolean;
}): Promise<MapListingsResult> {
  const resolved = resolveArea(opts);
  const { center, radiusM, mode, bbox } = resolved;
  const limit = Math.min(Math.max(opts?.limit ?? 100, 10), 200);
  const filters = opts?.filters;
  const doEnrich = opts?.enrich !== false;

  if (!opts?.preferDb) {
    try {
      const live = await ivoMapSearch({
        area: resolved.area,
        view: 'points',
        limit,
        filters,
      });
      let points = (live.items as IvoMapPoint[])
        .map((p) => normalizePoint(p, 'live'))
        .filter((p): p is MapListingPoint => !!p);

      if (doEnrich) {
        points = await enrichFromList(resolved.area, points, filters, limit);
      }

      let merged = points;
      try {
        const db = await dbPointsNear({ ...center, radiusM, limit });
        const byNo = new Map(points.map((p) => [p.listingNo, p]));
        for (const d of db) {
          if (!byNo.has(d.listingNo)) byNo.set(d.listingNo, d);
        }
        merged = Array.from(byNo.values());
      } catch {
        /* db opsiyonel */
      }

      return {
        points: merged,
        source: merged.some((p) => p.source === 'db') && points.length
          ? 'mixed'
          : 'live',
        center,
        radiusM,
        mode,
        bbox,
      };
    } catch (e) {
      try {
        const db = await dbPointsNear({ ...center, radiusM, limit });
        return {
          points: db,
          source: 'db',
          center,
          radiusM,
          mode,
          bbox,
          error: e instanceof Error ? e.message : 'Canlı harita alınamadı',
        };
      } catch (dbErr) {
        return {
          points: [],
          source: 'db',
          center,
          radiusM,
          mode,
          bbox,
          error:
            e instanceof Error
              ? e.message
              : dbErr instanceof Error
                ? dbErr.message
                : 'Harita verisi yok',
        };
      }
    }
  }

  const db = await dbPointsNear({ ...center, radiusM, limit });
  return { points: db, source: 'db', center, radiusM, mode, bbox };
}

export type { IvoMapFacets, IvoMapSearchFilters };
