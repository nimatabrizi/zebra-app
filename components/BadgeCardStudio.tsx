'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { getFontEmbedCSS, toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Check,
  Download,
  IdCard,
  ImageOff,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  normalizeAppRole,
  roleLabel,
  type AppRole,
} from '../lib/authIdentity';
import {
  BADGE_ASSETS,
  BADGE_CARD,
  BADGE_LAYOUT,
  BADGE_LOCATION_COLOR,
  badgeLocationLabel,
  badgeNameParts,
} from '../lib/badgeCard';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { toTurkishUpper } from '../lib/formatName';
import {
  resolveConsultantPhotoUrl,
  studioFontEmbedCSS,
  toStudioDisplayName,
  waitForStudioFonts,
} from '../lib/studioAssets';
import { applyColorAdjust, DEFAULT_GIRIS_COLOR } from '../lib/girisVisuals';
import PasteListModal from './PasteListModal';
import { AdjustSaveActions, useUnsavedChangesGuard } from './AdjustSaveControls';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';

const PASTE_LIST_STORAGE_KEY = 'zebra-yaka-karti-paste-list-v1';

type BadgePerson = {
  id: string;
  rawName: string;
  displayName: string;
  title: string;
  location: string;
  role: string;
  photoUrl: string | null;
};

/** Otomatik yerleşimin üzerine: ölçek çarpanı + kart pikseli cinsinden kaydırma */
type BadgeAdjust = {
  scale: number;
  dx: number;
  dy: number;
  /** Kırmızılık azaltma, 0–100 */
  red?: number;
};

const DEFAULT_BADGE_ADJUST: BadgeAdjust = { scale: 1, dx: 0, dy: 0 };
const ADJUST_STORAGE_KEY = 'zebra-yaka-karti-photo-adjust-v1';
const OFFSET_LIMIT = 1200;

function isManualPlacement(adjust: BadgeAdjust) {
  return adjust.scale !== 1 || adjust.dx !== 0 || adjust.dy !== 0;
}

const colorPhotoCache = new Map<string, Promise<string | null>>();
const COLOR_PHOTO_CACHE_LIMIT = 16;

/** Kırmızılığı azaltılmış fotoğrafın object URL'si (alfa korunur). */
function colorAdjustedPhotoUrl(src: string, red: number): Promise<string | null> {
  const key = `${src}|${red}`;
  const cached = colorPhotoCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const img = await loadCrossOriginImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyColorAdjust(imageData.data, { ...DEFAULT_GIRIS_COLOR, red });
      ctx.putImageData(imageData, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? URL.createObjectURL(blob) : null;
    } catch (error) {
      console.error('Yaka kartı renk düzeltmesi uygulanamadı:', error);
      return null;
    }
  })();
  colorPhotoCache.set(key, pending);
  while (colorPhotoCache.size > COLOR_PHOTO_CACHE_LIMIT) {
    const oldest = colorPhotoCache.keys().next().value!;
    void colorPhotoCache.get(oldest)?.then((url) => url && setTimeout(() => URL.revokeObjectURL(url), 30000));
    colorPhotoCache.delete(oldest);
  }
  return pending;
}

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
}

type RoleFilter = 'all' | 'danisman' | 'personel';

const ROLE_FILTERS: { id: RoleFilter; label: string }[] = [
  { id: 'all', label: 'Tüm kullanıcılar' },
  { id: 'danisman', label: 'Danışman' },
  { id: 'personel', label: 'Personel' },
];

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function inlineNodeImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll('img'));
  const backups = imgs.map((img) => ({
    img,
    src: img.getAttribute('src'),
    crossOrigin: img.getAttribute('crossorigin'),
  }));

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith('data:')) {
        await img.decode().catch(() => undefined);
        return;
      }
      try {
        const response = await fetch(src, { mode: 'cors', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(reader.error || new Error('FileReader'));
          reader.readAsDataURL(blob);
        });
        img.removeAttribute('crossorigin');
        img.src = dataUrl;
        await img.decode().catch(() => undefined);
      } catch (error) {
        console.warn('Yaka kartı görseli gömülemedi:', src, error);
      }
    })
  );

  return () => {
    for (const { img, src, crossOrigin } of backups) {
      if (src == null) img.removeAttribute('src');
      else img.setAttribute('src', src);
      if (crossOrigin == null) img.removeAttribute('crossorigin');
      else img.setAttribute('crossorigin', crossOrigin);
    }
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('FileReader'));
    reader.readAsDataURL(blob);
  });
}

function matchesRoleFilter(role: string, filter: RoleFilter): boolean {
  const normalized = normalizeAppRole(role);
  if (filter === 'all') return true;
  if (filter === 'danisman') return normalized === 'danisman';
  return normalized === 'personel';
}

type OpaqueBounds = {
  srcW: number;
  srcH: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Surat merkezi ve genişliği (kaynak PNG pikseli). */
  faceX: number;
  faceY: number;
  faceW: number;
  faceH: number;
};

const opaqueBoundsCache = new Map<string, Promise<OpaqueBounds | null>>();

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('photo-load'));
    img.src = src;
  });
}

function isLikelySkin(r: number, g: number, b: number, a: number): boolean {
  if (a < 24) return false;
  if (r < 50 || g < 25 || b < 15) return false;
  // Sarı/kumral saç: R≈G ve B çok düşük — yüz teni değil.
  if (r > 140 && g > 120 && r - g < 28 && g - b > 48) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 10) return false;
  return r >= g - 6 && r >= b && r - b >= 8;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function findFaceCenter(
  data: Uint8ClampedArray,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): { faceX: number; faceY: number; faceW: number; faceH: number } {
  const bodyH = Math.max(1, maxY - minY + 1);
  const fallback = {
    faceX: (minX + maxX) / 2,
    faceY: minY + bodyH * 0.18,
    faceW: Math.max(8, (maxX - minX + 1) * 0.4),
    faceH: bodyH * 0.28,
  };
  const rows: { y: number; left: number; right: number; mid: number; w: number }[] = [];
  const yEnd = minY + Math.floor(bodyH * 0.42);
  for (let y = minY; y <= yEnd; y += 1) {
    const row = y * width * 4;
    let left = -1;
    let right = -1;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[row + x * 4 + 3] > 16) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left < 0 || right - left < 10) continue;
    rows.push({
      y,
      left,
      right,
      mid: (left + right) / 2,
      w: right - left + 1,
    });
  }

  if (!rows.length) return fallback;

  const early = rows.slice(
    Math.floor(rows.length * 0.06),
    Math.max(Math.floor(rows.length * 0.22), 8)
  );
  const headW = median(early.map((row) => row.w)) || median(rows.map((row) => row.w));
  const headRows: typeof rows = [];
  for (const row of rows) {
    if (row.w > headW * 1.72) break;
    headRows.push(row);
  }
  const usable = headRows.length > 12 ? headRows : rows;
  const bandStart = Math.floor(usable.length * 0.28);
  const bandEnd = Math.max(Math.floor(usable.length * 0.72), bandStart + 1);
  const band = usable.slice(bandStart, bandEnd);
  if (!band.length) return fallback;
  const bandTop = band[0]?.y ?? minY;
  const bandBottom = band[band.length - 1]?.y ?? minY + Math.floor(bodyH * 0.2);
  const bandLeft = Math.min(...band.map((row) => row.left));
  const bandRight = Math.max(...band.map((row) => row.right));
  const inset = Math.round((bandRight - bandLeft) * 0.08);
  let skinX = 0;
  let skinY = 0;
  let skinN = 0;
  const skinWidths: number[] = [];
  for (let y = bandTop; y <= bandBottom; y += 1) {
    const row = y * width * 4;
    let skinLeft = -1;
    let skinRight = -1;
    for (let x = bandLeft + inset; x <= bandRight - inset; x += 1) {
      const i = row + x * 4;
      if (!isLikelySkin(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      if (skinLeft < 0) skinLeft = x;
      skinRight = x;
      skinX += x;
      skinY += y;
      skinN += 1;
    }
    if (skinLeft >= 0 && skinRight - skinLeft >= 8) {
      skinWidths.push(skinRight - skinLeft + 1);
    }
  }

  const hairW = median(band.map((row) => row.w));
  const skinW = skinWidths.length >= 6 ? median(skinWidths) : 0;
  const faceW = Math.max(8, skinW > 8 ? skinW : hairW * 0.58);
  const faceH = Math.max(
    8,
    (usable[usable.length - 1]?.y ?? band[band.length - 1]!.y) -
      (usable[0]?.y ?? band[0]!.y) +
      1
  );
  const geoX =
    band.reduce((sum, row) => sum + row.mid, 0) / Math.max(band.length, 1);
  const geoY =
    band.reduce((sum, row) => sum + row.y, 0) / Math.max(band.length, 1);

  if (skinN > 80) {
    return { faceX: skinX / skinN, faceY: skinY / skinN, faceW, faceH };
  }
  return { faceX: geoX, faceY: geoY, faceW, faceH };
}

async function detectFaceWithBrowser(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<{ faceX: number; faceY: number; faceW: number; faceH: number } | null> {
  const Detector = (
    window as Window & {
      FaceDetector?: new (opts?: {
        fastMode?: boolean;
        maxDetectedFaces?: number;
      }) => {
        detect: (
          input: ImageBitmapSource
        ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
      };
    }
  ).FaceDetector;
  if (typeof Detector !== 'function') return null;
  try {
    const faces = await new Detector({
      fastMode: true,
      maxDetectedFaces: 1,
    }).detect(source);
    const box = faces[0]?.boundingBox;
    if (!box || box.width < 8 || box.height < 8) return null;
    return {
      faceX: box.x + box.width / 2,
      faceY: box.y + box.height / 2,
      faceW: box.width,
      faceH: box.height,
    };
  } catch {
    return null;
  }
}

/** Ölçümler ana thread'i kilitlemesin diye birer birer yapılır. */
let measureQueue: Promise<unknown> = Promise.resolve();

function measureOpaqueBounds(src: string): Promise<OpaqueBounds | null> {
  const cached = opaqueBoundsCache.get(src);
  if (cached) return cached;
  const pending = measureQueue.then(() => measureOpaqueBoundsNow(src));
  measureQueue = pending.catch(() => undefined);
  opaqueBoundsCache.set(src, pending);
  return pending;
}

function measureOpaqueBoundsNow(src: string): Promise<OpaqueBounds | null> {
  return (async () => {
    try {
      const img = await loadCrossOriginImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < height; y += 1) {
        const row = y * width * 4;
        for (let x = 0; x < width; x += 1) {
          if (data[row + x * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX) return null;
      const silhouetteW = maxX - minX + 1;
      const silhouette = findFaceCenter(data, width, minX, minY, maxX, maxY);
      const detected = await detectFaceWithBrowser(canvas);
      const useDetected =
        Boolean(detected) &&
        detected!.faceX >= minX &&
        detected!.faceX <= maxX &&
        detected!.faceY >= minY &&
        detected!.faceY <= minY + (maxY - minY) * 0.55 &&
        detected!.faceW >= 8 &&
        detected!.faceW <= silhouette.faceW * 1.35;
      const rawFaceW = useDetected ? detected!.faceW : silhouette.faceW;
      const minFaceW = silhouetteW * 0.28;
      return {
        srcW: width,
        srcH: height,
        x: minX,
        y: minY,
        w: silhouetteW,
        h: maxY - minY + 1,
        faceX: useDetected ? detected!.faceX : silhouette.faceX,
        faceY: useDetected ? detected!.faceY : silhouette.faceY,
        faceW: Math.max(8, Math.max(rawFaceW, minFaceW)),
        faceH: Math.max(
          8,
          useDetected ? detected!.faceH : silhouette.faceH
        ),
      };
    } catch {
      return null;
    }
  })();
}

function BadgeFace({
  person,
  photoFailed,
  onPhotoError,
  adjust = DEFAULT_BADGE_ADJUST,
}: {
  person: BadgePerson | null;
  photoFailed?: boolean;
  onPhotoError?: () => void;
  adjust?: BadgeAdjust;
}) {
  const { given, family } = badgeNameParts(person?.displayName || '');
  const title = toTurkishUpper(
    person?.title || 'Gayrimenkul Danışmanı'
  );
  const location = person?.location || 'İZMİR / TÜRKİYE';
  const photoSrc = person?.photoUrl && !photoFailed ? person.photoUrl : null;
  const layout = BADGE_LAYOUT;
  const nameRef = useRef<HTMLParagraphElement>(null);
  const [photoBounds, setPhotoBounds] = useState<OpaqueBounds | null>(null);
  const [photoFitReady, setPhotoFitReady] = useState(!photoSrc);

  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const maxWidth = BADGE_CARD.widthPx * 0.9;
    el.style.fontSize = `${layout.name.fontSize}px`;
    const width = el.offsetWidth;
    el.style.fontSize =
      width > maxWidth
        ? `${layout.name.fontSize * (maxWidth / width)}px`
        : `${layout.name.fontSize}px`;
  }, [given, family, layout.name.fontSize]);

  useEffect(() => {
    if (!photoSrc) {
      setPhotoBounds(null);
      setPhotoFitReady(true);
      return;
    }
    let cancelled = false;
    setPhotoFitReady(false);
    measureOpaqueBounds(photoSrc).then((bounds) => {
      if (cancelled) return;
      setPhotoBounds(bounds);
      setPhotoFitReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [photoSrc]);

  const red = adjust.red ?? 0;
  const colorKey = photoSrc && red > 0 ? `${photoSrc}|${red}` : '';
  const [colorPhoto, setColorPhoto] = useState<{ key: string; url: string | null }>({ key: '', url: null });

  useEffect(() => {
    if (!photoSrc || red <= 0) return;
    const key = `${photoSrc}|${red}`;
    let cancelled = false;
    const timer = setTimeout(() => {
      void colorAdjustedPhotoUrl(photoSrc, red).then((url) => {
        if (!cancelled) setColorPhoto({ key, url });
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [photoSrc, red]);

  const colorReady = !colorKey || colorPhoto.key === colorKey;
  // Slider sürüklenirken yeni sürüm hazırlanana kadar son düzeltilmiş hal gösterilir.
  const displaySrc =
    colorKey && colorPhoto.url && colorPhoto.key.startsWith(`${photoSrc}|`) ? colorPhoto.url : photoSrc;

  const manualAdjust = isManualPlacement(adjust);
  const photoScale = photoBounds
    ? (layout.photo.targetWidth / Math.max(8, photoBounds.w)) * adjust.scale
    : 1;
  const photoBoxHeight = layout.photo.clipBottom;
  const photoDrawW = photoBounds ? photoBounds.srcW * photoScale : undefined;
  const photoDrawH = photoBounds ? photoBounds.srcH * photoScale : undefined;
  const photoDrawX = photoBounds
    ? BADGE_CARD.widthPx / 2 - photoBounds.faceX * photoScale + adjust.dx
    : 0;
  const basePhotoDrawY = photoBounds
    ? layout.photo.faceCenterY - photoBounds.faceY * photoScale + adjust.dy
    : 0;
  const minPhotoTop =
    layout.logoBlue.top + layout.logoBlue.height + layout.photo.logoGap;
  const photoDrawY = photoBounds
    ? manualAdjust
      ? basePhotoDrawY
      : Math.max(basePhotoDrawY, minPhotoTop - photoBounds.y * photoScale)
    : 0;

  return (
    <div
      className="relative overflow-hidden bg-[#E8E8E8] text-white"
      data-theme-locked="dark"
      style={{
        width: BADGE_CARD.widthPx,
        height: BADGE_CARD.heightPx,
        fontFamily:
          'var(--font-oswald), var(--font-zalando-expanded), sans-serif',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={{ height: layout.solidTop }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BADGE_ASSETS.folkart}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-right"
          draggable={false}
        />
      </div>

      <div
        className="absolute inset-x-0 z-[1] bg-black"
        style={{ top: layout.solidTop, bottom: 0 }}
      />

      <div
        className="absolute inset-x-0 z-[2] bg-black"
        style={{ top: layout.barTop, height: layout.barHeight }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BADGE_ASSETS.logoBlue}
        alt=""
        className="absolute z-[5] object-contain"
        style={{
          top: layout.logoBlue.top,
          left: '50%',
          width: layout.logoBlue.width,
          height: layout.logoBlue.height,
          transform: 'translateX(-50%)',
        }}
        draggable={false}
      />

      {photoSrc ? (
        <div
          className="absolute z-[4] overflow-hidden"
          data-photo-fit={photoFitReady && colorReady ? 'ready' : 'pending'}
          style={{
            top: 0,
            left: 0,
            width: BADGE_CARD.widthPx,
            height: photoBounds ? photoBoxHeight : 1700,
          }}
        >
          {photoFitReady ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc!}
                alt=""
                crossOrigin="anonymous"
                className="absolute max-w-none"
                style={
                  photoBounds
                    ? {
                        width: photoDrawW,
                        height: photoDrawH,
                        left: photoDrawX,
                        top: photoDrawY,
                      }
                    : { width: '100%', height: 'auto', left: 0, top: 0 }
                }
                draggable={false}
                onError={onPhotoError}
              />
              <div
                data-badge-photo-mask
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to top, #000 0%, rgba(0,0,0,.78) 12%, rgba(0,0,0,.28) 20%, rgba(0,0,0,0) 30%)',
                  WebkitMaskImage: `url("${displaySrc}")`,
                  maskImage: `url("${displaySrc}")`,
                  maskMode: 'alpha',
                  WebkitMaskSize: photoBounds
                    ? `${photoDrawW}px ${photoDrawH}px`
                    : '100% auto',
                  maskSize: photoBounds
                    ? `${photoDrawW}px ${photoDrawH}px`
                    : '100% auto',
                  WebkitMaskPosition: photoBounds
                    ? `${photoDrawX}px ${photoDrawY}px`
                    : 'center top',
                  maskPosition: photoBounds
                    ? `${photoDrawX}px ${photoDrawY}px`
                    : 'center top',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <p
        ref={nameRef}
        className="absolute z-[6] whitespace-nowrap text-center leading-none"
        style={{
          top: layout.name.top,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-oswald), sans-serif',
          fontSize: layout.name.fontSize,
          letterSpacing: layout.name.letterSpacing,
        }}
      >
        {given ? <span style={{ fontWeight: 200 }}>{given} </span> : null}
        <span style={{ fontWeight: 700 }}>{family || 'DANIŞMAN'}</span>
      </p>

      <div
        className="absolute left-1/2 z-[6] -translate-x-1/2 bg-white"
        style={{
          top: layout.line1Top,
          width: layout.line.width,
          height: layout.line.height,
        }}
      />

      <div
        className="absolute inset-x-0 z-[6] flex items-center justify-center"
        style={{
          top: layout.line1Top + layout.line.height,
          height: layout.line2Top - layout.line1Top - layout.line.height,
        }}
      >
        <p
          className="text-center leading-none"
          style={{
            fontFamily: 'var(--font-zalando-expanded), sans-serif',
            fontWeight: 600,
            fontSize: layout.title.fontSize,
            letterSpacing: layout.title.letterSpacing,
          }}
        >
          {title}
        </p>
      </div>

      <div
        className="absolute left-1/2 z-[6] -translate-x-1/2 bg-white"
        style={{
          top: layout.line2Top,
          width: layout.line.width,
          height: layout.line.height,
        }}
      />

      <p
        className="absolute inset-x-0 z-[6] text-center leading-none"
        style={{
          top: layout.location.top,
          fontFamily: 'var(--font-oswald), sans-serif',
          fontWeight: 600,
          fontSize: layout.location.fontSize,
          letterSpacing: layout.location.letterSpacing,
          color: BADGE_LOCATION_COLOR,
        }}
      >
        {location}
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BADGE_ASSETS.group}
        alt=""
        className="absolute z-[6] object-contain"
        style={{
          top: layout.group.top,
          left: '50%',
          width: layout.group.width,
          height: layout.group.height,
          transform: 'translateX(-50%)',
        }}
        draggable={false}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BADGE_ASSETS.motto}
        alt=""
        className="absolute z-[6] object-contain"
        style={{
          top: layout.motto.top,
          left: '50%',
          width: layout.motto.width,
          height: layout.motto.height,
          transform: 'translateX(-50%)',
        }}
        draggable={false}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BADGE_ASSETS.logoWhite}
        alt=""
        className="absolute z-[6] object-contain"
        style={{
          top: layout.logoWhite.top,
          left: '50%',
          width: layout.logoWhite.width,
          height: layout.logoWhite.height,
          transform: 'translateX(-50%)',
        }}
        draggable={false}
      />
    </div>
  );
}

/** BadgeFace'i kapsayıcı genişliğine ölçekler; lazy ise ekrana girene kadar çizmez. */
function ScaledBadge({
  person,
  adjust,
  lazy = false,
  onPhotoFailed,
}: {
  person: BadgePerson;
  adjust: BadgeAdjust;
  lazy?: boolean;
  onPhotoFailed?: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [seen, setSeen] = useState(!lazy);
  const [failedSrc, setFailedSrc] = useState('');

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      const width = frame.clientWidth;
      if (width > 0) setScale(width / BADGE_CARD.widthPx);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (seen) return;
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [seen]);

  const failed = Boolean(person.photoUrl) && failedSrc === person.photoUrl;

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: `${BADGE_CARD.widthMm} / ${BADGE_CARD.heightMm}` }}
    >
      {scale > 0 && seen ? (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <BadgeFace
            person={person}
            adjust={adjust}
            photoFailed={failed}
            onPhotoError={() => {
              setFailedSrc(person.photoUrl || '');
              onPhotoFailed?.();
            }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      )}
    </div>
  );
}

function BadgeThumb({
  person,
  adjust,
  busy,
  disabled,
  onAdjust,
  onPdf,
}: {
  person: BadgePerson;
  adjust: BadgeAdjust;
  busy: boolean;
  disabled: boolean;
  onAdjust: () => void;
  onPdf: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <article className="z-list-card overflow-hidden p-2.5">
      <div className="relative overflow-hidden rounded-[1rem]">
        <ScaledBadge person={person} adjust={adjust} lazy onPhotoFailed={() => setPhotoFailed(true)} />
        {!person.photoUrl || photoFailed ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-medium text-amber-300">
            <ImageOff className="h-3 w-3" /> Fotoğraf yok
          </span>
        ) : null}
      </div>
      <div className="px-1.5 pb-1 pt-3">
        <p className="truncate text-[13px] font-medium text-white">{person.displayName}</p>
        <p className="mt-0.5 truncate text-[11px] text-[#86868B]">{person.title}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onPdf}
            disabled={disabled}
            className="z-btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[12px] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </button>
          <button
            type="button"
            onClick={onAdjust}
            className="z-btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[12px]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Ayarla
          </button>
        </div>
      </div>
    </article>
  );
}

function AdjustSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="flex justify-between text-[12px] text-[#86868B]">
        <span>{label}</span>
        <span className="tabular-nums text-white">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-white"
      />
    </label>
  );
}

export default function BadgeCardStudio({ canSave = false }: { canSave?: boolean }) {
  const [people, setPeople] = useState<BadgePerson[]>([]);
  const [photoSlugs, setPhotoSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [brokenPhoto, setBrokenPhoto] = useState('');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [previewScale, setPreviewScale] = useState(0.28);
  // Bu component sekme değişince ekranda görünmezken de mount kalıyor.
  // Yüz hizalama (photoBounds ölçümü) ana thread'i meşgul ediyor; görünmezken bunu kapatıyoruz.
  const [isBadgeCardVisible, setIsBadgeCardVisible] = useState(false);
  const [exportPerson, setExportPerson] = useState<BadgePerson | null>(null);
  const [exportPhotoBroken, setExportPhotoBroken] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const {
    saved: adjustments,
    save: saveAdjust,
    remove: removeAdjust,
  } = useSavedAdjustments<BadgeAdjust>('yaka-karti', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });
  const [editing, setEditing] = useState<BadgePerson | null>(null);
  const [draftAdjust, setDraftAdjust] = useState<BadgeAdjust>(DEFAULT_BADGE_ADJUST);
  const [busyId, setBusyId] = useState('');
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: BadgeAdjust } | null>(null);

  const adjustFor = (id: string) => adjustments[id] || DEFAULT_BADGE_ADJUST;

  const previewFrameRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from('consultant-photos')
        .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (cancelled) return;
      if (error) {
        setPhotoSlugs([]);
        return;
      }
      setPhotoSlugs(
        (data || [])
          .map((file) => String(file.name || '').replace(/\.png$/i, ''))
          .filter(Boolean)
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('tam_isim', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Yaka kartı kullanıcı listesi:', error.message);
        setPeople([]);
        setLoading(false);
        return;
      }
      const rows: BadgePerson[] = (data || [])
        .map((row) => {
          const record = row as Record<string, unknown>;
          const rawName = String(record.tam_isim || '')
            .normalize('NFC')
            .trim();
          if (!rawName) return null;
          const role = String(record.role || '');
          const unvan = String(record.unvan || '').trim();
          const title =
            unvan ||
            (normalizeAppRole(role) === 'danisman'
              ? resolveConsultantTitle(rawName, null)
              : roleLabel(role));
          return {
            id: String(record.id || rawName),
            rawName,
            displayName: toStudioDisplayName(rawName),
            title,
            location: badgeLocationLabel(
              record.ofis as string | null,
              record.sube as string | null
            ),
            role,
            photoUrl: resolveConsultantPhotoUrl(rawName, photoSlugs),
          };
        })
        .filter(Boolean) as BadgePerson[];
      setPeople(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [photoSlugs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR');
    return people.filter((person) => {
      if (!matchesRoleFilter(person.role, roleFilter)) return false;
      if (!needle) return true;
      return `${person.displayName} ${person.title} ${roleLabel(person.role)}`
        .toLocaleLowerCase('tr-TR')
        .includes(needle);
    });
  }, [people, query, roleFilter]);

  const displayedPeople = useMemo(() => {
    if (!showSelectedOnly) return filtered;
    const selected = new Set(selectedIds);
    return filtered.filter((person) => selected.has(person.id));
  }, [filtered, showSelectedOnly, selectedIds]);

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedIds.includes(person.id)),
    [people, selectedIds]
  );

  const previewPerson = selectedPeople[0] || filtered[0] || null;

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return;
    const update = () => {
      const width = frame.clientWidth;
      if (width > 0) setPreviewScale(Math.min(1, width / BADGE_CARD.widthPx));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // threshold'larla kıvranmasın diye ufak bir eşiğe bağladık.
        setIsBadgeCardVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio > 0.01));
      },
      { threshold: [0, 0.01, 0.05, 0.1] }
    );
    io.observe(frame);
    return () => io.disconnect();
  }, []);

  const toggleId = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const toggleFiltered = () => {
    const ids = displayedPeople.map((person) => person.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : Array.from(new Set([...current, ...ids]))
    );
  };

  const clearSelected = () => {
    setSelectedIds([]);
    setShowSelectedOnly(false);
  };

  const reloadPeople = () => {
    opaqueBoundsCache.clear();
    setBrokenPhoto('');
    setReloadToken((value) => value + 1);
  };

  const openEditor = (person: BadgePerson) => {
    setDraftAdjust(adjustFor(person.id));
    setEditing(person);
  };

  const closeEditor = () => setEditing(null);

  const dirty = Boolean(canSave && editing && !sameAdjust(draftAdjust, adjustFor(editing.id)));
  const saveDraft = async () => {
    if (editing) await saveAdjust(editing.id, draftAdjust);
  };
  const { requestClose, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    onSave: saveDraft,
    onClose: closeEditor,
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: draftAdjust,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const ratio = BADGE_CARD.widthPx / Math.max(1, event.currentTarget.getBoundingClientRect().width);
    setDraftAdjust({
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const pastePeople = useMemo(
    () => people.map((person) => ({ key: person.id, name: person.rawName, displayName: person.displayName })),
    [people]
  );

  const applyPastedList = (ids: string[], mode: 'add' | 'replace') =>
    setSelectedIds((current) => (mode === 'replace' ? ids : Array.from(new Set([...current, ...ids]))));

  const capturePerson = async (person: BadgePerson): Promise<Blob> => {
    flushSync(() => {
      setExportPerson(person);
      setExportPhotoBroken(false);
    });
    await waitForStudioFonts();
    await waitForPaint();
    const node = exportCanvasRef.current;
    if (!node) throw new Error('Yaka kartı tuvali bulunamadı');
    for (let waited = 0; waited < 8000; waited += 40) {
      const fit = node
        .querySelector('[data-photo-fit]')
        ?.getAttribute('data-photo-fit');
      if (fit === 'ready' || fit === 'none') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await waitForPaint();
    const restore = await inlineNodeImages(node);
    node.querySelectorAll<HTMLElement>('[data-badge-photo-mask]').forEach((overlay) => {
      const photo = overlay.parentElement?.querySelector('img');
      const src = photo?.currentSrc || photo?.src;
      if (!src) return;
      overlay.style.webkitMaskImage = `url("${src}")`;
      overlay.style.maskImage = `url("${src}")`;
    });
    try {
      const extraFontCSS = await studioFontEmbedCSS();
      const baseFontCSS = await getFontEmbedCSS(node);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 1,
        width: BADGE_CARD.widthPx,
        height: BADGE_CARD.heightPx,
        skipFonts: false,
        fontEmbedCSS: `${baseFontCSS}\n${extraFontCSS}`,
        style: {
          transform: 'none',
          width: `${BADGE_CARD.widthPx}px`,
          height: `${BADGE_CARD.heightPx}px`,
        },
      });
      if (!dataUrl || dataUrl === 'data:,') {
        throw new Error('Yaka kartı görseli üretilemedi');
      }
      return await (await fetch(dataUrl)).blob();
    } finally {
      restore();
    }
  };

  const downloadPdf = async (only?: BadgePerson) => {
    if (exporting) return;
    const targets = only
      ? [only]
      : selectedPeople.length
        ? selectedPeople
        : previewPerson
          ? [previewPerson]
          : [];
    if (!targets.length) {
      window.alert('Önce en az bir kullanıcı seçin.');
      return;
    }
    setExporting(true);
    setProgress({ current: 0, total: targets.length });
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [BADGE_CARD.widthMm, BADGE_CARD.heightMm],
        compress: true,
      });
      for (let index = 0; index < targets.length; index += 1) {
        const person = targets[index]!;
        setProgress({ current: index + 1, total: targets.length });
        const blob = await capturePerson(person);
        const dataUrl = await blobToDataUrl(blob);
        if (index > 0) {
          pdf.addPage([BADGE_CARD.widthMm, BADGE_CARD.heightMm], 'portrait');
        }
        pdf.addImage(
          dataUrl,
          'PNG',
          0,
          0,
          BADGE_CARD.widthMm,
          BADGE_CARD.heightMm,
          undefined,
          'FAST'
        );
      }
      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(
        targets.length === 1
          ? `yaka-karti-${targets[0]!.rawName.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')}.pdf`
          : `zebra-yaka-kartlari-${stamp}.pdf`
      );
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error ? error.message : 'PDF oluşturulamadı'
      );
    } finally {
      flushSync(() => setExportPerson(null));
      setExporting(false);
      setProgress(null);
      setBusyId('');
    }
  };

  const downloadOne = (person: BadgePerson) => {
    setBusyId(person.id);
    void downloadPdf(person);
  };

  const filteredAllSelected =
    displayedPeople.length > 0 &&
    displayedPeople.every((person) => selectedIds.includes(person.id));

  return (
    <div className="panel-enter w-full">
      <div className="mb-10 lg:mb-14">
        <p className="mb-2 z-page-kicker">
          Zebra Studio
        </p>
        <h1 className="text-2xl font-medium tracking-tight text-white sm:text-3xl">
          Yaka Kartı
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#86868B]">
          Kullanıcı seçin; örnekle aynı boyutta (80 × 125 mm) dikey PDF üretilir.
          Birden fazla kişi tek dosyada, kişi başına bir sayfa.
        </p>
      </div>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="z-card p-4 backdrop-blur-xl sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {ROLE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setRoleFilter(filter.id)}
                className={`h-9 rounded-full px-3.5 text-[12px] font-medium ${
                  roleFilter === filter.id
                    ? 'bg-white text-black'
                    : 'border border-white/10 text-[#AEAEB2] hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#636366]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="İsim veya unvan ara"
              className="z-field h-11 pl-10 pr-3 text-[14px]"
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12px] text-[#86868B]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={toggleFiltered}
                className="font-medium text-[#AEAEB2] hover:text-white"
              >
                {filteredAllSelected ? 'Görünenleri kaldır' : 'Görünenlerin tümünü seç'}
              </button>
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                disabled={loading}
                className="inline-flex items-center gap-1 font-medium text-[#AEAEB2] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ListChecks className="h-3.5 w-3.5" /> Listeden seç
              </button>
              <button
                type="button"
                onClick={clearSelected}
                disabled={selectedIds.length === 0}
                className="font-medium text-[#AEAEB2] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Seçilenleri sil
              </button>
              <button
                type="button"
                onClick={() => setShowSelectedOnly((current) => !current)}
                disabled={selectedIds.length === 0}
                className={`font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  showSelectedOnly
                    ? 'text-white'
                    : 'text-[#AEAEB2] hover:text-white'
                }`}
              >
                {showSelectedOnly ? 'Tümünü göster' : 'Seçilenleri göster'}
              </button>
            </div>
            <span className="inline-flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={reloadPeople}
                disabled={loading}
                className="inline-flex items-center gap-1 font-medium text-[#AEAEB2] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Listeyi yenile
              </button>
              {selectedIds.length} seçili · {displayedPeople.length} kayıt
            </span>
          </div>

          <div className="max-h-[560px] space-y-1 overflow-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#86868B]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Kullanıcılar yükleniyor…
              </div>
            ) : displayedPeople.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[#636366]">
                {showSelectedOnly ? 'Seçili kullanıcı yok.' : 'Eşleşen kullanıcı yok.'}
              </p>
            ) : (
              displayedPeople.map((person) => {
                const selected = selectedIds.includes(person.id);
                const role = normalizeAppRole(person.role) as AppRole;
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggleId(person.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
                      selected
                        ? 'border-white/20 bg-white/10'
                        : 'border-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        selected
                          ? 'border-white bg-white text-black'
                          : 'border-white/20'
                      }`}
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                      {person.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={person.photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-4 w-4 text-white/40" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-white">
                        {person.displayName}
                      </span>
                      <span className="block truncate text-[11px] text-[#86868B]">
                        {person.title} · {roleLabel(role)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="z-card p-4 backdrop-blur-xl sm:p-5 lg:sticky lg:top-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-[#AEAEB2]">
                Canlı önizleme
              </p>
              <p className="mt-1 text-[12px] text-[#636366]">
                {BADGE_CARD.widthMm} × {BADGE_CARD.heightMm} mm · {BADGE_CARD.dpi} dpi
              </p>
            </div>
            <IdCard className="h-4 w-4 text-[#636366]" />
          </div>

          <div
            ref={previewFrameRef}
            className="w-full overflow-hidden rounded-xl border border-white/10 bg-black"
            style={{ aspectRatio: `${BADGE_CARD.widthMm} / ${BADGE_CARD.heightMm}` }}
          >
            <div
              className="relative h-full w-full overflow-hidden"
            >
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <BadgeFace
                  person={isBadgeCardVisible ? previewPerson : null}
                  adjust={previewPerson ? adjustFor(previewPerson.id) : DEFAULT_BADGE_ADJUST}
                  photoFailed={
                    Boolean(previewPerson?.photoUrl) &&
                    brokenPhoto === previewPerson?.photoUrl
                  }
                  onPhotoError={() =>
                    setBrokenPhoto(previewPerson?.photoUrl || '')
                  }
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={exporting || (!selectedPeople.length && !previewPerson)}
            onClick={() => void downloadPdf()}
            className="z-btn-primary mt-4 inline-flex h-12 w-full items-center justify-center gap-2 text-[14px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting && progress
              ? `PDF hazırlanıyor ${progress.current}/${progress.total}`
              : selectedPeople.length > 1
                ? `${selectedPeople.length} yaka kartını PDF indir`
                : 'PDF indir'}
          </button>
        </section>
      </div>

      {selectedPeople.length ? (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="z-page-kicker">Seçilen yaka kartları</p>
              <p className="mt-2 text-[15px] text-white">{selectedPeople.length} kart</p>
            </div>
            <p className="text-[12px] text-[#86868B]">
              Fotoğrafın yerini ve boyutunu kişi bazında &quot;Ayarla&quot; ile değiştirin.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {selectedPeople.map((person) => (
              <BadgeThumb
                key={`${person.id}-${person.photoUrl}`}
                person={person}
                adjust={adjustFor(person.id)}
                busy={busyId === person.id}
                disabled={exporting}
                onAdjust={() => openEditor(person)}
                onPdf={() => downloadOne(person)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {editing && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
              onClick={requestClose}
            >
              <div
                className="z-modal zebra-sheet-enter flex max-h-[94vh] w-full max-w-3xl flex-col gap-6 overflow-y-auto p-5 sm:p-7 md:grid md:h-[94vh] md:grid-cols-[minmax(0,1fr)_280px] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  className="relative mx-auto w-full max-w-[calc(84vh*0.64)] shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-2xl active:cursor-grabbing md:self-center"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <ScaledBadge person={editing} adjust={draftAdjust} />
                </div>
                <div className="flex flex-col md:-mr-3 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:pr-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="z-page-kicker">Yaka kartı</p>
                      <p className="mt-2 text-[17px] font-medium text-white">{editing.displayName}</p>
                      <p className="mt-1 text-[12px] text-[#86868B]">{editing.title}</p>
                    </div>
                    <button type="button" onClick={requestClose} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-4 text-[12px] leading-relaxed text-[#86868B]">
                    Fotoğrafı önizlemede sürükleyerek kaydırın. Kaydedilen ayar bu kişinin kartında hep kullanılır.
                  </p>
                  <AdjustSlider label="Boyut" value={draftAdjust.scale} min={0.6} max={1.6} step={0.01} format={(v) => `%${Math.round(v * 100)}`} onChange={(v) => setDraftAdjust((c) => ({ ...c, scale: v }))} />
                  <AdjustSlider label="Yatay" value={draftAdjust.dx} min={-OFFSET_LIMIT} max={OFFSET_LIMIT} step={1} format={(v) => `${v}px`} onChange={(v) => setDraftAdjust((c) => ({ ...c, dx: v }))} />
                  <AdjustSlider label="Dikey" value={draftAdjust.dy} min={-OFFSET_LIMIT} max={OFFSET_LIMIT} step={1} format={(v) => `${v}px`} onChange={(v) => setDraftAdjust((c) => ({ ...c, dy: v }))} />
                  <p className="mt-7 text-[13px] font-medium text-white">Renk</p>
                  <AdjustSlider label="Kırmızılık azalt" value={draftAdjust.red ?? 0} min={0} max={100} step={1} format={(v) => `${v}`} onChange={(v) => setDraftAdjust((c) => ({ ...c, red: v }))} />
                  <div className="mt-auto flex flex-col gap-2 pt-8">
                    <AdjustSaveActions
                      canSave={canSave}
                      dirty={dirty}
                      hasSaved={Boolean(adjustments[editing.id])}
                      onSave={saveDraft}
                      onResetScreen={() => setDraftAdjust(DEFAULT_BADGE_ADJUST)}
                      onDeleteSaved={async () => {
                        await removeAdjust(editing.id);
                        setDraftAdjust(DEFAULT_BADGE_ADJUST);
                      }}
                    />
                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => downloadOne(editing)}
                      className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-50"
                    >
                      {busyId === editing.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {unsavedDialog}

      <div
        aria-hidden
        className="z-offscreen pointer-events-none fixed left-[-100000px] top-0"
      >
        <div ref={exportCanvasRef}>
          <BadgeFace
            person={exportPerson}
            adjust={
              exportPerson
                ? editing?.id === exportPerson.id
                  ? draftAdjust
                  : adjustFor(exportPerson.id)
                : DEFAULT_BADGE_ADJUST
            }
            photoFailed={exportPhotoBroken}
            onPhotoError={() => setExportPhotoBroken(true)}
          />
        </div>
      </div>

      {pasteOpen ? (
        <PasteListModal
          people={pastePeople}
          storageKey={PASTE_LIST_STORAGE_KEY}
          kicker="Yaka kartı"
          onApply={applyPastedList}
          onClose={() => setPasteOpen(false)}
        />
      ) : null}
    </div>
  );
}
