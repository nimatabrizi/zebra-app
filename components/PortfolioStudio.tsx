'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { IvoListingRow } from '../lib/ivoListingTypes';
import { toListingCard } from '../lib/ivoListingCard';
import {
  portfolioDatePresetToFilter,
  type PortfolioFacetBucket,
} from '../lib/ivoPortfolioLive';
import IvoListingCard from './IvoListingCard';
import IvoListingDetailModal from './IvoListingDetailModal';
import IvoCompsPanel from './IvoCompsPanel';
import IvoPriceHistoryModal from './IvoPriceHistoryModal';
import IvoTwinsPanel from './IvoTwinsPanel';
import IvoActivityModal from './IvoActivityModal';
import {
  downloadPortfolioExcel,
  fetchAllFilteredListings,
} from '../lib/ivoPortfolioExport';

type Scope = 'my' | 'pool';
type Status = 'active' | 'inactive' | 'all';
type ListingType = 'all' | 'satilik' | 'kiralik';
type Sort = 'seen' | 'price_asc' | 'price_desc';
type PriceMode = 'total' | 'm2';

type Counts = {
  all: number;
  active: number;
  inactive: number;
  satilik: number;
  kiralik: number;
};

type Facets = {
  cities: PortfolioFacetBucket[];
  districts: PortfolioFacetBucket[];
  neighborhoods: PortfolioFacetBucket[];
  rooms: PortfolioFacetBucket[];
  kinds: PortfolioFacetBucket[];
  agents: PortfolioFacetBucket[];
  agencies: PortfolioFacetBucket[];
};

type Signal = 'price_down' | 'price_up' | 'relisted';
type Feature =
  | 'krediye_uygun'
  | 'photo'
  | 'esyali'
  | 'takas'
  | 'asansor'
  | 'site'
  | 'balkon';
type TwinRelation = 'ikiz' | 'kardes' | 'benzer';

type Props = {
  scope: Scope;
  onNavigate: (tabId: string) => void;
};

const PAGE_SIZE = 48;

const DATE_WHEN = [
  { id: '', label: 'Tümü' },
  { id: '24h', label: 'Son 24 saat' },
  { id: '3d', label: '3 gün' },
  { id: '7d', label: '7 gün' },
  { id: '30d', label: '30 gün' },
  { id: '90d', label: '90 gün' },
  { id: '180d', label: '6 ay' },
] as const;

const DATE_AGE = [
  { id: 'age-0-7', label: '0–7 gün' },
  { id: 'age-7-30', label: '7–30 gün' },
  { id: 'age-30-90', label: '30–90 gün' },
  { id: 'age-90+', label: '90 gün+' },
] as const;

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

function parseMoney(raw: string): number | undefined {
  const n = Number(raw.replace(/\./g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function PortfolioStudio({ scope, onNavigate }: Props) {
  const [listings, setListings] = useState<IvoListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>('active');
  const [listingType, setListingType] = useState<ListingType>('all');
  const [sort, setSort] = useState<Sort>('seen');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [agencyNames, setAgencyNames] = useState<string[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [twinRelation, setTwinRelation] = useState<TwinRelation | null>(null);
  const [priceMode, setPriceMode] = useState<PriceMode>('total');
  const [priceMinDraft, setPriceMinDraft] = useState('');
  const [priceMaxDraft, setPriceMaxDraft] = useState('');
  const [priceMin, setPriceMin] = useState<number | undefined>();
  const [priceMax, setPriceMax] = useState<number | undefined>();
  const [m2MinDraft, setM2MinDraft] = useState('');
  const [m2MaxDraft, setM2MaxDraft] = useState('');
  const [m2Min, setM2Min] = useState<number | undefined>();
  const [m2Max, setM2Max] = useState<number | undefined>();
  const [datePreset, setDatePreset] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [districtQuery, setDistrictQuery] = useState('');
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllDistricts, setShowAllDistricts] = useState(false);
  const [showAllRooms, setShowAllRooms] = useState(false);

  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [facets, setFacets] = useState<Facets>({
    cities: [],
    districts: [],
    neighborhoods: [],
    rooms: [],
    kinds: [],
    agents: [],
    agencies: [],
  });
  const [postFiltered, setPostFiltered] = useState(false);
  const [unmatchedAgent, setUnmatchedAgent] = useState(false);
  const [matchedAgentName, setMatchedAgentName] = useState<string | null>(
    null
  );
  const [detailNo, setDetailNo] = useState<string | null>(null);
  const [compsNo, setCompsNo] = useState<string | null>(null);
  const [priceHistoryNo, setPriceHistoryNo] = useState<string | null>(null);
  const [twinsNo, setTwinsNo] = useState<string | null>(null);
  const [activityNo, setActivityNo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const title = scope === 'my' ? 'Portföylerim' : 'Portföy Havuzu';
  const subtitle =
    scope === 'my'
      ? matchedAgentName
        ? `${matchedAgentName} — kendi ilanlarınız`
        : 'Kendi ilanlarınız — profil adınız ofis danışmanı ile eşleşmeli'
      : 'Ofisin tüm ilanları — filtreleyin ve tarayın';

  const buildListParams = useCallback(
    (limit: number, pageOffset: number) => {
      const date = portfolioDatePresetToFilter(datePreset);
      const params = new URLSearchParams({
        view: scope,
        status,
        listingType,
        sort,
        limit: String(limit),
        offset: String(pageOffset),
        priceMode,
      });
      if (q.trim()) params.set('q', q.trim());
      if (cities.length) params.set('cities', cities.join(','));
      if (districts.length) params.set('districts', districts.join(','));
      if (neighborhoods.length)
        params.set('neighborhoods', neighborhoods.join(','));
      if (kinds.length) params.set('kinds', kinds.join(','));
      if (rooms.length) params.set('rooms', rooms.join(','));
      if (agentIds.length) params.set('agentIds', agentIds.join(','));
      if (agencyNames.length) params.set('agencyNames', agencyNames.join(','));
      if (signals.length) params.set('signals', signals.join(','));
      if (features.length) params.set('features', features.join(','));
      if (twinRelation) params.set('twinRelation', twinRelation);
      if (priceMin != null) params.set('priceMin', String(priceMin));
      if (priceMax != null) params.set('priceMax', String(priceMax));
      if (m2Min != null) params.set('m2Min', String(m2Min));
      if (m2Max != null) params.set('m2Max', String(m2Max));
      if (date.period && date.period !== 'all') {
        params.set('period', date.period);
        if (date.period === 'custom') {
          if (date.daysFrom != null)
            params.set('daysFrom', String(date.daysFrom));
          if (date.daysTo != null) params.set('daysTo', String(date.daysTo));
        }
      }
      return params;
    },
    [
      scope,
      status,
      listingType,
      sort,
      q,
      cities,
      districts,
      neighborhoods,
      kinds,
      rooms,
      agentIds,
      agencyNames,
      signals,
      features,
      twinRelation,
      priceMin,
      priceMax,
      priceMode,
      m2Min,
      m2Max,
      datePreset,
    ]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams(PAGE_SIZE, offset);
      const res = await fetch(`/api/ivo/listings?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi');
      setListings(json.listings || []);
      setTotal(typeof json.total === 'number' ? json.total : 0);
      setCounts(json.counts || null);
      setFacets(
        json.facets || {
          cities: [],
          districts: [],
          neighborhoods: [],
          rooms: [],
          kinds: [],
          agents: [],
          agencies: [],
        }
      );
      setPostFiltered(Boolean(json.postFiltered));
      setUnmatchedAgent(Boolean(json.unmatchedAgent));
      setMatchedAgentName(
        typeof json.matchedAgentName === 'string'
          ? json.matchedAgentName
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
      setListings([]);
      setTotal(0);
      setUnmatchedAgent(false);
      setMatchedAgentName(null);
    } finally {
      setLoading(false);
    }
  }, [buildListParams, offset]);

  const exportExcel = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const rows = await fetchAllFilteredListings(
        (limit, pageOffset) =>
          `/api/ivo/listings?${buildListParams(limit, pageOffset).toString()}`,
        { pageSize: 100, maxRows: 3000 }
      );
      if (!rows.length) {
        setExportMsg('Dışa aktarılacak ilan yok.');
        return;
      }
      const n = await downloadPortfolioExcel(
        rows,
        scope === 'pool' ? 'Ofis_Portfoy' : 'Portfoylerim'
      );
      setExportMsg(`${n} satır Excel’e aktarıldı.`);
    } catch (e) {
      setExportMsg(
        e instanceof Error ? e.message : 'Dışa aktarım başarısız'
      );
    } finally {
      setExporting(false);
    }
  }, [buildListParams, exporting, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [
    scope,
    status,
    listingType,
    sort,
    q,
    cities,
    districts,
    neighborhoods,
    kinds,
    rooms,
    agentIds,
    agencyNames,
    signals,
    features,
    twinRelation,
    priceMin,
    priceMax,
    priceMode,
    m2Min,
    m2Max,
    datePreset,
  ]);

  const cards = useMemo(
    () => listings.map((r) => toListingCard(r)),
    [listings]
  );

  const applySearch = () => setQ(qDraft.trim());
  const applyPrice = () => {
    setPriceMin(parseMoney(priceMinDraft));
    setPriceMax(parseMoney(priceMaxDraft));
  };
  const applyM2 = () => {
    const a = parseMoney(m2MinDraft);
    const b = parseMoney(m2MaxDraft);
    setM2Min(a);
    setM2Max(b);
  };

  const filteredCities = useMemo(() => {
    const qq = cityQuery.trim().toLocaleLowerCase('tr-TR');
    const list = facets.cities.filter((c) =>
      qq ? c.value.toLocaleLowerCase('tr-TR').includes(qq) : true
    );
    return showAllCities ? list : list.slice(0, 5);
  }, [facets.cities, cityQuery, showAllCities]);

  const filteredDistricts = useMemo(() => {
    const qq = districtQuery.trim().toLocaleLowerCase('tr-TR');
    const list = facets.districts.filter((d) =>
      qq ? d.value.toLocaleLowerCase('tr-TR').includes(qq) : true
    );
    return showAllDistricts ? list : list.slice(0, 5);
  }, [facets.districts, districtQuery, showAllDistricts]);

  const roomChips = useMemo(() => {
    const list = facets.rooms;
    return showAllRooms ? list : list.slice(0, 12);
  }, [facets.rooms, showAllRooms]);

  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const Chip = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
        active
          ? 'border-[var(--z-border-strong)] bg-[var(--z-hover)] text-[var(--z-fg)]'
          : 'border-[var(--z-border)] text-[var(--z-muted)]'
      }`}
    >
      {children}
    </button>
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
          {title}
        </h1>
        <p className="mt-1 text-[14px] text-[var(--z-muted)]">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onNavigate('portfoylerim')}
          className={`z-btn-ghost px-3 py-1.5 text-[12px] ${
            scope === 'my' ? 'bg-[var(--z-hover)]' : ''
          }`}
        >
          Portföylerim
        </button>
        <button
          type="button"
          onClick={() => onNavigate('portfoy')}
          className={`z-btn-ghost px-3 py-1.5 text-[12px] ${
            scope === 'pool' ? 'bg-[var(--z-hover)]' : ''
          }`}
        >
          Portföy Havuzu
        </button>
        <button
          type="button"
          onClick={() => onNavigate('ivo-harita')}
          className="z-btn-ghost px-3 py-1.5 text-[12px]"
        >
          Harita
        </button>
        <button
          type="button"
          disabled={exporting || loading}
          onClick={() => void exportExcel()}
          className="z-btn-ghost px-3 py-1.5 text-[12px] disabled:opacity-40"
          title="Aktif filtrelere göre Excel (.xlsx)"
        >
          {exporting
            ? 'Aktarılıyor…'
            : scope === 'pool'
              ? 'Excel dışa aktar'
              : 'Dışa aktar'}
        </button>
      </div>
      {exportMsg ? (
        <p className="text-[12px] text-[var(--z-muted)]">{exportMsg}</p>
      ) : null}

      <div className="space-y-4 rounded-xl border border-[var(--z-border)] p-3 sm:p-4">
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

        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            İlan durumu
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['active', 'Aktif', counts?.active],
                ['inactive', 'Pasif', counts?.inactive],
                ['all', 'Hepsi', counts?.all],
              ] as const
            ).map(([id, label, n]) => (
              <Chip key={id} active={status === id} onClick={() => setStatus(id)}>
                {label}
                {typeof n === 'number' ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
                ) : null}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
              İşlem
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'Tümü', undefined],
                  ['satilik', 'Satılık', counts?.satilik],
                  ['kiralik', 'Kiralık', counts?.kiralik],
                ] as const
              ).map(([id, label, n]) => (
                <Chip
                  key={id}
                  active={listingType === id}
                  onClick={() => setListingType(id)}
                >
                  {label}
                  {typeof n === 'number' ? (
                    <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
                  ) : null}
                </Chip>
              ))}
            </div>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="z-field h-9 px-2 text-[12px]"
          >
            <option value="seen">Tarih ↓</option>
            <option value="price_desc">Fiyat (yüksek)</option>
            <option value="price_asc">Fiyat (düşük)</option>
          </select>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Tür
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(facets.kinds.length
              ? facets.kinds
              : [
                  { value: 'Konut', count: 0 },
                  { value: 'İş Yeri', count: 0 },
                  { value: 'Arazi', count: 0 },
                  { value: 'Bina', count: 0 },
                ]
            ).map((k) => (
              <Chip
                key={k.value}
                active={kinds.includes(k.value)}
                onClick={() => setKinds(toggleInList(kinds, k.value))}
              >
                {k.value}
                {k.count ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{k.count}</span>
                ) : null}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            İkiz / Kardeş / Benzer
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ikiz', 'İkiz'],
                ['kardes', 'Kardeş'],
                ['benzer', 'Benzer'],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                active={twinRelation === id}
                onClick={() =>
                  setTwinRelation(twinRelation === id ? null : id)
                }
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        {/* Konum */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
              Konum — İl
            </p>
            <input
              type="search"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="İl ara"
              className="z-field w-full px-3 h-9 text-[12px] mb-2"
            />
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {filteredCities.map((c) => (
                <li key={c.value}>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--z-fg)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cities.includes(c.value)}
                      onChange={() => setCities(toggleInList(cities, c.value))}
                    />
                    <span className="flex-1">{c.value}</span>
                    <span className="tabular-nums text-[var(--z-muted)] text-[12px]">
                      {c.count}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {facets.cities.length > 5 ? (
              <button
                type="button"
                className="mt-1 text-[12px] text-[var(--z-accent)]"
                onClick={() => setShowAllCities((v) => !v)}
              >
                {showAllCities
                  ? 'Daralt'
                  : `Tüm iller (${facets.cities.length})`}
              </button>
            ) : null}
          </div>

          <div>
            <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
              İlçe / mahalle
            </p>
            <input
              type="search"
              value={districtQuery}
              onChange={(e) => setDistrictQuery(e.target.value)}
              placeholder="İlçe veya mahalle ara"
              className="z-field w-full px-3 h-9 text-[12px] mb-2"
            />
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {filteredDistricts.map((d) => (
                <li key={d.value}>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--z-fg)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={districts.includes(d.value)}
                      onChange={() =>
                        setDistricts(toggleInList(districts, d.value))
                      }
                    />
                    <span className="flex-1">{d.value}</span>
                    <span className="tabular-nums text-[var(--z-muted)] text-[12px]">
                      {d.count}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {facets.districts.length > 5 ? (
              <button
                type="button"
                className="mt-1 text-[12px] text-[var(--z-accent)]"
                onClick={() => setShowAllDistricts((v) => !v)}
              >
                {showAllDistricts
                  ? 'Daralt'
                  : `Tüm ilçeler (${facets.districts.length})`}
              </button>
            ) : null}
          </div>
        </div>

        {/* Fiyat */}
        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Fiyat
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <Chip
              active={priceMode === 'total'}
              onClick={() => setPriceMode('total')}
            >
              Toplam
            </Chip>
            <Chip active={priceMode === 'm2'} onClick={() => setPriceMode('m2')}>
              m² başına
            </Chip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={priceMinDraft}
              onChange={(e) => setPriceMinDraft(e.target.value)}
              placeholder="En az ₺"
              className="z-field w-28 px-2 h-9 text-[12px]"
            />
            <span className="text-[var(--z-muted)]">—</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceMaxDraft}
              onChange={(e) => setPriceMaxDraft(e.target.value)}
              placeholder="En çok ₺"
              className="z-field w-28 px-2 h-9 text-[12px]"
            />
            <button
              type="button"
              onClick={applyPrice}
              className="z-btn-ghost px-3 h-9 text-[12px]"
            >
              Uygula
            </button>
          </div>
        </div>

        {/* m² */}
        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Metrekare
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={m2MinDraft}
              onChange={(e) => setM2MinDraft(e.target.value)}
              placeholder="En az m²"
              className="z-field w-28 px-2 h-9 text-[12px]"
            />
            <span className="text-[var(--z-muted)]">—</span>
            <input
              type="text"
              inputMode="numeric"
              value={m2MaxDraft}
              onChange={(e) => setM2MaxDraft(e.target.value)}
              placeholder="En çok m²"
              className="z-field w-28 px-2 h-9 text-[12px]"
            />
            <button
              type="button"
              onClick={applyM2}
              className="z-btn-ghost px-3 h-9 text-[12px]"
            >
              Uygula
            </button>
          </div>
        </div>

        {/* Oda */}
        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Oda sayısı
          </p>
          <div className="flex flex-wrap gap-1.5">
            {roomChips.map((r) => (
              <Chip
                key={r.value}
                active={rooms.includes(r.value)}
                onClick={() => setRooms(toggleInList(rooms, r.value))}
              >
                {r.value}
                <span className="ml-1.5 tabular-nums opacity-70">{r.count}</span>
              </Chip>
            ))}
          </div>
          {facets.rooms.length > 12 ? (
            <button
              type="button"
              className="mt-1 text-[12px] text-[var(--z-accent)]"
              onClick={() => setShowAllRooms((v) => !v)}
            >
              {showAllRooms ? 'Daralt' : `Tüm oda tipleri (${facets.rooms.length})`}
            </button>
          ) : null}
        </div>

        {/* Tarih */}
        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Tarih — Ne zaman
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DATE_WHEN.map((d) => (
              <Chip
                key={d.id || 'all'}
                active={datePreset === d.id}
                onClick={() => setDatePreset(d.id)}
              >
                {d.label}
              </Chip>
            ))}
          </div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            İlan yaşı
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DATE_AGE.map((d) => (
              <Chip
                key={d.id}
                active={datePreset === d.id}
                onClick={() =>
                  setDatePreset(datePreset === d.id ? '' : d.id)
                }
              >
                {d.label}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--z-muted)]">
            Tarih penceresi ilan tarihi (first_date) üzerinden uygulanır.
          </p>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Pazar sinyalleri
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['price_down', 'Fiyatı Düşenler'],
                ['price_up', 'Fiyatı Artanlar'],
                ['relisted', 'Yeniden Yayına Alınmış'],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                active={signals.includes(id)}
                onClick={() => setSignals(toggleInList(signals, id))}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
            Özellikler
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['krediye_uygun', 'Krediye Uygun'],
                ['photo', 'Yalnız Fotoğraflı'],
                ['esyali', 'Eşyalı'],
                ['takas', 'Takas'],
                ['asansor', 'Asansör'],
                ['site', 'Site İçerisinde'],
                ['balkon', 'Balkon'],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                active={features.includes(id)}
                onClick={() => setFeatures(toggleInList(features, id))}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        {scope === 'pool' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
                Danışman
              </p>
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {(facets.agents || []).slice(0, 24).map((a) => {
                  const id = a.value.includes('::')
                    ? a.value.split('::')[0]
                    : a.value;
                  const label = a.value.includes('::')
                    ? a.value.split('::').slice(1).join('::')
                    : a.value;
                  return (
                    <li key={a.value}>
                      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agentIds.includes(id)}
                          onChange={() =>
                            setAgentIds(toggleInList(agentIds, id))
                          }
                        />
                        <span className="flex-1 truncate">{label}</span>
                        <span className="tabular-nums text-[12px] text-[var(--z-muted)]">
                          {a.count}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
                Ofis
              </p>
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {(facets.agencies || []).slice(0, 24).map((a) => (
                  <li key={a.value}>
                    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agencyNames.includes(a.value)}
                        onChange={() =>
                          setAgencyNames(toggleInList(agencyNames, a.value))
                        }
                      />
                      <span className="flex-1 truncate">{a.value}</span>
                      <span className="tabular-nums text-[12px] text-[var(--z-muted)]">
                        {a.count}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {(facets.neighborhoods || []).length ? (
          <div>
            <p className="text-[12px] font-medium text-[var(--z-fg)] mb-1.5">
              Mahalle
            </p>
            <div className="flex flex-wrap gap-1.5">
              {facets.neighborhoods.slice(0, 16).map((n) => (
                <Chip
                  key={n.value}
                  active={neighborhoods.includes(n.value)}
                  onClick={() =>
                    setNeighborhoods(toggleInList(neighborhoods, n.value))
                  }
                >
                  {n.value}
                  <span className="ml-1.5 tabular-nums opacity-70">{n.count}</span>
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-[13px] text-red-600 whitespace-pre-wrap">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
      ) : scope === 'my' && unmatchedAgent ? (
        <p className="text-[14px] text-[var(--z-muted)]">
          Profil adınıza bağlı ofis ilanı bulunamadı. Portföylerim yalnızca
          Sahibinden / ofis kaydındaki danışman adınızla eşleşen ilanları
          gösterir — başkasının portföyü gösterilmez.
        </p>
      ) : cards.length === 0 ? (
        <p className="text-[14px] text-[var(--z-muted)]">
          Bu filtrelere uyan ilan yok.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-[var(--z-muted)]">
              {offset + 1}–{Math.min(offset + cards.length, total)} / {total}
              {postFiltered ? ' · geniş filtre' : ' · canlı'}
            </p>
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
