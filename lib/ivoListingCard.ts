/**
 * DB satırı → Radar kart görünümü (foto, danışman, emsal metre).
 * IVO markası yok; ham kart raw.card içinde.
 */

import type { IvoListingRow } from './ivoListingTypes';
import { resolveSahibindenListingUrl } from './sahibindenListing';

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
  phone?: string | null;
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

export type IvoCardFacts = {
  binaYasi: string | null;
  isitma: string | null;
  kullanim: string | null;
  esyali: string | null;
  kat: string | null;
  katSayisi: string | null;
  banyo: string | null;
  balkon: string | null;
  asansor: string | null;
  site: string | null;
  tapu: string | null;
  takas: string | null;
  krediyeUygun: string | null;
  imar: string | null;
  ada: string | null;
  parsel: string | null;
  /** Serbest ekstra (Sıfır Bina · Oturuma Hazır vb.) */
  extras: string[];
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
  priceUsd: number | null;
  firstDate: string | null;
  updatedAt: string | null;
  activeDays: number | null;
  facts: IvoCardFacts;
  /** Konut→K, İş Yeri→İ, Arazi→A, Bina→B */
  kindLetter: string;
  twinActive: number | null;
  twinTotal: number | null;
  lastSeenAt: string | null;
};

type RawShape = {
  image?: string;
  lat?: number;
  lng?: number;
  card?: {
    image?: string;
    photo_count?: number;
    title?: string;
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
    price_fx?: { usd?: number; eur?: number };
    m2_price?: number;
    url?: string;
    first_date?: string;
    date?: string;
    updated_at?: string;
    status_summary?: {
      active_days?: number;
      active_count?: number;
      passive_count?: number;
      total?: number;
      last_change_date?: string | null;
    };
    facts?: Record<string, string | number | boolean | null>;
    ikiz?: { aktif?: number; toplam?: number; active?: number; total?: number };
    twins?: { aktif?: number; toplam?: number; active?: number; total?: number };
    twin?: { aktif?: number; toplam?: number };
    master?: Record<string, unknown>;
    iletisim?: Record<string, unknown>;
  };
};

function factStr(
  facts: Record<string, string | number | boolean | null> | undefined,
  ...keys: string[]
): string | null {
  if (!facts) return null;
  for (const k of keys) {
    const v = facts[k];
    if (v == null || v === '') continue;
    if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
    return String(v);
  }
  return null;
}

function parseFacts(
  facts: Record<string, string | number | boolean | null> | undefined
): IvoCardFacts {
  const known = new Set([
    'bina_yasi',
    'bina_yaşı',
    'yas',
    'age',
    'isitma',
    'ısıtma',
    'heating',
    'kullanim',
    'kullanım',
    'usage',
    'esyali',
    'eşyalı',
    'furnished',
    'kat',
    'bulundugu_kat',
    'kat_sayisi',
    'kat_sayısı',
    'banyo',
    'banyo_sayisi',
    'balkon',
    'asansor',
    'asansör',
    'site',
    'site_icerisinde',
    'tapu',
    'takas',
    'krediye_uygun',
    'imar',
    'ada',
    'parsel',
  ]);
  const extras: string[] = [];
  if (facts) {
    for (const [k, v] of Object.entries(facts)) {
      if (known.has(k) || v == null || v === '') continue;
      const s = String(v).trim();
      if (!s || s === 'Belirtilmemiş') continue;
      if (/^(var|yok|evet|hayır)$/i.test(s) && !/oturum|sıfır|hazır/i.test(k)) {
        continue;
      }
      if (/oturum|sıfır|hazır|komple|tadilat/i.test(k) || /oturum|sıfır|hazır/i.test(s)) {
        extras.push(s.includes('·') ? s : s);
      }
    }
  }

  const binaDurumu = factStr(
    facts,
    'bina_durumu',
    'durum',
    'konut_durumu',
    'yapi_durumu'
  );
  if (binaDurumu) extras.unshift(binaDurumu);

  return {
    binaYasi: factStr(facts, 'bina_yasi', 'bina_yaşı', 'yas', 'age'),
    isitma: factStr(facts, 'isitma', 'ısıtma', 'heating'),
    kullanim: factStr(facts, 'kullanim', 'kullanım', 'usage'),
    esyali: factStr(facts, 'esyali', 'eşyalı', 'furnished'),
    kat: factStr(facts, 'kat', 'bulundugu_kat'),
    katSayisi: factStr(facts, 'kat_sayisi', 'kat_sayısı'),
    banyo: factStr(facts, 'banyo', 'banyo_sayisi'),
    balkon: factStr(facts, 'balkon'),
    asansor: factStr(facts, 'asansor', 'asansör'),
    site: factStr(facts, 'site', 'site_icerisinde', 'site_içerisinde'),
    tapu: factStr(facts, 'tapu'),
    takas: factStr(facts, 'takas'),
    krediyeUygun: factStr(facts, 'krediye_uygun'),
    imar: factStr(facts, 'imar'),
    ada: factStr(facts, 'ada'),
    parsel: factStr(facts, 'parsel'),
    extras: Array.from(new Set(extras)).slice(0, 4),
  };
}

function kindLetter(kind: string | null, type: string | null): string {
  const k = `${kind || ''} ${type || ''}`.toLocaleLowerCase('tr-TR');
  if (/bina|komple/.test(k)) return 'B';
  if (/iş yeri|isyeri|ofis|dükkan|depo|ticari/.test(k)) return 'İ';
  if (/arazi|arsa|tarla|bağ|bahçe/.test(k)) return 'A';
  if (/konut|daire|rezidans|villa|müstakil/.test(k)) return 'K';
  if (kind) return kind.trim().slice(0, 1).toLocaleUpperCase('tr-TR');
  return '?';
}

function twinCounts(card: NonNullable<RawShape['card']>): {
  active: number | null;
  total: number | null;
} {
  const src = (card.ikiz || card.twins || card.twin || null) as {
    aktif?: number;
    toplam?: number;
    active?: number;
    total?: number;
  } | null;
  if (!src || typeof src !== 'object') return { active: null, total: null };
  const active =
    typeof src.aktif === 'number'
      ? src.aktif
      : typeof src.active === 'number'
        ? src.active
        : null;
  const total =
    typeof src.toplam === 'number'
      ? src.toplam
      : typeof src.total === 'number'
        ? src.total
        : null;
  return { active, total };
}

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

  const kind = row.kind || card.kind || null;
  const type = card.type || null;
  const twins = twinCounts(card);
  const facts = parseFacts(card.facts);

  return {
    id: row.id,
    listingNo: row.listing_no,
    url: resolveSahibindenListingUrl(card.url || row.url, row.listing_no, {
      title: row.title || (card.title ? String(card.title) : null),
      kind: row.kind || (card.kind ? String(card.kind) : null),
      status:
        (card.status ? String(card.status) : null) ||
        (row.listing_type === 'kiralik'
          ? 'Kiralık'
          : row.listing_type === 'satilik'
            ? 'Satılık'
            : null),
    }),
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
    kind,
    type,
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
          phone: card.agency.phone ?? null,
        }
      : null,
    priceStats: card.price_stats || null,
    priceChange: card.price_change || null,
    priceUsd:
      typeof card.price_fx?.usd === 'number' && Number.isFinite(card.price_fx.usd)
        ? card.price_fx.usd
        : null,
    firstDate: card.first_date || card.date || null,
    updatedAt: card.updated_at || null,
    activeDays:
      typeof card.status_summary?.active_days === 'number'
        ? card.status_summary.active_days
        : null,
    facts,
    kindLetter: kindLetter(kind, type),
    twinActive: twins.active,
    twinTotal: twins.total,
    lastSeenAt: row.last_seen_at || null,
  };
}

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
  return `${Math.round(n).toLocaleString('tr-TR')}\u00a0₺`;
}

export function formatDiffPct(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const sign = pct > 0 ? '+' : '';
  return `${sign}%${pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

export function formatCardDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = String(iso);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export function emptyCardFacts(): IvoCardFacts {
  return {
    binaYasi: null,
    isitma: null,
    kullanim: null,
    esyali: null,
    kat: null,
    katSayisi: null,
    banyo: null,
    balkon: null,
    asansor: null,
    site: null,
    tapu: null,
    takas: null,
    krediyeUygun: null,
    imar: null,
    ada: null,
    parsel: null,
    extras: [],
  };
}

/** Kart chip listesi — IVO satır yoğunluğu */
export function buildListingChips(
  listing: IvoListingCardModel
): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const push = (key: string, label: string | null | undefined) => {
    const t = label?.trim();
    if (!t) return;
    if (out.some((c) => c.label === t)) return;
    out.push({ key, label: t });
  };

  push('kind', listing.kind);
  push('type', listing.type && listing.type !== listing.kind ? listing.type : null);
  push('rooms', listing.rooms);
  for (const [i, ex] of listing.facts.extras.entries()) {
    push(`ex${i}`, ex);
  }
  if (listing.facts.kat && listing.facts.katSayisi) {
    push('floor', `${listing.facts.kat}/${listing.facts.katSayisi}`);
  } else {
    push('kat', listing.facts.kat);
    push('kats', listing.facts.katSayisi ? `${listing.facts.katSayisi} kat` : null);
  }
  push('yas', listing.facts.binaYasi);
  push('isitma', listing.facts.isitma);
  push(
    'banyo',
    listing.facts.banyo
      ? /\d/.test(listing.facts.banyo)
        ? `${listing.facts.banyo} Banyo`
        : listing.facts.banyo
      : null
  );
  if (listing.facts.esyali) {
    const e = listing.facts.esyali.toLocaleLowerCase('tr-TR');
    push(
      'esyali',
      e === 'evet' || e === 'var' ? 'Eşyalı' : e === 'hayır' || e === 'yok' ? 'Eşyasız' : listing.facts.esyali
    );
  }
  push('kullanim', listing.facts.kullanim);
  if (listing.facts.ada || listing.facts.parsel) {
    push(
      'ada',
      [
        listing.facts.ada ? `Ada: ${listing.facts.ada}` : null,
        listing.facts.parsel ? `Parsel: ${listing.facts.parsel}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
  push('tapu', listing.facts.tapu);
  push('imar', listing.facts.imar ? `İmar: ${listing.facts.imar}` : null);
  if (listing.facts.tapu && /hisseli/i.test(listing.facts.tapu)) {
    push('H', 'H');
  }
  if (listing.areaM2 != null && !out.some((c) => c.label.includes('m²'))) {
    push('m2', `${listing.areaM2} m²`);
  }
  push('status', listing.statusLabel);
  if (listing.isFsbo) push('fsbo', 'FSBO');
  return out;
}
