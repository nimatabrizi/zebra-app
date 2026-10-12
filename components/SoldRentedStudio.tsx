'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Eye,
  Film,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RectangleVertical,
  RefreshCcw,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  SOCIAL_STUDIO_CANVAS,
  STATUS_AUDIO_URL,
  STATUS_OVERLAY_DELAY_SEC,
  STATUS_OVERLAY_HEVC_MIME,
  STATUS_OVERLAY_VP9_MIME,
  STATUS_VIDEO_DURATION_SEC,
  STATUS_VIDEO_OPTIONS,
  DEFAULT_STATUS_OVERLAY_TRANSFORM,
  clampStatusOverlayTransform,
  statusOverlayLayout,
  type StatusOverlayTransform,
  type StatusVideoKind,
  type StudioFormat,
} from '../lib/studioAssets';
import {
  downloadBlob,
  encodeStatusMp4,
  statusExportFileName,
  terminateStatusFFmpeg,
  type StatusExportProgress,
} from '../lib/statusVideoExport';
import {
  useImageTransformGestures,
  type ImageTransform,
} from '../lib/useImageTransformGestures';
import { usePageZoomLock } from '../lib/usePageZoomLock';
import { useDragPinch } from '../lib/useDragPinch';
import ZebraStudio from './ZebraStudio';

type SlotState = {
  file: File | null;
  url: string | null;
  label: string | null;
};

type SoldRentedStudioProps = {
  userId: string;
  fallbackName?: string;
  role?: string;
  isActive?: boolean;
};

const EMPTY_SLOT: SlotState = { file: null, url: null, label: null };
const DEFAULT_IMAGE_TRANSFORM: ImageTransform = { x: 0, y: 0, zoom: 1 };

function revokeUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

/**
 * Durum rozeti; MP4 çıktısıyla aynı zaman çizelgesinde döner (5 sn döngü,
 * animasyon 0.4 sn sonra girer). Konumlar tuval oranına göre yüzdelenir.
 */
function StatusOverlayLayer({
  format,
  overlayUrl,
  overlayHevcUrl,
  playing,
  clockRef,
  transform = DEFAULT_STATUS_OVERLAY_TRANSFORM,
  onTransformChange,
}: {
  format: StudioFormat;
  overlayUrl: string;
  overlayHevcUrl: string;
  playing: boolean;
  clockRef: React.RefObject<Record<StudioFormat, number>>;
  transform?: StatusOverlayTransform;
  /** Verilirse önizlemede taşıma/ölçekleme tutamağı çizilir (dışa aktarıma girmez). */
  onTransformChange?: (next: StatusOverlayTransform) => void;
}) {
  const canvas = SOCIAL_STUDIO_CANVAS[format];
  const layout = statusOverlayLayout(format, transform);
  const overlayRef = useRef<HTMLVideoElement>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gestureStartRef = useRef(DEFAULT_STATUS_OVERLAY_TRANSFORM);
  const canvasPerScreenPxRef = useRef(1);
  const handleGestures = useDragPinch({
    enabled: Boolean(onTransformChange),
    onStart: (element) => {
      gestureStartRef.current = transform;
      const width = element.parentElement?.getBoundingClientRect().width;
      canvasPerScreenPxRef.current = width ? canvas.width / width : 1;
      setDragging(true);
    },
    onMove: ({ dx, dy, ratio }) => {
      const base = gestureStartRef.current;
      const k = canvasPerScreenPxRef.current;
      onTransformChange?.(
        clampStatusOverlayTransform(format, {
          dx: base.dx + dx * k,
          dy: base.dy + dy * k,
          scale: base.scale * ratio,
        })
      );
    },
    onEnd: () => setDragging(false),
  });
  const box: React.CSSProperties = {
    left: `${(layout.left / canvas.width) * 100}%`,
    top: `${(layout.top / canvas.height) * 100}%`,
    width: `${(layout.width / canvas.width) * 100}%`,
    height: `${(layout.height / canvas.height) * 100}%`,
    transform: `rotate(${layout.rotationDeg}deg)`,
  };

  // <source> listesi değişince Safari yeni kaynağı ancak load() ile seçer.
  useEffect(() => {
    overlayRef.current?.load();
  }, [overlayUrl, overlayHevcUrl]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    let raf = 0;
    let visible = false;

    const stop = () => {
      cancelAnimationFrame(raf);
      overlay.pause();
      overlay.currentTime = 0;
      clockRef.current[format] = 0;
      visible = false;
      setOverlayVisible(false);
    };

    if (!playing) {
      stop();
      return stop;
    }

    const startedAt = performance.now();
    const tick = () => {
      const elapsed =
        ((performance.now() - startedAt) / 1000) % STATUS_VIDEO_DURATION_SEC;
      clockRef.current[format] = elapsed;

      if (elapsed < STATUS_OVERLAY_DELAY_SEC) {
        if (visible) {
          visible = false;
          setOverlayVisible(false);
        }
        if (!overlay.paused) overlay.pause();
        if (overlay.currentTime !== 0) overlay.currentTime = 0;
      } else {
        if (!visible) {
          visible = true;
          setOverlayVisible(true);
        }
        const target = elapsed - STATUS_OVERLAY_DELAY_SEC;
        if (Math.abs(overlay.currentTime - target) > 0.2) {
          overlay.currentTime = target;
        }
        if (overlay.paused) void overlay.play().catch(() => undefined);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return stop;
  }, [playing, overlayUrl, format, clockRef]);

  return (
    <>
      <video
        ref={overlayRef}
        muted
        playsInline
        // Eski WebKit sürümleri yalnızca bu özniteliği tanır.
        webkit-playsinline="true"
        disablePictureInPicture
        disableRemotePlayback
        preload="auto"
        className="pointer-events-none absolute"
        style={{
          ...box,
          visibility: overlayVisible ? 'visible' : 'hidden',
          backgroundColor: 'transparent',
        }}
      >
        {/* Safari/iOS: alpha yalnızca HEVC hvc1 .mov ile korunur. */}
        <source src={overlayHevcUrl} type={STATUS_OVERLAY_HEVC_MIME} />
        {/* Chrome / Firefox / Edge: VP9 alpha WebM. */}
        <source src={overlayUrl} type={STATUS_OVERLAY_VP9_MIME} />
      </video>
      {onTransformChange ? (
        <div
          aria-hidden
          title="Animasyonu taşı · iki parmakla ölçekle"
          className={`pointer-events-auto absolute z-10 cursor-move rounded-xl border-2 border-dashed transition-[border-color,background-color] duration-150 ${
            dragging
              ? 'border-white bg-white/10'
              : 'border-white/35 hover:border-white/70'
          }`}
          style={{ ...box, touchAction: 'none' }}
          {...handleGestures}
        />
      ) : null}
    </>
  );
}

type AdjustSegment = { id: string; label: string };

function TransformBar({
  segments,
  active,
  onSelect,
  percent,
  onMinus,
  onPlus,
  onReset,
  overlay = false,
}: {
  segments: AdjustSegment[];
  active: string;
  onSelect: (id: string) => void;
  percent: number;
  onMinus: () => void;
  onPlus: () => void;
  onReset: () => void;
  /** Görselin üstünde (tam ekran) mı, sayfa yüzeyinde mi duruyor. */
  overlay?: boolean;
}) {
  const shell = overlay
    ? 'border-white/15 bg-black/65 text-white backdrop-blur-sm'
    : 'border-[var(--z-border)] bg-[var(--z-elevated)] text-[var(--z-fg)]';
  const segmentActive = overlay
    ? 'bg-white text-black'
    : 'bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]';
  const segmentIdle = overlay
    ? 'text-white/70 hover:text-white'
    : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]';
  const iconButton = overlay
    ? 'hover:bg-white/10'
    : 'hover:bg-[var(--z-hover-strong)]';

  return (
    <div
      className={`pointer-events-auto flex items-center gap-1 rounded-full border p-1 ${shell}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5">
        {segments.map((segment) => (
          <button
            key={segment.id}
            type="button"
            onClick={() => onSelect(segment.id)}
            className={`h-8 rounded-full px-3 text-[12px] font-medium transition-colors ${
              active === segment.id ? segmentActive : segmentIdle
            }`}
          >
            {segment.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onMinus}
        className={`flex h-8 w-8 items-center justify-center rounded-full ${iconButton}`}
        aria-label="Küçült"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-11 text-center text-[11px] tabular-nums">%{percent}</span>
      <button
        type="button"
        onClick={onPlus}
        className={`flex h-8 w-8 items-center justify-center rounded-full ${iconButton}`}
        aria-label="Büyüt"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onReset}
        className={`flex h-8 w-8 items-center justify-center rounded-full ${iconButton}`}
        aria-label="Sıfırla"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const OVERLAY_SCALE_STEP = 0.1;

function stepOverlayScale(
  format: StudioFormat,
  transform: StatusOverlayTransform,
  delta: number
): StatusOverlayTransform {
  return clampStatusOverlayTransform(format, {
    ...transform,
    scale: Math.round((transform.scale + delta) * 100) / 100,
  });
}

function FormatPreview({
  format,
  sourceUrl,
  overlayUrl,
  overlayHevcUrl,
  imageTransform = DEFAULT_IMAGE_TRANSFORM,
  onImageTransformChange,
  playing,
  soundOn,
  onToggleSound,
  clockRef,
  fullscreen = false,
  onFullscreen,
  overlayTransform = DEFAULT_STATUS_OVERLAY_TRANSFORM,
  onOverlayTransformChange,
}: {
  format: StudioFormat;
  sourceUrl: string | null;
  overlayUrl: string;
  overlayHevcUrl: string;
  imageTransform?: ImageTransform;
  onImageTransformChange?: (next: ImageTransform) => void;
  playing: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  clockRef: React.RefObject<Record<StudioFormat, number>>;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  overlayTransform?: StatusOverlayTransform;
  onOverlayTransformChange?: (next: StatusOverlayTransform) => void;
}) {
  const canvas = SOCIAL_STUDIO_CANVAS[format];
  const maxPreviewWidth = format === 'post' ? 300 : 230;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [adjustTarget, setAdjustTarget] = useState<'image' | 'overlay'>('image');
  const imageAdjustable = Boolean(sourceUrl && onImageTransformChange);
  const imageGestures = useImageTransformGestures({
    targetRef: surfaceRef,
    enabled: imageAdjustable,
    transform: imageTransform,
    onChange: onImageTransformChange || (() => undefined),
  });

  const segments: AdjustSegment[] = onOverlayTransformChange
    ? [
        { id: 'image', label: 'Görsel' },
        { id: 'overlay', label: 'Animasyon' },
      ]
    : [{ id: 'image', label: 'Görsel' }];
  const target = onOverlayTransformChange ? adjustTarget : 'image';
  const controlBar =
    imageAdjustable && onImageTransformChange ? (
      <TransformBar
        overlay={fullscreen}
        segments={segments}
        active={target}
        onSelect={(id) => setAdjustTarget(id === 'overlay' ? 'overlay' : 'image')}
        percent={Math.round(
          (target === 'overlay' ? overlayTransform.scale : imageTransform.zoom) * 100
        )}
        onMinus={() => {
          if (target === 'overlay') {
            onOverlayTransformChange?.(
              stepOverlayScale(format, overlayTransform, -OVERLAY_SCALE_STEP)
            );
            return;
          }
          onImageTransformChange({
            ...imageTransform,
            zoom: Math.max(1, imageTransform.zoom - 0.1),
            x: imageTransform.zoom - 0.1 <= 1 ? 0 : imageTransform.x,
            y: imageTransform.zoom - 0.1 <= 1 ? 0 : imageTransform.y,
          });
        }}
        onPlus={() => {
          if (target === 'overlay') {
            onOverlayTransformChange?.(
              stepOverlayScale(format, overlayTransform, OVERLAY_SCALE_STEP)
            );
            return;
          }
          onImageTransformChange({
            ...imageTransform,
            zoom: Math.min(1.8, imageTransform.zoom + 0.1),
          });
        }}
        onReset={() => {
          if (target === 'overlay') {
            onOverlayTransformChange?.({ ...DEFAULT_STATUS_OVERLAY_TRANSFORM });
            return;
          }
          onImageTransformChange(DEFAULT_IMAGE_TRANSFORM);
        }}
      />
    ) : null;

  const outerStyle: React.CSSProperties = fullscreen
    ? {
        width:
          format === 'post'
            ? 'min(92vw, calc((100vh - 112px) * 0.8))'
            : 'min(92vw, calc((100vh - 112px) * 0.5625))',
        aspectRatio: `${canvas.width} / ${canvas.height}`,
      }
    : {
        width: '100%',
        maxWidth: maxPreviewWidth,
        aspectRatio: `${canvas.width} / ${canvas.height}`,
      };

  return (
    <div
      className={
        fullscreen
          ? 'flex items-center justify-center'
          : 'flex w-full flex-col items-center gap-3'
      }
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        style={outerStyle}
      >
        <div
          ref={surfaceRef}
          className={`absolute inset-0 ${
            imageAdjustable ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{
            touchAction: imageAdjustable ? 'none' : 'auto',
          }}
          onPointerDown={imageGestures.onPointerDown}
          onPointerMove={imageGestures.onPointerMove}
          onPointerUp={imageGestures.onPointerUp}
          onPointerCancel={imageGestures.onPointerCancel}
        >
          {sourceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sourceUrl}
              alt={`${canvas.label} kaynak görseli`}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{
                transform: `translate(${
                  imageTransform.x * ((imageTransform.zoom - 1) * 50)
                }%, ${
                  imageTransform.y * ((imageTransform.zoom - 1) * 50)
                }%) scale(${imageTransform.zoom})`,
                transformOrigin: 'center',
              }}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 text-sm text-zinc-500">
              Görsel yükleyin veya üretin
            </div>
          )}
          <StatusOverlayLayer
            format={format}
            overlayUrl={overlayUrl}
            overlayHevcUrl={overlayHevcUrl}
            playing={playing && Boolean(sourceUrl)}
            clockRef={clockRef}
            transform={overlayTransform}
            onTransformChange={sourceUrl ? onOverlayTransformChange : undefined}
          />
          {fullscreen && controlBar ? (
            <div className="absolute bottom-3 left-3 z-20">{controlBar}</div>
          ) : null}
        </div>

        {sourceUrl && (
          <>
          {onFullscreen && (
            <button
              type="button"
              onClick={onFullscreen}
              aria-label={`${canvas.label} tam ekran önizleme`}
              title="Tam ekran önizle"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundOn ? 'Sesi kapat' : 'Sesi aç'}
            title={soundOn ? 'Sesi kapat' : 'Sesi aç'}
            className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
          >
            {soundOn ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
          </>
        )}
      </div>
      {!fullscreen ? controlBar : null}
    </div>
  );
}

function FullscreenPreviewModal({
  format,
  sourceUrl,
  overlayUrl,
  overlayHevcUrl,
  imageTransform,
  onImageTransformChange,
  statusLabel,
  soundOn,
  onToggleSound,
  onClose,
  clockRef,
  overlayTransform,
  onOverlayTransformChange,
}: {
  format: StudioFormat;
  sourceUrl: string;
  overlayUrl: string;
  overlayHevcUrl: string;
  imageTransform: ImageTransform;
  onImageTransformChange: (next: ImageTransform) => void;
  overlayTransform: StatusOverlayTransform;
  onOverlayTransformChange: (next: StatusOverlayTransform) => void;
  statusLabel: string;
  soundOn: boolean;
  onToggleSound: () => void;
  onClose: () => void;
  clockRef: React.RefObject<Record<StudioFormat, number>>;
}) {
  usePageZoomLock(true);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${statusLabel} ${SOCIAL_STUDIO_CANVAS[format].label} tam ekran önizleme`}
      className="fixed inset-0 z-[250] flex flex-col bg-black/95 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-white">
            {statusLabel} · {SOCIAL_STUDIO_CANVAS[format].label}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Görseli veya animasyon çerçevesini sürükleyin · iki parmakla ölçekleyin
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tam ekran önizlemeyi kapat"
          title="Kapat"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <FormatPreview
          format={format}
          sourceUrl={sourceUrl}
          overlayUrl={overlayUrl}
          overlayHevcUrl={overlayHevcUrl}
          imageTransform={imageTransform}
          onImageTransformChange={onImageTransformChange}
          playing
          soundOn={soundOn}
          onToggleSound={onToggleSound}
          clockRef={clockRef}
          fullscreen
          overlayTransform={overlayTransform}
          onOverlayTransformChange={onOverlayTransformChange}
        />
      </div>
    </div>,
    document.body
  );
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} okunamadı.`));
    };
    image.src = url;
  });
}

function formatFromAspectRatio(width: number, height: number): StudioFormat {
  const ratio = width / height;
  const postRatio =
    SOCIAL_STUDIO_CANVAS.post.width / SOCIAL_STUDIO_CANVAS.post.height;
  const storyRatio =
    SOCIAL_STUDIO_CANVAS.story.width / SOCIAL_STUDIO_CANVAS.story.height;
  return Math.abs(ratio - postRatio) <= Math.abs(ratio - storyRatio)
    ? 'post'
    : 'story';
}

function UnifiedUpload({
  post,
  story,
  disabled,
  onFiles,
  onClear,
}: {
  post: SlotState;
  story: SlotState;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onClear: (format: StudioFormat) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="z-card p-4 backdrop-blur-xl">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {!(post.file && story.file) && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center transition hover:border-[#E5B540]/50 hover:bg-[#E5B540]/5 disabled:opacity-40"
        >
          <Upload className="h-5 w-5 text-[#E5B540]" />
          <span className="text-sm font-medium text-zinc-200">
            Post ve/veya Story görselini seç
          </span>
        </button>
      )}

      {(post.file || story.file) && (
        <div
          className={[
            'grid gap-2 sm:grid-cols-2',
            post.file && story.file ? '' : 'mt-3',
          ].join(' ')}
        >
          {(
            [
              { format: 'post' as const, slot: post },
              { format: 'story' as const, slot: story },
            ] as const
          )
            .filter(({ slot }) => Boolean(slot.file))
            .map(({ format, slot }) => {
            const canvas = SOCIAL_STUDIO_CANVAS[format];
            return (
              <div
                key={format}
                className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#E5B540]">
                    {canvas.label} algılandı
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {slot.label || 'Görsel bekleniyor'}
                  </p>
                </div>
                {slot.file && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onClear(format)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    aria-label={`${canvas.label} görselini kaldır`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
            })}
        </div>
      )}
    </div>
  );
}

export default function SoldRentedStudio({
  userId,
  fallbackName = '',
  role = '',
  isActive = true,
}: SoldRentedStudioProps) {
  const [kind, setKind] = useState<StatusVideoKind>('satildi');
  const [sourceMode, setSourceMode] = useState<'upload' | 'design'>('upload');
  const [previewFormat, setPreviewFormat] = useState<StudioFormat>('post');
  const [imageTransforms, setImageTransforms] = useState<
    Record<StudioFormat, ImageTransform>
  >({
    post: { ...DEFAULT_IMAGE_TRANSFORM },
    story: { ...DEFAULT_IMAGE_TRANSFORM },
  });
  const [overlayTransforms, setOverlayTransforms] = useState<
    Record<StudioFormat, StatusOverlayTransform>
  >({
    post: { ...DEFAULT_STATUS_OVERLAY_TRANSFORM },
    story: { ...DEFAULT_STATUS_OVERLAY_TRANSFORM },
  });
  const [designHost, setDesignHost] = useState<HTMLDivElement | null>(null);
  const [designReady, setDesignReady] = useState(false);
  const designCaptureRef = useRef<
    ((format: StudioFormat) => Promise<Blob>) | null
  >(null);
  const [post, setPost] = useState<SlotState>(EMPTY_SLOT);
  const [story, setStory] = useState<SlotState>(EMPTY_SLOT);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<StatusExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundFormat, setSoundFormat] = useState<StudioFormat | null>(null);
  const [fullscreenFormat, setFullscreenFormat] =
    useState<StudioFormat | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  /** Her önizlemenin 0–5 sn döngü konumu; ses bunu takip eder. */
  const clockRef = useRef<Record<StudioFormat, number>>({ post: 0, story: 0 });
  const busyRef = useRef(false);

  const statusMeta = useMemo(
    () => STATUS_VIDEO_OPTIONS.find((o) => o.id === kind)!,
    [kind]
  );

  const designMode = sourceMode === 'design';
  const hasAnySource = designMode
    ? designReady
    : Boolean(post.file || story.file);
  const canExportPost = designMode ? designReady : Boolean(post.file);
  const canExportStory = designMode ? designReady : Boolean(story.file);
  const canExportBoth = designMode
    ? designReady
    : Boolean(post.file && story.file);
  const audioPlaying = isActive && hasAnySource && !exporting;
  const previewPlaying = audioPlaying && !fullscreenFormat;
  const closeFullscreen = useCallback(() => setFullscreenFormat(null), []);
  const setOverlayTransformFor = useCallback(
    (format: StudioFormat, next: StatusOverlayTransform) =>
      setOverlayTransforms((current) => ({ ...current, [format]: next })),
    []
  );

  // Önizlemeler sessiz döner; ses yalnızca kullanıcının açtığı formatta ve
  // o formatın animasyonuyla eşzamanlı çalar.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    if (!audioPlaying || !soundFormat) return;

    let raf = 0;
    const follow = () => {
      const target = clockRef.current[soundFormat];
      if (Math.abs(audio.currentTime - target) > 0.25) {
        audio.currentTime = target;
      }
      raf = requestAnimationFrame(follow);
    };

    void audio.play().catch(() => undefined);
    raf = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(raf);
      audio.pause();
    };
  }, [audioPlaying, soundFormat, kind]);

  useEffect(() => {
    return () => {
      revokeUrl(post.url);
      revokeUrl(story.url);
      void terminateStatusFFmpeg();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  const setSlot = useCallback((format: StudioFormat, file: File | null) => {
    const apply = (prev: SlotState): SlotState => {
      revokeUrl(prev.url);
      if (!file) return EMPTY_SLOT;
      return { file, url: URL.createObjectURL(file), label: file.name };
    };
    if (format === 'post') setPost((prev) => apply(prev));
    else setStory((prev) => apply(prev));
    setImageTransforms((current) => ({
      ...current,
      [format]: { ...DEFAULT_IMAGE_TRANSFORM },
    }));
    setError(null);
  }, []);

  const handleUploadedFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      try {
        const selected = files.slice(0, 2);
        const detected = await Promise.all(
          selected.map(async (file) => {
            const { width, height } = await imageDimensions(file);
            return {
              file,
              format: formatFromAspectRatio(width, height),
              width,
              height,
            };
          })
        );

        const assigned = new Set<StudioFormat>();
        for (const item of detected) {
          setSlot(item.format, item.file);
          assigned.add(item.format);
        }
        const firstDetected = assigned.values().next().value as
          | StudioFormat
          | undefined;
        if (firstDetected) setPreviewFormat(firstDetected);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : 'Görsel oranı okunamadı.'
        );
      }
    },
    [setSlot]
  );

  const handleCaptureReady = useCallback(
    (capture: ((format: StudioFormat) => Promise<Blob>) | null) => {
      designCaptureRef.current = capture;
    },
    []
  );

  const runExport = useCallback(
    async (formats: StudioFormat[]) => {
      if (busyRef.current) return;

      if (designMode && !designReady) {
        setError('Önce portföy görseli ekleyip danışman seçin.');
        return;
      }
      if (!designMode) {
        const missing = formats.filter(
          (f) => !(f === 'post' ? post.file : story.file)
        );
        if (missing.length) {
          setError(
            `${missing.map((f) => SOCIAL_STUDIO_CANVAS[f].label).join(' ve ')} görseli gerekli.`
          );
          return;
        }
      }

      busyRef.current = true;
      setExporting(true);
      setError(null);
      setProgress({ ratio: 0, label: 'Hazırlanıyor…' });

      try {
        for (let i = 0; i < formats.length; i += 1) {
          const format = formats[i]!;
          let file: File;
          if (designMode) {
            const capture = designCaptureRef.current;
            if (!capture) throw new Error('Tasarım tuvali hazır değil');
            setProgress({
              ratio: i / formats.length,
              label: `${SOCIAL_STUDIO_CANVAS[format].label}: tasarım hazırlanıyor…`,
            });
            const blob = await capture(format);
            file = new File([blob], `zebra-tasarim-${format}.png`, {
              type: 'image/png',
            });
          } else {
            file = (format === 'post' ? post.file : story.file)!;
          }
          const baseRatio = i / formats.length;
          const span = 1 / formats.length;
          const blob = await encodeStatusMp4({
            sourceFile: file,
            kind,
            format,
            sourceTransform: designMode
              ? DEFAULT_IMAGE_TRANSFORM
              : imageTransforms[format],
            overlayTransform: overlayTransforms[format],
            onProgress: (p) => {
              setProgress({
                ratio: baseRatio + p.ratio * span,
                label: `${SOCIAL_STUDIO_CANVAS[format].label}: ${p.label}`,
              });
            },
          });
          downloadBlob(blob, statusExportFileName(kind, format));
        }
        setProgress({ ratio: 1, label: 'İndirme tamamlandı' });
      } catch (err) {
        console.error(err);
        // FFmpeg worker'ı hataları düz metin olarak reddediyor; olduğu gibi göster.
        const detail = err instanceof Error ? err.message : String(err);
        setError(
          detail
            ? `Video üretilemedi: ${detail}`
            : 'Video üretilemedi. Görsel formatını kontrol edip tekrar deneyin.'
        );
        setProgress(null);
        await terminateStatusFFmpeg();
      } finally {
        busyRef.current = false;
        setExporting(false);
        window.setTimeout(() => setProgress(null), 1800);
      }
    },
    [
      designMode,
      designReady,
      imageTransforms,
      overlayTransforms,
      kind,
      post.file,
      story.file,
    ]
  );

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#E5B540]/30 bg-[#E5B540]/10 px-3 py-1 text-xs font-medium text-[#E5B540]">
          <Film className="h-3.5 w-3.5" />
          Satıldı / Kiralandı
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Durum Videosu Stüdyosu
        </h1>
      </div>

      <audio ref={audioRef} src={STATUS_AUDIO_URL} preload="auto" loop={false} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_318px] lg:items-start xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
      <section className="z-card p-4 backdrop-blur-xl sm:p-5 lg:col-start-1">
        <p className="mb-3 text-sm font-medium text-zinc-200">Durum seçimi</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {STATUS_VIDEO_OPTIONS.map((option) => {
            const active = option.id === kind;
            const previewFormat: StudioFormat | null = post.url
              ? 'post'
              : story.url
                ? 'story'
                : null;
            return (
              <div
                key={option.id}
                className={[
                  'flex overflow-hidden rounded-xl border transition',
                  active
                    ? 'border-[#E5B540] bg-[#E5B540]/15 text-[#E5B540]'
                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/5',
                  exporting ? 'opacity-50' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setKind(option.id)}
                  className="min-w-0 flex-1 px-3.5 py-3 text-left text-sm font-medium leading-tight sm:px-4"
                >
                  {option.label}
                </button>
                <button
                  type="button"
                  disabled={exporting || !previewFormat}
                  onClick={() => {
                    setKind(option.id);
                    if (previewFormat) setFullscreenFormat(previewFormat);
                  }}
                  aria-label={`${option.label} tam ekran önizleme`}
                  title={
                    previewFormat
                      ? `${option.label} tam ekran önizle`
                      : 'Önce görsel yükleyin'
                  }
                  className="inline-flex w-11 shrink-0 items-center justify-center border-l border-white/10 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="z-card p-4 backdrop-blur-xl sm:p-5 lg:col-start-1">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">Video görseli</p>
            <p className="mt-1 text-xs text-zinc-500">
              Fotoğraf yükleyin veya isimli tasarımı burada üretin.
            </p>
          </div>
          <div className="inline-flex self-start rounded-full border border-white/10 bg-black/30 p-1">
            <button
              type="button"
              disabled={exporting}
              onClick={() => setSourceMode('upload')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                sourceMode === 'upload'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Yükle
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => setSourceMode('design')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                sourceMode === 'design'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Burada üret
            </button>
          </div>
        </div>

        {sourceMode === 'upload' ? (
          <UnifiedUpload
            post={post}
            story={story}
            disabled={exporting}
            onFiles={(files) => void handleUploadedFiles(files)}
            onClear={(format) => {
              setSlot(format, null);
              if (previewFormat === format) {
                const fallbackFormat = format === 'post' ? 'story' : 'post';
                const fallbackSlot = fallbackFormat === 'post' ? post : story;
                if (fallbackSlot.file) setPreviewFormat(fallbackFormat);
              }
              setError(null);
            }}
          />
        ) : designHost ? (
          <ZebraStudio
            userId={userId}
            fallbackName={fallbackName}
            role={role}
            embedded
            namedOnly
            canvasChromeless
            canvasPortalTarget={designHost}
            formatOverride={previewFormat}
            onCaptureReady={handleCaptureReady}
            onDesignReadyChange={setDesignReady}
            portfolioDraggableInPreview
            canvasOverlay={
              <StatusOverlayLayer
                format={previewFormat}
                overlayUrl={statusMeta.overlayUrl}
                overlayHevcUrl={statusMeta.overlayHevcUrl}
                playing={previewPlaying}
                clockRef={clockRef}
                transform={overlayTransforms[previewFormat]}
                onTransformChange={(next) =>
                  setOverlayTransformFor(previewFormat, next)
                }
              />
            }
          />
        ) : (
          <div className="flex min-h-[120px] items-center justify-center text-xs text-zinc-500">
            Tasarım formu hazırlanıyor…
          </div>
        )}
      </section>

      <section className="z-card p-4 backdrop-blur-xl sm:p-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:row-span-3">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch">
          <div>
            <h2 className="text-base font-semibold text-white">Canlı Tuval</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Durum animasyonunu gerçek zamanlı kontrol edin.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-1 self-start rounded-full border border-white/10 bg-black/30 p-1 sm:inline-flex sm:w-auto lg:grid lg:w-full">
            {(['post', 'story'] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => setPreviewFormat(format)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                  previewFormat === format
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {format === 'post' ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <RectangleVertical className="h-3.5 w-3.5" />
                )}
                {SOCIAL_STUDIO_CANVAS[format].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center rounded-2xl border border-white/5 bg-black/20 px-3 py-4">
          {designMode ? (
            <div ref={setDesignHost} className="w-full" />
          ) : (
            <FormatPreview
              format={previewFormat}
              sourceUrl={previewFormat === 'post' ? post.url : story.url}
              overlayUrl={statusMeta.overlayUrl}
              overlayHevcUrl={statusMeta.overlayHevcUrl}
              imageTransform={imageTransforms[previewFormat]}
              onImageTransformChange={(next) =>
                setImageTransforms((current) => ({
                  ...current,
                  [previewFormat]: next,
                }))
              }
              overlayTransform={overlayTransforms[previewFormat]}
              onOverlayTransformChange={(next) =>
                setOverlayTransformFor(previewFormat, next)
              }
              playing={
                previewPlaying &&
                Boolean(previewFormat === 'post' ? post.url : story.url)
              }
              soundOn={soundFormat === previewFormat}
              onToggleSound={() =>
                setSoundFormat((prev) =>
                  prev === previewFormat ? null : previewFormat
                )
              }
              clockRef={clockRef}
              onFullscreen={() => setFullscreenFormat(previewFormat)}
            />
          )}
        </div>
        {designMode ? (
          <div className="mt-3 flex flex-col items-center gap-3">
            {designReady ? (
              <TransformBar
                segments={[{ id: 'overlay', label: 'Animasyon' }]}
                active="overlay"
                onSelect={() => undefined}
                percent={Math.round(overlayTransforms[previewFormat].scale * 100)}
                onMinus={() =>
                  setOverlayTransformFor(
                    previewFormat,
                    stepOverlayScale(
                      previewFormat,
                      overlayTransforms[previewFormat],
                      -OVERLAY_SCALE_STEP
                    )
                  )
                }
                onPlus={() =>
                  setOverlayTransformFor(
                    previewFormat,
                    stepOverlayScale(
                      previewFormat,
                      overlayTransforms[previewFormat],
                      OVERLAY_SCALE_STEP
                    )
                  )
                }
                onReset={() =>
                  setOverlayTransformFor(previewFormat, {
                    ...DEFAULT_STATUS_OVERLAY_TRANSFORM,
                  })
                }
              />
            ) : null}
            <p className="text-xs leading-relaxed text-zinc-500">
              Portföy görselini ve animasyon çerçevesini önizlemede
              sürükleyin. Durum animasyonu MP4 çıktısına encode
              sırasında eklenir.
            </p>
          </div>
        ) : null}
      </section>

      <section className="z-card p-4 backdrop-blur-xl sm:p-5 lg:col-start-1">
        <div className="mb-4">
          <p className="text-sm font-medium text-zinc-200">MP4 video indir</p>
          <p className="mt-1 text-xs text-zinc-500">
            Seçilen durum animasyonu ve sesiyle 5 saniyelik video oluşturulur.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            disabled={exporting || !canExportPost}
            onClick={() => void runExport(['post'])}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Post videosunu indir
          </button>
          <button
            type="button"
            disabled={exporting || !canExportStory}
            onClick={() => void runExport(['story'])}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Story videosunu indir
          </button>
          <button
            type="button"
            disabled={exporting || !canExportBoth}
            onClick={() => void runExport(['post', 'story'])}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E5B540] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#f0c45a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            İki videoyu indir
          </button>
        </div>

        {progress && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
              <span>{progress.label}</span>
              <span>{Math.round(progress.ratio * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#E5B540] transition-[width] duration-300"
                style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>
      </div>

      {fullscreenFormat &&
        (fullscreenFormat === 'post' ? post.url : story.url) && (
          <FullscreenPreviewModal
            format={fullscreenFormat}
            sourceUrl={
              (fullscreenFormat === 'post' ? post.url : story.url) as string
            }
            overlayUrl={statusMeta.overlayUrl}
            overlayHevcUrl={statusMeta.overlayHevcUrl}
            imageTransform={imageTransforms[fullscreenFormat]}
            onImageTransformChange={(next) =>
              setImageTransforms((current) => ({
                ...current,
                [fullscreenFormat]: next,
              }))
            }
            overlayTransform={overlayTransforms[fullscreenFormat]}
            onOverlayTransformChange={(next) =>
              setOverlayTransformFor(fullscreenFormat, next)
            }
            statusLabel={statusMeta.label}
            soundOn={soundFormat === fullscreenFormat}
            onToggleSound={() =>
              setSoundFormat((previous) =>
                previous === fullscreenFormat ? null : fullscreenFormat
              )
            }
            onClose={closeFullscreen}
            clockRef={clockRef}
          />
        )}
    </div>
  );
}
