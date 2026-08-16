'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Move, X, ZoomIn } from 'lucide-react';

/**
 * Stüdyo gösterim çerçevesi (kare PNG object-contain + object-bottom ile buraya oturur).
 * Depolanan dosyalar karedir; kırpma çıktısı da kare olmalıdır.
 */
export const CONSULTANT_PHOTO_ASPECT = 0.72;

/** Depolama / kırpma tuvali — mevcut PNG’ler ~3627×3612 (≈1:1). */
export const CONSULTANT_PHOTO_STORAGE_ASPECT = 1;
const OUTPUT_SIZE = 2048;

/**
 * Cem Çubukçu hariç 20 danışman PNG’sinden ölçülen ortalama (siyah zemin, içerik bbox):
 * face cx≈47.2% cy≈22.7% d≈30.4% | body top≈10.1% bottom≈99.8% w≈63.0%
 * Rehber: yüz dairesi + gövde kutusu bu ortalamaya göre.
 */
const FACE_GUIDE = {
  cxPercent: 47.2,
  cyPercent: 22.7,
  diameterPercent: 30.4,
} as const;

const BODY_GUIDE = {
  topPercent: 10.1,
  bottomPercent: 99.8,
  widthPercent: 63.0,
  cxPercent: 47.2,
} as const;

type PhotoCropDialogProps = {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

export default function PhotoCropDialog({
  file,
  onCancel,
  onConfirm,
}: PhotoCropDialogProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minScale, setMinScale] = useState(0.1);
  const [maxScale, setMaxScale] = useState(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef(false);
  const transformRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  transformRef.current = { scale, offset };

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    fittedRef.current = false;
    setFrameReady(false);
    setNatural(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setError('Görsel yüklenemedi');
    img.src = src;
  }, [src]);

  const getFrameSize = () => {
    const frame = frameRef.current;
    const fw = frame?.clientWidth || 0;
    const fh = frame?.clientHeight || 0;
    return { fw, fh };
  };

  const clampOffset = (
    next: { x: number; y: number },
    nextScale: number,
    nw: number,
    nh: number
  ) => {
    const { fw, fh } = getFrameSize();
    if (fw < 2 || fh < 2) return next;
    const iw = nw * nextScale;
    const ih = nh * nextScale;
    const keep = Math.min(fw, fh) * 0.08;
    return {
      x: Math.min(fw - keep, Math.max(keep - iw, next.x)),
      y: Math.min(fh - keep, Math.max(keep - ih, next.y)),
    };
  };

  /** İlk yerleşim: contain + ortala (kullanıcı sarı daireye çeker) */
  const fitToFrame = (nw: number, nh: number) => {
    const { fw, fh } = getFrameSize();
    if (fw < 2 || fh < 2) return false;

    const contain = Math.min(fw / nw, fh / nh);
    const cover = Math.max(fw / nw, fh / nh);
    setMinScale(contain * 0.2);
    setMaxScale(cover * 5);

    const start = contain;
    setScale(start);
    setOffset({
      x: (fw - nw * start) / 2,
      y: (fh - nh * start) / 2,
    });
    setFrameReady(true);
    return true;
  };

  useEffect(() => {
    if (!natural) return;
    fittedRef.current = false;

    const tryFit = () => {
      if (fittedRef.current) return;
      if (fitToFrame(natural.w, natural.h)) {
        fittedRef.current = true;
      }
    };

    tryFit();
    const id = requestAnimationFrame(() => {
      tryFit();
      requestAnimationFrame(tryFit);
    });

    const frame = frameRef.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && frame
        ? new ResizeObserver(() => {
            if (!fittedRef.current) tryFit();
          })
        : null;
    if (frame && ro) ro.observe(frame);

    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit once per natural size
  }, [natural]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!natural || !frameReady) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !natural) return;
    setOffset(
      clampOffset(
        {
          x: drag.origX + (e.clientX - drag.startX),
          y: drag.origY + (e.clientY - drag.startY),
        },
        scale,
        natural.w,
        natural.h
      )
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const onZoom = (value: number) => {
    if (!natural) return;
    const { fw, fh } = getFrameSize();
    const next = Math.max(minScale, Math.min(maxScale, value));
    const cx = (fw * FACE_GUIDE.cxPercent) / 100;
    const cy = (fh * FACE_GUIDE.cyPercent) / 100;
    const relX = (cx - offset.x) / scale;
    const relY = (cy - offset.y) / scale;
    setScale(next);
    setOffset(
      clampOffset(
        { x: cx - relX * next, y: cy - relY * next },
        next,
        natural.w,
        natural.h
      )
    );
  };

  /**
   * Önizleme ile birebir: sol-üst (offset) + genişlik (natural*scale) formülü,
   * çerçeve clientWidth/Height → OUTPUT_SIZE kare.
   */
  const exportCropped = async () => {
    if (!src || !natural) return;
    setSaving(true);
    setError(null);
    try {
      const { fw, fh } = getFrameSize();
      if (fw < 2 || fh < 2) throw new Error('Kırpma alanı hazır değil');

      const { scale: s, offset: o } = transformRef.current;
      const img = await loadImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas açılamadı');

      // Önizleme ile birebir eşleme (fw×fh → OUTPUT×OUTPUT)
      // Boş alanlar şeffaf kalsın (siyah fill yok)
      const sx = OUTPUT_SIZE / fw;
      const sy = OUTPUT_SIZE / fh;

      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        o.x * sx,
        o.y * sy,
        natural.w * s * sx,
        natural.h * s * sy
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG üretilemedi'))),
          'image/png'
        );
      });
      await onConfirm(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kırpma başarısız');
      setSaving(false);
    }
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onCancel, saving]);

  const faceTopPercent =
    FACE_GUIDE.cyPercent - FACE_GUIDE.diameterPercent / 2;
  const faceLeftPercent =
    FACE_GUIDE.cxPercent - FACE_GUIDE.diameterPercent / 2;
  const bodyHeightPercent = BODY_GUIDE.bottomPercent - BODY_GUIDE.topPercent;
  const bodyLeftPercent = BODY_GUIDE.cxPercent - BODY_GUIDE.widthPercent / 2;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer border-0"
        onClick={() => {
          if (!saving) onCancel();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-crop-title"
        className="relative w-full max-w-xl max-h-[min(92dvh,900px)] overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2
              id="photo-crop-title"
              className="text-[16px] font-medium text-white"
            >
              Fotoğrafı hizala
            </h2>
            <p className="text-[12px] text-[#86868B] mt-0.5">
              Yüzü sarı daireye, gövdeyi ızgaraya getir — kaydettiğin kompozisyon
              aynen yüklenir
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="w-9 h-9 rounded-full text-[#86868B] hover:text-white inline-flex items-center justify-center cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-5 pb-2 flex justify-center">
          <div
            ref={frameRef}
            className="relative w-full max-w-[340px] overflow-hidden rounded-xl bg-black touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ aspectRatio: '1 / 1' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {src && natural && frameReady ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: natural.w * scale,
                  height: natural.h * scale,
                  left: offset.x,
                  top: offset.y,
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#86868B]" />
              </div>
            )}

            <div className="pointer-events-none absolute inset-0">
              {/* 3×3 grid — ortalama gövde/yüz referansı */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/12" />
                ))}
              </div>
              {/* Ortalama gövde kutusu */}
              <div
                className="absolute border border-dashed border-white/35 rounded-sm"
                style={{
                  left: `${bodyLeftPercent}%`,
                  top: `${BODY_GUIDE.topPercent}%`,
                  width: `${BODY_GUIDE.widthPercent}%`,
                  height: `${bodyHeightPercent}%`,
                }}
              />
              {/* Ortalama yüz dairesi */}
              <div
                className="absolute rounded-full border-2 border-[#E5B540] shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]"
                style={{
                  left: `${faceLeftPercent}%`,
                  top: `${faceTopPercent}%`,
                  width: `${FACE_GUIDE.diameterPercent}%`,
                  aspectRatio: '1',
                }}
              />
              <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/80 tracking-wide">
                Yüz → sarı daire · Gövde → kesik çerçeve
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-[#86868B] shrink-0" />
            <input
              type="range"
              min={minScale}
              max={maxScale}
              step={0.001}
              value={scale}
              onChange={(e) => onZoom(Number(e.target.value))}
              className="flex-1 accent-white"
              disabled={!frameReady}
            />
            <Move className="w-4 h-4 text-[#86868B] shrink-0" />
          </label>

          {error ? (
            <p className="text-[13px] text-[#FF3B30]">{error}</p>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="flex-1 h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => void exportCropped()}
              disabled={saving || !natural || !frameReady}
              className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:bg-neutral-100"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Kaydet ve yükle
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel yüklenemedi'));
    img.src = src;
  });
}
