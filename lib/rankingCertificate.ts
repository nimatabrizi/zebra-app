/**
 * Aylık sıralama sertifikası (basılı PDF) — yatay A4 @ 300 DPI.
 * Tipografi: ÖRNEK YAZILAR — isim Adelia (Ç/Ş virgül, ğ tire);
 * dönem/başlık/gövde Zalando Expanded, eşit harf aralığı; gövde ALL CAPS.
 */

import { toTitleCaseName, toTurkishUpper } from './formatName';
import {
  loadRankImage,
  RANK_PERIODS,
  turkishRankSuffix,
  type RankCategoryId,
  type RankPeriodId,
} from './rankingVisuals';

/** Adelia Türkçe işaretleri (karakterler/help.png + virgül / yumuşak-g PNG). */
const CERT_MARK_URLS = {
  cedilla: '/templates/siralama/sertifika/marks/cedilla-lg.png',
  breve: '/templates/siralama/sertifika/marks/breve-lg.png',
} as const;

/** Yatay A4 @ 300 DPI */
export const CERT_CANVAS = { width: 3508, height: 2480 } as const;
export const CERT_DPI = 300;
export const CERT_PAGE_MM = { width: 297, height: 210 } as const;

/** Sertifika verilen sıralar (1. sıra görsel/ödül; basılı sertifika 2–5). */
export const CERTIFICATE_RANKS = [2, 3, 4, 5] as const;

/** Takım template’i gelene kadar hariç. */
export const CERTIFICATE_CATEGORIES: RankCategoryId[] = ['ciro', 'islem', 'portfoy'];

export const CERTIFICATE_TEMPLATES: Partial<Record<RankPeriodId, string>> = {
  '2026-05': '/templates/siralama/sertifika/2026-05/template.png',
  '2026-06': '/templates/siralama/sertifika/2026-06/template.png',
  '2026-07': '/templates/siralama/sertifika/2026-07/template.png',
  '2026-08': '/templates/siralama/sertifika/2026-08/template.png',
  '2026-09': '/templates/siralama/sertifika/2026-09/template.png',
};

export const CERT_FONTS = {
  script: {
    family: 'Zebra Cert Script',
    url: '/fonts/hos-geldin/adelia.otf',
    format: 'opentype' as const,
  },
  display: {
    family: 'Zebra Cert Display',
    url: '/fonts/sertifika/zalando-expanded-black.ttf',
    format: 'truetype' as const,
  },
  body: {
    family: 'Zebra Cert Body',
    url: '/fonts/sertifika/zalando-expanded-bold.ttf',
    format: 'truetype' as const,
  },
} as const;

/**
 * ÖRNEK YAZILAR (3508×2480).
 * Üst 2 satır aynı punto (dönem / kategori+ofis).
 * Çizgi ↔ üst/alt metin eşit boşluk; gövde satır aralığı sıkı.
 */
const L = {
  centerX: 2242,
  name: {
    family: CERT_FONTS.script.family,
    baseline: 800,
    size: 210,
    stretchX: 1.08,
    maxWidth: 1780,
    color: '#111111',
  },
  title: {
    family: CERT_FONTS.display.family,
    size: 78,
    /** Harfler arası eşit ek boşluk (kerning yok). */
    tracking: 0.06,
    maxWidth: 1860,
    /** 1) dönem (altın)  2) kategori + ofis sırası (siyah) */
    baselines: [1081, 1205] as const,
    colors: ['#a16b23', '#090909'] as const,
  },
  /** Üst blok son baseline’dan sonra / gövde öncesi eşit pay */
  ruleGap: 58,
  rule: {
    width: 1823,
    thickness: 3,
    color: '#334664',
  },
  body: {
    family: CERT_FONTS.body.family,
    size: 46,
    tracking: 0.035,
    maxWidth: 1860,
    color: '#303030',
    /** İki satır arası (baseline farkı) */
    lineGap: 72,
  },
} as const;

const CATEGORY_CERT_UPPER: Record<RankCategoryId, string> = {
  ciro: 'CİRO',
  islem: 'İŞLEM',
  portfoy: 'PORTFÖY ALMA',
  takim: 'TAKIM VERİMLİLİĞİ',
};

const OFFICE_ORDINAL: Record<number, string> = {
  2: 'İKİNCİSİ',
  3: 'ÜÇÜNCÜSÜ',
  4: 'DÖRDÜNCÜSÜ',
  5: 'BEŞİNCİSİ',
};

const BODY_CLOSING = 'OLMANIZDAN DOLAYI TEBRİK EDER, BAŞARILARINIZIN DEVAMINI DİLERİM.';

type AdeliaMark = 'cedilla' | 'breve';

const ADELIA_SUB: Record<string, { base: string; mark: AdeliaMark }> = {
  Ç: { base: 'C', mark: 'cedilla' },
  ç: { base: 'c', mark: 'cedilla' },
  Ş: { base: 'S', mark: 'cedilla' },
  ş: { base: 's', mark: 'cedilla' },
  Ğ: { base: 'G', mark: 'breve' },
  ğ: { base: 'g', mark: 'breve' },
};

let certFontsPromise: Promise<void> | null = null;

export function loadCertFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (certFontsPromise) return certFontsPromise;
  certFontsPromise = (async () => {
    await Promise.all(
      Object.values(CERT_FONTS).map(async ({ family, url, format }) => {
        const face = new FontFace(family, `url(${url}) format("${format}")`);
        await face.load();
        document.fonts.add(face);
      })
    );
  })().catch((error) => {
    certFontsPromise = null;
    throw error;
  });
  return certFontsPromise;
}

export function certificateTemplateFor(periodId: RankPeriodId): string | null {
  return CERTIFICATE_TEMPLATES[periodId] ?? null;
}

export function isCertificateEligible(
  periodId: RankPeriodId,
  category: RankCategoryId,
  rank: number
): boolean {
  if (!certificateTemplateFor(periodId)) return false;
  if (!CERTIFICATE_CATEGORIES.includes(category)) return false;
  return (CERTIFICATE_RANKS as readonly number[]).includes(rank);
}

/** "2026 MAYIS AYI" */
export function certificatePeriodPhrase(periodId: RankPeriodId): string {
  const period = RANK_PERIODS.find((p) => p.id === periodId);
  const month = toTurkishUpper(period?.label || '');
  return `2026 ${month} AYI`;
}

export function certificateCategoryPhrase(category: RankCategoryId): string {
  return CATEGORY_CERT_UPPER[category];
}

export function certificateHeadlineCategory(category: RankCategoryId): string {
  return `${CATEGORY_CERT_UPPER[category]} SIRALAMASI`;
}

export function certificateHeadlineRank(rank: number): string {
  const ordinal = OFFICE_ORDINAL[rank];
  return ordinal ? `OFİS ${ordinal}` : '';
}

export function certificateBodyLine1(
  periodId: RankPeriodId,
  category: RankCategoryId,
  rank: number
): string {
  const period = certificatePeriodPhrase(periodId);
  const cat = CATEGORY_CERT_UPPER[category];
  const suffix = toTurkishUpper(turkishRankSuffix(rank));
  return `${period} ${cat} SIRALAMASINDA OFİS ${rank}'${suffix}`;
}

export type CertificateJob = {
  periodId: RankPeriodId;
  category: RankCategoryId;
  rank: number;
  displayName: string;
  templateUrl?: string | null;
};

/** Kerning’siz: Σ glyphWidth + (n-1)*gap */
function evenWidth(ctx: CanvasRenderingContext2D, text: string, gap: number): number {
  const chars = Array.from(text);
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += ctx.measureText(ch).width;
  return w + Math.max(0, chars.length - 1) * gap;
}

function fillEvenCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baseline: number,
  gap: number
) {
  const chars = Array.from(text);
  const total = evenWidth(ctx, text, gap);
  let x = centerX - total / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x, baseline);
    x += ctx.measureText(ch).width + gap;
  }
}

function fitEvenSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  baseSize: number,
  trackingRatio: number,
  maxWidth: number
): number {
  let size = baseSize;
  while (size > 22) {
    ctx.font = `${size}px "${family}"`;
    if (evenWidth(ctx, text, size * trackingRatio) <= maxWidth) return size;
    size -= 1;
  }
  return size;
}

function fitSharedEvenSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  family: string,
  baseSize: number,
  trackingRatio: number,
  maxWidth: number
): number {
  let size = baseSize;
  for (const line of lines) {
    size = Math.min(size, fitEvenSize(ctx, line, family, size, trackingRatio, maxWidth));
  }
  return size;
}

function prepareAdeliaGlyphs(name: string): {
  chars: string[];
  marks: (AdeliaMark | null)[];
} {
  // Combining sedil (U+0327) / breve (U+0306) birleşik halleri de yakala
  const raw = Array.from(name.normalize('NFC'));
  const chars: string[] = [];
  const marks: (AdeliaMark | null)[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    const next = raw[i + 1];
    if (next === '\u0327') {
      // S/C + combining cedilla
      const base = ch === 'S' || ch === 's' || ch === 'C' || ch === 'c' ? ch : ch;
      chars.push(base);
      marks.push('cedilla');
      i += 1;
      continue;
    }
    if (next === '\u0306') {
      chars.push(ch === 'G' || ch === 'g' ? ch : ch);
      marks.push('breve');
      i += 1;
      continue;
    }
    const sub = ADELIA_SUB[ch];
    if (sub) {
      chars.push(sub.base);
      marks.push(sub.mark);
    } else {
      chars.push(ch);
      marks.push(null);
    }
  }
  return { chars, marks };
}

function drawScriptName(
  ctx: CanvasRenderingContext2D,
  name: string,
  marksImg: { cedilla: HTMLImageElement | null; breve: HTMLImageElement | null }
) {
  const n = L.name;
  const { chars, marks } = prepareAdeliaGlyphs(name);

  if (marks.some((m) => m === 'cedilla') && !marksImg.cedilla) {
    console.warn('[sertifika] cedilla PNG yüklenemedi — Ş/Ç virgülü çizilemedi');
  }
  if (marks.some((m) => m === 'breve') && !marksImg.breve) {
    console.warn('[sertifika] breve PNG yüklenemedi — ğ işareti çizilemedi');
  }

  let size: number = n.size;
  ctx.font = `${size}px "${n.family}"`;
  let width = 0;
  for (const ch of chars) width += ctx.measureText(ch).width;
  width *= n.stretchX;
  if (width > n.maxWidth) {
    size *= n.maxWidth / width;
    ctx.font = `${size}px "${n.family}"`;
    width = 0;
    for (const ch of chars) width += ctx.measureText(ch).width;
    width *= n.stretchX;
  }

  ctx.fillStyle = n.color;
  ctx.save();
  ctx.translate(L.centerX - width / 2, n.baseline);
  ctx.scale(n.stretchX, 1);
  ctx.font = `${size}px "${n.family}"`;

  /**
   * help.png (Desktop/karakterler) kalibrasyonu:
   * - Virgül: actualBoundingBoxDescent + gap (flourish altının altında).
   * - Büyük S/C optik ~0.24; küçük s/c ~0.18.
   * - ğ tire: baseline − 0.58em (kase üstü), optik ~0.41.
   */
  let x = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const mark = marks[i];
    const metrics = ctx.measureText(ch);
    const cw = metrics.width;
    ctx.fillText(ch, x, 0);

    if (mark === 'cedilla' && marksImg.cedilla) {
      const img = marksImg.cedilla;
      const isUpper = ch === 'S' || ch === 'C';
      const optical = isUpper ? 0.24 : 0.18;
      const targetH = size * (isUpper ? 0.19 : 0.175);
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      const mw = targetH * aspect;
      const cx = x + cw * optical;
      // Adelia 'c' descent negatif olabiliyor — en az x-height altı boşluk
      const rawDescent = metrics.actualBoundingBoxDescent ?? 0;
      const descent = Math.max(rawDescent, size * (isUpper ? 0.2 : 0.06));
      const top = descent + size * 0.032;
      ctx.drawImage(img, cx - mw / 2, top, mw, targetH);
    } else if (mark === 'breve' && marksImg.breve) {
      const img = marksImg.breve;
      const optical = 0.41;
      const targetH = size * 0.095;
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      const mw = targetH * aspect;
      const cx = x + cw * optical;
      const top = size * -0.58;
      ctx.drawImage(img, cx - mw / 2, top, mw, targetH);
    }

    x += cw;
  }
  ctx.restore();
}

export async function renderCertificate(job: CertificateJob): Promise<HTMLCanvasElement> {
  await loadCertFonts();
  const templateUrl = job.templateUrl ?? certificateTemplateFor(job.periodId);
  if (!templateUrl) throw new Error('Sertifika template yok');
  const [template, cedilla, breve] = await Promise.all([
    loadRankImage(templateUrl),
    loadRankImage(CERT_MARK_URLS.cedilla),
    loadRankImage(CERT_MARK_URLS.breve),
  ]);
  if (!template) throw new Error('Sertifika template yüklenemedi');

  const canvas = document.createElement('canvas');
  canvas.width = CERT_CANVAS.width;
  canvas.height = CERT_CANVAS.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');

  ctx.drawImage(template, 0, 0, CERT_CANVAS.width, CERT_CANVAS.height);

  const name = toTitleCaseName(job.displayName.trim());
  const period = certificatePeriodPhrase(job.periodId);
  const headCat = certificateHeadlineCategory(job.category);
  const headRank = certificateHeadlineRank(job.rank);
  const body1 = certificateBodyLine1(job.periodId, job.category, job.rank);
  if (!headRank) throw new Error('Sertifika yalnızca 2.–5. sıra için');

  drawScriptName(ctx, name, { cedilla, breve });

  const titleLines = [period, `${headCat} ${headRank}`];
  let titleSize: number = L.title.size;
  {
    const t = L.title;
    titleSize = fitSharedEvenSize(ctx, titleLines, t.family, t.size, t.tracking, t.maxWidth);
    const gap = titleSize * t.tracking;
    ctx.font = `${titleSize}px "${t.family}"`;
    for (let i = 0; i < titleLines.length; i += 1) {
      ctx.fillStyle = t.colors[i]!;
      fillEvenCentered(ctx, titleLines[i]!, L.centerX, t.baselines[i]!, gap);
    }
  }

  // Tek çizgi: üst başlık mürekkebi ile gövde üstü arasında eşit boşluk
  {
    const b = L.body;
    const lines = [body1, BODY_CLOSING];
    const bodySize = fitSharedEvenSize(ctx, lines, b.family, b.size, b.tracking, b.maxWidth);
    const trackingGap = bodySize * b.tracking;

    const titleInkBottom = L.title.baselines[L.title.baselines.length - 1]! + titleSize * 0.18;
    const bodyAscent = bodySize * 0.85;
    const ruleTop = titleInkBottom + L.ruleGap;
    const body1Baseline = ruleTop + L.rule.thickness + L.ruleGap + bodyAscent;
    const body2Baseline = body1Baseline + b.lineGap;

    const r = L.rule;
    ctx.fillStyle = r.color;
    ctx.fillRect(L.centerX - r.width / 2, ruleTop, r.width, r.thickness);

    ctx.fillStyle = b.color;
    ctx.font = `${bodySize}px "${b.family}"`;
    fillEvenCentered(ctx, body1, L.centerX, body1Baseline, trackingGap);
    fillEvenCentered(ctx, BODY_CLOSING, L.centerX, body2Baseline, trackingGap);
  }

  return canvas;
}

export async function certificateToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [CERT_PAGE_MM.width, CERT_PAGE_MM.height],
    compress: true,
  });
  pdf.addImage(
    canvas,
    'PNG',
    0,
    0,
    CERT_PAGE_MM.width,
    CERT_PAGE_MM.height,
    undefined,
    'NONE'
  );
  return pdf.output('blob');
}
