'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Images, Share2, X } from 'lucide-react';
import {
  downloadGeneratedImages,
  shareGeneratedImages,
  type GeneratedImageFile,
} from '../lib/generatedImageDelivery';

export default function GeneratedImageShareSheet({
  images,
  onClose,
}: {
  images: GeneratedImageFile[];
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl] = useState(() =>
    images[0] ? URL.createObjectURL(images[0].blob) : ''
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleShare = async () => {
    setSharing(true);
    setError('');
    try {
      const result = await shareGeneratedImages(images);
      if (result === 'shared') onClose();
    } catch {
      setError('Apple paylaşım menüsü açılamadı. Dosya olarak indirebilirsiniz.');
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    await downloadGeneratedImages(images);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Görseli kaydet veya paylaş"
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sharing) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-[28px] border border-white/10 bg-[#1C1C1E] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/25" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Görsel hazır</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#AEAEB2]">
              Apple menüsünde “Görseli Kaydet” ile Fotoğraflar’a ekleyebilir
              veya doğrudan paylaşabilirsiniz.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sharing}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-40"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-5 flex items-center gap-4 rounded-2xl bg-black/25 p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Oluşturulan görsel"
              className="h-20 w-20 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/10">
              <Images className="h-6 w-6 text-white/60" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {images.length === 1
                ? images[0]?.fileName
                : `${images.length} PNG görsel`}
            </p>
            <p className="mt-1 text-xs text-[#8E8E93]">
              PNG · Yüksek çözünürlük
            </p>
          </div>
        </div>

        {error ? (
          <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={sharing}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0A84FF] text-[15px] font-semibold text-white active:bg-[#0071E3] disabled:opacity-50"
        >
          <Share2 className="h-5 w-5" />
          {sharing ? 'Apple menüsü açılıyor…' : 'Kaydet veya paylaş'}
        </button>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={sharing}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium text-[#0A84FF] disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Dosya olarak indir
        </button>
      </div>
    </div>,
    document.body
  );
}
