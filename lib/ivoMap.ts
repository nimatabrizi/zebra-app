/**
 * IVO harita verisi — Zebra map UI bu uçları (veya DB lat/lng) kullanır.
 * AI / değerleme yok.
 */

import { ivoRequest } from './ivoApiClient';

export type IvoMapArea =
  | {
      type: 'bbox';
      bounds: [[number, number], [number, number]]; // [[swLng,swLat],[neLng,neLat]]
    }
  | {
      type: 'radius';
      center: [number, number]; // [lng, lat]
      radius_m: number;
    }
  | {
      type: 'polygon';
      coordinates: number[][]; // ring [lng,lat][]
    };

export type IvoMapPoint = {
  id?: string;
  no: number | string;
  lat: number;
  lng: number;
  price?: number;
  status?: string;
  kind?: string;
  type?: string;
  rooms?: string | null;
  title?: string;
  image?: string;
  is_active?: boolean;
  whom?: string;
  price_change?: {
    change_count?: number;
    first_price?: number;
    current_price?: number;
    prev_price?: number;
    last_change_date?: string;
  };
};

export type IvoMapListItem = IvoMapPoint & {
  city?: string;
  district?: string;
  neighborhood?: string;
  m2?: number;
  m2_gross?: number;
  date?: string;
  first_date?: string;
  m2_price?: number;
  updated_at?: string;
  [key: string]: unknown;
};

export type IvoMapSearchFilters = {
  status?: string[];
  rooms?: string[];
  kind?: string[];
  type?: string[];
  whom?: string[];
  is_active?: boolean[];
};

export type IvoMapSearchResult = {
  view: 'points' | 'list';
  items: IvoMapPoint[] | IvoMapListItem[];
  meta?: Record<string, unknown>;
};

export type IvoMapFacetBucket = { value: string | boolean | number; count: number };
export type IvoMapFacets = Record<string, IvoMapFacetBucket[]>;

/** Max alan ~25 km² — IVO 422 verir. */
export async function ivoMapSearch(opts: {
  area: IvoMapArea;
  view?: 'points' | 'list';
  limit?: number;
  filters?: IvoMapSearchFilters;
}): Promise<IvoMapSearchResult> {
  const body: Record<string, unknown> = {
    area: opts.area,
    view: opts.view || 'points',
    limit: opts.limit ?? 100,
  };
  if (opts.filters) {
    for (const [k, v] of Object.entries(opts.filters)) {
      if (Array.isArray(v) && v.length > 0) body[k] = v;
    }
  }
  const res = await ivoRequest<{
    success?: boolean;
    data?: IvoMapSearchResult;
  }>('/map/search', {
    method: 'POST',
    body,
  });
  if (res?.data?.items) return res.data;
  return { view: opts.view || 'points', items: [] };
}

/** Facet sayıları — cevap şekli items değil data[facetKey][]. */
export async function ivoMapFacets(
  area: IvoMapArea,
  filters?: IvoMapSearchFilters
): Promise<IvoMapFacets> {
  const body: Record<string, unknown> = {
    area,
    view: 'points',
    limit: 1,
  };
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (Array.isArray(v) && v.length > 0) body[k] = v;
    }
  }
  const res = await ivoRequest<{ success?: boolean; data?: IvoMapFacets }>(
    '/map/search?facets=1',
    { method: 'POST', body }
  );
  return res?.data && typeof res.data === 'object' ? res.data : {};
}

export async function ivoMapSummary(area: IvoMapArea): Promise<unknown> {
  return ivoRequest('/map/summary', {
    method: 'POST',
    body: { area },
  });
}
