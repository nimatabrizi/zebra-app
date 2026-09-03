'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Move,
  Package,
  Phone,
  Square,
  Type,
  User,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  formatBatchPhone,
  resolveConsultantPhotoUrl,
  toStudioDisplayName,
  toConsultantPhotoSlug,
  STUDIO_CANVAS,
  waitForStudioFonts,
  type StudioFormat,
} from '../lib/studioAssets';
import {
  DEFAULT_CONSULTANT_TITLE,
  resolveConsultantTitle,
} from '../lib/consultantTitles';
import { toTurkishUpper } from '../lib/formatName';
import {
  downloadGeneratedImages,
  supportsNativeImageDelivery,
  type GeneratedImageFile,
} from '../lib/generatedImageDelivery';
import GeneratedImageShareSheet from './GeneratedImageShareSheet';

const DEFAULT_TITLE = toTurkishUpper(DEFAULT_CONSULTANT_TITLE);
const PHOTO_H_MIN = 200;
const PHOTO_H_MAX = 1400;
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 140;

type LayerId = 'photo' | 'name' | 'status' | 'phone';
type TextAlign = 'left' | 'center' | 'right';

type ConsultantRow = {
  id: string;
  rawName: string;
  displayName: string;
  phone: string;
  title: string;
  photoUrl: string | null;
};

type ProgressState = {
  current: number;
  total: number;
  label: string;
};

type EffectStyle = {
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  glowEnabled: boolean;
  glowColor: string;
  glowSize: number;
  glowSpread: number;
};

type TextLayerStyle = EffectStyle & {
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  color: string;
  /** Yatay hizalama — konum noktasına göre */
  align: TextAlign;
};

type PhotoLayerStyle = EffectStyle & {
  x: number;
  y: number;
  height: number;
  /** Percent cropped from the bottom of the photo (0–70) */
  cropBottom: number;
  bottomGradientEnabled: boolean;
  bottomGradientColor: string;
  /** Gradient band height as % of photo (0–100) */
  bottomGradientSize: number;
  /** Fade softness 0–100 (higher = softer) */
  bottomGradientSpread: number;
};

type LayoutState = {
  photo: PhotoLayerStyle;
  name: TextLayerStyle;
  status: TextLayerStyle;
  phone: TextLayerStyle;
};

const FONT_OPTIONS = [
  {
    id: 'zalando-sans-expanded',
    label: 'Zalando Sans Expanded',
    value: 'var(--font-zalando-expanded)',
  },
  {
    id: 'bebas',
    label: 'Bebas Neue',
    value: 'var(--font-bebas-neue), Impact, sans-serif',
  },
  {
    id: 'anton',
    label: 'Anton',
    value: 'var(--font-anton), Impact, sans-serif',
  },
  {
    id: 'archivo',
    label: 'Archivo Black',
    value: 'var(--font-archivo-black), Impact, sans-serif',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    value: 'var(--font-oswald), sans-serif',
  },
  {
    id: 'barlow',
    label: 'Barlow Condensed',
    value: 'var(--font-barlow-condensed), sans-serif',
  },
  {
    id: 'teko',
    label: 'Teko',
    value: 'var(--font-teko), sans-serif',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    value: 'var(--font-montserrat), sans-serif',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    value: 'var(--font-poppins), sans-serif',
  },
  {
    id: 'raleway',
    label: 'Raleway',
    value: 'var(--font-raleway), sans-serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    value: 'var(--font-inter), sans-serif',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    value: 'var(--font-dm-sans), sans-serif',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    value: 'var(--font-roboto), sans-serif',
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    value: 'var(--font-open-sans), sans-serif',
  },
  {
    id: 'lato',
    label: 'Lato',
    value: 'var(--font-lato), sans-serif',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    value: 'var(--font-playfair), Georgia, serif',
  },
  {
    id: 'geist',
    label: 'Geist Sans',
    value: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'arial',
    label: 'Arial',
    value: 'Arial, Helvetica, sans-serif',
  },
  {
    id: 'impact',
    label: 'Impact',
    value: 'Impact, Haettenschweiler, sans-serif',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    value: 'Georgia, "Times New Roman", serif',
  },
] as const;

const DEFAULT_NAME_FONT_FAMILY =
  FONT_OPTIONS.find((f) => f.id === 'oswald')?.value ||
  FONT_OPTIONS[0].value;

const LAYER_META: { id: LayerId; label: string; icon: typeof User }[] = [
  { id: 'photo', label: 'Danışman görseli', icon: User },
  { id: 'name', label: 'İsim soyisim', icon: Type },
  { id: 'status', label: 'Status (unvan)', icon: Type },
  { id: 'phone', label: 'Telefon', icon: Phone },
];

const defaultEffect = (): EffectStyle => ({
  strokeEnabled: false,
  strokeColor: '#000000',
  strokeWidth: 2,
  glowEnabled: true,
  glowColor: '#000000',
  glowSize: 16,
  glowSpread: 2,
});

const defaultLayout = (format: StudioFormat = 'story'): LayoutState => {
  const isPost = format === 'post';
  return {
    photo: {
      ...defaultEffect(),
      x: 540,
      y: isPost ? 700 : 1280,
      height: isPost ? 480 : 820,
      cropBottom: 0,
      bottomGradientEnabled: false,
      bottomGradientColor: '#000000',
      bottomGradientSize: 35,
      bottomGradientSpread: 55,
      glowEnabled: true,
      glowColor: '#000000',
      glowSize: isPost ? 20 : 28,
      glowSpread: 4,
    },
    name: {
      ...defaultEffect(),
      x: 540,
      y: isPost ? 760 : 1380,
      fontFamily: DEFAULT_NAME_FONT_FAMILY,
      fontSize: isPost ? 40 : 46,
      fontWeight: 700,
      letterSpacing: 0.04,
      color: '#ffffff',
      align: 'center',
      glowEnabled: true,
      glowSize: 14,
    },
    status: {
      ...defaultEffect(),
      x: 540,
      y: isPost ? 805 : 1435,
      fontFamily: FONT_OPTIONS[0].value,
      fontSize: isPost ? 16 : 18,
      fontWeight: 500,
      letterSpacing: 0.28,
      color: '#fffffff2',
      align: 'center',
      glowEnabled: true,
      glowSize: 10,
    },
    phone: {
      ...defaultEffect(),
      x: 540,
      y: isPost ? 860 : 1495,
      fontFamily: FONT_OPTIONS[0].value,
      fontSize: isPost ? 34 : 40,
      fontWeight: 600,
      letterSpacing: 0.04,
      color: '#ffffff',
      align: 'center',
      glowEnabled: true,
      glowSize: 14,
    },
  };
};

function resolveTextAlign(align?: TextAlign | null): TextAlign {
  return align === 'left' || align === 'right' ? align : 'center';
}

/** Konum noktasına göre katman transform’u (text-align değil) */
function textAnchorTransform(align?: TextAlign | null): string {
  const a = resolveTextAlign(align);
  if (a === 'left') return 'translate(0, -50%)';
  if (a === 'right') return 'translate(-100%, -50%)';
  return 'translate(-50%, -50%)';
}

const CANVAS_ALIGN_INSET = 48;

/** Seçilen katmanı tuvalin sol / orta / sağına yerleştir */
function canvasAlignX(
  align: TextAlign,
  canvasW: number,
  opts?: { centerAnchoredWidth?: number }
): number {
  const inset = CANVAS_ALIGN_INSET;
  const half = Math.max(0, (opts?.centerAnchoredWidth || 0) / 2);
  if (align === 'left') return Math.round(inset + half);
  if (align === 'right') return Math.round(canvasW - inset - half);
  return Math.round(canvasW / 2);
}

function inferCanvasAlignFromX(
  x: number,
  canvasW: number,
  opts?: { centerAnchoredWidth?: number }
): TextAlign {
  if (!canvasW) return 'center';
  const leftX = canvasAlignX('left', canvasW, opts);
  const rightX = canvasAlignX('right', canvasW, opts);
  const centerX = canvasAlignX('center', canvasW, opts);
  const dL = Math.abs(x - leftX);
  const dC = Math.abs(x - centerX);
  const dR = Math.abs(x - rightX);
  if (dC <= dL && dC <= dR) return 'center';
  return dL <= dR ? 'left' : 'right';
}


function textShadowFromEffect(fx: EffectStyle): string | undefined {
  if (!fx.glowEnabled) return undefined;
  const blur = Math.max(0, fx.glowSize);
  const spread = Math.max(0, fx.glowSpread);
  // Outer glow approximation via layered text-shadow
  const layers: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const b = blur * (i / 3) + spread;
    layers.push(`0 0 ${b}px ${fx.glowColor}`);
  }
  return layers.join(', ');
}

function photoFilterFromEffect(fx: EffectStyle): string | undefined {
  if (!fx.glowEnabled) return undefined;
  const blur = Math.max(0, fx.glowSize);
  const spread = Math.max(0, fx.glowSpread);
  return [
    `drop-shadow(0 0 ${blur + spread}px ${fx.glowColor})`,
    `drop-shadow(0 0 ${Math.max(2, blur / 2)}px ${fx.glowColor})`,
  ].join(' ');
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);
  const n = Number.parseInt(full || '000000', 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function bottomGradientOverlayStyle(
  photo: PhotoLayerStyle,
  maskUrl: string | null
): React.CSSProperties | null {
  if (
    !photo.bottomGradientEnabled ||
    photo.bottomGradientSize <= 0 ||
    !maskUrl
  ) {
    return null;
  }
  const size = Math.min(100, Math.max(1, photo.bottomGradientSize));
  const spread = Math.min(100, Math.max(0, photo.bottomGradientSpread));
  const solidStop = Math.max(0, size * (0.12 - spread * 0.0008));
  const midStop = Math.min(size * 0.85, size * (0.35 + spread * 0.004));
  const color = photo.bottomGradientColor || '#000000';
  const mask = `url("${maskUrl}")`;
  return {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: `linear-gradient(to top, ${hexToRgba(color, 1)} ${solidStop}%, ${hexToRgba(color, 0.65)} ${midStop}%, ${hexToRgba(color, 0)} ${size}%)`,
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center bottom',
    maskPosition: 'center bottom',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  };
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('FileReader'));
    reader.readAsDataURL(blob);
  });
}

/**
 * requestAnimationFrame arka tarayıcı sekmelerinde askıya alınır.
 * MessageChannel, React'in flushSync güncellemesinden sonra işi arka sekmede de
 * sürdürebilecek bir event-loop turu verir.
 */
function yieldWithoutAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
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
      if (!src || src.startsWith('data:')) return;
      try {
        const dataUrl = await urlToDataUrl(src);
        img.removeAttribute('crossorigin');
        img.src = dataUrl;
        await img.decode().catch(() => undefined);
      } catch (err) {
        console.warn('Toplu üretim görsel gömme hatası:', src, err);
      }
    })
  );

  const overlays = Array.from(
    node.querySelectorAll<HTMLElement>('[data-photo-gradient]')
  );
  for (const el of overlays) {
    const img = el.parentElement?.querySelector('img');
    const src = img?.currentSrc || img?.src;
    if (!src) continue;
    el.style.webkitMaskImage = `url("${src}")`;
    el.style.maskImage = `url("${src}")`;
  }

  return backups;
}

function restoreNodeImages(
  backups: { img: HTMLImageElement; src: string | null; crossOrigin: string | null }[]
) {
  for (const { img, src, crossOrigin } of backups) {
    if (src != null) img.setAttribute('src', src);
    else img.removeAttribute('src');
    if (crossOrigin != null) img.setAttribute('crossorigin', crossOrigin);
    else img.removeAttribute('crossorigin');
  }
}

function SettingToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors duration-200 ease-zebra cursor-pointer disabled:opacity-40 ${
        checked ? 'bg-white' : 'bg-white/15'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-6 w-6 rounded-full shadow-sm transition-transform duration-200 ease-zebra ${
          checked ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white'
        }`}
      />
    </button>
  );
}

function ColorSwatch({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/15 shadow-inner cursor-pointer ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <span
        className="absolute inset-0"
        style={{ backgroundColor: value.slice(0, 7) }}
      />
      <input
        type="color"
        value={value.slice(0, 7)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  );
}

function EffectControls({
  label,
  value,
  onChange,
  showFont,
  canvasW,
}: {
  label: string;
  value: TextLayerStyle | PhotoLayerStyle;
  onChange: (next: TextLayerStyle | PhotoLayerStyle) => void;
  showFont?: boolean;
  canvasW?: number;
}) {
  const text = value as TextLayerStyle;
  const photo = value as PhotoLayerStyle;
  const photoW = Math.round(photo.height * 0.72);
  const align =
    canvasW && canvasW > 0
      ? inferCanvasAlignFromX(
          showFont ? text.x : photo.x,
          canvasW,
          showFont ? undefined : { centerAnchoredWidth: photoW }
        )
      : resolveTextAlign(text.align);

  const applyCanvasAlign = (nextAlign: TextAlign) => {
    if (!canvasW || canvasW <= 0) return;
    if (showFont) {
      onChange({
        ...text,
        align: nextAlign,
        x: canvasAlignX(nextAlign, canvasW),
      });
      return;
    }
    onChange({
      ...photo,
      x: canvasAlignX(nextAlign, canvasW, {
        centerAnchoredWidth: photoW,
      }),
    });
  };

  return (
    <div
      data-keep-selection
      className="rounded-2xl border border-white/5 bg-[#141414]/95 p-5 space-y-6"
    >
      <div>
        <p className="text-[12px] font-medium tracking-wide uppercase text-[#636366]">
          Özellikler
        </p>
        <h2 className="mt-1 text-[15px] font-medium tracking-tight text-white">
          {label}
        </h2>
      </div>

      {showFont ? (
        <div className="space-y-6">
          <label className="flex items-center justify-between gap-6">
            <span className="text-[14px] text-[#AEAEB2]">Font</span>
            <select
              value={text.fontFamily}
              onChange={(e) => onChange({ ...text, fontFamily: e.target.value })}
              className="max-w-[58%] flex-1 h-11 rounded-xl bg-[#0A0A0A] border border-white/10 text-white text-[14px] px-3 outline-none"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.id} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] text-[#AEAEB2]">Boyut</span>
              <span className="text-[13px] text-[#636366] tabular-nums">
                {text.fontSize}px
              </span>
            </div>
            <input
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={text.fontSize}
              onChange={(e) =>
                onChange({ ...text, fontSize: Number(e.target.value) })
              }
              className="w-full accent-white"
            />
          </div>

          <label className="flex items-center justify-between gap-6">
            <span className="text-[14px] text-[#AEAEB2]">Kalınlık</span>
            <select
              value={text.fontWeight}
              onChange={(e) =>
                onChange({ ...text, fontWeight: Number(e.target.value) })
              }
              className="max-w-[58%] flex-1 h-11 rounded-xl bg-[#0A0A0A] border border-white/10 text-white text-[14px] px-3 outline-none"
            >
              <option value={400}>Regular</option>
              <option value={500}>Medium</option>
              <option value={600}>Semibold</option>
              <option value={700}>Bold</option>
              <option value={800}>Extra Bold</option>
            </select>
          </label>

          <div className="flex items-center justify-between gap-6">
            <span className="text-[14px] text-[#AEAEB2]">Renk</span>
            <ColorSwatch
              value={text.color}
              onChange={(color) => onChange({ ...text, color })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] text-[#AEAEB2]">Boyut</span>
              <span className="text-[13px] text-[#636366] tabular-nums">
                {photo.height}px
              </span>
            </div>
            <input
              type="range"
              min={PHOTO_H_MIN}
              max={PHOTO_H_MAX}
              value={photo.height}
              onChange={(e) =>
                onChange({ ...photo, height: Number(e.target.value) })
              }
              className="w-full accent-white"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] text-[#AEAEB2]">Alttan crop</span>
              <span className="text-[13px] text-[#636366] tabular-nums">
                {photo.cropBottom}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={70}
              value={photo.cropBottom}
              onChange={(e) =>
                onChange({ ...photo, cropBottom: Number(e.target.value) })
              }
              className="w-full accent-white"
            />
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-[14px] text-white">Alttan gradient</p>
              <p className="text-[12px] text-[#636366] mt-1">
                Sadece danışman görseli üzerinde
              </p>
            </div>
            <SettingToggle
              checked={photo.bottomGradientEnabled}
              onChange={(bottomGradientEnabled) =>
                onChange({ ...photo, bottomGradientEnabled })
              }
            />
          </div>

          <div
            className={`space-y-5 transition-opacity ${
              photo.bottomGradientEnabled ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <div className="flex items-center justify-between gap-6">
              <span className="text-[14px] text-[#AEAEB2]">Renk</span>
              <ColorSwatch
                value={photo.bottomGradientColor}
                disabled={!photo.bottomGradientEnabled}
                onChange={(bottomGradientColor) =>
                  onChange({ ...photo, bottomGradientColor })
                }
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[14px] text-[#AEAEB2]">Size</span>
                <span className="text-[13px] text-[#636366] tabular-nums">
                  {photo.bottomGradientSize}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={photo.bottomGradientSize}
                disabled={!photo.bottomGradientEnabled}
                onChange={(e) =>
                  onChange({
                    ...photo,
                    bottomGradientSize: Number(e.target.value),
                  })
                }
                className="w-full accent-white disabled:opacity-40"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[14px] text-[#AEAEB2]">Spread</span>
                <span className="text-[13px] text-[#636366] tabular-nums">
                  {photo.bottomGradientSpread}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={photo.bottomGradientSpread}
                disabled={!photo.bottomGradientEnabled}
                onChange={(e) =>
                  onChange({
                    ...photo,
                    bottomGradientSpread: Number(e.target.value),
                  })
                }
                className="w-full accent-white disabled:opacity-40"
              />
            </div>
          </div>
        </div>
      )}

      {typeof canvasW === 'number' && canvasW > 0 ? (
        <div className="space-y-3">
          <div>
            <p className="text-[14px] text-[#AEAEB2]">Tuval hizası</p>
            <p className="text-[12px] text-[#636366] mt-0.5">
              Seçili katmanı tuvalin soluna, ortasına veya sağına yerleştirir
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#0A0A0A] border border-white/10 p-1">
            {(
              [
                { id: 'left' as const, label: 'Sol', Icon: AlignLeft },
                { id: 'center' as const, label: 'Orta', Icon: AlignCenter },
                { id: 'right' as const, label: 'Sağ', Icon: AlignRight },
              ] as const
            ).map(({ id, label: alignLabel, Icon }) => {
              const active = align === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={`Tuval ${alignLabel.toLocaleLowerCase('tr-TR')}`}
                  aria-label={`Tuval ${alignLabel.toLocaleLowerCase('tr-TR')}`}
                  aria-pressed={active}
                  onClick={() => applyCanvasAlign(id)}
                  className={`h-10 rounded-lg inline-flex items-center justify-center gap-1.5 text-[12px] cursor-pointer transition-colors ${
                    active
                      ? 'bg-white text-black'
                      : 'text-[#AEAEB2] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {alignLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="h-px bg-white/5" />

      <div className="space-y-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-[14px] text-white">Outer glow</p>
            <p className="text-[12px] text-[#636366] mt-1">
              Yumuşak dış ışık
            </p>
          </div>
          <SettingToggle
            checked={value.glowEnabled}
            onChange={(glowEnabled) => onChange({ ...value, glowEnabled })}
          />
        </div>

        <div
          className={`space-y-5 transition-opacity ${
            value.glowEnabled ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <div className="flex items-center justify-between gap-6">
            <span className="text-[14px] text-[#AEAEB2]">Renk</span>
            <ColorSwatch
              value={value.glowColor}
              disabled={!value.glowEnabled}
              onChange={(glowColor) => onChange({ ...value, glowColor })}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] text-[#AEAEB2]">Size</span>
              <span className="text-[13px] text-[#636366] tabular-nums">
                {value.glowSize}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              value={value.glowSize}
              disabled={!value.glowEnabled}
              onChange={(e) =>
                onChange({ ...value, glowSize: Number(e.target.value) })
              }
              className="w-full accent-white disabled:opacity-40"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] text-[#AEAEB2]">Spread</span>
              <span className="text-[13px] text-[#636366] tabular-nums">
                {value.glowSpread}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={value.glowSpread}
              disabled={!value.glowEnabled}
              onChange={(e) =>
                onChange({ ...value, glowSpread: Number(e.target.value) })
              }
              className="w-full accent-white disabled:opacity-40"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResizeHandle({
  visible,
  onPointerDown,
}: {
  visible: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  if (!visible) return null;
  return (
    <span
      role="presentation"
      data-export-hide="true"
      onPointerDown={onPointerDown}
      className="absolute -right-3 -bottom-3 w-7 h-7 rounded-full bg-[#E5B540] border-2 border-black shadow-md cursor-nwse-resize z-20 touch-none"
      style={{ pointerEvents: 'auto' }}
    />
  );
}

function BatchCanvas({
  canvasRef,
  canvasW,
  canvasH,
  templateSrc,
  layout,
  name,
  title,
  phone,
  photoUrl,
  photoFailed,
  onPhotoError,
  selectedLayer,
  interactive,
  onPointerDownLayer,
  onPointerDownResize,
}: {
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  canvasW: number;
  canvasH: number;
  templateSrc: string | null;
  layout: LayoutState;
  name: string;
  title: string;
  phone: string;
  photoUrl: string | null;
  photoFailed: boolean;
  onPhotoError: () => void;
  selectedLayer: LayerId | null;
  interactive: boolean;
  onPointerDownLayer: (layer: LayerId, e: React.PointerEvent) => void;
  onPointerDownResize: (layer: LayerId, e: React.PointerEvent) => void;
}) {
  const ring = (id: LayerId) =>
    interactive && selectedLayer === id
      ? 'outline outline-2 outline-[#E5B540] outline-offset-4'
      : '';

  const photoGradient =
    photoUrl && !photoFailed
      ? bottomGradientOverlayStyle(layout.photo, photoUrl)
      : null;

  return (
    <div
      ref={canvasRef}
      data-batch-canvas={interactive ? 'true' : undefined}
      className="relative overflow-hidden bg-[#111] text-white select-none"
      style={{
        width: canvasW,
        height: canvasH,
        fontFamily: FONT_OPTIONS[0].value,
      }}
    >
      {templateSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={templateSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#636366]">
          <ImagePlus className="w-16 h-16 opacity-40" strokeWidth={1.25} />
          <span className="text-[28px] font-medium">Şablon yükleyin</span>
        </div>
      )}

      {/* Photo */}
      <div
        className={`absolute ${ring('photo')} ${
          interactive ? 'cursor-move' : 'pointer-events-none'
        }`}
        style={{
          left: layout.photo.x,
          top: layout.photo.y,
          height: layout.photo.height,
          width: Math.round(layout.photo.height * 0.72),
          transform: 'translate(-50%, -50%)',
        }}
        onPointerDown={(e) => onPointerDownLayer('photo', e)}
      >
        <div
          className="relative h-full w-full"
          style={{ filter: photoFilterFromEffect(layout.photo) }}
        >
          <div
            className="relative h-full w-full flex items-end justify-center"
            style={{
              clipPath:
                layout.photo.cropBottom > 0
                  ? `inset(0 0 ${layout.photo.cropBottom}% 0)`
                  : undefined,
            }}
          >
            {photoUrl && !photoFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                crossOrigin="anonymous"
                className="h-full w-auto max-w-full object-contain object-bottom pointer-events-none"
                draggable={false}
                onError={onPhotoError}
              />
            ) : null}
            {photoGradient ? (
              <div data-photo-gradient style={photoGradient} />
            ) : null}
          </div>
        </div>
        <ResizeHandle
          visible={interactive && selectedLayer === 'photo'}
          onPointerDown={(e) => onPointerDownResize('photo', e)}
        />
      </div>

      {/* Name */}
      <div
        className={`absolute ${ring('name')} ${
          interactive ? 'cursor-move' : 'pointer-events-none'
        }`}
        style={{
          left: layout.name.x,
          top: layout.name.y,
          transform: textAnchorTransform(layout.name.align),
        }}
        onPointerDown={(e) => onPointerDownLayer('name', e)}
      >
        <div
          className="whitespace-nowrap"
          style={{
            fontFamily: layout.name.fontFamily,
            fontSize: layout.name.fontSize,
            fontWeight: layout.name.fontWeight,
            letterSpacing: `${layout.name.letterSpacing}em`,
            color: layout.name.color,
            lineHeight: 1.1,
            textShadow: textShadowFromEffect(layout.name),
                      }}
        >
          {toTurkishUpper(name) || '\u00A0'}
        </div>
        <ResizeHandle
          visible={interactive && selectedLayer === 'name'}
          onPointerDown={(e) => onPointerDownResize('name', e)}
        />
      </div>

      {/* Status */}
      <div
        className={`absolute ${ring('status')} ${
          interactive ? 'cursor-move' : 'pointer-events-none'
        }`}
        style={{
          left: layout.status.x,
          top: layout.status.y,
          transform: textAnchorTransform(layout.status.align),
        }}
        onPointerDown={(e) => onPointerDownLayer('status', e)}
      >
        <div
          className="whitespace-nowrap"
          style={{
            fontFamily: layout.status.fontFamily,
            fontSize: layout.status.fontSize,
            fontWeight: layout.status.fontWeight,
            letterSpacing: `${layout.status.letterSpacing}em`,
            color: layout.status.color,
            textShadow: textShadowFromEffect(layout.status),
                      }}
        >
          {toTurkishUpper(title) || '\u00A0'}
        </div>
        <ResizeHandle
          visible={interactive && selectedLayer === 'status'}
          onPointerDown={(e) => onPointerDownResize('status', e)}
        />
      </div>

      {/* Phone */}
      <div
        className={`absolute ${ring('phone')} ${
          interactive ? 'cursor-move' : 'pointer-events-none'
        }`}
        style={{
          left: layout.phone.x,
          top: layout.phone.y,
          transform: textAnchorTransform(layout.phone.align),
        }}
        onPointerDown={(e) => onPointerDownLayer('phone', e)}
      >
        <div
          className="tabular-nums whitespace-nowrap"
          style={{
            fontFamily: layout.phone.fontFamily,
            fontSize: layout.phone.fontSize,
            fontWeight: layout.phone.fontWeight,
            letterSpacing: `${layout.phone.letterSpacing}em`,
            color: layout.phone.color,
            textShadow: textShadowFromEffect(layout.phone),
                      }}
        >
          {phone || '\u00A0'}
        </div>
        <ResizeHandle
          visible={interactive && selectedLayer === 'phone'}
          onPointerDown={(e) => onPointerDownResize('phone', e)}
        />
      </div>
    </div>
  );
}

function FullscreenExportPreview({
  canvasW,
  canvasH,
  templateSrc,
  layout,
  name,
  title,
  phone,
  photoUrl,
  photoFailed,
}: {
  canvasW: number;
  canvasH: number;
  templateSrc: string | null;
  layout: LayoutState;
  name: string;
  title: string;
  phone: string;
  photoUrl: string | null;
  photoFailed: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => {
      const maxW = Math.min(frame.clientWidth, canvasH > canvasW ? 420 : 520);
      const maxH = frame.clientHeight;
      if (maxW <= 0 || maxH <= 0) return;
      setScale(Math.min(maxW / canvasW, maxH / canvasH));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [canvasW, canvasH]);

  return (
    <div
      ref={frameRef}
      className="w-full h-full max-w-lg flex items-center justify-center"
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-black"
        style={{
          width: canvasW * scale,
          height: canvasH * scale,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <BatchCanvas
            canvasW={canvasW}
            canvasH={canvasH}
            templateSrc={templateSrc}
            layout={layout}
            name={name}
            title={title}
            phone={phone}
            photoUrl={photoUrl}
            photoFailed={photoFailed}
            onPhotoError={() => undefined}
            selectedLayer={null}
            interactive={false}
            onPointerDownLayer={() => undefined}
            onPointerDownResize={() => undefined}
          />
        </div>
      </div>
    </div>
  );
}

export default function BatchProductionStudio() {
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [photoSlugs, setPhotoSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [imagesToDeliver, setImagesToDeliver] =
    useState<GeneratedImageFile[] | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [previewScale, setPreviewScale] = useState(0.28);
  const [format, setFormat] = useState<StudioFormat>('story');
  const [templates, setTemplates] = useState<Record<StudioFormat, string | null>>({
    post: null,
    story: null,
  });
  const [layouts, setLayouts] = useState<Record<StudioFormat, LayoutState>>({
    post: defaultLayout('post'),
    story: defaultLayout('story'),
  });
  const [selectedLayer, setSelectedLayer] = useState<LayerId | null>(null);
  const canvasW = STUDIO_CANVAS[format].width;
  const canvasH = STUDIO_CANVAS[format].height;
  const templateSrc = templates[format];
  const layout = layouts[format];
  const [exportConsultant, setExportConsultant] =
    useState<ConsultantRow | null>(null);
  const [exportPhotoBroken, setExportPhotoBroken] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const cancelBatchRef = useRef(false);
  const dragRef = useRef<{
    layer: LayerId;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    layer: LayerId;
    startY: number;
    origSize: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from('consultant-photos')
        .list('', { limit: 1000 });
      if (cancelled) return;
      if (error) {
        setPhotoSlugs([]);
        return;
      }
      setPhotoSlugs(
        (data || [])
          .map((f) => String(f.name || '').replace(/\.png$/i, ''))
          .filter(Boolean)
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'danisman')
        .order('tam_isim', { ascending: true });

      if (cancelled) return;
      if (error) {
        setConsultants([]);
        setLoading(false);
        return;
      }

      const rows: ConsultantRow[] = (data || [])
        .map((row) => {
          const rawName = String((row as { tam_isim?: string }).tam_isim || '')
            .normalize('NFC')
            .trim();
          if (!rawName) return null;
          const displayName = toStudioDisplayName(rawName);
          const phone = formatBatchPhone(
            (row as { whatsapp_number?: string }).whatsapp_number ??
              (row as { telefon?: string }).telefon ??
              (row as { phone?: string }).phone ??
              ''
          );
          const title = resolveConsultantTitle(
            rawName,
            (row as { unvan?: string }).unvan ??
              (row as { title?: string }).title ??
              null
          ).toLocaleUpperCase('tr-TR');
          return {
            id: String((row as { id?: string }).id || rawName),
            rawName,
            displayName,
            phone,
            title,
            photoUrl: resolveConsultantPhotoUrl(rawName, photoSlugs),
          };
        })
        .filter(Boolean) as ConsultantRow[];

      setConsultants(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [photoSlugs]);

  const selected = useMemo(
    () => consultants.find((c) => c.id === selectedId) || null,
    [consultants, selectedId]
  );

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return;
    const update = () => {
      const w = frame.clientWidth;
      if (w > 0) setPreviewScale(Math.min(1, w / canvasW));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [templateSrc, canvasW, format]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-batch-canvas]')) return;
      if (target.closest('[data-keep-selection]')) return;
      if (target.closest('[data-fullscreen-preview]')) return;
      setSelectedLayer(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const onTemplateFile = (file: File | null) => {
    const targetFormat = format;
    if (!file) {
      setTemplates((prev) => ({ ...prev, [targetFormat]: null }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : null;
      setTemplates((prev) => ({ ...prev, [targetFormat]: src }));
    };
    reader.readAsDataURL(file);
  };

  const updateLayerPos = useCallback(
    (layer: LayerId, x: number, y: number) => {
      setLayouts((prev) => {
        const current = prev[format];
        return {
          ...prev,
          [format]: {
            ...current,
            [layer]: {
              ...current[layer],
              x: Math.round(Math.min(canvasW, Math.max(0, x))),
              y: Math.round(Math.min(canvasH, Math.max(0, y))),
            },
          },
        };
      });
    },
    [format, canvasW, canvasH]
  );

  const updateLayerSize = useCallback(
    (layer: LayerId, size: number) => {
      setLayouts((prev) => {
        const current = prev[format];
        if (layer === 'photo') {
          return {
            ...prev,
            [format]: {
              ...current,
              photo: {
                ...current.photo,
                height: Math.round(
                  Math.min(PHOTO_H_MAX, Math.max(PHOTO_H_MIN, size))
                ),
              },
            },
          };
        }
        return {
          ...prev,
          [format]: {
            ...current,
            [layer]: {
              ...current[layer],
              fontSize: Math.round(
                Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size))
              ),
            },
          },
        };
      });
    },
    [format]
  );

  const preserveMainScroll = () => {
    const scroller = document.querySelector(
      '[data-main-scroll]'
    ) as HTMLElement | null;
    if (!scroller) return () => undefined;
    const top = scroller.scrollTop;
    const freeze = () => {
      scroller.scrollTop = top;
    };
    scroller.addEventListener('scroll', freeze);
    return () => {
      freeze();
      scroller.removeEventListener('scroll', freeze);
    };
  };

  const onPointerDownLayer = (layer: LayerId, e: React.PointerEvent) => {
    if (running) return;
    // Don't preventDefault here — it blocks page scroll when interacting with canvas
    e.stopPropagation();
    const unlockScroll = preserveMainScroll();
    setSelectedLayer(layer);
    dragRef.current = {
      layer,
      startX: e.clientX,
      startY: e.clientY,
      origX: layout[layer].x,
      origY: layout[layer].y,
    };
    // Unlock after layout settles (style panel is below canvas, but lock briefly anyway)
    window.setTimeout(unlockScroll, 120);
  };

  const onPointerDownResize = (layer: LayerId, e: React.PointerEvent) => {
    if (running) return;
    e.preventDefault();
    e.stopPropagation();
    const unlockScroll = preserveMainScroll();
    setSelectedLayer(layer);
    dragRef.current = null;
    const origSize =
      layer === 'photo' ? layout.photo.height : layout[layer].fontSize;
    resizeRef.current = {
      layer,
      startY: e.clientY,
      origSize,
    };
    window.setTimeout(unlockScroll, 120);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        // Only treat as drag after a small threshold so clicks don't fight scroll
        const dxScreen = e.clientX - drag.startX;
        const dyScreen = e.clientY - drag.startY;
        if (Math.hypot(dxScreen, dyScreen) < 4) return;
        e.preventDefault();
        const dx = dxScreen / previewScale;
        const dy = dyScreen / previewScale;
        updateLayerPos(drag.layer, drag.origX + dx, drag.origY + dy);
        return;
      }
      const resize = resizeRef.current;
      if (resize) {
        e.preventDefault();
        const dy = (e.clientY - resize.startY) / previewScale;
        const delta = resize.layer === 'photo' ? dy : dy * 0.35;
        updateLayerSize(resize.layer, resize.origSize + delta);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [previewScale, updateLayerPos, updateLayerSize]);

  const withConsultantOnExportCanvas = async (
    consultant: ConsultantRow,
    run: () => Promise<void>
  ) => {
    flushSync(() => {
      setExportConsultant(consultant);
      setExportPhotoBroken(false);
    });
    await yieldWithoutAnimationFrame();
    // Wait for cutout decode without touching the live preview
    const node = exportCanvasRef.current;
    if (node) {
      const imgs = Array.from(node.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) => img.decode().catch(() => undefined))
      );
    }
    await yieldWithoutAnimationFrame();
    try {
      await run();
    } finally {
      flushSync(() => setExportConsultant(null));
    }
  };

  const captureExportCanvas = async (): Promise<string> => {
    const node = exportCanvasRef.current;
    if (!node) throw new Error('Export tuvali bulunamadı');
    if (!templateSrc) throw new Error('Önce bir şablon yükleyin');

    await waitForStudioFonts();
    const backups = await inlineNodeImages(node);
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 1,
        width: canvasW,
        height: canvasH,
        style: {
          transform: 'none',
          width: `${canvasW}px`,
          height: `${canvasH}px`,
        },
        filter: (el) => {
          if (!(el instanceof HTMLElement)) return true;
          return el.dataset.exportHide !== 'true';
        },
      });
      if (!dataUrl || dataUrl === 'data:,') throw new Error('Görsel üretilemedi');
      return dataUrl;
    } finally {
      restoreNodeImages(backups);
    }
  };

  const downloadOne = async (consultant: ConsultantRow) => {
    if (!templateSrc) {
      window.alert('Önce şablon yükleyin.');
      return;
    }
    setRunning(true);
    setProgress({ current: 1, total: 1, label: consultant.displayName });
    try {
      await withConsultantOnExportCanvas(consultant, async () => {
        const dataUrl = await captureExportCanvas();
        const slug =
          toConsultantPhotoSlug(consultant.rawName) ||
          consultant.id.slice(0, 8);
        const images = [
          {
            blob: await (await fetch(dataUrl)).blob(),
            fileName: `toplu-${format}-${slug}.png`,
          },
        ];
        if (supportsNativeImageDelivery(images)) {
          setImagesToDeliver(images);
        } else {
          await downloadGeneratedImages(images);
        }
      });
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : 'Tekil indirme başarısız');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const stopBatch = () => {
    cancelBatchRef.current = true;
    setProgress((prev) =>
      prev ? { ...prev, label: 'Durduruluyor…' } : prev
    );
  };

  const downloadPartialZip = async (
    zip: JSZip,
    ok: number,
    fail: number,
    cancelled: boolean
  ) => {
    setProgress({
      current: ok + fail,
      total: Math.max(ok + fail, 1),
      label: cancelled ? 'Durduruldu — ZIP hazırlanıyor…' : 'ZIP hazırlanıyor…',
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zebra-toplu-uretim-${format}-${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (cancelled) {
      window.alert(
        `Toplu üretim durduruldu.\nİndirilen: ${ok}\nAtlanan: ${fail}`
      );
    } else {
      window.alert(
        `Toplu üretim tamamlandı.\nBaşarılı: ${ok}\nAtlanan: ${fail}`
      );
    }
  };

  const downloadAllZip = async () => {
    if (!templateSrc) {
      window.alert('Önce şablon yükleyin.');
      return;
    }
    if (!consultants.length || running) return;
    cancelBatchRef.current = false;
    setRunning(true);
    setBatchRunning(true);
    const zip = new JSZip();
    const folder = zip.folder(`zebra-toplu-uretim-${format}`);
    let ok = 0;
    let fail = 0;
    let cancelled = false;

    try {
      for (let i = 0; i < consultants.length; i++) {
        if (cancelBatchRef.current) {
          cancelled = true;
          break;
        }
        const c = consultants[i];
        setProgress({
          current: i + 1,
          total: consultants.length,
          label: c.displayName,
        });
        try {
          await withConsultantOnExportCanvas(c, async () => {
            if (cancelBatchRef.current) return;
            const dataUrl = await captureExportCanvas();
            if (cancelBatchRef.current) return;
            const base64 = dataUrl.split(',')[1];
            if (!base64) throw new Error('boş çıktı');
            const slug =
              toConsultantPhotoSlug(c.rawName) || `danisman-${i + 1}`;
            folder?.file(`${slug}.png`, base64, { base64: true });
          });
          if (cancelBatchRef.current) {
            cancelled = true;
            break;
          }
          ok += 1;
        } catch (err) {
          if (cancelBatchRef.current) {
            cancelled = true;
            break;
          }
          fail += 1;
          console.error('Toplu üretim atlandı:', c.displayName, err);
        }
      }

      if (cancelled) {
        if (ok > 0) {
          await downloadPartialZip(zip, ok, fail, true);
        } else {
          window.alert('Toplu üretim durduruldu.');
        }
        return;
      }

      await downloadPartialZip(zip, ok, fail, false);
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : 'Toplu ZIP oluşturulamadı');
    } finally {
      cancelBatchRef.current = false;
      setBatchRunning(false);
      setRunning(false);
      setProgress(null);
    }
  };

  const previewName = selected
    ? selected.displayName.toLocaleUpperCase('tr-TR')
    : '';
  const previewPhone = selected?.phone || '';
  const previewTitle = selected?.title || '';
  const previewPhoto = selected?.photoUrl || null;
  const previewPhotoFailed = Boolean(
    selected && (!previewPhoto || brokenPhoto === previewPhoto)
  );

  const exportName = (
    exportConsultant?.displayName ||
    selected?.displayName ||
    ''
  ).toLocaleUpperCase('tr-TR');
  const exportPhone = exportConsultant?.phone || selected?.phone || '';
  const exportTitle =
    exportConsultant?.title || selected?.title || DEFAULT_TITLE;
  const exportPhoto =
    exportConsultant?.photoUrl || selected?.photoUrl || null;
  const exportFailed =
    !exportPhoto ||
    exportPhotoBroken ||
    (exportConsultant == null && brokenPhoto === exportPhoto);

  const selectedStyle =
    selectedLayer === 'photo'
      ? layout.photo
      : selectedLayer
        ? layout[selectedLayer]
        : null;

  return (
    <div className="panel-enter w-full pb-8">
      {/* Off-screen export canvas — keeps live preview stable during batch */}
      <div
        aria-hidden
        className="pointer-events-none fixed overflow-hidden"
        style={{
          left: -12000,
          top: 0,
          width: canvasW,
          height: canvasH,
          opacity: 0,
        }}
      >
        <BatchCanvas
          canvasRef={exportCanvasRef}
          canvasW={canvasW}
          canvasH={canvasH}
          templateSrc={templateSrc}
          layout={layout}
          name={exportName}
          title={exportTitle}
          phone={exportPhone}
          photoUrl={exportPhoto}
          photoFailed={exportFailed}
          onPhotoError={() => setExportPhotoBroken(true)}
          selectedLayer={null}
          interactive={false}
          onPointerDownLayer={() => undefined}
          onPointerDownResize={() => undefined}
        />
      </div>

      {/* Header / toolbar */}
      <div className="mb-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[#636366]">
              Zebra Studio
            </p>
            <h1 className="mt-1 text-[28px] sm:text-[32px] font-medium tracking-tight text-white leading-none">
              Toplu Üretim
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="inline-flex p-1 rounded-full bg-white/[0.06] border border-white/10">
              <button
                type="button"
                disabled={running}
                onClick={() => {
                  setFormat('post');
                  setSelectedLayer(null);
                }}
                className={`h-9 px-4 rounded-full text-[13px] font-medium transition-all cursor-pointer disabled:opacity-50 ${
                  format === 'post'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#86868B] hover:text-white'
                }`}
              >
                Post
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => {
                  setFormat('story');
                  setSelectedLayer(null);
                }}
                className={`h-9 px-4 rounded-full text-[13px] font-medium transition-all cursor-pointer disabled:opacity-50 ${
                  format === 'story'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#86868B] hover:text-white'
                }`}
              >
                Story
              </button>
            </div>

            <button
              type="button"
              disabled={!templateSrc || running}
              onClick={() => setFullscreenPreview(true)}
              className="h-10 w-10 rounded-full bg-white/[0.06] border border-white/10 text-white inline-flex items-center justify-center cursor-pointer disabled:opacity-40 hover:bg-white/10"
              aria-label="Tam ekran önizleme"
              title="İndirilecek hali önizle"
            >
              <Eye className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={!selected || running || !templateSrc}
              onClick={() => selected && void downloadOne(selected)}
              className="h-10 px-4 rounded-full bg-white/10 border border-white/10 text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-40 hover:bg-white/15"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Seçileni indir</span>
            </button>

            {batchRunning ? (
              <button
                type="button"
                onClick={stopBatch}
                className="h-10 px-4 rounded-full bg-[#FF3B30]/15 border border-[#FF3B30]/35 text-[#FF3B30] text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Durdur
              </button>
            ) : (
              <button
                type="button"
                disabled={!consultants.length || running || !templateSrc}
                onClick={() => void downloadAllZip()}
                className="h-10 px-4 rounded-full bg-white text-black text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-40 hover:bg-neutral-100"
              >
                <Package className="w-4 h-4" />
                Tümünü ZIP
              </button>
            )}
          </div>
        </div>

        {progress ? (
          <div className="rounded-2xl border border-white/10 bg-[#161616]/90 px-4 py-3 flex items-center gap-4">
            <Loader2 className="w-4 h-4 text-white animate-spin shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-[#AEAEB2] truncate">{progress.label}</span>
                <span className="text-white tabular-nums shrink-0">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (progress.current / Math.max(progress.total, 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
            {batchRunning ? (
              <button
                type="button"
                onClick={stopBatch}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-[#FF3B30] bg-[#FF3B30]/10 border border-[#FF3B30]/25 cursor-pointer shrink-0"
              >
                Durdur
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Workspace: left tools · center canvas · right inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)_300px] gap-5 xl:gap-6 xl:items-start">
        {/* Left rail */}
        <aside className="order-2 xl:order-1 space-y-4">
          <section className="rounded-2xl border border-white/5 bg-[#141414]/95 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[12px] font-medium tracking-wide uppercase text-[#636366]">
                Şablon
              </h2>
              <span className="text-[11px] text-[#636366] tabular-nums">
                {canvasW}×{canvasH}
              </span>
            </div>

            {templateSrc ? (
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={templateSrc}
                  alt=""
                  className={`w-full object-cover object-top ${
                    format === 'post' ? 'aspect-square' : 'aspect-[9/16] max-h-44'
                  }`}
                />
                <div className="absolute inset-x-0 bottom-0 p-2 flex gap-2 bg-gradient-to-t from-black/80 to-transparent">
                  <label className="flex-1 h-8 rounded-lg bg-white/15 backdrop-blur text-[11px] font-medium text-white inline-flex items-center justify-center cursor-pointer hover:bg-white/25">
                    Değiştir
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => onTemplateFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onTemplateFile(null)}
                    className="h-8 w-8 rounded-lg bg-black/50 border border-white/10 text-white inline-flex items-center justify-center cursor-pointer"
                    aria-label="Şablonu kaldır"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer px-3 py-8 transition-colors">
                <ImagePlus className="w-5 h-5 text-[#636366]" strokeWidth={1.5} />
                <span className="text-[12px] font-medium text-[#AEAEB2]">
                  Şablon yükle
                </span>
                <span className="text-[11px] text-[#636366]">
                  {format === 'post' ? 'Kare PNG' : 'Dikey PNG'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => onTemplateFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#141414]/95 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[12px] font-medium tracking-wide uppercase text-[#636366]">
                Önizleme
              </h2>
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 text-[#636366] animate-spin" />
              ) : (
                <span className="text-[11px] text-[#636366] tabular-nums">
                  {consultants.length}
                </span>
              )}
            </div>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setBrokenPhoto(null);
              }}
              disabled={loading || running || !consultants.length}
              className="w-full appearance-none h-11 rounded-xl bg-[#0A0A0A] border border-white/10 text-white px-3 outline-none text-[13px] disabled:opacity-50"
            >
              <option value="">Danışman seçin</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            {selected?.phone ? (
              <p className="text-[12px] text-[#86868B] tabular-nums px-0.5">
                {selected.phone}
              </p>
            ) : null}
          </section>

          <section
            data-keep-selection
            className="rounded-2xl border border-white/5 bg-[#141414]/95 p-3"
          >
            <h2 className="text-[12px] font-medium tracking-wide uppercase text-[#636366] px-1 mb-2">
              Katmanlar
            </h2>
            <div className="space-y-1">
              {LAYER_META.map(({ id, label, icon: Icon }) => {
                const active = selectedLayer === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={running}
                    onClick={() =>
                      setSelectedLayer((prev) => (prev === id ? null : id))
                    }
                    className={`w-full h-11 rounded-xl px-3 flex items-center gap-3 text-left transition-all cursor-pointer disabled:opacity-50 ${
                      active
                        ? 'bg-white text-black'
                        : 'text-[#AEAEB2] hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                    <span className="text-[13px] font-medium truncate">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        {/* Center canvas */}
        <section className="order-1 xl:order-2">
          <div className="rounded-2xl border border-white/[0.06] bg-[#101010] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 px-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-medium text-white truncate">
                  {selected?.displayName || 'Danışman seçilmedi'}
                </span>
                {!templateSrc ? (
                  <span className="text-[11px] text-[#E5B540] shrink-0">
                    Şablon gerekli
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] text-[#636366] tabular-nums shrink-0">
                {STUDIO_CANVAS[format].label}
              </span>
            </div>

            <div
              ref={previewFrameRef}
              data-batch-canvas
              className="relative mx-auto overflow-hidden rounded-xl bg-[#0A0A0A] border border-white/5"
              style={{
                width: '100%',
                maxWidth: format === 'post' ? 440 : 360,
                height: canvasH * previewScale,
                contain: 'layout paint size',
              }}
            >
              <div
                className="absolute top-0 left-0"
                style={{
                  width: canvasW * previewScale,
                  height: canvasH * previewScale,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: canvasW,
                    height: canvasH,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <BatchCanvas
                    canvasRef={canvasRef}
                    canvasW={canvasW}
                    canvasH={canvasH}
                    templateSrc={templateSrc}
                    layout={layout}
                    name={previewName}
                    title={previewTitle}
                    phone={previewPhone}
                    photoUrl={previewPhoto}
                    photoFailed={previewPhotoFailed}
                    onPhotoError={() =>
                      previewPhoto && setBrokenPhoto(previewPhoto)
                    }
                    selectedLayer={selectedLayer}
                    interactive={!running}
                    onPointerDownLayer={onPointerDownLayer}
                    onPointerDownResize={onPointerDownResize}
                  />
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-[12px] text-[#636366]">
              Katmanı seç · sürükle · köşeden ölçekle. Ayarlar tüm danışmanlara
              uygulanır.
            </p>
          </div>
        </section>

        {/* Right inspector */}
        <aside className="order-3 xl:sticky xl:top-4">
          {selectedLayer && selectedStyle ? (
            <EffectControls
              label={
                LAYER_META.find((l) => l.id === selectedLayer)?.label ||
                selectedLayer
              }
              value={selectedStyle}
              showFont={selectedLayer !== 'photo'}
              canvasW={canvasW}
              onChange={(next) =>
                setLayouts((prev) => ({
                  ...prev,
                  [format]: {
                    ...prev[format],
                    [selectedLayer]: next,
                  },
                }))
              }
            />
          ) : (
            <div className="rounded-2xl border border-white/5 bg-[#141414]/95 px-5 py-10 text-center space-y-3">
              <div className="mx-auto w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
                <Move className="w-4 h-4 text-[#636366]" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-white">
                  Özellik paneli
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {fullscreenPreview ? (
        <div
          data-fullscreen-preview
          className="fixed inset-0 z-[120] bg-black/92 backdrop-blur-md flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Tam ekran önizleme"
        >
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <div>
              <p className="text-[13px] font-medium text-white">
                İndirilecek önizleme
              </p>
              <p className="text-[12px] text-[#86868B] mt-0.5">
                Seçim çerçeveleri olmadan · {canvasW}×{canvasH}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenPreview(false)}
              className="w-10 h-10 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center cursor-pointer"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-auto">
            <FullscreenExportPreview
              canvasW={canvasW}
              canvasH={canvasH}
              templateSrc={templateSrc}
              layout={layout}
              name={previewName}
              title={previewTitle}
              phone={previewPhone}
              photoUrl={previewPhoto}
              photoFailed={previewPhotoFailed}
            />
          </div>
        </div>
      ) : null}
      {imagesToDeliver ? (
        <GeneratedImageShareSheet
          images={imagesToDeliver}
          onClose={() => setImagesToDeliver(null)}
        />
      ) : null}
    </div>
  );
}
