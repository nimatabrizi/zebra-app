'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatTl } from '../lib/ivoListingCard';
import type { IvoPriceHistoryPayload } from '../lib/ivoDetailBundle';

type Props = {
  listingNo: string;
  onClose: () => void;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('tr-TR');
}

function formatUsd(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `≈ ${Math.round(n).toLocaleString('en-US')} USD`;
}

export default function IvoPriceHistoryModal({ listingNo, onClose }: Props) {
  const [data, setData] = useState<IvoPriceHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ivo/listings?view=price-history&listingNo=${encodeURIComponent(listingNo)}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Fiyat geçmişi yüklenemedi');
        if (!cancelled) setData((json.data || null) as IvoPriceHistoryPayload | null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Fiyat geçmişi yüklenemedi');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingNo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changes = useMemo(() => {
    const list = [...(data?.changes || [])];
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return list;
  }, [data]);

  const changeCount = data?.change_count ?? Math.max(0, changes.length - 1);
  const daysListed = data?.days_listed ?? null;
  const first = changes[0] || null;
  const last = changes[changes.length - 1] || null;
  const firstPrice = data?.first_price ?? first?.price ?? null;
  const currentPrice = data?.current_price ?? last?.price ?? null;
  const directionLabel =
    changeCount <= 0
      ? 'Bu ilanda fiyat değişikliği yok'
      : firstPrice != null &&
          currentPrice != null &&
          currentPrice < firstPrice
        ? 'Fiyat düştü'
        : firstPrice != null &&
            currentPrice != null &&
            currentPrice > firstPrice
          ? 'Fiyat yükseldi'
          : 'Fiyat hareketi var';

  const totalPct =
    firstPrice != null &&
    currentPrice != null &&
    firstPrice > 0 &&
    changeCount > 0
      ? ((currentPrice - firstPrice) / firstPrice) * 100
      : null;

  const isActive = data?.is_active !== false;
  const statusChanges = data?.status_changes || [];

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fiyat geçmişi"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--z-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--z-fg)]">
              Fiyat Geçmişi
            </h2>
            <p className="mt-0.5 text-[12px] tabular-nums text-[var(--z-muted)]">
              İlan no {listingNo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="z-btn-ghost shrink-0 px-2.5 py-1.5 text-[12px]"
          >
            Kapat
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
          ) : error ? (
            <p className="text-[13px] text-red-600">{error}</p>
          ) : !data ? (
            <p className="text-[14px] text-[var(--z-muted)]">Veri yok</p>
          ) : (
            <>
              <div className="rounded-2xl border border-[var(--z-border)] bg-[var(--z-fg)] text-[var(--z-bg,#fff)] p-4 space-y-3">
                <p className="text-[11px] tracking-wide opacity-80">
                  FİYAT YÖNÜ
                  {daysListed != null ? ` · ${daysListed} GÜN` : ''}
                </p>
                <p className="text-[15px] font-medium">{directionLabel}</p>
                {totalPct != null ? (
                  <p className="text-[12px] tabular-nums opacity-90">
                    Toplam {totalPct > 0 ? '+' : ''}
                    {totalPct.toLocaleString('tr-TR', {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </p>
                ) : null}
                <div className="rounded-xl bg-[var(--z-bg,#fff)] text-[var(--z-fg)] p-3">
                  <p className="text-[10px] tracking-wide text-[var(--z-muted)]">
                    İLK FİYAT
                  </p>
                  <p className="text-[22px] font-semibold tabular-nums">
                    {formatTl(firstPrice)}
                  </p>
                  <p className="text-[12px] text-[var(--z-muted)]">
                    {formatDate(data.first_date || first?.date)}
                  </p>
                  {first?.usd != null ? (
                    <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                      {formatUsd(first.usd)}
                    </p>
                  ) : null}
                </div>
                {daysListed != null ? (
                  <p className="text-center text-[12px] opacity-85">
                    {daysListed} gün yayında
                  </p>
                ) : null}
              </div>

              <div className="space-y-3">
                {changes.map((c, i) => {
                  const isFirst = i === 0;
                  const dropped =
                    c.prev != null && c.price != null && c.price < c.prev;
                  return (
                    <div key={`${c.date}-${i}`} className="flex gap-3">
                      <div className="flex w-3 flex-col items-center">
                        <span
                          className={`mt-1 h-2.5 w-2.5 rotate-45 ${
                            isFirst
                              ? 'bg-[var(--z-fg)]'
                              : dropped
                                ? 'bg-emerald-600'
                                : 'bg-amber-600'
                          }`}
                        />
                        {i < changes.length - 1 ? (
                          <span className="mt-1 w-px flex-1 bg-[var(--z-border)]" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-medium">
                              {isFirst ? 'İlk fiyat' : 'Fiyat değişimi'}{' '}
                              <span className="text-[var(--z-muted)] font-normal">
                                {formatDate(c.date)}
                              </span>
                            </p>
                            <p className="text-[11px] text-[var(--z-muted)]">
                              {isFirst
                                ? 'İlan ilk yayına bu fiyatla çıktı'
                                : c.pct != null
                                  ? `${c.pct > 0 ? '+' : ''}${c.pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`
                                  : 'Fiyat güncellendi'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-semibold tabular-nums">
                              {formatTl(c.price)}
                            </p>
                            {c.usd != null ? (
                              <p className="text-[10px] tabular-nums text-[var(--z-muted)]">
                                {formatUsd(c.usd)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <p className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  YAYIN ÇİZELGESİ
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[var(--z-border)] p-3">
                    <p className="text-[10px] text-[var(--z-muted)]">İLK YAYIN</p>
                    <p className="text-[13px] font-medium">
                      {formatDate(data.first_date)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--z-border)] p-3">
                    <p className="text-[10px] text-[var(--z-muted)]">ŞU AN</p>
                    <p
                      className={`text-[13px] font-medium ${
                        isActive ? 'text-emerald-700' : 'text-[var(--z-muted)]'
                      }`}
                    >
                      {isActive ? 'Yayında' : 'Pasif'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--z-border)] p-3">
                    <p className="text-[10px] text-[var(--z-muted)]">
                      TOPLAM YAYINDA
                    </p>
                    <p className="text-[13px] font-medium tabular-nums">
                      {daysListed != null ? `${daysListed} gün` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--z-border)] p-3">
                    <p className="text-[10px] text-[var(--z-muted)]">
                      YENİDEN YAYIN
                    </p>
                    <p className="text-[13px] font-medium">
                      {statusChanges.filter((s) =>
                        /aktif|yayın|active/i.test(String(s.status || ''))
                      ).length > 1
                        ? 'var'
                        : 'girmedi'}
                    </p>
                  </div>
                </div>
              </div>

              {statusChanges.length ? (
                <div className="space-y-2">
                  {statusChanges.map((s, i) => (
                    <div
                      key={`${s.date}-${i}`}
                      className="rounded-xl border border-[var(--z-border)] px-3 py-2 text-[12px]"
                    >
                      <p className="font-medium">
                        {formatDate(s.date)}{' '}
                        {/pasif|passive|kapalı/i.test(String(s.status || ''))
                          ? 'Pasife düştü'
                          : 'Yayına girdi'}
                      </p>
                      {daysListed != null && i === statusChanges.length - 1 ? (
                        <p className="mt-0.5 text-[11px] text-emerald-700">
                          {daysListed} gün yayında
                          {isActive ? ' (şu an yayında)' : ''}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--z-border)] px-3 py-2 text-[12px]">
                  <p className="font-medium">
                    {formatDate(data.first_date)} Yayına girdi
                  </p>
                  {daysListed != null ? (
                    <p className="mt-0.5 text-[11px] text-emerald-700">
                      {daysListed} gün yayında
                      {isActive ? ' (şu an yayında)' : ''}
                    </p>
                  ) : null}
                </div>
              )}

              {data.region?.avg_m2_price != null ? (
                <p className="text-[11px] text-[var(--z-muted)]">
                  Bölge ort.{' '}
                  <span className="tabular-nums">
                    {formatTl(Math.round(data.region.avg_m2_price))}/m²
                  </span>
                  {data.region.count != null
                    ? ` · ${data.region.count} emsal`
                    : ''}
                  {data.region.scope ? ` · ${data.region.scope}` : ''}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
