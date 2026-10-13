'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import {
  Award,
  CalendarX,
  Check,
  Copy,
  Download,
  ImageOff,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import { DEFAULT_PHOTO_ADJUST, canvasToBlob, rankFileSlug, type PhotoAdjust } from '../lib/rankingVisuals';
import {
  ANNIVERSARY_CANVAS,
  DEFAULT_ANNIVERSARY_ADJUST,
  parseHireDate,
  renderAnniversaryVisual,
  upcomingAnniversary,
  type AnniversaryAdjust,
} from '../lib/anniversaryVisuals';
import BirthdayPicker, { TR_MONTHS } from './BirthdayPicker';

type Consultant = {
  key: string;
  name: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
  /** İşe giriş tarihi yoksa null. */
  anniversary: { year: number; month: number; day: number; years: number } | null;
};

type AdjustTarget = 'photo' | 'name';

const ADJUST_STORAGE_KEY = 'zebra-yil-donumu-adjust-v1';
const OFFSET_LIMIT = 700;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
}

function isDefaultPart(adjust: PhotoAdjust) {
  return adjust.scale === 1 && adjust.dx === 0 && adjust.dy === 0;
}

function isDefaultAdjust(adjust: AnniversaryAdjust) {
  return isDefaultPart(adjust.photo) && isDefaultPart(adjust.name);
}

function thumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const thumb = document.createElement('canvas');
  thumb.width = 360;
  thumb.height = 640;
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

function yearsOf(person: Consultant) {
  return person.anniversary?.years ?? 0;
}

function fileNameFor(person: Consultant) {
  return `yil-donumu-${yearsOf(person)}-yil-${rankFileSlug(person.name)}.png`;
}

function anniversaryLabel(person: Consultant) {
  const a = person.anniversary;
  return a ? `${a.years}. yıl · ${a.day} ${TR_MONTHS[a.month - 1]}` : '';
}

function MissingDatesModal({ people, onClose }: { people: Consultant[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const visible = needle
    ? people.filter((p) => `${p.displayName} ${p.title}`.toLocaleLowerCase('tr-TR').includes(needle))
    : people;

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(visible.map((p) => `${p.displayName} — ${p.title}`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* pano izni yoksa sessiz geç */
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[var(--z-scrim)] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="İşe giriş tarihi eksik olanlar"
        className="z-modal zebra-sheet-enter flex max-h-[85dvh] w-full max-w-lg flex-col rounded-b-none p-5 sm:rounded-b-[inherit] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="z-page-kicker">Eksik veri</p>
            <p className="mt-2 text-[17px] font-semibold text-[var(--z-fg)]">İşe giriş tarihi olmayanlar</p>
            <p className="mt-1 text-[12px] text-[var(--z-muted)]">
              {people.length} kişi · Kullanıcı Yönetimi&apos;nden tarih eklenince listeye girerler.
            </p>
          </div>
          <button type="button" onClick={onClose} className="z-btn-icon h-11 w-11 shrink-0" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <label className="flex min-h-[44px] flex-1 items-center gap-2 rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--z-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="İsim ya da unvan ara"
              className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-[var(--z-fg)] outline-none placeholder:text-[var(--z-muted)] sm:text-[14px]"
            />
          </label>
          <button
            type="button"
            onClick={copyList}
            disabled={!visible.length}
            className="z-btn-ghost inline-flex min-h-[44px] items-center gap-1.5 px-4 text-[13px] disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>

        <ul className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {visible.map((person) => (
            <li
              key={person.key}
              className="flex items-center justify-between gap-3 border-b border-[var(--z-border)] py-3 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-[var(--z-fg)]">{person.displayName}</span>
                <span className="block truncate text-[12px] text-[var(--z-muted)]">{person.title}</span>
              </span>
            </li>
          ))}
          {!visible.length ? (
            <li className="py-8 text-center text-[13px] text-[var(--z-muted)]">Eşleşen kişi yok.</li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body
  );
}

export default function AnniversaryStudio({ isActive = true }: { isActive?: boolean }) {
  const [today] = useState(() => new Date());
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [missingOpen, setMissingOpen] = useState(false);

  const [adjustments, setAdjustments] = useState<Record<string, AnniversaryAdjust>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbErrors, setThumbErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Consultant | null>(null);
  const [draft, setDraft] = useState<AnniversaryAdjust>(DEFAULT_ANNIVERSARY_ADJUST);
  const [target, setTarget] = useState<AdjustTarget>('photo');
  const [previewReady, setPreviewReady] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    target: AdjustTarget;
    origin: PhotoAdjust;
  } | null>(null);
  const [exporting, setExporting] = useState<{ current: number; total: number } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState('');
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
        supabase.from('profiles').select('tam_isim, unvan, ise_giris_tarihi'),
      ]);
      if (cancelled) return;
      const slugs = (files || [])
        .map((file) => String(file.name || '').replace(/\.png$/i, ''))
        .filter(Boolean);
      const seen = new Set<string>();
      const list: Consultant[] = [];
      for (const row of rows || []) {
        const record = row as Record<string, unknown>;
        const name = String(record.tam_isim || '').normalize('NFC').trim();
        const key = toConsultantPhotoSlug(name);
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        const hire = parseHireDate(record.ise_giris_tarihi);
        list.push({
          key,
          name,
          displayName: toStudioDisplayName(name),
          title: resolveConsultantTitle(name, String(record.unvan || '')),
          photoUrl: resolveConsultantPhotoUrl(name, slugs),
          anniversary: hire ? upcomingAnniversary(hire, today) : null,
        });
      }
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'));
      setConsultants(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  useEffect(
    () => () => {
      Object.values(thumbUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  const missingDates = useMemo(() => consultants.filter((p) => !p.anniversary), [consultants]);

  const pickerPeople = useMemo(
    () =>
      consultants
        .filter((person) => (person.anniversary?.years ?? 0) >= 1)
        .map((person) => ({
          key: person.key,
          label: person.displayName,
          title: person.title,
          month: person.anniversary!.month,
          day: person.anniversary!.day,
          note: `${person.anniversary!.years}. yıl`,
          missingPhoto: !person.photoUrl,
        })),
    [consultants]
  );

  const selected = useMemo(
    () =>
      selectedKeys
        .map((key) => consultants.find((c) => c.key === key))
        .filter(Boolean) as Consultant[],
    [selectedKeys, consultants]
  );

  const adjustFor = useCallback(
    (person: Consultant) => adjustments[person.key] || DEFAULT_ANNIVERSARY_ADJUST,
    [adjustments]
  );

  const personFor = (person: Consultant) => ({
    displayName: person.displayName,
    photoUrl: person.photoUrl,
    years: yearsOf(person),
  });

  const thumbKey = useCallback(
    (person: Consultant) => {
      const { photo, name } = adjustFor(person);
      return [
        person.key,
        yearsOf(person),
        photo.scale,
        photo.dx,
        photo.dy,
        name.scale,
        name.dx,
        name.dy,
        person.photoUrl,
      ].join('|');
    },
    [adjustFor]
  );

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      for (const person of selected) {
        if (cancelled) return;
        const key = thumbKey(person);
        if (thumbUrlsRef.current[key]) continue;
        try {
          const canvas = await renderAnniversaryVisual(
            { displayName: person.displayName, photoUrl: person.photoUrl, years: yearsOf(person) },
            adjustFor(person)
          );
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
  }, [selected, thumbKey, adjustFor, isActive]);

  // Sürükleme sırasında kare kaçırmamak için: çizim sürerken gelen istek
  // biriktirilir, çizim bitince en güncel ayarla bir kez daha çizilir.
  const editingRef = useRef<Consultant | null>(null);
  const draftRef = useRef<AnniversaryAdjust>(DEFAULT_ANNIVERSARY_ADJUST);
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
    const person = editingRef.current;
    if (!person) return;
    state.busy = true;
    try {
      const canvas = await renderAnniversaryVisual(
        { displayName: person.displayName, photoUrl: person.photoUrl, years: yearsOf(person) },
        draftRef.current
      );
      const targetCanvas = previewCanvasRef.current;
      if (targetCanvas && editingRef.current === person) {
        targetCanvas.getContext('2d')?.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
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

  const openEditor = (person: Consultant) => {
    setPreviewReady(false);
    setDraft(adjustFor(person));
    setTarget('photo');
    setEditing(person);
  };

  const commitDraft = (person: Consultant, adjust: AnniversaryAdjust) => {
    setAdjustments((current) => {
      const next = { ...current };
      if (isDefaultAdjust(adjust)) delete next[person.key];
      else next[person.key] = adjust;
      return next;
    });
  };

  const closeEditor = () => {
    if (editing) commitDraft(editing, draft);
    setEditing(null);
    setPreviewReady(false);
  };

  const updatePart = (part: AdjustTarget, next: Partial<PhotoAdjust>) =>
    setDraft((current) => ({ ...current, [part]: { ...current[part], ...next } }));

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target,
      origin: draftRef.current[target],
    };
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = ANNIVERSARY_CANVAS.width / Math.max(1, rect.width);
    updatePart(drag.target, {
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    });
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const downloadOne = async (person: Consultant, adjustOverride?: AnniversaryAdjust) => {
    setDownloadingKey(person.key);
    try {
      const canvas = await renderAnniversaryVisual(personFor(person), adjustOverride || adjustFor(person));
      downloadBlob(await canvasToBlob(canvas), fileNameFor(person));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setDownloadingKey('');
    }
  };

  const downloadZip = async () => {
    if (!selected.length) return;
    const zip = new JSZip();
    const root = zip.folder('Yil-Donumu-Gorselleri')!;
    setExporting({ current: 0, total: selected.length });
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const person = selected[i]!;
        const canvas = await renderAnniversaryVisual(personFor(person), adjustFor(person));
        root.file(fileNameFor(person), await canvasToBlob(canvas));
        setExporting({ current: i + 1, total: selected.length });
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'yil-donumu-gorselleri.zip');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const addKeys = (keys: string[]) =>
    setSelectedKeys((current) => Array.from(new Set([...current, ...keys])));

  const removeKey = (key: string) => setSelectedKeys((current) => current.filter((k) => k !== key));

  const closeMissing = useCallback(() => setMissingOpen(false), []);
  const part = draft[target];

  return (
    <div className="panel-enter space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="z-page-kicker">Zebra Studio · Kutlama</p>
          <h1 className="z-page-title mt-3">Yıl Dönümleri</h1>
          <p className="z-page-sub">
            İşe giriş tarihine göre kaçıncı yıl olduğu otomatik hesaplanır. Bir ya da birden fazla
            danışman seçin; tek tek ya da toplu ZIP olarak indirin.
          </p>
        </div>
        {!loading && missingDates.length ? (
          <button
            type="button"
            onClick={() => setMissingOpen(true)}
            className="z-btn-ghost inline-flex min-h-[44px] shrink-0 items-center gap-2 self-start px-4 text-[13px] sm:self-auto"
          >
            <CalendarX className="h-4 w-4" strokeWidth={1.8} />
            Tarihi eksik
            <span className="tabular-nums text-[var(--z-muted)]">{missingDates.length}</span>
          </button>
        ) : null}
      </header>

      <section className="z-card p-6 sm:p-8">
        <BirthdayPicker
          people={pickerPeople}
          selectedKeys={selectedKeys}
          onAdd={addKeys}
          onRemove={removeKey}
          onClear={() => setSelectedKeys([])}
          loading={loading}
          icon={Award}
          monthLabel={(monthName) => `${monthName} yıl dönümleri`}
          emptyMonthText="Bu ayda yıl dönümü olan kişi yok"
        />
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="z-page-kicker">Önizleme</p>
            <p className="mt-2 text-[15px] text-[var(--z-fg)]">{selected.length} görsel</p>
          </div>
          <button
            type="button"
            onClick={downloadZip}
            disabled={!selected.length || Boolean(exporting)}
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
                Tümünü ZIP indir ({selected.length})
              </>
            )}
          </button>
        </div>

        {selected.length ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-5">
            {selected.map((person) => {
              const key = thumbKey(person);
              const src = thumbs[key];
              return (
                <article key={person.key} className="z-list-card overflow-hidden p-2.5">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-[1.1rem] bg-[var(--z-elevated)]">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={person.displayName} className="h-full w-full object-cover" />
                    ) : thumbErrors[key] ? (
                      <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-[var(--z-muted)]">
                        {thumbErrors[key]}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--z-muted)]" />
                      </div>
                    )}
                    {!person.photoUrl ? (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-amber-300">
                        <ImageOff className="h-3 w-3" /> Fotoğraf yok
                      </span>
                    ) : null}
                  </div>
                  <div className="px-1.5 pb-1 pt-3">
                    <p className="truncate text-[13px] font-medium text-[var(--z-fg)]">{person.displayName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--z-muted)]">{anniversaryLabel(person)}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => downloadOne(person)}
                        disabled={downloadingKey === person.key}
                        className="z-btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
                      >
                        {downloadingKey === person.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                        )}
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(person)}
                        className="z-btn-icon h-9 w-9"
                        aria-label="Fotoğraf ve ismi ayarla"
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
            <p className="text-[15px] font-medium text-[var(--z-fg)]">Henüz danışman seçilmedi</p>
            <p className="mt-2 max-w-md text-[13px] text-[var(--z-muted)]">
              Yukarıdan isim ya da ay yazın veya Bugün / Bu hafta / Bu ay kısayollarını kullanın.
            </p>
          </div>
        )}
      </section>

      {missingOpen ? <MissingDatesModal people={missingDates} onClose={closeMissing} /> : null}

      {editing && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
              onClick={closeEditor}
            >
              <div
                className="z-modal zebra-sheet-enter flex max-h-[92vh] w-full max-w-3xl flex-col gap-6 overflow-y-auto p-5 sm:p-7 md:grid md:grid-cols-[minmax(0,1fr)_280px]"
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  className="relative mx-auto aspect-[9/16] w-full max-w-[calc(80vh*0.5625)] shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[var(--z-elevated)] active:cursor-grabbing"
                  onPointerDown={handlePreviewPointerDown}
                  onPointerMove={handlePreviewPointerMove}
                  onPointerUp={handlePreviewPointerUp}
                  onPointerCancel={handlePreviewPointerUp}
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={540}
                    height={960}
                    className="h-full w-full"
                    aria-label={editing.displayName}
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
                      <p className="z-page-kicker">Yıl dönümü</p>
                      <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">{editing.displayName}</p>
                      <p className="mt-1 text-[12px] text-[var(--z-muted)]">{anniversaryLabel(editing)}</p>
                    </div>
                    <button type="button" onClick={closeEditor} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-[var(--z-elevated)] p-1">
                    {(
                      [
                        { id: 'photo', label: 'Fotoğraf' },
                        { id: 'name', label: 'İsim' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setTarget(option.id)}
                        className={`min-h-[36px] rounded-full text-[13px] font-medium transition-colors ${
                          target === option.id
                            ? 'bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]'
                            : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <p className="mt-4 text-[12px] leading-relaxed text-[var(--z-muted)]">
                    {target === 'photo' ? 'Fotoğrafı' : 'İsmi'} önizlemede sürükleyerek taşıyın. Ayar
                    yalnızca bu kişinin yıl dönümü görseli için geçerlidir.
                  </p>

                  {(
                    [
                      { id: 'scale', label: 'Boyut', min: 0.5, max: 1.8, step: 0.01, format: (v: number) => `%${Math.round(v * 100)}` },
                      { id: 'dx', label: 'Yatay', min: -OFFSET_LIMIT, max: OFFSET_LIMIT, step: 1, format: (v: number) => `${v}px` },
                      { id: 'dy', label: 'Dikey', min: -OFFSET_LIMIT, max: OFFSET_LIMIT, step: 1, format: (v: number) => `${v}px` },
                    ] as const
                  ).map((control) => (
                    <label key={control.id} className="mt-5 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>{control.label}</span>
                        <span className="tabular-nums text-[var(--z-fg)]">{control.format(part[control.id])}</span>
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={part[control.id]}
                        onChange={(event) => updatePart(target, { [control.id]: Number(event.target.value) })}
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                  ))}

                  <div className="mt-auto flex flex-col gap-2 pt-8">
                    <button
                      type="button"
                      onClick={() => updatePart(target, DEFAULT_PHOTO_ADJUST)}
                      className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {target === 'photo' ? 'Fotoğrafı' : 'İsmi'} sıfırla
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
          )
        : null}
    </div>
  );
}
