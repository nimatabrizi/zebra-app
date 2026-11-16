/**
 * Alıcı ihtiyacı POI — OpenStreetMap Overpass (kuş uçuşu mesafe).
 */

export type NearbyPoi = {
  id: string;
  name: string;
  category: 'okul' | 'ulasim' | 'market' | 'saglik' | 'yesil';
  lat: number;
  lng: number;
  distanceM: number;
};

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CATEGORY_QUERIES: Record<NearbyPoi['category'], string> = {
  okul: `
    node["amenity"~"school|kindergarten|university"](around:1000,{lat},{lng});
    way["amenity"~"school|kindergarten|university"](around:1000,{lat},{lng});
  `,
  ulasim: `
    node["railway"="station"](around:1000,{lat},{lng});
    node["railway"="tram_stop"](around:1000,{lat},{lng});
    node["public_transport"="station"](around:1000,{lat},{lng});
    node["highway"="bus_stop"](around:1000,{lat},{lng});
  `,
  market: `
    node["shop"~"supermarket|convenience|mall"](around:1000,{lat},{lng});
  `,
  saglik: `
    node["amenity"~"hospital|clinic|doctors|pharmacy"](around:1000,{lat},{lng});
  `,
  yesil: `
    node["leisure"~"park|garden"](around:1000,{lat},{lng});
    way["leisure"~"park|garden"](around:1000,{lat},{lng});
  `,
};

export async function fetchNearbyPois(opts: {
  lat: number;
  lng: number;
  categories?: NearbyPoi['category'][];
  limitPerCategory?: number;
}): Promise<NearbyPoi[]> {
  const cats = opts.categories || ['okul', 'ulasim', 'market', 'saglik', 'yesil'];
  const limit = opts.limitPerCategory ?? 5;
  const parts = cats
    .map((c) =>
      CATEGORY_QUERIES[c]
        .replace(/\{lat\}/g, String(opts.lat))
        .replace(/\{lng\}/g, String(opts.lng))
    )
    .join('\n');
  const query = `[out:json][timeout:15];(${parts});out center tags 40;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  type OverpassEl = {
    id?: number;
    type?: string;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    tags?: Record<string, string>;
  };
  type OverpassJson = { elements?: OverpassEl[] };

  let json: OverpassJson | null = null;

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        cache: 'no-store',
      });
      if (!res.ok) continue;
      json = (await res.json()) as OverpassJson;
      break;
    } catch {
      /* try next */
    }
  }
  if (!json?.elements?.length) return [];

  const classify = (tags: Record<string, string>): NearbyPoi['category'] | null => {
    const a = tags.amenity || '';
    const shop = tags.shop || '';
    const railway = tags.railway || '';
    const leisure = tags.leisure || '';
    const pt = tags.public_transport || '';
    const highway = tags.highway || '';
    if (/school|kindergarten|university/.test(a)) return 'okul';
    if (
      railway === 'station' ||
      railway === 'tram_stop' ||
      pt === 'station' ||
      highway === 'bus_stop'
    )
      return 'ulasim';
    if (/supermarket|convenience|mall/.test(shop)) return 'market';
    if (/hospital|clinic|doctors|pharmacy/.test(a)) return 'saglik';
    if (/park|garden/.test(leisure)) return 'yesil';
    return null;
  };

  const byCat: Record<string, NearbyPoi[]> = {};
  for (const el of json.elements) {
    const tags = el.tags || {};
    const cat = classify(tags);
    if (!cat) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const name =
      tags.name || tags['name:tr'] || tags.ref || tags.operator || 'İsimsiz';
    const item: NearbyPoi = {
      id: `${el.type || 'n'}-${el.id || `${lat},${lng}`}`,
      name,
      category: cat,
      lat,
      lng,
      distanceM: haversineM(opts.lat, opts.lng, lat, lng),
    };
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat]!.push(item);
  }

  const out: NearbyPoi[] = [];
  for (const c of cats) {
    const list = (byCat[c] || [])
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit);
    out.push(...list);
  }
  return out;
}
