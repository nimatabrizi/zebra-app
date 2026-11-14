'use client';

import React from 'react';
import {
  formatDiffPct,
  formatTl,
  priceMeterPercent,
  type IvoListingCardModel,
} from '../lib/ivoListingCard';

type Props = {
  listing: IvoListingCardModel;
  onOpenComps?: (listingNo: string) => void;
};

function chips(listing: IvoListingCardModel): string[] {
  const out: string[] = [];
  if (listing.statusLabel) out.push(listing.statusLabel);
  if (listing.kind) out.push(listing.kind);
  if (listing.type && listing.type !== listing.kind) out.push(listing.type);
  if (listing.rooms) out.push(listing.rooms);
  if (listing.areaM2 != null) out.push(`${listing.areaM2} m²`);
  if (listing.isFsbo) out.push('FSBO');
  return Array.from(new Set(out));
}

function PriceMeter({ listing }: { listing: IvoListingCardModel }) {
  const stats = listing.priceStats;
  if (!stats || typeof stats.avg_m2_price !== 'number') return null;

  const pin = priceMeterPercent(listing.priceM2, stats);
  const diff = formatDiffPct(stats.diff_pct);
  const count = typeof stats.count === 'number' ? stats.count : null;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-[var(--z-muted)]">
        <span>
          Emsal ort.{' '}
          <span className="tabular-nums text-[var(--z-fg-soft)]">
            {formatTl(stats.avg_m2_price)}/m²
          </span>
          {count != null ? ` · ${count} emsal` : ''}
        </span>
        {diff ? (
          <span
            className={
              (stats.diff_pct ?? 0) > 0
                ? 'tabular-nums text-amber-700'
                : (stats.diff_pct ?? 0) < 0
                  ? 'tabular-nums text-emerald-700'
                  : 'tabular-nums'
            }
          >
            {diff}
          </span>
        ) : null}
      </div>
      <div className="relative h-2 rounded-full overflow-hidden bg-[linear-gradient(90deg,#34d399_0%,#fbbf24_55%,#f87171_100%)]">
        {pin != null ? (
          <span
            className="absolute top-1/2 z-[1] h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--z-fg)] shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
            style={{ left: `${pin}%` }}
            title={
              listing.priceM2 != null
                ? `${formatTl(listing.priceM2)}/m²`
                : undefined
            }
          />
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-[var(--z-muted)]">
        <span>{formatTl(stats.min_m2_price)}</span>
        <span>{formatTl(stats.max_m2_price)}</span>
      </div>
    </div>
  );
}

export default function IvoListingCard({ listing, onOpenComps }: Props) {
  const location = [listing.neighborhood, listing.district, listing.city]
    .filter(Boolean)
    .join(' / ');

  const agentLine = [listing.agency?.name, listing.agent?.name]
    .filter(Boolean)
    .join(' · ');

  const priceDrop =
    listing.priceChange &&
    listing.priceChange.prev_price != null &&
    listing.priceChange.current_price != null &&
    listing.priceChange.prev_price > listing.priceChange.current_price
      ? Math.round(
          ((listing.priceChange.prev_price -
            listing.priceChange.current_price) /
            listing.priceChange.prev_price) *
            1000
        ) / 10
      : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[var(--z-border)] bg-[var(--z-surface,transparent)]">
      <a
        href={listing.url}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-[16/10] bg-[var(--z-hover)] overflow-hidden"
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
          <div className="flex h-full w-full items-center justify-center text-[12px] text-[var(--z-muted)]">
            Foto yok
          </div>
        )}
        {listing.photoCount != null && listing.photoCount > 0 ? (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
            {listing.photoCount} foto
          </span>
        ) : null}
        {!listing.isActive ? (
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            Pasif
          </span>
        ) : null}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {agentLine ? (
          <p className="text-[11px] text-[var(--z-muted)] truncate">
            {agentLine}
          </p>
        ) : listing.whom ? (
          <p className="text-[11px] text-[var(--z-muted)] truncate">
            {listing.whom}
          </p>
        ) : null}

        <a
          href={listing.url}
          target="_blank"
          rel="noreferrer"
          className="text-[14px] font-medium leading-snug text-[var(--z-fg)] hover:underline line-clamp-2"
        >
          {listing.title}
        </a>

        <div className="flex flex-wrap gap-1.5">
          {chips(listing).map((c) => (
            <span
              key={c}
              className="rounded-md border border-[var(--z-border)] px-1.5 py-0.5 text-[10px] text-[var(--z-fg-soft)]"
            >
              {c}
            </span>
          ))}
        </div>

        {location ? (
          <p className="text-[12px] text-[var(--z-muted)]">{location}</p>
        ) : null}

        <div className="mt-auto pt-1">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[17px] font-semibold tabular-nums tracking-tight text-[var(--z-fg)]">
                {formatTl(listing.priceTl)}
              </p>
              {listing.priceM2 != null ? (
                <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                  {formatTl(listing.priceM2)}/m²
                </p>
              ) : null}
            </div>
            {priceDrop != null && priceDrop > 0 ? (
              <span className="text-[11px] tabular-nums text-emerald-700">
                Fiyat düştü −%{priceDrop}
              </span>
            ) : null}
          </div>

          <PriceMeter listing={listing} />

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[10px] tabular-nums text-[var(--z-muted)]">
              #{listing.listingNo}
            </p>
            {onOpenComps ? (
              <button
                type="button"
                onClick={() => onOpenComps(listing.listingNo)}
                className="text-[11px] text-[var(--z-fg-soft)] underline-offset-2 hover:underline"
              >
                Emsaller
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
