/**
 * Radar → FSBO Havuzu — IVO expertise feed’leri (AI / değerleme hariç).
 * Kaynak: app.ivo.tc bindings (group:fsbo + aktif/pasif yaş kırılımları).
 */

import { ivoRequest } from './ivoApiClient';
import { ivoCardToListingRow } from './ivoOfficeLive';
import type { IvoCard } from './ivoSync';
import type { IvoListingRow } from './ivoListingTypes';

export type FsboSectionId =
  | 'fsbo'
  | 'catch-dropped'
  | 'competitor'
  | 'rehber'
  | 'aged'
  | 'below-average'
  | 'price-dropped'
  | 'relisted'
  | 'passive';

/** Aktif / Pasif FSBO yaş alt kırılımları (IVO uzmanlık). */
export type FsboAgeBucket =
  | 'all'
  | '7d'
  | '0-15'
  | '16-30'
  | '31+';

export type FsboSectionDef = {
  id: FsboSectionId;
  label: string;
  /** Kısa alt açıklama */
  hint: string;
  feed: string;
  /** Yaş kırılımı destekler (fsbo / passive) */
  ageBuckets?: boolean;
};

export const FSBO_SECTIONS: FsboSectionDef[] = [
  {
    id: 'fsbo',
    label: 'Aktif FSBO',
    hint: 'Sahibinden / mal sahibi aktif ilanlar',
    feed: 'fsbo',
    ageBuckets: true,
  },
  {
    id: 'catch-dropped',
    label: 'Düşeni yakala',
    hint: 'Son 7 günde düşenler',
    feed: 'catch-dropped',
  },
  {
    id: 'competitor',
    label: 'Rakip FSBO',
    hint: 'Benzer portföydeki rakip sahibinden ilanlar',
    feed: 'competitor-fsbo',
  },
  {
    id: 'rehber',
    label: 'Rehberimden',
    hint: 'Rehber eşleşmeli ilanlar',
    feed: 'contact-properties',
  },
  {
    id: 'aged',
    label: 'Yorgun',
    hint: 'Uzun süredir yayında kalan FSBO',
    feed: 'fsbo-aged',
  },
  {
    id: 'below-average',
    label: 'Ortalama altı',
    hint: 'Bölge ortalamasının altında',
    feed: 'below-average',
  },
  {
    id: 'price-dropped',
    label: 'Fiyatı düşenler',
    hint: 'Fiyat düşüşü olan ilanlar',
    feed: 'price-dropped',
  },
  {
    id: 'relisted',
    label: 'Tekrar yayına',
    hint: 'Yeniden yayına alınanlar',
    feed: 'relisted',
  },
  {
    id: 'passive',
    label: 'Pasif FSBO',
    hint: 'Pasife düşmüş sahibinden ilanlar',
    feed: 'passive',
    ageBuckets: true,
  },
];

export const FSBO_AGE_BUCKETS: { id: FsboAgeBucket; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: '7d', label: '1 hafta' },
  { id: '0-15', label: '1–15 gün' },
  { id: '16-30', label: '15–30 gün' },
  { id: '31+', label: '30+ gün' },
];

export type FsboListFilters = {
  section: FsboSectionId;
  age?: FsboAgeBucket;
  listingType?: 'all' | 'satilik' | 'kiralik';
  q?: string;
  limit?: number;
  offset?: number;
  /** Rakip FSBO: seçili grup anahtarı */
  groupKey?: string | null;
  /** Tüm alt başlık sayaçlarını da çek (ağır) */
  withCounts?: boolean;
};

export type FsboCompetitorGroup = {
  key: string;
  label: string;
  kind: string | null;
  type: string | null;
  status: string | null;
  rooms: string | null;
  myCount: number;
  competitorCount: number;
};

export type FsboListResult = {
  listings: IvoListingRow[];
  total: number;
  section: FsboSectionId;
  feed: string;
  source: 'live';
  counts: Record<FsboSectionId, number | null>;
  groups?: FsboCompetitorGroup[];
  groupKey?: string | null;
  totalGroups?: number;
  totalCompetitors?: number;
};

type IvoListResponse = {
  success?: boolean;
  data?: IvoCard[] | CompetitorPayload;
  meta?: { total?: number; limit?: number; offset?: number };
};

type CompetitorGroupRaw = {
  key?: {
    kind?: string;
    type?: string;
    status?: string;
    rooms?: string;
  };
  label?: string;
  my_count?: number;
  competitor_count?: number;
  competitors?: IvoCard[];
  my_listings?: IvoCard[];
};

type CompetitorPayload = {
  groups?: CompetitorGroupRaw[];
  total_groups?: number;
  total_competitors?: number;
};

function isCompetitorPayload(data: unknown): data is CompetitorPayload {
  return !!data && typeof data === 'object' && !Array.isArray(data);
}

function groupKeyOf(g: CompetitorGroupRaw, index: number): string {
  const k = g.key;
  if (k && typeof k === 'object') {
    return [k.kind, k.type, k.status, k.rooms].map((x) => String(x ?? '')).join('|');
  }
  if (g.label) return g.label;
  return `g-${index}`;
}

function mapGroup(g: CompetitorGroupRaw, index: number): FsboCompetitorGroup {
  return {
    key: groupKeyOf(g, index),
    label: g.label || groupKeyOf(g, index),
    kind: g.key?.kind ? String(g.key.kind) : null,
    type: g.key?.type ? String(g.key.type) : null,
    status: g.key?.status ? String(g.key.status) : null,
    rooms: g.key?.rooms ? String(g.key.rooms) : null,
    myCount: typeof g.my_count === 'number' ? g.my_count : 0,
    competitorCount:
      typeof g.competitor_count === 'number' ? g.competitor_count : 0,
  };
}

function applyAgeParams(
  qs: URLSearchParams,
  section: FsboSectionId,
  age: FsboAgeBucket | undefined
) {
  if (!age || age === 'all') {
    if (section === 'passive') qs.set('period', 'all');
    return;
  }
  if (section === 'fsbo') {
    if (age === '7d') qs.set('period', '7d');
    else if (age === '0-15') {
      qs.set('period', 'custom');
      qs.set('days_from', '0');
      qs.set('days_to', '15');
    } else if (age === '16-30') {
      qs.set('period', 'custom');
      qs.set('days_from', '16');
      qs.set('days_to', '30');
    } else if (age === '31+') {
      qs.set('period', 'custom');
      qs.set('days_from', '31');
      qs.set('days_to', '36500');
    }
    return;
  }
  if (section === 'passive') {
    qs.set('yas_alani', 'updated_at');
    if (age === '7d') qs.set('period', '7d');
    else if (age === '0-15') {
      qs.set('period', 'custom');
      qs.set('days_from', '8');
      qs.set('days_to', '15');
    } else if (age === '16-30') qs.set('period', '15-30d');
    else if (age === '31+') {
      qs.set('period', 'custom');
      qs.set('days_from', '31');
      qs.set('days_to', '36500');
    }
  }
}

function buildSectionPath(
  section: FsboSectionId,
  filters: FsboListFilters
): string {
  const limit = Math.min(Math.max(filters.limit ?? 48, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const qs = new URLSearchParams({
    view: 'basic',
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.listingType === 'satilik') qs.set('status', 'Satılık');
  else if (filters.listingType === 'kiralik') qs.set('status', 'Kiralık');

  const q = filters.q?.trim();
  if (q) qs.set('q', q);

  switch (section) {
    case 'fsbo':
      applyAgeParams(qs, 'fsbo', filters.age);
      return `/expertise/fsbo?${qs.toString()}`;
    case 'catch-dropped':
      qs.set('window', 'week');
      return `/expertise/catch-dropped?${qs.toString()}`;
    case 'rehber':
      qs.set('is_active', 'true');
      return `/expertise/contact-properties?${qs.toString()}`;
    case 'aged':
      // days gönderilmez — backend notification_days
      return `/expertise/fsbo-aged?${qs.toString()}`;
    case 'below-average':
      return `/expertise/below-average?${qs.toString()}`;
    case 'price-dropped':
      return `/expertise/price-dropped?${qs.toString()}`;
    case 'relisted':
      return `/expertise/relisted?${qs.toString()}`;
    case 'passive':
      applyAgeParams(qs, 'passive', filters.age);
      return `/expertise/passive?${qs.toString()}`;
    case 'competitor':
      return `/expertise/competitor-fsbo?with_listings=true&limit_per_group=40`;
    default:
      return `/expertise/fsbo?${qs.toString()}`;
  }
}

function sectionFeed(section: FsboSectionId): string {
  return FSBO_SECTIONS.find((s) => s.id === section)?.feed || 'fsbo';
}

async function fetchCount(
  section: FsboSectionId
): Promise<number | null> {
  try {
    if (section === 'competitor') {
      const res = await ivoRequest<IvoListResponse>(
        '/expertise/competitor-fsbo'
      );
      const data = res?.data;
      if (isCompetitorPayload(data)) {
        if (typeof data.total_competitors === 'number') {
          return data.total_competitors;
        }
        const groups = Array.isArray(data.groups) ? data.groups : [];
        return groups.reduce(
          (n, g) => n + (typeof g.competitor_count === 'number' ? g.competitor_count : 0),
          0
        );
      }
      return null;
    }
    const path = buildSectionPath(section, {
      section,
      limit: 1,
      offset: 0,
      age: 'all',
    });
    const res = await ivoRequest<IvoListResponse>(path);
    if (typeof res?.meta?.total === 'number') return res.meta.total;
    if (Array.isArray(res?.data)) return res.data.length;
    return null;
  } catch {
    return null;
  }
}

export async function listFsboSectionCounts(): Promise<
  Record<FsboSectionId, number | null>
> {
  const entries = await Promise.all(
    FSBO_SECTIONS.map(async (s) => [s.id, await fetchCount(s.id)] as const)
  );
  const out = {} as Record<FsboSectionId, number | null>;
  for (const [id, n] of entries) out[id] = n;
  return out;
}

async function listCompetitor(
  filters: FsboListFilters
): Promise<FsboListResult> {
  const res = await ivoRequest<IvoListResponse>(
    '/expertise/competitor-fsbo?with_listings=true&limit_per_group=40'
  );
  const data = res?.data;
  const payload = isCompetitorPayload(data) ? data : { groups: [] };
  const rawGroups = Array.isArray(payload.groups) ? payload.groups : [];
  const groups = rawGroups.map(mapGroup);
  const selected =
    filters.groupKey && groups.some((g) => g.key === filters.groupKey)
      ? filters.groupKey
      : groups[0]?.key || null;

  const raw =
    selected != null
      ? rawGroups.find((g, i) => groupKeyOf(g, i) === selected)
      : undefined;
  const cards = Array.isArray(raw?.competitors) ? raw!.competitors! : [];
  const listings = cards
    .map((c) => ivoCardToListingRow(c, 'competitor-fsbo'))
    .filter((r): r is IvoListingRow => !!r);

  const totalCompetitors =
    typeof payload.total_competitors === 'number'
      ? payload.total_competitors
      : groups.reduce((n, g) => n + g.competitorCount, 0);

  return {
    listings,
    total: listings.length,
    section: 'competitor',
    feed: 'competitor-fsbo',
    source: 'live',
    counts: {} as Record<FsboSectionId, number | null>,
    groups,
    groupKey: selected,
    totalGroups:
      typeof payload.total_groups === 'number'
        ? payload.total_groups
        : groups.length,
    totalCompetitors,
  };
}

export async function listFsboLive(
  filters: FsboListFilters
): Promise<FsboListResult> {
  const section = filters.section || 'fsbo';

  if (section === 'competitor') {
    const result = await listCompetitor(filters);
    if (filters.withCounts) {
      try {
        result.counts = await listFsboSectionCounts();
      } catch {
        result.counts = emptyCounts();
      }
    } else {
      result.counts = emptyCounts();
      result.counts.competitor = result.totalCompetitors ?? result.total;
    }
    return result;
  }

  const path = buildSectionPath(section, filters);
  const res = await ivoRequest<IvoListResponse>(path);
  const cards = Array.isArray(res?.data) ? res.data : [];
  const feed = sectionFeed(section);
  const listings = cards
    .map((c) => ivoCardToListingRow(c, feed))
    .filter((r): r is IvoListingRow => !!r);
  const total =
    typeof res?.meta?.total === 'number' ? res.meta.total : listings.length;

  const counts = emptyCounts();
  if (filters.withCounts) {
    try {
      Object.assign(counts, await listFsboSectionCounts());
    } catch {
      /* sayaç opsiyonel */
    }
  }
  counts[section] = total;

  return {
    listings,
    total,
    section,
    feed,
    source: 'live',
    counts,
  };
}

function emptyCounts(): Record<FsboSectionId, number | null> {
  const out = {} as Record<FsboSectionId, number | null>;
  for (const s of FSBO_SECTIONS) out[s.id] = null;
  return out;
}

export function parseFsboSection(raw: string | null): FsboSectionId {
  const id = String(raw || '').trim() as FsboSectionId;
  if (FSBO_SECTIONS.some((s) => s.id === id)) return id;
  return 'fsbo';
}

export function parseFsboAge(raw: string | null): FsboAgeBucket {
  const id = String(raw || '').trim() as FsboAgeBucket;
  if (FSBO_AGE_BUCKETS.some((b) => b.id === id)) return id;
  return 'all';
}
