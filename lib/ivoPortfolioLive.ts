/**
 * Portföylerim (my-properties) + Portföy Havuzu (office-properties)
 * IVO canlı liste + desteklenen sunucu filtreleri + sayfa içi post-filtre.
 */

import { ivoRequest } from './ivoApiClient';
import { ivoCardToListingRow } from './ivoOfficeLive';
import type { IvoCard } from './ivoSync';
import type { IvoListingRow } from './ivoListingTypes';

export type PortfolioScope = 'my' | 'pool';

/** IVO period literal veya custom gün penceresi */
export type PortfolioPeriod =
  | 'all'
  | '7d'
  | '8-14d'
  | '15-30d'
  | '31-90d'
  | '90d-1y'
  | 'custom';

export type PortfolioSignal =
  | 'price_down'
  | 'price_up'
  | 'relisted';

export type PortfolioFeature =
  | 'krediye_uygun'
  | 'photo'
  | 'esyali'
  | 'takas'
  | 'asansor'
  | 'site'
  | 'balkon';

export type PortfolioTwinRelation = 'ikiz' | 'kardes' | 'benzer';

export type PortfolioFilters = {
  status?: 'active' | 'inactive' | 'all';
  listingType?: 'all' | 'satilik' | 'kiralik';
  q?: string;
  /** Sunucuya tek oda gider; çoklu seçimde post-filtre */
  rooms?: string[];
  cities?: string[];
  districts?: string[];
  neighborhoods?: string[];
  /** Konut / İş Yeri / Arazi / Bina */
  kinds?: string[];
  priceMin?: number;
  priceMax?: number;
  /** total = price_tl, m2 = price_m2 */
  priceMode?: 'total' | 'm2';
  m2Min?: number;
  m2Max?: number;
  period?: PortfolioPeriod;
  daysFrom?: number | null;
  daysTo?: number | null;
  sort?: 'seen' | 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
  /** Portföylerim: Zebra kullanıcı adı → IVO agent eşlemesi */
  agentName?: string;
  /** Havuz: danışman / ofis post-filtre */
  agentIds?: string[];
  agencyNames?: string[];
  signals?: PortfolioSignal[];
  features?: PortfolioFeature[];
  twinRelation?: PortfolioTwinRelation | null;
};

export type PortfolioFacetBucket = { value: string; count: number };

export type PortfolioFacets = {
  cities: PortfolioFacetBucket[];
  districts: PortfolioFacetBucket[];
  neighborhoods: PortfolioFacetBucket[];
  rooms: PortfolioFacetBucket[];
  kinds: PortfolioFacetBucket[];
  agents: PortfolioFacetBucket[];
  agencies: PortfolioFacetBucket[];
};

export type PortfolioListResult = {
  listings: IvoListingRow[];
  total: number;
  counts: {
    all: number;
    active: number;
    inactive: number;
    satilik: number;
    kiralik: number;
  };
  facets: PortfolioFacets;
  source: 'live';
  feed: string;
  pencere?: Record<string, unknown> | null;
  postFiltered: boolean;
  /** Portföylerim: Zebra adı IVO agent ile eşleşmedi */
  unmatchedAgent?: boolean;
  matchedAgentName?: string | null;
};

type IvoListResponse = {
  success?: boolean;
  data?: IvoCard[];
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    pencere?: Record<string, unknown>;
  };
};

function feedPath(scope: PortfolioScope): string {
  return scope === 'my'
    ? '/expertise/my-properties'
    : '/expertise/office-properties';
}

function norm(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function buildQuery(
  scope: PortfolioScope,
  filters: PortfolioFilters,
  opts?: { limit?: number; offset?: number; rooms?: string | null }
): string {
  const limit = Math.min(Math.max(opts?.limit ?? filters.limit ?? 48, 1), 100);
  const offset = Math.max(opts?.offset ?? filters.offset ?? 0, 0);
  const qs = new URLSearchParams({
    view: 'basic',
    limit: String(limit),
    offset: String(offset),
  });

  const status = filters.status || 'active';
  if (status === 'active') qs.set('is_active', 'true');
  else if (status === 'inactive') qs.set('is_active', 'false');

  const listingType = filters.listingType || 'all';
  if (listingType === 'satilik') qs.set('status', 'Satılık');
  else if (listingType === 'kiralik') qs.set('status', 'Kiralık');

  const q = filters.q?.trim();
  if (q) qs.set('q', q);

  const roomSingle =
    opts?.rooms !== undefined
      ? opts.rooms
      : filters.rooms?.length === 1
        ? filters.rooms[0]
        : null;
  if (roomSingle) qs.set('rooms', roomSingle);

  const period = filters.period || 'all';
  if (period !== 'all') {
    qs.set('period', period);
    if (period === 'custom') {
      if (filters.daysFrom != null) qs.set('days_from', String(filters.daysFrom));
      if (filters.daysTo != null) qs.set('days_to', String(filters.daysTo));
    }
  }

  if (filters.sort === 'price_asc') qs.set('sort', 'price_asc');
  else if (filters.sort === 'price_desc') qs.set('sort', 'price_desc');

  if (filters.kinds?.length === 1) qs.set('kind', filters.kinds[0]);
  if (filters.twinRelation) qs.set('relation', filters.twinRelation);
  if (filters.signals?.includes('price_down')) qs.set('price_dropped', 'true');
  if (filters.signals?.includes('price_up')) qs.set('price_up', 'true');
  if (filters.signals?.includes('relisted')) qs.set('relisted', 'true');

  void scope;
  return `${feedPath(scope)}?${qs.toString()}`;
}

async function fetchPage(
  scope: PortfolioScope,
  filters: PortfolioFilters,
  opts?: { limit?: number; offset?: number; rooms?: string | null }
): Promise<{ cards: IvoCard[]; total: number; pencere: Record<string, unknown> | null }> {
  const res = await ivoRequest<IvoListResponse>(
    buildQuery(scope, filters, opts)
  );
  const cards = Array.isArray(res?.data) ? res.data : [];
  const total =
    typeof res?.meta?.total === 'number' ? res.meta.total : cards.length;
  return {
    cards,
    total,
    pencere: (res?.meta?.pencere as Record<string, unknown>) || null,
  };
}

function factFlag(
  card: IvoCard,
  keys: string[]
): string | boolean | number | null {
  const facts = (card.facts || {}) as Record<
    string,
    string | number | boolean | null
  >;
  for (const k of keys) {
    if (facts[k] != null && facts[k] !== '') return facts[k];
  }
  return null;
}

function isYes(v: string | boolean | number | null): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLocaleLowerCase('tr-TR');
  return ['var', 'evet', 'uygun', 'true', '1'].some((x) => s.includes(x));
}

function needsPostFilter(filters: PortfolioFilters): boolean {
  return Boolean(
    (filters.rooms && filters.rooms.length > 1) ||
      (filters.kinds && filters.kinds.length > 1) ||
      (filters.cities && filters.cities.length > 0) ||
      (filters.districts && filters.districts.length > 0) ||
      (filters.neighborhoods && filters.neighborhoods.length > 0) ||
      (filters.agentIds && filters.agentIds.length > 0) ||
      (filters.agencyNames && filters.agencyNames.length > 0) ||
      (filters.signals && filters.signals.length > 0) ||
      (filters.features && filters.features.length > 0) ||
      filters.priceMin != null ||
      filters.priceMax != null ||
      filters.m2Min != null ||
      filters.m2Max != null
  );
}

function cardPassesPostFilter(card: IvoCard, filters: PortfolioFilters): boolean {
  if (filters.rooms && filters.rooms.length > 0) {
    const r = card.rooms ? String(card.rooms) : '';
    if (!filters.rooms.includes(r)) return false;
  }
  if (filters.kinds && filters.kinds.length > 0) {
    const k = card.kind ? String(card.kind) : '';
    if (!filters.kinds.some((x) => namesMatch(x, k))) return false;
  }
  if (filters.cities && filters.cities.length > 0) {
    const c = card.city ? String(card.city) : '';
    if (!filters.cities.some((x) => namesMatch(x, c))) return false;
  }
  if (filters.districts && filters.districts.length > 0) {
    const d = card.district ? String(card.district) : '';
    if (!filters.districts.some((x) => namesMatch(x, d))) return false;
  }
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    const n = card.neighborhood ? String(card.neighborhood) : '';
    if (!filters.neighborhoods.some((x) => namesMatch(x, n))) return false;
  }
  if (filters.agentIds && filters.agentIds.length > 0) {
    const agent = card.agent as { id?: string; name?: string } | undefined;
    const id = agent?.id ? String(agent.id) : '';
    const name = agent?.name ? String(agent.name) : '';
    if (
      !filters.agentIds.some(
        (x) => x === id || (name && namesMatch(x, name))
      )
    ) {
      return false;
    }
  }
  if (filters.agencyNames && filters.agencyNames.length > 0) {
    const agency = card.agency as { name?: string } | undefined;
    const name = agency?.name ? String(agency.name) : '';
    if (!filters.agencyNames.some((x) => namesMatch(x, name))) return false;
  }

  const mode = filters.priceMode || 'total';
  const priceVal =
    mode === 'm2'
      ? typeof card.m2_price === 'number'
        ? card.m2_price
        : null
      : typeof card.price === 'number'
        ? card.price
        : null;
  if (filters.priceMin != null && (priceVal == null || priceVal < filters.priceMin)) {
    return false;
  }
  if (filters.priceMax != null && (priceVal == null || priceVal > filters.priceMax)) {
    return false;
  }

  const m2 =
    typeof card.m2 === 'number'
      ? card.m2
      : typeof card.m2_gross === 'number'
        ? card.m2_gross
        : null;
  if (filters.m2Min != null && (m2 == null || m2 < filters.m2Min)) return false;
  if (filters.m2Max != null && (m2 == null || m2 > filters.m2Max)) return false;

  const pc = card.price_change as
    | {
        change_count?: number;
        prev_price?: number | null;
        current_price?: number | null;
        first_price?: number | null;
      }
    | undefined;
  if (filters.signals?.includes('price_down')) {
    if (
      !(
        pc?.prev_price != null &&
        pc?.current_price != null &&
        pc.prev_price > pc.current_price
      )
    ) {
      return false;
    }
  }
  if (filters.signals?.includes('price_up')) {
    if (
      !(
        pc?.prev_price != null &&
        pc?.current_price != null &&
        pc.prev_price < pc.current_price
      )
    ) {
      return false;
    }
  }
  if (filters.signals?.includes('relisted')) {
    const count = pc?.change_count ?? 0;
    if (count < 1) return false;
  }

  if (filters.features?.length) {
    for (const f of filters.features) {
      if (f === 'photo') {
        if (!card.image && !(typeof card.photo_count === 'number' && card.photo_count > 0)) {
          return false;
        }
        continue;
      }
      if (f === 'esyali' && !isYes(factFlag(card, ['esyali', 'eşyalı']))) return false;
      if (f === 'takas' && !isYes(factFlag(card, ['takas']))) return false;
      if (f === 'asansor' && !isYes(factFlag(card, ['asansor', 'asansör'])))
        return false;
      if (
        f === 'site' &&
        !isYes(factFlag(card, ['site', 'site_icerisinde', 'site_içerisinde']))
      ) {
        return false;
      }
      if (f === 'balkon' && !isYes(factFlag(card, ['balkon']))) return false;
      if (
        f === 'krediye_uygun' &&
        !isYes(factFlag(card, ['krediye_uygun']))
      ) {
        return false;
      }
    }
  }

  return true;
}

function aggregateFacets(cards: IvoCard[]): PortfolioFacets {
  const cities = new Map<string, number>();
  const districts = new Map<string, number>();
  const neighborhoods = new Map<string, number>();
  const rooms = new Map<string, number>();
  const kinds = new Map<string, number>();
  const agents = new Map<string, number>();
  const agencies = new Map<string, number>();
  for (const c of cards) {
    if (c.city) cities.set(String(c.city), (cities.get(String(c.city)) || 0) + 1);
    if (c.district) {
      districts.set(
        String(c.district),
        (districts.get(String(c.district)) || 0) + 1
      );
    }
    if (c.neighborhood) {
      neighborhoods.set(
        String(c.neighborhood),
        (neighborhoods.get(String(c.neighborhood)) || 0) + 1
      );
    }
    if (c.rooms) {
      rooms.set(String(c.rooms), (rooms.get(String(c.rooms)) || 0) + 1);
    }
    if (c.kind) {
      kinds.set(String(c.kind), (kinds.get(String(c.kind)) || 0) + 1);
    }
    const agent = c.agent as { id?: string; name?: string } | undefined;
    if (agent?.name) {
      const key = agent.id ? `${agent.id}::${agent.name}` : agent.name;
      agents.set(key, (agents.get(key) || 0) + 1);
    }
    const agency = c.agency as { name?: string } | undefined;
    if (agency?.name) {
      agencies.set(
        String(agency.name),
        (agencies.get(String(agency.name)) || 0) + 1
      );
    }
  }
  const toBuckets = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  return {
    cities: toBuckets(cities),
    districts: toBuckets(districts),
    neighborhoods: toBuckets(neighborhoods),
    rooms: toBuckets(rooms),
    kinds: toBuckets(kinds),
    agents: toBuckets(agents),
    agencies: toBuckets(agencies),
  };
}

function cardsToRows(cards: IvoCard[], scope: PortfolioScope): IvoListingRow[] {
  return cards
    .map((c) => {
      const row = ivoCardToListingRow(c);
      if (!row) return null;
      row.feeds = [scope === 'my' ? 'my-properties' : 'office-properties'];
      if (row.raw && typeof row.raw === 'object') {
        (row.raw as { ingest_feed?: string }).ingest_feed =
          scope === 'my' ? 'my-properties' : 'office-properties';
      }
      return row;
    })
    .filter((r): r is IvoListingRow => !!r);
}

type MyFeedResolve =
  | { kind: 'agent'; path: string; agentId: string; agentName: string }
  | { kind: 'empty'; reason: 'no_name' | 'no_match' };

function buildAgentSearchPath(
  agentId: string,
  filters: PortfolioFilters,
  patch: Partial<PortfolioFilters> = {}
): string {
  const f = { ...filters, ...patch };
  const qs = new URLSearchParams({
    limit: String(Math.min(Math.max(f.limit ?? 1, 1), 100)),
    offset: String(Math.max(f.offset ?? 0, 0)),
    agent: agentId,
  });
  const status = f.status || 'active';
  if (status === 'active') qs.set('is_active', 'true');
  else if (status === 'inactive') qs.set('is_active', 'false');
  const listingType = f.listingType || 'all';
  if (listingType === 'satilik') qs.set('status', 'Satılık');
  else if (listingType === 'kiralik') qs.set('status', 'Kiralık');
  if (f.q?.trim()) qs.set('q', f.q.trim());
  if (f.rooms?.length === 1) qs.set('rooms', f.rooms[0]);
  const period = f.period || 'all';
  if (period !== 'all') {
    qs.set('period', period);
    if (period === 'custom') {
      if (f.daysFrom != null) qs.set('days_from', String(f.daysFrom));
      if (f.daysTo != null) qs.set('days_to', String(f.daysTo));
    }
  }
  return `/search/properties?${qs.toString()}`;
}

/** Ofis feed’inden agent eşle; yoksa boş — asla token sahibinin my-properties’ine düşme. */
async function resolveMyFeed(
  filters: PortfolioFilters
): Promise<MyFeedResolve> {
  const name = filters.agentName?.trim();
  if (!name) return { kind: 'empty', reason: 'no_name' };

  const agents = new Map<string, { id: string; name: string; count: number }>();
  try {
    // Birkaç sayfa tara — ilk 100’de olmayan danışmanlar kaçmasın
    let pageOffset = 0;
    for (let i = 0; i < 5; i++) {
      const sample = await fetchPage(
        'pool',
        { status: 'active', limit: 100, offset: pageOffset },
        { limit: 100, offset: pageOffset }
      );
      for (const c of sample.cards) {
        const agent = c.agent as { id?: string; name?: string } | undefined;
        if (!agent?.id || !agent?.name) continue;
        const prev = agents.get(agent.id);
        if (prev) prev.count += 1;
        else agents.set(agent.id, { id: agent.id, name: agent.name, count: 1 });
      }
      pageOffset += sample.cards.length;
      if (!sample.cards.length || pageOffset >= sample.total) break;
    }
  } catch {
    return { kind: 'empty', reason: 'no_match' };
  }

  const hit = [...agents.values()].find((a) => namesMatch(a.name, name));
  if (!hit) return { kind: 'empty', reason: 'no_match' };

  return {
    kind: 'agent',
    path: buildAgentSearchPath(hit.id, filters),
    agentId: hit.id,
    agentName: hit.name,
  };
}

async function fetchTotal(
  scope: PortfolioScope,
  filters: PortfolioFilters,
  patch: Partial<PortfolioFilters>
): Promise<number> {
  const merged = { ...filters, ...patch, limit: 1, offset: 0 };
  const page = await fetchPage(scope, merged, { limit: 1, offset: 0 });
  return page.total;
}

/** Canlı portföy listesi */
export async function listPortfolioLive(
  scope: PortfolioScope,
  filters: PortfolioFilters = {}
): Promise<PortfolioListResult> {
  const limit = Math.min(Math.max(filters.limit ?? 48, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const post = needsPostFilter(filters);

  let cards: IvoCard[] = [];
  let total = 0;
  let pencere: Record<string, unknown> | null = null;
  let feed = feedPath(scope);

  let matchedAgentName: string | null = null;
  let matchedAgentId: string | null = null;

  if (scope === 'my') {
    const resolved = await resolveMyFeed(filters);
    if (resolved.kind === 'empty') {
      return {
        listings: [],
        total: 0,
        counts: { all: 0, active: 0, inactive: 0, satilik: 0, kiralik: 0 },
        facets: {
          cities: [],
          districts: [],
          neighborhoods: [],
          rooms: [],
          kinds: [],
          agents: [],
          agencies: [],
        },
        source: 'live',
        feed: 'unmatched',
        pencere: null,
        postFiltered: false,
        unmatchedAgent: true,
        matchedAgentName: null,
      };
    }
    matchedAgentName = resolved.agentName;
    matchedAgentId = resolved.agentId;
    feed = resolved.path.split('?')[0];
    const res = await ivoRequest<IvoListResponse>(resolved.path);
    cards = Array.isArray(res?.data) ? res.data : [];
    total =
      typeof res?.meta?.total === 'number' ? res.meta.total : cards.length;
    pencere = (res?.meta?.pencere as Record<string, unknown>) || null;
  } else if (post) {
    // Post-filtre: birkaç sayfa tara, sonra sayfala
    const collected: IvoCard[] = [];
    let ivoTotal = 0;
    let pageOffset = 0;
    const maxScan = 500;
    while (collected.length < offset + limit && pageOffset < maxScan) {
      const page = await fetchPage(scope, filters, {
        limit: 100,
        offset: pageOffset,
        rooms: filters.rooms?.length === 1 ? filters.rooms[0] : null,
      });
      ivoTotal = page.total;
      pencere = page.pencere;
      if (!page.cards.length) break;
      for (const c of page.cards) {
        if (cardPassesPostFilter(c, filters)) collected.push(c);
      }
      pageOffset += page.cards.length;
      if (pageOffset >= page.total) break;
    }
    total = collected.length;
    cards = collected.slice(offset, offset + limit);
    // Tam tarama değilse total alt sınır
    if (pageOffset < ivoTotal && collected.length >= offset + limit) {
      total = Math.max(collected.length, offset + cards.length);
    }
  } else {
    const page = await fetchPage(scope, filters, {
      limit,
      offset,
      rooms: filters.rooms?.length === 1 ? filters.rooms[0] : null,
    });
    cards = page.cards;
    total = page.total;
    pencere = page.pencere;
  }

  if (post && scope === 'my') {
    const filtered = cards.filter((c) => cardPassesPostFilter(c, filters));
    total = filtered.length;
    cards = filtered.slice(0, limit);
  }

  // Facet örneklemesi — my için agent araması; pool için ofis feed
  let facetCards: IvoCard[] = cards;
  try {
    if (scope === 'my' && matchedAgentId) {
      const facetPath = buildAgentSearchPath(matchedAgentId, filters, {
        limit: 100,
        offset: 0,
        rooms: undefined,
      });
      const facetRes = await ivoRequest<IvoListResponse>(facetPath);
      facetCards = Array.isArray(facetRes?.data) ? facetRes.data : cards;
    } else if (scope === 'pool') {
      const facetPage = await fetchPage(scope, filters, {
        limit: 100,
        offset: 0,
        rooms: null,
      });
      facetCards = facetPage.cards;
    }
  } catch {
    /* keep page cards */
  }

  const baseForCounts = {
    q: filters.q,
    period: filters.period,
    daysFrom: filters.daysFrom,
    daysTo: filters.daysTo,
    rooms: filters.rooms?.length === 1 ? filters.rooms : undefined,
  } as PortfolioFilters;

  let all = total;
  let active = total;
  let inactive = 0;
  let satilik = 0;
  let kiralik = 0;

  if (scope === 'my' && matchedAgentId) {
    const agentId = matchedAgentId;
    const countViaAgent = async (patch: Partial<PortfolioFilters>) => {
      const path = buildAgentSearchPath(agentId, baseForCounts, {
        ...patch,
        limit: 1,
        offset: 0,
      });
      const res = await ivoRequest<IvoListResponse>(path);
      return typeof res?.meta?.total === 'number' ? res.meta.total : 0;
    };
    [all, active, inactive, satilik, kiralik] = await Promise.all([
      countViaAgent({ status: 'all', listingType: 'all' }),
      countViaAgent({ status: 'active', listingType: 'all' }),
      countViaAgent({ status: 'inactive', listingType: 'all' }),
      countViaAgent({
        status: filters.status || 'active',
        listingType: 'satilik',
      }),
      countViaAgent({
        status: filters.status || 'active',
        listingType: 'kiralik',
      }),
    ]);
  } else {
    [all, active, inactive, satilik, kiralik] = await Promise.all([
      fetchTotal('pool', baseForCounts, {
        status: 'all',
        listingType: 'all',
      }),
      fetchTotal('pool', baseForCounts, {
        status: 'active',
        listingType: 'all',
      }),
      fetchTotal('pool', baseForCounts, {
        status: 'inactive',
        listingType: 'all',
      }),
      fetchTotal('pool', baseForCounts, {
        status: filters.status || 'active',
        listingType: 'satilik',
      }),
      fetchTotal('pool', baseForCounts, {
        status: filters.status || 'active',
        listingType: 'kiralik',
      }),
    ]);
  }

  return {
    listings: cardsToRows(cards, scope),
    total,
    counts: { all, active, inactive, satilik, kiralik },
    facets: aggregateFacets(facetCards),
    source: 'live',
    feed,
    pencere,
    postFiltered: post,
    unmatchedAgent: false,
    matchedAgentName,
  };
}

/** UI tarih kısayolu → IVO period / custom */
export function portfolioDatePresetToFilter(
  preset: string
): Pick<PortfolioFilters, 'period' | 'daysFrom' | 'daysTo'> {
  switch (preset) {
    case '24h':
      return { period: 'custom', daysFrom: 0, daysTo: 1 };
    case '3d':
      return { period: 'custom', daysFrom: 0, daysTo: 3 };
    case '7d':
      return { period: '7d' };
    case '30d':
      return { period: 'custom', daysFrom: 0, daysTo: 30 };
    case '90d':
      return { period: 'custom', daysFrom: 0, daysTo: 90 };
    case '180d':
      return { period: 'custom', daysFrom: 0, daysTo: 180 };
    case 'age-0-7':
      return { period: 'custom', daysFrom: 0, daysTo: 7 };
    case 'age-7-30':
      return { period: 'custom', daysFrom: 7, daysTo: 30 };
    case 'age-30-90':
      return { period: '31-90d' };
    case 'age-90+':
      return { period: '90d-1y' };
    case '8-14d':
      return { period: '8-14d' };
    case '15-30d':
      return { period: '15-30d' };
    default:
      return { period: 'all', daysFrom: null, daysTo: null };
  }
}
