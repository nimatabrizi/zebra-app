'use client';

import React, { useEffect, useState } from 'react';

type Props = {
  listingNo: string;
  onClose: () => void;
  onOpenDetail?: (listingNo: string) => void;
};

const STORAGE_KEY = 'zebra-ivo-activity';

type ActivityStore = Record<
  string,
  { viewedAt: string; count: number }
>;

function readStore(): ActivityStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ActivityStore;
  } catch {
    return {};
  }
}

function writeStore(store: ActivityStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export default function IvoActivityModal({
  listingNo,
  onClose,
  onOpenDetail,
}: Props) {
  const [entry, setEntry] = useState<{ viewedAt: string; count: number } | null>(
    null
  );

  useEffect(() => {
    const store = readStore();
    const prev = store[listingNo];
    const next = {
      viewedAt: new Date().toISOString(),
      count: (prev?.count || 0) + 1,
    };
    store[listingNo] = next;
    writeStore(store);
    setEntry(next);
  }, [listingNo]);

  const viewedLabel = entry?.viewedAt
    ? new Date(entry.viewedAt).toLocaleString('tr-TR')
    : '—';

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="İşlem Geçmişi"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--z-border)] px-4 py-3">
          <div>
            <h2 className="text-[16px] font-semibold">İşlem Geçmişi</h2>
            <p className="mt-0.5 text-[12px] tabular-nums text-[var(--z-muted)]">
              İlan #{listingNo}
            </p>
          </div>
          <button type="button" onClick={onClose} className="z-btn-ghost px-2.5 py-1 text-[12px]">
            Kapat
          </button>
        </header>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900">
            İncelendi · {viewedLabel}
          </div>
          <p className="text-[12px] text-[var(--z-muted)]">
            Bu cihazda {entry?.count ?? 1} kez açıldı. Favori ve paylaşım
            işlemleri kart / detay çubuğundan yapılır.
          </p>
          <div className="flex flex-wrap gap-2">
            {onOpenDetail ? (
              <button
                type="button"
                className="z-btn-primary px-3 py-2 text-[12px]"
                onClick={() => {
                  onOpenDetail(listingNo);
                  onClose();
                }}
              >
                Detayı aç
              </button>
            ) : null}
            <button type="button" className="z-btn-ghost px-3 py-2 text-[12px]" onClick={onClose}>
              Tamam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
