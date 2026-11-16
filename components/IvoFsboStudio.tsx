'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { IvoListingRow } from '../lib/ivoListingTypes';
import { toListingCard } from '../lib/ivoListingCard';
import {
  FSBO_AGE_BUCKETS,
  FSBO_SECTIONS,
  type FsboAgeBucket,
  type FsboCompetitorGroup,
  type FsboSectionId,
} from '../lib/ivoFsboLive';
import IvoListingCard from './IvoListingCard';
import IvoListingDetailModal from './IvoListingDetailModal';
import IvoCompsPanel from './IvoCompsPanel';
import IvoPriceHistoryModal from './IvoPriceHistoryModal';
import IvoTwinsPanel from './IvoTwinsPanel';
import IvoActivityModal from './IvoActivityModal';

type Props = {
  onNavigate: (tabId: string) => void;
};

type ListingType = 'all' | 'satilik' | 'kiralik';

const PAGE_SIZE = 48;

export default function IvoFsboStudio({ onNavigate }: Props) {
  const [section, setSection] = useState<FsboSectionId>('fsbo');
  const [age, setAge] = useState<FsboAgeBucket>('all');
  const [listingType, setListingType] = useState<ListingType>('all');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [offset, setOffset] = useState(0);
  const [groupKey, setGroupKey] = useState<string | null>(null);

  const [listings, setListings] = useState<IvoListingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<
    Partial<Record<FsboSectionId, number | null>>
  >({});
  const [groups, setGroups] = useState<FsboCompetitorGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [countsLoading, setCountsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [source, setSource] = useState<'live' | 'db' | null>(null);

  const [detailNo, setDetailNo] = useState<string | null>(null);
  const [compsNo, setCompsNo] = useState<string | null>(null);
  const [priceHistoryNo, setPriceHistoryNo] = useState<string | null>(null);
  const [twinsNo, setTwinsNo] = useState<string | null>(null);
  const [activityNo, setActivityNo] = useState<string | null>(null);

  const sectionDef = FSBO_SECTIONS.find((s) => s.id === section) || FSBO_SECTIONS[0];

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const res = await fetch('/api/ivo/listings?view=fsbo&counts=1');
      const json = await res.json();
      if (res.ok && json.counts) setCounts(json.counts);
    } catch {
      /* sayaç opsiyonel */
    } finally {
      setCountsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLiveError(null);
    try {
      const params = new URLSearchParams({
        view: 'fsbo',
        section,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (sectionDef.ageBuckets && age !== 'all') params.set('age', age);
      if (listingType !== 'all') params.set('listingType', listingType);
      if (q.trim()) params.set('q', q.trim());
      if (section === 'competitor' && groupKey) params.set('groupKey', groupKey);

      const res = await fetch(`/api/ivo/listings?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi');

      setListings(json.listings || []);
      setTotal(typeof json.total === 'number' ? json.total : 0);
      setSource(json.source === 'live' || json.source === 'db' ? json.source : null);
      if (json.liveError) setLiveError(String(json.liveError));
      if (json.counts) {
        setCounts((prev) => ({ ...prev, ...json.counts }));
      } else if (typeof json.total === 'number') {
        setCounts((prev) => ({ ...prev, [section]: json.total }));
      }
      if (section === 'competitor') {
        const nextGroups = Array.isArray(json.groups) ? json.groups : [];
        setGroups(nextGroups);
        const nextKey =
          typeof json.groupKey === 'string' && json.groupKey
            ? json.groupKey
            : nextGroups[0]?.key || null;
        setGroupKey(nextKey);
      } else {
        setGroups([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
      setListings([]);
      setTotal(0);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [section, sectionDef.ageBuckets, age, listingType, q, offset, groupKey]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
    setGroupKey(null);
  }, [section, age, listingType, q]);

  const cards = useMemo(
    () => listings.map((r) => toListingCard(r)),
    [listings]
  );

  const applySearch = () => setQ(qDraft.trim());

  const canPrev = offset > 0;
  const canNext = section !== 'competitor' && offset + PAGE_SIZE < total;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
          FSBO
        </h1>
        <p className="mt-1 text-[14px] text-[var(--z-muted)]">
          Sahibinden / mal sahibi fırsat havuzu — {sectionDef.hint}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ivo-harita', 'Harita'],
            ['ivo-fsbo', 'FSBO'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
              id === 'ivo-fsbo'
                ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
                : 'border-[var(--z-border)] text-[var(--z-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FSBO_SECTIONS.map((s) => {
          const n = counts[s.id];
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                active
                  ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
                  : 'border-[var(--z-border)] text-[var(--z-muted)]'
              }`}
              title={s.hint}
            >
              {s.label}
              {typeof n === 'number' ? (
                <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
              ) : countsLoading ? (
                <span className="ml-1.5 opacity-40">…</span>
              ) : null}
            </button>
          );
        })}
      </div>

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
              </button>
            ))}
          </div>

          {sectionDef.ageBuckets ? (
            <div className="flex flex-wrap gap-1.5">
              {FSBO_AGE_BUCKETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setAge(b.id)}
                  className={`px-2.5 py-1.5 text-[11px] rounded-lg border transition-colors ${
                    age === b.id
                      ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
                      : 'border-[var(--z-border)] text-[var(--z-muted)]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {section === 'competitor' && groups.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[12px] text-[var(--z-muted)]">
            Rakip grupları — birini seç, ilanlar aşağıda
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  setGroupKey(g.key);
                  setOffset(0);
                }}
                className={`px-3 py-1.5 text-[12px] rounded-lg border text-left transition-colors ${
                  groupKey === g.key
                    ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
                    : 'border-[var(--z-border)] text-[var(--z-muted)]'
                }`}
              >
                <span>{g.label}</span>
                <span className="ml-1.5 tabular-nums opacity-70">
                  {g.competitorCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[13px] text-red-600 whitespace-pre-wrap">{error}</p>
      ) : null}
      {liveError && source === 'db' ? (
        <p className="text-[12px] text-amber-700">
          Canlı alınamadı, önbellek gösteriliyor: {liveError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
      ) : cards.length === 0 ? (
        <p className="text-[14px] text-[var(--z-muted)]">
          Bu bölümde listelenecek ilan yok.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-[var(--z-muted)]">
              {section === 'competitor'
                ? `${cards.length} rakip ilan`
                : `${offset + 1}–${Math.min(offset + cards.length, total)} / ${total}`}
              {source === 'live' ? ' · canlı' : source === 'db' ? ' · önbellek' : ''}
            </p>
            {section !== 'competitor' ? (
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
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {cards.map((c) => (
              <IvoListingCard
                key={c.id}
                listing={c}
                onOpenDetail={setDetailNo}
                onOpenComps={setCompsNo}
                onOpenPriceHistory={setPriceHistoryNo}
                onOpenTwins={setTwinsNo}
                onOpenActivity={setActivityNo}
              />
            ))}
          </div>
        </>
      )}

      {detailNo ? (
        <IvoListingDetailModal
          listingNo={detailNo}
          onClose={() => setDetailNo(null)}
        />
      ) : null}
      {compsNo ? (
        <IvoCompsPanel
          listingNo={compsNo}
          onClose={() => setCompsNo(null)}
          onOpenDetail={(no) => {
            setCompsNo(null);
            setDetailNo(no);
          }}
        />
      ) : null}
      {priceHistoryNo ? (
        <IvoPriceHistoryModal
          listingNo={priceHistoryNo}
          onClose={() => setPriceHistoryNo(null)}
        />
      ) : null}
      {twinsNo ? (
        <IvoTwinsPanel
          listingNo={twinsNo}
          onClose={() => setTwinsNo(null)}
          onOpenDetail={(no) => {
            setTwinsNo(null);
            setDetailNo(no);
          }}
        />
      ) : null}
      {activityNo ? (
        <IvoActivityModal
          listingNo={activityNo}
          onClose={() => setActivityNo(null)}
          onOpenDetail={(no) => {
            setActivityNo(null);
            setDetailNo(no);
          }}
        />
      ) : null}
    </section>
  );
}
