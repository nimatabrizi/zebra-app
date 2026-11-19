'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Binoculars,
  Building2,
  CheckCircle2,
  Clock3,
  Inbox,
  MoonStar,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  RAKIP_NAV_LEAVES,
  buildRakipShellPayload,
  type RakipTabId,
  isRakipTabId,
} from '../../lib/rakipUiMeta';
import type {
  RakipInventorySnapshotMeta,
  RakipOfficeView,
  RakipPersonView,
  RakipReviewQueueItem,
} from '../../lib/rakip/inventory/types';

type Props = {
  activeTab: string;
  onNavigate: (tabId: string) => void;
};

type ScanScope = 'all' | 'selected';

type SummaryResponse = {
  inventoryReady: boolean;
  reason?: string;
  message?: string;
  meta?: RakipInventorySnapshotMeta;
  provinces?: string[];
  reviewQueueCount?: number;
  inventoryStatusLabel?: string;
};

type ListResponse<T> = {
  inventoryReady: boolean;
  total: number;
  offset: number;
  limit: number;
  items: T[];
  meta: RakipInventorySnapshotMeta;
  message?: string;
};

const PANEL_META: Record<
  RakipTabId,
  { title: string; subtitle: string; icon: LucideIcon }
> = {
  'rakip-ozet': {
    title: 'Özet',
    subtitle: 'Tarama sağlığı, inceleme yükü ve envanter durumu',
    icon: Binoculars,
  },
  'rakip-inceleme': {
    title: 'İnceleme Kuyruğu',
    subtitle: 'Olası ofis değişiklikleri ve doğrulanması gereken kayıtlar',
    icon: Inbox,
  },
  'rakip-danismanlar': {
    title: 'Danışmanlar',
    subtitle: 'Gözlemlenen danışman envanteri ve geçmiş bağlantılar',
    icon: Users,
  },
  'rakip-ofisler': {
    title: 'Ofisler',
    subtitle: 'Takip edilen marka ofisleri ve danışman dağılımı',
    icon: Building2,
  },
  'rakip-taramalar': {
    title: 'Taramalar',
    subtitle: 'Manuel tarama, gece otomasyonu ve çalıştırma geçmişi',
    icon: RefreshCw,
  },
};

function EmptyInventory({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-[var(--z-border)] bg-[var(--z-surface-glass)] px-8 py-14 text-center shadow-[var(--z-shadow-soft)] backdrop-blur-xl">
      <div className="z-hero-glow opacity-50" aria-hidden />
      <div className="relative mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[var(--z-border)] bg-[var(--z-hover)]">
        <Search className="h-5 w-5 text-[var(--z-accent)]" strokeWidth={1.6} />
      </div>
      <h3 className="relative text-[1.15rem] font-medium tracking-tight text-[var(--z-fg)]">
        {title}
      </h3>
      <p className="relative mx-auto mt-2.5 max-w-md text-[13.5px] leading-relaxed text-[var(--z-muted)]">
        {body}
      </p>
      <p className="relative mx-auto mt-4 max-w-sm text-[12px] leading-relaxed text-[var(--z-muted-2)]">
        Eski source.xlsx kayıtları otomatik güncel sayılmaz. Sitede bulunamayan
        danışmanlar otomatik ayrılmış kabul edilmez.
      </p>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'neutral' | 'warn' | 'ok' | 'danger';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'ok'
      ? 'bg-[var(--z-accent-soft)] text-[var(--z-green-text)]'
      : tone === 'warn'
        ? 'bg-[var(--z-hover)] text-[var(--z-orange-text)]'
        : tone === 'danger'
          ? 'bg-[var(--z-danger-surface)] text-[var(--z-red-text)]'
          : 'bg-[var(--z-hover)] text-[var(--z-muted)]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

function FilterBar({
  brands,
  provinces,
  brand,
  province,
  q,
  onBrand,
  onProvince,
  onQ,
  onRefresh,
}: {
  brands: ReadonlyArray<{ id: string; label: string }>;
  provinces: string[];
  brand: string;
  province: string;
  q: string;
  onBrand: (v: string) => void;
  onProvince: (v: string) => void;
  onQ: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] p-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--z-muted-2)]" />
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="İsim / ofis ara"
          className="w-full rounded-xl border border-[var(--z-border)] bg-[var(--z-hover)]/40 py-2 pl-9 pr-3 text-[13px] text-[var(--z-fg)] outline-none focus:border-[var(--z-border-strong)]"
        />
      </div>
      <select
        value={brand}
        onChange={(e) => onBrand(e.target.value)}
        className="rounded-xl border border-[var(--z-border)] bg-[var(--z-hover)]/40 px-3 py-2 text-[13px] text-[var(--z-fg)]"
      >
        <option value="">Tüm markalar</option>
        {brands.map((b) => (
          <option key={b.id} value={b.label}>
            {b.label}
          </option>
        ))}
      </select>
      <select
        value={province}
        onChange={(e) => onProvince(e.target.value)}
        className="rounded-xl border border-[var(--z-border)] bg-[var(--z-hover)]/40 px-3 py-2 text-[13px] text-[var(--z-fg)]"
      >
        <option value="">Tüm iller</option>
        {provinces.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--z-border)] px-3 py-2 text-[12.5px] font-medium text-[var(--z-muted)] hover:bg-[var(--z-hover)] hover:text-[var(--z-fg)]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Yenile
      </button>
    </div>
  );
}

export default function RakipStudio({ activeTab, onNavigate }: Props) {
  const tab: RakipTabId = isRakipTabId(activeTab) ? activeTab : 'rakip-ozet';
  const meta = PANEL_META[tab];
  const Icon = meta.icon;

  const shell = useMemo(() => buildRakipShellPayload(), []);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanScope, setScanScope] = useState<ScanScope>('all');
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [province, setProvince] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [offices, setOffices] = useState<ListResponse<RakipOfficeView> | null>(
    null
  );
  const [people, setPeople] = useState<ListResponse<RakipPersonView> | null>(
    null
  );
  const [reviewItems, setReviewItems] = useState<RakipReviewQueueItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const brands: ReadonlyArray<{ id: string; label: string }> =
    summary?.meta?.brands && summary.meta.brands.length > 0
      ? summary.meta.brands.map((b) => ({ id: b.id, label: b.label }))
      : shell.brands;
  const provinces = summary?.provinces || [];
  const scanReady = shell.scanExecutorReady === true;
  const nightlyReady = shell.nightlyAutomationReady === true;
  const inventoryReady = summary?.inventoryReady === true;

  const selectedCount = useMemo(() => {
    if (scanScope === 'all') return brands.length;
    return selectedBrandIds.length;
  }, [scanScope, selectedBrandIds, brands.length]);

  const toggleBrand = (id: string) => {
    setSelectedBrandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openScanModal = () => {
    setScanScope('all');
    setSelectedBrandIds([]);
    setScanOpen(true);
  };

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    try {
      const res = await fetch('/api/rakip-ui/inventory?view=summary', {
        credentials: 'same-origin',
      });
      const json = (await res.json()) as SummaryResponse & { error?: string };
      if (!res.ok) {
        setSummary(null);
        setSummaryError(json.error || 'Envanter özeti alınamadı');
        return;
      }
      setSummary(json);
    } catch {
      setSummary(null);
      setSummaryError('Envanter özeti alınamadı');
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadLists = useCallback(async () => {
    if (!inventoryReady) {
      setOffices(null);
      setPeople(null);
      return;
    }
    if (
      tab !== 'rakip-ofisler' &&
      tab !== 'rakip-danismanlar' &&
      tab !== 'rakip-inceleme'
    ) {
      return;
    }

    setListLoading(true);
    try {
      if (tab === 'rakip-inceleme') {
        const res = await fetch('/api/rakip-ui/inventory?view=review', {
          credentials: 'same-origin',
        });
        const json = (await res.json()) as {
          inventoryReady?: boolean;
          items?: RakipReviewQueueItem[];
        };
        setReviewItems(
          res.ok && json.inventoryReady ? json.items || [] : []
        );
        return;
      }

      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', '0');
      if (brand) params.set('brand', brand);
      if (province) params.set('province', province);
      if (qDebounced) params.set('q', qDebounced);

      if (tab === 'rakip-ofisler') {
        params.set('view', 'offices');
        const res = await fetch(`/api/rakip-ui/inventory?${params}`, {
          credentials: 'same-origin',
        });
        const json = (await res.json()) as ListResponse<RakipOfficeView>;
        if (res.ok && json.inventoryReady) setOffices(json);
        else setOffices(null);
      } else {
        params.set('view', 'people');
        const res = await fetch(`/api/rakip-ui/inventory?${params}`, {
          credentials: 'same-origin',
        });
        const json = (await res.json()) as ListResponse<RakipPersonView>;
        if (res.ok && json.inventoryReady) setPeople(json);
        else setPeople(null);
      }
    } finally {
      setListLoading(false);
    }
  }, [inventoryReady, tab, brand, province, qDebounced]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  return (
    <div className="panel-enter space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="z-page-kicker mb-2">Rakip İstihbaratı</p>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--z-border)] bg-[var(--z-hover)]">
              <Icon className="h-5 w-5 text-[var(--z-fg)]" strokeWidth={1.7} />
            </div>
            <div>
              <h1 className="text-[1.65rem] font-medium tracking-tight text-[var(--z-fg)]">
                {meta.title}
              </h1>
              <p className="mt-1 text-[13.5px] text-[var(--z-muted)]">{meta.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={inventoryReady ? 'ok' : 'warn'}>
            {inventoryReady ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
            Envanter {inventoryReady ? 'bağlı' : 'bekleniyor'}
          </StatusPill>
          <StatusPill tone={scanReady ? 'ok' : 'warn'}>
            {scanReady ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
            Tarayıcı yürütücü {scanReady ? 'hazır' : 'doğrulanmadı'}
          </StatusPill>
          <StatusPill tone={nightlyReady ? 'ok' : 'neutral'}>
            <MoonStar className="h-3.5 w-3.5" />
            Gece taraması {nightlyReady ? 'aktif' : 'kurulmadı'}
          </StatusPill>
        </div>
      </header>

      <nav
        aria-label="Rakip İstihbaratı bölümleri"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] p-1.5 custom-scrollbar"
      >
        {RAKIP_NAV_LEAVES.map((leaf) => {
          const active = leaf.id === tab;
          return (
            <button
              key={leaf.id}
              type="button"
              onClick={() => onNavigate(leaf.id)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-300 ease-zebra ${
                active
                  ? 'bg-[var(--z-nav-active)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                  : 'text-[var(--z-muted)] hover:bg-[var(--z-hover)] hover:text-[var(--z-fg)]'
              }`}
            >
              {leaf.label}
            </button>
          );
        })}
      </nav>

      {tab === 'rakip-ozet' && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Takip markası',
                value: String(
                  summary?.meta?.brands?.length || shell.trackedBrandCount
                ),
                hint: 'Kapsamdaki markalar',
              },
              {
                label: 'Son Kayıtlı Envanter',
                value: inventoryReady
                  ? `${summary?.meta?.scopedOfficeCount ?? 0} ofis / ${summary?.meta?.scopedPersonCount ?? 0} kişi`
                  : 'Yok',
                hint: inventoryReady
                  ? `Kapsam: ${summary?.meta?.scope || 'regional'} · hedef ${summary?.meta?.researchTargetBrandCount ?? '—'} / arşiv ${summary?.meta?.archiveOnlyBrandCount ?? '—'}`
                  : 'Yerel workbook veya Staging snapshot bekleniyor',
              },
              {
                label: 'Kaynak / gözlem / araştırma',
                value: inventoryReady
                  ? [
                      summary?.meta?.sourceCapturedAt ||
                        summary?.meta?.sourceSnapshotAt ||
                        'kaynak —',
                      summary?.meta?.lastObservedAt || 'gözlem —',
                      summary?.meta?.lastResearchAt || 'araştırma —',
                    ].join(' · ')
                  : '—',
                hint: inventoryReady
                  ? 'sourceCapturedAt · lastObservedAt · lastResearchAt (güncel sayılmaz)'
                  : 'Veri bağlanınca dolacak',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] px-4 py-4"
              >
                <p className="text-[11px] uppercase tracking-wide text-[var(--z-muted-2)]">
                  {card.label}
                </p>
                <p className="mt-2 text-[1.15rem] font-medium tracking-tight text-[var(--z-fg)] break-words">
                  {card.value}
                </p>
                <p className="mt-1 text-[12px] text-[var(--z-muted)]">{card.hint}</p>
              </div>
            ))}
          </div>

          {summaryError && (
            <EmptyInventory title="Envanter erişilemedi" body={summaryError} />
          )}

          {!summaryError && !inventoryReady && (
            <EmptyInventory
              title="Son kayıtlı rakip envanteri henüz bağlanmadı"
              body={
                summary?.message ||
                shell.message
              }
            />
          )}

          {inventoryReady && summary?.meta && (
            <div className="rounded-[1.75rem] border border-[var(--z-border)] bg-[var(--z-surface)] p-5 sm:p-6">
              <h2 className="text-[1.05rem] font-medium text-[var(--z-fg)]">
                Son Kayıtlı Envanter özeti
              </h2>
              <p className="mt-1.5 text-[13px] text-[var(--z-muted)]">
                {summary.meta.sourceLabel}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-[13px]">
                <div>
                  <dt className="text-[var(--z-muted-2)]">Ham ofis satırı</dt>
                  <dd className="mt-0.5 text-[var(--z-fg)]">
                    {summary.meta.rawOfficeRows} (benzersiz anahtar{' '}
                    {summary.meta.uniqueOfficeKeys})
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--z-muted-2)]">Ham kişi satırı</dt>
                  <dd className="mt-0.5 text-[var(--z-fg)]">
                    {summary.meta.rawPersonRows} (benzersiz anahtar{' '}
                    {summary.meta.uniquePersonKeys})
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--z-muted-2)]">Kapsamlı ofis / kişi</dt>
                  <dd className="mt-0.5 text-[var(--z-fg)]">
                    {summary.meta.scopedOfficeCount} /{' '}
                    {summary.meta.scopedPersonCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--z-muted-2)]">Kaynak yakalama</dt>
                  <dd className="mt-0.5 text-[var(--z-fg)]">
                    {summary.meta.sourceCapturedAt ||
                      summary.meta.sourceSnapshotAt ||
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--z-muted-2)]">Son kayıt gözlemi</dt>
                  <dd className="mt-0.5 text-[var(--z-fg)]">
                    {summary.meta.lastObservedAt || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--z-muted-2)]">Son cloud araştırma</dt>
                  <dd className="mt-0.5 text-[var(--z-fg)]">
                    {summary.meta.lastResearchAt || 'Henüz birleştirilmedi'}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--z-muted)]">
                Bu veri &quot;güncel&quot; sayılmaz. Satır sayısı benzersiz danışman
                varsayılmaz. Eksik gözlem ayrılış değildir; Armada gibi arşiv
                markaları sessizce silinmez. İnceleme kuyruğu:{' '}
                {summary.reviewQueueCount ?? 0} (bildirim gönderilmez).
              </p>
            </div>
          )}
        </section>
      )}

      {tab === 'rakip-inceleme' && (
        <section className="space-y-4">
          {!inventoryReady ? (
            <EmptyInventory
              title="İnceleme kuyruğu bağlanmadı"
              body="Son kayıtlı envanter bağlanınca cloud olay adayları burada listelenir. Bildirim gönderilmez."
            />
          ) : reviewItems.length === 0 ? (
            <EmptyInventory
              title="İnceleme kuyruğu boş"
              body="Cloud Research olay adayları (join / depart / transfer / office-change) kanıt kapısından geçtikten sonra burada listelenir. Prior inventory yoksa hareket iddiası üretilmez; bildirim bu aşamada gönderilmez."
            />
          ) : (
            <div className="overflow-hidden rounded-[1.5rem] border border-[var(--z-border)] bg-[var(--z-surface)]">
              <div className="border-b border-[var(--z-border)] px-4 py-3 text-[12.5px] text-[var(--z-muted)]">
                {listLoading
                  ? 'Yükleniyor…'
                  : `${reviewItems.length} doğrulanmamış aday · bildirim yok`}
              </div>
              <ul className="divide-y divide-[var(--z-border)]">
                {reviewItems.map((item) => (
                  <li key={item.reviewId} className="px-4 py-3 text-[13px]">
                    <div className="font-medium text-[var(--z-fg)]">
                      {item.eventType}
                    </div>
                    <div className="mt-1 text-[var(--z-muted)]">
                      {item.fullName || item.personKey || '—'} ·{' '}
                      {item.brandSlug || '—'} · {item.verificationStatus}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--z-muted-2)]">
                      {item.evidenceSummary}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'rakip-danismanlar' && (
        <section className="space-y-4">
          {!inventoryReady ? (
            <EmptyInventory
              title="Danışman envanteri bağlanmadı"
              body={
                summary?.message ||
                'Yerel salt-okunur workbook yolu veya Staging envanter snapshot’ı yapılandırılınca liste açılır.'
              }
            />
          ) : (
            <>
              <FilterBar
                brands={brands}
                provinces={provinces}
                brand={brand}
                province={province}
                q={q}
                onBrand={setBrand}
                onProvince={setProvince}
                onQ={setQ}
                onRefresh={() => void loadLists()}
              />
              <div className="overflow-hidden rounded-[1.5rem] border border-[var(--z-border)] bg-[var(--z-surface)]">
                <div className="flex items-center justify-between border-b border-[var(--z-border)] px-4 py-3 text-[12.5px] text-[var(--z-muted)]">
                  <span>
                    {listLoading
                      ? 'Yükleniyor…'
                      : `${people?.total ?? 0} kayıt (ilk ${people?.items.length ?? 0})`}
                  </span>
                  <span>
                    Kaynak:{' '}
                    {people?.meta.sourceSnapshotAt ||
                      people?.meta.lastVerificationAt ||
                      '—'}
                  </span>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="min-w-full text-left text-[13px]">
                    <thead className="bg-[var(--z-hover)]/50 text-[11px] uppercase tracking-wide text-[var(--z-muted-2)]">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Ad</th>
                        <th className="px-4 py-2.5 font-medium">Marka</th>
                        <th className="px-4 py-2.5 font-medium">Ofis</th>
                        <th className="px-4 py-2.5 font-medium">İl</th>
                        <th className="px-4 py-2.5 font-medium">Doğrulama</th>
                        <th className="px-4 py-2.5 font-medium">Son görülme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(people?.items || []).map((p) => (
                        <tr
                          key={p.personKey}
                          className="border-t border-[var(--z-border)]"
                        >
                          <td className="px-4 py-2.5 text-[var(--z-fg)]">
                            <div className="font-medium">{p.fullName || '—'}</div>
                            <div className="text-[11px] text-[var(--z-muted-2)]">
                              {p.roleTitle || '—'}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {p.brand}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {p.officeName || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {p.province}
                            {p.district ? ` / ${p.district}` : ''}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {p.verificationStatus}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {p.lastSeen || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'rakip-ofisler' && (
        <section className="space-y-4">
          {!inventoryReady ? (
            <EmptyInventory
              title="Ofis görünümü bağlanmadı"
              body={
                summary?.message ||
                'Yerel salt-okunur workbook yolu veya Staging envanter snapshot’ı yapılandırılınca liste açılır.'
              }
            />
          ) : (
            <>
              <FilterBar
                brands={brands}
                provinces={provinces}
                brand={brand}
                province={province}
                q={q}
                onBrand={setBrand}
                onProvince={setProvince}
                onQ={setQ}
                onRefresh={() => void loadLists()}
              />
              <div className="overflow-hidden rounded-[1.5rem] border border-[var(--z-border)] bg-[var(--z-surface)]">
                <div className="flex items-center justify-between border-b border-[var(--z-border)] px-4 py-3 text-[12.5px] text-[var(--z-muted)]">
                  <span>
                    {listLoading
                      ? 'Yükleniyor…'
                      : `${offices?.total ?? 0} kayıt (ilk ${offices?.items.length ?? 0})`}
                  </span>
                  <span>
                    Kaynak:{' '}
                    {offices?.meta.sourceSnapshotAt ||
                      offices?.meta.lastVerificationAt ||
                      '—'}
                  </span>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="min-w-full text-left text-[13px]">
                    <thead className="bg-[var(--z-hover)]/50 text-[11px] uppercase tracking-wide text-[var(--z-muted-2)]">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Ofis</th>
                        <th className="px-4 py-2.5 font-medium">Marka</th>
                        <th className="px-4 py-2.5 font-medium">İl / İlçe</th>
                        <th className="px-4 py-2.5 font-medium">Kapsam</th>
                        <th className="px-4 py-2.5 font-medium">Son görülme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(offices?.items || []).map((o) => (
                        <tr
                          key={o.officeKey}
                          className="border-t border-[var(--z-border)]"
                        >
                          <td className="px-4 py-2.5 text-[var(--z-fg)]">
                            <div className="font-medium">{o.officeName}</div>
                            <div className="text-[11px] text-[var(--z-muted-2)]">
                              {o.officeKey}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {o.brand}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {o.province}
                            {o.district ? ` / ${o.district}` : ''}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {o.verificationStatus}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--z-muted)]">
                            {o.lastSeen || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'rakip-taramalar' && (
        <section className="space-y-5">
          <div className="rounded-[1.75rem] border border-[var(--z-border)] bg-[var(--z-surface)] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-[1.05rem] font-medium text-[var(--z-fg)]">
                  Manuel tarama
                </h2>
                <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-[var(--z-muted)]">
                  Tek marka, seçili markalar veya 13 markanın tamamı için on-demand
                  tarama. Çakışan taramalar sunucu lease ile engellenir; kısmi
                  sonuçlar doğrulanmış current bundle’ı bozmaz.
                </p>
              </div>
              <button
                type="button"
                onClick={openScanModal}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--z-inverse)] px-4 py-2.5 text-[13px] font-medium text-[var(--z-inverse-fg)] shadow-[var(--z-shadow-soft)] transition active:scale-[0.98]"
              >
                <Play className="h-4 w-4" strokeWidth={1.8} />
                Taramayı yapılandır
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--z-border)] bg-[var(--z-hover)]/40 px-4 py-3.5">
                <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--z-fg)]">
                  <Clock3 className="h-4 w-4 text-[var(--z-muted)]" />
                  Canlı ilerleme
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--z-muted)]">
                  Yürütücü doğrulanınca marka bazlı ok / kısmi / hata durumları
                  burada canlı güncellenecek.
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--z-border)] bg-[var(--z-hover)]/40 px-4 py-3.5">
                <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--z-fg)]">
                  <MoonStar className="h-4 w-4 text-[var(--z-muted)]" />
                  Gece otomasyonu
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--z-muted)]">
                  {shell.nightlyScheduleLabel}
                </p>
              </div>
            </div>
          </div>

          <EmptyInventory
            title="Tarama geçmişi yok"
            body="Başarılı, kısmi ve başarısız çalıştırmalar CB360 run kayıtlarına bağlandığında burada listelenecek."
          />
        </section>
      )}

      {scanOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--z-scrim)] p-3 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rakip-scan-title"
          onClick={() => setScanOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-[var(--z-border-strong)] bg-[var(--z-surface)] shadow-[var(--z-shadow-float)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--z-border)] px-5 py-4">
              <h2
                id="rakip-scan-title"
                className="text-[1.05rem] font-medium text-[var(--z-fg)]"
              >
                Manuel tarama
              </h2>
              <p className="mt-1 text-[12.5px] text-[var(--z-muted)]">
                Marka kapsamını seçin. Başlatma, tarayıcı yürütücü PoC’si
                tamamlanana kadar kapalıdır.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex gap-2">
                {(
                  [
                    { id: 'all' as const, label: 'Tüm markalar' },
                    { id: 'selected' as const, label: 'Seçili markalar' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScanScope(opt.id)}
                    className={`rounded-xl px-3 py-2 text-[12.5px] font-medium transition ${
                      scanScope === opt.id
                        ? 'bg-[var(--z-nav-active)] text-[var(--z-fg)]'
                        : 'bg-[var(--z-hover)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {scanScope === 'selected' && (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-[var(--z-border)] p-2 custom-scrollbar">
                  {brands.map((b) => {
                    const id = b.id;
                    const label = b.label;
                    const checked = selectedBrandIds.includes(id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-[var(--z-hover)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBrand(id)}
                          className="h-4 w-4 accent-[var(--z-fg)]"
                        />
                        <span className="text-[13px] text-[var(--z-fg)]">
                          {label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="rounded-2xl border border-dashed border-[var(--z-border-strong)] bg-[var(--z-hover)]/50 px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--z-muted)]">
                <p>
                  Seçili kapsam:{' '}
                  <strong className="text-[var(--z-fg)]">{selectedCount}</strong>{' '}
                  marka
                </p>
                {!scanReady && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[var(--z-orange-text)]">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ChatGPT Work / cloud browser entegrasyonu henüz kanıtlanmadı.
                    Sahte başlatma yapılmaz.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--z-border)] px-5 py-4">
              <button
                type="button"
                onClick={() => setScanOpen(false)}
                className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-[var(--z-muted)] hover:bg-[var(--z-hover)] hover:text-[var(--z-fg)]"
              >
                Kapat
              </button>
              <button
                type="button"
                disabled
                title="Tarayıcı yürütücü doğrulanmadan tarama başlatılamaz"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--z-inverse)] px-3.5 py-2 text-[13px] font-medium text-[var(--z-inverse-fg)] opacity-45 cursor-not-allowed"
              >
                <Play className="h-3.5 w-3.5" />
                Taramayı Başlat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
