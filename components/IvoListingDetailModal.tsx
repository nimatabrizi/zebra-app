'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { emptyCardFacts, formatDiffPct, formatTl } from '../lib/ivoListingCard';
import type { IvoPropertyDetail } from '../lib/ivoPropertyDetail';
import type {
  IvoDetailBundle,
  IvoOpportunityScore,
  IvoPriceHistoryPayload,
  IvoSahipIstatistik,
  IvoV4Emsal,
  IvoV4Payload,
} from '../lib/ivoDetailBundle';
import {
  buildCompareMetrics,
  buildDecision,
  buildFinance,
  buildOfferScenario,
  compareSummary,
  dataAdequacy,
  draftSellerMessage,
  extractFeatures,
  formatDistance,
  haversineM,
  meterPct,
  positionBadge,
  type CompareMetric,
  type MetricTone,
  type Peer,
} from '../lib/ivoDetailAnalysis';
import type { NearbyPoi } from '../lib/ivoNearbyPoi';
import { resolveSahibindenListingUrl } from '../lib/sahibindenListing';

type Tab =
  | 'ilan'
  | 'fiyat'
  | 'pazar'
  | 'harita'
  | 'satici'
  | 'hesap'
  | 'kiyas'
  | 'karar';

type Props = { listingNo: string; onClose: () => void };

type NearbyItem = {
  no: string;
  lat: number;
  lng: number;
  price?: number;
  title?: string;
  rooms?: string | null;
  m2?: number;
  m2_price?: number;
  distanceM: number;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'ilan', label: 'İlan' },
  { id: 'fiyat', label: 'Fiyat' },
  { id: 'pazar', label: 'Pazar' },
  { id: 'harita', label: 'Harita' },
  { id: 'satici', label: 'Satıcı' },
  { id: 'hesap', label: 'Hesap' },
  { id: 'kiyas', label: 'Kıyas' },
  { id: 'karar', label: 'Karar' },
];

const POI_LABEL: Record<NearbyPoi['category'], string> = {
  okul: 'Okul',
  ulasim: 'Ulaşım',
  market: 'Günlük alışveriş',
  saglik: 'Sağlık',
  yesil: 'Yeşil alan',
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('tr-TR');
}

function toneClass(tone: MetricTone): string {
  if (tone === 'good') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (tone === 'weak') return 'text-amber-800 bg-amber-50 border-amber-200';
  if (tone === 'near')
    return 'text-[var(--z-fg)] bg-[var(--z-hover)] border-[var(--z-border)]';
  return 'text-[var(--z-muted)] bg-[var(--z-hover)] border-[var(--z-border)]';
}

function toneLabel(tone: MetricTone): string {
  if (tone === 'good') return 'Genelden iyi';
  if (tone === 'weak') return 'Genelden zayıf';
  if (tone === 'near') return 'Genele yakın';
  return 'Veri yok';
}

function formatMetric(m: CompareMetric, v: number | null): string {
  if (v == null) return '—';
  if (m.format === 'tl' || m.format === 'm2price') return formatTl(Math.round(v));
  if (m.format === 'm2') return `${Math.round(v)} m²`;
  if (m.format === 'years') return `${Math.round(v)} yıl`;
  return String(Math.round(v * 10) / 10);
}

function v4EmsalToPeers(emsal: IvoV4Emsal[], subjectNo: string): Peer[] {
  const rows = emsal.map((e, i) => {
    const no = String(e.no ?? '');
    return {
      id: no,
      listingNo: no,
      url: resolveSahibindenListingUrl(null, no, {
        title: e.baslik || null,
      }),
      title: e.baslik || `#${no}`,
      imageUrl: e.foto || null,
      photoCount: null,
      priceTl: e.fiyat ?? null,
      priceM2: e.m2_fiyat ?? null,
      areaM2: e.net_m2 ?? null,
      rooms: null,
      city: null,
      district: null,
      neighborhood: null,
      whom: null,
      kind: null,
      type: null,
      listingType: null,
      statusLabel: e.aktif === false ? 'Pasif' : 'Aktif',
      isFsbo: false,
      isActive: e.aktif !== false,
      agent: null,
      agency: null,
      priceStats: null,
      priceChange: null,
      priceUsd: null,
      firstDate: null,
      updatedAt: null,
      activeDays: null,
      facts: {
        ...emptyCardFacts(),
        binaYasi: e.yas != null ? String(e.yas) : null,
      },
      kindLetter: '?',
      twinActive: null,
      twinTotal: null,
      lastSeenAt: e.gorulme_tarihi || null,
      rank: i + 1,
      isSubject: no === subjectNo,
    } satisfies Peer;
  });
  if (!rows.some((r) => r.isSubject)) {
    /* subject may be in list already with same no */
  }
  return rows;
}

function CompareSlider({ metric }: { metric: CompareMetric }) {
  if (metric.subject == null || metric.min == null || metric.max == null) {
    return (
      <div className="rounded-xl border border-[var(--z-border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium">{metric.label}</p>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${toneClass(metric.tone)}`}>
            {toneLabel(metric.tone)}
          </span>
        </div>
        <p className="mt-2 text-[12px] text-[var(--z-muted)]">Veri yok</p>
      </div>
    );
  }
  const min = Math.min(metric.min, metric.subject, metric.median ?? metric.subject);
  const max = Math.max(metric.max, metric.subject, metric.median ?? metric.subject);
  const subPct = meterPct(metric.subject, min, max);
  const medPct = metric.median != null ? meterPct(metric.median, min, max) : null;
  return (
    <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium">{metric.label}</p>
          <p className="text-[16px] font-semibold tabular-nums">
            {formatMetric(metric, metric.subject)}
          </p>
        </div>
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${toneClass(metric.tone)}`}>
          {toneLabel(metric.tone)}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--z-hover)]">
        {metric.peers.slice(0, 24).map((v, i) => (
          <span
            key={i}
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--z-border-strong)]/50"
            style={{ left: `${meterPct(v, min, max)}%` }}
          />
        ))}
        {medPct != null ? (
          <span
            className="absolute top-0 bottom-0 w-px bg-[var(--z-fg)]/40"
            style={{ left: `${medPct}%` }}
          />
        ) : null}
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--z-bg,#fff)] bg-[var(--z-fg)]"
          style={{ left: `${subPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-[var(--z-muted)]">
        <span>{formatMetric(metric, min)}</span>
        <span>
          medyan {formatMetric(metric, metric.median)}
          {metric.diffPct != null ? ` · ${formatDiffPct(metric.diffPct)}` : ''}
        </span>
        <span>{formatMetric(metric, max)}</span>
      </div>
    </div>
  );
}

function DecisionGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = -90 + (clamped / 100) * 180;
  return (
    <div className="relative mx-auto h-28 w-48">
      <svg viewBox="0 0 200 110" className="h-full w-full">
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--z-border)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * 251} 251`}
          className={
            clamped >= 65
              ? 'text-emerald-600'
              : clamped <= 40
                ? 'text-amber-600'
                : 'text-[var(--z-fg)]'
          }
        />
        <g transform={`rotate(${angle} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="35" stroke="var(--z-fg)" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="5" fill="var(--z-fg)" />
      </svg>
      <p className="absolute inset-x-0 bottom-1 text-center text-[22px] font-semibold tabular-nums">
        {clamped}
      </p>
    </div>
  );
}

function PeersMap({
  lat,
  lng,
  nearby,
  pois,
}: {
  lat: number;
  lng: number;
  nearby: NearbyItem[];
  pois: NearbyPoi[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      if (!ref.current) return;
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !ref.current) return;
      const m = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView(
        [lat, lng],
        15
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      L.circle([lat, lng], {
        radius: 1000,
        color: '#111',
        weight: 1,
        fillColor: '#111',
        fillOpacity: 0.04,
      }).addTo(m);
      L.circleMarker([lat, lng], {
        radius: 9,
        color: '#111',
        fillColor: '#111',
        fillOpacity: 0.9,
        weight: 1,
      }).addTo(m);
      for (const n of nearby.slice(0, 40)) {
        L.circleMarker([n.lat, n.lng], {
          radius: 5,
          color: '#666',
          fillColor: '#999',
          fillOpacity: 0.75,
          weight: 1,
        }).addTo(m);
      }
      for (const p of pois.slice(0, 30)) {
        L.circleMarker([p.lat, p.lng], {
          radius: 4,
          color: '#2563eb',
          fillColor: '#60a5fa',
          fillOpacity: 0.85,
          weight: 1,
        }).addTo(m);
      }
      map = m;
      setTimeout(() => m.invalidateSize(), 50);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, nearby, pois]);
  return (
    <div ref={ref} className="h-64 w-full overflow-hidden rounded-xl border border-[var(--z-border)]" />
  );
}

export default function IvoListingDetailModal({ listingNo, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('ilan');
  const [detail, setDetail] = useState<IvoPropertyDetail | null>(null);
  const [v4, setV4] = useState<IvoV4Payload | null>(null);
  const [sahip, setSahip] = useState<IvoSahipIstatistik | null>(null);
  const [priceHistory, setPriceHistory] = useState<IvoPriceHistoryPayload | null>(null);
  const [opportunity, setOpportunity] = useState<IvoOpportunityScore | null>(null);
  const [twins, setTwins] = useState<{ items: unknown[]; meta: IvoDetailBundle['twins']['meta'] }>({
    items: [],
    meta: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [pois, setPois] = useState<NearbyPoi[]>([]);
  const [poiCat, setPoiCat] = useState<NearbyPoi['category'] | 'all'>('all');
  const [offerPct, setOfferPct] = useState(0);
  const [downPct, setDownPct] = useState(20);
  const [ratePct, setRatePct] = useState(2.89);
  const [termYears, setTermYears] = useState(10);
  const [cashMode, setCashMode] = useState<'pesin' | 'kredi'>('pesin');
  const [buyerPurpose, setBuyerPurpose] = useState<'oturum' | 'kira'>('oturum');
  const [rentOverride, setRentOverride] = useState('');
  const [elenenOpen, setElenenOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImgIdx(0);
    setTab('ilan');
    setNearby([]);
    setPois([]);
    setOfferPct(0);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ivo/listings?view=detail&listingNo=${encodeURIComponent(listingNo)}`
        );
        const json = (await res.json()) as IvoDetailBundle & { error?: string };
        if (!res.ok) throw new Error(json.error || 'Detay yüklenemedi');
        if (cancelled) return;
        setDetail(json.detail);
        setV4(json.v4 || null);
        setSahip(json.sahipIstatistik || null);
        setPriceHistory(json.priceHistory || null);
        setOpportunity(json.opportunity || null);
        setTwins(json.twins || { items: [], meta: null });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
          setDetail(null);
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

  useEffect(() => {
    if (!detail?.coordinates) return;
    const [lng, lat] = detail.coordinates;
    let cancelled = false;
    void (async () => {
      try {
        const qsMap = new URLSearchParams({
          view: 'map',
          lat: String(lat),
          lng: String(lng),
          radiusM: '1000',
          limit: '40',
          enrich: '1',
        });
        const qsPoi = new URLSearchParams({
          view: 'nearby-poi',
          lat: String(lat),
          lng: String(lng),
        });
        const [mapRes, poiRes] = await Promise.all([
          fetch(`/api/ivo/listings?${qsMap}`),
          fetch(`/api/ivo/listings?${qsPoi}`),
        ]);
        const mapJson = await mapRes.json();
        const poiJson = await poiRes.json();
        if (cancelled) return;
        if (mapRes.ok) {
          const items = (mapJson.points || []) as Array<{
            listingNo?: string;
            lat?: number;
            lng?: number;
            price?: number | null;
            title?: string | null;
            rooms?: string | null;
            m2?: number | null;
            m2Price?: number | null;
          }>;
          const mapped: NearbyItem[] = [];
          for (const it of items) {
            const ilat = Number(it.lat);
            const ilng = Number(it.lng);
            if (!Number.isFinite(ilat) || !Number.isFinite(ilng)) continue;
            const no = String(it.listingNo ?? '');
            if (!no || no === listingNo) continue;
            mapped.push({
              no,
              lat: ilat,
              lng: ilng,
              price: it.price ?? undefined,
              title: it.title ?? undefined,
              rooms: it.rooms,
              m2: it.m2 ?? undefined,
              m2_price: it.m2Price ?? undefined,
              distanceM: haversineM(lat, lng, ilat, ilng),
            });
          }
          mapped.sort((a, b) => a.distanceM - b.distanceM);
          setNearby(mapped);
        }
        if (poiRes.ok && Array.isArray(poiJson.items)) {
          setPois(poiJson.items as NearbyPoi[]);
        }
      } catch {
        /* optional layers */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, listingNo]);

  const peers: Peer[] = useMemo(() => {
    if (v4?.emsal?.length) return v4EmsalToPeers(v4.emsal, listingNo);
    return [];
  }, [v4, listingNo]);

  const metrics = useMemo(
    () => (detail ? buildCompareMetrics(detail, peers, v4) : []),
    [detail, peers, v4]
  );
  const summary = useMemo(() => compareSummary(metrics), [metrics]);
  const badge = useMemo(
    () => (detail ? positionBadge(detail, peers, v4?.konum) : null),
    [detail, peers, v4]
  );
  const offer = useMemo(
    () => (detail ? buildOfferScenario(detail, peers, offerPct) : null),
    [detail, peers, offerPct]
  );
  const features = useMemo(() => (detail ? extractFeatures(detail) : []), [detail]);
  const adequacy = useMemo(
    () =>
      detail
        ? dataAdequacy(detail, v4?.emsal?.length || peers.length)
        : null,
    [detail, v4, peers]
  );
  const decision = useMemo(
    () => (detail ? buildDecision(detail, metrics, peers) : null),
    [detail, metrics, peers]
  );
  const rentNum = rentOverride.trim()
    ? Number(rentOverride.replace(/\D/g, ''))
    : null;
  const finance = useMemo(
    () =>
      detail
        ? buildFinance(detail, {
            downPct: cashMode === 'pesin' ? 100 : downPct,
            annualRatePct: ratePct,
            termMonths: termYears * 12,
            rentMonthly:
              rentNum != null && Number.isFinite(rentNum) && rentNum > 0
                ? rentNum
                : null,
          })
        : null,
    [detail, downPct, ratePct, termYears, rentNum, cashMode]
  );

  const images = detail?.images?.length
    ? detail.images
    : detail?.image
      ? [detail.image]
      : [];
  const location = detail
    ? [detail.neighborhood, detail.district, detail.city].filter(Boolean).join(' / ')
    : '';
  const topEntries = detail?.propertyDetails?.top_details
    ? Object.entries(detail.propertyDetails.top_details)
    : [];
  const bottomEntries = detail?.propertyDetails?.bottom_details
    ? Object.entries(detail.propertyDetails.bottom_details)
    : [];
  const strong = features.filter((f) => f.kind === 'strong');
  const verify = features.filter((f) => f.kind === 'verify' || f.kind === 'mismatch');
  const message = detail ? draftSellerMessage(detail) : '';

  const stats = v4?.istatistik;
  const medM2 = stats?.medyan ?? v4?.medyanlar?.m2_fiyat?.deger ?? null;
  const medPrice =
    stats?.medyan_toplam_fiyat ?? v4?.medyanlar?.fiyat?.deger ?? null;
  const q1 = stats?.q1 ?? null;
  const q3 = stats?.q3 ?? null;

  const offerPresets = useMemo(() => {
    if (!detail?.price) return [];
    const list: { label: string; price: number; pct: number }[] = [];
    if (medPrice != null) {
      list.push({
        label: 'Medyan seviyesi',
        price: Math.round(medPrice),
        pct: ((medPrice - detail.price) / detail.price) * 100,
      });
    }
    for (const p of [-5, -3]) {
      list.push({
        label: `Yaklaşık ${p}%`,
        price: Math.round(detail.price * (1 + p / 100)),
        pct: p,
      });
    }
    list.push({ label: 'İstenen fiyat', price: detail.price, pct: 0 });
    return list;
  }, [detail, medPrice]);

  const sortedEmsal = useMemo(() => {
    const list = [...(v4?.emsal || [])];
    list.sort((a, b) => (a.m2_fiyat ?? Infinity) - (b.m2_fiyat ?? Infinity));
    return list;
  }, [v4]);

  const filteredPois =
    poiCat === 'all' ? pois : pois.filter((p) => p.category === poiCat);

  const buyerCost = detail?.price != null ? Math.round(detail.price * 0.044) : null;
  const goldGrams =
    detail?.price != null ? Math.round(detail.price / 6250) : null; // kabaca gram altın

  const phone =
    detail?.agent?.phone || detail?.agency?.phone || null;
  const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
  const telHref = phoneDigits
    ? `tel:+${phoneDigits.startsWith('90') ? phoneDigits : `90${phoneDigits.replace(/^0/, '')}`}`
    : null;
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.startsWith('90') ? phoneDigits : `90${phoneDigits.replace(/^0/, '')}`}`
    : null;
  const coords = detail?.coordinates;
  const streetView =
    coords
      ? `https://www.google.com/maps?layer=c&cbll=${coords[1]},${coords[0]}`
      : null;
  const directions =
    coords
      ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`
      : null;

  const kararScore = opportunity?.score ?? decision?.score ?? 50;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="İlan detayı"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--z-border)] bg-[var(--z-bg,#fff)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 shrink-0 bg-[var(--z-bg,#fff)]">
          <header className="border-b border-[var(--z-border)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                  #{listingNo}
                  {detail?.status ? ` · ${detail.status}` : ''}
                  {detail && !detail.isActive ? ' · Pasif' : ''}
                </p>
                <h2 className="mt-0.5 text-[16px] font-semibold leading-snug text-[var(--z-fg)] line-clamp-2">
                  {detail?.title || 'İlan detayı'}
                </h2>
                {location ? (
                  <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                    {location}
                    {detail?.siteAdi ? ` · ${detail.siteAdi}` : ''}
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={onClose} className="z-btn-ghost shrink-0 px-2.5 py-1.5 text-[12px]">
                Kapat
              </button>
            </div>
            {detail ? (
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[22px] font-semibold tabular-nums">{formatTl(detail.price)}</p>
                  <p className="text-[12px] tabular-nums text-[var(--z-muted)]">
                    {detail.m2Price != null
                      ? `${formatTl(Math.round(detail.m2Price))}/m²`
                      : '—'}
                    {detail.m2 != null ? ` · net ${detail.m2} m²` : ''}
                  </p>
                </div>
                {badge ? (
                  <span className={`rounded-md border px-2 py-1 text-[11px] ${toneClass(badge.tone)}`}>
                    {badge.label}
                    {badge.diffPct != null && !badge.label.includes('%')
                      ? ` · ${formatDiffPct(badge.diffPct)}`
                      : ''}
                  </span>
                ) : null}
              </div>
            ) : null}
          </header>
          <nav className="flex gap-0.5 border-b border-[var(--z-border)] px-2 overflow-x-auto" aria-label="İlan detay menüsü">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-2.5 text-[13px] whitespace-nowrap border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-[var(--z-fg)] text-[var(--z-fg)] font-semibold'
                    : 'border-transparent text-[var(--z-muted)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
          ) : error ? (
            <p className="text-[13px] text-red-600">{error}</p>
          ) : !detail ? (
            <p className="text-[14px] text-[var(--z-muted)]">Detay yok</p>
          ) : tab === 'ilan' ? (
            <div className="space-y-4">
              {images.length ? (
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[var(--z-hover)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[Math.min(imgIdx, images.length - 1)]}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white tabular-nums">
                    {imgIdx + 1} / {images.length}
                  </span>
                  {images.length > 1 ? (
                    <>
                      <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md bg-black/50 px-2 py-1 text-white text-[12px]" onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}>‹</button>
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-black/50 px-2 py-1 text-white text-[12px]" onClick={() => setImgIdx((i) => (i + 1) % images.length)}>›</button>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { k: 'net m²', v: detail.m2 != null ? String(detail.m2) : '—' },
                  { k: 'oda', v: detail.rooms || '—' },
                  { k: 'kat', v: String(topEntries.find(([k]) => /kat/i.test(k))?.[1] ?? '—') },
                  { k: 'bina yaşı', v: v4?.ilan?.yas_etiket || String(v4?.ilan?.yas ?? '—') },
                ].map((x) => (
                  <div key={x.k} className="rounded-xl border border-[var(--z-border)] p-2">
                    <p className="text-[15px] font-semibold tabular-nums line-clamp-1">{x.v}</p>
                    <p className="text-[10px] text-[var(--z-muted)]">{x.k}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <p className="text-[var(--z-muted)]">
                  Son güncelleme {formatDate(detail.updatedAt)}
                </p>
                <a href={detail.url} target="_blank" rel="noreferrer" className="z-btn-ghost px-3 py-1.5 text-[12px]">
                  No {listingNo}
                </a>
              </div>

              {medM2 != null && detail.m2Price != null ? (
                <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                  <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                    BENZER MEDYANA GÖRE
                  </p>
                  <div className="relative h-2.5 rounded-full overflow-hidden bg-[linear-gradient(90deg,#34d399_0%,#fbbf24_55%,#f87171_100%)]">
                    <span
                      className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--z-fg)]"
                      style={{
                        left: `${meterPct(
                          detail.m2Price,
                          stats?.min ?? detail.m2Price * 0.7,
                          stats?.max ?? detail.m2Price * 1.3
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] tabular-nums text-[var(--z-muted)]">
                    <span>{formatTl(Math.round(stats?.min ?? 0))}</span>
                    <span>medyan {formatTl(Math.round(medM2))}</span>
                    <span>{formatTl(Math.round(stats?.max ?? 0))}</span>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-[var(--z-border)] p-3">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)] mb-2">
                  ALIM KOŞULLARI
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  {topEntries.slice(0, 12).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-[var(--z-border)]/60 py-1">
                      <dt className="text-[var(--z-muted)]">{k}</dt>
                      <dd className="text-right">{v == null || v === '' ? '—' : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {(twins.meta?.total || twins.items.length) ? (
                <div className="rounded-xl border border-[var(--z-border)] p-3 text-[12px]">
                  <p className="font-semibold tracking-wide text-[var(--z-muted)] mb-1">
                    İVO BULGULARI · İKİZ
                  </p>
                  <p>
                    {twins.meta?.ikiz_olasi ?? twins.items.length} olası ikiz
                    {twins.meta?.ikiz_kesin != null
                      ? ` · ${twins.meta.ikiz_kesin} kesin`
                      : ''}
                  </p>
                </div>
              ) : null}

              <div className="rounded-xl border border-[var(--z-border)] p-3">
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <p className="text-[22px] font-semibold text-emerald-700">{strong.length}</p>
                    <p className="text-[11px] text-[var(--z-muted)]">güçlü yan</p>
                  </div>
                  <div>
                    <p className="text-[22px] font-semibold">
                      {features.filter((f) => f.kind === 'mismatch').length}
                    </p>
                    <p className="text-[11px] text-[var(--z-muted)]">uyuşmazlık</p>
                  </div>
                  <div>
                    <p className="text-[22px] font-semibold text-amber-700">{verify.length}</p>
                    <p className="text-[11px] text-[var(--z-muted)]">belirtilmemiş</p>
                  </div>
                </div>
                {adequacy ? (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                        VERİ YETERLİLİĞİ
                      </p>
                      <span className="text-[13px] font-medium">{adequacy.level}</span>
                    </div>
                    <ul className="space-y-1 text-[12px]">
                      {adequacy.notes.map((n) => (
                        <li key={n.text} className="flex gap-2">
                          <span>{n.ok === true ? '✓' : n.ok === false ? '−' : '!'}</span>
                          <span>{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <h3 className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)] mb-2">
                    GÜÇLÜ YANLAR
                  </h3>
                  <ul className="space-y-1.5 text-[12px]">
                    {strong.map((f) => (
                      <li key={f.key} className="flex gap-2">
                        <span className="text-emerald-600">✓</span>
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <h3 className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)] mb-2">
                    DOĞRULANACAKLAR
                  </h3>
                  <ul className="space-y-1.5 text-[12px]">
                    {verify.map((f) => (
                      <li key={f.key} className="flex gap-2">
                        <span className="text-[var(--z-muted)]">○</span>
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {bottomEntries.length ? (
                <div>
                  <h3 className="text-[13px] font-medium mb-2">Tüm özellikler</h3>
                  {bottomEntries.map(([k, v]) => (
                    <div key={k} className="mb-2">
                      <p className="text-[11px] text-[var(--z-muted)] mb-1">
                        {k}
                        {Array.isArray(v) ? ` · ${v.length}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Array.isArray(v) ? v : [v])
                          .filter((x) => x != null && x !== '')
                          .map((x) => (
                            <span key={String(x)} className="rounded-md border border-[var(--z-border)] px-1.5 py-0.5 text-[11px]">
                              {String(x)}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {detail.descriptionHtml ? (
                <div>
                  <h3 className="text-[13px] font-medium mb-2">Açıklama</h3>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--z-fg-soft)]">
                    {stripHtml(detail.descriptionHtml)}
                  </p>
                </div>
              ) : null}
            </div>
          ) : tab === 'fiyat' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  BENZER İLANLARDA KONUM · NET ₺/m²
                </p>
                <p className="text-[15px] font-medium">
                  {v4?.konum?.uzun || badge?.label || '—'}
                </p>
                {v4?.konum?.sapma_pct != null ? (
                  <p className="text-[20px] font-semibold tabular-nums">
                    {formatDiffPct(v4.konum.sapma_pct)}
                  </p>
                ) : null}
                <div className="relative h-2.5 rounded-full overflow-hidden bg-[linear-gradient(90deg,#34d399_0%,#fbbf24_55%,#f87171_100%)]">
                  {detail.m2Price != null && medM2 != null ? (
                    <span
                      className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[var(--z-fg)]"
                      style={{
                        left: `${meterPct(
                          detail.m2Price,
                          stats?.min ?? medM2 * 0.6,
                          stats?.max ?? medM2 * 1.4
                        )}%`,
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex justify-between text-[11px] tabular-nums text-[var(--z-muted)]">
                  <span>{formatTl(Math.round(stats?.min ?? 0))}</span>
                  <span>
                    medyan {medM2 != null ? formatTl(Math.round(medM2)) : '—'}
                    {q1 != null && q3 != null
                      ? ` · orta %50 ${formatTl(Math.round(q1))}–${formatTl(Math.round(q3))}`
                      : ''}
                  </span>
                  <span>{formatTl(Math.round(stats?.max ?? 0))}</span>
                </div>
                <p className="text-[11px] text-[var(--z-muted)]">
                  {v4?.kume?.emsal_sayisi ?? sortedEmsal.length} ilan
                  {v4?.kume?.elenen_sayisi
                    ? ` · ${v4.kume.elenen_sayisi} elendi`
                    : ''}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-3">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  TEKLİF SENARYOSU
                </p>
                <p className="text-[20px] font-semibold tabular-nums">
                  {offer ? formatTl(offer.offerPrice) : formatTl(detail.price)}
                </p>
                <p className="text-[12px] text-[var(--z-muted)]">
                  {offer?.label}
                  {offer?.vsMedianPct != null
                    ? ` · medyana ${formatDiffPct(offer.vsMedianPct)}`
                    : ''}
                </p>
                <input
                  type="range"
                  min={-20}
                  max={10}
                  step={1}
                  value={offerPct}
                  onChange={(e) => setOfferPct(Number(e.target.value))}
                  className="w-full accent-[var(--z-fg)]"
                  aria-label="Teklif fiyatı"
                />
                <div className="grid grid-cols-2 gap-2">
                  {offerPresets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setOfferPct(Math.round(p.pct))}
                      className="rounded-lg border border-[var(--z-border)] px-2 py-2 text-left text-[11px] hover:bg-[var(--z-hover)]"
                    >
                      <span className="block text-[var(--z-muted)]">{p.label}</span>
                      <span className="tabular-nums font-semibold">{formatTl(p.price)}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--z-muted)]">
                  Pazarlık dayanağı: benzer{' '}
                  {v4?.konum?.ucuz_sayisi ?? '—'} ilanın net m² fiyatı daha düşük
                </p>
              </div>

              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  FİYAT GEÇMİŞİ
                </p>
                <p className="text-[13px]">
                  {(priceHistory?.change_count ?? detail.priceChange?.change_count ?? 0) === 0
                    ? 'Fiyat değişmedi'
                    : `${priceHistory?.change_count ?? detail.priceChange?.change_count} değişim`}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <p>
                    İlk{' '}
                    <span className="tabular-nums font-medium">
                      {formatTl(priceHistory?.first_price ?? detail.firstPrice)}
                    </span>
                  </p>
                  <p>
                    Güncel{' '}
                    <span className="tabular-nums font-medium">
                      {formatTl(priceHistory?.current_price ?? detail.price)}
                    </span>
                  </p>
                </div>
                {medPrice != null ? (
                  <p className="text-[11px] tabular-nums text-[var(--z-muted)]">
                    benzer medyan {formatTl(Math.round(medPrice))}
                  </p>
                ) : null}
                <p className="text-[11px] text-[var(--z-muted)]">
                  ivo ilk kayıt {formatDate(v4?.gecmis?.ivo_ilk_kayit || priceHistory?.first_date)}
                  {' · '}
                  sahibinden {formatDate(v4?.gecmis?.ilan_tarihi || detail.firstDate)}
                </p>
              </div>
            </div>
          ) : tab === 'pazar' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--z-border)] p-3 text-[12px] space-y-1">
                <p className="font-semibold tracking-wide text-[var(--z-muted)]">BENZER İLANLAR</p>
                <p>
                  {sortedEmsal.length} emsal
                  {v4?.kume?.tanim
                    ? ` · ${JSON.stringify(v4.kume.tanim).slice(0, 80)}`
                    : ''}
                </p>
                <p className="text-[var(--z-muted)]">
                  İlan fiyatlarıdır; gerçekleşen satış değildir.
                  {v4?.kume?.pasif_sayisi
                    ? ` ${v4.kume.pasif_sayisi} pasif dahil.`
                    : ''}
                </p>
              </div>

              <ul className="divide-y divide-[var(--z-border)]">
                {sortedEmsal.map((e) => {
                  const no = String(e.no ?? '');
                  const isSelf = no === listingNo;
                  return (
                    <li key={no} className="py-2.5 flex gap-3">
                      {e.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.foto} alt="" className="h-14 w-[4.5rem] shrink-0 rounded-md object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="h-14 w-[4.5rem] shrink-0 rounded-md bg-[var(--z-hover)]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium line-clamp-2">
                          {isSelf ? 'Bu ilan · ' : ''}
                          {e.baslik || `#${no}`}
                        </p>
                        <p className="text-[11px] text-[var(--z-muted)]">
                          No {no}
                          {e.net_m2 != null ? ` · net ${e.net_m2} m²` : ''}
                          {e.aktif === false ? ' · pasif' : ''}
                          {e.benzerlik ? ` · ${e.benzerlik}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-semibold tabular-nums">
                          {e.m2_fiyat != null ? formatTl(Math.round(e.m2_fiyat)) : '—'}/m²
                        </p>
                        <p className="text-[10px] tabular-nums text-[var(--z-muted)]">
                          {formatTl(e.fiyat)}
                          {e.fark_pct != null ? ` · ${formatDiffPct(e.fark_pct)}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {(v4?.elenen?.sayi || 0) > 0 ? (
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-[12px] font-medium"
                    onClick={() => setElenenOpen((x) => !x)}
                  >
                    <span>{v4?.elenen?.sayi} ilan elendi · hesaba katılmadı</span>
                    <span>{elenenOpen ? 'Gizle' : 'Göster'}</span>
                  </button>
                  {elenenOpen && Array.isArray(v4?.elenen?.liste) ? (
                    <ul className="mt-2 space-y-1 text-[11px] text-[var(--z-muted)]">
                      {(v4!.elenen!.liste as Array<{ no?: string | number; sebep?: string }>).slice(0, 8).map((x, i) => (
                        <li key={String(x.no ?? i)}>
                          #{x.no} {x.sebep ? `· ${x.sebep}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-[var(--z-border)] p-3 text-[12px] space-y-1">
                <p className="font-semibold tracking-wide text-[var(--z-muted)]">
                  BÖLGE · {(detail.neighborhood || '').toUpperCase() || 'MAHALLE'}
                </p>
                <p>
                  Aktif emsal {v4?.kume?.aktif_sayisi ?? '—'} · pasif{' '}
                  {v4?.kume?.pasif_sayisi ?? '—'}
                </p>
                {medM2 != null ? (
                  <p className="tabular-nums">Medyan net m² {formatTl(Math.round(medM2))}</p>
                ) : null}
              </div>
            </div>
          ) : tab === 'harita' ? (
            <div className="space-y-3">
              {coords ? (
                <>
                  <PeersMap
                    lat={coords[1]}
                    lng={coords[0]}
                    nearby={
                      sortedEmsal
                        .filter((e) => e.lat != null && e.lng != null)
                        .map((e) => ({
                          no: String(e.no),
                          lat: Number(e.lat),
                          lng: Number(e.lng),
                          price: e.fiyat ?? undefined,
                          title: e.baslik,
                          m2: e.net_m2 ?? undefined,
                          m2_price: e.m2_fiyat ?? undefined,
                          distanceM: haversineM(
                            coords[1],
                            coords[0],
                            Number(e.lat),
                            Number(e.lng)
                          ),
                        }))
                        .sort((a, b) => a.distanceM - b.distanceM)
                    }
                    pois={filteredPois}
                  />
                  <p className="text-[11px] text-[var(--z-muted)]">
                    1 km emsal · {sortedEmsal.length || nearby.length} nokta
                  </p>

                  <ul className="divide-y divide-[var(--z-border)]">
                    {sortedEmsal
                      .filter((e) => e.lat != null && e.lng != null && String(e.no) !== listingNo)
                      .map((e) => {
                        const d = haversineM(
                          coords[1],
                          coords[0],
                          Number(e.lat),
                          Number(e.lng)
                        );
                        return (
                          <li key={String(e.no)} className="py-2 flex justify-between gap-2 text-[12px]">
                            <div className="min-w-0">
                              <p className="font-medium line-clamp-1">{e.baslik || `#${e.no}`}</p>
                              <p className="text-[11px] text-[var(--z-muted)]">
                                {formatDistance(d)}
                                {e.aktif === false ? ' · pasif' : ''}
                              </p>
                            </div>
                            <p className="tabular-nums font-semibold shrink-0">
                              {e.m2_fiyat != null ? `${formatTl(Math.round(e.m2_fiyat))}/m²` : formatTl(e.fiyat)}
                            </p>
                          </li>
                        );
                      })}
                  </ul>

                  <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                    <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                      ALICININ İHTİYACI
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPoiCat('all')}
                        className={`rounded-md border px-2 py-1 text-[11px] ${poiCat === 'all' ? 'border-[var(--z-fg)] font-semibold' : 'border-[var(--z-border)]'}`}
                      >
                        Tümü
                      </button>
                      {(Object.keys(POI_LABEL) as NearbyPoi['category'][]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setPoiCat(c)}
                          className={`rounded-md border px-2 py-1 text-[11px] ${poiCat === c ? 'border-[var(--z-fg)] font-semibold' : 'border-[var(--z-border)]'}`}
                        >
                          {POI_LABEL[c]}
                        </button>
                      ))}
                    </div>
                    {filteredPois.length ? (
                      <ul className="space-y-1.5 text-[12px]">
                        {filteredPois.slice(0, 12).map((p) => (
                          <li key={p.id} className="flex justify-between gap-2">
                            <span className="min-w-0 line-clamp-1">
                              <span className="text-[var(--z-muted)]">{POI_LABEL[p.category]} · </span>
                              {p.name}
                            </span>
                            <span className="tabular-nums text-[var(--z-muted)] shrink-0">
                              {formatDistance(p.distanceM)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] text-[var(--z-muted)]">
                        OSM POI yükleniyor veya bulunamadı
                      </p>
                    )}
                    <p className="text-[10px] text-[var(--z-muted)]">
                      Mesafeler kuş uçuşudur; yer adları OpenStreetMap kaydından gelir.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {streetView ? (
                      <a href={streetView} target="_blank" rel="noreferrer" className="z-btn-ghost px-3 py-1.5 text-[12px]">
                        Street View
                      </a>
                    ) : null}
                    {directions ? (
                      <a href={directions} target="_blank" rel="noreferrer" className="z-btn-ghost px-3 py-1.5 text-[12px]">
                        Yol Tarifi
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[var(--z-muted)]">Bu ilanda koordinat yok</p>
              )}
            </div>
          ) : tab === 'satici' ? (
            <div className="space-y-3 text-[13px]">
              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                <div className="flex items-center gap-3">
                  {detail.agent?.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.agent.photo} alt="" className="h-12 w-12 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--z-hover)] text-[12px] font-semibold">
                      {(detail.agent?.name || detail.whom || '?').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{detail.agent?.name || detail.whom || '—'}</p>
                    <p className="text-[12px] text-[var(--z-muted)]">
                      {detail.agency?.name || '—'}
                    </p>
                    {phone ? (
                      <p className="tabular-nums text-[12px] text-[var(--z-muted)]">{phone}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {telHref ? (
                    <a href={telHref} className="z-btn-ghost px-3 py-1.5 text-[12px]">Ara</a>
                  ) : null}
                  {waHref ? (
                    <a href={waHref} target="_blank" rel="noreferrer" className="z-btn-ghost px-3 py-1.5 text-[12px]">WhatsApp</a>
                  ) : null}
                  {phoneDigits ? (
                    <a href={`sms:+${phoneDigits.startsWith('90') ? phoneDigits : `90${phoneDigits.replace(/^0/, '')}`}`} className="z-btn-ghost px-3 py-1.5 text-[12px]">SMS</a>
                  ) : null}
                  <a
                    href={`https://banaozel.sahibinden.com/mesajlarim/detay/${listingNo}/yeni`}
                    target="_blank"
                    rel="noreferrer"
                    className="z-btn-ghost px-3 py-1.5 text-[12px]"
                  >
                    Sahibinden’de mesaj
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <p className="text-[10px] text-[var(--z-muted)]">Araştırma (7g)</p>
                  <p className="text-[18px] font-semibold tabular-nums">
                    {sahip?.arastiran_kisi ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <p className="text-[10px] text-[var(--z-muted)]">WhatsApp</p>
                  <p className="text-[18px] font-semibold tabular-nums">
                    {sahip?.whatsapp_kez ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <p className="text-[10px] text-[var(--z-muted)]">Aktif gün</p>
                  <p className="text-[18px] font-semibold tabular-nums">
                    {detail.statusSummary?.active_days ?? priceHistory?.days_listed ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <p className="text-[10px] text-[var(--z-muted)]">İletişim kişi</p>
                  <p className="text-[18px] font-semibold tabular-nums">
                    {sahip?.iletisim_kisi ?? 0}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  HAZIR MESAJLAR
                </p>
                <textarea
                  readOnly
                  value={message}
                  className="w-full min-h-[96px] rounded-lg border border-[var(--z-border)] bg-[var(--z-hover)] px-3 py-2 text-[12px] leading-relaxed"
                />
                <button
                  type="button"
                  className="z-btn-ghost px-3 py-1.5 text-[12px]"
                  onClick={() => void navigator.clipboard?.writeText(message)}
                >
                  Mesajı kopyala
                </button>
              </div>

              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-1.5 text-[12px]">
                <p className="font-semibold tracking-wide text-[var(--z-muted)]">İLAN HAREKETLERİ</p>
                <p>İlk kayıt: {formatDate(v4?.gecmis?.ivo_ilk_kayit || detail.firstDate)}</p>
                <p>Son güncelleme: {formatDate(detail.updatedAt)}</p>
                <p>
                  Fiyat:{' '}
                  {formatTl(priceHistory?.first_price ?? detail.firstPrice)} →{' '}
                  {formatTl(priceHistory?.current_price ?? detail.price)}
                </p>
              </div>
            </div>
          ) : tab === 'hesap' ? (
            <div className="space-y-4 text-[13px]">
              {!finance || !detail.price ? (
                <p className="text-[var(--z-muted)]">Fiyat yok</p>
              ) : (
                <>
                  <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                    <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                      BAŞLANGIÇTA GEREKEN NAKİT
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCashMode('pesin')}
                        className={`rounded-md border px-3 py-1.5 text-[12px] ${cashMode === 'pesin' ? 'border-[var(--z-fg)] font-semibold' : 'border-[var(--z-border)]'}`}
                      >
                        Peşin
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashMode('kredi')}
                        className={`rounded-md border px-3 py-1.5 text-[12px] ${cashMode === 'kredi' ? 'border-[var(--z-fg)] font-semibold' : 'border-[var(--z-border)]'}`}
                      >
                        Kredili
                      </button>
                    </div>
                    <p className="text-[20px] font-semibold tabular-nums">
                      {formatTl(
                        cashMode === 'pesin'
                          ? detail.price + (buyerCost || 0)
                          : finance.downPayment + (buyerCost || 0)
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--z-muted)]">
                      fiyat + alıcı masrafı (~%4,4)
                    </p>
                  </div>

                  <div className="rounded-xl border border-[var(--z-border)] divide-y divide-[var(--z-border)]">
                    <div className="p-3 space-y-2">
                      <p className="text-[12px] font-semibold">Kira Getirisi</p>
                      <label className="block text-[12px] text-[var(--z-muted)]">
                        Tahmini aylık kira
                        <input
                          type="text"
                          inputMode="numeric"
                          value={
                            rentOverride ||
                            (finance.estimatedRentMonthly != null
                              ? String(finance.estimatedRentMonthly)
                              : '')
                          }
                          onChange={(e) => setRentOverride(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--z-border)] px-3 py-2 tabular-nums"
                        />
                      </label>
                      <p className="text-[18px] font-semibold tabular-nums">
                        {finance.grossYieldPct != null
                          ? `Brüt %${finance.grossYieldPct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
                          : '—'}
                      </p>
                      {finance.grossYieldPct != null ? (
                        <p className="text-[11px] text-[var(--z-muted)]">
                          amortisman ~{(100 / finance.grossYieldPct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} yıl
                        </p>
                      ) : null}
                    </div>
                    <div className="p-3 flex justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold">Masraflar</p>
                        <p className="text-[11px] text-[var(--z-muted)]">Alıcı ≈ %4,4</p>
                      </div>
                      <p className="tabular-nums font-semibold">{formatTl(buyerCost)}</p>
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-[12px] font-semibold">Konut Kredisi</p>
                      <label className="block text-[11px] text-[var(--z-muted)]">
                        Peşinat %{downPct}
                        <input type="range" min={10} max={50} step={5} value={downPct} onChange={(e) => setDownPct(Number(e.target.value))} className="mt-1 w-full accent-[var(--z-fg)]" />
                      </label>
                      <label className="block text-[11px] text-[var(--z-muted)]">
                        Vade {termYears} yıl
                        <input type="range" min={5} max={15} step={1} value={termYears} onChange={(e) => setTermYears(Number(e.target.value))} className="mt-1 w-full accent-[var(--z-fg)]" />
                      </label>
                      <label className="block text-[11px] text-[var(--z-muted)]">
                        Faiz %{ratePct.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                        <input type="range" min={1.5} max={5} step={0.01} value={ratePct} onChange={(e) => setRatePct(Number(e.target.value))} className="mt-1 w-full accent-[var(--z-fg)]" />
                      </label>
                      <p className="tabular-nums">
                        Aylık <span className="font-semibold">{formatTl(finance.monthlyPayment)}</span>
                        {' · '}
                        {termYears * 12} ay
                      </p>
                    </div>
                    <div className="p-3 flex justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold">Mevduat karşılığı</p>
                        <p className="text-[11px] text-[var(--z-muted)]">peşinat × faiz</p>
                      </div>
                      <p className="tabular-nums font-semibold">{formatTl(finance.depositAnnual)}/yıl</p>
                    </div>
                    <div className="p-3 flex justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold">Getiri karşılaştırma</p>
                        <p className="text-[11px] text-[var(--z-muted)]">yıllık kira vs mevduat</p>
                      </div>
                      <p className="tabular-nums text-right text-[12px]">
                        {finance.estimatedRentMonthly != null
                          ? formatTl(finance.estimatedRentMonthly * 12)
                          : '—'}
                        {' · '}
                        {formatTl(finance.depositAnnual)}
                      </p>
                    </div>
                    <div className="p-3 flex justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold">Döviz karşılığı</p>
                      </div>
                      <p className="tabular-nums font-semibold">
                        {detail.priceFx?.usd != null
                          ? `$${Math.round(detail.priceFx.usd).toLocaleString('en-US')}`
                          : '—'}
                        {detail.priceFx?.eur != null
                          ? ` · €${Math.round(detail.priceFx.eur).toLocaleString('en-US')}`
                          : ''}
                      </p>
                    </div>
                    <div className="p-3 flex justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold">Altın karşılığı</p>
                        <p className="text-[11px] text-[var(--z-muted)]">kabaca gram</p>
                      </div>
                      <p className="tabular-nums font-semibold">
                        {goldGrams != null ? `${goldGrams.toLocaleString('tr-TR')} g` : '—'}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : tab === 'kiyas' ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--z-border)] bg-[var(--z-fg)] text-[var(--z-bg,#fff)] p-3 space-y-2">
                <p className="text-[11px] tracking-wide opacity-80">
                  GENELE GÖRE · BENZER {sortedEmsal.length || peers.length} İLANIN MEDYANI
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[22px] font-semibold text-emerald-300">{summary.good}</p>
                    <p className="text-[10px] opacity-80">genelden iyi</p>
                  </div>
                  <div>
                    <p className="text-[22px] font-semibold">{summary.near}</p>
                    <p className="text-[10px] opacity-80">genele yakın</p>
                  </div>
                  <div>
                    <p className="text-[22px] font-semibold text-amber-300">{summary.weak}</p>
                    <p className="text-[10px] opacity-80">genelden zayıf</p>
                  </div>
                </div>
                {summary.ahead.length ? <p className="text-[12px]">Önde: {summary.ahead.join(', ')}</p> : null}
                {summary.behind.length ? (
                  <p className="text-[12px] opacity-90">Geride: {summary.behind.join(', ')}</p>
                ) : null}
                <p className="text-[10px] opacity-70">
                  {summary.compared} kalem karşılaştırıldı
                  {v4?.medyanlar?.aidat?.deger == null ? ' · veri yok: Aidat' : ''}
                </p>
              </div>
              {metrics.map((m) => (
                <CompareSlider key={m.id} metric={m} />
              ))}
            </div>
          ) : (
            <div className="space-y-4 text-[13px]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBuyerPurpose('oturum')}
                  className={`rounded-md border px-3 py-1.5 text-[12px] ${buyerPurpose === 'oturum' ? 'border-[var(--z-fg)] font-semibold' : 'border-[var(--z-border)]'}`}
                >
                  Oturum
                </button>
                <button
                  type="button"
                  onClick={() => setBuyerPurpose('kira')}
                  className={`rounded-md border px-3 py-1.5 text-[12px] ${buyerPurpose === 'kira' ? 'border-[var(--z-fg)] font-semibold' : 'border-[var(--z-border)]'}`}
                >
                  Kira getirisi
                </button>
              </div>

              <div className="rounded-xl border border-[var(--z-border)] p-4 text-center space-y-2">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  {opportunity ? `FIRSAT SKORU · ${opportunity.band || ''}` : 'KARAR ÖZETİ'}
                </p>
                <DecisionGauge score={kararScore} />
                <p className="text-[16px] font-semibold">
                  {opportunity?.band
                    ? `${opportunity.band}${opportunity.percentile != null ? ` · dilim %${opportunity.percentile}` : ''}`
                    : decision?.label}
                </p>
                <p className="text-[12px] text-[var(--z-muted)]">
                  {v4?.konum?.uzun || decision?.positionLabel}
                </p>
                {opportunity?.disclaimer ? (
                  <p className="text-[10px] text-[var(--z-muted)]">{opportunity.disclaimer}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-1">
                <p className="text-[12px] font-semibold">1 · Fiyat konumu</p>
                <p className="text-[12px] text-[var(--z-muted)]">
                  {v4?.konum?.kisa || badge?.label}
                  {v4?.konum?.sapma_pct != null
                    ? ` · ${formatDiffPct(v4.konum.sapma_pct)}`
                    : ''}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--z-border)] p-3">
                <p className="text-[12px] font-semibold mb-1">2 · Mülk özellikleri</p>
                <p className="text-[12px]">
                  {strong.length} güçlü yan · {verify.length} belirtilmemiş
                </p>
              </div>
              {adequacy ? (
                <div className="rounded-xl border border-[var(--z-border)] p-3">
                  <p className="text-[12px] font-semibold mb-1">
                    3 · Veri yeterliliği · {adequacy.level}
                  </p>
                  <ul className="space-y-1 text-[12px] text-[var(--z-muted)]">
                    {adequacy.notes.map((n) => (
                      <li key={n.text}>{n.text}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-xl border border-[var(--z-border)] p-3 space-y-2">
                <p className="text-[12px] font-semibold tracking-wide text-[var(--z-muted)]">
                  SONRAKİ ADIM
                </p>
                <p className="text-[12px]">
                  {verify[0]
                    ? `${verify[0].label.replace(' belirtilmemiş', '')} bilgisini satıcıdan teyit et; sonra ${buyerPurpose === 'kira' ? 'getiri senaryosunu' : 'gösterimi'} planla.`
                    : buyerPurpose === 'kira'
                      ? 'Kira medyanını teyit edip teklif senaryosunu netleştir.'
                      : 'Gösterim planla ve teklif senaryosunu Fiyat sekmesinde dene.'}
                </p>
              </div>

              {opportunity?.reasons?.length ? (
                <ul className="space-y-2">
                  {opportunity.reasons.map((r) => (
                    <li key={r} className="rounded-xl border border-[var(--z-border)] px-3 py-2 text-[12px]">
                      {r}
                    </li>
                  ))}
                </ul>
              ) : decision?.bullets?.length ? (
                <ul className="space-y-2">
                  {decision.bullets.map((b) => (
                    <li key={b} className="rounded-xl border border-[var(--z-border)] px-3 py-2 text-[12px]">
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-[var(--z-border)] bg-[var(--z-bg,#fff)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {telHref ? (
              <a href={telHref} className="z-btn-primary px-3 py-2 text-[12px]">
                Ara
              </a>
            ) : (
              <span className="z-btn-ghost px-3 py-2 text-[12px] opacity-40">Ara</span>
            )}
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="z-btn-ghost px-3 py-2 text-[12px]"
              >
                WhatsApp
              </a>
            ) : (
              <span className="z-btn-ghost px-3 py-2 text-[12px] opacity-40">WhatsApp</span>
            )}
            <button
              type="button"
              className="z-btn-ghost px-3 py-2 text-[12px]"
              onClick={() => {
                void fetch('/api/ivo/listings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'favorite',
                    listingNo,
                    on: true,
                  }),
                });
              }}
            >
              Favori
            </button>
            <button
              type="button"
              className="z-btn-ghost px-3 py-2 text-[12px]"
              onClick={() => {
                const shareUrl =
                  detail?.url ||
                  resolveSahibindenListingUrl(null, listingNo, {
                    title: detail?.title || null,
                    kind: detail?.kind || null,
                    status: detail?.status || null,
                  });
                if (navigator.share) {
                  void navigator.share({
                    title: detail?.title || `İlan ${listingNo}`,
                    url: shareUrl,
                  });
                } else {
                  void navigator.clipboard?.writeText(shareUrl);
                }
              }}
            >
              Paylaş
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
