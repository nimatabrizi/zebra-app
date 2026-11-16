'use client';

import React, { useState } from 'react';
import {
  buildListingChips,
  formatCardDate,
  formatTl,
  priceMeterPercent,
  type IvoListingCardModel,
} from '../lib/ivoListingCard';

type Props = {
  listing: IvoListingCardModel;
  onOpenDetail?: (listingNo: string) => void;
  onOpenComps?: (listingNo: string) => void;
  onOpenPriceHistory?: (listingNo: string) => void;
  onOpenTwins?: (listingNo: string) => void;
  onOpenActivity?: (listingNo: string) => void;
};

function PriceMeter({
  listing,
  onOpenComps,
}: {
  listing: IvoListingCardModel;
  onOpenComps?: (listingNo: string) => void;
}) {
  const stats = listing.priceStats;
  if (!stats || typeof stats.avg_m2_price !== 'number') return null;

  const pin = priceMeterPercent(listing.priceM2, stats);
  const avgPin = priceMeterPercent(stats.avg_m2_price, stats);
  const count = typeof stats.count === 'number' ? stats.count : null;

  const body = (
    <>
      <div className="flex justify-between text-[10px] tabular-nums text-[var(--z-muted)] mb-1">
        <span>ort: {formatTl(stats.avg_m2_price)}</span>
        <span>
          min: {formatTl(stats.min_m2_price)} · max:{' '}
          {formatTl(stats.max_m2_price)}
          {count != null ? ` · ${count} emsal` : ''}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden bg-[linear-gradient(90deg,#34d399_0%,#fbbf24_55%,#f87171_100%)]">
        {avgPin != null ? (
          <span
            className="absolute top-0 z-[1] h-full w-0.5 -translate-x-1/2 bg-[var(--z-fg)]"
            style={{ left: `${avgPin}%` }}
          />
        ) : null}
        {pin != null ? (
          <span
            className="absolute top-1/2 z-[2] h-0 w-0 -translate-x-1/2 -translate-y-[70%] border-x-[5px] border-x-transparent border-t-[8px] border-t-emerald-600"
            style={{ left: `${pin}%` }}
          />
        ) : null}
      </div>
    </>
  );

  if (!onOpenComps) return <div className="mt-2">{body}</div>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenComps(listing.listingNo);
      }}
      className="mt-2 block w-full text-left hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--z-border-strong)] rounded-lg"
      aria-label="Rakipler / emsaller"
    >
      {body}
    </button>
  );
}

export default function IvoListingCard({
  listing,
  onOpenDetail,
  onOpenComps,
  onOpenPriceHistory,
  onOpenTwins,
  onOpenActivity,
}: Props) {
  const [favBusy, setFavBusy] = useState(false);
  const [favOn, setFavOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const location = [listing.city, listing.district, listing.neighborhood]
    .filter(Boolean)
    .join(' / ');

  const agentLine = [listing.agency?.name, listing.agent?.name]
    .filter(Boolean)
    .join(' · ');

  const priceDropPct =
    listing.priceChange &&
    listing.priceChange.prev_price != null &&
    listing.priceChange.current_price != null &&
    listing.priceChange.prev_price !== listing.priceChange.current_price
      ? Math.round(
          ((listing.priceChange.current_price -
            listing.priceChange.prev_price) /
            listing.priceChange.prev_price) *
            1000
        ) / 10
      : null;

  const dropped = priceDropPct != null && priceDropPct < 0;
  const rose = priceDropPct != null && priceDropPct > 0;
  const firstDate = formatCardDate(listing.firstDate);
  const chips = buildListingChips(listing);
  const openDetail = () => onOpenDetail?.(listing.listingNo);

  const avatarSrc = listing.agency?.logo || listing.agent?.photo || null;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (favBusy) return;
    setFavBusy(true);
    try {
      const res = await fetch('/api/ivo/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'favorite',
          listingNo: listing.listingNo,
          on: !favOn,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Favori güncellenemedi');
      setFavOn(Boolean(json.on ?? !favOn));
    } catch {
      /* keep prior */
    } finally {
      setFavBusy(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--z-border)] bg-[var(--z-surface,transparent)]">
      <div className="flex items-start gap-2 px-3 pt-3">
        <button
          type="button"
          onClick={openDetail}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-[13px] font-bold text-amber-900"
          title={listing.kind || 'Tür'}
        >
          {listing.kindLetter}
        </button>
        <button
          type="button"
          onClick={openDetail}
          className="min-w-0 flex-1 text-left text-[14px] font-semibold leading-snug text-[var(--z-fg)] hover:underline line-clamp-2"
        >
          {listing.title}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="İşlem Geçmişi"
            aria-label="İşlem Geçmişi"
            onClick={(e) => {
              e.stopPropagation();
              onOpenActivity?.(listing.listingNo);
            }}
            className="rounded-md p-1.5 text-emerald-700 hover:bg-[var(--z-hover)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M18 6 7 17l-5-5" />
              <path d="m22 10-7.5 7.5L13 16" />
            </svg>
          </button>
          <button
            type="button"
            title={favOn ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            aria-label={favOn ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            aria-pressed={favOn}
            disabled={favBusy}
            onClick={toggleFavorite}
            className={`rounded-md p-1.5 hover:bg-[var(--z-hover)] ${
              favOn ? 'text-amber-500' : 'text-[var(--z-muted)]'
            }`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={favOn ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
            </svg>
          </button>
          {listing.activeDays != null ? (
            <span
              className="ml-0.5 rounded-md border border-[var(--z-border)] px-1.5 py-0.5 text-center text-[10px] leading-tight tabular-nums text-[var(--z-fg-soft)]"
              title="İlk yayından bugüne geçen gün"
            >
              <b className="block text-[12px]">{listing.activeDays}</b>
              GÜN
            </span>
          ) : null}
          <div className="relative">
            <button
              type="button"
              aria-label="Menü"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="rounded-md p-1.5 text-[var(--z-muted)] hover:bg-[var(--z-hover)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-[var(--z-border)] bg-[var(--z-bg,#fff)] py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--z-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    openDetail();
                  }}
                >
                  Detay
                </button>
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-3 py-2 text-[12px] hover:bg-[var(--z-hover)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Sahibinden
                </a>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--z-hover)]"
                  onClick={() => {
                    void navigator.clipboard?.writeText(listing.url);
                    setMenuOpen(false);
                  }}
                >
                  Linki kopyala
                </button>
                {onOpenPriceHistory ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--z-hover)]"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenPriceHistory(listing.listingNo);
                    }}
                  >
                    Fiyat geçmişi
                  </button>
                ) : null}
                {onOpenComps ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--z-hover)]"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenComps(listing.listingNo);
                    }}
                  >
                    Rakipler
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex gap-3 px-3 pt-2.5">
        <button
          type="button"
          onClick={openDetail}
          className="relative h-[76px] w-[100px] shrink-0 overflow-hidden rounded-lg bg-[var(--z-hover)]"
          aria-label="İlan detayını aç"
        >
          {listing.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--z-muted)]">
              Foto yok
            </span>
          )}
          {listing.photoCount != null && listing.photoCount > 0 ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] tabular-nums text-white">
              {listing.photoCount}
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1 space-y-1 text-[12px]">
          {firstDate ? (
            <p className="tabular-nums text-[var(--z-muted)]">
              İlan T. {firstDate}
            </p>
          ) : null}
          {location ? (
            <p className="text-[var(--z-muted)] line-clamp-1">{location}</p>
          ) : null}
          <p className="flex items-center gap-1.5 text-[var(--z-fg-soft)] line-clamp-1">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <span className="truncate">
              {agentLine || listing.whom || '—'}
            </span>
          </p>
          <p className="tabular-nums text-[var(--z-fg-soft)]">
            {listing.areaM2 != null ? `Net m²: ${listing.areaM2}` : null}
            {listing.areaM2 != null && listing.priceM2 != null ? ' · ' : null}
            {listing.priceM2 != null
              ? `m² Fiyatı: ${formatTl(listing.priceM2)}`
              : null}
          </p>
        </div>
      </div>

      <div className="px-3 pt-2">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <PriceMeter listing={listing} onOpenComps={onOpenComps} />
          </div>
          <div className="shrink-0 text-right pl-2">
            {(dropped || rose) && onOpenPriceHistory ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPriceHistory(listing.listingNo);
                }}
                className={`mb-0.5 rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${
                  dropped
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {dropped ? '▼' : '▲'} %
                {Math.abs(priceDropPct!).toLocaleString('tr-TR', {
                  maximumFractionDigits: 1,
                })}
              </button>
            ) : onOpenPriceHistory ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPriceHistory(listing.listingNo);
                }}
                className="mb-0.5 rounded-full border border-[var(--z-border)] px-2 py-0.5 text-[11px] text-[var(--z-fg-soft)]"
              >
                Fiyat sabit
              </button>
            ) : null}
            <p
              className={`text-[17px] font-semibold tabular-nums ${
                dropped ? 'text-emerald-700' : 'text-[var(--z-fg)]'
              }`}
            >
              {formatTl(listing.priceTl)}
              {dropped ? <span className="ml-0.5 text-[12px]">↓</span> : null}
            </p>
            {listing.priceUsd != null ? (
              <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                ≈ {Math.round(listing.priceUsd).toLocaleString('en-US')} $
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
          {chips.map((c) => (
            <span
              key={c.key}
              className="rounded-md border border-[var(--z-border)] px-1.5 py-0.5 text-[10px] text-[var(--z-fg-soft)]"
            >
              {c.label}
            </span>
          ))}
          {listing.twinTotal != null && listing.twinTotal > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTwins?.(listing.listingNo);
              }}
              className="rounded-md border border-[var(--z-border)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--z-fg-soft)] hover:bg-[var(--z-hover)]"
              title="İkiz ilanlar"
            >
              {listing.twinActive ?? 0}/{listing.twinTotal} ikiz
            </button>
          ) : onOpenTwins ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTwins(listing.listingNo);
              }}
              className="rounded-md border border-dashed border-[var(--z-border)] px-1.5 py-0.5 text-[10px] text-[var(--z-muted)] hover:bg-[var(--z-hover)]"
            >
              İkiz
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        <p className="text-[10px] tabular-nums text-[var(--z-muted)]">
          #{listing.listingNo}
          {!listing.isActive ? ' · Pasif' : ''}
        </p>
        <button
          type="button"
          onClick={openDetail}
          className="text-[11px] text-[var(--z-fg-soft)] underline-offset-2 hover:underline"
        >
          Detay
        </button>
      </div>
    </article>
  );
}
