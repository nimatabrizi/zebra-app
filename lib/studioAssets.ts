/**
 * Zebra Studio — Supabase Storage & display helpers
 */

import {
  resolveConsultantPhotoUrl,
  toStudioDisplayName,
} from './consultantPhotoResolve';
import { toConsultantPhotoSlug, toTitleCaseName } from './formatName';

/** @deprecated Prefer resolveConsultantPhotoUrl with storage inventory */
export function consultantPhotoPublicUrl(fullName: string): string | null {
  return resolveConsultantPhotoUrl(fullName);
}

/** Telefon / numara gösterimi (TR) — arayüz: 0554 911 05 89 */
export function formatStudioPhone(raw: unknown): string {
  if (raw == null) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return String(raw).trim();

  let local = digits;
  if (local.startsWith('90') && local.length >= 12) local = local.slice(2);
  if (local.startsWith('0') && local.length === 11) local = local.slice(1);

  if (local.length === 10) {
    return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
  }
  return String(raw).trim();
}

/** Toplu üretim şablon telefonu: 0 554 911 05 89 */
export function formatBatchPhone(raw: unknown): string {
  if (raw == null) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return String(raw).trim();

  let local = digits;
  if (local.startsWith('90') && local.length >= 12) local = local.slice(2);
  if (local.startsWith('0') && local.length === 11) local = local.slice(1);

  if (local.length === 10) {
    return `0 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
  }
  return String(raw).trim();
}

export type StudioFormat = 'post' | 'story';

export const STUDIO_CANVAS = {
  post: { width: 1080, height: 1080, label: 'Post' },
  story: { width: 1080, height: 1920, label: 'Story' },
} as const;

/** Zebra Studio sosyal medya referans şablonları (4:5 post + 9:16 story). */
export const SOCIAL_STUDIO_CANVAS = {
  post: { width: 1080, height: 1350, label: 'Post' },
  story: { width: 1080, height: 1920, label: 'Story' },
} as const;

/** Satıldı / Kiralandı / Kapora video stüdyosu sabitleri. */
export type StatusVideoKind = 'satildi' | 'kiralandi' | 'kapora';

export const STATUS_VIDEO_DURATION_SEC = 5;
/** Animasyon, videonun başından bu kadar sonra devreye girer. */
export const STATUS_OVERLAY_DELAY_SEC = 0.4;
/** Kaynak animasyon 30 fps; 6. kare = 0.2 sn (00:00:00:06). */
export const STATUS_OVERLAY_START_FRAME = 6;
export const STATUS_OVERLAY_FPS = 30;
export const STATUS_OVERLAY_START_SEC =
  STATUS_OVERLAY_START_FRAME / STATUS_OVERLAY_FPS;

/** Hazırlanan alpha overlay dosyalarının ham çözünürlüğü. */
export const STATUS_OVERLAY_SOURCE_SIZE = {
  width: 1080,
  height: 582,
} as const;

/**
 * Referans Post/Story MP4’lerinden ölçülen yerleşim: rozet kaynak boyutun
 * %77.5’i, saat yönünün tersine 18° eğik ve dikeyde merkezin biraz üstünde.
 */
export const STATUS_OVERLAY_SCALE = 0.775;
export const STATUS_OVERLAY_ROTATION_DEG = -18;
const STATUS_OVERLAY_CENTER_Y_RATIO: Record<StudioFormat, number> = {
  post: 0.4056,
  story: 0.4813,
};

export type StatusOverlayLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
  centerY: number;
  rotationDeg: number;
};

export function statusOverlayLayout(format: StudioFormat): StatusOverlayLayout {
  const canvas = SOCIAL_STUDIO_CANVAS[format];
  const width = Math.round(
    STATUS_OVERLAY_SOURCE_SIZE.width * STATUS_OVERLAY_SCALE
  );
  const height = Math.round(
    STATUS_OVERLAY_SOURCE_SIZE.height * STATUS_OVERLAY_SCALE
  );
  const centerY = Math.round(
    canvas.height * STATUS_OVERLAY_CENTER_Y_RATIO[format]
  );
  return {
    width,
    height,
    left: Math.round((canvas.width - width) / 2),
    top: Math.round(centerY - height / 2),
    centerY,
    rotationDeg: STATUS_OVERLAY_ROTATION_DEG,
  };
}

export const STATUS_VIDEO_OPTIONS = [
  {
    id: 'satildi' as const,
    label: 'Satıldı',
    fileSlug: 'satildi',
    overlayUrl: '/studio/status/satildi.webm',
    overlayHevcUrl: '/studio/status/satildi.mov',
  },
  {
    id: 'kiralandi' as const,
    label: 'Kiralandı',
    fileSlug: 'kiralandi',
    overlayUrl: '/studio/status/kiralandi.webm',
    overlayHevcUrl: '/studio/status/kiralandi.mov',
  },
  {
    id: 'kapora' as const,
    label: 'Kaporası Alındı',
    fileSlug: 'kapora',
    overlayUrl: '/studio/status/kapora.webm',
    overlayHevcUrl: '/studio/status/kapora.mov',
  },
] as const;

/** Safari alpha'yı yalnızca HEVC/hvc1 .mov ile çözer; VP9 alpha siyah kutu verir. */
export const STATUS_OVERLAY_HEVC_MIME = 'video/quicktime; codecs="hvc1"';
export const STATUS_OVERLAY_VP9_MIME = 'video/webm; codecs="vp9"';

export const STATUS_AUDIO_URL = '/studio/status/status-audio.mp3';

/**
 * Studio fontları yüklenmeden yakalanan PNG fallback fontla çıkar;
 * html-to-image çağrılarından önce beklenmeli.
 */
const ZALANDO_FONT_URL = '/fonts/zalando-sans-expanded-600.woff2';
let zalandoEmbedCSS: string | null = null;

/**
 * html-to-image, klonu izole bir SVG foreignObject içinde çizer; sayfadaki
 * fontlara erişemez. Zalando'yu data URL olarak gömmezsek PNG fallback ile çıkar.
 */
export async function studioFontEmbedCSS(): Promise<string> {
  if (zalandoEmbedCSS !== null) return zalandoEmbedCSS;
  try {
    const response = await fetch(ZALANDO_FONT_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    zalandoEmbedCSS = `@font-face{font-family:"Zalando Sans Expanded App";src:url(data:font/woff2;base64,${base64}) format("woff2");font-weight:600;font-style:normal;}`;
  } catch (error) {
    console.warn('Zalando Sans Expanded fontu gömülemedi:', error);
    zalandoEmbedCSS = '';
  }
  return zalandoEmbedCSS;
}

export async function waitForStudioFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'İĞÜŞÖÇ0123';
  // next/font aile adları hash'li; değişkenleri :root üzerinden çöz
  const rootStyle = getComputedStyle(document.documentElement);
  const families = [
    '--font-zalando-expanded',
    '--font-oswald',
  ]
    .map((token) => rootStyle.getPropertyValue(token).trim())
    .filter(Boolean);

  try {
    await Promise.all(
      families.flatMap((family) =>
        ['200', '300', '400', '600', '700'].map((weight) =>
          document.fonts.load(`${weight} 40px ${family}`, sample)
        )
      )
    );
    await document.fonts.ready;
  } catch (error) {
    console.warn('Studio fontları yüklenemedi:', error);
  }
}

export {
  toTitleCaseName,
  toConsultantPhotoSlug,
  toStudioDisplayName,
  resolveConsultantPhotoUrl,
};
