/**
 * Takım “Ödülünüz var” kompozisyonu:
 * aylık odul.png + logo + eşit kutu şerit + çizgi + isimler.
 * person|{slug} · team|{id} · team|person-glow · team|logo-glow
 */

import { toConsultantPhotoSlug, toTitleCaseName } from './formatName';
import {
  DEFAULT_PHOTO_ADJUST,
  RANK_CANVAS,
  RANK_PERIODS,
  RANK_PERIOD_DOT_COLOR,
  RANK_TEMPLATES,
  canvasToBlob,
  loadRankImage,
  measureOpaqueBox,
  type OpaqueBox,
  type PhotoAdjust,
  type RankFaceMetrics,
  type RankPeriodId,
  type RenderPerson,
} from './rankingVisuals';

export { canvasToBlob };

/** Yeşil slogan şeridi üst kenarı (odul.png / örnek) */
export const SLOGAN_BAR_TOP = 1252;

export const TEAM_AWARD_ANCHORS = {
  titleBottom: 505,
  stripTop: 700,
  logoMaxWidth: 460,
  logoMaxHeight: 168,
  sloganTop: SLOGAN_BAR_TOP,
  /** İsim ilk satır baseline (peopleOffsetY eklenir) */
  nameGivenY: 1195,
  nameMaxSize: 28,
  nameMinSize: 14,
  nameTracking: 0.04,
  /** Varsayılan isim–soyad satır aralığı (px) */
  defaultNameLineGap: 22,
} as const;

export const TEAM_FONTS = {
  name: {
    family: 'Zebra Team Name',
    url: '/fonts/vefat/bebas-neue-pro-regular.ttf',
    weight: '400',
  },
} as const;

export type TeamPersonAdjust = PhotoAdjust & {
  /** −30…+30, kalıcı person| kaydı */
  brightness: number;
};

export const DEFAULT_TEAM_PERSON_ADJUST: TeamPersonAdjust = {
  ...DEFAULT_PHOTO_ADJUST,
  brightness: 0,
};

export type TeamStripAdjust = {
  strokeColor: string;
  strokeWidth: number;
  /** Çizginin slogan üstünden yukarı uzama uzunluğu (px) */
  lineHeight: number;
  /** Üstten fade uzunluğu (px) */
  lineFade: number;
  logoScale: number;
  /** Opak içerik ortasına ek yatay kaydırma (px) */
  logoDx: number;
  logoDy: number;
  /** Logo rengi (default beyaz) */
  logoColor: string;
  /** Tüm danışman fotoğraflarını birlikte dikey kaydır */
  peopleOffsetY: number;
  /** İsim–soyad satır aralığı (px) */
  nameLineGap: number;
  /** Soyisim (son satır) ile yeşil slogan üstü arası mesafe (px) */
  nameBottomGap: number;
  /** Yeşil şeridin üstünden yukarı siyah gradient yüksekliği (px); isimler bunun üstünde */
  bottomGradientHeight: number;
  /** Gradient alt yoğunluğu 0–1 */
  bottomGradientOpacity: number;
};

/** Varsayılan: nameGivenY + defaultNameLineGap → slogan arası */
const DEFAULT_NAME_BOTTOM_GAP =
  SLOGAN_BAR_TOP -
  (TEAM_AWARD_ANCHORS.nameGivenY + TEAM_AWARD_ANCHORS.defaultNameLineGap);

export const DEFAULT_TEAM_STRIP_ADJUST: TeamStripAdjust = {
  strokeColor: '#c4a35a',
  strokeWidth: 2.5,
  lineHeight: 480,
  lineFade: 160,
  logoScale: 1,
  logoDx: 0,
  logoDy: 0,
  logoColor: '#ffffff',
  peopleOffsetY: 0,
  nameLineGap: TEAM_AWARD_ANCHORS.defaultNameLineGap,
  nameBottomGap: DEFAULT_NAME_BOTTOM_GAP,
  bottomGradientHeight: 180,
  bottomGradientOpacity: 0.82,
};

/** Outer glow — offset yok, silüet etrafında yumuşak halka */
export type OuterGlowAdjust = {
  blur: number;
  opacity: number;
  color: string;
};

export const DEFAULT_PERSON_GLOW: OuterGlowAdjust = {
  blur: 22,
  opacity: 0.45,
  color: '#000000',
};

/** PNG silüetinin iç kenarı — düşük kalite beyaz fringe’i yumuşatır */
export const DEFAULT_PERSON_INNER_GLOW: OuterGlowAdjust = {
  blur: 14,
  opacity: 0.62,
  color: '#000000',
};

export const DEFAULT_LOGO_GLOW: OuterGlowAdjust = {
  blur: 40,
  opacity: 0.7,
  color: '#000000',
};

/** Logo glow blur üst sınırı (UI + clamp) */
export const LOGO_GLOW_BLUR_MAX = 160;
export const PERSON_GLOW_BLUR_MAX = 100;
/** Beyaz kenar için daha geniş ayar aralığı */
export const PERSON_INNER_GLOW_BLUR_MAX = 80;

export const TEAM_PERSON_GLOW_KEY = 'team|person-glow';
export const TEAM_PERSON_INNER_GLOW_KEY = 'team|person-inner-glow';
export const TEAM_PERSON_EDGE_CLEAN_KEY = 'team|person-edge-clean';
export const TEAM_PERSON_PERIOD_TINT_KEY = 'team|person-period-tint';
export const TEAM_LOGO_GLOW_KEY = 'team|logo-glow';

/** PNG beyaz kenar (fringe) temizliği — global, tüm takım danışmanları */
export type PersonEdgeCleanAdjust = {
  /** Alpha choke (kaynak px) — silüeti içeri alır, beyaz halkayı keser */
  chokePx: number;
  /** Kalan kenarı siyaha doğru koyulaştırma 0–1 */
  fringeDarken: number;
};

export const DEFAULT_PERSON_EDGE_CLEAN: PersonEdgeCleanAdjust = {
  chokePx: 2.5,
  fringeDarken: 0.7,
};

export const PERSON_EDGE_CHOKE_MAX = 12;

/**
 * Ay şerit rengini danışman silüetine multiply ile yansıt.
 * Global (tüm aylar); renk her ayın RANK_PERIOD_DOT_COLOR değerinden gelir.
 * Default kapalı.
 */
export type PersonPeriodTintAdjust = {
  enabled: boolean;
  /** Multiply opacity 0–1 */
  opacity: number;
};

export const DEFAULT_PERSON_PERIOD_TINT: PersonPeriodTintAdjust = {
  enabled: false,
  opacity: 0.35,
};
/** Eski anahtarlar — okumada fallback */
export const TEAM_PERSON_SHADOW_KEY = 'team|person-shadow';
export const TEAM_LOGO_SHADOW_KEY = 'team|logo-shadow';
export const TEAM_GLOBAL_SHADOW_KEY = 'team|global-shadow';

/** @deprecated */
export type DropShadowAdjust = OuterGlowAdjust & { offsetX?: number; offsetY?: number };
export const DEFAULT_PERSON_SHADOW = DEFAULT_PERSON_GLOW;
export const DEFAULT_LOGO_SHADOW = DEFAULT_LOGO_GLOW;

export const TEAM_STRIP_BAND = {
  top: TEAM_AWARD_ANCHORS.stripTop,
  bottom: SLOGAN_BAR_TOP,
  eyeMidY: 900,
  baseEyeDistance: 72,
  /** Foto fade — isim alanının üstüne yumuşak geçiş */
  fadeStart: 1080,
  fadeEnd: 1185,
  fadeMax: 0.72,
  /** Slogan şeridine asla binme */
  clipBottom: SLOGAN_BAR_TOP,
} as const;

export type TeamDef = {
  id: string;
  labels: string[];
  displayName: string;
  leaders: string[];
  memberOrder: string[];
  logoUrl: string | null;
};

export const TEAM_DEFS: TeamDef[] = [
  {
    id: 'best-sellers',
    labels: ['Best Sellers', 'BEST SELLERS TEAM', 'The Best Of Sellers Team'],
    displayName: 'Best Sellers',
    leaders: ['kagan-kaymaz', 'hasan-vacip-tekerbas'],
    memberOrder: [
      'kagan-kaymaz',
      'hasan-vacip-tekerbas',
      'gokhan-zeren',
      'meltem-guler',
      'umut-dag',
    ],
    logoUrl: '/templates/siralama/teams/best-sellers.png',
  },
  {
    id: 'trust-line',
    labels: ['TRUST LINE TEAM', 'Trust Line Team'],
    displayName: 'Trust Line Team',
    leaders: ['aytac-oncu', 'mustafa-gunguler'],
    memberOrder: [
      'aytac-oncu',
      'mustafa-gunguler',
      'turgay-koca',
      'umit-okan-koroglu',
      'ebru-bicer',
    ],
    logoUrl: '/templates/siralama/teams/trust-line.png',
  },
  {
    id: 'red-blue',
    labels: ['RED BLUE TEAM', 'Red Blue Team'],
    displayName: 'Red Blue Team',
    leaders: ['cagri-yurekturk'],
    memberOrder: [
      'cagri-yurekturk',
      'burak-kucuk',
      'buse-kucuk',
      'sevim-ceper',
      'sunay-epoz',
    ],
    logoUrl: '/templates/siralama/teams/red-blue.png',
  },
  {
    id: 'expertiz',
    labels: ['EXPERTİZ TEAM', 'EXPERTIZ TEAM', 'Expertiz Team'],
    displayName: 'Expertiz Team',
    leaders: ['huseyin-altop'],
    memberOrder: [
      'huseyin-altop',
      'yavuz-demirulus',
      'cengiz-sengul',
      'mesut-kaya',
      'ahmet-musab-kilincarslan',
      'eda-kanlisu',
      'ceyda-birdal-demirulus',
      'mehtap-evkin',
      'derya-erisen',
    ],
    logoUrl: '/templates/siralama/teams/expertiz.png',
  },
  {
    id: 'first',
    labels: ['FIRST TEAM', 'First Team'],
    displayName: 'First Team',
    leaders: ['fahriye-turkoglu'],
    memberOrder: [
      'fahriye-turkoglu',
      'zeynep-esin-ates',
      'eda-alpdogan',
      'huseyin-pakyurek',
      'acelya-aycil',
      'kadriye-yildirim',
      'dilman-karhan',
      'seyda-kara',
      'serap-durgun',
    ],
    logoUrl: '/templates/siralama/teams/first.png',
  },
  {
    id: 'oz',
    labels: ['ÖZ TEAM', 'OZ TEAM', 'Big Win Team'],
    displayName: 'Öz Team',
    leaders: ['ozkan-aydin'],
    memberOrder: [
      'ozkan-aydin',
      'ecehan-kilic',
      'elif-ozdiken',
      'suat-erisen',
      'umur-konuk',
    ],
    logoUrl: '/templates/siralama/teams/oz.png',
  },
  {
    id: 'sirius',
    labels: ['SİRİUS TEAM', 'SIRIUS TEAM', 'Sirius', 'Sirius Team'],
    displayName: 'Sirius Team',
    leaders: ['ozgu-aktas'],
    memberOrder: [
      'ozgu-aktas',
      'ahmet-acar',
      'merve-guldogan',
      'anil-kosehanci',
      'ozge-caliskan',
    ],
    logoUrl: null,
  },
  {
    id: 'prime',
    labels: ['PRİME TEAM', 'PRIME TEAM', 'Prime Team'],
    displayName: 'Prime Team',
    leaders: ['arzu-erguven'],
    memberOrder: [
      'arzu-erguven',
      'cihan-yenice',
      'aynur-ozden',
      'ozge-mete',
      'sezgi-kabadayi',
      'burhan-demirkapi',
    ],
    logoUrl: '/templates/siralama/teams/prime.png',
  },
  {
    id: 'west',
    labels: ['WEST TEAM', 'West Team'],
    displayName: 'West Team',
    leaders: ['hulya-kurt'],
    memberOrder: [
      'hulya-kurt',
      'ezgi-sezer',
      'senol-pehlivan',
      'selma-celik-avcik',
      'aytac-demirci',
      'hilal-onal',
      'nermin-karacocuk',
      'hasan-korkmaz',
      'gaye-kucukyilmaz',
      'serhan-zih',
      'tulay-cicek',
    ],
    logoUrl: '/templates/siralama/teams/west.png',
  },
  {
    id: 'core',
    labels: ['CORE TEAM', 'Core Team'],
    displayName: 'Core Team',
    leaders: ['gonul-hanege'],
    memberOrder: [
      'gonul-hanege',
      'ihsan-subayogullari',
      'mine-atalay',
      'hazal-ulusoy',
    ],
    logoUrl: '/templates/siralama/teams/core.png',
  },
];

export function teamAdjustKey(teamId: string) {
  return `team|${teamId}`;
}

export function personAdjustKey(personKey: string) {
  return `person|${personKey}`;
}

export function awardPeriodsWithTemplate(): RankPeriodId[] {
  return RANK_PERIODS.map((p) => p.id).filter((id) => Boolean(RANK_TEMPLATES[id].award));
}

export function normalizeTeamPersonAdjust(raw: unknown): TeamPersonAdjust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TEAM_PERSON_ADJUST };
  const obj = raw as Partial<TeamPersonAdjust> & { people?: unknown[] };
  if (Array.isArray(obj.people)) return normalizeTeamPersonAdjust(obj.people[0]);
  const scale = Number(obj.scale);
  const dx = Number(obj.dx);
  const dy = Number(obj.dy);
  const brightness = Number(obj.brightness);
  return {
    scale: Number.isFinite(scale) ? Math.max(0.4, Math.min(2.2, scale)) : 1,
    dx: Number.isFinite(dx) ? Math.round(dx) : 0,
    dy: Number.isFinite(dy) ? Math.round(dy) : 0,
    flipH: Boolean(obj.flipH),
    brightness: Number.isFinite(brightness)
      ? Math.max(-30, Math.min(30, Math.round(brightness)))
      : 0,
  };
}

/** @deprecated alias */
export const normalizePhotoAdjust = normalizeTeamPersonAdjust;

export function normalizeTeamStripAdjust(raw: unknown): TeamStripAdjust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TEAM_STRIP_ADJUST };
  const obj = raw as Partial<TeamStripAdjust> & {
    lineTop?: number;
    lineBottom?: number;
    nameFamilyY?: number;
  };
  // Eski lineTop/lineBottom → lineHeight
  let lineHeight = Number(obj.lineHeight);
  if (!Number.isFinite(lineHeight) && Number.isFinite(Number(obj.lineTop))) {
    const top = Number(obj.lineTop);
    const bottom = Number.isFinite(Number(obj.lineBottom))
      ? Number(obj.lineBottom)
      : SLOGAN_BAR_TOP;
    lineHeight = Math.abs(bottom - top);
  }
  const strokeWidth = Number(obj.strokeWidth);
  const lineFade = Number(obj.lineFade);
  const logoScale = Number(obj.logoScale);
  const logoDx = Number(obj.logoDx);
  const logoDy = Number(obj.logoDy);
  const peopleOffsetY = Number(obj.peopleOffsetY);
  let nameLineGap = Number(obj.nameLineGap);
  if (!Number.isFinite(nameLineGap) && Number.isFinite(Number(obj.nameFamilyY))) {
    nameLineGap = Number(obj.nameFamilyY) - TEAM_AWARD_ANCHORS.nameGivenY;
  }
  let nameBottomGap = Number(obj.nameBottomGap);
  if (!Number.isFinite(nameBottomGap)) {
    /** Eski kayıt: isimler peopleOffsetY ile kayıyordu */
    const gap =
      Number.isFinite(nameLineGap) && Number.isFinite(peopleOffsetY)
        ? SLOGAN_BAR_TOP -
          (TEAM_AWARD_ANCHORS.nameGivenY + nameLineGap + peopleOffsetY)
        : DEFAULT_NAME_BOTTOM_GAP;
    nameBottomGap = gap;
  }
  return {
    strokeColor:
      typeof obj.strokeColor === 'string' && obj.strokeColor.trim()
        ? obj.strokeColor.trim()
        : DEFAULT_TEAM_STRIP_ADJUST.strokeColor,
    strokeWidth: Number.isFinite(strokeWidth)
      ? Math.max(0.5, Math.min(12, strokeWidth))
      : DEFAULT_TEAM_STRIP_ADJUST.strokeWidth,
    lineHeight: Number.isFinite(lineHeight)
      ? Math.max(80, Math.min(900, Math.round(lineHeight)))
      : DEFAULT_TEAM_STRIP_ADJUST.lineHeight,
    lineFade: Number.isFinite(lineFade)
      ? Math.max(0, Math.min(500, Math.round(lineFade)))
      : DEFAULT_TEAM_STRIP_ADJUST.lineFade,
    logoScale: Number.isFinite(logoScale)
      ? Math.max(0.4, Math.min(2.2, logoScale))
      : DEFAULT_TEAM_STRIP_ADJUST.logoScale,
    logoDx: Number.isFinite(logoDx) ? Math.max(-300, Math.min(300, Math.round(logoDx))) : 0,
    logoDy: Number.isFinite(logoDy) ? Math.round(logoDy) : 0,
    logoColor:
      typeof obj.logoColor === 'string' && /^#[0-9a-f]{6}$/i.test(obj.logoColor.trim())
        ? obj.logoColor.trim()
        : DEFAULT_TEAM_STRIP_ADJUST.logoColor,
    peopleOffsetY: Number.isFinite(peopleOffsetY)
      ? Math.max(-200, Math.min(220, Math.round(peopleOffsetY)))
      : 0,
    nameLineGap: Number.isFinite(nameLineGap)
      ? Math.max(10, Math.min(56, Math.round(nameLineGap)))
      : DEFAULT_TEAM_STRIP_ADJUST.nameLineGap,
    nameBottomGap: Math.max(4, Math.min(160, Math.round(nameBottomGap))),
    bottomGradientHeight: (() => {
      const h = Number(obj.bottomGradientHeight);
      return Number.isFinite(h)
        ? Math.max(0, Math.min(420, Math.round(h)))
        : DEFAULT_TEAM_STRIP_ADJUST.bottomGradientHeight;
    })(),
    bottomGradientOpacity: (() => {
      const o = Number(obj.bottomGradientOpacity);
      return Number.isFinite(o)
        ? Math.max(0, Math.min(1, o))
        : DEFAULT_TEAM_STRIP_ADJUST.bottomGradientOpacity;
    })(),
  };
}

export function normalizeOuterGlow(
  raw: unknown,
  fallback: OuterGlowAdjust,
  blurMax: number = LOGO_GLOW_BLUR_MAX
): OuterGlowAdjust {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const obj = raw as Partial<OuterGlowAdjust>;
  const blur = Number(obj.blur);
  const opacity = Number(obj.opacity);
  const maxBlur = Math.max(80, blurMax);
  return {
    blur: Number.isFinite(blur) ? Math.max(0, Math.min(maxBlur, blur)) : fallback.blur,
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : fallback.opacity,
    color:
      typeof obj.color === 'string' && /^#[0-9a-f]{6}$/i.test(obj.color.trim())
        ? obj.color.trim()
        : fallback.color,
  };
}

export function normalizePersonEdgeClean(raw: unknown): PersonEdgeCleanAdjust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PERSON_EDGE_CLEAN };
  const obj = raw as Partial<PersonEdgeCleanAdjust>;
  const chokePx = Number(obj.chokePx);
  const fringeDarken = Number(obj.fringeDarken);
  return {
    chokePx: Number.isFinite(chokePx)
      ? Math.max(0, Math.min(PERSON_EDGE_CHOKE_MAX, chokePx))
      : DEFAULT_PERSON_EDGE_CLEAN.chokePx,
    fringeDarken: Number.isFinite(fringeDarken)
      ? Math.max(0, Math.min(1, fringeDarken))
      : DEFAULT_PERSON_EDGE_CLEAN.fringeDarken,
  };
}

export function normalizePersonPeriodTint(raw: unknown): PersonPeriodTintAdjust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PERSON_PERIOD_TINT };
  const obj = raw as Partial<PersonPeriodTintAdjust>;
  const opacity = Number(obj.opacity);
  return {
    enabled: Boolean(obj.enabled),
    opacity: Number.isFinite(opacity)
      ? Math.max(0, Math.min(1, opacity))
      : DEFAULT_PERSON_PERIOD_TINT.opacity,
  };
}

/** Silüete multiply ay şerit rengi — sadece opak pikseller */
function applyPeriodTintToPeopleLayer(
  lctx: CanvasRenderingContext2D,
  peopleLayer: HTMLCanvasElement,
  periodId: RankPeriodId,
  tint: PersonPeriodTintAdjust
) {
  if (!tint.enabled || tint.opacity <= 0) return;
  const color = RANK_PERIOD_DOT_COLOR[periodId];
  if (!color) return;

  const W = peopleLayer.width;
  const H = peopleLayer.height;
  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = W;
  tintCanvas.height = H;
  const tctx = tintCanvas.getContext('2d');
  if (!tctx) return;

  tctx.fillStyle = color;
  tctx.fillRect(0, 0, W, H);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(peopleLayer, 0, 0);

  lctx.save();
  lctx.globalCompositeOperation = 'multiply';
  lctx.globalAlpha = tint.opacity;
  lctx.drawImage(tintCanvas, 0, 0);
  lctx.restore();
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
}

/** @deprecated */
export function normalizeDropShadow(
  raw: unknown,
  fallback: OuterGlowAdjust
): OuterGlowAdjust {
  return normalizeOuterGlow(raw, fallback);
}

export function normalizeTeamGlobalShadow(raw: unknown): OuterGlowAdjust {
  return normalizeOuterGlow(raw, DEFAULT_PERSON_GLOW);
}

export function matchTeamDef(takimEkip: string | null | undefined): TeamDef | null {
  if (!takimEkip) return null;
  const raw = takimEkip.normalize('NFC').trim();
  return (
    TEAM_DEFS.find((t) =>
      t.labels.some(
        (l) => l.normalize('NFC').toLocaleLowerCase('tr-TR') === raw.toLocaleLowerCase('tr-TR')
      )
    ) || null
  );
}

export type TeamMemberInput = {
  key: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
};

export function orderTeamMembers<T extends { key: string }>(
  members: T[],
  def: TeamDef
): T[] {
  if (!members.length) return [];
  const byKey = new Map(members.map((m) => [m.key, m]));
  const orderedKeys: string[] = [];
  for (const slug of def.memberOrder) {
    if (byKey.has(slug) && !orderedKeys.includes(slug)) orderedKeys.push(slug);
  }
  for (const m of members) {
    if (!orderedKeys.includes(m.key)) orderedKeys.push(m.key);
  }

  const n = orderedKeys.length;
  const slots: (string | null)[] = Array.from({ length: n }, () => null);
  const center = Math.floor((n - 1) / 2);

  const primary =
    def.leaders.map((l) => orderedKeys.find((k) => k === l)).find(Boolean) || orderedKeys[0]!;
  slots[center] = primary;

  const remaining = orderedKeys.filter((k) => k !== primary);
  remaining.sort((a, b) => {
    const ai = def.leaders.indexOf(a);
    const bi = def.leaders.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return orderedKeys.indexOf(a) - orderedKeys.indexOf(b);
  });

  let left = center - 1;
  let right = center + 1;
  let preferRight = true;
  for (const key of remaining) {
    if (preferRight && right < n) {
      slots[right] = key;
      right += 1;
      preferRight = false;
    } else if (left >= 0) {
      slots[left] = key;
      left -= 1;
      preferRight = true;
    } else if (right < n) {
      slots[right] = key;
      right += 1;
    }
  }

  return slots.filter(Boolean).map((k) => byKey.get(k!)!);
}

function splitDisplayName(displayName: string): { given: string; family: string } {
  const titled = toTitleCaseName(displayName);
  const parts = titled.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { given: titled, family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1]! };
}

function flipFace(face: RankFaceMetrics, imgW: number): RankFaceMetrics {
  return {
    ...face,
    eyeMidX: imgW - face.eyeMidX,
    noseX: face.noseX != null ? imgW - face.noseX : undefined,
  };
}

function flipBox(box: OpaqueBox, imgW: number): OpaqueBox {
  return { ...box, x: imgW - box.x - box.w };
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  drawX: number,
  drawY: number,
  scale: number,
  flipH: boolean,
  srcW: number,
  srcH: number
) {
  const w = srcW * scale;
  const h = srcH * scale;
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

const edgeCleanCache = new WeakMap<
  HTMLImageElement,
  { key: string; canvas: HTMLCanvasElement }
>();

/**
 * PNG beyaz fringe: alpha’yı chokePx kadar erit + kenarı koyulaştır.
 * Sonuç cache’lenir (aynı foto + ayar).
 */
function getEdgeCleanedPhoto(
  img: HTMLImageElement,
  edge: PersonEdgeCleanAdjust
): { source: CanvasImageSource; width: number; height: number } {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const choke = Math.max(0, edge.chokePx);
  const darken = Math.max(0, Math.min(1, edge.fringeDarken));
  if (choke <= 0 && darken <= 0) {
    return { source: img, width: w, height: h };
  }

  const key = `${choke.toFixed(2)}|${darken.toFixed(3)}`;
  const hit = edgeCleanCache.get(img);
  if (hit && hit.key === key) {
    return { source: hit.canvas, width: w, height: h };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  if (!cx) return { source: img, width: w, height: h };
  cx.drawImage(img, 0, 0);

  const radius = Math.max(0, Math.ceil(choke));
  let data: ImageData;
  try {
    data = cx.getImageData(0, 0, w, h);
  } catch {
    return { source: img, width: w, height: h };
  }
  const src = data.data;
  const out = cx.createImageData(w, h);
  const dst = out.data;
  const alphaAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return src[(y * w + x) * 4 + 3]!;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a0 = src[i + 3]!;
      if (a0 < 2) {
        dst[i] = 0;
        dst[i + 1] = 0;
        dst[i + 2] = 0;
        dst[i + 3] = 0;
        continue;
      }

      let minA = a0;
      if (radius > 0) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy > choke * choke) continue;
            const a = alphaAt(x + dx, y + dy);
            if (a < minA) minA = a;
          }
        }
      }

      // Erosion: komşu boşsa bu piksel de düşer / alpha düşer
      let a = radius > 0 ? Math.min(a0, minA) : a0;
      if (radius > 0 && minA < 40) a = 0;

      let r = src[i]!;
      let g = src[i + 1]!;
      let b = src[i + 2]!;

      if (darken > 0 && a > 0) {
        // Kenar mı? Dışarıda düşük alpha komşu var mı
        let edge = false;
        for (let dy = -2; dy <= 2 && !edge; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            if (alphaAt(x + dx, y + dy) < 80) {
              edge = true;
              break;
            }
          }
        }
        if (edge) {
          // Açık fringe’i bastır
          const lum = (r + g + b) / 3;
          const t = darken * (lum > 140 ? 1 : lum > 90 ? 0.75 : 0.45);
          r = Math.round(r * (1 - t));
          g = Math.round(g * (1 - t));
          b = Math.round(b * (1 - t));
        }
      }

      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = a;
    }
  }

  cx.putImageData(out, 0, 0);
  edgeCleanCache.set(img, { key, canvas });
  return { source: canvas, width: w, height: h };
}

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const m = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function applyOuterGlow(ctx: CanvasRenderingContext2D, glow: OuterGlowAdjust) {
  const rgb = parseHex(glow.color) || { r: 0, g: 0, b: 0 };
  ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${glow.opacity})`;
  ctx.shadowBlur = Math.max(0, glow.blur);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function clearGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Silüet outer glow: blur’a göre ekstra pass + üstte keskin katman */
function drawWithOuterGlow(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  glow: OuterGlowAdjust
) {
  if (glow.blur > 0 && glow.opacity > 0) {
    const passes =
      glow.blur >= 100 ? 5 : glow.blur >= 60 ? 4 : glow.blur >= 30 ? 3 : 2;
    applyOuterGlow(ctx, glow);
    for (let i = 0; i < passes; i += 1) {
      ctx.drawImage(source as CanvasImageSource, 0, 0);
    }
    // Geniş blur’da ikinci, daha yumuşak halka
    if (glow.blur >= 50) {
      const rgb = parseHex(glow.color) || { r: 0, g: 0, b: 0 };
      ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, glow.opacity * 0.55)})`;
      ctx.shadowBlur = glow.blur * 1.35;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.drawImage(source as CanvasImageSource, 0, 0);
      ctx.drawImage(source as CanvasImageSource, 0, 0);
    }
    clearGlow(ctx);
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0);
}

/**
 * Silüet iç kenarında siyah ışıma — PNG beyaz fringe’ini örtmek için
 * kenar bandı (blur yüksek → daha geniş örtü).
 */
function drawWithInnerGlow(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  glow: OuterGlowAdjust,
  W: number,
  H: number
) {
  if (glow.blur <= 0 || glow.opacity <= 0) return;
  const rgb = parseHex(glow.color) || { r: 0, g: 0, b: 0 };
  const blur = Math.max(0.5, glow.blur);

  const filled = document.createElement('canvas');
  filled.width = W;
  filled.height = H;
  const fctx = filled.getContext('2d');
  if (!fctx) return;
  fctx.drawImage(source as CanvasImageSource, 0, 0);
  fctx.globalCompositeOperation = 'source-in';
  fctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${glow.opacity})`;
  fctx.fillRect(0, 0, W, H);

  const soft = document.createElement('canvas');
  soft.width = W;
  soft.height = H;
  const sctx = soft.getContext('2d');
  if (!sctx) return;
  sctx.filter = `blur(${blur}px)`;
  sctx.drawImage(filled, 0, 0);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(source as CanvasImageSource, 0, 0);
  // Az oyar → daha kalın iç kenar (beyaz fringe bandını kaplar)
  sctx.globalCompositeOperation = 'destination-out';
  sctx.filter = `blur(${Math.max(0.5, blur * 0.22)}px)`;
  sctx.drawImage(source as CanvasImageSource, 0, 0);

  ctx.drawImage(soft, 0, 0);

  // İkinci, daha sert ince pass — dışa yakın beyaz pikselleri bastırır
  const hard = document.createElement('canvas');
  hard.width = W;
  hard.height = H;
  const hctx = hard.getContext('2d');
  if (!hctx) return;
  hctx.drawImage(source as CanvasImageSource, 0, 0);
  hctx.globalCompositeOperation = 'source-in';
  hctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, glow.opacity * 0.85)})`;
  hctx.fillRect(0, 0, W, H);
  hctx.globalCompositeOperation = 'destination-out';
  hctx.filter = `blur(${Math.max(0.5, blur * 0.12)}px)`;
  hctx.drawImage(source as CanvasImageSource, 0, 0);
  ctx.drawImage(hard, 0, 0);
}

function brightnessFilter(brightness: number): string {
  // −30…+30 → ~0.7…1.3
  const b = 1 + (brightness / 30) * 0.3;
  return `brightness(${b})`;
}

let fontsReady: Promise<void> | null = null;

async function ensureTeamFonts() {
  if (typeof document === 'undefined') return;
  if (!fontsReady) {
    fontsReady = (async () => {
      const { family, url, weight } = TEAM_FONTS.name;
      try {
        const face = new FontFace(family, `url(${url}) format("truetype")`, { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        /* font yoksa sistem fallback */
      }
    })();
  }
  await fontsReady;
}

function measureTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number
): number {
  if (!text) return 0;
  if (!tracking) return ctx.measureText(text).width;
  let w = 0;
  for (let i = 0; i < text.length; i += 1) {
    w += ctx.measureText(text[i]!).width;
    if (i < text.length - 1) w += tracking;
  }
  return w;
}

function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number
) {
  if (!tracking) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursor = x;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

function fitNameSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  maxWidth: number
): number {
  const anchors = TEAM_AWARD_ANCHORS;
  let size = anchors.nameMaxSize;
  while (size >= anchors.nameMinSize) {
    ctx.font = `400 ${size}px "${TEAM_FONTS.name.family}", "Bebas Neue", Impact, sans-serif`;
    const tracking = size * anchors.nameTracking;
    const widest = Math.max(0, ...lines.map((l) => measureTracked(ctx, l, tracking)));
    if (widest <= maxWidth) return size;
    size -= 1;
  }
  return anchors.nameMinSize;
}

function drawDividers(
  ctx: CanvasRenderingContext2D,
  count: number,
  slotW: number,
  adjust: TeamStripAdjust
) {
  if (count < 2) return;
  const bottom = SLOGAN_BAR_TOP;
  const top = Math.max(0, bottom - adjust.lineHeight);
  const fade = Math.min(adjust.lineFade, adjust.lineHeight);
  const rgb = parseHex(adjust.strokeColor) || { r: 196, g: 163, b: 90 };
  const core = adjust.strokeWidth;

  for (let i = 1; i < count; i += 1) {
    const x = i * slotW;
    const grad = ctx.createLinearGradient(x, top, x, bottom);
    // Yukarıdan fade-out → altta (şerit üstü) tam opak
    if (fade > 0) {
      const t = fade / Math.max(1, adjust.lineHeight);
      grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      grad.addColorStop(Math.min(1, t), `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
      grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    } else {
      grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
      grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    }

    ctx.strokeStyle = grad;
    ctx.lineWidth = core;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
}

function tintedLogo(
  logo: HTMLImageElement,
  color: string
): HTMLCanvasElement {
  const w = logo.naturalWidth || 1;
  const h = logo.naturalHeight || 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  if (!cx) return c;
  cx.drawImage(logo, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = color;
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = 'source-over';
  return c;
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  teamAdjust: TeamStripAdjust,
  glow: OuterGlowAdjust
) {
  const { width: W } = RANK_CANVAS;
  const anchors = TEAM_AWARD_ANCHORS;
  const midY = (anchors.titleBottom + anchors.stripTop) / 2;
  const tinted = tintedLogo(logo, teamAdjust.logoColor);

  const natW = tinted.width || logo.naturalWidth || 1;
  const natH = tinted.height || logo.naturalHeight || 1;
  /** PNG’deki şeffaf padding’i yok say — görsel içeriği ortala (Core Team vb.) */
  const box: OpaqueBox = measureOpaqueBox(logo) || { x: 0, y: 0, w: natW, h: natH };
  const maxW = anchors.logoMaxWidth * teamAdjust.logoScale;
  const maxH = anchors.logoMaxHeight * teamAdjust.logoScale;
  const fit = Math.min(maxW / Math.max(8, box.w), maxH / Math.max(8, box.h));
  const drawW = natW * fit;
  const drawH = natH * fit;
  const x = W / 2 - (box.x + box.w / 2) * fit + teamAdjust.logoDx;
  const y = midY - (box.y + box.h / 2) * fit + teamAdjust.logoDy;

  // Glow için ara canvas (şeffaf silüet)
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = RANK_CANVAS.height;
  const lctx = layer.getContext('2d');
  if (!lctx) {
    ctx.drawImage(tinted, x, y, drawW, drawH);
    return;
  }
  lctx.drawImage(tinted, x, y, drawW, drawH);
  drawWithOuterGlow(ctx, layer, glow);
}

export type TeamStripRenderJob = {
  periodId: RankPeriodId;
  people: RenderPerson[];
  personAdjusts: TeamPersonAdjust[];
  teamAdjust: TeamStripAdjust;
  personGlow: OuterGlowAdjust;
  personInnerGlow?: OuterGlowAdjust;
  personEdgeClean?: PersonEdgeCleanAdjust;
  personPeriodTint?: PersonPeriodTintAdjust;
  logoGlow: OuterGlowAdjust;
  /** @deprecated */
  personShadow?: OuterGlowAdjust;
  /** @deprecated */
  logoShadow?: OuterGlowAdjust;
  logoUrl: string | null;
  grayscale?: boolean;
};

export async function renderTeamStrip(job: TeamStripRenderJob): Promise<HTMLCanvasElement> {
  await ensureTeamFonts();

  const { width: W, height: H } = RANK_CANVAS;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const templateUrl = RANK_TEMPLATES[job.periodId]?.award || null;
  const template = await loadRankImage(templateUrl);
  if (template) ctx.drawImage(template, 0, 0, W, H);
  else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }

  const teamAdjust = normalizeTeamStripAdjust(job.teamAdjust);
  const personGlow = {
    ...normalizeOuterGlow(
      job.personGlow ?? job.personShadow,
      DEFAULT_PERSON_GLOW,
      PERSON_GLOW_BLUR_MAX
    ),
    color: '#000000',
  };
  const personInnerGlow = {
    ...normalizeOuterGlow(
      job.personInnerGlow,
      DEFAULT_PERSON_INNER_GLOW,
      PERSON_INNER_GLOW_BLUR_MAX
    ),
    color: '#000000',
  };
  const personEdgeClean = normalizePersonEdgeClean(job.personEdgeClean);
  const personPeriodTint = normalizePersonPeriodTint(job.personPeriodTint);
  const logoGlow = normalizeOuterGlow(
    job.logoGlow ?? job.logoShadow,
    DEFAULT_LOGO_GLOW,
    LOGO_GLOW_BLUR_MAX
  );
  const people = job.people;
  const n = people.length;
  const offsetY = teamAdjust.peopleOffsetY;

  const logo = await loadRankImage(job.logoUrl);
  if (logo) drawLogo(ctx, logo, teamAdjust, logoGlow);

  if (!n) {
    // Slogan şeridini her zaman en üstte tut
    if (template) {
      ctx.drawImage(
        template,
        0,
        SLOGAN_BAR_TOP,
        W,
        H - SLOGAN_BAR_TOP,
        0,
        SLOGAN_BAR_TOP,
        W,
        H - SLOGAN_BAR_TOP
      );
    }
    return canvas;
  }

  const slotW = W / n;
  const band = TEAM_STRIP_BAND;
  const refSlot = W / 5;
  const eyeTarget = band.baseEyeDistance * (slotW / refSlot);
  const eyeMidY = band.eyeMidY + offsetY;
  const photoTop = band.top + offsetY;
  const fadeStart = band.fadeStart + offsetY;
  const fadeEnd = Math.min(band.clipBottom - 8, band.fadeEnd + offsetY);

  // 1) Fotoğrafları glow’suz çiz (clip + fade)
  const peopleLayer = document.createElement('canvas');
  peopleLayer.width = W;
  peopleLayer.height = H;
  const lctx = peopleLayer.getContext('2d');
  if (!lctx) return canvas;

  for (let i = 0; i < n; i += 1) {
    const person = people[i]!;
    if (!person.photo || (!person.face && !person.bounds)) continue;
    const adj = normalizeTeamPersonAdjust(job.personAdjusts[i] || DEFAULT_TEAM_PERSON_ADJUST);
    const flipH = Boolean(adj.flipH);
    const img = person.photo;
    const imgW = img.naturalWidth;
    const cleaned = getEdgeCleanedPhoto(img, personEdgeClean);
    const face = person.face && flipH ? flipFace(person.face, imgW) : person.face;
    const bounds = person.bounds && flipH ? flipBox(person.bounds, imgW) : person.bounds;

    const slotLeft = i * slotW;
    const slotCenterX = slotLeft + slotW / 2;

    lctx.save();
    lctx.beginPath();
    lctx.rect(slotLeft, 0, slotW, band.clipBottom);
    lctx.clip();

    const filters: string[] = [];
    if (job.grayscale !== false) filters.push('grayscale(1)');
    if (adj.brightness) filters.push(brightnessFilter(adj.brightness));
    lctx.filter = filters.length ? filters.join(' ') : 'none';

    if (face && face.eyeDistance > 4) {
      const scale = (eyeTarget * adj.scale) / face.eyeDistance;
      const drawX = slotCenterX + adj.dx - face.eyeMidX * scale;
      const drawY = eyeMidY + adj.dy - face.eyeMidY * scale;
      drawPerson(
        lctx,
        cleaned.source,
        drawX,
        drawY,
        scale,
        flipH,
        cleaned.width,
        cleaned.height
      );
    } else if (bounds) {
      const targetW = slotW * 0.92 * adj.scale;
      const scale = targetW / Math.max(8, bounds.w);
      const drawX = slotCenterX + adj.dx - (bounds.x + bounds.w / 2) * scale;
      const drawY = photoTop + slotW * 0.12 + adj.dy - bounds.y * scale;
      drawPerson(
        lctx,
        cleaned.source,
        drawX,
        drawY,
        scale,
        flipH,
        cleaned.width,
        cleaned.height
      );
    }

    lctx.filter = 'none';
    lctx.restore();
  }

  // Ay şerit rengi · multiply (silüet maskeli)
  applyPeriodTintToPeopleLayer(lctx, peopleLayer, job.periodId, personPeriodTint);

  // Alt fade + slogan şeridine binmemek için sert kesim
  lctx.globalCompositeOperation = 'source-atop';
  const gradient = lctx.createLinearGradient(0, fadeStart, 0, fadeEnd);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${band.fadeMax})`);
  lctx.fillStyle = gradient;
  lctx.fillRect(0, fadeStart, W, Math.max(1, fadeEnd - fadeStart));
  lctx.fillStyle = `rgba(0,0,0,${band.fadeMax})`;
  lctx.fillRect(0, fadeEnd, W, Math.max(0, band.clipBottom - fadeEnd));
  lctx.globalCompositeOperation = 'destination-out';
  lctx.fillStyle = '#000';
  lctx.fillRect(0, band.clipBottom, W, H - band.clipBottom);
  lctx.globalCompositeOperation = 'source-over';

  // 2) Outer glow + keskin silüet + ince inner glow
  drawWithOuterGlow(ctx, peopleLayer, personGlow);
  drawWithInnerGlow(ctx, peopleLayer, personInnerGlow, W, H);

  // 3) Çizgiler — alt uç slogan üstünde, yukarı fade
  drawDividers(ctx, n, slotW, teamAdjust);

  // 4) Siyah alt gradient — yeşil şeridin hemen üstünden yukarı (takım ayarı)
  const gradH = Math.max(0, teamAdjust.bottomGradientHeight);
  const gradOp = Math.max(0, Math.min(1, teamAdjust.bottomGradientOpacity));
  if (gradH > 0 && gradOp > 0) {
    const gradTop = SLOGAN_BAR_TOP - gradH;
    const blackGrad = ctx.createLinearGradient(0, gradTop, 0, SLOGAN_BAR_TOP);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, `rgba(0,0,0,${gradOp})`);
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, gradTop, W, gradH);
  }

  // 5) İsimler — gradient’in üstünde
  const namePads = 10;
  const maxNameW = slotW - namePads * 2;
  const nameLines = people.map((p) => {
    const { given, family } = splitDisplayName(p.displayName);
    return [given.toLocaleUpperCase('tr-TR'), family.toLocaleUpperCase('tr-TR')].filter(
      Boolean
    );
  });
  const allLines = nameLines.flat();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const fontSize = fitNameSize(ctx, allLines, maxNameW);
  const tracking = fontSize * TEAM_AWARD_ANCHORS.nameTracking;
  ctx.font = `400 ${fontSize}px "${TEAM_FONTS.name.family}", "Bebas Neue", Impact, sans-serif`;
  ctx.fillStyle = '#ffffff';

  /** Son satır (soyisim) yeşil şeridin üstünden nameBottomGap kadar yukarıda */
  const familyY = Math.min(
    SLOGAN_BAR_TOP - Math.max(4, teamAdjust.nameBottomGap),
    SLOGAN_BAR_TOP - 4
  );
  const givenY = familyY - teamAdjust.nameLineGap;

  for (let i = 0; i < n; i += 1) {
    const lines = nameLines[i]!;
    const slotLeft = i * slotW;
    const centerX = slotLeft + slotW / 2;
    const ys = lines.length === 1 ? [familyY] : [givenY, familyY];
    lines.forEach((line, li) => {
      const w = measureTracked(ctx, line, tracking);
      fillTracked(ctx, line, centerX - w / 2, ys[li] ?? ys[0]!, tracking);
    });
  }

  // 6) Yeşil slogan şeridini en üste yeniden çiz — foto/çizgi/gradient asla binmez
  if (template) {
    ctx.drawImage(
      template,
      0,
      SLOGAN_BAR_TOP,
      W,
      H - SLOGAN_BAR_TOP,
      0,
      SLOGAN_BAR_TOP,
      W,
      H - SLOGAN_BAR_TOP
    );
  }

  return canvas;
}

export function teamFileSlug(displayName: string) {
  return toConsultantPhotoSlug(displayName) || 'takim';
}

/** Kayıtlı person| / team| / glow ayarlarından render girdileri */
export function teamSettingsFromSaved(
  def: TeamDef,
  members: { key: string }[],
  saved: Record<string, unknown>
) {
  return {
    personAdjusts: members.map((m) =>
      normalizeTeamPersonAdjust(saved[personAdjustKey(m.key)])
    ),
    teamAdjust: normalizeTeamStripAdjust(saved[teamAdjustKey(def.id)]),
    personGlow: {
      ...normalizeOuterGlow(
        saved[TEAM_PERSON_GLOW_KEY] ??
          saved[TEAM_PERSON_SHADOW_KEY] ??
          saved[TEAM_GLOBAL_SHADOW_KEY],
        DEFAULT_PERSON_GLOW,
        PERSON_GLOW_BLUR_MAX
      ),
      color: '#000000',
    },
    personInnerGlow: {
      ...normalizeOuterGlow(
        saved[TEAM_PERSON_INNER_GLOW_KEY],
        DEFAULT_PERSON_INNER_GLOW,
        PERSON_INNER_GLOW_BLUR_MAX
      ),
      color: '#000000',
    },
    personEdgeClean: normalizePersonEdgeClean(saved[TEAM_PERSON_EDGE_CLEAN_KEY]),
    personPeriodTint: normalizePersonPeriodTint(saved[TEAM_PERSON_PERIOD_TINT_KEY]),
    logoGlow: normalizeOuterGlow(
      saved[TEAM_LOGO_GLOW_KEY] ??
        saved[TEAM_LOGO_SHADOW_KEY] ??
        saved[TEAM_GLOBAL_SHADOW_KEY],
      DEFAULT_LOGO_GLOW,
      LOGO_GLOW_BLUR_MAX
    ),
  };
}
