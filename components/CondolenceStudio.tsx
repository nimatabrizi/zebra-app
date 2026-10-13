'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bold, ChevronDown, Download, Loader2, RotateCcw } from 'lucide-react';
import { canvasToBlob, rankFileSlug } from '../lib/rankingVisuals';
import {
  CONDOLENCE_CANVAS,
  CONDOLENCE_EXAMPLE_TEXT,
  CONDOLENCE_LAYOUT,
  parseRuns,
  plainCondolenceText,
  renderCondolenceVisual,
} from '../lib/condolenceVisuals';

const STORAGE_KEY = 'zebra-vefat-text';
const PREVIEW_DELAY_MS = 120;

type Tab = 'write' | 'preview';

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

function readStoredText() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/** İndirilen dosyanın adı: metindeki ilk kalın isim. */
function fileNameFor(text: string) {
  const firstBold = text
    .split('\n')
    .flatMap((line) => parseRuns(line))
    .find((run) => run.bold && run.text.trim());
  const who = (firstBold?.text || 'gorsel').replace(/[’'].*$/, '').trim();
  return `vefat-${rankFileSlug(who)}.png`;
}

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

function ToolButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--z-elevated)] px-4 text-[14px] font-medium text-[var(--z-fg)] transition-colors hover:bg-[var(--z-border)]"
    >
      {icon}
      {label}
    </button>
  );
}

export default function CondolenceStudio({ isActive = true }: { isActive?: boolean }) {
  const [text, setText] = useState(readStoredText);
  const [previewText, setPreviewText] = useState(text);
  const [tab, setTab] = useState<Tab>('write');
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [fontSize, setFontSize] = useState<number>(CONDOLENCE_LAYOUT.fontSize);
  const [downloading, setDownloading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      if (text) window.localStorage.setItem(STORAGE_KEY, text);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Gizli sekme vb.: metin yalnızca bu oturumda kalır.
    }
    const timer = setTimeout(() => setPreviewText(text), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Çizim sürerken gelen istek biriktirilir; çizim bitince en güncel metinle bir kez daha çizilir.
  const previewTextRef = useRef(previewText);
  const renderStateRef = useRef({ busy: false, pending: false });
  useEffect(() => {
    previewTextRef.current = previewText;
  }, [previewText]);

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
          const canvas = await renderCondolenceVisual(previewTextRef.current);
          const target = previewCanvasRef.current;
          target?.getContext('2d')?.drawImage(canvas, 0, 0, target.width, target.height);
          setFontSize(Number(canvas.dataset.fontSize) || CONDOLENCE_LAYOUT.fontSize);
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
  }, [previewText, isActive]);

  /** Seçimi `before` ile `after` arasına alır; seçim yoksa imleç ortada kalır. */
  const wrapSelection = (before: string, after = '') => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const middle = text.slice(start, end);
    setText(text.slice(0, start) + before + middle + after + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start === end ? start + before.length : start + before.length + middle.length + after.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const startFromExample = () => {
    if (text.trim() && !window.confirm('Mevcut metin örnek metinle değiştirilsin mi?')) return;
    setText(CONDOLENCE_EXAMPLE_TEXT);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const download = async () => {
    if (!text.trim()) return;
    setDownloading(true);
    try {
      const canvas = await renderCondolenceVisual(text);
      downloadBlob(await canvasToBlob(canvas), fileNameFor(text));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setDownloading(false);
    }
  };

  const empty = !text.trim();
  const shrunk = fontSize < CONDOLENCE_LAYOUT.fontSize;

  const downloadButton = (className: string) => (
    <button
      type="button"
      onClick={download}
      disabled={downloading || empty}
      className={`z-btn-primary items-center justify-center gap-2 px-6 text-[15px] font-semibold disabled:opacity-40 ${className}`}
    >
      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      PNG indir
    </button>
  );

  const previewOverlay =
    !previewReady || previewError || empty ? (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] text-white/60">
        {previewError ||
          (!previewReady ? <Loader2 className="h-6 w-6 animate-spin text-[var(--z-muted)]" /> : 'Metninizi yazın')}
      </div>
    ) : null;

  return (
    <div className="panel-enter pb-20 lg:pb-0">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="z-page-kicker">Zebra Studio · Kurumsal</p>
          <h1 className="z-page-title mt-3">Vefat Görseli</h1>
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
            { id: 'write', label: 'Yaz' },
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
        <section className={`min-w-0 space-y-5 ${tab === 'write' ? '' : 'hidden lg:block'}`}>
          <div className="z-card overflow-hidden p-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={14}
              spellCheck
              lang="tr"
              aria-label="Vefat metni"
              placeholder={'Kıymetli arkadaşımız **Ad Soyad**’ın …\n\nParagrafları boş bir satırla ayırın.'}
              className="block min-h-[340px] selection:bg-[var(--z-border-strong)] selection:text-[var(--z-fg)] w-full resize-y bg-transparent p-5 text-[17px] leading-[1.6] text-[var(--z-fg)] outline-none placeholder:text-[var(--z-muted)] sm:p-6"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--z-border)] p-3">
              <ToolButton onClick={() => wrapSelection('**', '**')} icon={<Bold className="h-4 w-4" />} label="Kalın" />
              <span className="flex-1" />
              <ToolButton
                onClick={startFromExample}
                icon={<RotateCcw className="h-4 w-4" />}
                label={
                  <>
                    <span className="sm:hidden">Örnek</span>
                    <span className="hidden sm:inline">Örnekle başla</span>
                  </>
                }
              />
            </div>
          </div>

          <details className="group rounded-2xl bg-[var(--z-elevated)]">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-5 text-[15px] font-medium text-[var(--z-fg)] [&::-webkit-details-marker]:hidden">
              Örnek kurumsal metin
              <ChevronDown className="h-4 w-4 text-[var(--z-muted)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-5">
              <RichText text={CONDOLENCE_EXAMPLE_TEXT} className="text-[15px] leading-relaxed text-[var(--z-muted)]" />
              <p className="mt-4 text-[13px] leading-relaxed text-[var(--z-muted)]">
                Kısa ve saygılı tutun: bildirim, cenaze bilgisi, dilek.
              </p>
            </div>
          </details>
        </section>

        <aside className={`space-y-3 lg:sticky lg:top-6 ${tab === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-[20px] bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
            <canvas
              ref={previewCanvasRef}
              width={CONDOLENCE_CANVAS.width / 2}
              height={CONDOLENCE_CANVAS.height / 2}
              className="h-full w-full"
              aria-label={plainCondolenceText(previewText) || 'Boş vefat görseli'}
            />
            {previewOverlay}
          </div>
          <p className="text-center text-[13px] text-[var(--z-muted)]" aria-live="polite">
            {empty
              ? 'Metin görselde her zaman dikeyde ortalanır.'
              : shrunk
                ? `Metin uzun, yazı küçültüldü (${fontSize} px)`
                : `Yazı boyutu ${fontSize} px`}
          </p>
        </aside>
      </div>

      {isActive ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5.25rem))] z-[50] lg:hidden">
          <div className="pointer-events-auto mx-auto max-w-lg px-3">
            {downloadButton('flex min-h-[50px] w-full rounded-[18px] shadow-[var(--z-shadow-float)]')}
          </div>
        </div>
      ) : null}
    </div>
  );
}
