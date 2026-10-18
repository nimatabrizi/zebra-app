/**
 * html-to-image ile DOM → PNG. Safari/iOS foreignObject ilk karede img’leri
 * sık atladığı için kararlı yakalama ve görsel gömme yardımcıları.
 */

import { toPng } from 'html-to-image';

type HtmlToImageOptions = NonNullable<Parameters<typeof toPng>[1]>;

export function isAppleWebKitCapture(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariDesktop =
    /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
  return appleMobile || safariDesktop;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('FileReader'));
    reader.readAsDataURL(blob);
  });
}

export async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return blobToDataUrl(await response.blob());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel yüklenemedi'));
    img.src = src;
  });
}

/**
 * Telefon kamerası data URL’lerini tuval boyutuna indirger; Safari foreignObject
 * çok büyük base64 img’leri sessizce boş bırakır.
 */
export async function downscaleImageSrc(
  src: string,
  maxEdge = 2160
): Promise<string> {
  if (!src) return src;
  try {
    const img = await loadImage(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h || Math.max(w, h) <= maxEdge) {
      await img.decode?.().catch(() => undefined);
      return src;
    }
    const scale = maxEdge / Math.max(w, h);
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    // JPEG yalnızca net JPEG kaynaklarda; danışman silüetleri PNG kalsın.
    const asJpeg =
      src.startsWith('data:image/jpeg') ||
      src.startsWith('data:image/jpg') ||
      /\.jpe?g(\?|$)/i.test(src);
    return asJpeg
      ? canvas.toDataURL('image/jpeg', 0.92)
      : canvas.toDataURL('image/png');
  } catch {
    return src;
  }
}

type ImgBackup = {
  img: HTMLImageElement;
  src: string | null;
  crossOrigin: string | null;
};

type MaskBackup = {
  el: HTMLElement;
  webkitMaskImage: string;
  maskImage: string;
};

export type InlineNodeImagesOptions = {
  /** Mask’i kardeş/ebeveyn img ile senkronlanacak seçiciler. */
  maskSelectors?: string[];
  /** data: URL img’leri bu kenarı aşarsa küçült. */
  maxDataUrlEdge?: number;
  label?: string;
};

/**
 * Dış src’leri data URL’e gömer, büyük data URL’leri küçültür, mask-image’leri
 * gömülü src ile hizalar. Dönüş: geri alma fonksiyonu.
 */
export async function inlineNodeImages(
  node: HTMLElement,
  options: InlineNodeImagesOptions = {}
): Promise<() => void> {
  const {
    maskSelectors = ['[data-photo-gradient]', '[data-badge-photo-mask]'],
    maxDataUrlEdge = 2160,
    label = 'Studio',
  } = options;

  const imgs = Array.from(node.querySelectorAll('img'));
  const imgBackups: ImgBackup[] = imgs.map((img) => ({
    img,
    src: img.getAttribute('src'),
    crossOrigin: img.getAttribute('crossorigin'),
  }));

  await Promise.all(
    imgs.map(async (img) => {
      let src = img.currentSrc || img.src;
      if (!src) return;
      try {
        if (!src.startsWith('data:')) {
          src = await urlToDataUrl(src);
        }
        if (src.startsWith('data:') && maxDataUrlEdge > 0) {
          src = await downscaleImageSrc(src, maxDataUrlEdge);
        }
        img.removeAttribute('crossorigin');
        if (img.getAttribute('src') !== src) img.src = src;
        await img.decode().catch(() => undefined);
      } catch (error) {
        console.warn(`${label} görseli gömülemedi:`, src, error);
      }
    })
  );

  const maskEls = new Set<HTMLElement>();
  for (const selector of maskSelectors) {
    node.querySelectorAll<HTMLElement>(selector).forEach((el) => maskEls.add(el));
  }
  const maskBackups: MaskBackup[] = [];
  for (const el of maskEls) {
    maskBackups.push({
      el,
      webkitMaskImage: el.style.webkitMaskImage,
      maskImage: el.style.maskImage,
    });
    const img = el.parentElement?.querySelector('img');
    const src = img?.currentSrc || img?.src;
    if (!src) continue;
    el.style.webkitMaskImage = `url("${src}")`;
    el.style.maskImage = `url("${src}")`;
  }

  return () => {
    for (const { img, src, crossOrigin } of imgBackups) {
      if (src == null) img.removeAttribute('src');
      else img.setAttribute('src', src);
      if (crossOrigin == null) img.removeAttribute('crossorigin');
      else img.setAttribute('crossorigin', crossOrigin);
    }
    for (const { el, webkitMaskImage, maskImage } of maskBackups) {
      el.style.webkitMaskImage = webkitMaskImage;
      el.style.maskImage = maskImage;
    }
  };
}

/**
 * Safari/iOS: ilk toPng çağrısı img’siz (kısa) data URL döner; uzunluk
 * sabitleşene kadar tekrarlar.
 */
export async function toPngStable(
  node: HTMLElement,
  options?: HtmlToImageOptions
): Promise<string> {
  const apple = isAppleWebKitCapture();
  const maxAttempts = apple ? 8 : 1;
  let previous = '';
  let dataUrl = '';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    dataUrl = await toPng(node, options);
    if (!dataUrl || dataUrl === 'data:,') {
      previous = dataUrl || '';
      continue;
    }
    if (!apple) break;
    // Safari: uzunluk artmayı bırakınca WebKit img’leri çizmiş demektir.
    if (attempt > 0 && dataUrl.length <= previous.length) break;
    previous = dataUrl;
  }

  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('Görsel üretilemedi');
  }
  return dataUrl;
}
