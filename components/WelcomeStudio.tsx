'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toStudioDisplayName } from '../lib/studioAssets';
import { canvasToBlob, rankFileSlug } from '../lib/rankingVisuals';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import { AdjustSaveActions } from './AdjustSaveControls';
import {
  DEFAULT_WELCOME_ADJUST,
  DEFAULT_WELCOME_TITLE,
  WELCOME_CANVAS,
  WELCOME_FACE_GUIDES,
  WELCOME_SHADE_LIMITS,
  normalizeWelcomeAdjust,
  renderWelcomeVisual,
  type WelcomeAdjust,
  type WelcomeShade,
} from '../lib/welcomeVisuals';

type Tab = 'edit' | 'preview';
type Photo = { img: HTMLImageElement; url: string; fileName: string };

const OFFSET_LIMIT = 1600;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
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

async function readPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, url, fileName: file.name };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

const inputClass =
  'mt-2 block min-h-[48px] w-full rounded-xl bg-[var(--z-elevated)] px-4 text-[17px] text-[var(--z-fg)] outline-none placeholder:text-[var(--z-muted)] focus:ring-2 focus:ring-[var(--z-border-strong)]';

export default function WelcomeStudio({
  isActive = true,
  canSave = false,
}: {
  isActive?: boolean;
  canSave?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('edit');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState(DEFAULT_WELCOME_TITLE);
  const [people, setPeople] = useState<string[]>([]);
  const [draftState, setDraftState] = useState<{ key: string; adjust: WelcomeAdjust } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [faceFound, setFaceFound] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: WelcomeAdjust } | null>(
    null
  );

  const { saved, save, remove } = useSavedAdjustments<WelcomeAdjust>('hos-geldin', { canSave });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('tam_isim');
      if (cancelled) return;
      const names = new Set<string>();
      for (const row of data || []) {
        const person = toStudioDisplayName(String((row as { tam_isim?: string }).tam_isim || '').trim());
        if (person) names.add(person);
      }
      setPeople(Array.from(names).sort((a, b) => a.localeCompare(b, 'tr')));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const personKey = name.trim() ? rankFileSlug(name.trim()) : '';
  const savedAdjust = personKey ? saved[personKey] : undefined;
  const baseAdjust = normalizeWelcomeAdjust(savedAdjust);
  const draft = draftState && draftState.key === personKey ? draftState.adjust : baseAdjust;
  const dirty = canSave && Boolean(personKey) && !sameAdjust(draft, baseAdjust);

  const updateDraft = (patch: Partial<WelcomeAdjust>) =>
    setDraftState({ key: personKey, adjust: { ...draft, ...patch } });
  const updateShade = (patch: Partial<WelcomeShade>) => updateDraft({ shade: { ...draft.shade, ...patch } });

  // Sürüklerken kare kaçırmamak için: çizim sürerken gelen istek biriktirilir,
  // çizim bitince en güncel içerikle bir kez daha çizilir.
  const contentRef = useRef({ photo, name, title, draft });
  const renderStateRef = useRef({ busy: false, pending: false });
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    contentRef.current = { photo, name, title, draft };
  });

  useEffect(() => {
    if (!isActive) return;
    const state = renderStateRef.current;
    if (state.busy) {
      state.pending = true;
      return;
    }
    const paint = async () => {
      state.busy = true;
      try {
        do {
          state.pending = false;
          const current = contentRef.current;
          const result = await renderWelcomeVisual(
            { photo: current.photo?.img || null, name: current.name, title: current.title },
            current.draft
          );
          const target = previewCanvasRef.current;
          target?.getContext('2d')?.drawImage(result.canvas, 0, 0, target.width, target.height);
          setFaceFound(result.faceFound);
          setPreviewReady(true);
          setPreviewError('');
        } while (state.pending);
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : 'Önizleme çizilemedi');
      } finally {
        state.busy = false;
      }
    };
    void paint();
  }, [photo, name, title, draftKey, isActive]);

  const acceptFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Lütfen bir görsel dosyası seçin (PNG önerilir).');
      return;
    }
    try {
      setPhoto(await readPhoto(file));
      setPhotoError('');
    } catch {
      setPhotoError('Fotoğraf açılamadı. Farklı bir dosya deneyin.');
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!photo) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: draft };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = WELCOME_CANVAS.width / Math.max(1, rect.width);
    updateDraft({
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const download = async () => {
    setDownloading(true);
    try {
      const { canvas } = await renderWelcomeVisual({ photo: photo?.img || null, name, title }, draft);
      const fileName = personKey ? `hos-geldin-${personKey}.png` : 'hos-geldin.png';
      downloadBlob(await canvasToBlob(canvas), fileName);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setDownloading(false);
    }
  };

  const canDownload = Boolean(photo || name.trim());

  const downloadButton = (className: string) => (
    <button
      type="button"
      onClick={download}
      disabled={downloading || !canDownload}
      className={`z-btn-primary items-center justify-center gap-2 px-6 text-[15px] font-semibold disabled:opacity-40 ${className}`}
    >
      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      PNG indir
    </button>
  );

  return (
    <div className="panel-enter">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="z-page-kicker">Zebra Studio · Kurumsal</p>
          <h1 className="z-page-title mt-3">Hoş Geldin Görseli</h1>
        </div>
        {downloadButton('hidden min-h-[44px] lg:inline-flex')}
      </header>

      <div
        role="tablist"
        aria-label="Görünüm"
        className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-[var(--z-bg-elevated)] p-1 ring-1 ring-[var(--z-border)] lg:hidden"
      >
        {(
          [
            { id: 'edit', label: 'Düzenle' },
            { id: 'preview', label: 'Önizle' },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`min-h-[40px] rounded-full text-[15px] font-medium transition-colors ${
              tab === option.id
                ? 'bg-[var(--z-surface)] text-[var(--z-fg)] shadow-sm ring-1 ring-[var(--z-border-strong)]'
                : 'text-[var(--z-muted)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start xl:gap-14">
        <section className={`min-w-0 space-y-5 ${tab === 'edit' ? '' : 'hidden lg:block'}`}>
          <div className="z-card p-5 sm:p-6">
            <p className="text-[15px] font-semibold text-[var(--z-fg)]">Fotoğraf</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={(event) => {
                void acceptFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {photo ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--z-elevated)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-contain" />
                </div>
                <p className="min-w-0 flex-1 truncate text-[15px] text-[var(--z-fg)]">{photo.fileName}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] rounded-full bg-[var(--z-elevated)] px-4 text-[14px] font-medium text-[var(--z-fg)] hover:bg-[var(--z-border)]"
                >
                  Değiştir
                </button>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="z-btn-icon h-11 w-11 shrink-0"
                  aria-label="Fotoğrafı kaldır"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  void acceptFile(event.dataTransfer.files?.[0]);
                }}
                className={`mt-4 flex min-h-[148px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
                  dragOver
                    ? 'border-[var(--z-fg)] bg-[var(--z-hover-strong)]'
                    : 'border-[var(--z-border-strong)] hover:bg-[var(--z-hover)]'
                }`}
              >
                <ImagePlus className="h-6 w-6 text-[var(--z-muted)]" />
                <span className="text-[15px] font-medium text-[var(--z-fg)]">Fotoğraf yükle</span>
                <span className="text-[13px] text-[var(--z-muted)]">
                  Arkası boş PNG önerilir · sürükleyip bırakabilirsiniz
                </span>
              </button>
            )}
            {photoError ? <p className="mt-3 text-[13px] text-[var(--z-danger)]">{photoError}</p> : null}
          </div>

          <div className="z-card space-y-5 p-5 sm:p-6">
            <label className="block">
              <span className="text-[15px] font-semibold text-[var(--z-fg)]">İsim Soyisim</span>
              <input
                list="hos-geldin-people"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Mine Atalay"
                autoComplete="off"
                className={inputClass}
              />
              <datalist id="hos-geldin-people">
                {people.map((person) => (
                  <option key={person} value={person} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-[15px] font-semibold text-[var(--z-fg)]">Unvan</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={DEFAULT_WELCOME_TITLE}
                className={inputClass}
              />
            </label>
          </div>

          <div className="z-card space-y-5 p-5 sm:p-6">
            <div>
              <p className="text-[15px] font-semibold text-[var(--z-fg)]">Görsel ayarı</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--z-muted)]">
                {photo
                  ? 'Fotoğraf yüze göre otomatik yerleşir. Gerekirse önizlemede sürükleyerek taşıyın; yüzü kesikli çizgilerin oluşturduğu kutuya oturtun.'
                  : 'Alt gölge, fotoğrafın altını koyulaştırır; logo ve isim gölgenin üstünde kalır.'}
                {personKey ? ' Kaydedilen ayar bu kişinin görselinde hep kullanılır.' : ''}
              </p>
            </div>
            {photo ? (
              <label className="block">
                <span className="flex justify-between text-[13px] text-[var(--z-muted)]">
                  <span>Boyut</span>
                  <span className="tabular-nums text-[var(--z-fg)]">%{Math.round(draft.scale * 100)}</span>
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.01}
                  value={draft.scale}
                  onChange={(event) => updateDraft({ scale: Number(event.target.value) })}
                  className="mt-3 w-full accent-[var(--z-fg)]"
                />
              </label>
            ) : null}
            <div className="space-y-4 border-t border-[var(--z-border)] pt-5">
              <p className="text-[14px] font-semibold text-[var(--z-fg)]">Alt gölge</p>
              <label className="block">
                <span className="flex justify-between text-[13px] text-[var(--z-muted)]">
                  <span>Yükseklik</span>
                  <span className="tabular-nums text-[var(--z-fg)]">
                    %{Math.round((draft.shade.height / WELCOME_CANVAS.height) * 100)}
                  </span>
                </span>
                <input
                  type="range"
                  min={WELCOME_SHADE_LIMITS.minHeight}
                  max={WELCOME_SHADE_LIMITS.maxHeight}
                  step={10}
                  value={draft.shade.height}
                  onChange={(event) => updateShade({ height: Number(event.target.value) })}
                  className="mt-3 w-full accent-[var(--z-fg)]"
                />
              </label>
              <label className="block">
                <span className="flex justify-between text-[13px] text-[var(--z-muted)]">
                  <span>Güç</span>
                  <span className="tabular-nums text-[var(--z-fg)]">
                    {draft.shade.strength > 0 ? `%${Math.round(draft.shade.strength * 100)}` : 'Kapalı'}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={draft.shade.strength}
                  onChange={(event) => updateShade({ strength: Number(event.target.value) })}
                  className="mt-3 w-full accent-[var(--z-fg)]"
                />
              </label>
            </div>
            {personKey ? (
              <AdjustSaveActions
                canSave={canSave}
                dirty={dirty}
                hasSaved={Boolean(savedAdjust)}
                onSave={() => save(personKey, draft)}
                onResetScreen={() => setDraftState({ key: personKey, adjust: DEFAULT_WELCOME_ADJUST })}
                onDeleteSaved={async () => {
                  await remove(personKey);
                  setDraftState({ key: personKey, adjust: DEFAULT_WELCOME_ADJUST });
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setDraftState({ key: '', adjust: DEFAULT_WELCOME_ADJUST })}
                className="z-btn-ghost inline-flex w-full items-center justify-center px-4 py-2.5 text-[13px]"
              >
                Varsayılana dön
              </button>
            )}
          </div>

          {downloadButton('flex min-h-[50px] w-full rounded-[18px] lg:hidden')}
        </section>

        <aside className={`space-y-3 lg:sticky lg:top-6 ${tab === 'preview' ? '' : 'hidden lg:block'}`}>
          <div
            className={`relative mx-auto aspect-[9/16] w-full max-w-[400px] touch-none select-none overflow-hidden rounded-[20px] bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ${
              photo ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <canvas
              ref={previewCanvasRef}
              width={WELCOME_CANVAS.width / 2}
              height={WELCOME_CANVAS.height / 2}
              className="h-full w-full"
              aria-label={name.trim() ? `${name.trim()} hoş geldin görseli` : 'Hoş geldin görseli'}
            />
            {photo ? (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {WELCOME_FACE_GUIDES.x.map((x) => (
                  <span
                    key={`x-${x}`}
                    className="absolute inset-y-0 border-l border-dashed border-white/50"
                    style={{ left: `${(x / WELCOME_CANVAS.width) * 100}%` }}
                  />
                ))}
                {WELCOME_FACE_GUIDES.y.map((y) => (
                  <span
                    key={`y-${y}`}
                    className="absolute inset-x-0 border-t border-dashed border-white/50"
                    style={{ top: `${(y / WELCOME_CANVAS.height) * 100}%` }}
                  />
                ))}
              </div>
            ) : null}
            {!previewReady || previewError ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] text-white/60">
                {previewError || <Loader2 className="h-6 w-6 animate-spin text-[var(--z-muted)]" />}
              </div>
            ) : null}
          </div>
          <p className="text-center text-[13px] text-[var(--z-muted)]" aria-live="polite">
            {!photo
              ? 'Fotoğraf yükleyince yüz hizasına göre yerleşir.'
              : faceFound
                ? 'Sürükleyerek taşıyabilirsiniz. Çizgiler yalnızca önizlemede görünür.'
                : 'Yüz bulunamadı; fotoğrafı sürükleyip Boyut ile ayarlayın.'}
          </p>
          <div className="pt-2 lg:hidden">
            {downloadButton('mx-auto flex min-h-[50px] w-full max-w-[400px] rounded-[18px]')}
          </div>
        </aside>
      </div>
    </div>
  );
}
