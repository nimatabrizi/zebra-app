'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import {
  Award,
  Check,
  Download,
  FileSpreadsheet,
  ImageOff,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import PeoplePicker from './PeoplePicker';
import {
  DEFAULT_PHOTO_ADJUST,
  RANK_CANVAS,
  RANK_CATEGORIES,
  RANK_PERIODS,
  RANK_TEMPLATES,
  buildRankingTemplateRows,
  canvasToBlob,
  loadRankImage,
  measureOpaqueBox,
  parseRankingWorkbook,
  rankFileSlug,
  renderRankVisual,
  templateFor,
  turkishRankSuffix,
  type ParsedRankings,
  type PhotoAdjust,
  type RankCategoryId,
  type RankEntry,
  type RankOutputKind,
  type RankPeriodId,
  type RenderPerson,
} from '../lib/rankingVisuals';

type ProfileLite = { name: string; title: string; slug: string; tokens: string[] };

type ResolvedPerson = {
  key: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
};

type OutputItem = {
  key: string;
  kind: RankOutputKind;
  periodId: RankPeriodId;
  category: RankCategoryId;
  rank: number;
  people: ResolvedPerson[];
  templateUrl: string | null;
  adjustKey: string;
  label: string;
  detail: string;
  zipPath: string;
};

const ADJUST_STORAGE_KEY = 'zebra-siralama-photo-adjust-v2';
const OFFSET_LIMIT = 500;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
}

function isDefaultAdjust(adjust: PhotoAdjust) {
  return adjust.scale === 1 && adjust.dx === 0 && adjust.dy === 0;
}

function significantTokens(slug: string): string[] {
  return slug.split('-').filter((t) => t && t !== 'dr' && t.length >= 2);
}

function matchProfile(name: string, profiles: ProfileLite[]): ProfileLite | null {
  const slug = toConsultantPhotoSlug(name);
  if (!slug) return null;
  const exact = profiles.find((p) => p.slug === slug);
  if (exact) return exact;
  const want = significantTokens(slug);
  if (want.length < 2) return null;
  const first = want[0]!;
  const last = want[want.length - 1]!;
  return (
    profiles.find((p) => p.tokens.includes(first) && p.tokens.includes(last)) || null
  );
}

function rankText(rank: number) {
  return `${rank}.${turkishRankSuffix(rank)}`;
}

function periodLabel(id: RankPeriodId) {
  return RANK_PERIODS.find((p) => p.id === id)?.label || id;
}

function categoryShort(id: RankCategoryId) {
  return RANK_CATEGORIES.find((c) => c.id === id)?.short || id;
}

async function toRenderPeople(people: ResolvedPerson[]): Promise<RenderPerson[]> {
  return Promise.all(
    people.map(async (person) => {
      const photo = await loadRankImage(person.photoUrl);
      return {
        displayName: person.displayName,
        title: person.title,
        photo,
        bounds: photo ? measureOpaqueBox(photo) : null,
      };
    })
  );
}

async function renderItem(item: OutputItem, adjust: PhotoAdjust) {
  if (!item.templateUrl) throw new Error('Template bekleniyor');
  return renderRankVisual({
    kind: item.kind,
    templateUrl: item.templateUrl,
    rank: item.rank,
    people: await toRenderPeople(item.people),
    adjust,
  });
}

function thumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const thumb = document.createElement('canvas');
  thumb.width = 432;
  thumb.height = 540;
  thumb.getContext('2d')?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return new Promise((resolve, reject) =>
    thumb.toBlob((b) => (b ? resolve(b) : reject(new Error('thumb'))), 'image/jpeg', 0.86)
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function ToggleChip({
  active,
  onClick,
  children,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-all duration-300 ${
        active
          ? 'border-transparent bg-[var(--z-inverse)] text-[var(--z-inverse-fg)] shadow-[var(--z-shadow-soft)]'
          : `border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_65%,transparent)] hover:border-[var(--z-border-strong)] ${
              muted ? 'text-[var(--z-muted-2)]' : 'text-[var(--z-fg)]'
            }`
      }`}
    >
      {active ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
      {children}
    </button>
  );
}

export default function RankingVisualsStudio({ isActive = true }: { isActive?: boolean }) {
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [photoSlugs, setPhotoSlugs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRankings | null>(null);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);

  const [periods, setPeriods] = useState<RankPeriodId[]>(RANK_PERIODS.map((p) => p.id));
  const [categories, setCategories] = useState<RankCategoryId[]>(RANK_CATEGORIES.map((c) => c.id));
  const [kinds, setKinds] = useState<RankOutputKind[]>(['rank', 'award']);
  const [personKeys, setPersonKeys] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState('');

  const [adjustments, setAdjustments] = useState<Record<string, PhotoAdjust>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbErrors, setThumbErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<OutputItem | null>(null);
  const [draft, setDraft] = useState<PhotoAdjust>(DEFAULT_PHOTO_ADJUST);
  const [previewReady, setPreviewReady] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PhotoAdjust;
  } | null>(null);
  const [exporting, setExporting] = useState<{ current: number; total: number } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADJUST_STORAGE_KEY);
      if (raw) setAdjustments(JSON.parse(raw));
    } catch {
      /* bozuk kayıt yok sayılır */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ADJUST_STORAGE_KEY, JSON.stringify(adjustments));
    } catch {
      /* kota dolu olabilir */
    }
  }, [adjustments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: files }, { data: rows }] = await Promise.all([
        supabase.storage
          .from('consultant-photos')
          .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
        supabase.from('profiles').select('tam_isim, unvan'),
      ]);
      if (cancelled) return;
      setPhotoSlugs(
        (files || [])
          .map((file) => String(file.name || '').replace(/\.png$/i, ''))
          .filter(Boolean)
      );
      setProfiles(
        (rows || [])
          .map((row) => {
            const record = row as Record<string, unknown>;
            const name = String(record.tam_isim || '').normalize('NFC').trim();
            if (!name) return null;
            const slug = toConsultantPhotoSlug(name);
            return {
              name,
              title: resolveConsultantTitle(name, String(record.unvan || '')),
              slug,
              tokens: significantTokens(slug),
            };
          })
          .filter(Boolean) as ProfileLite[]
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(thumbUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  const resolvePerson = useCallback(
    (name: string, key: string): ResolvedPerson => {
      const profile = matchProfile(name, profiles);
      const baseName = profile?.name || name;
      return {
        key,
        displayName: toStudioDisplayName(baseName),
        title: profile?.title || resolveConsultantTitle(baseName, null),
        photoUrl: resolveConsultantPhotoUrl(baseName, photoSlugs),
      };
    },
    [profiles, photoSlugs]
  );

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseError('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const result = parseRankingWorkbook(workbook, (sheetName) =>
        XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
          header: 1,
          defval: '',
          blankrows: false,
        })
      );
      setParsed(result);
      setFileName(file.name);
      setPersonKeys([]);
      if (!result.entries.length) {
        setParseError('Dosyada okunabilir sıralama bulunamadı. "Excel nasıl hazırlanır?" bölümüne göz atın.');
      }
    } catch (error) {
      console.error('Sıralama Excel okunamadı:', error);
      setParseError('Excel dosyası okunamadı. .xlsx biçiminde kaydedip tekrar deneyin.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadSampleExcel = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    for (const period of RANK_PERIODS) {
      const sheet = XLSX.utils.aoa_to_sheet(
        buildRankingTemplateRows(period.id, parsed?.entries || [])
      );
      sheet['!cols'] = [{ wch: 8 }, { wch: 38 }];
      XLSX.utils.book_append_sheet(workbook, sheet, period.sheetName);
    }
    XLSX.writeFile(workbook, 'Siralamalar_Sablon.xlsx');
  };

  const entries = useMemo(() => parsed?.entries || [], [parsed]);

  const scopedEntries = useMemo(
    () =>
      entries.filter(
        (entry) => periods.includes(entry.periodId) && categories.includes(entry.category)
      ),
    [entries, periods, categories]
  );

  const peopleIndex = useMemo(() => {
    const map = new Map<string, { key: string; name: string; count: number }>();
    for (const entry of scopedEntries) {
      for (const person of entry.people) {
        const current = map.get(person.key);
        if (current) current.count += 1;
        else
          map.set(person.key, {
            key: person.key,
            name: resolvePerson(person.name, person.key).displayName,
            count: 1,
          });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [scopedEntries, resolvePerson]);

  const visiblePeople = useMemo(() => {
    const needle = personQuery.trim().toLocaleLowerCase('tr-TR');
    if (!needle) return peopleIndex;
    return peopleIndex.filter((p) => p.name.toLocaleLowerCase('tr-TR').includes(needle));
  }, [peopleIndex, personQuery]);

  const items = useMemo(() => {
    const out: OutputItem[] = [];
    const personFilter = personKeys.length ? new Set(personKeys) : null;
    const filtered = scopedEntries.filter(
      (entry) => !personFilter || entry.people.some((p) => personFilter.has(p.key))
    );

    const resolveAll = (entry: RankEntry) =>
      entry.people.map((person) => resolvePerson(person.name, person.key));

    if (kinds.includes('rank')) {
      for (const entry of filtered) {
        const people = resolveAll(entry);
        const period = RANK_PERIODS.find((p) => p.id === entry.periodId)!;
        const names = people.map((p) => p.displayName).join(' & ');
        out.push({
          key: `rank|${entry.id}`,
          kind: 'rank',
          periodId: entry.periodId,
          category: entry.category,
          rank: entry.rank,
          people,
          templateUrl: templateFor(entry.periodId, 'rank', entry.category),
          adjustKey: `rank|${entry.id}`,
          label: names,
          detail: `${period.label} · ${categoryShort(entry.category)} · ${rankText(entry.rank)}`,
          zipPath: `${period.fileSlug}/${entry.category}/${String(entry.rank).padStart(2, '0')}-${rankFileSlug(names)}.png`,
        });
      }
    }

    if (kinds.includes('award')) {
      const groups = new Map<string, RankEntry[]>();
      for (const entry of filtered) {
        const groupKey = `${entry.periodId}|${entry.people.map((p) => p.key).join('+')}`;
        groups.set(groupKey, [...(groups.get(groupKey) || []), entry]);
      }
      for (const [groupKey, group] of groups) {
        const first = group[0]!;
        const people = resolveAll(first);
        const period = RANK_PERIODS.find((p) => p.id === first.periodId)!;
        const names = people.map((p) => p.displayName).join(' & ');
        out.push({
          key: `award|${groupKey}`,
          kind: 'award',
          periodId: first.periodId,
          category: first.category,
          rank: first.rank,
          people,
          templateUrl: templateFor(first.periodId, 'award', first.category),
          adjustKey: `award|${groupKey}`,
          label: names,
          detail: `${period.label} · Ödülünüz var · ${group
            .map((e) => `${categoryShort(e.category)} ${rankText(e.rank)}`)
            .join(', ')}`,
          zipPath: `${period.fileSlug}/odulunuz-var/${rankFileSlug(names)}.png`,
        });
      }
    }
    return out;
  }, [scopedEntries, personKeys, kinds, resolvePerson]);

  const readyItems = useMemo(() => items.filter((item) => item.templateUrl), [items]);
  const waitingCount = items.length - readyItems.length;

  const adjustFor = useCallback(
    (item: OutputItem) => adjustments[item.adjustKey] || DEFAULT_PHOTO_ADJUST,
    [adjustments]
  );

  const thumbKey = useCallback(
    (item: OutputItem) => {
      const a = adjustFor(item);
      return `${item.key}|${a.scale}|${a.dx}|${a.dy}|${item.people.map((p) => p.photoUrl).join(',')}`;
    },
    [adjustFor]
  );

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      for (const item of readyItems) {
        if (cancelled) return;
        const key = thumbKey(item);
        if (thumbUrlsRef.current[key]) continue;
        try {
          const canvas = await renderItem(item, adjustFor(item));
          const blob = await thumbnailBlob(canvas);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          thumbUrlsRef.current[key] = url;
          setThumbs((current) => ({ ...current, [key]: url }));
        } catch (error) {
          if (cancelled) return;
          setThumbErrors((current) => ({
            ...current,
            [key]: error instanceof Error ? error.message : 'Çizilemedi',
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readyItems, thumbKey, adjustFor, isActive]);

  // Sürükleme sırasında kare kaçırmamak için: çizim sürerken gelen istek
  // biriktirilir, çizim bitince en güncel ayarla bir kez daha çizilir.
  const editingRef = useRef<OutputItem | null>(null);
  const draftRef = useRef<PhotoAdjust>(DEFAULT_PHOTO_ADJUST);
  const previewRenderRef = useRef({ busy: false, pending: false });
  useEffect(() => {
    editingRef.current = editing;
    draftRef.current = draft;
  }, [editing, draft]);

  const paintPreview = useCallback(async () => {
    const state = previewRenderRef.current;
    if (state.busy) {
      state.pending = true;
      return;
    }
    const item = editingRef.current;
    if (!item) return;
    state.busy = true;
    try {
      const canvas = await renderItem(item, draftRef.current);
      const target = previewCanvasRef.current;
      if (target && editingRef.current === item) {
        target.getContext('2d')?.drawImage(canvas, 0, 0, target.width, target.height);
        setPreviewReady(true);
      }
    } catch {
      /* önizleme hatası indirmede tekrar denenir */
    } finally {
      state.busy = false;
      if (state.pending) {
        state.pending = false;
        void paintPreview();
      }
    }
  }, []);

  useEffect(() => {
    if (editing) void paintPreview();
  }, [editing, draft, paintPreview]);

  const openEditor = (item: OutputItem) => {
    setPreviewReady(false);
    setDraft(adjustFor(item));
    setEditing(item);
  };

  const commitDraft = (item: OutputItem, adjust: PhotoAdjust) => {
    setAdjustments((current) => {
      const next = { ...current };
      if (isDefaultAdjust(adjust)) delete next[item.adjustKey];
      else next[item.adjustKey] = adjust;
      return next;
    });
  };

  const closeEditor = () => {
    if (editing) commitDraft(editing, draft);
    setEditing(null);
    setPreviewReady(false);
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: draftRef.current,
    };
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = RANK_CANVAS.width / Math.max(1, rect.width);
    setDraft({
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    });
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const downloadOne = async (item: OutputItem, adjustOverride?: PhotoAdjust) => {
    setDownloadingKey(item.key);
    try {
      const canvas = await renderItem(item, adjustOverride || adjustFor(item));
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, item.zipPath.split('/').join('_'));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setDownloadingKey('');
    }
  };

  const downloadZip = async () => {
    if (!readyItems.length) return;
    const zip = new JSZip();
    const root = zip.folder('Siralama-Gorselleri')!;
    setExporting({ current: 0, total: readyItems.length });
    try {
      for (let i = 0; i < readyItems.length; i += 1) {
        const item = readyItems[i]!;
        const canvas = await renderItem(item, adjustFor(item));
        root.file(item.zipPath, await canvasToBlob(canvas));
        setExporting({ current: i + 1, total: readyItems.length });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'siralama-gorselleri.zip');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const toggle = <T,>(list: T[], value: T, setter: (next: T[]) => void) => {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const periodCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) counts[entry.periodId] = (counts[entry.periodId] || 0) + 1;
    return counts;
  }, [entries]);

  return (
    <div className="panel-enter space-y-10">
      <header>
        <p className="z-page-kicker">Zebra Studio · Ödül ve sıralama</p>
        <h1 className="z-page-title mt-3">Sıralama Görselleri</h1>
        <p className="z-page-sub">
          Excel&apos;deki sıralamaları yükleyin; ay, çeyrek, kategori ve kişi bazında sıralama ve
          &quot;Ödülünüz var&quot; görsellerini tek tek ya da toplu indirin.
        </p>
      </header>

      {/* Template durumu */}
      <section className="z-card p-6 sm:p-8">
        <p className="z-label">Template durumu</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {RANK_PERIODS.map((period) => {
            const set = RANK_TEMPLATES[period.id];
            const ready = RANK_CATEGORIES.filter((c) => set.rank[c.id]).length + (set.award ? 1 : 0);
            return (
              <div
                key={period.id}
                className="rounded-2xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_60%,transparent)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-medium text-[var(--z-fg)]">{period.label}</p>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      ready === 4 ? 'bg-emerald-400' : ready ? 'bg-amber-400' : 'bg-[var(--z-muted-2)]'
                    }`}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-[12px] text-[var(--z-muted)]">
                  {RANK_CATEGORIES.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span>{c.short}</span>
                      <span className={set.rank[c.id] ? 'text-[var(--z-fg)]' : ''}>
                        {set.rank[c.id] ? 'Hazır' : 'Bekleniyor'}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2">
                    <span>Ödülünüz var</span>
                    <span className={set.award ? 'text-[var(--z-fg)]' : ''}>
                      {set.award ? 'Hazır' : 'Bekleniyor'}
                    </span>
                  </li>
                </ul>
                {parsed ? (
                  <p className="mt-3 border-t border-[var(--z-border)] pt-3 text-[12px] text-[var(--z-muted)]">
                    Excel: {periodCounts[period.id] || 0} satır
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Excel */}
      <section className="z-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="z-btn-icon h-12 w-12 shrink-0">
              <FileSpreadsheet className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <div>
              <p className="text-[17px] font-medium text-[var(--z-fg)]">Sıralama Excel&apos;i</p>
              <p className="mt-1 text-[13px] text-[var(--z-muted)]">
                {fileName
                  ? `${fileName} · ${entries.length} sıralama satırı okundu`
                  : 'Her dönem ayrı sayfa: Mayıs, Haziran, Temmuz, Ağustos, 2. Çeyrek'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={downloadSampleExcel} className="z-btn-ghost inline-flex items-center gap-2 px-5 py-3 text-[13px]">
              <Download className="h-4 w-4" strokeWidth={1.8} />
              {parsed ? 'Excel\u2019i şablon biçiminde indir' : 'Boş Excel şablonu indir'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="z-btn-primary inline-flex items-center gap-2 px-6 py-3 text-[13px] disabled:opacity-50"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.8} />}
              {fileName ? 'Başka Excel yükle' : 'Excel yükle'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        </div>

        {parseError ? (
          <p className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
            {parseError}
          </p>
        ) : null}

        {parsed ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {parsed.sheets.map((sheet) => (
              <span key={sheet.name} className="z-chip">
                {sheet.name} → {sheet.periodId ? periodLabel(sheet.periodId) : 'eşleşmedi'} · {sheet.count}
              </span>
            ))}
          </div>
        ) : null}
        {parsed?.warnings.length ? (
          <ul className="mt-4 space-y-1 text-[12px] text-amber-400/90">
            {parsed.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}

        <details className="group mt-6 rounded-2xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_50%,transparent)] px-5 py-4">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-[var(--z-fg)]">
            Excel nasıl hazırlanır?
          </summary>
          <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-[var(--z-muted)]">
            <li>• Her dönem ayrı sayfa: <b className="text-[var(--z-fg)]">Mayıs, Haziran, Temmuz, Ağustos, 2. Çeyrek</b>.</li>
            <li>• Sayfada her kategori için bir başlık satırı: <b className="text-[var(--z-fg)]">Ciro Sıralaması</b>, <b className="text-[var(--z-fg)]">Portföy Alma Sıralaması</b>, <b className="text-[var(--z-fg)]">İşlem Sıralaması</b>.</li>
            <li>• Başlığın altında <b className="text-[var(--z-fg)]">Sıra | İsim / Takım</b> satırı, ardından her kişi bir satır: A sütununa sıra (1, 2, 3…), B sütununa ad soyad.</li>
            <li>• Aynı sırayı paylaşanlar aynı numarayla ayrı satırlara yazılır (ör. iki tane 2).</li>
            <li>• Ortak çalışan ekip tek satır yazılabilir: &quot;Murat Uzunoğlu - Gönül Hanege&quot; ya da aynı soyadlıysa &quot;Serkan / Selin Eskit&quot;. Her kişi için ayrı görsel hazırlanır.</li>
            <li>• İsimler sistemdeki kullanıcı adlarıyla aynı yazılmalı; fotoğraf ve ünvan oradan gelir.</li>
            <li>• &quot;Takım Verimliliği&quot; bloğu kalabilir, görseli olmadığı için atlanır.</li>
          </ul>
        </details>
      </section>

      {parsed && entries.length ? (
        <>
          {/* Seçenekler */}
          <section className="z-card space-y-8 p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="z-label mb-0">Dönem</p>
                <button
                  type="button"
                  className="text-[12px] text-[var(--z-muted)] hover:text-[var(--z-fg)]"
                  onClick={() =>
                    setPeriods(periods.length === RANK_PERIODS.length ? [] : RANK_PERIODS.map((p) => p.id))
                  }
                >
                  {periods.length === RANK_PERIODS.length ? 'Hiçbiri' : 'Tümü'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {RANK_PERIODS.map((period) => (
                  <ToggleChip
                    key={period.id}
                    active={periods.includes(period.id)}
                    muted={!periodCounts[period.id]}
                    onClick={() => toggle(periods, period.id, setPeriods)}
                  >
                    {period.label}
                    <span className="opacity-60">{periodCounts[period.id] || 0}</span>
                  </ToggleChip>
                ))}
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <p className="z-label">Kategori</p>
                <div className="flex flex-wrap gap-2">
                  {RANK_CATEGORIES.map((category) => (
                    <ToggleChip
                      key={category.id}
                      active={categories.includes(category.id)}
                      onClick={() => toggle(categories, category.id, setCategories)}
                    >
                      {category.short}
                    </ToggleChip>
                  ))}
                </div>
              </div>
              <div>
                <p className="z-label">Çıktı türü</p>
                <div className="flex flex-wrap gap-2">
                  <ToggleChip active={kinds.includes('rank')} onClick={() => toggle(kinds, 'rank', setKinds)}>
                    <Trophy className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Sıralama görseli
                  </ToggleChip>
                  <ToggleChip active={kinds.includes('award')} onClick={() => toggle(kinds, 'award', setKinds)}>
                    <Award className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Ödülünüz var
                  </ToggleChip>
                </div>
              </div>
            </div>

            <PeoplePicker
              label="Kişiler"
              noun="kişi"
              items={visiblePeople.map((person) => ({
                key: person.key,
                label: person.name,
                count: person.count,
              }))}
              selectedItems={personKeys.map((key) => {
                const person = peopleIndex.find((p) => p.key === key);
                return { key, label: person?.name ?? key };
              })}
              query={personQuery}
              onQueryChange={setPersonQuery}
              onToggle={(key) => toggle(personKeys, key, setPersonKeys)}
              onClear={() => setPersonKeys([])}
              searchPlaceholder="Kişi ara"
              emptySelectionText="Tümü (kişi seçilmedi)"
              emptyResultsText="Eşleşen kişi yok."
            />
          </section>

          {/* Önizleme */}
          <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="z-page-kicker">Önizleme</p>
                <p className="mt-2 text-[15px] text-[var(--z-fg)]">
                  {readyItems.length} görsel hazır
                  {waitingCount ? (
                    <span className="text-[var(--z-muted)]"> · {waitingCount} görsel template bekliyor</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={downloadZip}
                disabled={!readyItems.length || Boolean(exporting)}
                className="z-btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-[13px] disabled:opacity-40"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {exporting.current}/{exporting.total} hazırlanıyor
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" strokeWidth={1.8} />
                    Tümünü ZIP indir ({readyItems.length})
                  </>
                )}
              </button>
            </div>

            {readyItems.length ? (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {readyItems.map((item) => {
                  const key = thumbKey(item);
                  const src = thumbs[key];
                  const missingPhoto = item.people.some((p) => !p.photoUrl);
                  return (
                    <article key={item.key} className="z-list-card overflow-hidden p-2.5">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.1rem] bg-[var(--z-elevated)]">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={item.label} className="h-full w-full object-cover" />
                        ) : thumbErrors[key] ? (
                          <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-[var(--z-muted)]">
                            {thumbErrors[key]}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-[var(--z-muted)]" />
                          </div>
                        )}
                        {missingPhoto ? (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-amber-300">
                            <ImageOff className="h-3 w-3" /> Fotoğraf yok
                          </span>
                        ) : null}
                      </div>
                      <div className="px-1.5 pb-1 pt-3">
                        <p className="truncate text-[13px] font-medium text-[var(--z-fg)]">{item.label}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--z-muted)]">
                          {item.detail}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => downloadOne(item)}
                            disabled={downloadingKey === item.key}
                            className="z-btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
                          >
                            {downloadingKey === item.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                            )}
                            PNG
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditor(item)}
                            className="z-btn-icon h-9 w-9"
                            aria-label="Fotoğrafı ayarla"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="z-empty">
                <p className="text-[15px] font-medium text-[var(--z-fg)]">Seçime uygun hazır görsel yok</p>
                <p className="mt-2 max-w-md text-[13px] text-[var(--z-muted)]">
                  Seçtiğiniz dönemlerin template&apos;leri henüz eklenmedi ya da filtreler boş. Şu an
                  Ağustos template&apos;leri hazır.
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}

      {editing && typeof document !== 'undefined' ? createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
          onClick={closeEditor}
        >
          <div
            className="z-modal zebra-sheet-enter flex max-h-[92vh] w-full max-w-4xl flex-col gap-6 overflow-y-auto p-5 sm:p-7 md:grid md:grid-cols-[minmax(0,1fr)_280px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="relative mx-auto aspect-[4/5] w-full max-w-[calc(80vh*0.8)] shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[var(--z-elevated)] active:cursor-grabbing"
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
            >
              <canvas
                ref={previewCanvasRef}
                width={540}
                height={675}
                className="h-full w-full"
                aria-label={editing.label}
              />
              {!previewReady ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--z-muted)]" />
                </div>
              ) : null}
            </div>
            <div className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="z-page-kicker">{editing.kind === 'award' ? 'Ödülünüz var' : 'Sıralama'}</p>
                  <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">{editing.label}</p>
                  <p className="mt-1 text-[12px] text-[var(--z-muted)]">{editing.detail}</p>
                </div>
                <button type="button" onClick={closeEditor} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-6 text-[12px] leading-relaxed text-[var(--z-muted)]">
                Fotoğrafı önizlemede sürükleyerek kaydırın. Ayar yalnızca bu görsel için geçerlidir.
              </p>

              {(
                [
                  { id: 'scale', label: 'Boyut', min: 0.6, max: 1.6, step: 0.01, format: (v: number) => `%${Math.round(v * 100)}` },
                  { id: 'dx', label: 'Yatay', min: -OFFSET_LIMIT, max: OFFSET_LIMIT, step: 1, format: (v: number) => `${v}px` },
                  { id: 'dy', label: 'Dikey', min: -OFFSET_LIMIT, max: OFFSET_LIMIT, step: 1, format: (v: number) => `${v}px` },
                ] as const
              ).map((control) => (
                <label key={control.id} className="mt-5 block">
                  <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                    <span>{control.label}</span>
                    <span className="tabular-nums text-[var(--z-fg)]">
                      {control.format(draft[control.id])}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={draft[control.id]}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [control.id]: Number(event.target.value) }))
                    }
                    className="mt-2 w-full accent-[var(--z-fg)]"
                  />
                </label>
              ))}

              <div className="mt-auto flex flex-col gap-2 pt-8">
                <button
                  type="button"
                  onClick={() => setDraft(DEFAULT_PHOTO_ADJUST)}
                  className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Varsayılana dön
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitDraft(editing, draft);
                    void downloadOne(editing, draft);
                  }}
                  className="z-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
                >
                  <Download className="h-3.5 w-3.5" /> PNG indir
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
