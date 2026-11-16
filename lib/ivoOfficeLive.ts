/**
 * Ofis ilanları — IVO’dan canlı liste.
 * DB sync yedek / emsal / harita için kalır.
 */

import { ivoRequest } from './ivoApiClient';
import {
  isFsboWhom,
  resolveSahibindenListingUrl,
} from './sahibindenListing';
import type { IvoCard } from './ivoSync';
import type { IvoListingRow } from './ivoListingTypes';
import type { OfficeListFilters, OfficeListResult } from './ivoListingsDb';

type IvoListResponse = {
  success?: boolean;
  data?: IvoCard[];
  meta?: { total?: number; limit?: number; offset?: number };
};

function listingTypeFromStatus(status?: string): string | null {
  if (!status) return null;
  const s = status.toLocaleLowerCase('tr-TR');
  if (s.includes('kira')) return 'kiralik';
  if (s.includes('sat')) return 'satilik';
  return null;
}

/** IVO kart → Radar’ın beklediği satır şekli (DB’siz). */
export function ivoCardToListingRow(
  card: IvoCard,
  feed = 'office-properties'
): IvoListingRow | null {
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
  const now = new Date().toISOString();
  const feedKey = feed || 'office-properties';
  const forceFsbo =
    feedKey === 'fsbo' ||
    feedKey === 'catch-dropped' ||
    feedKey === 'fsbo-aged' ||
    feedKey === 'below-average' ||
    feedKey === 'price-dropped' ||
    feedKey === 'relisted' ||
    feedKey === 'passive' ||
    feedKey === 'competitor-fsbo' ||
    feedKey === 'contact-properties';

  return {
    id: `live-${listingNo}`,
    source: 'sahibinden',
    listing_no: listingNo,
    url: resolveSahibindenListingUrl(
      card.url ? String(card.url) : null,
      listingNo,
      {
        title: card.title ? String(card.title) : null,
        kind: card.kind ? String(card.kind) : null,
        status: card.status ? String(card.status) : null,
      }
    ),
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
    is_fsbo: forceFsbo || isFsboWhom(whom),
    status: active ? 'active' : 'inactive',
    first_seen_at: now,
    last_seen_at: now,
    last_price_tl: priceTl,
    image_url: card.image ? String(card.image) : null,
    feeds: [feedKey],
    raw: {
      ingest_via: 'ivo-live',
      ingest_feed: feedKey,
      card,
      image: card.image || null,
    },
  };
}

function buildOfficeQuery(filters: OfficeListFilters): string {
  const limit = Math.min(Math.max(filters.limit ?? 48, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const qs = new URLSearchParams({
    view: 'basic',
    limit: String(limit),
    offset: String(offset),
  });

  const status = filters.status || 'active';
  if (status === 'active') qs.set('is_active', 'true');
  else if (status === 'inactive') qs.set('is_active', 'false');
  // all → is_active yok

  const listingType = filters.listingType || 'all';
  if (listingType === 'satilik') qs.set('status', 'Satılık');
  else if (listingType === 'kiralik') qs.set('status', 'Kiralık');

  const q = filters.q?.trim();
  if (q) qs.set('q', q);

  // IVO varsayılan tarih; fiyat sıralama desteklenmiyorsa yine meta doğru kalır
  if (filters.sort === 'price_asc') qs.set('sort', 'price_asc');
  else if (filters.sort === 'price_desc') qs.set('sort', 'price_desc');

  return `/expertise/office-properties?${qs.toString()}`;
}

async function fetchOfficePage(
  filters: OfficeListFilters
): Promise<{ cards: IvoCard[]; total: number }> {
  const res = await ivoRequest<IvoListResponse>(buildOfficeQuery(filters));
  const cards = Array.isArray(res?.data) ? res.data : [];
  const total = typeof res?.meta?.total === 'number' ? res.meta.total : cards.length;
  return { cards, total };
}

async function fetchOfficeTotal(
  patch: Partial<OfficeListFilters>
): Promise<number> {
  const { total } = await fetchOfficePage({
    status: 'all',
    listingType: 'all',
    limit: 1,
    offset: 0,
    ...patch,
  });
  return total;
}

/** Canlı ofis listesi + sayaçlar (IVO). */
export async function listOfficeListingsLive(
  filters: OfficeListFilters = {}
): Promise<OfficeListResult & { source: 'live' }> {
  const status = filters.status || 'active';
  const listingType = filters.listingType || 'all';
  const q = filters.q?.trim() || '';

  const page = await fetchOfficePage(filters);
  const listings = page.cards
    .map((c) => ivoCardToListingRow(c, 'office-properties'))
    .filter((r): r is IvoListingRow => !!r);

  // Sayaçlar — mevcut filtre bağlamında (q taşınır)
  const baseQ = q ? { q } : {};
  const [all, active, inactive, satilik, kiralik] = await Promise.all([
    fetchOfficeTotal({ ...baseQ, status: 'all', listingType: 'all' }),
    fetchOfficeTotal({ ...baseQ, status: 'active', listingType: 'all' }),
    fetchOfficeTotal({ ...baseQ, status: 'inactive', listingType: 'all' }),
    fetchOfficeTotal({
      ...baseQ,
      status,
      listingType: 'satilik',
    }),
    fetchOfficeTotal({
      ...baseQ,
      status,
      listingType: 'kiralik',
    }),
  ]);

  // listingType facet’inde status=all iken satılık/kiralık da anlamlı
  void listingType;

  return {
    listings,
    total: page.total,
    counts: { all, active, inactive, satilik, kiralik },
    source: 'live',
  };
}
