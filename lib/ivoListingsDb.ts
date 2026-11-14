import { createServiceClient } from '../utils/supabase/admin';
import {
  fetchSahibindenListing,
  isFsboWhom,
  parseSahibindenListingHtml,
  type ParsedSahibindenListing,
} from './sahibindenListing';
import type { IvoListingRow } from './ivoListingTypes';

export type { IvoListingRow } from './ivoListingTypes';

function parsedToRow(p: ParsedSahibindenListing) {
  return {
    source: p.source,
    listing_no: p.listingNo,
    url: p.url,
    title: p.title,
    price_tl: p.priceTl,
    price_m2: p.priceM2,
    area_m2: p.areaM2,
    rooms: p.rooms,
    city: p.city,
    district: p.district,
    neighborhood: p.neighborhood,
    whom: p.whom,
    kind: p.kind,
    listing_type: p.listingType,
    is_fsbo: isFsboWhom(p.whom),
    status: p.status === 'inactive' ? 'inactive' : 'active',
    last_seen_at: new Date().toISOString(),
    last_price_tl: p.priceTl,
    raw: p.raw,
  };
}

async function upsertParsed(parsed: ParsedSahibindenListing): Promise<IvoListingRow> {
  const admin = createServiceClient();
  const payload = parsedToRow(parsed);

  const { data: existing } = await admin
    .from('ivo_listings')
    .select('id, price_tl')
    .eq('source', 'sahibinden')
    .eq('listing_no', parsed.listingNo)
    .maybeSingle();

  const { data, error } = await admin
    .from('ivo_listings')
    .upsert(
      {
        ...payload,
        ...(existing ? {} : { first_seen_at: new Date().toISOString() }),
      },
      { onConflict: 'source,listing_no' }
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const row = data as IvoListingRow;
  const prevPrice = existing?.price_tl ?? null;
  if (
    row.price_tl != null &&
    (prevPrice == null || Number(prevPrice) !== Number(row.price_tl))
  ) {
    await admin.from('ivo_listing_price_history').insert({
      listing_id: row.id,
      price_tl: row.price_tl,
    });
  }

  return row;
}

/** Sahibinden'den canlı çek → upsert → fiyat değiştiyse history */
export async function syncSahibindenListing(input: string): Promise<IvoListingRow> {
  const parsed = await fetchSahibindenListing(input);
  return upsertParsed(parsed);
}

/** HTML verildiğinde (eklenti / yapıştırma) — CF bypass yolu */
export async function syncSahibindenListingFromHtml(
  input: string,
  html: string
): Promise<IvoListingRow> {
  const parsed = parseSahibindenListingHtml(input, html);
  return upsertParsed(parsed);
}

export async function trackListingForUser(
  userId: string,
  listingId: string,
  note?: string
) {
  const admin = createServiceClient();
  const { error } = await admin.from('ivo_listing_tracks').upsert(
    {
      user_id: userId,
      listing_id: listingId,
      note: note?.trim() || null,
    },
    { onConflict: 'user_id,listing_id' }
  );
  if (error) throw new Error(error.message);
}

export async function listTrackedListings(userId: string): Promise<IvoListingRow[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from('ivo_listing_tracks')
    .select('listing_id, ivo_listings(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || [])
    .map((r) => r.ivo_listings as unknown as IvoListingRow)
    .filter(Boolean);
}

export type RefreshResult = {
  listingNo: string;
  ok: boolean;
  error?: string;
  listing?: IvoListingRow;
};

/**
 * IVO guncelle-oto benzeri: takip edilen (veya verilen nolar) yenile.
 * Kaynak: detay = tek ilan sayfası fetch.
 */
export async function refreshListings(
  inputs: string[],
  opts?: { delayMs?: number }
): Promise<{ results: RefreshResult[]; eklenen: number; hata: number }> {
  const delayMs = opts?.delayMs ?? 800;
  const results: RefreshResult[] = [];
  let eklenen = 0;
  let hata = 0;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const listingNo =
      input.replace(/\D/g, '').length >= 8
        ? input.replace(/\D/g, '').slice(0, 12)
        : input;
    try {
      const listing = await syncSahibindenListing(input);
      results.push({ listingNo: listing.listing_no, ok: true, listing });
      eklenen += 1;
    } catch (e) {
      hata += 1;
      results.push({
        listingNo,
        ok: false,
        error: e instanceof Error ? e.message : 'Yenileme hatası',
      });
    }
    if (i < inputs.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { results, eklenen, hata };
}

export async function refreshTrackedListings(
  userId: string,
  limit = 20
): Promise<{ results: RefreshResult[]; eklenen: number; hata: number }> {
  const tracked = await listTrackedListings(userId);
  const inputs = tracked.slice(0, limit).map((r) => r.listing_no || r.url);
  return refreshListings(inputs);
}

export type OfficeListFilters = {
  status?: 'active' | 'inactive' | 'all';
  listingType?: 'satilik' | 'kiralik' | 'all';
  q?: string;
  sort?: 'seen' | 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
};

export type OfficeListResult = {
  listings: IvoListingRow[];
  total: number;
  counts: {
    all: number;
    active: number;
    inactive: number;
    satilik: number;
    kiralik: number;
  };
};

/**
 * Ofis portföyü: office-properties feed VEYA CB 360 agency.
 * (Sadece feed etiketi IVO Ofisim’den ~90 aktif eksik bırakıyordu.)
 */
const OFFICE_CORPUS_OR =
  'feeds.cs.{"office-properties"},raw->>ingest_feed.eq.office-properties,raw->card->agency->>name.ilike.%COLDWELL BANKER 360%';

function officeBaseQuery(admin: ReturnType<typeof createServiceClient>) {
  return admin
    .from('ivo_listings')
    .select('*', { count: 'exact' })
    .eq('source', 'sahibinden')
    .or(OFFICE_CORPUS_OR);
}

/** Ofisim ilanları — filtre + sayfalama + sayaçlar */
export async function listOfficeListings(
  filters: OfficeListFilters = {}
): Promise<OfficeListResult> {
  const admin = createServiceClient();
  const limit = Math.min(Math.max(filters.limit ?? 48, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const status = filters.status || 'active';
  const listingType = filters.listingType || 'all';
  const q = filters.q?.trim() || '';
  const sort = filters.sort || 'seen';

  const applyFilters = (
    query: ReturnType<typeof officeBaseQuery>,
    opts?: { ignoreStatus?: boolean; ignoreType?: boolean }
  ) => {
    let qy = query;
    if (!opts?.ignoreStatus) {
      if (status === 'active') qy = qy.eq('status', 'active');
      else if (status === 'inactive') qy = qy.eq('status', 'inactive');
    }
    if (!opts?.ignoreType) {
      if (listingType === 'satilik') qy = qy.eq('listing_type', 'satilik');
      else if (listingType === 'kiralik') qy = qy.eq('listing_type', 'kiralik');
    }
    if (q) {
      const safe = q.replace(/[%_,]/g, '');
      if (safe) {
        qy = qy.or(
          `title.ilike.%${safe}%,listing_no.ilike.%${safe}%,city.ilike.%${safe}%,district.ilike.%${safe}%,neighborhood.ilike.%${safe}%`
        );
      }
    }
    return qy;
  };

  let listQuery = applyFilters(officeBaseQuery(admin));
  if (sort === 'price_asc') {
    listQuery = listQuery.order('price_tl', {
      ascending: true,
      nullsFirst: false,
    });
  } else if (sort === 'price_desc') {
    listQuery = listQuery.order('price_tl', {
      ascending: false,
      nullsFirst: false,
    });
  } else {
    listQuery = listQuery.order('last_seen_at', { ascending: false });
  }

  const { data, error, count } = await listQuery.range(
    offset,
    offset + limit - 1
  );
  if (error) throw new Error(error.message);

  // Sayaçlar — arama varsa daraltılmış; status/type facet’leri birbirinden bağımsız
  const countOnly = async (
    patch: (qy: ReturnType<typeof officeBaseQuery>) => ReturnType<typeof officeBaseQuery>
  ) => {
    let qy = admin
      .from('ivo_listings')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'sahibinden')
      .or(OFFICE_CORPUS_OR);
    if (q) {
      const safe = q.replace(/[%_,]/g, '');
      if (safe) {
        qy = qy.or(
          `title.ilike.%${safe}%,listing_no.ilike.%${safe}%,city.ilike.%${safe}%,district.ilike.%${safe}%,neighborhood.ilike.%${safe}%`
        );
      }
    }
    qy = patch(qy);
    const { count: c, error: e } = await qy;
    if (e) throw new Error(e.message);
    return c ?? 0;
  };

  const [all, active, inactive, satilik, kiralik] = await Promise.all([
    countOnly((qy) => qy),
    countOnly((qy) => qy.eq('status', 'active')),
    countOnly((qy) => qy.eq('status', 'inactive')),
    countOnly((qy) => {
      let x = qy;
      if (status === 'active') x = x.eq('status', 'active');
      else if (status === 'inactive') x = x.eq('status', 'inactive');
      return x.eq('listing_type', 'satilik');
    }),
    countOnly((qy) => {
      let x = qy;
      if (status === 'active') x = x.eq('status', 'active');
      else if (status === 'inactive') x = x.eq('status', 'inactive');
      return x.eq('listing_type', 'kiralik');
    }),
  ]);

  return {
    listings: (data || []) as IvoListingRow[],
    total: count ?? 0,
    counts: { all, active, inactive, satilik, kiralik },
  };
}

export async function listFsboListings(limit = 60): Promise<IvoListingRow[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from('ivo_listings')
    .select('*')
    .eq('source', 'sahibinden')
    .eq('is_fsbo', true)
    .eq('status', 'active')
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as IvoListingRow[];
}

export async function listRecentListings(limit = 60): Promise<IvoListingRow[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from('ivo_listings')
    .select('*')
    .eq('source', 'sahibinden')
    .eq('status', 'active')
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as IvoListingRow[];
}
