/**
 * Hoş geldin görseli — 1080×1920 canvas çizimi.
 * Ölçüler "Hoşgeldin-Örnek" tasarımından piksel bazında alındı: isim Adelia 72,5px
 * yatayda %140 genişletilmiş, unvan Zalando Sans Expanded 600 28px iki çizgi arasında,
 * fotoğraf göz hizasına göre yerleşir ve altta koyu zemine yumuşakça karışır.
 */

import { toTurkishUpper } from './formatName';
import { measureFace, type FaceMetrics } from './girisVisuals';
import { fillTracked, loadRankImage, measureOpaqueBox, trackedWidth } from './rankingVisuals';

export const WELCOME_CANVAS = { width: 1080, height: 1920 } as const;

export const WELCOME_ASSETS = { background: '/templates/hos-geldin/back.jpg' } as const;

export const WELCOME_FONTS = {
  name: { family: 'Zebra Welcome Name', url: '/fonts/hos-geldin/adelia.otf', format: 'opentype' },
  title: { family: 'Zebra Welcome Title', url: '/fonts/zalando-sans-expanded-600.woff2', format: 'woff2' },
} as const;

export const DEFAULT_WELCOME_TITLE = 'Gayrimenkul Danışmanı';

export const WELCOME_LAYOUT = {
  name: { centerX: 540, baseline: 1528, size: 72.5, stretchX: 1.4, maxWidth: 980 },
  title: { centerX: 540, baseline: 1689, size: 28, tracking: 3.3, maxWidth: 900 },
  /** Unvanın üstündeki ve altındaki çizgiler; genişlik unvana göre ayarlanır. */
  rules: { top: 1650, bottom: 1705, thickness: 3, padding: 3 },
  /** Örnekteki göz ortası ve iki göz arası mesafe (MediaPipe ile ölçüldü). */
  face: { eyeMidX: 704, eyeMidY: 894.5, eyeDistance: 108.6 },
  /** Yüz bulunamazsa opak alanın yerleşimi */
  fallback: { width: 650, centerX: 740, top: 680 },
  /** Fotoğrafın alt kısmı bu aralıkta zemine karışır. */
  fade: { start: 1580, end: 1780 },
} as const;

/** Önizlemedeki kesikli yüz kılavuzu (örnekteki yüzün çevresi). */
export const WELCOME_FACE_GUIDES = { x: [595, 812], y: [770, 1085] } as const;

export type WelcomeAdjust = { scale: number; dx: number; dy: number };

export const DEFAULT_WELCOME_ADJUST: WelcomeAdjust = { scale: 1, dx: 0, dy: 0 };

let fontsPromise: Promise<void> | null = null;

export function loadWelcomeFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = Promise.all(
    Object.values(WELCOME_FONTS).map(async ({ family, url, format }) => {
      const face = new FontFace(family, `url(${url}) format("${format}")`);
      await face.load();
      document.fonts.add(face);
    })
  )
    .then(() => undefined)
    .catch((error) => {
      fontsPromise = null;
      throw error;
    });
  return fontsPromise;
}

let backgroundPromise: Promise<HTMLImageElement> | null = null;

function loadBackground() {
  if (!backgroundPromise) {
    backgroundPromise = loadRankImage(WELCOME_ASSETS.background)
      .then((image) => {
        if (!image) throw new Error('Hoş geldin şablonu yüklenemedi');
        return image;
      })
      .catch((error) => {
        backgroundPromise = null;
        throw error;
      });
  }
  return backgroundPromise;
}

type Placement = { x: number; y: number; scale: number };

function placePhoto(img: HTMLImageElement, face: FaceMetrics | null, adjust: WelcomeAdjust): Placement | null {
  const L = WELCOME_LAYOUT;
  if (face && face.eyeDistance > 4) {
    const scale = (L.face.eyeDistance / face.eyeDistance) * adjust.scale;
    return {
      scale,
      x: L.face.eyeMidX + adjust.dx - face.eyeMidX * scale,
      y: L.face.eyeMidY + adjust.dy - face.eyeMidY * scale,
    };
  }
  const box = measureOpaqueBox(img);
  if (!box) return null;
  const scale = (L.fallback.width / Math.max(8, box.w)) * adjust.scale;
  return {
    scale,
    x: L.fallback.centerX + adjust.dx - (box.x + box.w / 2) * scale,
    y: L.fallback.top + adjust.dy - box.y * scale,
  };
}

function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, placement: Placement) {
  const { width: W, height: H } = WELCOME_CANVAS;
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext('2d');
  if (!lctx) return;
  lctx.imageSmoothingQuality = 'high';
  lctx.drawImage(
    img,
    placement.x,
    placement.y,
    img.naturalWidth * placement.scale,
    img.naturalHeight * placement.scale
  );
  const { start, end } = WELCOME_LAYOUT.fade;
  lctx.globalCompositeOperation = 'destination-out';
  const gradient = lctx.createLinearGradient(0, start, 0, end);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,1)');
  lctx.fillStyle = gradient;
  lctx.fillRect(0, start, W, end - start);
  lctx.fillStyle = '#000';
  lctx.fillRect(0, end, W, H - end);
  ctx.drawImage(layer, 0, 0);
}

function drawName(ctx: CanvasRenderingContext2D, name: string) {
  const L = WELCOME_LAYOUT.name;
  let size: number = L.size;
  ctx.font = `${size}px "${WELCOME_FONTS.name.family}"`;
  let width = ctx.measureText(name).width * L.stretchX;
  if (width > L.maxWidth) {
    size *= L.maxWidth / width;
    ctx.font = `${size}px "${WELCOME_FONTS.name.family}"`;
    width = ctx.measureText(name).width * L.stretchX;
  }
  ctx.save();
  ctx.translate(L.centerX - width / 2, L.baseline);
  ctx.scale(L.stretchX, 1);
  ctx.fillText(name, 0, 0);
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string) {
  const L = WELCOME_LAYOUT.title;
  const R = WELCOME_LAYOUT.rules;
  let size: number = L.size;
  let tracking: number = L.tracking;
  ctx.font = `${size}px "${WELCOME_FONTS.title.family}"`;
  let width = trackedWidth(ctx, title, tracking);
  if (width > L.maxWidth) {
    const ratio = L.maxWidth / width;
    size *= ratio;
    tracking *= ratio;
    ctx.font = `${size}px "${WELCOME_FONTS.title.family}"`;
    width = trackedWidth(ctx, title, tracking);
  }
  const left = L.centerX - width / 2;
  fillTracked(ctx, title, left, L.baseline, tracking);
  const ruleWidth = width + R.padding * 2;
  for (const top of [R.top, R.bottom]) {
    ctx.fillRect(L.centerX - ruleWidth / 2, top, ruleWidth, R.thickness);
  }
}

export type WelcomeContent = { photo: HTMLImageElement | null; name: string; title: string };

export async function renderWelcomeVisual(
  content: WelcomeContent,
  adjust: WelcomeAdjust
): Promise<{ canvas: HTMLCanvasElement; faceFound: boolean }> {
  const [background] = await Promise.all([loadBackground(), loadWelcomeFonts()]);
  const { width: W, height: H } = WELCOME_CANVAS;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tuval oluşturulamadı');
  ctx.drawImage(background, 0, 0, W, H);

  let faceFound = false;
  if (content.photo) {
    const face = await measureFace(content.photo);
    faceFound = Boolean(face);
    const placement = placePhoto(content.photo, face, adjust);
    if (placement) drawPhoto(ctx, content.photo, placement);
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  const name = content.name.trim();
  if (name) drawName(ctx, name);
  const title = toTurkishUpper(content.title.trim());
  if (title) drawTitle(ctx, title);

  return { canvas, faceFound };
}
