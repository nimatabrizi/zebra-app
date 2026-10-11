/**
 * Doğum günü görselleri (Nima Tabrizi paneli) — 1080×1920 canvas çizimi.
 * Yerleşim ölçüleri "Örnek doğum günü" PSD çıktısından piksel bazında alındı.
 */

import { toTurkishUpper } from './formatName';
import {
  DEFAULT_PHOTO_ADJUST,
  fillTracked,
  loadRankImage,
  measureOpaqueBox,
  trackedWidth,
  type PhotoAdjust,
} from './rankingVisuals';

export const BIRTHDAY_CANVAS = { width: 1080, height: 1920 } as const;

export const BIRTHDAY_ASSETS = {
  background: '/templates/dogum-gunu/back.png',
  overlays: [
    { url: '/templates/dogum-gunu/dogum-gununuz.png', x: 256, y: 1150, scale: 1 },
    { url: '/templates/dogum-gunu/kutlu-olsun.png', x: 357, y: 1344, scale: 1.015 },
    { url: '/templates/dogum-gunu/ekibimizin.png', x: 256, y: 1490, scale: 1 },
  ],
} as const;

export const BIRTHDAY_FONTS = {
  name: { family: 'Zebra BD Name', url: '/fonts/zalando-sans-expanded-600.woff2' },
  title: { family: 'Zebra BD Title', url: '/fonts/dogum-gunu/zebra-bd-title.woff2' },
} as const;

export const BIRTHDAY_LAYOUT = {
  /** Fotoğrafın opak alanı bu genişliğe ölçeklenir. */
  photo: { width: 842, centerX: 550, top: 500 },
  /** Fotoğraf bu aralıkta tam opaktan şeffafa iner. */
  fade: { start: 780, end: 1600 },
  name: { centerX: 544, baseline: 1634, size: 69.9, tracking: 3.4, maxWidth: 960 },
  title: { centerX: 556, baseline: 1710, size: 34.9, tracking: 17.4, maxWidth: 900 },
  rules: { top: 1673, bottom: 1721, thickness: 3, overhang: 20, color: 'rgb(177,188,174)' },
} as const;

export type BirthdayPerson = {
  displayName: string;
  title: string;
  photoUrl: string | null;
};

let fontsPromise: Promise<void> | null = null;

function loadBirthdayFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    await Promise.all(
      Object.values(BIRTHDAY_FONTS).map(async ({ family, url }) => {
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

function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, adjust: PhotoAdjust) {
  const box = measureOpaqueBox(img);
  if (!box) return;
  const { width: W, height: H } = BIRTHDAY_CANVAS;
  const { photo, fade } = BIRTHDAY_LAYOUT;
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

function drawName(ctx: CanvasRenderingContext2D, name: string) {
  const n = BIRTHDAY_LAYOUT.name;
  let size: number = n.size;
  let tracking: number = n.tracking;
  ctx.font = `${size}px "${BIRTHDAY_FONTS.name.family}"`;
  const width = trackedWidth(ctx, name, tracking);
  if (width > n.maxWidth) {
    const ratio = Math.max(0.6, n.maxWidth / width);
    size *= ratio;
    tracking *= ratio;
    ctx.font = `${size}px "${BIRTHDAY_FONTS.name.family}"`;
  }
  const finalWidth = trackedWidth(ctx, name, tracking);
  fillTracked(ctx, name, n.centerX - finalWidth / 2, n.baseline, tracking);
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string) {
  const t = BIRTHDAY_LAYOUT.title;
  const r = BIRTHDAY_LAYOUT.rules;
  if (!title) return;
  ctx.font = `${t.size}px "${BIRTHDAY_FONTS.title.family}"`;
  let tracking: number = t.tracking;
  const chars = Array.from(title);
  const measureInk = (track: number) => {
    const first = ctx.measureText(chars[0]!);
    const last = chars[chars.length - 1]!;
    const lastOffset = ctx.measureText(chars.slice(0, -1).join('')).width + (chars.length - 1) * track;
    const left = -(first.actualBoundingBoxLeft || 0);
    const right = lastOffset + (ctx.measureText(last).actualBoundingBoxRight || 0);
    return { left, right, width: right - left };
  };
  let ink = measureInk(tracking);
  if (ink.width > t.maxWidth && chars.length > 1) {
    const natural = measureInk(0).width;
    tracking = Math.max(0, (t.maxWidth - natural) / (chars.length - 1));
    ink = measureInk(tracking);
  }
  const x = t.centerX - ink.width / 2 - ink.left;
  fillTracked(ctx, title, x, t.baseline, tracking);

  ctx.fillStyle = r.color;
  const ruleLeft = Math.round(x + ink.left - r.overhang);
  const ruleWidth = Math.round(ink.width + r.overhang * 2);
  ctx.fillRect(ruleLeft, r.top, ruleWidth, r.thickness);
  ctx.fillRect(ruleLeft, r.bottom, ruleWidth, r.thickness);
}

export async function renderBirthdayVisual(
  person: BirthdayPerson,
  adjust: PhotoAdjust = DEFAULT_PHOTO_ADJUST
): Promise<HTMLCanvasElement> {
  await loadBirthdayFonts();
  const [background, photo, ...overlays] = await Promise.all([
    loadRankImage(BIRTHDAY_ASSETS.background),
    loadRankImage(person.photoUrl),
    ...BIRTHDAY_ASSETS.overlays.map((o) => loadRankImage(o.url)),
  ]);
  if (!background) throw new Error('Arka plan yüklenemedi');

  const canvas = document.createElement('canvas');
  canvas.width = BIRTHDAY_CANVAS.width;
  canvas.height = BIRTHDAY_CANVAS.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');

  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  if (photo) drawPhoto(ctx, photo, adjust);
  BIRTHDAY_ASSETS.overlays.forEach((overlay, index) => {
    const img = overlays[index];
    if (!img) return;
    ctx.drawImage(
      img,
      overlay.x,
      overlay.y,
      img.naturalWidth * overlay.scale,
      img.naturalHeight * overlay.scale
    );
  });

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  drawName(ctx, toTurkishUpper(person.displayName));
  drawTitle(ctx, toTurkishUpper(person.title));
  ctx.restore();
  return canvas;
}
