/**
 * Çeyrek bazlı sıralama sertifikası (basılı PDF) — yatay A4 @ 300 DPI.
 * Danışman × çeyrek → tek PDF; başarılar çok satır.
 * Tipografi: isim Adelia (Ç/Ş virgül, ğ tire); başlık/başarılar Oswald Bold
 * (portföy ilan başlığı). Teşekkür + imza şablonda gömülü.
 * Başlık+gövde bloğu isim ↔ teşekkür arasında dikey ortalanır.
 */

import { toTitleCaseName, toTurkishUpper } from './formatName';
import { loadRankImage, measureOpaqueBox, type RankPeriodId } from './rankingVisuals';

/** Adelia Türkçe işaretleri (karakterler/help.png + virgül / yumuşak-g PNG). */
const CERT_MARK_URLS = {
  cedilla: '/templates/siralama/sertifika/marks/cedilla-lg.png',
  breve: '/templates/siralama/sertifika/marks/breve-lg.png',
} as const;

/** Yatay A4 @ 300 DPI */
export const CERT_CANVAS = { width: 3508, height: 2480 } as const;
export const CERT_DPI = 300;
export const CERT_PAGE_MM = { width: 297, height: 210 } as const;

export const CERTIFICATE_REPORT_URL = '/templates/siralama/Sertifika_Raporu_2026.json';

export const CERTIFICATE_TEMPLATES: Partial<Record<RankPeriodId, string>> = {
  '2026-q2': '/templates/siralama/sertifika/2026-q2/template.jpg',
  '2026-q3': '/templates/siralama/sertifika/2026-q3/template.jpg',
};

export const CERT_FONTS = {
  script: {
    family: 'Zebra Cert Script',
    url: '/fonts/hos-geldin/adelia.otf',
    format: 'opentype' as const,
  },
  /** Portföy ilan başlığı ile aynı aile (Oswald 700). */
  headline: {
    family: 'Zebra Cert Oswald',
    url: '/fonts/sertifika/Oswald-Bold.ttf',
    format: 'truetype' as const,
    weight: '700',
  },
} as const;

/**
 * Gerçek örnek (II. Çeyrek · Gönül) — 3508×2480 kalibrasyonu.
 * Sol mühür nedeniyle metin bloğu sağa kayık (centerX ≈ 2170).
 */
const L = {
  centerX: 2170,
  name: {
    family: CERT_FONTS.script.family,
    baseline: 790,
    size: 210,
    stretchX: 1.08,
    maxWidth: 1780,
    color: '#111111',
    /** Script mürekkebinin optik altı (ortalamada üst sınır) */
    bottom: 920,
  },
  /** Teşekkür satırı şablonda; bloğun altına çarpmasın */
  thanksTop: 1600,
  /** "2026 II. ÇEYREK…" — teşekkür satırı boyutunda, gövdeden küçük */
  title: {
    family: CERT_FONTS.headline.family,
    size: 58,
    tracking: -0.02,
    maxWidth: 2100,
    color: '#a16b23',
    /** Bloğu (başlık+gövde) bu kadar px yukarı al */
    liftPx: 20,
  },
  /** Başarı listesi — Oswald Bold (portföy ilan başlığı), sıkı satır */
  body: {
    family: CERT_FONTS.headline.family,
    size: 94,
    tracking: -0.03,
    maxWidth: 2080,
    color: '#0a0a0a',
    lineGap: 120,
    /** Altın başlık ↔ siyah başarı satırları */
    gapAfterTitle: 46,
  },
} as const;

const ORDINAL_WORD: Record<number, string> = {
  1: 'BİRİNCİSİ',
  2: 'İKİNCİSİ',
  3: 'ÜÇÜNCÜSÜ',
  4: 'DÖRDÜNCÜSÜ',
  5: 'BEŞİNCİSİ',
};

const QUARTER_HEADLINE: Partial<Record<RankPeriodId, string>> = {
  '2026-q2': '2026 II. ÇEYREK OFİS SIRALAMASINDA',
  '2026-q3': '2026 III. ÇEYREK OFİS SIRALAMASINDA',
};

type AdeliaMark = 'cedilla' | 'breve' | 'dotless' | 'tittle';

const ADELIA_SUB: Record<string, { base: string; mark: AdeliaMark }> = {
  Ç: { base: 'C', mark: 'cedilla' },
  ç: { base: 'c', mark: 'cedilla' },
  Ş: { base: 'S', mark: 'cedilla' },
  ş: { base: 's', mark: 'cedilla' },
  Ğ: { base: 'G', mark: 'breve' },
  ğ: { base: 'g', mark: 'breve' },
  /** Adelia ı’yı noktalı çiziyor — gövdeyi clip ile noktasız ver. */
  ı: { base: 'i', mark: 'dotless' },
  /** Adelia İ yok — büyük I + üst nokta (İhsan vb.). */
  İ: { base: 'I', mark: 'tittle' },
};

export type CertificateReportEntry = {
  quarter: string;
  periodId: RankPeriodId;
  displayName: string;
  achievements: string[];
  count: number;
  /** Takım sertifikası — isim yerine siyah logo */
  kind?: 'person' | 'team';
  teamId?: string;
  logoUrl?: string | null;
};

export type CertificateReport = {
  year: number;
  certificates: CertificateReportEntry[];
};

export type CertificateJob = {
  periodId: RankPeriodId;
  displayName: string;
  /** Kısa başarı satırları (Excel): "Mayıs Ciro 5.si" / "2026 Mayıs Takım Verimliliği 3.sü" */
  achievements: string[];
  templateUrl?: string | null;
  logoUrl?: string | null;
};

/**
 * Takım sertifikaları (danışman listesine ek).
 * Logo: public/templates/siralama/teams/*.png → siyah çizilir.
 */
export const TEAM_CERTIFICATES: CertificateReportEntry[] = [
  {
    quarter: 'II. Çeyrek',
    periodId: '2026-q2',
    displayName: 'CORE TEAM',
    kind: 'team',
    teamId: 'core',
    logoUrl: '/templates/siralama/teams/core.png',
    achievements: ['2026 Mayıs Takım Verimliliği 3.sü'],
    count: 1,
  },
  {
    quarter: 'II. Çeyrek',
    periodId: '2026-q2',
    displayName: 'TRUST LINE TEAM',
    kind: 'team',
    teamId: 'trust-line',
    logoUrl: '/templates/siralama/teams/trust-line.png',
    achievements: ['2026 Haziran Takım Verimliliği 5.si'],
    count: 1,
  },
  {
    quarter: 'III. Çeyrek',
    periodId: '2026-q3',
    displayName: 'RED BLUE TEAM',
    kind: 'team',
    teamId: 'red-blue',
    logoUrl: '/templates/siralama/teams/red-blue.png',
    achievements: ['2026 Temmuz Takım Verimliliği 5.si'],
    count: 1,
  },
  {
    quarter: 'III. Çeyrek',
    periodId: '2026-q3',
    displayName: 'TRUST LINE TEAM',
    kind: 'team',
    teamId: 'trust-line',
    logoUrl: '/templates/siralama/teams/trust-line.png',
    achievements: ['2026 Ağustos Takım Verimliliği 4.sü'],
    count: 1,
  },
  {
    quarter: 'III. Çeyrek',
    periodId: '2026-q3',
    displayName: 'BEST SELLERS TEAM',
    kind: 'team',
    teamId: 'best-sellers',
    logoUrl: '/templates/siralama/teams/best-sellers.png',
    achievements: ['2026 Ağustos Takım Verimliliği 5.si'],
    count: 1,
  },
];

/**
 * Takım logosu — işaretlenen kutu (~1480×opaque) + CB logo ↔ altın yazı eşit mesafe.
 * Opak kutu (measureOpaqueBox) ile ölçeklenir.
 */
const LOGO = {
  maxWidth: 1480,
  maxHeight: 320,
  /** Şablondaki Coldwell Banker logosunun altı */
  topAnchor: 430,
  /** Üst/alt boşluk için asgari pay */
  minGap: 36,
} as const;

let certFontsPromise: Promise<void> | null = null;
let reportPromise: Promise<CertificateReport> | null = null;

export function loadCertFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (certFontsPromise) return certFontsPromise;
  certFontsPromise = (async () => {
    await Promise.all(
      Object.values(CERT_FONTS).map(async (font) => {
        const weight = 'weight' in font ? font.weight : '400';
        const face = new FontFace(font.family, `url(${font.url}) format("${font.format}")`, {
          weight,
        });
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

export async function loadCertificateReport(): Promise<CertificateReport> {
  if (reportPromise) return reportPromise;
  reportPromise = (async () => {
    const res = await fetch(CERTIFICATE_REPORT_URL);
    if (!res.ok) throw new Error('Sertifika raporu yüklenemedi');
    const data = (await res.json()) as CertificateReport;
    if (!Array.isArray(data.certificates)) throw new Error('Sertifika raporu geçersiz');
    const people = data.certificates.map((c) => ({ ...c, kind: c.kind ?? ('person' as const) }));
    return {
      ...data,
      certificates: [...people, ...TEAM_CERTIFICATES],
    };
  })().catch((error) => {
    reportPromise = null;
    throw error;
  });
  return reportPromise;
}

export function certificateTemplateFor(periodId: RankPeriodId): string | null {
  return CERTIFICATE_TEMPLATES[periodId] ?? null;
}

export function isCertificatePeriod(periodId: RankPeriodId): boolean {
  return Boolean(CERTIFICATE_TEMPLATES[periodId]);
}

export function certificateHeadline(periodId: RankPeriodId): string {
  return QUARTER_HEADLINE[periodId] ?? '';
}

type ParsedAchievement = {
  raw: string;
  period: string;
  category: string;
  rank: number;
  isQuarter: boolean;
  year: string | null;
};

const MONTH_SORT: Record<string, number> = {
  mayis: 1,
  mayıs: 1,
  haziran: 2,
  temmuz: 3,
  agustos: 4,
  ağustos: 4,
  eylul: 5,
  eylül: 5,
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function categorySortKey(category: string): number {
  const key = normalizeKey(category);
  if (key.includes('islem')) return 0;
  if (key.includes('portfoy')) return 1;
  if (key.includes('ciro')) return 2;
  if (key.includes('takim')) return 3;
  return 50;
}

function monthSortKey(period: string): number {
  const key = normalizeKey(period);
  for (const [name, order] of Object.entries(MONTH_SORT)) {
    if (key.includes(normalizeKey(name))) return order;
  }
  return 50;
}

export function parseAchievementShort(short: string): ParsedAchievement | null {
  const raw = short.trim().replace(/\s+/g, ' ');
  const m = raw.match(
    /^(?:(\d{4})\s+)?(.+?)\s+(Ciro|İşlem|Portföy Alma|Takım Verimliliği)\s+(\d+)/i
  );
  if (!m) return null;
  const year = m[1] || null;
  const period = m[2]!.trim();
  return {
    raw,
    period,
    category: m[3]!,
    rank: Number(m[4]),
    isQuarter: /çeyrek/i.test(period),
    year,
  };
}

/**
 * Yazım sırası (Gönül gerçek örnek düzeltmesi):
 * 1) Aylık başarılar — kategori: İşlem → Portföy → Ciro; ay kronolojik
 * 2) Çeyrek başarıları sonda (aynı kategori sırası)
 */
export function sortAchievements(shorts: string[]): string[] {
  const indexed = shorts.map((raw, index) => ({
    raw,
    index,
    parsed: parseAchievementShort(raw),
  }));
  indexed.sort((a, b) => {
    const pa = a.parsed;
    const pb = b.parsed;
    if (!pa && !pb) return a.index - b.index;
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.isQuarter !== pb.isQuarter) return pa.isQuarter ? 1 : -1;
    const cat = categorySortKey(pa.category) - categorySortKey(pb.category);
    if (cat) return cat;
    if (!pa.isQuarter && !pb.isQuarter) {
      const month = monthSortKey(pa.period) - monthSortKey(pb.period);
      if (month) return month;
    }
    if (pa.rank !== pb.rank) return pa.rank - pb.rank;
    return a.index - b.index;
  });
  return indexed.map((x) => x.raw);
}

/** "Mayıs Ciro 5.si" → "MAYIS AYI CİRO BEŞİNCİSİ"
 *  "2026 Mayıs Takım Verimliliği 3.sü" → "2026 MAYIS AYI TAKIM VERİMLİLİĞİ ÜÇÜNCÜSÜ"
 */
export function expandAchievementPhrase(short: string): string {
  const parsed = parseAchievementShort(short);
  if (!parsed) return toTurkishUpper(short.trim().replace(/\s+/g, ' '));
  const category = toTurkishUpper(parsed.category);
  const ordinal = ORDINAL_WORD[parsed.rank] || `${parsed.rank}.`;
  const periodU = toTurkishUpper(parsed.period);
  const head = parsed.isQuarter ? periodU : `${periodU} AYI`;
  const yearPrefix = parsed.year ? `${parsed.year} ` : '';
  return `${yearPrefix}${head} ${category} ${ordinal}`;
}

export function joinAchievementPhrases(phrases: string[]): string {
  if (!phrases.length) return '';
  if (phrases.length === 1) return phrases[0]!;
  if (phrases.length === 2) return `${phrases[0]} VE ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')} VE ${phrases[phrases.length - 1]}`;
}

/**
 * Satır kırılım birimleri: her başarı tek parça.
 * Örn. 2 başarı → ["MAYIS … İKİNCİSİ", "VE II. ÇEYREK … ÜÇÜNCÜSÜ"]
 * Ortadan PORTFÖY/ALMA bölünmez.
 */
export function achievementWrapUnits(shorts: string[]): string[] {
  const phrases = sortAchievements(shorts).map(expandAchievementPhrase);
  if (!phrases.length) return [];
  if (phrases.length === 1) return [phrases[0]!];
  return [...phrases.slice(0, -1), `VE ${phrases[phrases.length - 1]!}`];
}

/** Sıralı + genişletilmiş + VE ile birleştirilmiş gövde metni. */
export function certificateAchievementBody(shorts: string[]): string {
  return joinAchievementPhrases(sortAchievements(shorts).map(expandAchievementPhrase));
}

function setHeadlineFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  family: string,
  tracking: number
) {
  ctx.font = `700 ${size}px "${family}"`;
  ctx.letterSpacing = `${tracking * size}px`;
}

function measureHeadlineWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

function fillHeadlineCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baseline: number
) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, centerX, baseline);
}

function fitHeadlineSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  baseSize: number,
  tracking: number,
  maxWidth: number,
  minSize = 28
): number {
  let size = baseSize;
  while (size > minSize) {
    setHeadlineFont(ctx, size, family, tracking);
    if (measureHeadlineWidth(ctx, text) <= maxWidth) return size;
    size -= 1;
  }
  return size;
}

/**
 * Başarı birimlerine göre satırlara böl.
 * Aynı satıra sığanlar: "A, B VE C"; sığmayan birim bütünüyle alt satıra.
 */
function wrapAchievementLines(
  ctx: CanvasRenderingContext2D,
  units: string[],
  family: string,
  size: number,
  tracking: number,
  maxWidth: number
): string[] {
  setHeadlineFont(ctx, size, family, tracking);
  if (!units.length) return [];
  const lines: string[] = [];
  let current = '';
  for (const unit of units) {
    const joiner = !current ? '' : unit.startsWith('VE ') ? ' ' : ', ';
    const next = current ? `${current}${joiner}${unit}` : unit;
    if (!current || measureHeadlineWidth(ctx, next) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = unit;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function prepareAdeliaGlyphs(name: string): {
  chars: string[];
  marks: (AdeliaMark | null)[];
} {
  const raw = Array.from(name.normalize('NFC'));
  const chars: string[] = [];
  const marks: (AdeliaMark | null)[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    const next = raw[i + 1];
    if (next === '\u0327') {
      chars.push(ch);
      marks.push('cedilla');
      i += 1;
      continue;
    }
    if (next === '\u0306') {
      chars.push(ch);
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

  let x = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const mark = marks[i];
    const metrics = ctx.measureText(ch);
    const cw = metrics.width;

    if (mark === 'dotless') {
      // Adelia "i" noktasını kes, sapı (ı) uzun kalsın — hedef: Yalçınkaya referansı
      ctx.save();
      ctx.beginPath();
      // Nokta ~-0.55em; sap üstü ~-0.40em civarı kalsın
      ctx.rect(x - cw * 0.25, -size * 0.4, cw * 1.5, size * 1.55);
      ctx.clip();
      ctx.fillText('i', x, 0);
      ctx.restore();
    } else {
      ctx.fillText(ch, x, 0);
    }

    if (mark === 'cedilla' && marksImg.cedilla) {
      const img = marksImg.cedilla;
      const isUpper = ch === 'S' || ch === 'C';
      // Virgül glif merkezinin altında (önceki 0.24/0.18 sağa kayıyordu)
      const optical = isUpper ? 0.12 : 0.1;
      const targetH = size * (isUpper ? 0.19 : 0.175);
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      const mw = targetH * aspect;
      const cx = x + cw * optical;
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
    } else if (mark === 'tittle') {
      // Büyük İ: Adelia I gövdesi + üst nokta
      const ascent = metrics.actualBoundingBoxAscent ?? size * 0.72;
      const r = size * 0.045;
      const cx = x + cw * 0.42;
      const cy = -ascent - size * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    x += cw;
  }
  ctx.restore();
}

/**
 * Logo alfa kanalını koruyarak opak pikselleri siyaha çevir.
 * Ölçek: opak kutuyu maxW×maxH içine sığdır; ortalama opak merkeze göre.
 * Dönen değer: çizilen opak yüksekliği (dikey denge için).
 */
function drawBlackLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  centerY: number,
  maxW: number,
  maxH: number
): number {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return 0;
  const box = measureOpaqueBox(img) || { x: 0, y: 0, w: iw, h: ih };
  const scale = Math.min(maxW / Math.max(1, box.w), maxH / Math.max(1, box.h));
  const outW = Math.max(1, Math.round(iw * scale));
  const outH = Math.max(1, Math.round(ih * scale));
  const tmp = document.createElement('canvas');
  tmp.width = outW;
  tmp.height = outH;
  const tctx = tmp.getContext('2d');
  if (!tctx) return 0;
  tctx.drawImage(img, 0, 0, outW, outH);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = '#111111';
  tctx.fillRect(0, 0, outW, outH);
  const opaqueCx = (box.x + box.w / 2) * scale;
  const opaqueCy = (box.y + box.h / 2) * scale;
  ctx.drawImage(tmp, centerX - opaqueCx, centerY - opaqueCy);
  return box.h * scale;
}

export async function renderCertificate(job: CertificateJob): Promise<HTMLCanvasElement> {
  await loadCertFonts();
  const templateUrl = job.templateUrl ?? certificateTemplateFor(job.periodId);
  if (!templateUrl) throw new Error('Sertifika template yok');
  const logoUrl = job.logoUrl ?? null;
  const [template, cedilla, breve, logo] = await Promise.all([
    loadRankImage(templateUrl),
    loadRankImage(CERT_MARK_URLS.cedilla),
    loadRankImage(CERT_MARK_URLS.breve),
    logoUrl ? loadRankImage(logoUrl) : Promise.resolve(null),
  ]);
  if (!template) throw new Error('Sertifika template yüklenemedi');

  const canvas = document.createElement('canvas');
  canvas.width = CERT_CANVAS.width;
  canvas.height = CERT_CANVAS.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');

  ctx.drawImage(template, 0, 0, CERT_CANVAS.width, CERT_CANVAS.height);

  const headline = certificateHeadline(job.periodId);
  if (!headline) throw new Error('Sertifika yalnızca II. / III. çeyrek için');
  if (!job.achievements.length) throw new Error('Sertifikada başarı yok');

  const units = achievementWrapUnits(job.achievements);
  const t = L.title;
  const b = L.body;

  let titleSize = fitHeadlineSize(ctx, headline, t.family, t.size, t.tracking, t.maxWidth);
  let bodySize: number = b.size;
  let lineGap: number = b.lineGap;
  let lines = wrapAchievementLines(ctx, units, b.family, bodySize, b.tracking, b.maxWidth);

  const capRatio = 0.81; // Oswald Bold yaklaşık capHeight/em
  const unitFits = () =>
    units.every((u) => {
      setHeadlineFont(ctx, bodySize, b.family, b.tracking);
      return measureHeadlineWidth(ctx, u) <= b.maxWidth;
    });

  const fitBlock = () => {
    while (bodySize > 36) {
      lines = wrapAchievementLines(ctx, units, b.family, bodySize, b.tracking, b.maxWidth);
      const titleH = titleSize * capRatio;
      const bodyH =
        bodySize * capRatio + Math.max(0, lines.length - 1) * lineGap;
      const blockH = titleH + b.gapAfterTitle + bodyH;
      const room = L.thanksTop - L.name.bottom;
      if (blockH <= room - 20 && lines.length <= 5 && unitFits()) return;
      if (lineGap > bodySize * 1.15) {
        lineGap -= 2;
        continue;
      }
      bodySize -= 1;
      lineGap = Math.max(Math.round(bodySize * 1.28), 96);
    }
    lines = wrapAchievementLines(ctx, units, b.family, bodySize, b.tracking, b.maxWidth);
  };
  fitBlock();

  const titleH = titleSize * capRatio;
  const bodyH = bodySize * capRatio + Math.max(0, lines.length - 1) * lineGap;
  const blockH = titleH + b.gapAfterTitle + bodyH;
  const blockTop =
    L.name.bottom + (L.thanksTop - L.name.bottom - blockH) / 2 - t.liftPx;
  const titleBaseline = blockTop + titleH;
  const bodyFirstBaseline = titleBaseline + b.gapAfterTitle + bodySize * capRatio;

  // Üstte isim veya takım logosu (logo: CB ↔ altın yazı eşit mesafe)
  if (logo) {
    const titleTop = blockTop;
    const available = Math.max(0, titleTop - LOGO.topAnchor);
    const maxH = Math.max(
      80,
      Math.min(LOGO.maxHeight, available - 2 * LOGO.minGap)
    );
    const centerY = (LOGO.topAnchor + titleTop) / 2;
    drawBlackLogo(ctx, logo, L.centerX, centerY, LOGO.maxWidth, maxH);
  } else {
    const name = toTitleCaseName(job.displayName.trim());
    drawScriptName(ctx, name, { cedilla, breve });
  }

  ctx.fillStyle = t.color;
  setHeadlineFont(ctx, titleSize, t.family, t.tracking);
  fillHeadlineCentered(ctx, headline, L.centerX, titleBaseline);

  ctx.fillStyle = b.color;
  setHeadlineFont(ctx, bodySize, b.family, b.tracking);
  for (let i = 0; i < lines.length; i += 1) {
    fillHeadlineCentered(
      ctx,
      lines[i]!,
      L.centerX,
      bodyFirstBaseline + i * lineGap
    );
  }

  // letterSpacing kalıcı olmasın
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'start';

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
