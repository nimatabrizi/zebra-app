/**
 * Çeyrek sunum görselleri — yatay 1920×1080.
 * V1: kişi × çeyrek (takım hariç, derece ≤5).
 * V2 (ödül birleşik Excel): kişi + takım; derece ≤10; takımda logo.
 */

import { toTurkishUpper } from './formatName';
import { photoDrawOrder } from './consultantGender';
import {
  DEFAULT_PHOTO_ADJUST,
  RANK_CANVAS,
  RANK_CATEGORIES,
  RANK_FONTS,
  RANK_PERIODS,
  fillTracked,
  loadRankFonts,
  loadRankImage,
  measureOpaqueBox,
  normalizeRankAdjust,
  rankTitle,
  trackedWidth,
  type OpaqueBox,
  type PhotoAdjust,
  type RankAdjust,
  type RankCategoryId,
  type RankEntry,
  type RankFaceMetrics,
  type RankPeriodId,
  type RenderPerson,
} from './rankingVisuals';
import { SLOGAN_BAR_TOP } from './rankingTeamVisuals';

export const PRESENTATION_CANVAS = { width: 1920, height: 1080 } as const;

/** İndirme / yüksek kalite çıktı — mantıksal 1920×1080, fiziksel ×scale */
export const PRESENTATION_EXPORT_SCALE = 2;

/** Altın alt şerit üst kenarı — foto şeridin arkasından çıkar */
export const PRESENTATION_GOLD_BAR_TOP = 1004;

export type PresentationQuarterId = '2026-q2' | '2026-q3';

export type PresentationQuarter = {
  periodId: PresentationQuarterId;
  label: string;
  sheetLabel: string;
  memberPeriodIds: RankPeriodId[];
  templateUrl: string;
  fileSlug: string;
};

export const PRESENTATION_QUARTERS: PresentationQuarter[] = [
  {
    periodId: '2026-q2',
    label: 'II. Çeyrek',
    sheetLabel: '2. Çeyrek',
    memberPeriodIds: ['2026-05', '2026-06', '2026-q2'],
    templateUrl: '/templates/siralama/sunum/2026-q2/template.png',
    fileSlug: '2026-q2-sunum',
  },
  {
    periodId: '2026-q3',
    label: 'III. Çeyrek',
    sheetLabel: '3. Çeyrek',
    memberPeriodIds: ['2026-07', '2026-08', '2026-09', '2026-q3'],
    templateUrl: '/templates/siralama/sunum/2026-q3/template.png',
    fileSlug: '2026-q3-sunum',
  },
];

/** Sunum görselleri 3 — yeni template + rozet (Desktop/SUNUM/ZEBRA) */
export const PRESENTATION_V3_QUARTERS: PresentationQuarter[] = [
  {
    periodId: '2026-q2',
    label: 'II. Çeyrek',
    sheetLabel: '2. Çeyrek',
    memberPeriodIds: ['2026-05', '2026-06', '2026-q2'],
    templateUrl: '/templates/siralama/sunum3/2026-q2/template.png',
    fileSlug: '2026-q2-sunum3',
  },
  {
    periodId: '2026-q3',
    label: 'III. Çeyrek',
    sheetLabel: '3. Çeyrek',
    memberPeriodIds: ['2026-07', '2026-08', '2026-09', '2026-q3'],
    templateUrl: '/templates/siralama/sunum3/2026-q3/template.png',
    fileSlug: '2026-q3-sunum3',
  },
];

/** V3 alt şerit (açık footer) üst kenarı */
export const PRESENTATION_V3_FOOTER_TOP = 990;

export const PRESENTATION_V3_BADGE = { width: 208, height: 289 } as const;

/** Sağ duvar — rozet kümesi */
const WALL = {
  centerX: 1505,
  centerY: 495,
  maxWidth: 760,
  maxHeight: 780,
} as const;

/**
 * Sol foto — Meltem örnek bbox (~171–674 × 458–919).
 * Alt: altın şeridin arkasından çıkar (GOLD_BAR_TOP).
 */
const PHOTO = {
  centerX: 422,
  top: 458,
  width: 540,
  eyeMidY: 545,
  eyeDistance: 88,
  /** Yazı okunaklılığı — yalnızca foto pikselinde (source-atop); fade-out yok */
  scrimStart: 730,
  scrimMid: 860,
  scrimEnd: PRESENTATION_GOLD_BAR_TOP,
  scrimMidAlpha: 0.62,
  scrimEndAlpha: 0.88,
} as const;

const NAME = {
  color: '#c9a24a',
  /** İsim bloğu sol kenarı (foto kolonunda) */
  x: 205,
  baseline: 918,
  size: 52,
  /** 1px letter-spacing */
  tracking: 1,
  maxWidth: 500,
  glow: { color: 'rgba(0,0,0,0.85)', blur: 14, passes: 2 },
} as const;

/**
 * Sunum 3 — danışman kolonu 360group logo sol kenarıyla hizalı (~x81–87).
 * V1/V2 PHOTO/NAME değerleri değişmez.
 */
const PHOTO_V3 = {
  ...PHOTO,
  centerX: 304,
  scrimEnd: PRESENTATION_V3_FOOTER_TOP,
} as const;

const NAME_V3 = {
  ...NAME,
  x: 87,
} as const;

/** Portföy / sıralama ünvan varsayılanı — global ayarla override */
const TITLE = {
  color: '#ffffff',
  offset: 44,
  size: 17,
  trackingRatio: 0.26,
  dx: 0,
} as const;

/** Tüm sunumlarda ortak ünvan (Takım Lideri / Gayrimenkul Danışmanı) yerleşimi */
export const PRESENTATION_TITLE_ADJUST_KEY = 'shared|sunum|title';

/** Sunum görselleri 2 — takım logosu global outer glow / drop shadow */
export const PRESENTATION_SUNUM2_LOGO_GLOW_KEY = 'shared|sunum2|logo-glow';
export const PRESENTATION_SUNUM2_LOGO_SHADOW_KEY = 'shared|sunum2|logo-shadow';
export const PRESENTATION_SUNUM2_LOGO_BLUR_MAX = 160;

export type PresentationTitleAdjust = {
  size: number;
  /** İsim baseline’dan dikey mesafe */
  offset: number;
  /** letter-spacing ≈ size × trackingRatio */
  trackingRatio: number;
  /** Yatay kaydırma (isim merkezine göre) */
  dx: number;
};

/** Takım logosu ışıma / gölge (siyah, güçlüye kadar) */
export type PresentationLogoFxAdjust = {
  blur: number;
  opacity: number;
  color: string;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW: PresentationLogoFxAdjust = {
  blur: 36,
  opacity: 0.75,
  color: '#000000',
  offsetX: 0,
  offsetY: 0,
};

export const DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW: PresentationLogoFxAdjust = {
  blur: 28,
  opacity: 0.7,
  color: '#000000',
  offsetX: 4,
  offsetY: 10,
};

export function normalizePresentationLogoFx(
  raw: unknown,
  fallback: PresentationLogoFxAdjust
): PresentationLogoFxAdjust {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const obj = raw as Partial<PresentationLogoFxAdjust>;
  const blur = Number(obj.blur);
  const opacity = Number(obj.opacity);
  const offsetX = Number(obj.offsetX);
  const offsetY = Number(obj.offsetY);
  return {
    blur: Number.isFinite(blur)
      ? Math.max(0, Math.min(PRESENTATION_SUNUM2_LOGO_BLUR_MAX, blur))
      : fallback.blur,
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : fallback.opacity,
    color:
      typeof obj.color === 'string' && /^#[0-9a-f]{6}$/i.test(obj.color.trim())
        ? obj.color.trim()
        : fallback.color,
    offsetX: Number.isFinite(offsetX)
      ? Math.max(-80, Math.min(80, Math.round(offsetX)))
      : fallback.offsetX,
    offsetY: Number.isFinite(offsetY)
      ? Math.max(-80, Math.min(80, Math.round(offsetY)))
      : fallback.offsetY,
  };
}

export const DEFAULT_PRESENTATION_TITLE_ADJUST: PresentationTitleAdjust = {
  size: TITLE.size,
  offset: TITLE.offset,
  trackingRatio: TITLE.trackingRatio,
  dx: TITLE.dx,
};

export function normalizePresentationTitleAdjust(raw: unknown): PresentationTitleAdjust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRESENTATION_TITLE_ADJUST };
  const obj = raw as Partial<PresentationTitleAdjust>;
  const size =
    typeof obj.size === 'number' && Number.isFinite(obj.size)
      ? Math.min(36, Math.max(10, obj.size))
      : DEFAULT_PRESENTATION_TITLE_ADJUST.size;
  const offset =
    typeof obj.offset === 'number' && Number.isFinite(obj.offset)
      ? Math.min(120, Math.max(16, obj.offset))
      : DEFAULT_PRESENTATION_TITLE_ADJUST.offset;
  const trackingRatio =
    typeof obj.trackingRatio === 'number' && Number.isFinite(obj.trackingRatio)
      ? Math.min(0.55, Math.max(0.05, obj.trackingRatio))
      : DEFAULT_PRESENTATION_TITLE_ADJUST.trackingRatio;
  const dx =
    typeof obj.dx === 'number' && Number.isFinite(obj.dx)
      ? Math.min(200, Math.max(-200, obj.dx))
      : DEFAULT_PRESENTATION_TITLE_ADJUST.dx;
  return { size, offset, trackingRatio, dx };
}

const PERSONAL_CATEGORIES: RankCategoryId[] = ['islem', 'portfoy', 'ciro'];

export type PresentationBadge = {
  periodId: RankPeriodId;
  category: RankCategoryId;
  rank: number;
  gold: boolean;
  url: string;
  label: string;
};

/** Sunum slaytındaki bir portre (tekli veya ortak) */
export type PresentationJobPerson = {
  key: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
};

export type PresentationJob = {
  key: string;
  quarterId: PresentationQuarterId;
  personKey: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
  /** Ortaklar (&) — yan yana portreler; yoksa photoUrl tekli */
  people?: PresentationJobPerson[];
  /** V2 takım slaytı — danışman fotoğu yerine logo */
  kind?: 'person' | 'team';
  logoUrl?: string | null;
  badges: PresentationBadge[];
  templateUrl: string;
  /** Tekli indirme dosya adı — örn. "Cahit Erez - II. Çeyrek.png" */
  downloadName: string;
  /** ZIP içi yol (çeyrek klasörü + downloadName) */
  zipPath: string;
  label: string;
  detail: string;
  /** Kişi foto ayarı anahtarı (çeyrekler arası ortak) */
  adjustKey: string;
};

/** Job’daki portre listesi (ortak veya tekli). */
export function presentationJobPeople(job: PresentationJob): PresentationJobPerson[] {
  if (job.people?.length) return job.people;
  return [
    {
      key: job.personKey,
      displayName: job.displayName,
      title: job.title,
      photoUrl: job.photoUrl,
    },
  ];
}

/** İndirme / ZIP dosya adı */
export function presentationDownloadName(displayName: string, quarterLabel: string): string {
  return `${displayName} - ${quarterLabel}.png`;
}

export function presentationAdjustKey(personKey: string): string {
  return `shared|sunum|${personKey}`;
}

/** Sunum görselleri 2 — yalnızca takım (danışman foto ayarı v1 ile paylaşılır) */
export function presentationAdjustKeyV2Team(teamId: string): string {
  return `shared|sunum2|team:${teamId}`;
}

export function presentationBadgeUrl(
  periodId: RankPeriodId,
  category: RankCategoryId,
  rank: number
): string {
  return `/templates/siralama/sunum/rozet/${periodId}_${category}_${rank}.png`;
}

export function presentationBadgeUrlV3(
  periodId: RankPeriodId,
  category: RankCategoryId,
  rank: number
): string {
  return `/templates/siralama/sunum3/rozet/${periodId}_${category}_${rank}.png`;
}

export function presentationAdjustKeyV3Team(teamId: string): string {
  return `shared|sunum3|team:${teamId}`;
}

function periodSortIndex(periodId: RankPeriodId): number {
  return RANK_PERIODS.findIndex((p) => p.id === periodId);
}

function categorySortIndex(category: RankCategoryId): number {
  const personal = PERSONAL_CATEGORIES.indexOf(category);
  if (personal >= 0) return personal;
  if (category === 'takim') return PERSONAL_CATEGORIES.length;
  return PERSONAL_CATEGORIES.length + 1;
}

export function sortPresentationBadges(badges: PresentationBadge[]): PresentationBadge[] {
  return [...badges].sort(
    (a, b) =>
      periodSortIndex(a.periodId) - periodSortIndex(b.periodId) ||
      categorySortIndex(a.category) - categorySortIndex(b.category) ||
      a.rank - b.rank
  );
}

function badgeLabel(periodId: RankPeriodId, category: RankCategoryId, rank: number): string {
  const period = RANK_PERIODS.find((p) => p.id === periodId);
  const cat = RANK_CATEGORIES.find((c) => c.id === category);
  return `${period?.label || periodId} · ${cat?.short || category} · ${rank}.`;
}

export function normalizePresentationAdjust(raw: unknown): PhotoAdjust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PHOTO_ADJUST };
  const obj = raw as Partial<PhotoAdjust>;
  return {
    scale: typeof obj.scale === 'number' && Number.isFinite(obj.scale) ? obj.scale : 1,
    dx: typeof obj.dx === 'number' && Number.isFinite(obj.dx) ? obj.dx : 0,
    dy: typeof obj.dy === 'number' && Number.isFinite(obj.dy) ? obj.dy : 0,
    flipH: Boolean(obj.flipH),
  };
}

/**
 * Excel sıralamalarından kişi × çeyrek sunum işleri.
 * Takım kategorisi atlanır. Ortak/berabere satırlarda her kişiye ayrı iş.
 */
export function buildPresentationJobs(
  entries: RankEntry[],
  resolvePerson: (name: string, key: string) => {
    key: string;
    displayName: string;
    title: string;
    photoUrl: string | null;
  }
): PresentationJob[] {
  const jobs: PresentationJob[] = [];

  for (const quarter of PRESENTATION_QUARTERS) {
    const memberSet = new Set(quarter.memberPeriodIds);
    type Acc = {
      displayName: string;
      title: string;
      photoUrl: string | null;
      badges: Map<string, PresentationBadge>;
    };
    const byPerson = new Map<string, Acc>();

    for (const entry of entries) {
      if (!memberSet.has(entry.periodId)) continue;
      if (!PERSONAL_CATEGORIES.includes(entry.category)) continue;
      if (entry.rank < 1 || entry.rank > 5) continue;

      for (const raw of entry.people) {
        const person = resolvePerson(raw.name, raw.key);
        let acc = byPerson.get(person.key);
        if (!acc) {
          acc = {
            displayName: person.displayName,
            title: person.title,
            photoUrl: person.photoUrl,
            badges: new Map(),
          };
          byPerson.set(person.key, acc);
        }
        const badgeKey = `${entry.periodId}|${entry.category}|${entry.rank}`;
        if (acc.badges.has(badgeKey)) continue;
        const gold = entry.periodId === quarter.periodId;
        acc.badges.set(badgeKey, {
          periodId: entry.periodId,
          category: entry.category,
          rank: entry.rank,
          gold,
          url: presentationBadgeUrl(entry.periodId, entry.category, entry.rank),
          label: badgeLabel(entry.periodId, entry.category, entry.rank),
        });
      }
    }

    for (const [personKey, acc] of byPerson) {
      const badges = sortPresentationBadges([...acc.badges.values()]);
      if (!badges.length) continue;
      const downloadName = presentationDownloadName(acc.displayName, quarter.label);
      jobs.push({
        key: `sunum|${quarter.periodId}|${personKey}`,
        quarterId: quarter.periodId,
        personKey,
        displayName: acc.displayName,
        title: acc.title,
        photoUrl: acc.photoUrl,
        badges,
        templateUrl: quarter.templateUrl,
        downloadName,
        zipPath: `${quarter.label}/${downloadName}`,
        label: acc.displayName,
        detail: `${quarter.label} · ${badges.length} rozet`,
        adjustKey: presentationAdjustKey(personKey),
      });
    }
  }

  return jobs.sort(
    (a, b) =>
      a.quarterId.localeCompare(b.quarterId) ||
      a.displayName.localeCompare(b.displayName, 'tr')
  );
}

export type PresentationTeamResolve = {
  key: string;
  displayName: string;
  logoUrl: string | null;
};

function buildPresentationJobsForQuarters(
  entries: RankEntry[],
  quarters: PresentationQuarter[],
  resolvePerson: (name: string, key: string) => {
    key: string;
    displayName: string;
    title: string;
    photoUrl: string | null;
  },
  resolveTeam: (name: string, key: string) => PresentationTeamResolve,
  opts: {
    keyPrefix: string;
    badgeUrl: typeof presentationBadgeUrl;
    teamAdjustKey: (teamId: string) => string;
  }
): PresentationJob[] {
  const jobs: PresentationJob[] = [];
  const maxPersonalRank = 10;
  const maxTeamRank = 5;

  for (const quarter of quarters) {
    const memberSet = new Set(quarter.memberPeriodIds);
    type Acc = {
      kind: 'person' | 'team';
      displayName: string;
      title: string;
      photoUrl: string | null;
      people: PresentationJobPerson[];
      logoUrl: string | null;
      badges: Map<string, PresentationBadge>;
    };
    const bySubject = new Map<string, Acc>();

    for (const entry of entries) {
      if (!memberSet.has(entry.periodId)) continue;

      if (entry.category === 'takim') {
        if (entry.rank < 1 || entry.rank > maxTeamRank) continue;
        for (const raw of entry.people) {
          const team = resolveTeam(raw.name, raw.key);
          const subjectKey = `team:${team.key}`;
          let acc = bySubject.get(subjectKey);
          if (!acc) {
            acc = {
              kind: 'team',
              displayName: team.displayName,
              title: '',
              photoUrl: null,
              people: [],
              logoUrl: team.logoUrl,
              badges: new Map(),
            };
            bySubject.set(subjectKey, acc);
          }
          const badgeKey = `${entry.periodId}|takim|${entry.rank}`;
          if (acc.badges.has(badgeKey)) continue;
          const gold = entry.periodId === quarter.periodId;
          acc.badges.set(badgeKey, {
            periodId: entry.periodId,
            category: 'takim',
            rank: entry.rank,
            gold,
            url: opts.badgeUrl(entry.periodId, 'takim', entry.rank),
            label: badgeLabel(entry.periodId, 'takim', entry.rank),
          });
        }
        continue;
      }

      if (!PERSONAL_CATEGORIES.includes(entry.category)) continue;
      if (entry.rank < 1 || entry.rank > maxPersonalRank) continue;
      if (!entry.people.length) continue;

      const resolved = entry.people.map((raw) => resolvePerson(raw.name, raw.key));
      const personKey = resolved.map((p) => p.key).join('+');
      const subjectKey = `person:${personKey}`;
      let acc = bySubject.get(subjectKey);
      if (!acc) {
        const displayName =
          entry.people.length > 1
            ? entry.rawName.trim() ||
              resolved.map((p) => p.displayName).join(' & ')
            : resolved[0]!.displayName;
        acc = {
          kind: 'person',
          displayName,
          title: rankTitle(resolved),
          photoUrl: resolved[0]!.photoUrl,
          people: resolved.map((p) => ({
            key: p.key,
            displayName: p.displayName,
            title: p.title,
            photoUrl: p.photoUrl,
          })),
          logoUrl: null,
          badges: new Map(),
        };
        bySubject.set(subjectKey, acc);
      }
      const badgeKey = `${entry.periodId}|${entry.category}|${entry.rank}`;
      if (acc.badges.has(badgeKey)) continue;
      const gold = entry.periodId === quarter.periodId;
      acc.badges.set(badgeKey, {
        periodId: entry.periodId,
        category: entry.category,
        rank: entry.rank,
        gold,
        url: opts.badgeUrl(entry.periodId, entry.category, entry.rank),
        label: badgeLabel(entry.periodId, entry.category, entry.rank),
      });
    }

    for (const [subjectKey, acc] of bySubject) {
      const badges = sortPresentationBadges([...acc.badges.values()]);
      if (!badges.length) continue;
      const personKey = subjectKey.replace(/^(person|team):/, '');
      const downloadName = presentationDownloadName(acc.displayName, quarter.label);
      jobs.push({
        key: `${opts.keyPrefix}|${quarter.periodId}|${subjectKey}`,
        quarterId: quarter.periodId,
        personKey,
        displayName: acc.displayName,
        title: acc.title,
        photoUrl: acc.photoUrl,
        people: acc.kind === 'person' ? acc.people : undefined,
        kind: acc.kind,
        logoUrl: acc.logoUrl,
        badges,
        templateUrl: quarter.templateUrl,
        downloadName,
        zipPath: `${quarter.label}/${downloadName}`,
        label: acc.displayName,
        detail: `${quarter.label} · ${badges.length} rozet${acc.kind === 'team' ? ' · takım' : ''}${
          acc.people.length > 1 ? ' · ortak' : ''
        }`,
        adjustKey:
          acc.kind === 'team'
            ? opts.teamAdjustKey(personKey)
            : presentationAdjustKey(personKey),
      });
    }
  }

  return jobs.sort(
    (a, b) =>
      a.quarterId.localeCompare(b.quarterId) ||
      Number(a.kind === 'team') - Number(b.kind === 'team') ||
      a.displayName.localeCompare(b.displayName, 'tr')
  );
}

/**
 * Sunum görselleri 2 — birleşik ödül Excel’i.
 * Kişisel 1–10 + takım (logo, ünvan boş).
 * Ortak satırlar (&): tek slayt, yan yana portre (PDF sırası).
 */
/**
 * Sunum görselleri 2 — birleşik ödül Excel’i.
 * Kişisel 1–10 + takım (logo, ünvan boş).
 * Ortak satırlar (&): tek slayt, yan yana portre (PDF sırası).
 */
export function buildPresentationJobsV2(
  entries: RankEntry[],
  resolvePerson: (name: string, key: string) => {
    key: string;
    displayName: string;
    title: string;
    photoUrl: string | null;
  },
  resolveTeam: (name: string, key: string) => PresentationTeamResolve
): PresentationJob[] {
  return buildPresentationJobsForQuarters(
    entries,
    PRESENTATION_QUARTERS,
    resolvePerson,
    resolveTeam,
    {
      keyPrefix: 'sunum2',
      badgeUrl: presentationBadgeUrl,
      teamAdjustKey: presentationAdjustKeyV2Team,
    }
  );
}

/**
 * Sunum görselleri 3 — yeni template/rozet; PDF sırası; takım = Ödülünüz var şeridi.
 */
export function buildPresentationJobsV3(
  entries: RankEntry[],
  resolvePerson: (name: string, key: string) => {
    key: string;
    displayName: string;
    title: string;
    photoUrl: string | null;
  },
  resolveTeam: (name: string, key: string) => PresentationTeamResolve
): PresentationJob[] {
  return buildPresentationJobsForQuarters(
    entries,
    PRESENTATION_V3_QUARTERS,
    resolvePerson,
    resolveTeam,
    {
      keyPrefix: 'sunum3',
      badgeUrl: presentationBadgeUrlV3,
      teamAdjustKey: presentationAdjustKeyV3Team,
    }
  );
}

/**
 * Satır satır birim merkezler — her satır ortalanır, satır uzunlukları verilmiş.
 * spacing ≈ rozet yüksekliği birimi (W=0.83H).
 */
function rowCenters(
  rowLengths: number[],
  spacingX: number,
  spacingY: number
): { x: number; y: number }[] {
  const rows = rowLengths.length;
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    const cols = rowLengths[r]!;
    const y = rows === 1 ? 0 : (r - (rows - 1) / 2) * spacingY;
    for (let c = 0; c < cols; c += 1) {
      const x = cols === 1 ? 0 : (c - (cols - 1) / 2) * spacingX;
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * Birim merkezler (y↑ aşağı). Slot’lar sonra y’ye göre sıralanır → altınlar üste.
 * Merkez mesafesi / yükseklik oranı ≥ hedef gap (küçültme döngüsü takılmasın).
 * V2: kişi başına 7+ rozet olabilir — 1…n tam slot üretilmeli.
 */
function unitCenters(count: number): { x: number; y: number }[] {
  const n = Math.max(1, count);
  if (n === 1) return [{ x: 0, y: 0 }];
  if (n === 2) {
    // Kenar boşluğu = rozet genişliğinin 1/5’i (W=0.83H → merkez ≈ 0.996H)
    return [{ x: -0.498, y: 0 }, { x: 0.498, y: 0 }];
  }
  if (n === 3) {
    // Biraz daha yakın + büyük
    return [
      { x: 0, y: -0.58 },
      { x: -0.62, y: 0.48 },
      { x: 0.62, y: 0.48 },
    ];
  }
  if (n === 4) {
    // Biraz daha açık baklava — küçülen rozet kadar nefes payı
    return [
      { x: 0, y: -0.78 },
      { x: -0.78, y: 0 },
      { x: 0.78, y: 0 },
      { x: 0, y: 0.78 },
    ];
  }
  if (n === 5) {
    const radius = 1.0;
    const dy = 0.12; // tüm grubu çok az aşağı
    const ring: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      ring.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius + dy });
    }
    return ring;
  }
  if (n === 6) {
    // 3 üst + 3 alt — satır arası kenar boşluğu ≈ yan yana boşluk (W=0.83H)
    return [
      { x: -0.95, y: -0.56 },
      { x: 0, y: -0.56 },
      { x: 0.95, y: -0.56 },
      { x: -0.95, y: 0.56 },
      { x: 0, y: 0.56 },
      { x: 0.95, y: 0.56 },
    ];
  }
  if (n === 7) return rowCenters([3, 4], 0.88, 0.92);
  if (n === 8) return rowCenters([4, 4], 0.82, 0.92);
  if (n === 9) return rowCenters([3, 3, 3], 0.9, 0.88);
  if (n === 10) return rowCenters([3, 4, 3], 0.82, 0.86);
  if (n === 11) return rowCenters([4, 3, 4], 0.78, 0.84);
  if (n === 12) return rowCenters([4, 4, 4], 0.76, 0.82);
  // 13+: 4’lü satırlar (tam n slot)
  const rows4 = Math.floor(n / 4);
  const rem = n % 4;
  const lengths =
    rem === 0
      ? Array.from({ length: rows4 }, () => 4)
      : rem === 1 && rows4 >= 1
        ? // 4+4+…+3+3 — tek kalan satırı 1’li bırakma
          [...Array.from({ length: rows4 - 1 }, () => 4), 3, 2]
        : [...Array.from({ length: rows4 }, () => 4), rem];
  const spacingY = Math.max(0.72, 2.4 / Math.max(1, lengths.length - 1));
  return rowCenters(lengths, 0.74, spacingY);
}

function orderBadgesForLayout(badges: PresentationBadge[]): PresentationBadge[] {
  const golds = badges.filter((b) => b.gold);
  const silvers = badges.filter((b) => !b.gold);
  return [...golds, ...silvers];
}

/** Slot’ları üstten alta — altınlar (ordered başı) yukarıya düşer */
function sortSlotsTopFirst(centers: { x: number; y: number }[]): { x: number; y: number }[] {
  return [...centers].sort((a, b) => a.y - b.y || a.x - b.x);
}

export type BadgePlacement = {
  badge: PresentationBadge;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutProfile = {
  /** Hedef rozet yüksekliği */
  targetHeight: number;
  /** Minimum kabul edilen yükseklik */
  minHeight: number;
  /** Merkez mesafesi ≥ height × bu oran (kenar çakışmasın) */
  minGapRatio: number;
};

function profileForCount(n: number): LayoutProfile {
  if (n <= 1) return { targetHeight: 480, minHeight: 420, minGapRatio: 0 };
  if (n === 2) return { targetHeight: 400, minHeight: 350, minGapRatio: 0.99 };
  if (n === 3) return { targetHeight: 345, minHeight: 310, minGapRatio: 1.02 };
  if (n === 4) return { targetHeight: 325, minHeight: 295, minGapRatio: 1.05 };
  if (n === 5) return { targetHeight: 290, minHeight: 250, minGapRatio: 0.98 };
  if (n === 6) return { targetHeight: 245, minHeight: 225, minGapRatio: 0.95 };
  if (n === 7) return { targetHeight: 210, minHeight: 185, minGapRatio: 0.92 };
  if (n === 8) return { targetHeight: 195, minHeight: 170, minGapRatio: 0.9 };
  if (n === 9) return { targetHeight: 175, minHeight: 150, minGapRatio: 0.88 };
  if (n === 10) return { targetHeight: 160, minHeight: 138, minGapRatio: 0.86 };
  if (n <= 12) return { targetHeight: 145, minHeight: 125, minGapRatio: 0.84 };
  return { targetHeight: 128, minHeight: 108, minGapRatio: 0.8 };
}

/**
 * Sunum 3 — örnek slaytlardan ölçülen sabit boyut/mesafe (208×289).
 * 1–4: tek satır; 5–7: üstte 4 + altta kalan (3. sütundan).
 */
export function layoutPresentationBadgesV3(badges: PresentationBadge[]): BadgePlacement[] {
  const ordered = orderBadgesForLayout(badges);
  const n = ordered.length;
  if (!n) return [];

  const { width: bw, height: bh } = PRESENTATION_V3_BADGE;
  const topY = 85;
  const row2Y = 403;
  const topXs = [84, 326, 568, 810];
  const bottomXs = [570, 820, 1070];

  const slots: { x: number; y: number }[] = [];
  if (n <= 4) {
    for (let i = 0; i < n; i += 1) slots.push({ x: topXs[i]!, y: topY });
  } else {
    for (let i = 0; i < 4; i += 1) slots.push({ x: topXs[i]!, y: topY });
    const extra = Math.min(3, n - 4);
    for (let i = 0; i < extra; i += 1) slots.push({ x: bottomXs[i]!, y: row2Y });
  }

  return ordered.slice(0, slots.length).map((badge, i) => ({
    badge,
    x: slots[i]!.x,
    y: slots[i]!.y,
    width: bw,
    height: bh,
  }));
}

/**
 * Eşit boyut + eşit mesafe.
 * İkili büyük; üçlü yakın/büyük; dörtlü büyük; altılı hafif aralıklı, altın üstte.
 */
export function layoutPresentationBadges(badges: PresentationBadge[]): BadgePlacement[] {
  const ordered = orderBadgesForLayout(badges);
  const n = ordered.length;
  if (!n) return [];

  const centers = unitCenters(n);
  if (centers.length !== n) {
    throw new Error(`Rozet yerleşimi: ${n} rozet için ${centers.length} slot`);
  }
  const slots = sortSlotsTopFirst(centers);
  const aspect = 0.83;
  const profile = profileForCount(n);
  let height = profile.targetHeight;

  for (let guard = 0; guard < 40; guard += 1) {
    const width = height * aspect;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let minDist = Infinity;
    for (let i = 0; i < n; i += 1) {
      const c = slots[i];
      if (!c) break;
      const cx = WALL.centerX + c.x * height;
      const cy = WALL.centerY + c.y * height;
      minX = Math.min(minX, cx - width / 2);
      maxX = Math.max(maxX, cx + width / 2);
      minY = Math.min(minY, cy - height / 2);
      maxY = Math.max(maxY, cy + height / 2);
      for (let j = i + 1; j < n; j += 1) {
        const d = slots[j];
        if (!d) break;
        minDist = Math.min(
          minDist,
          Math.hypot((c.x - d.x) * height, (c.y - d.y) * height)
        );
      }
    }
    const fitsBox =
      maxX - minX <= WALL.maxWidth &&
      maxY - minY <= WALL.maxHeight &&
      minX >= 1100 &&
      maxX <= 1900 &&
      minY >= 70 &&
      maxY <= 930;
    const fitsGap = n === 1 || minDist >= height * profile.minGapRatio;
    if (fitsBox && fitsGap) break;
    if (height <= profile.minHeight) break;
    height = Math.max(profile.minHeight, height * (fitsBox ? 0.985 : 0.96));
  }

  height = Math.max(height, profile.minHeight);
  const width = height * aspect;

  return ordered.map((badge, i) => {
    const c = slots[i] ?? { x: 0, y: 0 };
    const cx = WALL.centerX + c.x * height;
    const cy = WALL.centerY + c.y * height;
    return {
      badge,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
    };
  });
}

function flipFace(face: RankFaceMetrics, imgW: number): RankFaceMetrics {
  return {
    ...face,
    eyeMidX: imgW - face.eyeMidX,
    noseX: face.noseX != null ? imgW - face.noseX : undefined,
  };
}

function flipBounds(box: OpaqueBox, imgW: number): OpaqueBox {
  return { ...box, x: imgW - box.x - box.w };
}

function drawPersonPhotoMirrored(
  lctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  drawX: number,
  drawY: number,
  scale: number,
  flipH: boolean
) {
  lctx.save();
  if (flipH) {
    lctx.translate(drawX + img.naturalWidth * scale, drawY);
    lctx.scale(-1, 1);
    lctx.drawImage(img, 0, 0, img.naturalWidth * scale, img.naturalHeight * scale);
  } else {
    lctx.drawImage(
      img,
      drawX,
      drawY,
      img.naturalWidth * scale,
      img.naturalHeight * scale
    );
  }
  lctx.restore();
}

/**
 * Tekli veya ortak (&) portreler — yan yana, kişi başına PhotoAdjust.
 * outputScale: ara katman fiziksel çözünürlüğü (parent ctx transform ile uyumlu).
 */
function drawPresentationPhotos(
  ctx: CanvasRenderingContext2D,
  people: RenderPerson[],
  adjust: RankAdjust | PhotoAdjust,
  photo: typeof PHOTO | typeof PHOTO_V3 = PHOTO,
  outputScale = 1
) {
  const withPhotoIdx: number[] = [];
  for (let i = 0; i < people.length; i += 1) {
    if (people[i]?.photo) withPhotoIdx.push(i);
  }
  if (!withPhotoIdx.length) return;

  const s = Math.max(1, Math.min(3, outputScale));
  const { width: W, height: H } = PRESENTATION_CANVAS;
  const rankAdjust = normalizeRankAdjust(adjust, people.length);
  const layer = document.createElement('canvas');
  layer.width = Math.round(W * s);
  layer.height = Math.round(H * s);
  const lctx = layer.getContext('2d');
  if (!lctx) return;
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = 'high';
  lctx.setTransform(s, 0, 0, s, 0, 0);

  const count = withPhotoIdx.length;
  const groupScale = count === 1 ? 1 : count === 2 ? 0.78 : 0.64;
  const withPhoto = withPhotoIdx.map((i) => people[i]!);
  const useFace = withPhoto.every((p) => p.face && p.face.eyeDistance > 4);
  const baseTargetW = photo.width * groupScale;
  const baseTargetEye = photo.eyeDistance * groupScale;
  const spacing = useFace ? baseTargetEye * 5.0 : baseTargetW * 0.68;

  const drawOrder = photoDrawOrder(withPhoto.map((p) => p.displayName));
  for (const i of drawOrder) {
    const person = withPhoto[i]!;
    const personAdj = rankAdjust.people[withPhotoIdx[i]!] || DEFAULT_PHOTO_ADJUST;
    const flipH = Boolean(personAdj.flipH);
    const img = person.photo!;
    const imgW = img.naturalWidth;
    const face = person.face && flipH ? flipFace(person.face, imgW) : person.face;
    const rawBounds = person.bounds || measureOpaqueBox(img);
    const bounds = rawBounds && flipH ? flipBounds(rawBounds, imgW) : rawBounds;

    const slotX =
      photo.centerX + (i - (count - 1) / 2) * spacing + personAdj.dx;
    const targetW = baseTargetW * personAdj.scale;
    const targetEye = baseTargetEye * personAdj.scale;

    if (useFace && face && face.eyeDistance > 4) {
      const scale = targetEye / face.eyeDistance;
      const drawX = slotX - face.eyeMidX * scale;
      const drawY = photo.eyeMidY - face.eyeMidY * scale + personAdj.dy;
      drawPersonPhotoMirrored(lctx, img, drawX, drawY, scale, flipH);
      continue;
    }

    if (bounds) {
      const scale = targetW / Math.max(8, bounds.w);
      const drawX = slotX - (bounds.x + bounds.w / 2) * scale;
      const top =
        photo.top + (count > 1 ? photo.width * (1 - groupScale) * 0.3 : 0);
      const drawY = top - bounds.y * scale + personAdj.dy;
      drawPersonPhotoMirrored(lctx, img, drawX, drawY, scale, flipH);
      continue;
    }

    const scale = targetW / img.naturalWidth;
    const drawX = slotX - (img.naturalWidth * scale) / 2;
    const drawY = photo.top + personAdj.dy;
    drawPersonPhotoMirrored(lctx, img, drawX, drawY, scale, flipH);
  }

  // Koyu gradient yalnızca fotoğraf piksellerinde (eritme / fade-out yok)
  const scrim = lctx.createLinearGradient(0, photo.scrimStart, 0, photo.scrimEnd);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(
    (photo.scrimMid - photo.scrimStart) / Math.max(1, photo.scrimEnd - photo.scrimStart),
    `rgba(0,0,0,${photo.scrimMidAlpha})`
  );
  scrim.addColorStop(1, `rgba(0,0,0,${photo.scrimEndAlpha})`);
  lctx.globalCompositeOperation = 'source-atop';
  lctx.fillStyle = scrim;
  lctx.fillRect(0, photo.scrimStart, W, photo.scrimEnd - photo.scrimStart + 40);
  lctx.globalCompositeOperation = 'source-over';

  // Parent transform altında mantıksal W×H → fiziksel W*s
  ctx.drawImage(layer, 0, 0, W, H);
}

function wrapPresentationName(name: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  if (trackedWidth(ctx, name, NAME.tracking) <= maxWidth) return [name];
  const amp = name.indexOf(' & ');
  if (amp > 0) {
    return [name.slice(0, amp + 2).trimEnd(), name.slice(amp + 3).trim()];
  }
  return [name];
}

function drawPresentationText(
  ctx: CanvasRenderingContext2D,
  displayName: string,
  title: string,
  titleAdjust: PresentationTitleAdjust,
  nameLayout: typeof NAME | typeof NAME_V3 = NAME
) {
  const name = toTurkishUpper(displayName);
  const titleText = toTurkishUpper(title);
  const tAdj = normalizePresentationTitleAdjust(titleAdjust);

  ctx.textBaseline = 'alphabetic';
  ctx.fontKerning = 'none';

  let nameSize = nameLayout.size;
  ctx.font = `${nameSize}px "${RANK_FONTS.name.family}"`;
  let lines = wrapPresentationName(name, nameLayout.maxWidth, ctx);
  while (
    nameSize > 26 &&
    lines.some((line) => trackedWidth(ctx, line, nameLayout.tracking) > nameLayout.maxWidth)
  ) {
    nameSize -= 1;
    ctx.font = `${nameSize}px "${RANK_FONTS.name.family}"`;
    lines = wrapPresentationName(name, nameLayout.maxWidth, ctx);
  }
  const nameTrack = nameLayout.tracking;
  const lineGap = nameSize * 1.12;
  const lineWidths = lines.map((line) => trackedWidth(ctx, line, nameTrack));
  const nameWidth = Math.max(...lineWidths);
  // Ortak (&) / çok satır: foto kolonunda ortala; tekli sol hizalı kalır
  const centerName = lines.length > 1 || name.includes(' & ');
  const boxCenterX = nameLayout.x + nameLayout.maxWidth / 2;
  const nameInk = ctx.measureText(lines[0] || name).actualBoundingBoxLeft || 0;
  const nameXLeft = nameLayout.x + nameInk;
  const firstBaseline =
    lines.length > 1
      ? nameLayout.baseline - lineGap * (lines.length - 1)
      : nameLayout.baseline;

  const lineX = (line: string, width: number) => {
    if (!centerName) return nameXLeft;
    const ink = ctx.measureText(line).actualBoundingBoxLeft || 0;
    return boxCenterX - width / 2 + ink;
  };

  ctx.save();
  ctx.shadowColor = nameLayout.glow.color;
  ctx.shadowBlur = nameLayout.glow.blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = nameLayout.color;
  for (let p = 0; p < nameLayout.glow.passes; p += 1) {
    lines.forEach((line, i) => {
      fillTracked(
        ctx,
        line,
        lineX(line, lineWidths[i]!),
        firstBaseline + i * lineGap,
        nameTrack
      );
    });
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  lines.forEach((line, i) => {
    fillTracked(
      ctx,
      line,
      lineX(line, lineWidths[i]!),
      firstBaseline + i * lineGap,
      nameTrack
    );
  });
  ctx.restore();

  const lastBaseline = firstBaseline + (lines.length - 1) * lineGap;

  if (!titleText) return;

  // Ünvan: ortaklarda kolon ortası; tekli isim bloğu altında — slayt dışına taşmasın
  const titleLeftMin = nameLayout.x;
  const titleRightMax = PRESENTATION_CANVAS.width - 40;
  const maxTitleW = Math.max(120, titleRightMax - titleLeftMin);
  let titleSize = tAdj.size;
  let titleTrack = tAdj.trackingRatio * titleSize;
  ctx.font = `${titleSize}px "${RANK_FONTS.title.family}"`;
  let titleWidth = trackedWidth(ctx, titleText, titleTrack);
  while (titleSize > 11 && titleWidth > maxTitleW) {
    titleSize -= 1;
    titleTrack = tAdj.trackingRatio * titleSize;
    ctx.font = `${titleSize}px "${RANK_FONTS.title.family}"`;
    titleWidth = trackedWidth(ctx, titleText, titleTrack);
  }
  const titleInk = ctx.measureText(titleText).actualBoundingBoxLeft || 0;
  const titleAnchorX = centerName ? boxCenterX : nameXLeft + nameWidth / 2;
  let titleX = titleAnchorX - titleWidth / 2 + titleInk + tAdj.dx;
  titleX = Math.max(
    titleLeftMin + titleInk,
    Math.min(titleX, titleRightMax - titleWidth + titleInk)
  );

  ctx.fillStyle = TITLE.color;
  fillTracked(ctx, titleText, titleX, lastBaseline + tAdj.offset, titleTrack);
}

function parseFxHex(color: string): { r: number; g: number; b: number } {
  const m = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function tintPresentationLogoWhite(logo: HTMLImageElement): HTMLCanvasElement {
  const w = logo.naturalWidth || 1;
  const h = logo.naturalHeight || 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  if (!cx) return c;
  cx.drawImage(logo, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = 'source-over';
  return c;
}

/**
 * Takım logosu — danışman isminin olduğu yerde (NAME bloğu).
 * Beyaz + siyah outer glow + drop shadow. İsim yazılmaz.
 */
function drawPresentationTeamLogoAtName(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  adjust: PhotoAdjust,
  glow: PresentationLogoFxAdjust,
  shadow: PresentationLogoFxAdjust,
  outputScale = 1
) {
  const tinted = tintPresentationLogoWhite(logo);
  const box = measureOpaqueBox(logo) || {
    x: 0,
    y: 0,
    w: tinted.width,
    h: tinted.height,
  };
  // İsim kutusu alanı — logolar isim satırından belirgin daha büyük
  const maxW = NAME.maxWidth * 1.25 * adjust.scale;
  const maxH = Math.max(120, NAME.size * 2.85) * adjust.scale;
  const fit = Math.min(maxW / Math.max(8, box.w), maxH / Math.max(8, box.h));
  const drawW = tinted.width * fit;
  const drawH = tinted.height * fit;
  // Sol hizalı isim gibi: NAME.x; dikey: baseline civarı (cap height ortası)
  const x = NAME.x - box.x * fit + adjust.dx;
  const y = NAME.baseline - box.h * fit * 0.78 - box.y * fit + adjust.dy;

  const s = Math.max(1, Math.min(3, outputScale));
  const { width: W, height: H } = PRESENTATION_CANVAS;
  const layer = document.createElement('canvas');
  layer.width = Math.round(W * s);
  layer.height = Math.round(H * s);
  const lctx = layer.getContext('2d');
  if (!lctx) return;
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = 'high';
  lctx.setTransform(s, 0, 0, s, 0, 0);
  lctx.drawImage(tinted, x, y, drawW, drawH);

  const blit = () => ctx.drawImage(layer, 0, 0, W, H);

  // Drop shadow (offset’li)
  if (shadow.blur > 0 && shadow.opacity > 0) {
    const rgb = parseFxHex(shadow.color);
    ctx.save();
    ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${shadow.opacity})`;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
    const passes = shadow.blur >= 60 ? 3 : 2;
    for (let i = 0; i < passes; i += 1) blit();
    ctx.restore();
  }

  // Outer glow (offset yok, silüet halkası)
  if (glow.blur > 0 && glow.opacity > 0) {
    const rgb = parseFxHex(glow.color);
    ctx.save();
    ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${glow.opacity})`;
    ctx.shadowBlur = glow.blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    const passes = glow.blur >= 100 ? 5 : glow.blur >= 60 ? 4 : glow.blur >= 30 ? 3 : 2;
    for (let i = 0; i < passes; i += 1) blit();
    if (glow.blur >= 50) {
      ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, glow.opacity * 0.55)})`;
      ctx.shadowBlur = glow.blur * 1.35;
      blit();
      blit();
    }
    ctx.restore();
  }

  // Keskin beyaz logo
  blit();
}

export type PresentationRenderInput = {
  templateUrl: string;
  displayName: string;
  title: string;
  /** Tekli (geriye dönük) */
  person?: RenderPerson;
  /** Ortaklar yan yana; yoksa [person] */
  people?: RenderPerson[];
  badges: PresentationBadge[];
  /** Tek PhotoAdjust veya RankAdjust { people } */
  adjust?: PhotoAdjust | RankAdjust;
  titleAdjust?: PresentationTitleAdjust;
  /** V2 takım — logo URL; isim yerine beyaz logo */
  logoUrl?: string | null;
  kind?: 'person' | 'team';
  logoGlow?: PresentationLogoFxAdjust;
  logoShadow?: PresentationLogoFxAdjust;
  /** v2 (varsayılan) | v3 yeni template/rozet/yerleşim */
  assetSet?: 'v2' | 'v3';
  /**
   * V3 takım: Ödülünüz var şeridi (şeffaf zemin, skipBackground).
   * Yoksa v2 gibi beyaz logo çizilir.
   */
  teamStripCanvas?: HTMLCanvasElement | null;
  /** Takım şeridi ek ölçek/kaydırma (sunum3 team adjust) */
  teamStripAdjust?: PhotoAdjust;
  /**
   * Çıktı çözünürlük çarpanı (1–3). Mantıksal yerleşim 1920×1080 kalır;
   * fiziksel canvas ×scale (indir: 2 → 3840×2160).
   */
  outputScale?: number;
};

export async function renderPresentation(
  input: PresentationRenderInput
): Promise<HTMLCanvasElement> {
  await loadRankFonts();
  const template = await loadRankImage(input.templateUrl);
  if (!template) throw new Error('Sunum template yüklenemedi');

  const { width: W, height: H } = PRESENTATION_CANVAS;
  const outputScale = Math.max(
    1,
    Math.min(3, Math.round(Number(input.outputScale) || 1))
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * outputScale);
  canvas.height = Math.round(H * outputScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  const assetSet = input.assetSet || 'v2';
  const footerTop =
    assetSet === 'v3' ? PRESENTATION_V3_FOOTER_TOP : PRESENTATION_GOLD_BAR_TOP;

  const people =
    input.people?.length
      ? input.people
      : input.person
        ? [input.person]
        : [];
  const adjust = normalizeRankAdjust(input.adjust, Math.max(1, people.length));

  ctx.drawImage(template, 0, 0, W, H);

  const photoLayout = assetSet === 'v3' ? PHOTO_V3 : PHOTO;
  const nameLayout = assetSet === 'v3' ? NAME_V3 : NAME;

  const isTeam = input.kind === 'team' || Boolean(input.logoUrl);
  if (!isTeam) {
    drawPresentationPhotos(ctx, people, adjust, photoLayout, outputScale);
  } else if (assetSet === 'v3' && input.teamStripCanvas) {
    drawPresentationTeamStrip(ctx, input.teamStripCanvas, input.teamStripAdjust);
  }

  // Alt şerit — fotoğrafın arkasından çıkmış gibi
  const barH = H - footerTop;
  ctx.drawImage(
    template,
    0,
    footerTop,
    W,
    barH,
    0,
    footerTop,
    W,
    barH
  );

  if (isTeam && !(assetSet === 'v3' && input.teamStripCanvas) && input.logoUrl) {
    const logo = await loadRankImage(input.logoUrl);
    if (logo) {
      drawPresentationTeamLogoAtName(
        ctx,
        logo,
        adjust.people[0] || DEFAULT_PHOTO_ADJUST,
        normalizePresentationLogoFx(
          input.logoGlow,
          DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW
        ),
        normalizePresentationLogoFx(
          input.logoShadow,
          DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW
        ),
        outputScale
      );
    }
  } else if (!isTeam) {
    drawPresentationText(
      ctx,
      input.displayName,
      input.title,
      normalizePresentationTitleAdjust(input.titleAdjust),
      nameLayout
    );
  }
  // V3 takım: logo + şerit (üye isimleri şeritte) — büyük takım adı yazılmaz

  const placements =
    assetSet === 'v3'
      ? layoutPresentationBadgesV3(input.badges)
      : layoutPresentationBadges(input.badges);
  await Promise.all(
    placements.map(async (slot) => {
      const img = await loadRankImage(slot.badge.url);
      if (!img) return;
      ctx.drawImage(img, slot.x, slot.y, slot.width, slot.height);
    })
  );

  return canvas;
}

/** V3: Ödülünüz var takım şeridini sol alana yerleştir — ayaklar açık mavi şeride yapışık */
function drawPresentationTeamStrip(
  ctx: CanvasRenderingContext2D,
  strip: HTMLCanvasElement,
  adjustRaw?: PhotoAdjust
) {
  const adj = normalizePresentationAdjust(adjustRaw);
  // Mantıksal şerit 1080×1350; sunumda sol banda sığdır
  const destW = 980 * adj.scale;
  const destH = (destW * strip.height) / Math.max(1, strip.width);
  const x = 40 + adj.dx;
  // Şerit içi slogan üstü (danışman ayak çizgisi) → sunum açık mavi footer
  const logicalScale = destW / RANK_CANVAS.width;
  const y =
    PRESENTATION_V3_FOOTER_TOP - SLOGAN_BAR_TOP * logicalScale + adj.dy;
  ctx.drawImage(strip, x, y, destW, destH);
}

/** İndirme formatı — JPEG (ZIP), PDF veya PPTX (çok sayfalı) */
export type PresentationExportFormat = 'jpeg' | 'pdf' | 'pptx';

/** 16:9 sunum sayfası (mm) — 1920×1080 */
const PRESENTATION_PAGE_MM = { width: 338.6667, height: 190.5 } as const;
/** PowerPoint 16:9 inç */
const PRESENTATION_PAGE_IN = { width: 13.33333, height: 7.5 } as const;
const PRESENTATION_JPEG_QUALITY = 0.95;

export function presentationExportFileName(
  downloadName: string,
  format: PresentationExportFormat
): string {
  const stem = downloadName.replace(/\.png$/i, '');
  if (format === 'pdf') return `${stem}.pdf`;
  if (format === 'pptx') return `${stem}.pptx`;
  return `${stem}.jpg`;
}

export function canvasToPresentationJpegBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG oluşturulamadı'))),
      'image/jpeg',
      PRESENTATION_JPEG_QUALITY
    );
  });
}

export async function presentationCanvasToPdfBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PRESENTATION_PAGE_MM.width, PRESENTATION_PAGE_MM.height],
    compress: true,
  });
  const dataUrl = canvas.toDataURL('image/jpeg', PRESENTATION_JPEG_QUALITY);
  pdf.addImage(
    dataUrl,
    'JPEG',
    0,
    0,
    PRESENTATION_PAGE_MM.width,
    PRESENTATION_PAGE_MM.height,
    undefined,
    'FAST'
  );
  return pdf.output('blob');
}

/** Sırayla canvas’lardan tek çok sayfalı PDF */
export async function presentationCanvasesToPdfBlob(
  canvases: HTMLCanvasElement[]
): Promise<Blob> {
  if (!canvases.length) throw new Error('PDF için slayt yok');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PRESENTATION_PAGE_MM.width, PRESENTATION_PAGE_MM.height],
    compress: true,
  });
  for (let i = 0; i < canvases.length; i += 1) {
    if (i > 0) {
      pdf.addPage(
        [PRESENTATION_PAGE_MM.width, PRESENTATION_PAGE_MM.height],
        'landscape'
      );
    }
    const dataUrl = canvases[i]!.toDataURL(
      'image/jpeg',
      PRESENTATION_JPEG_QUALITY
    );
    pdf.addImage(
      dataUrl,
      'JPEG',
      0,
      0,
      PRESENTATION_PAGE_MM.width,
      PRESENTATION_PAGE_MM.height,
      undefined,
      'FAST'
    );
  }
  return pdf.output('blob');
}

async function buildPresentationPptx(
  canvases: HTMLCanvasElement[]
): Promise<Blob> {
  if (!canvases.length) throw new Error('PPTX için slayt yok');
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: 'SUNUM_16x9',
    width: PRESENTATION_PAGE_IN.width,
    height: PRESENTATION_PAGE_IN.height,
  });
  pptx.layout = 'SUNUM_16x9';
  pptx.author = 'Zebra';
  pptx.title = 'Sıralama Sunum';

  for (const canvas of canvases) {
    const slide = pptx.addSlide();
    slide.background = { color: '000000' };
    slide.addImage({
      data: canvas.toDataURL('image/jpeg', PRESENTATION_JPEG_QUALITY),
      x: 0,
      y: 0,
      w: PRESENTATION_PAGE_IN.width,
      h: PRESENTATION_PAGE_IN.height,
    });
  }

  const out = await pptx.write({ outputType: 'blob' });
  return out as Blob;
}

export async function presentationCanvasToPptxBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return buildPresentationPptx([canvas]);
}

/** Sırayla canvas’lardan tek PowerPoint (16:9, full-bleed) */
export async function presentationCanvasesToPptxBlob(
  canvases: HTMLCanvasElement[]
): Promise<Blob> {
  return buildPresentationPptx(canvases);
}
