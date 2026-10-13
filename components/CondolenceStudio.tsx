'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, PenLine, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toStudioDisplayName } from '../lib/studioAssets';
import { canvasToBlob, rankFileSlug } from '../lib/rankingVisuals';
import {
  CONDOLENCE_CANVAS,
  CONDOLENCE_EXAMPLE_TEXT,
  CONDOLENCE_PRAYERS,
  CONDOLENCE_RELATIONS,
  CONDOLENCE_TITLES,
  EMPTY_CONDOLENCE_FORM,
  autoColleagueSuffix,
  autoDeceasedSuffix,
  buildCondolenceText,
  defaultOpening,
  isSelfRelation,
  parseRuns,
  plainCondolenceText,
  renderCondolenceVisual,
  type CondolenceForm,
} from '../lib/condolenceVisuals';

type Mode = 'form' | 'custom';

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

const inputClass =
  'mt-1.5 block min-h-[44px] w-full rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] px-3.5 text-[16px] text-[var(--z-fg)] outline-none placeholder:text-[var(--z-muted)] focus:border-[var(--z-fg)] sm:text-[14px]';

function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[12px] font-medium text-[var(--z-muted)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-[var(--z-muted)]">{hint}</span> : null}
    </label>
  );
}

/** Metni paragraf/kalın işaretleriyle okunur gösterir (örnek ve özet için). */
function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((paragraph, i) => (
          <p key={i}>
            {paragraph.split('\n').map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 ? <br /> : null}
                {parseRuns(line).map((run, k) =>
                  run.bold ? (
                    <strong key={k} className="font-semibold text-[var(--z-fg)]">
                      {run.text}
                    </strong>
                  ) : (
                    <React.Fragment key={k}>{run.text}</React.Fragment>
                  )
                )}
              </React.Fragment>
            ))}
          </p>
        ))}
    </div>
  );
}

function CustomTextModal({
  initial,
  formText,
  onApply,
  onClose,
}: {
  initial: string;
  formText: string;
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[var(--z-scrim)] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Yazıyı kendin yaz"
        className="z-modal zebra-sheet-enter flex max-h-[92dvh] w-full max-w-5xl flex-col gap-5 overflow-y-auto rounded-b-none p-5 sm:rounded-b-[inherit] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="z-page-kicker">Vefat görseli</p>
            <p className="mt-2 text-[17px] font-semibold text-[var(--z-fg)]">Yazıyı kendin yaz</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--z-muted)]">
              Paragrafları boş bir satırla ayırın. Kalın yazılacak ismi iki yıldız arasına alın:{' '}
              <span className="font-mono text-[var(--z-fg)]">**Bekir Özdemir**</span>. Metin görselde
              her zaman dikey olarak ortalanır.
            </p>
          </div>
          <button type="button" onClick={onClose} className="z-btn-icon h-11 w-11 shrink-0" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={14}
            autoFocus
            className="min-h-[320px] w-full resize-y rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] p-4 text-[16px] leading-relaxed text-[var(--z-fg)] outline-none focus:border-[var(--z-fg)] sm:text-[15px]"
            placeholder="Değerli arkadaşımız …"
          />
          <aside className="rounded-2xl border border-[var(--z-border)] bg-[var(--z-elevated)] p-5">
            <p className="z-page-kicker">Örnek kurumsal metin</p>
            <RichText
              text={CONDOLENCE_EXAMPLE_TEXT}
              className="mt-3 text-[15px] leading-relaxed text-[var(--z-muted)]"
            />
            <p className="mt-4 text-[11px] leading-relaxed text-[var(--z-muted)]">
              Üslubu bu örneğe yakın tutun: kısa, saygılı, üç paragraf (bildirim, cenaze bilgisi, dilek).
            </p>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => setValue(formText)}
            className="z-btn-ghost inline-flex min-h-[44px] items-center justify-center px-4 text-[13px]"
          >
            Formdaki metinle doldur
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="z-btn-ghost inline-flex min-h-[44px] items-center justify-center px-5 text-[13px]"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => onApply(value)}
              disabled={!value.trim()}
              className="z-btn-primary inline-flex min-h-[44px] items-center justify-center px-6 text-[13px] disabled:opacity-40"
            >
              Uygula
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CondolenceStudio({ isActive = true }: { isActive?: boolean }) {
  const [form, setForm] = useState<CondolenceForm>(EMPTY_CONDOLENCE_FORM);
  const [mode, setMode] = useState<Mode>('form');
  const [customText, setCustomText] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('tam_isim');
      if (cancelled) return;
      const names = new Set<string>();
      for (const row of data || []) {
        const name = toStudioDisplayName(String((row as { tam_isim?: string }).tam_isim || '').trim());
        if (name) names.add(name);
      }
      setPeople(Array.from(names).sort((a, b) => a.localeCompare(b, 'tr')));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formText = useMemo(() => buildCondolenceText(form), [form]);
  const text = mode === 'custom' && customText.trim() ? customText : formText;
  const self = isSelfRelation(form.relation);

  const update = <K extends keyof CondolenceForm>(key: K, value: CondolenceForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Yazarken kare kaçırmamak için: çizim sürerken gelen istek biriktirilir,
  // çizim bitince en güncel metinle bir kez daha çizilir.
  const textRef = useRef(text);
  const renderStateRef = useRef({ busy: false, pending: false });
  useEffect(() => {
    textRef.current = text;
  }, [text]);

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
          const canvas = await renderCondolenceVisual(textRef.current);
          const target = previewCanvasRef.current;
          if (target) {
            target.getContext('2d')?.drawImage(canvas, 0, 0, target.width, target.height);
            setPreviewReady(true);
            setPreviewError('');
          }
        } while (state.pending);
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : 'Önizleme çizilemedi');
      } finally {
        state.busy = false;
      }
    };
    void paint();
  }, [text, isActive]);

  const download = async () => {
    setDownloading(true);
    try {
      const canvas = await renderCondolenceVisual(text);
      const who = form.deceasedName.trim() || form.colleagueName.trim() || 'gorsel';
      downloadBlob(await canvasToBlob(canvas), `vefat-${rankFileSlug(who)}.png`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setDownloading(false);
    }
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === 'custom' && !customText.trim()) setEditorOpen(true);
  };

  const closeEditor = useCallback(() => setEditorOpen(false), []);

  return (
    <div className="panel-enter space-y-10">
      <header>
        <p className="z-page-kicker">Zebra Studio · Kurumsal</p>
        <h1 className="z-page-title mt-3">Vefat Görseli</h1>
        <p className="z-page-sub">
          Bilgileri doldurun; metin kurumsal kalıba göre otomatik kurulur ve görselin ortasına
          yerleşir. Boş bırakılan bilgi görselde yer almaz.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <section className="z-card space-y-8 p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--z-elevated)] p-1">
            {(
              [
                { id: 'form', label: 'Form ile' },
                { id: 'custom', label: 'Yazıyı kendin yaz' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseMode(option.id)}
                className={`min-h-[40px] rounded-full text-[13px] font-medium transition-colors ${
                  mode === option.id
                    ? 'bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]'
                    : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {mode === 'custom' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--z-border)] bg-[var(--z-elevated)] p-5">
                {customText.trim() ? (
                  <RichText text={customText} className="text-[14px] leading-relaxed text-[var(--z-muted)]" />
                ) : (
                  <p className="text-[13px] text-[var(--z-muted)]">
                    Henüz metin yazılmadı; önizlemede formdaki metin gösteriliyor.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                className="z-btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-5 text-[13px]"
              >
                <PenLine className="h-4 w-4" /> Metni düzenle
              </button>
            </div>
          ) : (
            <>
              <fieldset className="space-y-4">
                <legend className="z-page-kicker">Çalışan</legend>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_88px]">
                  <Field label="Sıfatı">
                    <input
                      list="vefat-titles"
                      value={form.colleagueTitle}
                      onChange={(event) => update('colleagueTitle', event.target.value)}
                      className={inputClass}
                      placeholder="arkadaşımız"
                    />
                  </Field>
                  <Field label="Adı soyadı">
                    <input
                      list="vefat-people"
                      value={form.colleagueName}
                      onChange={(event) => update('colleagueName', event.target.value)}
                      className={inputClass}
                      placeholder="Aysun Özdemir"
                    />
                  </Field>
                  <Field label="Eki">
                    <input
                      value={form.colleagueSuffix}
                      onChange={(event) => update('colleagueSuffix', event.target.value)}
                      className={inputClass}
                      placeholder={autoColleagueSuffix(form) || '’in'}
                      aria-label="Çalışan adının eki"
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="z-page-kicker">Vefat eden</legend>
                <div
                  className={`grid gap-4 ${self ? '' : 'sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_88px]'}`}
                >
                  <Field label="Yakınlığı">
                    <select
                      value={
                        CONDOLENCE_RELATIONS.some((r) => r.id === form.relation) ? form.relation : 'diger'
                      }
                      onChange={(event) =>
                        update('relation', event.target.value === 'diger' ? '' : event.target.value)
                      }
                      className={inputClass}
                    >
                      {CONDOLENCE_RELATIONS.map((relation) => (
                        <option key={relation.id} value={relation.id}>
                          {relation.label}
                        </option>
                      ))}
                      <option value="diger">Diğer (yazın)</option>
                    </select>
                  </Field>
                  {self ? null : (
                    <>
                      <Field label="Adı soyadı">
                        <input
                          value={form.deceasedName}
                          onChange={(event) => update('deceasedName', event.target.value)}
                          className={inputClass}
                          placeholder="Bekir Özdemir"
                        />
                      </Field>
                      <Field label="Eki">
                        <input
                          value={form.deceasedSuffix}
                          onChange={(event) => update('deceasedSuffix', event.target.value)}
                          className={inputClass}
                          placeholder={autoDeceasedSuffix(form) || '’in'}
                          aria-label="Vefat edenin adının eki"
                        />
                      </Field>
                    </>
                  )}
                </div>
                {!self && !CONDOLENCE_RELATIONS.some((r) => r.id === form.relation) ? (
                  <Field label="Yakınlık (serbest)" hint="Örn. kayınpederi, amcası, teyzesi">
                    <input
                      value={form.relation}
                      onChange={(event) => update('relation', event.target.value)}
                      className={inputClass}
                      placeholder="kayınpederi"
                    />
                  </Field>
                ) : null}
                <p className="text-[11px] leading-relaxed text-[var(--z-muted)]">
                  Ekler soyadının son ünlüsüne göre otomatik seçilir (Özdemir’in, Koç’un, Kaya’nın).
                  Yanlışsa “Eki” kutusundan düzeltin.
                </p>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="z-page-kicker">Cenaze</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tarih" hint="Gün adı otomatik eklenir">
                    <input
                      type="date"
                      value={form.funeralDate}
                      onChange={(event) => update('funeralDate', event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Namaz vakti">
                    <select
                      value={form.prayer}
                      onChange={(event) => update('prayer', event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Belirtilmedi</option>
                      {CONDOLENCE_PRAYERS.map((prayer) => (
                        <option key={prayer} value={prayer}>
                          {prayer} namazı
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field
                  label="Cami"
                  hint="Sonuna “Camii’nde kaldırılacaktır” eklenir. Cami boşsa cenaze paragrafı görselde yer almaz."
                >
                  <input
                    value={form.mosque}
                    onChange={(event) => update('mosque', event.target.value)}
                    className={inputClass}
                    placeholder="Manisa Demirci Beyazıt"
                  />
                </Field>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="z-page-kicker">Dilek</legend>
                <Field label="Son paragrafın başı" hint="… Allah’tan rahmet;">
                  <input
                    value={form.opening}
                    onChange={(event) => update('opening', event.target.value)}
                    className={inputClass}
                    placeholder={defaultOpening(form)}
                  />
                </Field>
              </fieldset>

              <datalist id="vefat-titles">
                {CONDOLENCE_TITLES.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
              <datalist id="vefat-people">
                {people.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[380px] overflow-hidden rounded-2xl bg-[var(--z-elevated)]">
            <canvas
              ref={previewCanvasRef}
              width={CONDOLENCE_CANVAS.width / 2}
              height={CONDOLENCE_CANVAS.height / 2}
              className="h-full w-full"
              aria-label={plainCondolenceText(text)}
            />
            {!previewReady || previewError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[12px] text-[var(--z-muted)]">
                {previewError || <Loader2 className="h-6 w-6 animate-spin" />}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="z-btn-primary mx-auto flex min-h-[44px] w-full max-w-[380px] items-center justify-center gap-2 px-6 text-[13px] disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PNG indir
          </button>
        </aside>
      </div>

      {editorOpen ? (
        <CustomTextModal
          initial={customText.trim() ? customText : formText}
          formText={formText}
          onApply={(value) => {
            setCustomText(value);
            setMode('custom');
            setEditorOpen(false);
          }}
          onClose={closeEditor}
        />
      ) : null}
    </div>
  );
}
