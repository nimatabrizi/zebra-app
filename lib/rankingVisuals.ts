/**
 * Sıralama görselleri (Nima Tabrizi paneli) — dönem/kategori yapılandırması,
 * Excel ayrıştırma ve 1080×1350 canvas çizimi.
 * Yerleşim ölçüleri Ağustos PSD örneğinden piksel bazında alındı.
 */

import type { WorkBook } from 'xlsx';
import { toConsultantPhotoSlug, toTitleCaseName, toTurkishUpper } from './formatName';

export const RANK_CANVAS = { width: 1080, height: 1350 } as const;

export type RankCategoryId = 'ciro' | 'portfoy' | 'islem' | 'takim';
export type RankPeriodId =
  | '2026-05'
  | '2026-06'
  | '2026-07'
  | '2026-08'
  | '2026-09'
  | '2026-10'
  | '2026-q2'
  | '2026-q3';
/** rank = sıralama görseli; award = ayda kişi başına tek “Ödülünüz var” görseli */
export type RankOutputKind = 'rank' | 'award';

export const RANK_CATEGORIES: { id: RankCategoryId; label: string; short: string }[] = [
  { id: 'ciro', label: 'Ciro Sıralaması', short: 'Ciro' },
  { id: 'portfoy', label: 'Portföy Alma Sıralaması', short: 'Portföy alma' },
  { id: 'islem', label: 'İşlem Sıralaması', short: 'İşlem' },
  { id: 'takim', label: 'Takım Verimliliği', short: 'Takım' },
];

export type RankPeriod = {
  id: RankPeriodId;
  label: string;
  sheetName: string;
  fileSlug: string;
  kind: 'month' | 'quarter';
  /** Sayfa adı eşleşmesi için normalize edilmiş anahtarlar (özelden genele) */
  keys: string[];
};

export const RANK_PERIODS: RankPeriod[] = [
  { id: '2026-05', label: 'Mayıs', sheetName: 'Mayıs', fileSlug: '2026-05-mayis', kind: 'month', keys: ['mayis'] },
  { id: '2026-06', label: 'Haziran', sheetName: 'Haziran', fileSlug: '2026-06-haziran', kind: 'month', keys: ['haziran'] },
  { id: '2026-07', label: 'Temmuz', sheetName: 'Temmuz', fileSlug: '2026-07-temmuz', kind: 'month', keys: ['temmuz'] },
  { id: '2026-08', label: 'Ağustos', sheetName: 'Ağustos', fileSlug: '2026-08-agustos', kind: 'month', keys: ['agustos'] },
  { id: '2026-09', label: 'Eylül', sheetName: 'Eylül', fileSlug: '2026-09-eylul', kind: 'month', keys: ['eylul'] },
  { id: '2026-10', label: 'Ekim', sheetName: 'Ekim', fileSlug: '2026-10-ekim', kind: 'month', keys: ['ekim'] },
  {
    id: '2026-q2',
    label: '2026 II. Çeyrek',
    sheetName: '2. Çeyrek',
    fileSlug: '2026-q2-ceyrek',
    kind: 'quarter',
    keys: ['2 ceyrek', 'ii ceyrek', 'q2'],
  },
  {
    id: '2026-q3',
    label: '2026 III. Çeyrek',
    sheetName: '3. Çeyrek',
    fileSlug: '2026-q3-ceyrek',
    kind: 'quarter',
    keys: ['3 ceyrek', 'iii ceyrek', 'q3'],
  },
];

export type PeriodTemplates = {
  rank: Partial<Record<RankCategoryId, string>>;
  /** Ayda kişi başına tek “Ödülünüz var” şablonu (sertifika değil). */
  award: string | null;
};

/**
 * Yeni dönem template'i: public/templates/siralama/{id}/ altına
 * ciro.png, portfoy.png, islem.png, takim.png, odul.png koyup buraya yol yazın.
 * (Sertifika ayrı bir ürün; bu akışa dahil değil.)
 */
export const RANK_TEMPLATES: Record<RankPeriodId, PeriodTemplates> = {
  '2026-05': {
    rank: {
      ciro: '/templates/siralama/2026-05/ciro.png',
      portfoy: '/templates/siralama/2026-05/portfoy.png',
      islem: '/templates/siralama/2026-05/islem.png',
    },
    award: '/templates/siralama/2026-05/odul.png',
  },
  '2026-06': {
    rank: {
      ciro: '/templates/siralama/2026-06/ciro.png',
      portfoy: '/templates/siralama/2026-06/portfoy.png',
      islem: '/templates/siralama/2026-06/islem.png',
    },
    award: '/templates/siralama/2026-06/odul.png',
  },
  '2026-07': {
    rank: {
      ciro: '/templates/siralama/2026-07/ciro.png',
      portfoy: '/templates/siralama/2026-07/portfoy.png',
      islem: '/templates/siralama/2026-07/islem.png',
    },
    award: '/templates/siralama/2026-07/odul.png',
  },
  '2026-08': {
    rank: {
      ciro: '/templates/siralama/2026-08/ciro.png',
      portfoy: '/templates/siralama/2026-08/portfoy.png',
      islem: '/templates/siralama/2026-08/islem.png',
    },
    award: '/templates/siralama/2026-08/odul.png',
  },
  '2026-09': {
    rank: {
      ciro: '/templates/siralama/2026-09/ciro.png',
      portfoy: '/templates/siralama/2026-09/portfoy.png',
      islem: '/templates/siralama/2026-09/islem.png',
    },
    award: '/templates/siralama/2026-09/odul.png',
  },
  '2026-10': {
    rank: {
      ciro: '/templates/siralama/2026-10/ciro.png',
      portfoy: '/templates/siralama/2026-10/portfoy.png',
      islem: '/templates/siralama/2026-10/islem.png',
    },
    award: '/templates/siralama/2026-10/odul.png',
  },
  '2026-q2': {
    rank: {
      ciro: '/templates/siralama/2026-q2/ciro.png',
      portfoy: '/templates/siralama/2026-q2/portfoy.png',
      islem: '/templates/siralama/2026-q2/islem.png',
    },
    award: '/templates/siralama/2026-q2/odul.png',
  },
  '2026-q3': {
    rank: {
      ciro: '/templates/siralama/2026-q3/ciro.png',
      portfoy: '/templates/siralama/2026-q3/portfoy.png',
      islem: '/templates/siralama/2026-q3/islem.png',
    },
    award: '/templates/siralama/2026-q3/odul.png',
  },
};

/** Çeyrek madalyaları (sıra 1–5). II altın, III mavi — dönem klasöründen. */
export function quarterMedalUrl(periodId: RankPeriodId | undefined, rank: number): string | null {
  if (rank < 1 || rank > 5) return null;
  const folder = periodId === '2026-q3' ? '2026-q3' : '2026-q2';
  return `/templates/siralama/${folder}/medals/${rank}.png`;
}

export function templateFor(
  periodId: RankPeriodId,
  kind: RankOutputKind,
  category: RankCategoryId
): string | null {
  const set = RANK_TEMPLATES[periodId];
  if (!set) return null;
  return kind === 'award' ? set.award : set.rank[category] || null;
}

export const RANK_FONTS = {
  number: { family: 'Zebra Rank Number', url: '/fonts/siralama/zebra-rank-number.woff2' },
  name: { family: 'Zebra Rank Name', url: '/fonts/siralama/zebra-rank-name.woff2?v=2' },
  title: { family: 'Zebra Rank Title', url: '/fonts/siralama/zebra-rank-title.woff2' },
} as const;

type TextBlockLayout = {
  align: 'left' | 'center';
  /** left hizada mürekkep sol kenarı, center hizada merkez */
  x: number;
  nameBaseline: number;
  nameSize: number;
  nameTracking: number;
  nameMaxWidth: number;
  ruleOffset: number;
  ruleThickness: number;
  titleOffset: number;
  titleSize: number;
  titleTracking: number;
};

type PhotoLayout = {
  width: number;
  centerX: number;
  top: number;
};

/** MediaPipe yüz ölçüleri (kaynak piksel). */
export type RankFaceMetrics = {
  eyeMidX: number;
  eyeMidY: number;
  eyeDistance: number;
  noseX?: number;
  foreheadY?: number;
  chinY?: number;
};

/** Çeyrek: burun dikeyi + kafa üstü / çene yatayları (gridler.png → 1080×1350). */
export type QuarterFaceGuide = {
  noseX: number;
  headTop: number;
  chinY: number;
};

export type RankVisualLayout = {
  photo: PhotoLayout;
  /** Aylık: göz hizası hedefi. */
  face?: RankFaceMetrics;
  /** Çeyrek: burun / kafa / çene grid’i. */
  quarterFace?: QuarterFaceGuide;
  /** Çeyrek madalya kutusu (opak içerik genişliği). */
  medal?: { centerX: number; top: number; targetWidth: number };
  grayscalePhoto?: boolean;
  nameColor?: string;
  text: TextBlockLayout;
  fade: { start: number; end: number; max: number; clipBottom: number };
  number?: {
    left: number;
    baseline: number;
    size: number;
    color: string;
    dotGap: number;
    dotDiameter: number;
    dotColor: string;
    suffixGap: number;
    suffixSize: number;
    glowColor: string;
    glowStroke: number;
    glowBlur: number;
  };
};

const SHARED_FADE = { start: 955, end: 1150, max: 0.82, clipBottom: 1252 };

export const RANK_LAYOUT: RankVisualLayout = {
  photo: { width: 440, centerX: 257, top: 783 },
  /** Mayıs örnek (Meltem) kırpısından MediaPipe ölçümü. */
  face: { eyeMidX: 241, eyeMidY: 875, eyeDistance: 50.3 },
  text: {
    align: 'left',
    x: 55,
    nameBaseline: 1165,
    nameSize: 36.9,
    nameTracking: 0.04,
    nameMaxWidth: 640,
    ruleOffset: 17,
    ruleThickness: 3,
    titleOffset: 46,
    titleSize: 17,
    titleTracking: 0.26,
  },
  fade: SHARED_FADE,
  number: {
    left: 57,
    baseline: 523,
    size: 293,
    color: '#EEEEEE',
    dotGap: 17,
    dotDiameter: 49,
    /** Fallback; gerçek renk dönem footer barından (`RANK_PERIOD_DOT_COLOR`). */
    dotColor: '#29790d',
    suffixGap: 13,
    suffixSize: 142,
    glowColor: '#151515',
    glowStroke: 20,
    glowBlur: 30,
  },
};

/** Sıra noktasının rengi = o ayın template alt bar rengi (örnek PNG’den örneklenmiş). */
export const RANK_PERIOD_DOT_COLOR: Record<RankPeriodId, string> = {
  '2026-05': '#29790d',
  '2026-06': '#a73222',
  '2026-07': '#2357ac',
  '2026-08': '#856f08',
  '2026-09': '#37a2a1',
  '2026-10': '#6a4327',
  '2026-q2': '#bbab8b',
  '2026-q3': '#bbab8b',
};

export const AWARD_LAYOUT: RankVisualLayout = {
  /** Fallback silüet; yatay merkez yüz hedefiyle aynı. */
  photo: { width: 665, centerX: 521, top: 555 },
  /**
   * Ödülünüz var yüz slotu — Eylül Meltem kırmızı grid + örnek PNG
   * (MediaPipe). Dikey kolon ortası ~521; göz hizası ~693; tüm aylar ortak.
   */
  face: { eyeMidX: 521, eyeMidY: 693, eyeDistance: 73.8 },
  text: {
    align: 'center',
    x: 541,
    nameBaseline: 1148,
    nameSize: 45.4,
    nameTracking: 0.04,
    nameMaxWidth: 940,
    ruleOffset: 20,
    ruleThickness: 3,
    titleOffset: 56,
    titleSize: 21,
    titleTracking: 0.26,
  },
  fade: SHARED_FADE,
};

/**
 * II./III. Çeyrek sıralama — gridler.png (burun dikeyi, kafa üstü, çene) +
 * madalya sabit kutu. Foto siyah-beyaz; isim altın.
 */
export const QUARTER_LAYOUT: RankVisualLayout = {
  // Meltem örnek: burun kesimi canvas sol kenarında (yarı yüz sola açılmaz).
  photo: { width: 520, centerX: 200, top: 270 },
  quarterFace: { noseX: 0, headTop: 270, chinY: 776 },
  medal: { centerX: 774, top: 776, targetWidth: 252 },
  grayscalePhoto: true,
  nameColor: '#b58b3d',
  text: {
    align: 'left',
    x: 55,
    nameBaseline: 1168,
    nameSize: 36.9,
    nameTracking: 0.04,
    nameMaxWidth: 520,
    ruleOffset: 17,
    ruleThickness: 3,
    titleOffset: 46,
    titleSize: 17,
    titleTracking: 0.26,
  },
  fade: { start: 980, end: 1180, max: 0.78, clipBottom: 1252 },
};

/**
 * II./III. Çeyrek Ödülünüz var — ortalı yüz; grid: kafa üstü + çene,
 * burun canvas merkezi. Foto B/W; isim altın.
 */
export const QUARTER_AWARD_LAYOUT: RankVisualLayout = {
  photo: { width: 620, centerX: 540, top: 563 },
  quarterFace: { noseX: 540, headTop: 563, chinY: 832 },
  grayscalePhoto: true,
  nameColor: '#b58b3d',
  text: {
    align: 'center',
    x: 540,
    nameBaseline: 1145,
    nameSize: 45.4,
    nameTracking: 0.04,
    nameMaxWidth: 940,
    ruleOffset: 20,
    ruleThickness: 3,
    titleOffset: 56,
    titleSize: 21,
    titleTracking: 0.26,
  },
  fade: { start: 980, end: 1160, max: 0.8, clipBottom: 1252 },
};

/** 2.si, 3.sü, 6.sı, 9.su … (sıra sayısının iyelik eki) */
export function turkishRankSuffix(rank: number): string {
  const n = Math.abs(Math.trunc(rank));
  if (n > 0 && n % 100 === 0) return 'sü';
  const ones: Record<number, string> = {
    1: 'si', 2: 'si', 3: 'sü', 4: 'sü', 5: 'si', 6: 'sı', 7: 'si', 8: 'si', 9: 'su',
  };
  const tens: Record<number, string> = {
    1: 'su', 2: 'si', 3: 'su', 4: 'sı', 5: 'si', 6: 'sı', 7: 'si', 8: 'si', 9: 'sı',
  };
  const last = n % 10;
  if (last) return ones[last]!;
  return tens[Math.floor((n % 100) / 10)] || 'si';
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

export type RankPerson = {
  /** Excel'deki (veya profildeki) tam ad */
  name: string;
  key: string;
};

export type RankEntry = {
  id: string;
  periodId: RankPeriodId;
  category: RankCategoryId;
  rank: number;
  rawName: string;
  people: RankPerson[];
};

export type ParsedRankings = {
  entries: RankEntry[];
  sheets: { name: string; periodId: RankPeriodId | null; count: number }[];
  warnings: string[];
};

export function normalizeRankKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function periodFromText(value: unknown): RankPeriodId | null {
  const key = normalizeRankKey(value);
  if (!key) return null;
  // Önce tam anahtar, sonra includes — q2/q3 çakışmasın diye uzun anahtarlar önce.
  const ranked = [...RANK_PERIODS].sort(
    (a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length))
  );
  for (const period of ranked) {
    if (period.keys.some((k) => key === k)) return period.id;
  }
  for (const period of ranked) {
    if (period.keys.some((k) => key.includes(k))) return period.id;
  }
  return null;
}

function categoryFromText(value: unknown): RankCategoryId | null {
  const key = normalizeRankKey(value);
  if (!key) return null;
  if (key.includes('verimlil') || key.includes('takim')) return 'takim';
  if (key.includes('portfoy')) return 'portfoy';
  if (key.includes('ciro')) return 'ciro';
  if (key.includes('islem')) return 'islem';
  return null;
}

function toRankNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.round(value) : null;
  }
  const match = String(value ?? '').trim().match(/^(\d{1,3})\s*\.?\s*(?:[a-zçğıöşü]{0,4})?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

/**
 * Ortak çalışanlar (tek görselde birden fazla isim):
 * "Murat Uzunoğlu - Gönül Hanege", "Serkan / Selin Eskit", "Özkan & Ecehan Kılıç"
 */
export function splitPartnerNames(raw: string): string[] {
  const cleaned = String(raw || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/\s+-\s+|\s*&\s*|\s*\/\s*|\s*\+\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [cleaned];
  const last = parts[parts.length - 1]!.split(' ');
  const surname = last.length >= 2 ? last.slice(1).join(' ') : '';
  return parts.map((part) =>
    surname && part.split(' ').length === 1 ? `${part} ${surname}` : part
  );
}

/**
 * @deprecated Virgül berabere ayırıcıdır; ortaklar için splitPartnerNames kullanın.
 * Geriye dönük: hem berabere hem ortak ayırıcılarını tek listede açar.
 */
export function splitRankNames(raw: string): string[] {
  const cleaned = String(raw || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const tieGroups = cleaned
    .split(/\s*,\s*|\s+ve\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (tieGroups.length > 1) {
    return tieGroups.flatMap((group) => splitPartnerNames(group));
  }
  return splitPartnerNames(cleaned);
}

/** Virgülle ayrılan berabere gruplar; her grup kendi ortaklarını (& / -) tutar. */
export function makeRankPeopleGroups(raw: string): RankPerson[][] {
  const cleaned = String(raw || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const tieGroups = cleaned
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const groups = (tieGroups.length ? tieGroups : [cleaned]).map((group) =>
    splitPartnerNames(group).map((name) => ({
      name,
      key: toConsultantPhotoSlug(name) || normalizeRankKey(name).replace(/\s+/g, '-'),
    }))
  );
  return groups.filter((g) => g.length > 0);
}

/**
 * İki biçim desteklenir:
 * 1) Blok biçimi (mevcut dosya): her dönem ayrı sayfa; "Ciro Sıralaması" başlığı,
 *    ardından "Sıra | İsim / Takım" satırları.
 * 2) Düz tablo: "Dönem | Kategori | Sıra | İsim" başlıklı tek sayfa.
 */
export function parseRankingWorkbook(
  workbook: WorkBook,
  sheetToRows: (sheetName: string) => unknown[][]
): ParsedRankings {
  const entries: RankEntry[] = [];
  const warnings: string[] = [];
  const sheets: ParsedRankings['sheets'] = [];

  const push = (
    periodId: RankPeriodId,
    category: RankCategoryId,
    rank: number,
    rawName: string
  ) => {
    // Virgül → berabere (ayrı görsel); & / - → ortak (aynı görselde birden fazla isim).
    for (const people of makeRankPeopleGroups(rawName)) {
      const idKeys = people.map((p) => p.key).join('+');
      entries.push({
        id: `${periodId}|${category}|${rank}|${idKeys}`,
        periodId,
        category,
        rank,
        rawName: rawName.normalize('NFC').trim(),
        people,
      });
    }
  };

  for (const sheetName of workbook.SheetNames) {
    const rows = sheetToRows(sheetName);
    const sheetPeriod = periodFromText(sheetName);
    const before = entries.length;

    const headerIndex = rows.findIndex((row) => {
      const keys = row.map(normalizeRankKey);
      return keys.includes('kategori') && keys.some((k) => k === 'sira' || k === 'sirasi');
    });

    if (headerIndex >= 0) {
      const header = rows[headerIndex]!.map(normalizeRankKey);
      const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
      const cPeriod = col('donem', 'ay', 'period');
      const cCategory = col('kategori');
      const cRank = col('sira', 'sirasi');
      const cName = header.findIndex(
        (h) => h.startsWith('isim') || h.startsWith('ad') || h.startsWith('danisman')
      );
      for (const row of rows.slice(headerIndex + 1)) {
        const periodId = cPeriod >= 0 ? periodFromText(row[cPeriod]) || sheetPeriod : sheetPeriod;
        const category = categoryFromText(row[cCategory]);
        const rank = toRankNumber(row[cRank]);
        const name = String(row[cName] ?? '').trim();
        if (!name || !rank) continue;
        if (!periodId || !category) {
          warnings.push(`"${sheetName}" sayfasında dönem/kategori okunamayan satır: ${name}`);
          continue;
        }
        push(periodId, category, rank, name);
      }
    } else {
      let category: RankCategoryId | null = null;
      for (const row of rows) {
        const cells = row.map((cell) => (cell == null ? '' : cell));
        const nonEmpty = cells.filter((cell) => String(cell).trim() !== '');
        if (!nonEmpty.length) continue;

        const isColumnHeader = cells.some((cell) => {
          const key = normalizeRankKey(cell);
          return key === 'sira' || key === 'sirasi' || key === 'no';
        });
        if (isColumnHeader) continue;

        const rankIndex = cells.findIndex((cell) => toRankNumber(cell) !== null);
        if (rankIndex < 0) {
          const heading = nonEmpty.map(categoryFromText).find(Boolean) || null;
          if (heading) category = heading;
          continue;
        }
        const name = cells
          .slice(rankIndex + 1)
          .map((cell) => String(cell).trim())
          .find(Boolean);
        if (!name || !category) continue;
        if (!sheetPeriod) continue;
        push(sheetPeriod, category, toRankNumber(cells[rankIndex])!, name);
      }
      if (!sheetPeriod && rows.some((row) => row.some((cell) => categoryFromText(cell)))) {
        warnings.push(
          `"${sheetName}" sayfasının adı bir döneme eşleşmedi (Mayıs…Ekim, 2./3. Çeyrek).`
        );
      }
    }

    sheets.push({ name: sheetName, periodId: sheetPeriod, count: entries.length - before });
  }

  return { entries: dedupeAndSortRankEntries(entries), sheets, warnings };
}

function dedupeAndSortRankEntries(entries: RankEntry[]): RankEntry[] {
  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  unique.sort(
    (a, b) =>
      RANK_PERIODS.findIndex((p) => p.id === a.periodId) -
        RANK_PERIODS.findIndex((p) => p.id === b.periodId) ||
      RANK_CATEGORIES.findIndex((c) => c.id === a.category) -
        RANK_CATEGORIES.findIndex((c) => c.id === b.category) ||
      a.rank - b.rank
  );
  return unique;
}

function sheetsSummaryFromEntries(entries: RankEntry[]): ParsedRankings['sheets'] {
  return RANK_PERIODS.map((period) => ({
    name: period.sheetName,
    periodId: period.id,
    count: entries.filter((e) => e.periodId === period.id).length,
  })).filter((sheet) => sheet.count > 0);
}

/**
 * Yeni Excel’deki dönem+kategori bloklarını günceller; dosyada olmayan
 * blokları önceki kayıttan korur (eksik aylar silinmez).
 */
export function mergeParsedRankings(
  previous: ParsedRankings | null,
  incoming: ParsedRankings
): ParsedRankings {
  if (!previous?.entries.length) {
    return {
      ...incoming,
      entries: dedupeAndSortRankEntries(incoming.entries),
      sheets: sheetsSummaryFromEntries(incoming.entries),
    };
  }
  if (!incoming.entries.length) {
    return {
      entries: previous.entries,
      sheets: sheetsSummaryFromEntries(previous.entries),
      warnings: [
        ...incoming.warnings,
        'Yeni dosyada satır yok; önceki kayıt aynen bırakıldı.',
      ],
    };
  }

  const replaced = new Set(
    incoming.entries.map((entry) => `${entry.periodId}|${entry.category}`)
  );
  const kept = previous.entries.filter(
    (entry) => !replaced.has(`${entry.periodId}|${entry.category}`)
  );
  const entries = dedupeAndSortRankEntries([...kept, ...incoming.entries]);
  const warnings = [...incoming.warnings];
  if (kept.length) {
    warnings.push(
      `Önceki kayıtla birleştirildi: ${kept.length} satır korundu, ${incoming.entries.length} satır güncellendi/eklendi.`
    );
  }
  return {
    entries,
    sheets: sheetsSummaryFromEntries(entries),
    warnings,
  };
}

/** Önerilen Excel biçimi — her dönem için ayrı sayfa, 3 blok. */
export function buildRankingTemplateRows(
  periodId: RankPeriodId,
  entries: RankEntry[]
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const category of RANK_CATEGORIES) {
    rows.push([category.label, '']);
    rows.push(['Sıra', 'İsim / Takım']);
    const list = entries.filter((e) => e.periodId === periodId && e.category === category.id);
    const written = new Set<string>();
    for (const entry of list) {
      const rowKey = `${entry.rank}|${entry.rawName}`;
      if (written.has(rowKey)) continue;
      written.add(rowKey);
      rows.push([entry.rank, entry.rawName]);
    }
    if (!list.length) rows.push(['', '']);
    rows.push(['', '']);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------

export type PhotoAdjust = { scale: number; dx: number; dy: number; flipH?: boolean };
export const DEFAULT_PHOTO_ADJUST: PhotoAdjust = { scale: 1, dx: 0, dy: 0, flipH: false };

/** Sıralama / ödül: ikili-üçlü grupta kişi başına konum-boyut. */
export type RankAdjust = { people: PhotoAdjust[] };

export function defaultRankAdjust(personCount: number): RankAdjust {
  const n = Math.max(1, personCount);
  return {
    people: Array.from({ length: n }, () => ({ ...DEFAULT_PHOTO_ADJUST })),
  };
}

/** Eski tek PhotoAdjust kaydı → herkese aynı; { people } → kişi sayısıyla hizala. */
export function normalizeRankAdjust(raw: unknown, personCount: number): RankAdjust {
  const n = Math.max(1, personCount);
  if (!raw || typeof raw !== 'object') return defaultRankAdjust(n);
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.people)) {
    const list = obj.people.map((entry) => ({
      ...DEFAULT_PHOTO_ADJUST,
      ...(entry && typeof entry === 'object' ? (entry as Partial<PhotoAdjust>) : {}),
    }));
    while (list.length < n) list.push({ ...DEFAULT_PHOTO_ADJUST });
    return { people: list.slice(0, n) };
  }
  if ('scale' in obj || 'dx' in obj || 'dy' in obj || 'flipH' in obj) {
    const one: PhotoAdjust = { ...DEFAULT_PHOTO_ADJUST, ...(obj as Partial<PhotoAdjust>) };
    return { people: Array.from({ length: n }, () => ({ ...one })) };
  }
  return defaultRankAdjust(n);
}

function flipFaceMetrics(face: RankFaceMetrics, imgW: number): RankFaceMetrics {
  return {
    ...face,
    eyeMidX: imgW - face.eyeMidX,
    noseX: face.noseX != null ? imgW - face.noseX : undefined,
  };
}

function flipOpaqueBox(box: OpaqueBox, imgW: number): OpaqueBox {
  return { ...box, x: imgW - box.x - box.w };
}

function drawPersonPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  drawX: number,
  drawY: number,
  scale: number,
  flipH: boolean
) {
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  if (!flipH) {
    ctx.drawImage(img, drawX, drawY, w, h);
    return;
  }
  ctx.save();
  ctx.translate(drawX + w, drawY);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

export type RenderPerson = {
  displayName: string;
  title: string;
  photo: HTMLImageElement | null;
  bounds: OpaqueBox | null;
  face?: RankFaceMetrics | null;
};

export type OpaqueBox = { x: number; y: number; w: number; h: number };

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const boundsCache = new WeakMap<HTMLImageElement, OpaqueBox | null>();

export function loadRankImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}

export function forgetRankImage(src: string) {
  imageCache.delete(src);
}

/** Şeffaf PNG'nin opak alanı (hızlı olsun diye küçültülmüş kopyada ölçülür). */
export function measureOpaqueBox(img: HTMLImageElement): OpaqueBox | null {
  if (boundsCache.has(img)) return boundsCache.get(img)!;
  const ratio = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let box: OpaqueBox | null = null;
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= minX) {
      box = {
        x: minX / ratio,
        y: minY / ratio,
        w: (maxX - minX + 1) / ratio,
        h: (maxY - minY + 1) / ratio,
      };
    }
  } catch {
    box = null;
  }
  boundsCache.set(img, box);
  return box;
}

let fontsPromise: Promise<void> | null = null;

export function loadRankFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    await Promise.all(
      Object.values(RANK_FONTS).map(async ({ family, url }) => {
        const face = new FontFace(family, `url(${url}) format("woff2")`);
        await face.load();
        document.fonts.add(face);
      })
    );
  })().catch((error) => {
    fontsPromise = null;
    throw error;
  });
  return fontsPromise;
}

export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, trackingPx: number) {
  return ctx.measureText(text).width + Math.max(0, text.length - 1) * trackingPx;
}

/** Kerning korunarak harf aralıklı yazı (prefix ölçümüyle). */
export function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  trackingPx: number
) {
  if (!trackingPx) {
    ctx.fillText(text, x, y);
    return;
  }
  const chars = Array.from(text);
  let prefix = '';
  chars.forEach((ch, index) => {
    const offset = ctx.measureText(prefix).width + index * trackingPx;
    ctx.fillText(ch, x + offset, y);
    prefix += ch;
  });
}

function inkLeft(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).actualBoundingBoxLeft || 0;
}

export function rankDisplayName(people: { displayName: string }[]): string {
  const names = people.map((p) => toTurkishUpper(p.displayName));
  if (names.length <= 1) return names[0] || '';
  const surnames = names.map((n) => n.split(' ').slice(1).join(' '));
  if (surnames.every((s) => s && s === surnames[0])) {
    const given = names.map((n) => n.split(' ')[0]);
    return `${given.join(' & ')} ${surnames[0]}`;
  }
  return names.join(' & ');
}

export function rankTitle(people: { title: string }[]): string {
  const titles = Array.from(new Set(people.map((p) => toTurkishUpper(p.title))));
  if (people.length > 1 && titles.length === 1 && titles[0] === 'GAYRİMENKUL DANIŞMANI') {
    return 'GAYRİMENKUL DANIŞMANLARI';
  }
  return titles.join(' / ');
}

function wrapName(
  ctx: CanvasRenderingContext2D,
  text: string,
  trackingPx: number,
  maxWidth: number
): string[] {
  if (trackedWidth(ctx, text, trackingPx) <= maxWidth) return [text];
  const amp = text.indexOf(' & ');
  if (amp > 0) {
    return [text.slice(0, amp + 2), text.slice(amp + 3)];
  }
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let best: string[] = [text];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = Math.max(...lines.map((l) => trackedWidth(ctx, l, trackingPx)));
    if (w < bestWidth) {
      best = lines;
      bestWidth = w;
    }
  }
  return best;
}

function drawPhotos(
  ctx: CanvasRenderingContext2D,
  people: RenderPerson[],
  layout: RankVisualLayout,
  adjust: RankAdjust | PhotoAdjust
) {
  // withPhoto indeksleri → orijinal people indeksi (kişi ayarı için)
  const withPhotoIdx: number[] = [];
  for (let i = 0; i < people.length; i += 1) {
    const p = people[i]!;
    if (p.photo && (p.face || p.bounds)) withPhotoIdx.push(i);
  }
  if (!withPhotoIdx.length) return;
  const rankAdjust = normalizeRankAdjust(adjust, people.length);
  const { width: W, height: H } = RANK_CANVAS;
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext('2d');
  if (!lctx) return;

  if (layout.grayscalePhoto) lctx.filter = 'grayscale(1)';

  const count = withPhotoIdx.length;
  const groupScale = count === 1 ? 1 : count === 2 ? 0.8 : 0.66;
  const qGuide = layout.quarterFace;
  const withPhoto = withPhotoIdx.map((i) => people[i]!);
  const useQuarter =
    Boolean(qGuide) &&
    withPhoto.every(
      (p) =>
        p.face &&
        p.face.noseX != null &&
        p.face.chinY != null &&
        (p.bounds || p.face.foreheadY != null)
    );
  const useFace =
    !useQuarter &&
    Boolean(layout.face) &&
    withPhoto.every((p) => p.face && p.face.eyeDistance > 4);
  // Aralık kişi ölçeğinden bağımsız (slot düzeni bozulmasın)
  const baseTargetW = layout.photo.width * groupScale;
  const baseTargetEye = layout.face ? layout.face.eyeDistance * groupScale : 0;
  const baseTargetHeadH = qGuide ? (qGuide.chinY - qGuide.headTop) * groupScale : 0;
  const spacing = useFace
    ? baseTargetEye * 5.2
    : useQuarter
      ? baseTargetHeadH * 0.85
      : baseTargetW * 0.62;
  const alignShift = layout.text.align === 'left' ? ((count - 1) / 2) * spacing * 0.55 : 0;
  const faceAnchor = layout.face;

  // Sağdakiler önce, soldaki en üstte kalsın.
  for (let i = count - 1; i >= 0; i -= 1) {
    const person = withPhoto[i]!;
    const personAdj = rankAdjust.people[withPhotoIdx[i]!] || DEFAULT_PHOTO_ADJUST;
    const flipH = Boolean(personAdj.flipH);
    const targetW = baseTargetW * personAdj.scale;
    const targetEye = baseTargetEye * personAdj.scale;
    const targetHeadH = baseTargetHeadH * personAdj.scale;
    const img = person.photo!;
    const imgW = img.naturalWidth;
    const face = person.face && flipH ? flipFaceMetrics(person.face, imgW) : person.face;
    const bounds = person.bounds && flipH ? flipOpaqueBox(person.bounds, imgW) : person.bounds;

    if (useQuarter && qGuide && face) {
      // Saç üstü = opak kutu üstü (alın landmark’ı değil) → üst grid’e oturur; burun dikeyde.
      // flipH: landmark X aynalanır + çizimde mirror → burun slot’ta kalır, yüz içeri açılır.
      const hairTop =
        bounds?.y ??
        Math.max(0, (face.foreheadY ?? face.chinY! * 0.55) - 20);
      const srcH = Math.max(8, face.chinY! - hairTop);
      const scale = targetHeadH / srcH;
      const slotNoseX =
        qGuide.noseX + alignShift + (i - (count - 1) / 2) * spacing + personAdj.dx;
      const drawX = slotNoseX - face.noseX! * scale;
      const drawY = qGuide.headTop + personAdj.dy - hairTop * scale;
      drawPersonPhoto(lctx, img, drawX, drawY, scale, flipH);
      continue;
    }

    const slotX =
      (useFace && faceAnchor ? faceAnchor.eyeMidX : layout.photo.centerX) +
      alignShift +
      (i - (count - 1) / 2) * spacing +
      personAdj.dx;

    if (useFace && faceAnchor && face) {
      const scale = targetEye / face.eyeDistance;
      const drawX = slotX - face.eyeMidX * scale;
      const drawY = faceAnchor.eyeMidY + personAdj.dy - face.eyeMidY * scale;
      drawPersonPhoto(lctx, img, drawX, drawY, scale, flipH);
      continue;
    }

    const box = bounds!;
    if (qGuide) {
      const scale = (targetHeadH || qGuide.chinY - qGuide.headTop) / Math.max(8, box.h);
      // Bounds yolunda burun ≈ yüz kutusunun ~%42’si (MediaPipe yokken yarı yüz).
      const noseFrac = flipH ? 0.58 : 0.42;
      const drawX = qGuide.noseX + personAdj.dx - (box.x + box.w * noseFrac) * scale;
      const drawY = qGuide.headTop + personAdj.dy - box.y * scale;
      drawPersonPhoto(lctx, img, drawX, drawY, scale, flipH);
      continue;
    }

    const scale = targetW / Math.max(8, box.w);
    const drawX = slotX - (box.x + box.w / 2) * scale;
    const top = layout.photo.top + (count > 1 ? layout.photo.width * (1 - groupScale) * 0.35 : 0);
    const drawY = top + personAdj.dy - box.y * scale;
    drawPersonPhoto(lctx, img, drawX, drawY, scale, flipH);
  }

  lctx.filter = 'none';

  const { start, end, max, clipBottom } = layout.fade;
  lctx.globalCompositeOperation = 'source-atop';
  const gradient = lctx.createLinearGradient(0, start, 0, end);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${max})`);
  lctx.fillStyle = gradient;
  lctx.fillRect(0, start, W, end - start);
  lctx.fillStyle = `rgba(0,0,0,${max})`;
  lctx.fillRect(0, end, W, H - end);
  lctx.globalCompositeOperation = 'destination-out';
  lctx.fillStyle = '#000';
  lctx.fillRect(0, clipBottom, W, H - clipBottom);
  lctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(layer, 0, 0);
}

function drawRankNumber(ctx: CanvasRenderingContext2D, rank: number, layout: RankVisualLayout) {
  const n = layout.number;
  if (!n) return;
  const digits = String(rank);
  const suffix = turkishRankSuffix(rank);
  const numberFont = `${n.size}px "${RANK_FONTS.number.family}"`;
  const suffixFont = `${n.suffixSize}px "${RANK_FONTS.number.family}"`;

  ctx.font = numberFont;
  const digitsMetrics = ctx.measureText(digits);
  const digitsX = n.left + (digitsMetrics.actualBoundingBoxLeft || 0);
  const digitsInkRight = digitsX + (digitsMetrics.actualBoundingBoxRight || digitsMetrics.width);
  const radius = n.dotDiameter / 2;
  const dotCx = digitsInkRight + n.dotGap + radius;
  const dotCy = n.baseline + 1 - radius;
  ctx.font = suffixFont;
  const suffixX = dotCx + radius + n.suffixGap + inkLeft(ctx, suffix);

  const paintShapes = (mode: 'glow' | 'fill') => {
    ctx.font = numberFont;
    if (mode === 'glow') ctx.strokeText(digits, digitsX, n.baseline);
    else ctx.fillText(digits, digitsX, n.baseline);
    ctx.font = suffixFont;
    if (mode === 'glow') ctx.strokeText(suffix, suffixX, n.baseline);
    else ctx.fillText(suffix, suffixX, n.baseline);
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = n.glowStroke;
  ctx.strokeStyle = n.glowColor;
  ctx.fillStyle = n.glowColor;
  ctx.shadowColor = 'rgba(21,21,21,0.95)';
  ctx.shadowBlur = n.glowBlur;
  for (let pass = 0; pass < 2; pass += 1) {
    paintShapes('glow');
    ctx.beginPath();
    ctx.arc(dotCx, dotCy, radius + n.glowStroke / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = n.color;
  paintShapes('fill');
  ctx.fillStyle = n.dotColor;
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNameBlock(
  ctx: CanvasRenderingContext2D,
  name: string,
  title: string,
  layout: RankVisualLayout
) {
  const t = layout.text;
  const nameColor = layout.nameColor || '#FFFFFF';
  ctx.save();
  ctx.fillStyle = nameColor;
  ctx.textBaseline = 'alphabetic';
  // PSD örneğinde çift kerning uygulanmamış (L–T arası açık).
  ctx.fontKerning = 'none';

  let nameSize = t.nameSize;
  ctx.font = `${nameSize}px "${RANK_FONTS.name.family}"`;
  const lines = wrapName(ctx, name, t.nameTracking * nameSize, t.nameMaxWidth);
  const widest = () =>
    Math.max(...lines.map((l) => trackedWidth(ctx, l, t.nameTracking * nameSize)));
  if (widest() > t.nameMaxWidth) {
    nameSize = Math.max(t.nameSize * 0.62, (nameSize * t.nameMaxWidth) / widest());
    ctx.font = `${nameSize}px "${RANK_FONTS.name.family}"`;
  }
  const lineHeight = nameSize * 1.12;
  const nameTrack = t.nameTracking * nameSize;
  const nameWidths = lines.map((l) => trackedWidth(ctx, l, nameTrack));

  ctx.font = `${t.titleSize}px "${RANK_FONTS.title.family}"`;
  const titleTrack = t.titleTracking * t.titleSize;
  const titleWidth = trackedWidth(ctx, title, titleTrack);
  const titleInk = inkLeft(ctx, title);

  const ruleWidth = Math.max(titleWidth, ...nameWidths);
  const ruleLeft = t.align === 'left' ? t.x - 2 : t.x - ruleWidth / 2;
  const ruleTop = t.nameBaseline + t.ruleOffset;

  ctx.font = `${nameSize}px "${RANK_FONTS.name.family}"`;
  lines.forEach((line, index) => {
    const baseline = t.nameBaseline - (lines.length - 1 - index) * lineHeight;
    const width = nameWidths[index]!;
    const x = t.align === 'left' ? t.x + inkLeft(ctx, line) : t.x - width / 2;
    fillTracked(ctx, line, x, baseline, nameTrack);
  });

  ctx.fillStyle = nameColor;
  ctx.fillRect(Math.round(ruleLeft), ruleTop, Math.round(ruleWidth + (t.align === 'left' ? 2 : 0)), t.ruleThickness);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${t.titleSize}px "${RANK_FONTS.title.family}"`;
  const titleX = t.align === 'left' ? t.x - 4 + titleInk : t.x - titleWidth / 2;
  fillTracked(ctx, title, titleX, t.nameBaseline + t.titleOffset, titleTrack);
  ctx.restore();
}

async function drawQuarterMedal(
  ctx: CanvasRenderingContext2D,
  rank: number,
  layout: RankVisualLayout,
  periodId?: RankPeriodId
) {
  const slot = layout.medal;
  if (!slot) return;
  const url = quarterMedalUrl(periodId, rank);
  if (!url) return;
  const img = await loadRankImage(url);
  if (!img) return;
  const box = measureOpaqueBox(img);
  if (!box) return;
  const scale = slot.targetWidth / Math.max(8, box.w);
  const drawX = slot.centerX - (box.x + box.w / 2) * scale;
  const drawY = slot.top - box.y * scale;
  ctx.drawImage(img, drawX, drawY, img.naturalWidth * scale, img.naturalHeight * scale);
}

export type RenderJob = {
  kind: RankOutputKind;
  templateUrl: string;
  rank: number;
  people: RenderPerson[];
  periodId?: RankPeriodId;
  /** RankAdjust veya eski tek PhotoAdjust */
  adjust?: RankAdjust | PhotoAdjust;
};

function isQuarterPeriod(periodId?: RankPeriodId): boolean {
  if (!periodId) return false;
  return RANK_PERIODS.find((p) => p.id === periodId)?.kind === 'quarter';
}

function layoutForJob(job: RenderJob): RankVisualLayout {
  if (job.kind === 'award') {
    return isQuarterPeriod(job.periodId) ? QUARTER_AWARD_LAYOUT : AWARD_LAYOUT;
  }
  if (isQuarterPeriod(job.periodId)) return QUARTER_LAYOUT;
  const base = RANK_LAYOUT;
  if (!base.number || !job.periodId) return base;
  return {
    ...base,
    number: {
      ...base.number,
      dotColor: RANK_PERIOD_DOT_COLOR[job.periodId] || base.number.dotColor,
    },
  };
}

export async function renderRankVisual(job: RenderJob): Promise<HTMLCanvasElement> {
  await loadRankFonts();
  const template = await loadRankImage(job.templateUrl);
  if (!template) throw new Error('Template yüklenemedi');
  const canvas = document.createElement('canvas');
  canvas.width = RANK_CANVAS.width;
  canvas.height = RANK_CANVAS.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');
  ctx.drawImage(template, 0, 0, RANK_CANVAS.width, RANK_CANVAS.height);

  const layout = layoutForJob(job);
  drawPhotos(
    ctx,
    job.people,
    layout,
    job.adjust || defaultRankAdjust(job.people.length)
  );
  if (job.kind === 'rank') {
    if (isQuarterPeriod(job.periodId)) await drawQuarterMedal(ctx, job.rank, layout, job.periodId);
    else drawRankNumber(ctx, job.rank, layout);
  }
  drawNameBlock(ctx, rankDisplayName(job.people), rankTitle(job.people), layout);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG oluşturulamadı'))), 'image/png');
  });
}

export function rankFileSlug(value: string): string {
  return toConsultantPhotoSlug(value) || normalizeRankKey(value).replace(/\s+/g, '-') || 'kisi';
}

export function rankPersonLabel(name: string): string {
  return toTitleCaseName(name);
}
