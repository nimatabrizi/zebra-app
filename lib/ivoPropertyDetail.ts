/**
 * IVO ilan detayı — GET /properties/{no}
 */

import { ivoRequest } from './ivoApiClient';
import { resolveSahibindenListingUrl } from './sahibindenListing';
import type { IvoCard } from './ivoSync';
import type {
  IvoCardAgency,
  IvoCardAgent,
  IvoPriceChange,
  IvoPriceStats,
} from './ivoListingCard';

export type IvoPropertyDetails = {
  top_details?: Record<string, string | number | boolean | null>;
  bottom_details?: Record<string, string[] | string | number | null>;
};

export type IvoStatusSummary = {
  active_count?: number;
  passive_count?: number;
  total?: number;
  last_change_date?: string | null;
  active_days?: number;
};

export type IvoPriceFx = {
  rate_source?: string;
  basis?: string;
  usd?: number;
  eur?: number;
  rate_date?: string;
};

export type IvoIletisim = {
  acik?: boolean;
  neden?: string | null;
  rehber_adi?: string | null;
};

export type IvoPropertyDetail = {
  listingNo: string;
  title: string;
  url: string;
  price: number | null;
  m2Price: number | null;
  m2: number | null;
  m2Gross: number | null;
  rooms: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  kind: string | null;
  type: string | null;
  status: string | null;
  whom: string | null;
  isActive: boolean;
  descriptionHtml: string | null;
  images: string[];
  image: string | null;
  photoCount: number | null;
  coordinates: [number, number] | null;
  propertyDetails: IvoPropertyDetails | null;
  facts: Record<string, string | number | boolean | null> | null;
  pastPrices: Record<string, number>;
  firstPrice: number | null;
  priceChange: IvoPriceChange | null;
  priceStats: IvoPriceStats | null;
  priceFx: IvoPriceFx | null;
  statusSummary: IvoStatusSummary | null;
  agent: IvoCardAgent | null;
  agency: IvoCardAgency | null;
  iletisim: IvoIletisim | null;
  siteAdi: string | null;
  date: string | null;
  firstDate: string | null;
  updatedAt: string | null;
};

function unwrapCard(
  detail: { success?: boolean; data?: IvoCard } | IvoCard | null
): IvoCard | null {
  if (!detail || typeof detail !== 'object') return null;
  if ('data' in detail) {
    const inner = (detail as { data?: IvoCard }).data;
    if (inner && typeof inner === 'object') return inner;
  }
  if ('no' in detail || 'title' in detail) return detail as IvoCard;
  return null;
}

export async function fetchIvoPropertyDetail(
  listingNo: string
): Promise<IvoPropertyDetail> {
  const no = String(listingNo || '').replace(/\D/g, '');
  if (!no || no.length < 8) throw new Error('Geçersiz ilan no');

  const raw = await ivoRequest<{ success?: boolean; data?: IvoCard } | IvoCard>(
    `/properties/${no}`
  );
  const card = unwrapCard(raw);
  if (!card) throw new Error('İlan detayı bulunamadı');

  const coords = Array.isArray(card.coordinates) ? card.coordinates : null;
  const lng =
    coords && typeof coords[0] === 'number' ? Number(coords[0]) : null;
  const lat =
    coords && typeof coords[1] === 'number' ? Number(coords[1]) : null;

  const images = Array.isArray(card.images)
    ? card.images.map(String).filter(Boolean)
    : [];
  if (card.image && !images.includes(String(card.image))) {
    images.unshift(String(card.image));
  }

  const past =
    card.past_prices && typeof card.past_prices === 'object'
      ? (card.past_prices as Record<string, number>)
      : {};

  const agent = card.agent as IvoCardAgent | undefined;
  const agency = card.agency as IvoCardAgency | undefined;

  return {
    listingNo: String(card.no ?? no),
    title: card.title ? String(card.title) : `#${no}`,
    url: resolveSahibindenListingUrl(
      card.url ? String(card.url) : null,
      card.no ?? no,
      {
        title: card.title ? String(card.title) : null,
        kind: card.kind ? String(card.kind) : null,
        status: card.status ? String(card.status) : null,
      }
    ),
    price: typeof card.price === 'number' ? card.price : null,
    m2Price: typeof card.m2_price === 'number' ? card.m2_price : null,
    m2: typeof card.m2 === 'number' ? card.m2 : null,
    m2Gross: typeof card.m2_gross === 'number' ? card.m2_gross : null,
    rooms: card.rooms ? String(card.rooms) : null,
    city: card.city ? String(card.city) : null,
    district: card.district ? String(card.district) : null,
    neighborhood: card.neighborhood ? String(card.neighborhood) : null,
    kind: card.kind ? String(card.kind) : null,
    type: card.type ? String(card.type) : null,
    status: card.status ? String(card.status) : null,
    whom: card.whom ? String(card.whom) : null,
    isActive: card.is_active !== false,
    descriptionHtml: card.description ? String(card.description) : null,
    images,
    image: card.image ? String(card.image) : images[0] || null,
    photoCount:
      typeof card.photo_count === 'number' ? card.photo_count : images.length,
    coordinates:
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? [lng, lat]
        : null,
    propertyDetails: (card.property_details as IvoPropertyDetails) || null,
    facts:
      card.facts && typeof card.facts === 'object'
        ? (card.facts as Record<string, string | number | boolean | null>)
        : null,
    pastPrices: past,
    firstPrice:
      typeof card.first_price === 'number' ? card.first_price : null,
    priceChange: (card.price_change as IvoPriceChange) || null,
    priceStats: (card.price_stats as IvoPriceStats) || null,
    priceFx: (card.price_fx as IvoPriceFx) || null,
    statusSummary: (card.status_summary as IvoStatusSummary) || null,
    agent: agent?.name
      ? {
          id: agent.id,
          name: agent.name,
          title: agent.title ?? null,
          phone: agent.phone ?? null,
          photo: agent.photo ?? null,
        }
      : null,
    agency: agency?.name
      ? {
          id: agency.id,
          name: agency.name,
          logo: agency.logo ?? null,
          city: agency.city ?? null,
          phone: agency.phone ?? null,
        }
      : null,
    iletisim: (card.iletisim as IvoIletisim) || null,
    siteAdi: card.site_adi ? String(card.site_adi) : null,
    date: card.date ? String(card.date) : null,
    firstDate: card.first_date ? String(card.first_date) : null,
    updatedAt: card.updated_at ? String(card.updated_at) : null,
  };
}
