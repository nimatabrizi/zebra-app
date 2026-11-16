'use client';

import React, { useEffect, useState } from 'react';
import { formatTl } from '../lib/ivoListingCard';

type TwinItem = {
  no?: number | string;
  baslik?: string;
  title?: string;
  fiyat?: number;
  price?: number;
  m2_fiyat?: number;
  aktif?: boolean;
  is_active?: boolean;
  tip?: string;
  iliski?: string;
  relation?: string;
};

type Props = {
  listingNo: string;
  onClose: () => void;
  onOpenDetail?: (listingNo: string) => void;
};

export default function IvoTwinsPanel({
  listingNo,
  onClose,
  onOpenDetail,
}: Props) {
  const [items, setItems] = useState<TwinItem[]>([]);
  const [meta, setMeta] = useState<{
    total?: number;
    ikiz_olasi?: number;
    ikiz_kesin?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ivo/listings?view=twins&listingNo=${encodeURIComponent(listingNo)}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'İkizler yüklenemedi');
        if (!cancelled) {
          setItems(Array.isArray(json.items) ? json.items : []);
          setMeta(json.meta || null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'İkizler yüklenemedi');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingNo]);

  return (
    <div
      className="fixed inset-0 z-[85] flex justify-end bg-black/35"
      role="dialog"
      aria-modal="true"
      aria-label="İkiz ilanlar"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-[var(--z-bg,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--z-border)] px-4 py-3">
          <div>
            <h2 className="text-[16px] font-semibold">İkiz / benzer</h2>
            <p className="mt-0.5 text-[12px] tabular-nums text-[var(--z-muted)]">
              #{listingNo}
              {meta?.total != null ? ` · ${meta.total} kayıt` : ''}
              {meta?.ikiz_olasi != null ? ` · ${meta.ikiz_olasi} olası` : ''}
              {meta?.ikiz_kesin != null ? ` · ${meta.ikiz_kesin} kesin` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="z-btn-ghost px-2.5 py-1 text-[12px]">
            Kapat
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loading ? (
            <p className="text-[13px] text-[var(--z-muted)]">Yükleniyor…</p>
          ) : error ? (
            <p className="text-[13px] text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-[var(--z-muted)]">İkiz/benzer ilan yok</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it, i) => {
                const no = String(it.no ?? '').replace(/\D/g, '');
                const title = it.baslik || it.title || (no ? `#${no}` : `Kayıt ${i + 1}`);
                const price = it.fiyat ?? it.price ?? null;
                const active = it.aktif !== false && it.is_active !== false;
                const rel = it.iliski || it.relation || it.tip || null;
                return (
                  <li
                    key={no || i}
                    className="rounded-xl border border-[var(--z-border)] px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {rel ? (
                          <p className="text-[10px] uppercase tracking-wide text-[var(--z-muted)]">
                            {rel}
                            {!active ? ' · pasif' : ''}
                          </p>
                        ) : null}
                        {onOpenDetail && no ? (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenDetail(no);
                              onClose();
                            }}
                            className="mt-0.5 text-left text-[13px] font-medium hover:underline line-clamp-2"
                          >
                            {title}
                          </button>
                        ) : (
                          <p className="mt-0.5 text-[13px] font-medium line-clamp-2">{title}</p>
                        )}
                        {no ? (
                          <p className="text-[11px] tabular-nums text-[var(--z-muted)]">#{no}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-[13px] font-semibold tabular-nums">
                        {formatTl(price)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
