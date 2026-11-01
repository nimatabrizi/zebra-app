'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import {
  Award,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  FileText,
  FlipHorizontal2,
  ImageOff,
  Loader2,
  Search,
  SlidersHorizontal,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { measureFace } from '../lib/girisVisuals';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import { AdjustSaveActions, useUnsavedChangesGuard } from './AdjustSaveControls';
import { loadRankingWorkbook, saveRankingWorkbook } from '../lib/rankingWorkbook';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import {
  CERTIFICATE_CATEGORIES,
  certificateTemplateFor,
  certificateToPdfBlob,
  isCertificateEligible,
  renderCertificate,
} from '../lib/rankingCertificate';
import {
  DEFAULT_PHOTO_ADJUST,
  RANK_CANVAS,
  RANK_CATEGORIES,
  RANK_PERIODS,
  RANK_TEMPLATES,
  buildRankingTemplateRows,
  canvasToBlob,
  defaultRankAdjust,
  loadRankImage,
  measureOpaqueBox,
  mergeParsedRankings,
  normalizeRankAdjust,
  parseRankingWorkbook,
  rankFileSlug,
  renderRankVisual,
  templateFor,
  turkishRankSuffix,
  type ParsedRankings,
  type PhotoAdjust,
  type RankAdjust,
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

type CertItem = {
  key: string;
  periodId: RankPeriodId;
  category: RankCategoryId;
  rank: number;
  people: ResolvedPerson[];
  templateUrl: string;
  label: string;
  detail: string;
  pdfPath: string;
};

const ADJUST_STORAGE_KEY = 'zebra-siralama-photo-adjust-v2';
const OFFSET_LIMIT = 500;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
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
      if (!photo) {
        return {
          displayName: person.displayName,
          title: person.title,
          photo: null,
          bounds: null,
          face: null,
        };
      }
      const [bounds, face] = await Promise.all([
        Promise.resolve(measureOpaqueBox(photo)),
        measureFace(photo),
      ]);
      return {
        displayName: person.displayName,
        title: person.title,
        photo,
        bounds,
        face,
      };
    })
  );
}

async function renderItem(item: OutputItem, adjust: RankAdjust) {
  if (!item.templateUrl) throw new Error('Template bekleniyor');
  return renderRankVisual({
    kind: item.kind,
    templateUrl: item.templateUrl,
    rank: item.rank,
    periodId: item.periodId,
    people: await toRenderPeople(item.people),
    adjust,
  });
}

function personShortLabel(person: ResolvedPerson) {
  return person.displayName.split(/\s+/)[0] || person.displayName;
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

function periodReadyCount(periodId: RankPeriodId) {
  const set = RANK_TEMPLATES[periodId];
  return RANK_CATEGORIES.filter((c) => set.rank[c.id]).length + (set.award ? 1 : 0);
}

/** Çeyrek: ciro+portföy+işlem (+ödül varsa). Ay: 3 dal + ödül. */
function periodReadyTarget(periodId: RankPeriodId) {
  const set = RANK_TEMPLATES[periodId];
  const period = RANK_PERIODS.find((p) => p.id === periodId);
  if (period?.kind === 'quarter') {
    return 3 + (set.award ? 1 : 0);
  }
  return 4;
}

export default function RankingVisualsStudio({
  isActive = true,
  canSave = false,
}: {
  isActive?: boolean;
  canSave?: boolean;
}) {
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [photoSlugs, setPhotoSlugs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRankings | null>(null);
  const [excelHydrated, setExcelHydrated] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const persistSkipRef = useRef(true);

  /** null = dönem listesi; dolu = o dönemin tabelası */
  const [activePeriod, setActivePeriod] = useState<RankPeriodId | null>(null);
  const [personQuery, setPersonQuery] = useState('');

  const {
    saved: adjustments,
    save: saveAdjust,
    remove: removeAdjust,
  } = useSavedAdjustments<RankAdjust | PhotoAdjust>('siralama', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });
  const [editing, setEditing] = useState<OutputItem | null>(null);
  const [draft, setDraft] = useState<RankAdjust>(defaultRankAdjust(1));
  const [editPersonIndex, setEditPersonIndex] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    personIndex: number;
    origin: PhotoAdjust;
  } | null>(null);
  const [exporting, setExporting] = useState<{ current: number; total: number } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadRankingWorkbook();
      if (cancelled) return;
      if (stored?.parsed.entries.length) {
        setParsed(stored.parsed);
        setFileName(stored.fileName || 'Kayıtlı Excel');
      }
      setExcelHydrated(true);
      persistSkipRef.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!excelHydrated || persistSkipRef.current) return;
    if (!parsed?.entries.length || !fileName) return;
    let cancelled = false;
    (async () => {
      await saveRankingWorkbook(fileName, parsed);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [excelHydrated, parsed, fileName]);

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
      const merged = mergeParsedRankings(parsed, result);
      setParsed(merged);
      setFileName(file.name);
      setActivePeriod(null);
      setPersonQuery('');
      if (!merged.entries.length) {
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

  const periodCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) counts[entry.periodId] = (counts[entry.periodId] || 0) + 1;
    return counts;
  }, [entries]);

  const periodEntries = useMemo(
    () => (activePeriod ? entries.filter((e) => e.periodId === activePeriod) : []),
    [entries, activePeriod]
  );

  const needle = personQuery.trim().toLocaleLowerCase('tr-TR');

  const matchesPersonQuery = useCallback(
    (entry: RankEntry) => {
      if (!needle) return true;
      return entry.people.some((p) => {
        const display = resolvePerson(p.name, p.key).displayName.toLocaleLowerCase('tr-TR');
        return display.includes(needle) || p.name.toLocaleLowerCase('tr-TR').includes(needle);
      });
    },
    [needle, resolvePerson]
  );

  const filteredPeriodEntries = useMemo(
    () => periodEntries.filter(matchesPersonQuery),
    [periodEntries, matchesPersonQuery]
  );

  const buildItems = useCallback(
    (source: RankEntry[], kinds: RankOutputKind[]): OutputItem[] => {
      const out: OutputItem[] = [];
      const resolveAll = (entry: RankEntry) =>
        entry.people.map((person) => resolvePerson(person.name, person.key));

      if (kinds.includes('rank')) {
        for (const entry of source) {
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
            adjustKey: `period|${entry.periodId}|${entry.people.map((p) => p.key).join('+')}`,
            label: names,
            detail: `${period.label} · ${categoryShort(entry.category)} · ${rankText(entry.rank)}`,
            zipPath: `${period.fileSlug}/${entry.category}/${String(entry.rank).padStart(2, '0')}-${rankFileSlug(names)}.png`,
          });
        }
      }

      if (kinds.includes('award')) {
        const groups = new Map<string, RankEntry[]>();
        for (const entry of source) {
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
            adjustKey: `period|${first.periodId}|${first.people.map((p) => p.key).join('+')}`,
            label: names,
            detail: `${period.label} · Ödülünüz var · ${group
              .map((e) => `${categoryShort(e.category)} ${rankText(e.rank)}`)
              .join(', ')}`,
            zipPath: `${period.fileSlug}/odulunuz-var/${rankFileSlug(names)}.png`,
          });
        }
      }
      return out;
    },
    [resolvePerson]
  );

  const rankItems = useMemo(
    () => buildItems(filteredPeriodEntries, ['rank']),
    [buildItems, filteredPeriodEntries]
  );
  const awardItems = useMemo(
    () => buildItems(filteredPeriodEntries, ['award']),
    [buildItems, filteredPeriodEntries]
  );
  const certItems = useMemo((): CertItem[] => {
    if (!activePeriod || !certificateTemplateFor(activePeriod)) return [];
    const templateUrl = certificateTemplateFor(activePeriod)!;
    const period = RANK_PERIODS.find((p) => p.id === activePeriod)!;
    const out: CertItem[] = [];
    for (const entry of filteredPeriodEntries) {
      if (!isCertificateEligible(entry.periodId, entry.category, entry.rank)) continue;
      const people = entry.people.map((p) => resolvePerson(p.name, p.key));
      const names = people.map((p) => p.displayName).join(' & ');
      out.push({
        key: `cert|${entry.id}`,
        periodId: entry.periodId,
        category: entry.category,
        rank: entry.rank,
        people,
        templateUrl,
        label: names,
        detail: `${period.label} · ${categoryShort(entry.category)} · ${rankText(entry.rank)} · sertifika`,
        pdfPath: `${period.fileSlug}/sertifika/${entry.category}/${String(entry.rank).padStart(2, '0')}-${rankFileSlug(names)}.pdf`,
      });
    }
    return out.sort(
      (a, b) =>
        CERTIFICATE_CATEGORIES.indexOf(a.category) - CERTIFICATE_CATEGORIES.indexOf(b.category) ||
        a.rank - b.rank ||
        a.label.localeCompare(b.label, 'tr')
    );
  }, [activePeriod, filteredPeriodEntries, resolvePerson]);
  const items = useMemo(() => [...rankItems, ...awardItems], [rankItems, awardItems]);
  const readyItems = useMemo(() => items.filter((item) => item.templateUrl), [items]);
  const readyRankItems = useMemo(() => rankItems.filter((i) => i.templateUrl), [rankItems]);
  const readyAwardItems = useMemo(() => awardItems.filter((i) => i.templateUrl), [awardItems]);

  const activePeriodMeta = activePeriod
    ? RANK_PERIODS.find((p) => p.id === activePeriod) || null
    : null;

  const adjustFor = useCallback(
    (item: OutputItem) => normalizeRankAdjust(adjustments[item.adjustKey], item.people.length),
    [adjustments]
  );

  // Sürükleme sırasında kare kaçırmamak için: çizim sürerken gelen istek
  // biriktirilir, çizim bitince en güncel ayarla bir kez daha çizilir.
  const editingRef = useRef<OutputItem | null>(null);
  const draftRef = useRef<RankAdjust>(defaultRankAdjust(1));
  const editPersonIndexRef = useRef(0);
  const previewRenderRef = useRef({ busy: false, pending: false });
  useEffect(() => {
    editingRef.current = editing;
    draftRef.current = draft;
    editPersonIndexRef.current = editPersonIndex;
  }, [editing, draft, editPersonIndex]);

  const activePersonAdjust =
    draft.people[editPersonIndex] || DEFAULT_PHOTO_ADJUST;

  const updateActivePerson = (patch: Partial<PhotoAdjust>) => {
    setDraft((current) => {
      const people = current.people.map((entry, index) =>
        index === editPersonIndexRef.current ? { ...entry, ...patch } : entry
      );
      return { people };
    });
  };

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
    setEditPersonIndex(0);
    setDraft(adjustFor(item));
    setEditing(item);
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewReady(false);
  };

  const dirty = Boolean(canSave && editing && !sameAdjust(draft, adjustFor(editing)));
  const saveDraft = async () => {
    if (editing) await saveAdjust(editing.adjustKey, draft);
  };
  const { requestClose, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    onSave: saveDraft,
    onClose: closeEditor,
  });

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const personIndex = editPersonIndexRef.current;
    const origin = draftRef.current.people[personIndex] || DEFAULT_PHOTO_ADJUST;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      personIndex,
      origin: { ...origin },
    };
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = RANK_CANVAS.width / Math.max(1, rect.width);
    const next: PhotoAdjust = {
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    };
    setDraft((current) => ({
      people: current.people.map((entry, index) =>
        index === drag.personIndex ? next : entry
      ),
    }));
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const downloadOne = async (item: OutputItem, adjustOverride?: RankAdjust) => {
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

  const downloadZipOf = async (list: OutputItem[], fileNameZip: string) => {
    const ready = list.filter((item) => item.templateUrl);
    if (!ready.length) {
      window.alert('İndirilecek hazır görsel yok (template eksik olabilir).');
      return;
    }
    const zip = new JSZip();
    const root = zip.folder('Siralama-Gorselleri')!;
    setExporting({ current: 0, total: ready.length });
    try {
      for (let i = 0; i < ready.length; i += 1) {
        const item = ready[i]!;
        const canvas = await renderItem(item, adjustFor(item));
        root.file(item.zipPath, await canvasToBlob(canvas));
        setExporting({ current: i + 1, total: ready.length });
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), fileNameZip);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const downloadCertPdf = async (item: CertItem) => {
    setDownloadingKey(item.key);
    try {
      const canvas = await renderCertificate({
        periodId: item.periodId,
        category: item.category,
        rank: item.rank,
        displayName: item.label,
        templateUrl: item.templateUrl,
      });
      downloadBlob(await certificateToPdfBlob(canvas), item.pdfPath.split('/').join('_'));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Sertifika PDF oluşturulamadı');
    } finally {
      setDownloadingKey('');
    }
  };

  const downloadCertZip = async () => {
    if (!certItems.length || !activePeriodMeta) return;
    const zip = new JSZip();
    const root = zip.folder('Siralama-Sertifikalari')!;
    setExporting({ current: 0, total: certItems.length });
    try {
      for (let i = 0; i < certItems.length; i += 1) {
        const item = certItems[i]!;
        const canvas = await renderCertificate({
          periodId: item.periodId,
          category: item.category,
          rank: item.rank,
          displayName: item.label,
          templateUrl: item.templateUrl,
        });
        root.file(item.pdfPath, await certificateToPdfBlob(canvas));
        setExporting({ current: i + 1, total: certItems.length });
      }
      downloadBlob(
        await zip.generateAsync({ type: 'blob' }),
        `sertifika-${activePeriodMeta.fileSlug}.zip`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Sertifika ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const rankItemForEntry = useCallback(
    (entry: RankEntry) => rankItems.find((item) => item.key === `rank|${entry.id}`) || null,
    [rankItems]
  );

  return (
    <div className="panel-enter space-y-10">
      <header>
        <p className="z-page-kicker">Zebra Studio · Ödül ve sıralama</p>
        <h1 className="z-page-title mt-3">Sıralama Görselleri</h1>
        <p className="z-page-sub">
          Excel yükleyin, döneme girin, tabeladan kontrol edin; sıralama görselleri ve ayda kişi
          başına tek &quot;Ödülünüz var&quot; görsellerini ayrı veya birlikte indirin.
        </p>
      </header>

      <section className="z-card p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="flex min-w-0 items-start gap-4">
            <span className="z-btn-icon h-12 w-12 shrink-0">
              <FileSpreadsheet className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-medium text-[var(--z-fg)]">Sıralama Excel&apos;i</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={downloadSampleExcel}
              className="z-btn-ghost inline-flex items-center gap-2 px-5 py-3 text-[13px]"
            >
              <Download className="h-4 w-4" strokeWidth={1.8} />
              {parsed ? 'Şablon olarak indir' : 'Boş şablon indir'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="z-btn-primary inline-flex items-center gap-2 px-6 py-3 text-[13px] disabled:opacity-50"
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={1.8} />
              )}
              {fileName ? 'Excel güncelle' : 'Excel yükle'}
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

        {parsed?.warnings.length ? (
          <ul className="mt-5 space-y-1 border-t border-[var(--z-border)] pt-4 text-[12px] text-amber-400/90">
            {parsed.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {!parsed || !entries.length ? null : activePeriod && activePeriodMeta ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setActivePeriod(null);
                setPersonQuery('');
              }}
              className="z-btn-ghost inline-flex w-fit items-center gap-2 px-4 py-2.5 text-[13px]"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
              Tüm dönemler
            </button>
            <div className="sm:text-right">
              <p className="z-page-kicker">{activePeriodMeta.kind === 'quarter' ? 'Çeyrek' : 'Ay'}</p>
              <h2 className="mt-1 text-[28px] font-semibold tracking-tight text-[var(--z-fg)]">
                {activePeriodMeta.label}
              </h2>
            </div>
          </div>

          <section className="z-card space-y-4 p-5 sm:p-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--z-muted)]" />
              <input
                value={personQuery}
                onChange={(e) => setPersonQuery(e.target.value)}
                placeholder="Tabloda kişi ara…"
                className="z-field w-full pl-11 pr-4 text-[15px]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!readyRankItems.length || Boolean(exporting)}
                onClick={() =>
                  void downloadZipOf(readyRankItems, `siralama-${activePeriodMeta.fileSlug}.zip`)
                }
                className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
              >
                <Trophy className="h-3.5 w-3.5" strokeWidth={1.8} />
                Sıralama ZIP ({readyRankItems.length})
              </button>
              <button
                type="button"
                disabled={!readyAwardItems.length || Boolean(exporting)}
                onClick={() =>
                  void downloadZipOf(
                    readyAwardItems,
                    `odulunuz-var-${activePeriodMeta.fileSlug}.zip`
                  )
                }
                className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
              >
                <Award className="h-3.5 w-3.5" strokeWidth={1.8} />
                Ödülünüz var ZIP ({readyAwardItems.length})
              </button>
              {certificateTemplateFor(activePeriod) ? (
                <button
                  type="button"
                  disabled={!certItems.length || Boolean(exporting)}
                  onClick={() => void downloadCertZip()}
                  className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Sertifika PDF ZIP ({certItems.length})
                </button>
              ) : null}
              <button
                type="button"
                disabled={!readyItems.length || Boolean(exporting)}
                onClick={() =>
                  void downloadZipOf(readyItems, `siralama-hepsi-${activePeriodMeta.fileSlug}.zip`)
                }
                className="z-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[13px] disabled:opacity-40"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {exporting.current}/{exporting.total}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" strokeWidth={1.8} />
                    Hepsi ({readyItems.length})
                  </>
                )}
              </button>
            </div>
          </section>

          {RANK_CATEGORIES.map((category) => {
            const rows = filteredPeriodEntries
              .filter((e) => e.category === category.id)
              .sort((a, b) => a.rank - b.rank || a.rawName.localeCompare(b.rawName, 'tr'));
            const tpl = templateFor(activePeriod, 'rank', category.id);
            const catReady = rankItems.filter((i) => i.category === category.id && i.templateUrl);
            return (
              <section key={category.id} className="z-card overflow-hidden p-0">
                <div className="flex flex-col gap-3 border-b border-[var(--z-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[16px] font-semibold text-[var(--z-fg)]">{category.label}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                      {rows.length} satır
                      {!tpl ? ' · template bekleniyor (indirme kapalı)' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!catReady.length || Boolean(exporting)}
                    onClick={() =>
                      void downloadZipOf(catReady, `${activePeriodMeta.fileSlug}-${category.id}.zip`)
                    }
                    className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[12px] disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Bu dalı ZIP indir ({catReady.length})
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                    {personQuery ? 'Aramayla eşleşen satır yok.' : 'Bu kategoride satır yok.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-[14px]">
                      <thead>
                        <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                          <th className="px-5 py-3 font-medium sm:px-6">Sıra</th>
                          <th className="px-3 py-3 font-medium">İsim / Takım</th>
                          <th className="px-3 py-3 font-medium">Foto</th>
                          <th className="px-5 py-3 text-right font-medium sm:px-6">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((entry) => {
                          const item = rankItemForEntry(entry);
                          const people = entry.people.map((p) => resolvePerson(p.name, p.key));
                          const names = people.map((p) => p.displayName).join(' & ');
                          const missingPhoto = people.some((p) => !p.photoUrl);
                          const canDownload = Boolean(item?.templateUrl);
                          return (
                            <tr
                              key={entry.id}
                              className="border-b border-[var(--z-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)]"
                            >
                              <td className="px-5 py-3 tabular-nums text-[var(--z-fg)] sm:px-6">
                                {rankText(entry.rank)}
                              </td>
                              <td className="px-3 py-3 font-medium text-[var(--z-fg)]">{names}</td>
                              <td className="px-3 py-3 text-[12px] text-[var(--z-muted)]">
                                {missingPhoto ? (
                                  <span className="inline-flex items-center gap-1 text-amber-500">
                                    <ImageOff className="h-3.5 w-3.5" /> Eksik
                                  </span>
                                ) : (
                                  'Tamam'
                                )}
                              </td>
                              <td className="px-5 py-3 sm:px-6">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={!canDownload || !item || downloadingKey === item.key}
                                    onClick={() => item && void downloadOne(item)}
                                    className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-40"
                                  >
                                    {item && downloadingKey === item.key ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Download className="h-3.5 w-3.5" />
                                    )}
                                    PNG
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canDownload || !item}
                                    onClick={() => item && openEditor(item)}
                                    className="z-btn-icon h-9 w-9 disabled:opacity-40"
                                    aria-label="Fotoğrafı ayarla"
                                  >
                                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}

          {certificateTemplateFor(activePeriod) ? (
            <section className="z-card overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-[var(--z-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <p className="text-[16px] font-semibold text-[var(--z-fg)]">Sertifika</p>
                  <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                    2.–5. sıra · Ciro / İşlem / Portföy Alma · baskı PDF (A4 yatay, 300 DPI)
                    {` · ${certItems.length} adet`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!certItems.length || Boolean(exporting)}
                  onClick={() => void downloadCertZip()}
                  className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[12px] disabled:opacity-40"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Tüm sertifikalar PDF ZIP ({certItems.length})
                </button>
              </div>
              {!certItems.length ? (
                <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                  {personQuery
                    ? 'Aramayla eşleşen sertifika yok.'
                    : 'Bu dönemde 2.–5. sırada sertifika satırı yok.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                        <th className="px-5 py-3 font-medium sm:px-6">Dal</th>
                        <th className="px-3 py-3 font-medium">Sıra</th>
                        <th className="px-3 py-3 font-medium">İsim</th>
                        <th className="px-5 py-3 text-right font-medium sm:px-6">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certItems.map((item) => (
                        <tr
                          key={item.key}
                          className="border-b border-[var(--z-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)]"
                        >
                          <td className="px-5 py-3 text-[var(--z-fg)] sm:px-6">
                            {categoryShort(item.category)}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-[var(--z-fg)]">
                            {rankText(item.rank)}
                          </td>
                          <td className="px-3 py-3 font-medium text-[var(--z-fg)]">{item.label}</td>
                          <td className="px-5 py-3 sm:px-6">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={downloadingKey === item.key || Boolean(exporting)}
                                onClick={() => void downloadCertPdf(item)}
                                className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-40"
                              >
                                {downloadingKey === item.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" />
                                )}
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          <section className="z-card overflow-hidden p-0">
            <div className="border-b border-[var(--z-border)] px-5 py-4 sm:px-6">
              <p className="text-[16px] font-semibold text-[var(--z-fg)]">Ödülünüz var</p>
              <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                Bu dönemde ödül alan her kişi için tek görsel
                {!RANK_TEMPLATES[activePeriod].award
                  ? ' · template bekleniyor (indirme kapalı)'
                  : ` · ${awardItems.length} kişi`}
              </p>
            </div>
            {!awardItems.length ? (
              <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                {personQuery ? 'Aramayla eşleşen ödül yok.' : 'Bu dönemde ödül satırı yok.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                      <th className="px-5 py-3 font-medium sm:px-6">Kişi</th>
                      <th className="px-3 py-3 font-medium">Dallar</th>
                      <th className="px-5 py-3 text-right font-medium sm:px-6">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awardItems.map((item) => {
                      const missingPhoto = item.people.some((p) => !p.photoUrl);
                      const canDownload = Boolean(item.templateUrl);
                      return (
                        <tr
                          key={item.key}
                          className="border-b border-[var(--z-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)]"
                        >
                          <td className="px-5 py-3 font-medium text-[var(--z-fg)] sm:px-6">
                            {item.label}
                            {missingPhoto ? (
                              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-500">
                                <ImageOff className="h-3 w-3" /> Foto eksik
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-[13px] text-[var(--z-muted)]">
                            {item.detail.replace(/^.*?· Ödülünüz var · /, '')}
                          </td>
                          <td className="px-5 py-3 sm:px-6">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={!canDownload || downloadingKey === item.key}
                                onClick={() => void downloadOne(item)}
                                className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-40"
                              >
                                {downloadingKey === item.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                PNG
                              </button>
                              <button
                                type="button"
                                disabled={!canDownload}
                                onClick={() => openEditor(item)}
                                className="z-btn-icon h-9 w-9 disabled:opacity-40"
                                aria-label="Fotoğrafı ayarla"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : parsed && entries.length ? (
        <section className="space-y-4">
          <div>
            <p className="z-label">Dönem seçin</p>
            <p className="mt-1 text-[13px] text-[var(--z-muted)]">
              Bir aya veya çeyreğe girerek tabelayı görün ve görselleri indirin.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RANK_PERIODS.map((period) => {
              const set = RANK_TEMPLATES[period.id];
              const ready = periodReadyCount(period.id);
              const excelRows = periodCounts[period.id] || 0;
              const muted = excelRows === 0;
              return (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => {
                    setActivePeriod(period.id);
                    setPersonQuery('');
                  }}
                  className={`cursor-pointer rounded-2xl border p-5 text-left transition-all duration-300 hover:border-[var(--z-border-strong)] hover:shadow-[var(--z-shadow-soft)] ${
                    muted
                      ? 'border-[var(--z-border)] opacity-55'
                      : 'border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_60%,transparent)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[16px] font-semibold text-[var(--z-fg)]">{period.label}</p>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        ready >= periodReadyTarget(period.id)
                          ? 'bg-emerald-400'
                          : ready
                            ? 'bg-amber-400'
                            : 'bg-[var(--z-muted-2)]'
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--z-muted)]">Excel: {excelRows} satır</p>
                  <ul className="mt-3 space-y-1 text-[11px] text-[var(--z-muted)]">
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
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {editing && typeof document !== 'undefined' ? createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
          onClick={requestClose}
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
                <button type="button" onClick={requestClose} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-6 text-[12px] leading-relaxed text-[var(--z-muted)]">
                {editing.people.length > 1
                  ? 'Kişi seçip önizlemede sürükleyin. Kaydedilen ayar bu ikili/grup yan yanayken (sıralama + ödül) kullanılır.'
                  : 'Fotoğrafı önizlemede sürükleyerek kaydırın. Kaydedilen ayar bu görselde hep kullanılır.'}
              </p>

              {editing.people.length > 1 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {editing.people.map((person, index) => (
                    <button
                      key={person.key}
                      type="button"
                      onClick={() => setEditPersonIndex(index)}
                      className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                        editPersonIndex === index
                          ? 'border-[var(--z-fg)] bg-[var(--z-fg)] text-[var(--z-bg)]'
                          : 'border-[var(--z-border)] text-[var(--z-muted)] hover:border-[var(--z-fg)]/40 hover:text-[var(--z-fg)]'
                      }`}
                    >
                      {personShortLabel(person)}
                    </button>
                  ))}
                </div>
              ) : null}

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
                      {control.format(activePersonAdjust[control.id])}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={activePersonAdjust[control.id]}
                    onChange={(event) =>
                      updateActivePerson({ [control.id]: Number(event.target.value) })
                    }
                    className="mt-2 w-full accent-[var(--z-fg)]"
                  />
                </label>
              ))}

              {RANK_PERIODS.find((p) => p.id === editing.periodId)?.kind === 'quarter' ? (
                <button
                  type="button"
                  onClick={() =>
                    updateActivePerson({ flipH: !activePersonAdjust.flipH })
                  }
                  className={`mt-5 inline-flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left text-[13px] transition-colors ${
                    activePersonAdjust.flipH
                      ? 'border-[var(--z-fg)] bg-[var(--z-fg)]/5 text-[var(--z-fg)]'
                      : 'border-[var(--z-border)] text-[var(--z-muted)] hover:border-[var(--z-fg)]/40 hover:text-[var(--z-fg)]'
                  }`}
                  aria-pressed={Boolean(activePersonAdjust.flipH)}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <FlipHorizontal2 className="h-4 w-4 shrink-0" />
                    Yatay çevir
                    {editing.people.length > 1
                      ? ` (${personShortLabel(editing.people[editPersonIndex]!)})`
                      : ''}
                  </span>
                  <span className="text-[12px] tabular-nums">
                    {activePersonAdjust.flipH ? 'Açık' : 'Kapalı'}
                  </span>
                </button>
              ) : null}

              <div className="mt-auto flex flex-col gap-2 pt-8">
                <AdjustSaveActions
                  canSave={canSave}
                  dirty={dirty}
                  hasSaved={Boolean(adjustments[editing.adjustKey])}
                  onSave={saveDraft}
                  onResetScreen={() => setDraft(defaultRankAdjust(editing.people.length))}
                  onDeleteSaved={async () => {
                    await removeAdjust(editing.adjustKey);
                    setDraft(defaultRankAdjust(editing.people.length));
                  }}
                />
                <button
                  type="button"
                  onClick={() => void downloadOne(editing, draft)}
                  className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
                >
                  <Download className="h-3.5 w-3.5" /> PNG indir
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {unsavedDialog}
    </div>
  );
}
