/**
 * DB satırı → Radar kart görünümü (foto, danışman, emsal metre).
 * IVO markası yok; ham kart raw.card içinde.
 */

import type { IvoListingRow } from './ivoListingTypes';

export type IvoCardAgent = {
  id?: string;
  name: string | null;
  title?: string | null;
  phone?: string | null;
  photo?: string | null;
};

export type IvoCardAgency = {
  id?: string;
  name: string | null;
  logo?: string | null;
  city?: string | null;
};

export type IvoPriceStats = {
  count?: number;
  diff_pct?: number;
  avg_price?: number;
  min_price?: number;
  max_price?: number;
  avg_m2_price?: number;
  min_m2_price?: number;
  max_m2_price?: number;
};

export type IvoPriceChange = {
  change_count?: number;
  first_price?: number | null;
  current_price?: number | null;
  prev_price?: number | null;
  last_change_date?: string | null;
};

export type IvoListingCardModel = {
  id: string;
  listingNo: string;
  url: string;
  title: string;
  imageUrl: string | null;
  photoCount: number | null;
  priceTl: number | null;
  priceM2: number | null;
  areaM2: number | null;
  rooms: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  whom: string | null;
  kind: string | null;
  type: string | null;
  listingType: string | null;
  statusLabel: string | null;
  isFsbo: boolean;
  isActive: boolean;
  agent: IvoCardAgent | null;
  agency: IvoCardAgency | null;
  priceStats: IvoPriceStats | null;
  priceChange: IvoPriceChange | null;
  lastSeenAt: string | null;
};

type RawShape = {
  image?: string;
  lat?: number;
  lng?: number;
  card?: {
    image?: string;
    photo_count?: number;
    status?: string;
    kind?: string;
    type?: string;
    m2?: number;
    m2_gross?: number;
    rooms?: string;
    whom?: string;
    is_active?: boolean;
    agent?: IvoCardAgent;
    agency?: IvoCardAgency;
    price_stats?: IvoPriceStats;
    price_change?: IvoPriceChange;
    m2_price?: number;
  };
};

export function toListingCard(row: IvoListingRow): IvoListingCardModel {
  const raw = (row.raw || {}) as RawShape;
  const card = raw.card || {};

  const priceM2 =
    row.price_m2 ??
    (typeof card.m2_price === 'number' ? Math.round(card.m2_price) : null);

  const area =
    row.area_m2 ??
    (typeof card.m2 === 'number'
      ? card.m2
      : typeof card.m2_gross === 'number'
        ? card.m2_gross
        : null);

  const statusLabel =
    card.status ||
    (row.listing_type === 'kiralik'
      ? 'Kiralık'
      : row.listing_type === 'satilik'
        ? 'Satılık'
        : null);

  return {
    id: row.id,
    listingNo: row.listing_no,
    url: row.url,
    title: row.title || `#${row.listing_no}`,
    imageUrl: row.image_url || card.image || raw.image || null,
    photoCount:
      typeof card.photo_count === 'number' ? card.photo_count : null,
    priceTl: row.price_tl,
    priceM2,
    areaM2: area,
    rooms: row.rooms || card.rooms || null,
    city: row.city,
    district: row.district,
    neighborhood: row.neighborhood,
    whom: row.whom || card.whom || null,
    kind: row.kind || card.kind || null,
    type: card.type || null,
    listingType: row.listing_type,
    statusLabel,
    isFsbo: !!row.is_fsbo,
    isActive: row.status === 'active' && card.is_active !== false,
    agent: card.agent?.name
      ? {
          id: card.agent.id,
          name: card.agent.name,
          title: card.agent.title ?? null,
          phone: card.agent.phone ?? null,
          photo: card.agent.photo ?? null,
        }
      : null,
    agency: card.agency?.name
      ? {
          id: card.agency.id,
          name: card.agency.name,
          logo: card.agency.logo ?? null,
          city: card.agency.city ?? null,
        }
      : null,
    priceStats: card.price_stats || null,
    priceChange: card.price_change || null,
    lastSeenAt: row.last_seen_at || null,
  };
}

/** Metre üzerinde pin konumu 0–100 (min→max ₺/m²). */
export function priceMeterPercent(
  priceM2: number | null,
  stats: IvoPriceStats | null
): number | null {
  if (
    priceM2 == null ||
    !stats ||
    typeof stats.min_m2_price !== 'number' ||
    typeof stats.max_m2_price !== 'number'
  ) {
    return null;
  }
  const min = stats.min_m2_price;
  const max = stats.max_m2_price;
  if (!(max > min)) return 50;
  const pct = ((priceM2 - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function formatTl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('tr-TR').format(Math.round(n))} ₺`;
}

export function formatDiffPct(diff: number | null | undefined): string | null {
  if (diff == null || !Number.isFinite(diff)) return null;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}
