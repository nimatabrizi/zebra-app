/**
 * Emsal / rakipler — Zebra DB’den benzer ilanlar + ₺/m² sırası.
 * Subject DB’de yoksa IVO /properties/{no} canlı çekilir (harita noktaları için).
 */

import { createServiceClient } from '../utils/supabase/admin';
import { ivoRequest } from './ivoApiClient';
import { toListingCard, type IvoListingCardModel } from './ivoListingCard';
import { ivoCardToListingRow } from './ivoOfficeLive';
import type { IvoCard } from './ivoSync';
import type { IvoListingRow } from './ivoListingTypes';

export type CompMatchLevel =
  | 'neighborhood+rooms+kind'
  | 'district+rooms+kind+area'
  | 'district+rooms+kind'
  | 'district+kind';

export type IvoCompsResult = {
  subject: IvoListingCardModel;
  matchLevel: CompMatchLevel;
  matchLabel: string;
  total: number;
  rank: number | null;
  /** 1 = en ucuz ₺/m² */
  peers: Array<IvoListingCardModel & { rank: number; isSubject: boolean }>;
};

const MATCH_LABELS: Record<CompMatchLevel, string> = {
  'neighborhood+rooms+kind': 'Aynı mahalle · oda · tür',
  'district+rooms+kind+area': 'Aynı ilçe · oda · tür · m² bandı',
  'district+rooms+kind': 'Aynı ilçe · oda · tür',
  'district+kind': 'Aynı ilçe · tür',
};

async function fetchPeers(
  subject: IvoListingRow,
  level: CompMatchLevel,
  activeOnly: boolean,
  limit: number
): Promise<IvoListingRow[]> {
  const admin = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qy: any = admin
    .from('ivo_listings')
    .select('*')
    .eq('source', 'sahibinden')
    .eq('city', subject.city!)
    .eq('district', subject.district!)
    .not('price_m2', 'is', null);
  if (subject.listing_type) qy = qy.eq('listing_type', subject.listing_type);
  if (activeOnly) qy = qy.eq('status', 'active');

  if (level === 'neighborhood+rooms+kind') {
    if (subject.neighborhood) qy = qy.eq('neighborhood', subject.neighborhood);
    if (subject.rooms) qy = qy.eq('rooms', subject.rooms);
    if (subject.kind) qy = qy.eq('kind', subject.kind);
  } else if (level === 'district+rooms+kind+area') {
    if (subject.rooms) qy = qy.eq('rooms', subject.rooms);
    if (subject.kind) qy = qy.eq('kind', subject.kind);
    if (subject.area_m2 != null) {
      const a = Number(subject.area_m2);
      qy = qy.gte('area_m2', a * 0.7).lte('area_m2', a * 1.3);
    }
  } else if (level === 'district+rooms+kind') {
    if (subject.rooms) qy = qy.eq('rooms', subject.rooms);
    if (subject.kind) qy = qy.eq('kind', subject.kind);
  } else if (level === 'district+kind') {
    if (subject.kind) qy = qy.eq('kind', subject.kind);
  }

  const { data, error } = await qy
    .order('price_m2', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as IvoListingRow[];
}

async function fetchSubjectFromIvo(listingNo: string): Promise<IvoListingRow> {
  const detail = await ivoRequest<{ success?: boolean; data?: IvoCard } | IvoCard>(
    `/properties/${listingNo}`
  );
  const card =
    detail && typeof detail === 'object' && 'data' in detail
      ? (detail as { data?: IvoCard }).data
      : (detail as IvoCard);
  if (!card) throw new Error('IVO ilan detayı boş');

  const row = ivoCardToListingRow(card);
  if (!row) throw new Error('IVO ilan dönüştürülemedi');

  // Harita / sonraki emsal için DB’ye yaz (best-effort)
  try {
    const admin = createServiceClient();
    const coords = Array.isArray(card.coordinates) ? card.coordinates : null;
    const lng =
      coords && typeof coords[0] === 'number' ? Number(coords[0]) : null;
    const lat =
      coords && typeof coords[1] === 'number' ? Number(coords[1]) : null;
    await admin.from('ivo_listings').upsert(
      {
        source: 'sahibinden',
        listing_no: row.listing_no,
        url: row.url,
        title: row.title,
        price_tl: row.price_tl,
        price_m2: row.price_m2,
        area_m2: row.area_m2,
        rooms: row.rooms,
        city: row.city,
        district: row.district,
        neighborhood: row.neighborhood,
        whom: row.whom,
        kind: row.kind,
        listing_type: row.listing_type,
        is_fsbo: row.is_fsbo,
        status: row.status,
        last_seen_at: row.last_seen_at,
        last_price_tl: row.last_price_tl,
        image_url: row.image_url,
        feeds: ['map-detail'],
        lat,
        lng,
        raw: {
          ...row.raw,
          ingest_via: 'ivo-comps-live',
          ...(lat != null && lng != null
            ? { lat, lng, coordinates: [lng, lat] }
            : {}),
        },
      },
      { onConflict: 'source,listing_no' }
    );
  } catch {
    /* upsert opsiyonel */
  }

  return row;
}

/**
 * Emsal listesi: dar eşleşmeden genişe düşer (en az 3 akran veya subject dahil).
 */
export async function listComparableListings(opts: {
  listingNo: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<IvoCompsResult> {
  const listingNo = String(opts.listingNo || '').replace(/\D/g, '');
  if (!listingNo) throw new Error('listingNo gerekli');

  const admin = createServiceClient();
  const { data: subjectRow, error } = await admin
    .from('ivo_listings')
    .select('*')
    .eq('source', 'sahibinden')
    .eq('listing_no', listingNo)
    .maybeSingle();
  if (error) throw new Error(error.message);

  let subject: IvoListingRow;
  if (subjectRow) {
    subject = subjectRow as IvoListingRow;
  } else {
    subject = await fetchSubjectFromIvo(listingNo);
  }

  if (!subject.city || !subject.district) {
    throw new Error('İlanda konum yok — emsal hesaplanamadı');
  }

  const activeOnly = opts.activeOnly !== false;
  const limit = Math.min(Math.max(opts.limit ?? 40, 5), 80);

  const levels: CompMatchLevel[] = [
    'neighborhood+rooms+kind',
    'district+rooms+kind+area',
    'district+rooms+kind',
    'district+kind',
  ];

  let peers: IvoListingRow[] = [];
  let matchLevel: CompMatchLevel = 'district+kind';

  for (const level of levels) {
    const rows = await fetchPeers(subject, level, activeOnly, limit);
    const hasSelf = rows.some((r) => r.listing_no === listingNo);
    // En az subject + 2 emsal veya level sonuna kadar
    if (rows.length >= 3 || (hasSelf && rows.length >= 2)) {
      peers = rows;
      matchLevel = level;
      break;
    }
    peers = rows;
    matchLevel = level;
  }

  // Subject listede yoksa başa ekle (sıra için price_m2 ile yeniden sırala)
  if (!peers.some((r) => r.listing_no === listingNo)) {
    peers = [...peers, subject].sort(
      (a, b) => (a.price_m2 ?? Infinity) - (b.price_m2 ?? Infinity)
    );
  }

  const ranked = peers.map((row, i) => {
    const card = toListingCard(row);
    return {
      ...card,
      rank: i + 1,
      isSubject: row.listing_no === listingNo,
    };
  });

  const self = ranked.find((r) => r.isSubject);

  return {
    subject: toListingCard(subject),
    matchLevel,
    matchLabel: MATCH_LABELS[matchLevel],
    total: ranked.length,
    rank: self?.rank ?? null,
    peers: ranked,
  };
}
