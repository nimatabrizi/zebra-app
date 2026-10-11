/**
 * Giriş görselleri (Nima Tabrizi paneli) — A4 300 DPI baskı çizimi, yüz hizalama
 * ve PDF çıktısı. Yerleşim ölçüleri "Çiğdem Yurtman" A4 örneğinden alındı
 * (150 DPI örnek ölçüleri ×2).
 */

import { toTurkishUpper } from './formatName';
import { withConsultantPhotoVersion } from './consultantPhotoResolve';
import {
  fillTracked,
  forgetRankImage,
  loadRankImage,
  measureOpaqueBox,
  trackedWidth,
} from './rankingVisuals';

export const GIRIS_CANVAS = { width: 2480, height: 3508 } as const;
export const GIRIS_DPI = 300;
/** 3 mm taşma payı (300 DPI'da) */
export const GIRIS_BLEED_PX = Math.round((3 / 25.4) * GIRIS_DPI);

export const GIRIS_FONTS = {
  name: { family: 'Zebra Giris Name', url: '/fonts/giris/zebra-giris-name.woff2' },
  title: { family: 'Zebra Giris Title', url: '/fonts/giris/zebra-giris-title.woff2' },
} as const;

export const GIRIS_LOGO = {
  url: '/templates/kurumsal/isini-aska-yapanlar-beyaz.png',
  x: 710,
  y: 3212,
  width: 1060,
} as const;

export const GIRIS_LAYOUT = {
  background: '#000000',
  name: { centerX: 1240, baseline: 2853, size: 247.6, tracking: 3.2, maxWidth: 2120 },
  rule: { centerX: 1240, top: 2898, width: 1088, thickness: 2, color: '#FFFFFF' },
  title: { centerX: 1230, baseline: 3007, size: 58.6, tracking: 4, maxWidth: 2000 },
  /** Örnekteki göz ortası ve iki göz arası mesafe (MediaPipe ile ölçüldü). */
  face: { eyeMidX: 1160, eyeMidY: 1347, eyeDistance: 487 },
  /** Yüz bulunamazsa opak alanın yerleşimi */
  fallback: { width: 1800, centerX: 1240, top: 380 },
} as const;

export type InnerShadow = {
  enabled: boolean;
  opacity: number;
  blur: number;
  distance: number;
  angle: number;
  color: string;
};

export type BottomFade = { start: number; strength: number };

/** Hepsi 0 iken fotoğraf değişmez. */
export type ColorAdjust = {
  /** 0–100 */
  red: number;
  /** 0–100 */
  yellow: number;
  /** −50…+50 */
  temperature: number;
  /** −50…+50, artı macenta */
  tint: number;
  /** −50…+50 */
  saturation: number;
  /** −30…+30 */
  brightness: number;
  /** −30…+30 */
  contrast: number;
};

export type GirisEffects = { shadow: InnerShadow; fade: BottomFade; color: ColorAdjust };

export type GirisAdjust = { scale: number; dx: number; dy: number };

export const DEFAULT_GIRIS_ADJUST: GirisAdjust = { scale: 1, dx: 0, dy: 0 };

export const DEFAULT_GIRIS_COLOR: ColorAdjust = {
  red: 0,
  yellow: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
};

export const DEFAULT_GIRIS_EFFECTS: GirisEffects = {
  shadow: { enabled: true, opacity: 0.75, blur: 90, distance: 0, angle: 90, color: '#000000' },
  fade: { start: 1900, strength: 1 },
  color: DEFAULT_GIRIS_COLOR,
};

/** Eski kayıtlarda eksik alanlar varsayılanla (renk için fallbackColor ile) tamamlanır. */
export function normalizeGirisEffects(
  raw: Partial<GirisEffects> | null | undefined,
  fallbackColor: ColorAdjust = DEFAULT_GIRIS_COLOR
): GirisEffects {
  return {
    shadow: { ...DEFAULT_GIRIS_EFFECTS.shadow, ...(raw?.shadow || {}) },
    fade: { ...DEFAULT_GIRIS_EFFECTS.fade, ...(raw?.fade || {}) },
    color: raw?.color ? { ...DEFAULT_GIRIS_COLOR, ...raw.color } : fallbackColor,
  };
}

export function isColorAdjustActive(color: ColorAdjust | undefined): color is ColorAdjust {
  return Boolean(color && Object.values(color).some((v) => v !== 0));
}

const FADE_LENGTH = 900;

// ---------------------------------------------------------------------------
// Yükleme
// ---------------------------------------------------------------------------

let fontsPromise: Promise<void> | null = null;

export function loadGirisFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    await Promise.all(
      Object.values(GIRIS_FONTS).map(async ({ family, url }) => {
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

const HIRES_BUCKET_PATH = '/storage/v1/object/public/consultant-photos-hires/';
const NORMAL_BUCKET_PATH = '/storage/v1/object/public/consultant-photos/';

type PhotoVersion = { exists: boolean; version: string | null };

/** Sorgusuz dosya adresi → Storage sürümü (etag / last-modified). */
const photoVersions = new Map<string, Promise<PhotoVersion>>();
/** Sorgusuz dosya adresi → en son yüklenen sürümlü adres */
const loadedPhotoUrls = new Map<string, string>();

function bareUrl(url: string) {
  return url.split('?')[0]!;
}

function fetchPhotoVersion(bare: string): Promise<PhotoVersion> {
  const cached = photoVersions.get(bare);
  if (cached) return cached;
  const pending = fetch(bare, { method: 'HEAD', cache: 'no-store' })
    .then((res) => {
      if (!res.ok) return { exists: false, version: null };
      const tag = (res.headers.get('etag') || '').replace(/^W\//, '').replace(/"/g, '');
      const modified = res.headers.get('last-modified');
      return { exists: true, version: tag || (modified ? String(Date.parse(modified)) : null) };
    })
    .catch(() => ({ exists: true, version: null }));
  photoVersions.set(bare, pending);
  return pending;
}

/** Aynı adla yeniden yüklenen fotoğrafın eski hali gelmesin diye adrese Storage sürümü eklenir. */
async function loadVersionedPhoto(url: string): Promise<HTMLImageElement | null> {
  const bare = bareUrl(url);
  const { exists, version } = await fetchPhotoVersion(bare);
  if (!exists) return null;
  const src = version ? withConsultantPhotoVersion(bare, version) : url;
  loadedPhotoUrls.set(bare, src);
  return loadRankImage(src);
}

function photoCandidates(photoUrl: string) {
  return photoUrl.includes(NORMAL_BUCKET_PATH)
    ? [photoUrl.replace(NORMAL_BUCKET_PATH, HIRES_BUCKET_PATH), photoUrl]
    : [photoUrl];
}

/** Önce yüksek çözünürlüklü bucket, yoksa normal fotoğraf. */
export async function loadGirisPhoto(
  photoUrl: string | null
): Promise<{ img: HTMLImageElement; hires: boolean } | null> {
  if (!photoUrl) return null;
  const [first, second] = photoCandidates(photoUrl);
  if (second) {
    const hires = await loadVersionedPhoto(first!);
    if (hires) return { img: hires, hires: true };
  }
  const img = await loadVersionedPhoto(second || first!);
  return img ? { img, hires: false } : null;
}

/** Kişinin fotoğraf, sürüm ve yüz ölçümü önbelleğini temizler; sonraki çizim sunucudan yükler. */
export async function refreshGirisPhoto(photoUrl: string | null): Promise<void> {
  if (!photoUrl) return;
  for (const candidate of photoCandidates(photoUrl)) {
    const bare = bareUrl(candidate);
    const loaded = loadedPhotoUrls.get(bare);
    if (loaded) {
      const img = await loadRankImage(loaded);
      if (img) faceCache.delete(img);
      forgetRankImage(loaded);
      loadedPhotoUrls.delete(bare);
    }
    forgetRankImage(candidate);
    photoVersions.delete(bare);
  }
}

// ---------------------------------------------------------------------------
// Yüz ölçümü
// ---------------------------------------------------------------------------

export type FaceMetrics = { eyeMidX: number; eyeMidY: number; eyeDistance: number };

type Landmarker = {
  detect: (image: HTMLCanvasElement) => {
    faceLandmarks: { x: number; y: number }[][];
  };
};

let landmarkerPromise: Promise<Landmarker> | null = null;

/** MediaPipe WASM'ı bilgi satırlarını console.error'a yazıyor; Next dev bunu hata sanıyor. */
async function withQuietMediapipe<T>(run: () => T | Promise<T>): Promise<T> {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (/^(INFO|W\d{4}|I\d{4})[: ]|XNNPACK|TensorFlow Lite/.test(first)) return;
    original(...args);
  };
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

function getLandmarker(): Promise<Landmarker> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    return (await withQuietMediapipe(() =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      })
    )) as unknown as Landmarker;
  })().catch((error) => {
    landmarkerPromise = null;
    throw error;
  });
  return landmarkerPromise;
}

const LEFT_EYE = [33, 133, 159, 145];
const RIGHT_EYE = [362, 263, 386, 374];
const faceCache = new WeakMap<HTMLImageElement, Promise<FaceMetrics | null>>();

/** Göz merkezleri kaynak görsel pikseli cinsinden döner; yüz yoksa null. */
export function measureFace(img: HTMLImageElement): Promise<FaceMetrics | null> {
  const cached = faceCache.get(img);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const landmarker = await getLandmarker();
      const ratio = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = await withQuietMediapipe(() => landmarker.detect(canvas));
      const points = result.faceLandmarks?.[0];
      if (!points) return null;
      const center = (ids: number[]) => {
        let x = 0;
        let y = 0;
        for (const id of ids) {
          x += points[id]!.x;
          y += points[id]!.y;
        }
        return { x: (x / ids.length) * canvas.width, y: (y / ids.length) * canvas.height };
      };
      const left = center(LEFT_EYE);
      const right = center(RIGHT_EYE);
      return {
        eyeMidX: (left.x + right.x) / 2 / ratio,
        eyeMidY: (left.y + right.y) / 2 / ratio,
        eyeDistance: Math.hypot(right.x - left.x, right.y - left.y) / ratio,
      };
    } catch (error) {
      console.error('Yüz ölçümü başarısız:', error);
      return null;
    }
  })();
  faceCache.set(img, pending);
  return pending;
}

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------

export type GirisPerson = { displayName: string; title: string; photoUrl: string | null };

export type GirisRenderInfo = {
  hasPhoto: boolean;
  faceFound: boolean;
  hires: boolean;
  /** Fotoğrafın baskıdaki etkin çözünürlüğü */
  effectiveDpi: number | null;
};

type Placement = { x: number; y: number; scale: number };

function placePhoto(
  img: HTMLImageElement,
  face: FaceMetrics | null,
  adjust: GirisAdjust
): Placement | null {
  const L = GIRIS_LAYOUT;
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

/** Yumuşak ton penceresi: merkeze yakınken 1, dış sınırda 0 (bant oluşmasın diye kosinüs geçiş). */
function hueWeight(hue: number, center: number, inner: number, outer: number) {
  let d = Math.abs(hue - center) % 360;
  if (d > 180) d = 360 - d;
  if (d <= inner) return 1;
  if (d >= outer) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * (d - inner)) / (outer - inner)));
}

/** ImageData düz (premultiplied olmayan) RGB verir; alfa korunur. */
export function applyColorAdjust(data: Uint8ClampedArray, color: ColorAdjust) {
  const red = color.red / 100;
  const yellow = color.yellow / 100;
  const temp = color.temperature / 50;
  const tint = color.tint / 50;
  const sat = 1 + (color.saturation / 50) * 0.6;
  const bright = (color.brightness / 30) * 0.15;
  const contrast = 1 + (color.contrast / 30) * 0.5;
  const rMul = (1 + 0.1 * temp) * (1 + 0.03 * tint);
  const gMul = (1 + 0.04 * temp) * (1 - 0.08 * tint);
  const bMul = (1 - 0.1 * temp) * (1 + 0.03 * tint);
  const selective = red > 0 || yellow > 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = (data[i]! / 255) * rMul;
    let g = (data[i + 1]! / 255) * gMul;
    let b = (data[i + 2]! / 255) * bMul;

    let keep = sat;
    if (selective) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      if (chroma > 1e-4) {
        let hue: number;
        if (max === r) hue = 60 * (((g - b) / chroma + 6) % 6);
        else if (max === g) hue = 60 * ((b - r) / chroma + 2);
        else hue = 60 * ((r - g) / chroma + 4);
        const wr = red * hueWeight(hue, 5, 15, 40);
        const wy = yellow * hueWeight(hue, 50, 15, 35);
        keep *= (1 - 0.55 * wr) * (1 - 0.5 * wy);
      }
    }

    if (keep !== 1) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * keep;
      g = lum + (g - lum) * keep;
      b = lum + (b - lum) * keep;
    }
    if (bright !== 0) {
      r += bright;
      g += bright;
      b += bright;
    }
    if (contrast !== 1) {
      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;
    }
    data[i] = r * 255;
    data[i + 1] = g * 255;
    data[i + 2] = b * 255;
  }
}

const colorCache = new Map<string, HTMLCanvasElement>();
const COLOR_CACHE_LIMIT = 6;

/** Fotoğrafın çizileceği boyuttaki renk düzeltilmiş kopyası. */
function colorAdjustedPhoto(
  img: HTMLImageElement,
  width: number,
  height: number,
  color: ColorAdjust
): HTMLCanvasElement | null {
  const key = JSON.stringify([img.src, width, height, color]);
  const cached = colorCache.get(key);
  if (cached) {
    colorCache.delete(key);
    colorCache.set(key, cached);
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const cctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!cctx) return null;
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(img, 0, 0, width, height);
  try {
    const imageData = cctx.getImageData(0, 0, width, height);
    applyColorAdjust(imageData.data, color);
    cctx.putImageData(imageData, 0, 0);
  } catch (error) {
    console.error('Renk düzeltme uygulanamadı:', error);
    return null;
  }
  colorCache.set(key, canvas);
  while (colorCache.size > COLOR_CACHE_LIMIT) {
    colorCache.delete(colorCache.keys().next().value!);
  }
  return canvas;
}

function drawPhotoLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  placement: Placement,
  effects: GirisEffects,
  k: number,
  origin: number
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext('2d');
  if (!lctx) return;
  lctx.imageSmoothingQuality = 'high';
  const drawW = img.naturalWidth * placement.scale * k;
  const drawH = img.naturalHeight * placement.scale * k;
  const drawX = (placement.x + origin) * k;
  const drawY = (placement.y + origin) * k;
  const adjusted = isColorAdjustActive(effects.color)
    ? colorAdjustedPhoto(img, Math.max(1, Math.round(drawW)), Math.max(1, Math.round(drawH)), effects.color)
    : null;
  lctx.drawImage(adjusted || img, drawX, drawY, drawW, drawH);

  const { shadow, fade } = effects;
  if (shadow.enabled && shadow.opacity > 0) {
    // Fotoğrafın dışını boyayıp gölgesini şeklin içine düşürüyoruz; ctx.filter
    // Safari'de olmadığından bulanıklık shadowBlur ile veriliyor.
    const inverse = document.createElement('canvas');
    inverse.width = W;
    inverse.height = H;
    const ictx = inverse.getContext('2d');
    if (ictx) {
      ictx.fillStyle = '#000';
      ictx.fillRect(0, 0, W, H);
      ictx.globalCompositeOperation = 'destination-out';
      ictx.drawImage(layer, 0, 0);
      const rad = (shadow.angle * Math.PI) / 180;
      const offX = Math.cos(rad) * shadow.distance * k;
      const offY = Math.sin(rad) * shadow.distance * k;
      const far = W + H + 1000;
      lctx.save();
      lctx.globalCompositeOperation = 'source-atop';
      lctx.globalAlpha = shadow.opacity;
      lctx.shadowColor = shadow.color;
      lctx.shadowBlur = shadow.blur * k;
      lctx.shadowOffsetX = far + offX;
      lctx.shadowOffsetY = offY;
      lctx.drawImage(inverse, -far, 0);
      lctx.restore();
    }
  }

  if (fade.strength > 0) {
    const start = (fade.start + origin) * k;
    const end = (fade.start + FADE_LENGTH + origin) * k;
    lctx.save();
    lctx.globalCompositeOperation = 'destination-out';
    const gradient = lctx.createLinearGradient(0, start, 0, end);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${fade.strength})`);
    lctx.fillStyle = gradient;
    lctx.fillRect(0, start, W, end - start);
    lctx.fillStyle = `rgba(0,0,0,${fade.strength})`;
    lctx.fillRect(0, end, W, H - end);
    lctx.restore();
  }

  ctx.drawImage(layer, 0, 0);
}

function drawTexts(ctx: CanvasRenderingContext2D, name: string, title: string) {
  const L = GIRIS_LAYOUT;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';

  let nameSize: number = L.name.size;
  let nameTrack: number = L.name.tracking;
  ctx.font = `${nameSize}px "${GIRIS_FONTS.name.family}"`;
  const nameWidth = trackedWidth(ctx, name, nameTrack);
  if (nameWidth > L.name.maxWidth) {
    const ratio = Math.max(0.55, L.name.maxWidth / nameWidth);
    nameSize *= ratio;
    nameTrack *= ratio;
    ctx.font = `${nameSize}px "${GIRIS_FONTS.name.family}"`;
  }
  fillTracked(ctx, name, L.name.centerX - trackedWidth(ctx, name, nameTrack) / 2, L.name.baseline, nameTrack);

  ctx.fillStyle = L.rule.color;
  ctx.fillRect(L.rule.centerX - L.rule.width / 2, L.rule.top, L.rule.width, L.rule.thickness);

  if (title) {
    ctx.fillStyle = '#FFFFFF';
    let titleSize: number = L.title.size;
    let titleTrack: number = L.title.tracking;
    ctx.font = `${titleSize}px "${GIRIS_FONTS.title.family}"`;
    const titleWidth = trackedWidth(ctx, title, titleTrack);
    if (titleWidth > L.title.maxWidth) {
      const ratio = Math.max(0.6, L.title.maxWidth / titleWidth);
      titleSize *= ratio;
      titleTrack *= ratio;
      ctx.font = `${titleSize}px "${GIRIS_FONTS.title.family}"`;
    }
    fillTracked(
      ctx,
      title,
      L.title.centerX - trackedWidth(ctx, title, titleTrack) / 2,
      L.title.baseline,
      titleTrack
    );
  }
  ctx.restore();
}

export type GirisRenderOptions = {
  /** Çıktı ölçeği (1 = 2480×3508). Önizlemeler için küçültülür. */
  scale?: number;
  bleed?: boolean;
};

export async function renderGirisVisual(
  person: GirisPerson,
  adjust: GirisAdjust,
  effects: GirisEffects,
  options: GirisRenderOptions = {}
): Promise<{ canvas: HTMLCanvasElement; info: GirisRenderInfo }> {
  const k = options.scale ?? 1;
  const bleed = options.bleed ? GIRIS_BLEED_PX : 0;
  await loadGirisFonts();
  const [photo, logo] = await Promise.all([
    loadGirisPhoto(person.photoUrl),
    loadRankImage(GIRIS_LOGO.url),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round((GIRIS_CANVAS.width + bleed * 2) * k);
  canvas.height = Math.round((GIRIS_CANVAS.height + bleed * 2) * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');
  ctx.fillStyle = GIRIS_LAYOUT.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const info: GirisRenderInfo = {
    hasPhoto: Boolean(photo),
    faceFound: false,
    hires: Boolean(photo?.hires),
    effectiveDpi: null,
  };

  if (photo) {
    const face = await measureFace(photo.img);
    info.faceFound = Boolean(face);
    const placement = placePhoto(photo.img, face, adjust);
    if (placement) {
      info.effectiveDpi = Math.round(GIRIS_DPI / placement.scale);
      drawPhotoLayer(ctx, photo.img, placement, effects, k, bleed);
    }
  }

  ctx.save();
  ctx.scale(k, k);
  ctx.translate(bleed, bleed);
  if (logo) {
    const h = (logo.naturalHeight / logo.naturalWidth) * GIRIS_LOGO.width;
    ctx.drawImage(logo, GIRIS_LOGO.x, GIRIS_LOGO.y, GIRIS_LOGO.width, h);
  }
  drawTexts(ctx, toTurkishUpper(person.displayName), toTurkishUpper(person.title));
  ctx.restore();

  return { canvas, info };
}

export function girisPageSizeMm(bleed: boolean) {
  const extra = bleed ? 6 : 0;
  return { width: 210 + extra, height: 297 + extra };
}
