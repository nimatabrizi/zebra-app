/**
 * IVO corpus → Zebra ivo_listings tam senkron.
 * AI / değerleme hariç; harita koordinatları dahil.
 * Katalog: docs/ivo-data-catalog.md
 */

import { createServiceClient } from '../utils/supabase/admin';
import { ivoRequest, getIvoSessionStatus } from './ivoApiClient';
import { isFsboWhom } from './sahibindenListing';
import type { IvoMapPoint } from './ivoMap';
import { ivoMapSearch } from './ivoMap';

export type IvoCard = {
  id?: string;
  no?: number | string;
  title?: string;
  price?: number;
  city?: string;
  district?: string;
  neighborhood?: string;
  type?: string;
  kind?: string;
  status?: string;
  m2?: number;
  m2_gross?: number;
  rooms?: string;
  image?: string;
  whom?: string;
  is_active?: boolean;
  url?: string;
  m2_price?: number;
  date?: string;
  first_date?: string;
  updated_at?: string;
  lat?: number;
  lng?: number;
  coordinates?: [number, number] | number[];
  [key: string]: unknown;
};

/** Liste feed’leri (düz kart dizisi). */
export type IvoSyncFeed =
  | 'fsbo'
  | 'catch-dropped'
  | 'fsbo-aged'
  | 'below-average'
  | 'price-dropped'
  | 'relisted'
  | 'passive'
  | 'my-properties'
  | 'office-properties'
  | 'franchise'
  | 'zone-offices'
  | 'contact-properties'
  | 'takip';

const FEED_BASE: Record<IvoSyncFeed, string> = {
  fsbo: '/expertise/fsbo',
  'catch-dropped': '/expertise/catch-dropped',
  'fsbo-aged': '/expertise/fsbo-aged',
  'below-average': '/expertise/below-average',
  'price-dropped': '/expertise/price-dropped',
  relisted: '/expertise/relisted',
  passive: '/expertise/passive',
  'my-properties': '/expertise/my-properties',
  'office-properties': '/expertise/office-properties',
  franchise: '/expertise/franchise',
  'zone-offices': '/expertise/zone-offices',
  'contact-properties': '/expertise/contact-properties',
  takip: '/takip/ilanlar',
};

/** Büyük corpus — cron başına sayfa tavanı (cursor ile devam). */
const LARGE_FEEDS = new Set<IvoSyncFeed>(['office-properties', 'passive']);

const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES_SMALL = 50;
const DEFAULT_MAX_PAGES_LARGE = 20;
const ENRICH_BATCH = 40;
const MAP_ENRICH_LIMIT = 80;

type SchemaCaps = {
  latLng: boolean;
  feeds: boolean;
  imageUrl: boolean;
  cursors: boolean;
  snapshots: boolean;
};

let schemaCapsCache: SchemaCaps | null = null;

async function detectSchemaCaps(): Promise<SchemaCaps> {
  if (schemaCapsCache) return schemaCapsCache;
  const admin = createServiceClient();
  const caps: SchemaCaps = {
    latLng: false,
    feeds: false,
    imageUrl: false,
    cursors: false,
    snapshots: false,
  };

  const { error: listingErr } = await admin
    .from('ivo_listings')
    .select('lat, lng, feeds, image_url')
    .limit(1);
  if (!listingErr) {
    caps.latLng = true;
    caps.feeds = true;
    caps.imageUrl = true;
  } else {
    const msg = listingErr.message || '';
    // Kısmi kolon: tek tek dene
    const { error: e1 } = await admin.from('ivo_listings').select('lat').limit(1);
    caps.latLng = !e1;
    const { error: e2 } = await admin.from('ivo_listings').select('feeds').limit(1);
    caps.feeds = !e2;
    const { error: e3 } = await admin
      .from('ivo_listings')
      .select('image_url')
      .limit(1);
    caps.imageUrl = !e3;
    void msg;
  }

  const { error: cErr } = await admin
    .from('ivo_sync_cursors')
    .select('feed')
    .limit(1);
  caps.cursors = !cErr;

  const { error: sErr } = await admin
    .from('ivo_snapshots')
    .select('key')
    .limit(1);
  caps.snapshots = !sErr;

  schemaCapsCache = caps;
  return caps;
}

function listingTypeFromStatus(status?: string): string | null {
  if (!status) return null;
  const s = status.toLocaleLowerCase('tr-TR');
  if (s.includes('kira')) return 'kiralik';
  if (s.includes('sat')) return 'satilik';
  return null;
}

function coordsFromCard(card: IvoCard): { lat: number; lng: number } | null {
  if (
    typeof card.lat === 'number' &&
    typeof card.lng === 'number' &&
    Number.isFinite(card.lat) &&
    Number.isFinite(card.lng)
  ) {
    return { lat: card.lat, lng: card.lng };
  }
  const c = card.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function cardToPayload(card: IvoCard, feed: IvoSyncFeed) {
  const listingNo = String(card.no ?? '').replace(/\D/g, '');
  if (!listingNo || listingNo.length < 8) return null;

  const priceTl =
    typeof card.price === 'number' && Number.isFinite(card.price)
      ? Math.round(card.price)
      : null;
  const area =
    typeof card.m2 === 'number'
      ? card.m2
      : typeof card.m2_gross === 'number'
        ? card.m2_gross
        : null;
  const whom = card.whom ? String(card.whom) : null;
  const active = card.is_active !== false;
  const geo = coordsFromCard(card);

  return {
    source: 'sahibinden' as const,
    listing_no: listingNo,
    url:
      card.url && String(card.url).startsWith('http')
        ? String(card.url)
        : `https://www.sahibinden.com/ilan/${listingNo}`,
    title: card.title ? String(card.title) : null,
    price_tl: priceTl,
    price_m2:
      typeof card.m2_price === 'number'
        ? Math.round(card.m2_price)
        : priceTl && area && area > 0
          ? Math.round(priceTl / area)
          : null,
    area_m2: area,
    rooms: card.rooms ? String(card.rooms) : null,
    city: card.city ? String(card.city) : null,
    district: card.district ? String(card.district) : null,
    neighborhood: card.neighborhood ? String(card.neighborhood) : null,
    whom,
    kind: card.kind || card.type ? String(card.kind || card.type) : null,
    listing_type: listingTypeFromStatus(card.status),
    is_fsbo: isFsboWhom(whom) || feed === 'fsbo',
    status: active ? 'active' : 'inactive',
    last_seen_at: new Date().toISOString(),
    last_price_tl: priceTl,
    image_url: card.image ? String(card.image) : null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    ivo_updated_at: card.updated_at ? String(card.updated_at) : null,
    feeds: [feed],
    raw: {
      ingest_via: 'ivo',
      ingest_feed: feed,
      ivo_id: card.id || null,
      image: card.image || null,
      ivo_status: card.status || null,
      ivo_date: card.date || null,
      ivo_first_date: card.first_date || null,
      card,
    },
  };
}

type FeedPage = {
  cards: IvoCard[];
  total: number | null;
  limit: number;
  offset: number;
};

async function fetchFeedPage(
  feed: IvoSyncFeed,
  offset: number,
  limit = PAGE_SIZE
): Promise<FeedPage> {
  const base = FEED_BASE[feed];
  const qs = new URLSearchParams({
    view: 'basic',
    limit: String(limit),
    offset: String(offset),
  });
  const path = `${base}?${qs.toString()}`;
  const res = await ivoRequest<{
    success?: boolean;
    data?: IvoCard[];
    meta?: { total?: number; limit?: number; offset?: number };
  }>(path);

  const cards = Array.isArray(res?.data)
    ? res.data
    : Array.isArray(res)
      ? (res as unknown as IvoCard[])
      : [];
  const meta = res?.meta;
  return {
    cards,
    total: typeof meta?.total === 'number' ? meta.total : null,
    limit: typeof meta?.limit === 'number' ? meta.limit : limit,
    offset: typeof meta?.offset === 'number' ? meta.offset : offset,
  };
}

export type FeedSyncResult = {
  feed: IvoSyncFeed;
  fetched: number;
  upserted: number;
  priceChanges: number;
  pages: number;
  nextOffset: number;
  totalHint: number | null;
  done: boolean;
  error?: string;
};

const CURSOR_SOURCE = 'ivo-meta';
function cursorListingNo(feed: IvoSyncFeed) {
  return `__cursor_${feed}__`;
}

async function getCursor(feed: IvoSyncFeed): Promise<number> {
  const caps = await detectSchemaCaps();
  const admin = createServiceClient();
  if (caps.cursors) {
    const { data } = await admin
      .from('ivo_sync_cursors')
      .select('next_offset')
      .eq('feed', feed)
      .maybeSingle();
    return typeof data?.next_offset === 'number' ? data.next_offset : 0;
  }
  // Fallback: sentinel satır (migration öncesi)
  const { data } = await admin
    .from('ivo_listings')
    .select('raw')
    .eq('source', CURSOR_SOURCE)
    .eq('listing_no', cursorListingNo(feed))
    .maybeSingle();
  const raw = data?.raw as { next_offset?: number } | null;
  return typeof raw?.next_offset === 'number' ? raw.next_offset : 0;
}

async function setCursor(
  feed: IvoSyncFeed,
  nextOffset: number,
  totalHint: number | null,
  lastFetched: number
) {
  const caps = await detectSchemaCaps();
  const admin = createServiceClient();
  if (caps.cursors) {
    await admin.from('ivo_sync_cursors').upsert(
      {
        feed,
        next_offset: nextOffset,
        total_hint: totalHint,
        last_fetched: lastFetched,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'feed' }
    );
    return;
  }
  await admin.from('ivo_listings').upsert(
    {
      source: CURSOR_SOURCE,
      listing_no: cursorListingNo(feed),
      url: `ivo://cursor/${feed}`,
      title: `sync cursor ${feed}`,
      status: 'meta',
      last_seen_at: new Date().toISOString(),
      raw: {
        next_offset: nextOffset,
        total_hint: totalHint,
        last_fetched: lastFetched,
        updated_at: new Date().toISOString(),
      },
    },
    { onConflict: 'source,listing_no' }
  );
}

async function upsertCards(
  feed: IvoSyncFeed,
  cards: IvoCard[]
): Promise<{ upserted: number; priceChanges: number }> {
  const admin = createServiceClient();
  const caps = await detectSchemaCaps();
  const payloads = cards
    .map((c) => cardToPayload(c, feed))
    .filter((p): p is NonNullable<typeof p> => !!p);

  if (payloads.length === 0) return { upserted: 0, priceChanges: 0 };

  const nos = payloads.map((p) => p.listing_no);
  const selectCols = [
    'id',
    'listing_no',
    'price_tl',
    caps.feeds ? 'feeds' : null,
    caps.latLng ? 'lat' : null,
    caps.latLng ? 'lng' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const { data: existingRows } = await admin
    .from('ivo_listings')
    .select(selectCols)
    .eq('source', 'sahibinden')
    .in('listing_no', nos);

  type Existing = {
    id: string;
    listing_no: string;
    price_tl: number | null;
    feeds?: string[] | null;
    lat?: number | null;
    lng?: number | null;
  };

  const prevByNo = new Map(
    (existingRows || []).map((r) => [
      String((r as unknown as Existing).listing_no),
      r as unknown as Existing,
    ])
  );

  const clean = payloads.map((p) => {
    const prev = prevByNo.get(p.listing_no);
    const mergedFeeds = Array.from(
      new Set([...(prev?.feeds || []), ...(p.feeds || [])])
    );
    const lat =
      p.lat != null ? p.lat : prev?.lat != null ? prev.lat : null;
    const lng =
      p.lng != null ? p.lng : prev?.lng != null ? prev.lng : null;

    const raw = {
      ...p.raw,
      ...(lat != null && lng != null
        ? { coordinates: [lng, lat], lat, lng }
        : {}),
      feeds: mergedFeeds,
    };

    // first_seen_at: INSERT’te DB default; UPDATE’te dokunma (gönderme)
    const row: Record<string, unknown> = {
      source: p.source,
      listing_no: p.listing_no,
      url: p.url,
      title: p.title,
      price_tl: p.price_tl,
      price_m2: p.price_m2,
      area_m2: p.area_m2,
      rooms: p.rooms,
      city: p.city,
      district: p.district,
      neighborhood: p.neighborhood,
      whom: p.whom,
      kind: p.kind,
      listing_type: p.listing_type,
      is_fsbo: p.is_fsbo,
      status: p.status,
      last_seen_at: p.last_seen_at,
      last_price_tl: p.last_price_tl,
      raw,
    };
    if (caps.feeds) row.feeds = mergedFeeds;
    if (caps.imageUrl) row.image_url = p.image_url;
    if (caps.latLng) {
      row.lat = lat;
      row.lng = lng;
      if (p.ivo_updated_at) row.ivo_updated_at = p.ivo_updated_at;
    }
    return row;
  });

  const { data, error } = await admin
    .from('ivo_listings')
    .upsert(clean, { onConflict: 'source,listing_no' })
    .select('id, listing_no, price_tl');

  if (error) throw new Error(`${feed}: ${error.message}`);

  const upserted = (data || []).length;
  let priceChanges = 0;
  const history: { listing_id: string; price_tl: number }[] = [];

  for (const row of data || []) {
    const r = row as {
      id: string;
      listing_no: string;
      price_tl: number | null;
    };
    const prev = prevByNo.get(String(r.listing_no))?.price_tl ?? null;
    if (
      r.price_tl != null &&
      (prev == null || Number(prev) !== Number(r.price_tl))
    ) {
      history.push({ listing_id: r.id, price_tl: r.price_tl });
      priceChanges += 1;
    }
  }

  if (history.length) {
    await admin.from('ivo_listing_price_history').insert(history);
  }

  return { upserted, priceChanges };
}

async function syncOneFeed(
  feed: IvoSyncFeed,
  opts: { maxPages: number; resume: boolean }
): Promise<FeedSyncResult> {
  let offset = opts.resume && LARGE_FEEDS.has(feed) ? await getCursor(feed) : 0;
  let fetched = 0;
  let upserted = 0;
  let priceChanges = 0;
  let pages = 0;
  let totalHint: number | null = null;
  let done = false;

  while (pages < opts.maxPages) {
    const page = await fetchFeedPage(feed, offset, PAGE_SIZE);
    if (page.total != null) totalHint = page.total;
    if (!page.cards.length) {
      done = true;
      offset = 0;
      break;
    }

    const r = await upsertCards(feed, page.cards);
    fetched += page.cards.length;
    upserted += r.upserted;
    priceChanges += r.priceChanges;
    pages += 1;
    offset += page.cards.length;

    if (totalHint != null && offset >= totalHint) {
      done = true;
      offset = 0;
      break;
    }
    if (page.cards.length < PAGE_SIZE) {
      done = true;
      offset = 0;
      break;
    }
  }

  if (LARGE_FEEDS.has(feed)) {
    await setCursor(feed, offset, totalHint, fetched);
  }

  return {
    feed,
    fetched,
    upserted,
    priceChanges,
    pages,
    nextOffset: offset,
    totalHint,
    done,
  };
}

async function upsertSnapshot(key: string, payload: unknown) {
  const caps = await detectSchemaCaps();
  if (!caps.snapshots) return;
  const admin = createServiceClient();
  await admin.from('ivo_snapshots').upsert(
    {
      key,
      payload: payload ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
}

/** Grup / meta snapshot’lar (düz ilan listesi değil). */
async function syncSnapshots(): Promise<{
  keys: string[];
  error?: string;
}> {
  const keys: string[] = [];
  try {
    const myZone = await ivoRequest('/expertise/my-zone');
    await upsertSnapshot('my-zone', myZone);
    keys.push('my-zone');
  } catch (e) {
    return {
      keys,
      error: e instanceof Error ? e.message : 'my-zone hatası',
    };
  }

  try {
    const competitor = await ivoRequest(
      '/expertise/competitor-fsbo?view=basic&limit=50&offset=0'
    );
    await upsertSnapshot('competitor-fsbo', competitor);
    keys.push('competitor-fsbo');
  } catch {
    /* opsiyonel */
  }

  try {
    const search = await ivoRequest('/search');
    await upsertSnapshot('search-home', search);
    keys.push('search-home');
  } catch {
    /* opsiyonel */
  }

  return { keys };
}

/** Detaydan koordinat — lat/lng boş kayıtlar. */
export async function enrichListingCoordinates(opts?: {
  limit?: number;
}): Promise<{ attempted: number; updated: number; errors: number }> {
  const admin = createServiceClient();
  const caps = await detectSchemaCaps();
  const limit = opts?.limit ?? ENRICH_BATCH;

  let list: { id: string; listing_no: string }[] = [];
  if (caps.latLng) {
    const { data, error } = await admin
      .from('ivo_listings')
      .select('id, listing_no')
      .eq('source', 'sahibinden')
      .is('lat', null)
      .order('last_seen_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    list = (data || []) as { id: string; listing_no: string }[];
  } else {
    const { data, error } = await admin
      .from('ivo_listings')
      .select('id, listing_no, raw')
      .eq('source', 'sahibinden')
      .order('last_seen_at', { ascending: false })
      .limit(limit * 3);
    if (error) throw new Error(error.message);
    list = ((data || []) as { id: string; listing_no: string; raw?: { lat?: number } }[])
      .filter((r) => r.raw?.lat == null)
      .slice(0, limit)
      .map(({ id, listing_no }) => ({ id, listing_no }));
  }

  let updated = 0;
  let errors = 0;

  for (const row of list) {
    const no = String(row.listing_no);
    try {
      const detail = await ivoRequest<{
        success?: boolean;
        data?: IvoCard;
      } | IvoCard>(`/properties/${no}`);
      const card =
        detail && typeof detail === 'object' && 'data' in detail
          ? (detail as { data?: IvoCard }).data
          : (detail as IvoCard);
      if (!card) {
        errors += 1;
        continue;
      }
      const geo = coordsFromCard(card);
      const patch: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        raw: {
          ingest_via: 'ivo-detail',
          ...(geo ? { coordinates: [geo.lng, geo.lat], lat: geo.lat, lng: geo.lng } : {}),
          card,
        },
      };
      if (caps.latLng && geo) {
        patch.lat = geo.lat;
        patch.lng = geo.lng;
      }
      if (caps.imageUrl && card.image) patch.image_url = String(card.image);
      if (caps.latLng && card.updated_at) {
        patch.ivo_updated_at = String(card.updated_at);
      }
      if (typeof card.price === 'number') {
        patch.price_tl = Math.round(card.price);
        patch.last_price_tl = Math.round(card.price);
      }

      const { error: upErr } = await admin
        .from('ivo_listings')
        .update(patch)
        .eq('id', row.id);
      if (upErr) errors += 1;
      else if (geo) updated += 1;
    } catch {
      errors += 1;
    }
  }

  return { attempted: list.length, updated, errors };
}

/**
 * my-zone mahalle merkezlerine yakın bbox ile map points → lat/lng.
 * Zone yoksa no-op.
 */
export async function enrichCoordsFromMap(opts?: {
  limit?: number;
}): Promise<{ points: number; updated: number; error?: string }> {
  const admin = createServiceClient();
  const caps = await detectSchemaCaps();

  let payload: unknown = null;
  if (caps.snapshots) {
    const { data: snap } = await admin
      .from('ivo_snapshots')
      .select('payload')
      .eq('key', 'my-zone')
      .maybeSingle();
    payload = snap?.payload ?? null;
  }
  if (!payload) {
    try {
      payload = await ivoRequest('/expertise/my-zone');
    } catch (e) {
      return {
        points: 0,
        updated: 0,
        error: e instanceof Error ? e.message : 'my-zone alınamadı',
      };
    }
  }

  const centers: [number, number][] = [];
  const collectCenters = (node: unknown, depth = 0) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      if (
        node.length >= 2 &&
        typeof node[0] === 'number' &&
        typeof node[1] === 'number' &&
        Math.abs(node[0]) <= 180 &&
        Math.abs(node[1]) <= 90
      ) {
        // [lng, lat] tercihi (IVO map)
        centers.push([node[0], node[1]]);
        return;
      }
      for (const x of node) collectCenters(x, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      const o = node as Record<string, unknown>;
      for (const key of ['center', 'coordinates', 'coord', 'centroid']) {
        if (key in o) collectCenters(o[key], depth + 1);
      }
      for (const key of [
        'districts',
        'neighborhoods',
        'mahalleler',
        'ilceler',
        'data',
        'items',
        'zones',
      ]) {
        if (key in o) collectCenters(o[key], depth + 1);
      }
    }
  };
  collectCenters(payload);

  // Benzersiz + sınırlı
  const uniq = new Map<string, [number, number]>();
  for (const c of centers) {
    uniq.set(`${c[0].toFixed(4)},${c[1].toFixed(4)}`, c);
  }
  const uniqueCenters = Array.from(uniq.values());

  if (!uniqueCenters.length) {
    // Bornova / Yeşilova fallback (canlı probe koordinatı)
    uniqueCenters.push([27.206, 38.446]);
  }

  // En fazla 6 merkez (alan limiti)
  const sample = uniqueCenters.slice(0, 6);
  const byNo = new Map<string, IvoMapPoint>();
  const d = 0.006; // ~küçük bbox (<25km²)

  for (const [lng, lat] of sample) {
    try {
      const res = await ivoMapSearch({
        area: {
          type: 'bbox',
          bounds: [
            [lng - d, lat - d],
            [lng + d, lat + d],
          ],
        },
        view: 'points',
        limit: opts?.limit ?? MAP_ENRICH_LIMIT,
      });
      for (const item of res.items as IvoMapPoint[]) {
        const no = String(item.no ?? '').replace(/\D/g, '');
        if (no && typeof item.lat === 'number' && typeof item.lng === 'number') {
          byNo.set(no, item);
        }
      }
    } catch {
      /* tek tile hatası → devam */
    }
  }

  let updated = 0;
  for (const [no, pt] of byNo) {
    if (caps.latLng) {
      const patch: Record<string, unknown> = {
        lat: pt.lat,
        lng: pt.lng,
      };
      if (caps.imageUrl && pt.image) patch.image_url = String(pt.image);
      const { data } = await admin
        .from('ivo_listings')
        .update(patch)
        .eq('source', 'sahibinden')
        .eq('listing_no', no)
        .select('id');
      if (data?.length) updated += data.length;
    } else {
      const { data: existing } = await admin
        .from('ivo_listings')
        .select('id, raw')
        .eq('source', 'sahibinden')
        .eq('listing_no', no)
        .maybeSingle();
      if (!existing) continue;
      const prevRaw =
        existing.raw && typeof existing.raw === 'object'
          ? (existing.raw as Record<string, unknown>)
          : {};
      const { data } = await admin
        .from('ivo_listings')
        .update({
          raw: {
            ...prevRaw,
            lat: pt.lat,
            lng: pt.lng,
            coordinates: [pt.lng, pt.lat],
            ingest_via_map: true,
          },
        })
        .eq('id', existing.id)
        .select('id');
      if (data?.length) updated += data.length;
    }
  }

  return { points: byNo.size, updated };
}

export type IvoSyncRunResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  session: Awaited<ReturnType<typeof getIvoSessionStatus>>;
  schema: SchemaCaps;
  feeds: FeedSyncResult[];
  snapshots: { keys: string[]; error?: string };
  enrich: {
    detail?: { attempted: number; updated: number; errors: number };
    map?: { points: number; updated: number; error?: string };
  };
  totals: { fetched: number; upserted: number; priceChanges: number };
  error?: string;
};

const DEFAULT_FEEDS: IvoSyncFeed[] = [
  'fsbo',
  'catch-dropped',
  'fsbo-aged',
  'below-average',
  'price-dropped',
  'relisted',
  'passive',
  'my-properties',
  'office-properties',
  'franchise',
  'zone-offices',
  'contact-properties',
  'takip',
];

/** Tam ofis sync — sunucu cron / korumalı API. */
export async function runIvoCorpusSync(opts?: {
  feeds?: IvoSyncFeed[];
  /** false → sadece feed listeleri */
  enrichCoords?: boolean;
  maxPagesLarge?: number;
  maxPagesSmall?: number;
}): Promise<IvoSyncRunResult> {
  const startedAt = new Date().toISOString();
  const session = await getIvoSessionStatus();
  const schema = await detectSchemaCaps();

  if (!session.ok) {
    return {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      schema,
      feeds: [],
      snapshots: { keys: [] },
      enrich: {},
      totals: { fetched: 0, upserted: 0, priceChanges: 0 },
      error: session.error || 'IVO oturumu hazır değil',
    };
  }

  const feeds = opts?.feeds?.length ? opts.feeds : DEFAULT_FEEDS;
  const maxPagesLarge = opts?.maxPagesLarge ?? DEFAULT_MAX_PAGES_LARGE;
  const maxPagesSmall = opts?.maxPagesSmall ?? DEFAULT_MAX_PAGES_SMALL;
  const doEnrich = opts?.enrichCoords !== false;

  const results: FeedSyncResult[] = [];
  let fetched = 0;
  let upserted = 0;
  let priceChanges = 0;

  for (const feed of feeds) {
    try {
      const r = await syncOneFeed(feed, {
        maxPages: LARGE_FEEDS.has(feed) ? maxPagesLarge : maxPagesSmall,
        resume: true,
      });
      results.push(r);
      fetched += r.fetched;
      upserted += r.upserted;
      priceChanges += r.priceChanges;
    } catch (e) {
      results.push({
        feed,
        fetched: 0,
        upserted: 0,
        priceChanges: 0,
        pages: 0,
        nextOffset: 0,
        totalHint: null,
        done: false,
        error: e instanceof Error ? e.message : 'Sync hatası',
      });
    }
  }

  let snapshots: { keys: string[]; error?: string };
  if (schema.snapshots) {
    snapshots = await syncSnapshots();
  } else {
    // Migration yok: yine de IVO’dan çekip keys’e yaz (kalıcı değil)
    snapshots = await syncSnapshots();
    if (!snapshots.error && snapshots.keys.length) {
      snapshots = {
        ...snapshots,
        error:
          'ivo_snapshots tablosu yok — migration 20261114_ivo_listings_map.sql gerekli',
      };
    }
  }

  const enrich: IvoSyncRunResult['enrich'] = {};
  if (doEnrich) {
    try {
      enrich.map = await enrichCoordsFromMap();
    } catch (e) {
      enrich.map = {
        points: 0,
        updated: 0,
        error: e instanceof Error ? e.message : 'map enrich hatası',
      };
    }
    try {
      enrich.detail = await enrichListingCoordinates({ limit: ENRICH_BATCH });
    } catch (e) {
      enrich.detail = {
        attempted: 0,
        updated: 0,
        errors: 1,
      };
      // keep going
      void e;
    }
  }

  const anyOk = results.some((r) => !r.error);
  const allFailed = results.length > 0 && results.every((r) => r.error);

  return {
    ok: anyOk && !allFailed,
    startedAt,
    finishedAt: new Date().toISOString(),
    session,
    schema,
    feeds: results,
    snapshots,
    enrich,
    totals: { fetched, upserted, priceChanges },
    error: allFailed ? 'Tüm feed’ler başarısız' : undefined,
  };
}
