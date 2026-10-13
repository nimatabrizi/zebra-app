'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { Download, ImageOff, Loader2, SlidersHorizontal, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import { DEFAULT_PHOTO_ADJUST, canvasToBlob, rankFileSlug, type PhotoAdjust } from '../lib/rankingVisuals';
import { BIRTHDAY_CANVAS, renderBirthdayVisual, type BirthdayPerson } from '../lib/birthdayVisuals';
import BirthdayPicker from './BirthdayPicker';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import { AdjustSaveActions, useUnsavedChangesGuard } from './AdjustSaveControls';

type Consultant = BirthdayPerson & {
  key: string;
  name: string;
  birthMonth: number | null;
  birthDay: number | null;
};

/** `dogum_gunu` is a DATE ("YYYY-MM-DD"); placeholder years (e.g. 0001) are treated as unknown. */
function parseBirthday(value: unknown): { month: number; day: number } | null {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match || Number(match[1]) < 1900) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null;
}

const ADJUST_STORAGE_KEY = 'zebra-dogum-gunu-photo-adjust-v1';
const OFFSET_LIMIT = 700;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
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

function fileNameFor(person: Consultant) {
  return `dogum-gunu-${rankFileSlug(person.name)}.png`;
}

export default function BirthdayStudio({
  isActive = true,
  canSave = false,
}: {
  isActive?: boolean;
  canSave?: boolean;
}) {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const {
    saved: adjustments,
    save: saveAdjust,
    remove: removeAdjust,
  } = useSavedAdjustments<PhotoAdjust>('dogum-gunu', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbErrors, setThumbErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Consultant | null>(null);
  const [draft, setDraft] = useState<PhotoAdjust>(DEFAULT_PHOTO_ADJUST);
  const [previewReady, setPreviewReady] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: PhotoAdjust } | null>(
    null
  );
  const [exporting, setExporting] = useState<{ current: number; total: number } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState('');
  const thumbUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: files }, { data: rows }] = await Promise.all([
        supabase.storage
          .from('consultant-photos')
          .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
        supabase.from('profiles').select('tam_isim, unvan, dogum_gunu'),
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
        const birthday = parseBirthday(record.dogum_gunu);
        list.push({
          key,
          name,
          displayName: toStudioDisplayName(name),
          title: resolveConsultantTitle(name, String(record.unvan || '')),
          photoUrl: resolveConsultantPhotoUrl(name, slugs),
          birthMonth: birthday?.month ?? null,
          birthDay: birthday?.day ?? null,
        });
      }
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'));
      setConsultants(list);
      setLoading(false);
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

  const pickerPeople = useMemo(
    () =>
      consultants.map((person) => ({
        key: person.key,
        label: person.displayName,
        title: person.title,
        month: person.birthMonth,
        day: person.birthDay,
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
    (person: Consultant) => adjustments[person.key] || DEFAULT_PHOTO_ADJUST,
    [adjustments]
  );

  const thumbKey = useCallback(
    (person: Consultant) => {
      const a = adjustFor(person);
      return `${person.key}|${a.scale}|${a.dx}|${a.dy}|${person.photoUrl}`;
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
          const canvas = await renderBirthdayVisual(person, adjustFor(person));
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
    const person = editingRef.current;
    if (!person) return;
    state.busy = true;
    try {
      const canvas = await renderBirthdayVisual(person, draftRef.current);
      const target = previewCanvasRef.current;
      if (target && editingRef.current === person) {
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

  const openEditor = (person: Consultant) => {
    setPreviewReady(false);
    setDraft(adjustFor(person));
    setEditing(person);
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewReady(false);
  };

  const dirty = Boolean(canSave && editing && !sameAdjust(draft, adjustFor(editing)));
  const saveDraft = async () => {
    if (editing) await saveAdjust(editing.key, draft);
  };
  const { requestClose, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    onSave: saveDraft,
    onClose: closeEditor,
  });

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
    const ratio = BIRTHDAY_CANVAS.width / Math.max(1, rect.width);
    setDraft({
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    });
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const downloadOne = async (person: Consultant, adjustOverride?: PhotoAdjust) => {
    setDownloadingKey(person.key);
    try {
      const canvas = await renderBirthdayVisual(person, adjustOverride || adjustFor(person));
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
    const root = zip.folder('Dogum-Gunu-Gorselleri')!;
    setExporting({ current: 0, total: selected.length });
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const person = selected[i]!;
        const canvas = await renderBirthdayVisual(person, adjustFor(person));
        root.file(fileNameFor(person), await canvasToBlob(canvas));
        setExporting({ current: i + 1, total: selected.length });
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'dogum-gunu-gorselleri.zip');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const addKeys = (keys: string[]) =>
    setSelectedKeys((current) => Array.from(new Set([...current, ...keys])));

  const removeKey = (key: string) => setSelectedKeys((current) => current.filter((k) => k !== key));

  return (
    <div className="panel-enter space-y-10">
      <header>
        <p className="z-page-kicker">Zebra Studio · Kutlama</p>
        <h1 className="z-page-title mt-3">Doğum Günü</h1>
        <p className="z-page-sub">
          Bir ya da birden fazla danışman seçin; her biri için doğum günü görseli hazırlanır. Tek tek
          ya da toplu ZIP olarak indirebilirsiniz.
        </p>
      </header>

      <section className="z-card p-6 sm:p-8">
        <BirthdayPicker
          people={pickerPeople}
          selectedKeys={selectedKeys}
          onAdd={addKeys}
          onRemove={removeKey}
          onClear={() => setSelectedKeys([])}
          loading={loading}
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
                    <p className="mt-0.5 truncate text-[11px] text-[var(--z-muted)]">{person.title}</p>
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
            <p className="text-[15px] font-medium text-[var(--z-fg)]">Henüz danışman seçilmedi</p>
            <p className="mt-2 max-w-md text-[13px] text-[var(--z-muted)]">
              Yukarıdaki listeden doğum günü görseli hazırlanacak kişileri seçin.
            </p>
          </div>
        )}
      </section>

      {editing && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
              onClick={requestClose}
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
                      <p className="z-page-kicker">Doğum günü</p>
                      <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">{editing.displayName}</p>
                      <p className="mt-1 text-[12px] text-[var(--z-muted)]">{editing.title}</p>
                    </div>
                    <button type="button" onClick={requestClose} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-6 text-[12px] leading-relaxed text-[var(--z-muted)]">
                    Fotoğrafı önizlemede sürükleyerek kaydırın. Kaydedilen ayar bu kişinin doğum günü
                    görselinde hep kullanılır.
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
                        <span className="tabular-nums text-[var(--z-fg)]">{control.format(draft[control.id])}</span>
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
                    <AdjustSaveActions
                      canSave={canSave}
                      dirty={dirty}
                      hasSaved={Boolean(adjustments[editing.key])}
                      onSave={saveDraft}
                      onResetScreen={() => setDraft(DEFAULT_PHOTO_ADJUST)}
                      onDeleteSaved={async () => {
                        await removeAdjust(editing.key);
                        setDraft(DEFAULT_PHOTO_ADJUST);
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
          )
        : null}
      {unsavedDialog}
    </div>
  );
}
