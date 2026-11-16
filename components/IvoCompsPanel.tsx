'use client';

import React, { useEffect, useState } from 'react';
import {
  formatDiffPct,
  formatTl,
  priceMeterPercent,
  type IvoListingCardModel,
} from '../lib/ivoListingCard';

type Peer = IvoListingCardModel & { rank: number; isSubject: boolean };

type CompsPayload = {
  subject: IvoListingCardModel;
  matchLabel: string;
  total: number;
  rank: number | null;
  peers: Peer[];
};

type Props = {
  listingNo: string;
  onClose: () => void;
  onOpenDetail?: (listingNo: string) => void;
};

export default function IvoCompsPanel({
  listingNo,
  onClose,
  onOpenDetail,
}: Props) {
  const [data, setData] = useState<CompsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ivo/listings?view=comps&listingNo=${encodeURIComponent(listingNo)}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Emsaller yüklenemedi');
        if (!cancelled) setData(json as CompsPayload);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Emsaller yüklenemedi');
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

  const subject = data?.subject;
  const stats = subject?.priceStats;
  const pin =
    subject && stats ? priceMeterPercent(subject.priceM2, stats) : null;
  const diff = stats ? formatDiffPct(stats.diff_pct) : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/35"
      role="dialog"
      aria-modal="true"
      aria-label="Rakipler"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-[var(--z-bg,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--z-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--z-fg)]">
              Rakipler
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--z-muted)] truncate">
              #{listingNo}
              {subject?.title ? ` · ${subject.title}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="z-btn-ghost px-2.5 py-1 text-[12px] shrink-0"
          >
            Kapat
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <p className="text-[13px] text-[var(--z-muted)]">Yükleniyor…</p>
          ) : error ? (
            <p className="text-[13px] text-red-600">{error}</p>
          ) : data && subject ? (
            <>
              <section className="space-y-2 rounded-xl border border-[var(--z-border)] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12px] text-[var(--z-muted)]">
                    Bölge ortalaması
                  </p>
                  {data.rank != null ? (
                    <p className="text-[12px] tabular-nums text-[var(--z-fg-soft)]">
                      {data.rank}. sıra / {data.total}
                    </p>
                  ) : null}
                </div>
                {stats?.avg_m2_price != null ? (
                  <p className="text-[15px] font-medium tabular-nums text-[var(--z-fg)]">
                    {formatTl(stats.avg_m2_price)}/m²
                    {typeof stats.count === 'number'
                      ? ` · ${stats.count} emsal (kaynak)`
                      : ''}
                  </p>
                ) : (
                  <p className="text-[13px] text-[var(--z-muted)]">
                    Kaynak ortalama yok — listedeki akranlar kullanılıyor
                  </p>
                )}
                {subject.priceM2 != null ? (
                  <p className="text-[12px] text-[var(--z-muted)]">
                    Bu ilan{' '}
                    <span className="tabular-nums text-[var(--z-fg-soft)]">
                      {formatTl(subject.priceM2)}/m²
                    </span>
                    {diff ? (
                      <span
                        className={
                          (stats?.diff_pct ?? 0) > 0
                            ? ' text-amber-700'
                            : (stats?.diff_pct ?? 0) < 0
                              ? ' text-emerald-700'
                              : ''
                        }
                      >
                        {' '}
                        ({diff} ortalamaya)
                      </span>
                    ) : null}
                  </p>
                ) : null}

                {stats?.min_m2_price != null && stats.max_m2_price != null ? (
                  <div className="pt-1 space-y-1">
                    <div className="relative h-2 rounded-full overflow-hidden bg-[linear-gradient(90deg,#34d399_0%,#fbbf24_55%,#f87171_100%)]">
                      {pin != null ? (
                        <span
                          className="absolute top-1/2 z-[1] h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--z-fg)] shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
                          style={{ left: `${pin}%` }}
                        />
                      ) : null}
                    </div>
                    <div className="flex justify-between text-[10px] tabular-nums text-[var(--z-muted)]">
                      <span>{formatTl(stats.min_m2_price)}</span>
                      <span>{formatTl(stats.max_m2_price)}</span>
                    </div>
                  </div>
                ) : null}

                <p className="text-[11px] text-[var(--z-muted)]">
                  Liste: {data.matchLabel}
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-[13px] font-medium text-[var(--z-fg)]">
                  ₺/m² ucuzdan pahalıya
                </h3>
                <ul className="space-y-2">
                  {data.peers.map((p) => {
                    const loc = [p.neighborhood, p.district]
                      .filter(Boolean)
                      .join(' / ');
                    return (
                      <li
                        key={p.id}
                        className={`rounded-xl border px-3 py-2.5 ${
                          p.isSubject
                            ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)]'
                            : 'border-[var(--z-border)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                              {p.rank}. sıra
                              {p.isSubject ? ' · bu ilan' : ''}
                            </p>
                            {onOpenDetail ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenDetail(p.listingNo);
                                  onClose();
                                }}
                                className="mt-0.5 block w-full text-left text-[13px] font-medium text-[var(--z-fg)] hover:underline line-clamp-2"
                              >
                                {p.title}
                              </button>
                            ) : (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 block text-[13px] font-medium text-[var(--z-fg)] hover:underline line-clamp-2"
                              >
                                {p.title}
                              </a>
                            )}
                            <p className="mt-0.5 text-[11px] text-[var(--z-muted)] truncate">
                              {[p.rooms, p.areaM2 != null ? `${p.areaM2} m²` : null, loc]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-semibold tabular-nums text-[var(--z-fg)]">
                              {formatTl(p.priceTl)}
                            </p>
                            <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                              {formatTl(p.priceM2)}/m²
                            </p>
                            {p.priceUsd != null ? (
                              <p className="text-[10px] tabular-nums text-[var(--z-muted)]">
                                ≈ {Math.round(p.priceUsd).toLocaleString('en-US')} $
                              </p>
                            ) : null}
                            {p.activeDays != null ? (
                              <p className="text-[10px] tabular-nums text-[var(--z-muted)]">
                                {p.activeDays} gün
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
