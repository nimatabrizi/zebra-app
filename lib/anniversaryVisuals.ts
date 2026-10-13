/**
 * Yıl dönümü görselleri (Doğum Günü ile aynı yetki) — 1080×1920 canvas çizimi.
 * Yerleşim ölçüleri "1. Yılınız" örnek tasarımından piksel bazında alındı.
 */

import { toTurkishUpper } from './formatName';
import { loadGirisPhoto } from './girisVisuals';
import {
  DEFAULT_PHOTO_ADJUST,
  fillTracked,
  loadRankImage,
  measureOpaqueBox,
  trackedWidth,
  type PhotoAdjust,
} from './rankingVisuals';

export const ANNIVERSARY_CANVAS = { width: 1080, height: 1920 } as const;

export const ANNIVERSARY_ASSETS = {
  background: '/templates/yil-donumu/back.jpg',
  motto: '/templates/social-motto.png',
} as const;

export const ANNIVERSARY_FONTS = {
  script: { family: 'Zebra YD Script', url: '/fonts/yil-donumu/ataturk.ttf', format: 'truetype', weight: '400' },
  surname: { family: 'Zebra YD Surname', url: '/fonts/zalando-sans-expanded-600.woff2', format: 'woff2', weight: '600' },
  serif: { family: 'Zebra YD Serif', url: '/fonts/yil-donumu/cinzel-400.woff2', format: 'woff2', weight: '400' },
  serifBold: { family: 'Zebra YD Serif Bold', url: '/fonts/yil-donumu/cinzel-600.woff2', format: 'woff2', weight: '600' },
} as const;

const GOLD_TOP = 'rgb(236,200,146)';
const GOLD_BOTTOM = 'rgb(186,138,82)';
const SOFT_WHITE = 'rgb(236,234,238)';
const NAVY = '8,12,28';

export const ANNIVERSARY_LAYOUT = {
  /** Fotoğrafın opak alanı bu genişliğe ölçeklenir; tepe noktası `top`'a oturur. */
  photo: { width: 920, centerX: 250, top: 700 },
  /** Fotoğraf bu aralıkta tam opaktan şeffafa iner (alttaki logo okunsun). */
  fade: { start: 1540, end: 1860 },
  /** "N. YILINIZ" satırı: yıldızlı çizgi ile "Kutlu Olsun!" arası. */
  year: {
    centerX: 748,
    baseline: 990,
    wordCap: 50,
    wordTracking: 0.2,
    numberCap: 70,
    gap: 24,
    maxWidth: 560,
  },
  /** İsim bloğu: ad el yazısı (beyaz), soyad expanded (altın). */
  name: {
    centerX: 735,
    firstBaseline: 1370,
    firstCap: 58,
    firstMaxWidth: 560,
    surnameBaseline: 1443,
    surnameCap: 52,
    surnameTracking: 0.04,
    surnameMaxWidth: 640,
  },
  /** İsmin arkasındaki koyu hale. */
  halo: { radiusX: 360, radiusY: 170, alpha: 0.5 },
  motto: { centerX: 540, top: 1768, width: 640 },
} as const;

export type AnniversaryAdjust = { photo: PhotoAdjust; name: PhotoAdjust };

export const DEFAULT_ANNIVERSARY_ADJUST: AnniversaryAdjust = {
  photo: DEFAULT_PHOTO_ADJUST,
  name: DEFAULT_PHOTO_ADJUST,
};

export type AnniversaryPerson = {
  displayName: string;
  photoUrl: string | null;
  years: number;
};

let fontsPromise: Promise<void> | null = null;

function loadAnniversaryFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    await Promise.all(
      Object.values(ANNIVERSARY_FONTS).map(async ({ family, url, format, weight }) => {
        const face = new FontFace(family, `url(${url}) format("${format}")`, { weight });
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

/** Fontun 1px boyutundaki büyük harf yüksekliği; hedef yüksekliğe göre boyut seçmek için. */
function capRatio(ctx: CanvasRenderingContext2D, family: string, weight: string): number {
  ctx.font = `${weight} 100px "${family}"`;
  const ascent = ctx.measureText('H').actualBoundingBoxAscent;
  return ascent > 0 ? ascent / 100 : 0.7;
}

function goldGradient(ctx: CanvasRenderingContext2D, top: number, bottom: number) {
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, GOLD_TOP);
  gradient.addColorStop(1, GOLD_BOTTOM);
  return gradient;
}

function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, adjust: PhotoAdjust) {
  const box = measureOpaqueBox(img);
  if (!box) return;
  const { width: W, height: H } = ANNIVERSARY_CANVAS;
  const { photo, fade } = ANNIVERSARY_LAYOUT;
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext('2d');
  if (!lctx) return;

  const scale = (photo.width * adjust.scale) / Math.max(8, box.w);
  const drawX = photo.centerX + adjust.dx - (box.x + box.w / 2) * scale;
  const drawY = photo.top + adjust.dy - box.y * scale;
  lctx.drawImage(img, drawX, drawY, img.naturalWidth * scale, img.naturalHeight * scale);

  lctx.globalCompositeOperation = 'destination-in';
  const gradient = lctx.createLinearGradient(0, fade.start, 0, fade.end);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  lctx.fillStyle = gradient;
  lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(layer, 0, 0);
}

function drawYearLine(ctx: CanvasRenderingContext2D, years: number) {
  const y = ANNIVERSARY_LAYOUT.year;
  const number = `${years}.`;
  const word = 'YILINIZ';
  const { serif, serifBold } = ANNIVERSARY_FONTS;

  let wordSize = y.wordCap / capRatio(ctx, serif.family, serif.weight);
  let numberSize = y.numberCap / capRatio(ctx, serifBold.family, serifBold.weight);
  const measure = () => {
    ctx.font = `${serifBold.weight} ${numberSize}px "${serifBold.family}"`;
    const numberWidth = ctx.measureText(number).width;
    ctx.font = `${serif.weight} ${wordSize}px "${serif.family}"`;
    const wordWidth = trackedWidth(ctx, word, wordSize * y.wordTracking);
    return { numberWidth, wordWidth, total: numberWidth + y.gap + wordWidth };
  };
  let m = measure();
  if (m.total > y.maxWidth) {
    const ratio = y.maxWidth / m.total;
    wordSize *= ratio;
    numberSize *= ratio;
    m = measure();
  }
  const left = y.centerX - m.total / 2;

  ctx.font = `${serifBold.weight} ${numberSize}px "${serifBold.family}"`;
  ctx.fillStyle = goldGradient(ctx, y.baseline - y.numberCap, y.baseline);
  ctx.fillText(number, left, y.baseline);

  ctx.font = `${serif.weight} ${wordSize}px "${serif.family}"`;
  ctx.fillStyle = SOFT_WHITE;
  fillTracked(ctx, word, left + m.numberWidth + y.gap, y.baseline, wordSize * y.wordTracking);
}

function splitName(displayName: string): { first: string; surname: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || '', surname: '' };
  return { first: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1]! };
}

function drawNameBlock(ctx: CanvasRenderingContext2D, displayName: string, adjust: PhotoAdjust) {
  const n = ANNIVERSARY_LAYOUT.name;
  const halo = ANNIVERSARY_LAYOUT.halo;
  const { first, surname } = splitName(displayName);
  const { script, surname: surnameFont } = ANNIVERSARY_FONTS;
  const pivotY = (n.firstBaseline - n.firstCap + n.surnameBaseline) / 2;

  ctx.save();
  ctx.translate(n.centerX + adjust.dx, pivotY + adjust.dy);
  ctx.scale(adjust.scale, adjust.scale);
  ctx.translate(-n.centerX, -pivotY);

  ctx.save();
  ctx.translate(n.centerX, pivotY);
  ctx.scale(1, halo.radiusY / halo.radiusX);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, halo.radiusX);
  glow.addColorStop(0, `rgba(${NAVY},${halo.alpha})`);
  glow.addColorStop(1, `rgba(${NAVY},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-halo.radiusX, -halo.radiusX, halo.radiusX * 2, halo.radiusX * 2);
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = `rgba(${NAVY},0.55)`;
  ctx.shadowBlur = 18;

  if (first) {
    let size = n.firstCap / capRatio(ctx, script.family, script.weight);
    ctx.font = `${script.weight} ${size}px "${script.family}"`;
    const width = ctx.measureText(first).width;
    if (width > n.firstMaxWidth) {
      size *= n.firstMaxWidth / width;
      ctx.font = `${script.weight} ${size}px "${script.family}"`;
    }
    const metrics = ctx.measureText(first);
    const inkLeft = metrics.actualBoundingBoxLeft || 0;
    const inkWidth = inkLeft + (metrics.actualBoundingBoxRight || metrics.width);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(first, n.centerX - inkWidth / 2 + inkLeft, n.firstBaseline);
  }

  if (surname) {
    const text = toTurkishUpper(surname);
    let size = n.surnameCap / capRatio(ctx, surnameFont.family, surnameFont.weight);
    ctx.font = `${surnameFont.weight} ${size}px "${surnameFont.family}"`;
    let width = trackedWidth(ctx, text, size * n.surnameTracking);
    if (width > n.surnameMaxWidth) {
      size *= n.surnameMaxWidth / width;
      ctx.font = `${surnameFont.weight} ${size}px "${surnameFont.family}"`;
      width = trackedWidth(ctx, text, size * n.surnameTracking);
    }
    ctx.fillStyle = goldGradient(ctx, n.surnameBaseline - n.surnameCap, n.surnameBaseline);
    fillTracked(ctx, text, n.centerX - width / 2, n.surnameBaseline, size * n.surnameTracking);
  }

  ctx.restore();
}

function drawMotto(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const m = ANNIVERSARY_LAYOUT.motto;
  const height = (img.naturalHeight / img.naturalWidth) * m.width;
  ctx.drawImage(img, m.centerX - m.width / 2, m.top, m.width, height);
}

export async function renderAnniversaryVisual(
  person: AnniversaryPerson,
  adjust: AnniversaryAdjust = DEFAULT_ANNIVERSARY_ADJUST
): Promise<HTMLCanvasElement> {
  await loadAnniversaryFonts();
  const [background, photo, motto] = await Promise.all([
    loadRankImage(ANNIVERSARY_ASSETS.background),
    loadGirisPhoto(person.photoUrl),
    loadRankImage(ANNIVERSARY_ASSETS.motto),
  ]);
  if (!background) throw new Error('Arka plan yüklenemedi');

  const canvas = document.createElement('canvas');
  canvas.width = ANNIVERSARY_CANVAS.width;
  canvas.height = ANNIVERSARY_CANVAS.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');

  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  if (photo) drawPhoto(ctx, photo.img, adjust.photo);
  ctx.save();
  drawYearLine(ctx, person.years);
  ctx.restore();
  drawNameBlock(ctx, person.displayName, adjust.name);
  if (motto) drawMotto(ctx, motto);
  return canvas;
}

/** "YYYY-MM-DD" işe giriş tarihi; 1900 öncesi yer tutucu yıllar bilinmiyor sayılır. */
export function parseHireDate(value: unknown): { year: number; month: number; day: number } | null {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Bugüne en yakın kutlama: bu yılki yıl dönümü bir aydan daha eskiyse sıradaki
 * yılınki alınır (Aralık'ta "Gelecek ay" Ocak'ı doğru yıl sayısıyla gösterir).
 * 29 Şubat girişleri artık yıl olmayan yıllarda 28 Şubat'ta kutlanır.
 */
export function upcomingAnniversary(
  hire: { year: number; month: number; day: number },
  today: Date
): { year: number; month: number; day: number; years: number } {
  const at = (year: number) => {
    const day = hire.month === 2 && hire.day === 29 && !isLeapYear(year) ? 28 : hire.day;
    return { year, month: hire.month, day };
  };
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cutoff = new Date(startOfToday);
  cutoff.setDate(cutoff.getDate() - 31);
  let occurrence = at(today.getFullYear());
  if (new Date(occurrence.year, occurrence.month - 1, occurrence.day) < cutoff) {
    occurrence = at(today.getFullYear() + 1);
  }
  return { ...occurrence, years: occurrence.year - hire.year };
}
