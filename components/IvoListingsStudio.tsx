'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { IvoListingRow } from '../lib/ivoListingTypes';
import { toListingCard } from '../lib/ivoListingCard';
import IvoListingCard from './IvoListingCard';
import IvoCompsPanel from './IvoCompsPanel';

type View = 'tracked' | 'fsbo' | 'recent' | 'office';

type OfficeStatus = 'active' | 'inactive' | 'all';
type OfficeType = 'all' | 'satilik' | 'kiralik';
type OfficeSort = 'seen' | 'price_asc' | 'price_desc';

type OfficeCounts = {
  all: number;
  active: number;
  inactive: number;
  satilik: number;
  kiralik: number;
};

type Props = {
  mode: View;
  onNavigate: (tabId: string) => void;
};

const PAGE_SIZE = 48;

export default function IvoListingsStudio({ mode, onNavigate }: Props) {
  const [listings, setListings] = useState<IvoListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [status, setStatus] = useState<OfficeStatus>('active');
  const [listingType, setListingType] = useState<OfficeType>('all');
  const [sort, setSort] = useState<OfficeSort>('seen');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<OfficeCounts | null>(null);
  const [compsNo, setCompsNo] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'live' | 'db' | null>(null);

  const title =
    mode === 'fsbo'
      ? 'FSBO fırsatları'
      : mode === 'recent'
        ? 'Son ilanlar'
        : mode === 'office'
          ? 'Ofis ilanları'
          : 'İlan takibi';

  const subtitle =
    mode === 'fsbo'
      ? 'Sahibinden / mal sahibi ilanları'
      : mode === 'recent'
        ? 'Radarındaki güncel ilanlar'
        : mode === 'office'
          ? dataSource === 'live'
            ? 'Canlı ofis portföyü'
            : dataSource === 'db'
              ? 'Önbellek (canlı alınamadı) — filtrele ve tara'
              : 'Ofis portföyü — filtrele ve tara'
          : 'Takip ettiğiniz ilanlar';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let path = `/api/ivo/listings?view=${mode}`;
      if (mode === 'office') {
        const params = new URLSearchParams({
          view: 'office',
          status,
          listingType,
          sort,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (q.trim()) params.set('q', q.trim());
        path = `/api/ivo/listings?${params.toString()}`;
      }
      const res = await fetch(path);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi');
      setListings(json.listings || []);
      if (mode === 'office') {
        setTotal(typeof json.total === 'number' ? json.total : 0);
        setCounts(json.counts || null);
        setDataSource(json.source === 'live' || json.source === 'db' ? json.source : null);
      } else {
        setTotal((json.listings || []).length);
        setCounts(null);
        setDataSource(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
      setListings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [mode, status, listingType, sort, q, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [status, listingType, sort, q, mode]);

  const cards = useMemo(
    () => listings.map((r) => toListingCard(r)),
    [listings]
  );

  const withMeter = useMemo(
    () => cards.filter((c) => c.priceStats?.avg_m2_price != null).length,
    [cards]
  );
  const withPhoto = useMemo(
    () => cards.filter((c) => !!c.imageUrl).length,
    [cards]
  );

  const addTracked = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/ivo/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, track: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Eklenemedi');
      setInfo(
        json.listing
          ? `Takibe alındı · #${json.listing.listing_no}`
          : `${json.mesaj || json.data?.mesaj || 'Eklendi'} · #${
              json.job?.listing_no || json.data?.no || ''
            }`
      );
      setUrl('');
      await load();
      if (mode !== 'tracked') onNavigate('ivo-ilan-takibi');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  const applySearch = () => {
    setQ(qDraft.trim());
  };

  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
          {title}
        </h1>
        <p className="mt-1 text-[14px] text-[var(--z-muted)]">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ivo-ofis', 'Ofis ilanları'],
            ['ivo-harita', 'Harita'],
            ['ivo-ilan-takibi', 'İlan takibi'],
            ['ivo-fsbo', 'FSBO'],
            ['ivo-ilanlar', 'Son ilanlar'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className="z-btn-ghost px-3 py-1.5 text-[12px]"
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'office' ? (
        <div className="space-y-3 rounded-xl border border-[var(--z-border)] p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch();
              }}
              placeholder="Başlık, konum veya ilan no"
              className="z-field flex-1 px-3 h-10 text-[13px]"
            />
            <button
              type="button"
              onClick={applySearch}
              className="z-btn-primary px-4 h-10 text-[13px]"
            >
              Ara
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['active', 'Aktif', counts?.active],
                ['inactive', 'Pasif', counts?.inactive],
                ['all', 'Tümü', counts?.all],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatus(id)}
                className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                  status === id
                    ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
                    : 'border-[var(--z-border)] text-[var(--z-muted)]'
                }`}
              >
                {label}
                {typeof n === 'number' ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'İşlem'],
                  ['satilik', 'Satılık'],
                  ['kiralik', 'Kiralık'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setListingType(id)}
                  className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                    listingType === id
                      ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
                      : 'border-[var(--z-border)] text-[var(--z-muted)]'
                  }`}
                >
                  {label}
                  {id === 'satilik' && typeof counts?.satilik === 'number' ? (
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {counts.satilik}
                    </span>
                  ) : null}
                  {id === 'kiralik' && typeof counts?.kiralik === 'number' ? (
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {counts.kiralik}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as OfficeSort)}
              className="z-field h-9 px-2 text-[12px]"
            >
              <option value="seen">Tarih</option>
              <option value="price_desc">Fiyat (yüksek)</option>
              <option value="price_asc">Fiyat (düşük)</option>
            </select>
          </div>
        </div>
      ) : null}

      {mode === 'tracked' ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="İlan no veya Sahibinden linki"
            className="z-field flex-1 px-3 h-11 text-[14px]"
          />
          <button
            type="button"
            disabled={saving || !url.trim()}
            onClick={() => void addTracked()}
            className="z-btn-primary px-4 h-11 text-[13px] disabled:opacity-50"
          >
            {saving ? '…' : 'Takibe ekle'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-[13px] text-red-600 whitespace-pre-wrap">{error}</p>
      ) : null}
      {info ? <p className="text-[13px] text-emerald-700">{info}</p> : null}

      {loading ? (
        <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
      ) : cards.length === 0 ? (
        <p className="text-[14px] text-[var(--z-muted)]">
          {mode === 'tracked'
            ? 'Henüz takip edilen ilan yok. İlan no ekleyerek başlayın.'
            : mode === 'office'
              ? 'Bu filtrelere uyan ofis ilanı yok.'
              : 'Henüz listelenecek ilan yok.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-[var(--z-muted)]">
              {mode === 'office'
                ? `${offset + 1}–${Math.min(offset + cards.length, total)} / ${total}`
                : `${cards.length} ilan`}
              {mode === 'office' && dataSource
                ? dataSource === 'live'
                  ? ' · canlı'
                  : ' · önbellek'
                : ''}
              {withPhoto > 0 ? ` · ${withPhoto} fotoğraflı` : ''}
              {withMeter > 0 ? ` · ${withMeter} emsal metreli` : ''}
            </p>
            {mode === 'office' ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canPrev || loading}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  className="z-btn-ghost px-3 py-1.5 text-[12px] disabled:opacity-40"
                >
                  Önceki
                </button>
                <button
                  type="button"
                  disabled={!canNext || loading}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  className="z-btn-ghost px-3 py-1.5 text-[12px] disabled:opacity-40"
                >
                  Sonraki
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <IvoListingCard
                key={c.id}
                listing={c}
                onOpenComps={setCompsNo}
              />
            ))}
          </div>
        </>
      )}

      {compsNo ? (
        <IvoCompsPanel listingNo={compsNo} onClose={() => setCompsNo(null)} />
      ) : null}
    </section>
  );
}
