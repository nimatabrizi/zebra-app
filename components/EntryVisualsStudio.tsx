'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import {
  AlertTriangle,
  Download,
  FileText,
  ImageOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanFace,
  SlidersHorizontal,
  ListChecks,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import { canvasToBlob, rankFileSlug } from '../lib/rankingVisuals';
import PasteListModal from './PasteListModal';
import PeoplePicker from './PeoplePicker';
import { AdjustSaveActions, useUnsavedChangesGuard } from './AdjustSaveControls';
import { useSavedAdjustments } from '../lib/visualAdjustments';
import {
  DEFAULT_GIRIS_ADJUST,
  DEFAULT_GIRIS_COLOR,
  DEFAULT_GIRIS_EFFECTS,
  isColorAdjustActive,
  normalizeGirisEffects,
  GIRIS_CANVAS,
  GIRIS_DPI,
  girisPageSizeMm,
  refreshGirisPhoto,
  renderGirisVisual,
  type GirisAdjust,
  type GirisEffects,
  type GirisPerson,
  type GirisRenderInfo,
} from '../lib/girisVisuals';

type Profile = GirisPerson & { key: string; name: string };

type PersonSettings = { adjust: GirisAdjust; effects?: GirisEffects };

const ADJUST_STORAGE_KEY = 'zebra-giris-photo-adjust-v1';
const DEFAULTS_STORAGE_KEY = 'zebra-giris-defaults-v1';
const PASTE_LIST_STORAGE_KEY = 'zebra-giris-paste-list-v1';
const OFFSET_LIMIT = 1600;
const THUMB_SCALE = 0.15;
const PREVIEW_SCALE = 0.25;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
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

function baseFileName(person: Profile) {
  return `giris-${rankFileSlug(person.name)}`;
}

async function buildPdf(canvases: AsyncIterable<HTMLCanvasElement>, bleed: boolean) {
  const { jsPDF } = await import('jspdf');
  const size = girisPageSizeMm(bleed);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [size.width, size.height], compress: true });
  let first = true;
  for await (const canvas of canvases) {
    if (!first) pdf.addPage([size.width, size.height], 'portrait');
    first = false;
    pdf.addImage(canvas, 'PNG', 0, 0, size.width, size.height, undefined, 'FAST');
  }
  return pdf.output('blob');
}

function Badge({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-medium ${
        tone === 'warn' ? 'text-amber-300' : 'text-sky-300'
      }`}
    >
      {children}
    </span>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--z-fg)]">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-[var(--z-fg)]"
      />
    </label>
  );
}

function EffectsControls({
  value,
  onChange,
}: {
  value: GirisEffects;
  onChange: (next: GirisEffects) => void;
}) {
  const setShadow = (patch: Partial<GirisEffects['shadow']>) =>
    onChange({ ...value, shadow: { ...value.shadow, ...patch } });
  const setFade = (patch: Partial<GirisEffects['fade']>) =>
    onChange({ ...value, fade: { ...value.fade, ...patch } });
  const setColor = (patch: Partial<GirisEffects['color']>) =>
    onChange({ ...value, color: { ...value.color, ...patch } });
  const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  return (
    <div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--z-fg)]">Inner shadow</span>
        <button
          type="button"
          onClick={() => setShadow({ enabled: !value.shadow.enabled })}
          className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
            value.shadow.enabled
              ? 'bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]'
              : 'border border-[var(--z-border)] text-[var(--z-muted)]'
          }`}
        >
          {value.shadow.enabled ? 'Açık' : 'Kapalı'}
        </button>
      </div>
      {value.shadow.enabled ? (
        <>
          <Slider label="Opaklık" value={value.shadow.opacity} min={0} max={1} step={0.01} format={(v) => `%${Math.round(v * 100)}`} onChange={(v) => setShadow({ opacity: v })} />
          <Slider label="Boyut (blur)" value={value.shadow.blur} min={0} max={300} step={1} format={(v) => `${v}px`} onChange={(v) => setShadow({ blur: v })} />
          <Slider label="Mesafe" value={value.shadow.distance} min={0} max={200} step={1} format={(v) => `${v}px`} onChange={(v) => setShadow({ distance: v })} />
          <Slider label="Açı" value={value.shadow.angle} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(v) => setShadow({ angle: v })} />
          <label className="mt-4 flex items-center justify-between text-[12px] text-[var(--z-muted)]">
            <span>Renk</span>
            <input
              type="color"
              value={value.shadow.color}
              onChange={(event) => setShadow({ color: event.target.value })}
              className="h-7 w-12 cursor-pointer rounded border border-[var(--z-border)] bg-transparent"
            />
          </label>
        </>
      ) : null}
      <p className="mt-6 text-[13px] font-medium text-[var(--z-fg)]">Alt geçiş</p>
      <Slider label="Başlangıç" value={value.fade.start} min={1200} max={3000} step={10} format={(v) => `${v}px`} onChange={(v) => setFade({ start: v })} />
      <Slider label="Yoğunluk" value={value.fade.strength} min={0} max={1} step={0.01} format={(v) => `%${Math.round(v * 100)}`} onChange={(v) => setFade({ strength: v })} />

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--z-fg)]">Renk</span>
        <button
          type="button"
          disabled={!isColorAdjustActive(value.color)}
          onClick={() => onChange({ ...value, color: DEFAULT_GIRIS_COLOR })}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--z-muted)] hover:text-[var(--z-fg)] disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" /> Rengi sıfırla
        </button>
      </div>
      <Slider label="Kırmızılık azalt" value={value.color.red} min={0} max={100} step={1} format={(v) => `${v}`} onChange={(v) => setColor({ red: v })} />
      <Slider label="Sarılık azalt" value={value.color.yellow} min={0} max={100} step={1} format={(v) => `${v}`} onChange={(v) => setColor({ yellow: v })} />
      <Slider label="Sıcaklık" value={value.color.temperature} min={-50} max={50} step={1} format={signed} onChange={(v) => setColor({ temperature: v })} />
      <Slider label="Ton (yeşil ↔ macenta)" value={value.color.tint} min={-50} max={50} step={1} format={signed} onChange={(v) => setColor({ tint: v })} />
      <Slider label="Doygunluk" value={value.color.saturation} min={-50} max={50} step={1} format={signed} onChange={(v) => setColor({ saturation: v })} />
      <Slider label="Parlaklık" value={value.color.brightness} min={-30} max={30} step={1} format={signed} onChange={(v) => setColor({ brightness: v })} />
      <Slider label="Kontrast" value={value.color.contrast} min={-30} max={30} step={1} format={signed} onChange={(v) => setColor({ contrast: v })} />
    </div>
  );
}

export default function EntryVisualsStudio({
  isActive = true,
  canSave = false,
}: {
  isActive?: boolean;
  canSave?: boolean;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [titleFilter, setTitleFilter] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const [defaults, setDefaults] = useState<GirisEffects>(DEFAULT_GIRIS_EFFECTS);
  const [bleed, setBleed] = useState(false);
  const {
    saved: settings,
    save: saveSettings,
    remove: removeSettings,
  } = useSavedAdjustments<PersonSettings>('giris', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });
  const [thumbs, setThumbs] = useState<Record<string, { url: string; info: GirisRenderInfo }>>({});
  const [thumbErrors, setThumbErrors] = useState<Record<string, string>>({});
  const thumbUrlsRef = useRef<Record<string, string>>({});

  const [editing, setEditing] = useState<Profile | null>(null);
  const [draftAdjust, setDraftAdjust] = useState<GirisAdjust>(DEFAULT_GIRIS_ADJUST);
  const [draftEffects, setDraftEffects] = useState<GirisEffects>(DEFAULT_GIRIS_EFFECTS);
  const [previewInfo, setPreviewInfo] = useState<GirisRenderInfo | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: GirisAdjust } | null>(null);

  const [exporting, setExporting] = useState<{ label: string; current: number; total: number } | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [photoRevisions, setPhotoRevisions] = useState<Record<string, number>>({});
  const [reloadingPhoto, setReloadingPhoto] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    try {
      const rawDefaults = localStorage.getItem(DEFAULTS_STORAGE_KEY);
      if (rawDefaults) {
        const parsed = JSON.parse(rawDefaults);
        if (parsed.effects) setDefaults(normalizeGirisEffects(parsed.effects));
        if (typeof parsed.bleed === 'boolean') setBleed(parsed.bleed);
      }
    } catch {
      /* bozuk kayıt yok sayılır */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify({ effects: defaults, bleed }));
    } catch {
      /* kota dolu olabilir */
    }
  }, [defaults, bleed]);

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
      const slugs = (files || [])
        .map((file) => String(file.name || '').replace(/\.png$/i, ''))
        .filter(Boolean);
      const seen = new Set<string>();
      const list: Profile[] = [];
      for (const row of rows || []) {
        const record = row as Record<string, unknown>;
        const name = String(record.tam_isim || '').normalize('NFC').trim();
        const key = toConsultantPhotoSlug(name);
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        list.push({
          key,
          name,
          displayName: toStudioDisplayName(name),
          title: resolveConsultantTitle(name, String(record.unvan || '')),
          photoUrl: resolveConsultantPhotoUrl(name, slugs),
        });
      }
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'));
      setProfiles(list);
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

  const titles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of profiles) counts.set(p.title, (counts.get(p.title) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [profiles]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR');
    return profiles.filter(
      (p) =>
        (!titleFilter.length || titleFilter.includes(p.title)) &&
        (!needle || p.displayName.toLocaleLowerCase('tr-TR').includes(needle))
    );
  }, [profiles, query, titleFilter]);

  const selected = useMemo(
    () => selectedKeys.map((key) => profiles.find((p) => p.key === key)).filter(Boolean) as Profile[],
    [selectedKeys, profiles]
  );

  const adjustFor = useCallback(
    (person: Profile) => settings[person.key]?.adjust || DEFAULT_GIRIS_ADJUST,
    [settings]
  );
  const effectsFor = useCallback(
    (person: Profile) => {
      const own = settings[person.key]?.effects;
      return own ? normalizeGirisEffects(own, defaults.color) : defaults;
    },
    [settings, defaults]
  );

  const thumbKey = useCallback(
    (person: Profile) =>
      JSON.stringify([
        person.key,
        person.photoUrl,
        person.title,
        adjustFor(person),
        effectsFor(person),
        photoRevisions[person.key] || 0,
      ]),
    [adjustFor, effectsFor, photoRevisions]
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
          const { canvas, info } = await renderGirisVisual(person, adjustFor(person), effectsFor(person), {
            scale: THUMB_SCALE,
          });
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumb'))), 'image/jpeg', 0.86)
          );
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          thumbUrlsRef.current[key] = url;
          setThumbs((current) => ({ ...current, [key]: { url, info } }));
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
  }, [selected, thumbKey, adjustFor, effectsFor, isActive]);

  // Sürükleme sırasında kare kaçırmamak için: çizim sürerken gelen istek
  // biriktirilir, çizim bitince en güncel ayarla bir kez daha çizilir.
  const editingRef = useRef<Profile | null>(null);
  const draftRef = useRef<{ adjust: GirisAdjust; effects: GirisEffects; before: boolean }>({
    adjust: DEFAULT_GIRIS_ADJUST,
    effects: DEFAULT_GIRIS_EFFECTS,
    before: false,
  });
  const previewRenderRef = useRef({ busy: false, pending: false });
  useEffect(() => {
    editingRef.current = editing;
    draftRef.current = { adjust: draftAdjust, effects: draftEffects, before: showBefore };
  }, [editing, draftAdjust, draftEffects, showBefore]);

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
      const { adjust, effects, before } = draftRef.current;
      const shown = before ? { ...effects, color: DEFAULT_GIRIS_COLOR } : effects;
      const { canvas, info } = await renderGirisVisual(person, adjust, shown, { scale: PREVIEW_SCALE });
      const target = previewCanvasRef.current;
      if (target && editingRef.current === person) {
        target.getContext('2d')?.drawImage(canvas, 0, 0, target.width, target.height);
        setPreviewInfo(info);
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
  }, [editing, draftAdjust, draftEffects, showBefore, paintPreview]);

  const openEditor = (person: Profile) => {
    setPreviewReady(false);
    setPreviewInfo(null);
    setDraftAdjust(adjustFor(person));
    setDraftEffects(effectsFor(person));
    setEditing(person);
  };

  const saveDraft = async () => {
    if (!editing) return;
    const entry: PersonSettings = { adjust: draftAdjust };
    if (!sameJson(draftEffects, defaults)) entry.effects = draftEffects;
    await saveSettings(editing.key, entry);
  };

  const reloadPhoto = async (person: Profile) => {
    setReloadingPhoto(true);
    try {
      await refreshGirisPhoto(person.photoUrl);
      setPhotoRevisions((current) => ({ ...current, [person.key]: (current[person.key] || 0) + 1 }));
      setPreviewReady(false);
      await paintPreview();
    } finally {
      setReloadingPhoto(false);
    }
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewReady(false);
    setShowBefore(false);
  };

  const dirty = Boolean(
    canSave &&
      editing &&
      (!sameJson(draftAdjust, adjustFor(editing)) || !sameJson(draftEffects, effectsFor(editing)))
  );
  const { requestClose, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    onSave: saveDraft,
    onClose: closeEditor,
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: draftRef.current.adjust,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = GIRIS_CANVAS.width / Math.max(1, rect.width);
    setDraftAdjust({
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const renderFull = (person: Profile, override?: { adjust: GirisAdjust; effects: GirisEffects }) =>
    renderGirisVisual(
      person,
      override?.adjust || adjustFor(person),
      override?.effects || effectsFor(person),
      { bleed }
    ).then((r) => r.canvas);

  const downloadPdfOne = async (person: Profile, override?: { adjust: GirisAdjust; effects: GirisEffects }) => {
    setBusyKey(`pdf|${person.key}`);
    try {
      const canvas = await renderFull(person, override);
      const blob = await buildPdf(
        (async function* () {
          yield canvas;
        })(),
        bleed
      );
      downloadBlob(blob, `${baseFileName(person)}.pdf`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'PDF oluşturulamadı');
    } finally {
      setBusyKey('');
    }
  };

  const downloadPngOne = async (person: Profile, override?: { adjust: GirisAdjust; effects: GirisEffects }) => {
    setBusyKey(`png|${person.key}`);
    try {
      const canvas = await renderFull(person, override);
      downloadBlob(await canvasToBlob(canvas), `${baseFileName(person)}.png`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setBusyKey('');
    }
  };

  const downloadCombinedPdf = async () => {
    if (!selected.length) return;
    const total = selected.length;
    setExporting({ label: 'PDF', current: 0, total });
    try {
      const blob = await buildPdf(
        (async function* () {
          for (let i = 0; i < total; i += 1) {
            yield await renderFull(selected[i]!);
            setExporting({ label: 'PDF', current: i + 1, total });
          }
        })(),
        bleed
      );
      downloadBlob(blob, total === 1 ? `${baseFileName(selected[0]!)}.pdf` : `giris-gorselleri-${total}-kisi.pdf`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'PDF oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const downloadZip = async (kind: 'pdf' | 'png') => {
    if (!selected.length) return;
    const total = selected.length;
    const label = kind === 'pdf' ? 'PDF ZIP' : 'PNG ZIP';
    const zip = new JSZip();
    const root = zip.folder('Giris-Gorselleri')!;
    setExporting({ label, current: 0, total });
    try {
      for (let i = 0; i < total; i += 1) {
        const person = selected[i]!;
        const canvas = await renderFull(person);
        if (kind === 'pdf') {
          root.file(
            `${baseFileName(person)}.pdf`,
            await buildPdf(
              (async function* () {
                yield canvas;
              })(),
              bleed
            )
          );
        } else {
          root.file(`${baseFileName(person)}.png`, await canvasToBlob(canvas));
        }
        setExporting({ label, current: i + 1, total });
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `giris-gorselleri-${kind}.zip`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const toggle = (key: string) =>
    setSelectedKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const selectVisible = () =>
    setSelectedKeys((current) => Array.from(new Set([...current, ...visible.map((p) => p.key)])));

  const applyPastedList = (keys: string[], mode: 'add' | 'replace') =>
    setSelectedKeys((current) => (mode === 'replace' ? keys : Array.from(new Set([...current, ...keys]))));

  const pageSize = girisPageSizeMm(bleed);

  return (
    <div className="panel-enter space-y-10">
      <header>
        <p className="z-page-kicker">Zebra Studio · Baskı</p>
        <h1 className="z-page-title mt-3">Giriş Görselleri</h1>
        <p className="z-page-sub">
          Kullanıcıları seçin; her biri için A4, {GIRIS_DPI} DPI baskı kalitesinde giriş görseli
          hazırlanır. Yüzler otomatik olarak örnekteki boyuta hizalanır.
        </p>
      </header>

      <section className="z-card p-6 sm:p-8">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--z-muted)] hover:text-[var(--z-fg)] disabled:opacity-40"
            onClick={() => setPasteOpen(true)}
          >
            <ListChecks className="h-3.5 w-3.5" /> Listeden seç
          </button>
        </div>
        <PeoplePicker
          label="Kullanıcılar"
          noun="kullanıcı"
          items={visible.map((person) => ({
            key: person.key,
            label: person.displayName,
            meta: person.title,
            missingPhoto: !person.photoUrl,
          }))}
          selectedItems={selected.map((person) => ({
            key: person.key,
            label: person.displayName,
            missingPhoto: !person.photoUrl,
          }))}
          query={query}
          onQueryChange={setQuery}
          onToggle={toggle}
          onClear={() => setSelectedKeys([])}
          onSelectVisible={selectVisible}
          searchPlaceholder="Kullanıcı ara"
          emptyResultsText="Eşleşen kullanıcı yok."
          loading={loading}
          filtered={titleFilter.length > 0}
          toolbar={
            titles.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {titles.map(([title, count]) => {
                  const active = titleFilter.includes(title);
                  return (
                    <button
                      key={title}
                      type="button"
                      onClick={() =>
                        setTitleFilter((current) =>
                          current.includes(title) ? current.filter((t) => t !== title) : [...current, title]
                        )
                      }
                      className={`z-chip ${active ? '!border-transparent !bg-[var(--z-inverse)] !text-[var(--z-inverse-fg)]' : ''}`}
                    >
                      {title} <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null
          }
        />
      </section>

      <section className="z-card p-6 sm:p-8">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="z-label mb-0 block">Varsayılan efektler ve baskı</span>
              <span className="mt-1 block text-[12px] text-[var(--z-muted)]">
                Inner shadow, alt geçiş ve renk tüm görsellere uygulanır; kişiye özel ayar bunu ezer.
              </span>
            </span>
            <SlidersHorizontal className="h-4 w-4 text-[var(--z-muted)]" />
          </summary>
          <div className="mt-4 grid gap-8 lg:grid-cols-2">
            <div>
              <EffectsControls value={defaults} onChange={setDefaults} />
              <button
                type="button"
                onClick={() => setDefaults(DEFAULT_GIRIS_EFFECTS)}
                className="z-btn-ghost mt-6 inline-flex items-center gap-2 px-4 py-2 text-[12px]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Efektleri sıfırla
              </button>
            </div>
            <div>
              <p className="mt-5 text-[13px] font-medium text-[var(--z-fg)]">Baskı</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-[13px] text-[var(--z-fg)]">
                <input
                  type="checkbox"
                  checked={bleed}
                  onChange={(event) => setBleed(event.target.checked)}
                  className="mt-0.5 accent-[var(--z-fg)]"
                />
                <span>
                  3 mm taşma payı ekle
                  <span className="mt-1 block text-[12px] text-[var(--z-muted)]">
                    Sayfa {pageSize.width}×{pageSize.height} mm olur; matbaa kesimi için.
                  </span>
                </span>
              </label>
              <p className="mt-5 text-[12px] leading-relaxed text-[var(--z-muted)]">
                Çıktı: {GIRIS_CANVAS.width}×{GIRIS_CANVAS.height} px, {GIRIS_DPI} DPI, kayıpsız PNG.
                En iyi sonuç için yüksek çözünürlüklü fotoğraflar <b>consultant-photos-hires</b>{' '}
                klasörüne aynı dosya adıyla yüklenmelidir.
              </p>
            </div>
          </div>
        </details>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="z-page-kicker">Önizleme</p>
            <p className="mt-2 text-[15px] text-[var(--z-fg)]">{selected.length} görsel</p>
          </div>
          {exporting ? (
            <p className="inline-flex items-center gap-2 text-[13px] text-[var(--z-fg)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {exporting.label} · {exporting.current}/{exporting.total} hazırlanıyor
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadCombinedPdf}
                disabled={!selected.length}
                className="z-btn-primary inline-flex items-center gap-2 px-5 py-3 text-[13px] disabled:opacity-40"
              >
                <FileText className="h-4 w-4" strokeWidth={1.8} />
                Tek PDF ({selected.length} sayfa)
              </button>
              <button
                type="button"
                onClick={() => downloadZip('pdf')}
                disabled={!selected.length}
                className="z-btn-ghost inline-flex items-center gap-2 px-5 py-3 text-[13px] disabled:opacity-40"
              >
                <Download className="h-4 w-4" strokeWidth={1.8} />
                Ayrı PDF&apos;ler (ZIP)
              </button>
              <button
                type="button"
                onClick={() => downloadZip('png')}
                disabled={!selected.length}
                className="z-btn-ghost inline-flex items-center gap-2 px-5 py-3 text-[13px] disabled:opacity-40"
              >
                <Download className="h-4 w-4" strokeWidth={1.8} />
                PNG&apos;ler (ZIP)
              </button>
            </div>
          )}
        </div>

        {selected.length ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-5">
            {selected.map((person) => {
              const key = thumbKey(person);
              const thumb = thumbs[key];
              const info = thumb?.info;
              return (
                <article key={person.key} className="z-list-card overflow-hidden p-2.5">
                  <div className="relative aspect-[210/297] overflow-hidden rounded-[1.1rem] bg-black">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb.url} alt={person.displayName} className="h-full w-full object-cover" />
                    ) : thumbErrors[key] ? (
                      <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-[var(--z-muted)]">
                        {thumbErrors[key]}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--z-muted)]" />
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                      {!person.photoUrl || (info && !info.hasPhoto) ? (
                        <Badge tone="warn">
                          <ImageOff className="h-3 w-3" /> Fotoğraf yok
                        </Badge>
                      ) : null}
                      {info?.hasPhoto && !info.faceFound ? (
                        <Badge tone="warn">
                          <ScanFace className="h-3 w-3" /> Yüz otomatik hizalanamadı
                        </Badge>
                      ) : null}
                      {info?.effectiveDpi != null && info.effectiveDpi < GIRIS_DPI ? (
                        <Badge tone="warn">
                          <AlertTriangle className="h-3 w-3" /> Düşük çözünürlük · {info.effectiveDpi} DPI
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="px-1.5 pb-1 pt-3">
                    <p className="truncate text-[13px] font-medium text-[var(--z-fg)]">{person.displayName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--z-muted)]">{person.title}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => downloadPdfOne(person)}
                        disabled={Boolean(busyKey)}
                        className="z-btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[12px]"
                      >
                        {busyKey === `pdf|${person.key}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                        )}
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPngOne(person)}
                        disabled={Boolean(busyKey)}
                        className="z-btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[12px]"
                      >
                        {busyKey === `png|${person.key}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                        )}
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(person)}
                        className="z-btn-icon h-9 w-9 shrink-0"
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
            <p className="text-[15px] font-medium text-[var(--z-fg)]">Henüz kullanıcı seçilmedi</p>
            <p className="mt-2 max-w-md text-[13px] text-[var(--z-muted)]">
              Yukarıdaki listeden giriş görseli hazırlanacak kişileri seçin.
            </p>
          </div>
        )}
      </section>

      {pasteOpen ? (
        <PasteListModal
          people={profiles}
          storageKey={PASTE_LIST_STORAGE_KEY}
          kicker="Giriş görselleri"
          onApply={applyPastedList}
          onClose={() => setPasteOpen(false)}
        />
      ) : null}

      {editing && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
              onClick={requestClose}
            >
              <div
                className="z-modal zebra-sheet-enter flex max-h-[94vh] w-full max-w-4xl flex-col gap-6 overflow-y-auto p-5 sm:p-7 md:grid md:h-[94vh] md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  className="relative mx-auto aspect-[210/297] w-full max-w-[calc(84vh*0.707)] shrink-0 cursor-grab md:self-center touch-none select-none overflow-hidden rounded-2xl bg-black active:cursor-grabbing"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={Math.round(GIRIS_CANVAS.width * PREVIEW_SCALE)}
                    height={Math.round(GIRIS_CANVAS.height * PREVIEW_SCALE)}
                    className="h-full w-full"
                    aria-label={editing.displayName}
                  />
                  {!previewReady ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[var(--z-muted)]" />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col md:-mr-3 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:pr-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="z-page-kicker">Giriş görseli</p>
                      <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">{editing.displayName}</p>
                      <p className="mt-1 text-[12px] text-[var(--z-muted)]">{editing.title}</p>
                    </div>
                    <button type="button" onClick={requestClose} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {previewInfo ? (
                    <p className="mt-4 text-[12px] text-[var(--z-muted)]">
                      {previewInfo.faceFound ? 'Yüz otomatik hizalandı' : 'Yüz bulunamadı, opak alana göre yerleşti'}
                      {previewInfo.effectiveDpi != null ? ` · ${previewInfo.effectiveDpi} DPI` : ''}
                      {previewInfo.hires ? ' · yüksek çözünürlüklü kaynak' : ''}
                    </p>
                  ) : null}

                  <p className="mt-4 text-[12px] leading-relaxed text-[var(--z-muted)]">
                    Fotoğrafı önizlemede sürükleyerek kaydırın. Kaydedilen ayarlar bu kişinin görselinde hep kullanılır.
                  </p>

                  <Slider label="Boyut" value={draftAdjust.scale} min={0.6} max={1.6} step={0.01} format={(v) => `%${Math.round(v * 100)}`} onChange={(v) => setDraftAdjust((c) => ({ ...c, scale: v }))} />
                  <Slider label="Yatay" value={draftAdjust.dx} min={-OFFSET_LIMIT} max={OFFSET_LIMIT} step={1} format={(v) => `${v}px`} onChange={(v) => setDraftAdjust((c) => ({ ...c, dx: v }))} />
                  <Slider label="Dikey" value={draftAdjust.dy} min={-OFFSET_LIMIT} max={OFFSET_LIMIT} step={1} format={(v) => `${v}px`} onChange={(v) => setDraftAdjust((c) => ({ ...c, dy: v }))} />

                  <EffectsControls value={draftEffects} onChange={setDraftEffects} />
                  <button
                    type="button"
                    disabled={!isColorAdjustActive(draftEffects.color)}
                    onPointerDown={() => setShowBefore(true)}
                    onPointerUp={() => setShowBefore(false)}
                    onPointerLeave={() => setShowBefore(false)}
                    onPointerCancel={() => setShowBefore(false)}
                    onKeyDown={(event) => {
                      if (event.key === ' ' || event.key === 'Enter') setShowBefore(true);
                    }}
                    onKeyUp={() => setShowBefore(false)}
                    className={`mt-4 inline-flex select-none items-center justify-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                      showBefore
                        ? 'border-transparent bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]'
                        : 'border-[var(--z-border)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                    }`}
                  >
                    {showBefore ? 'Önce (renk ayarı yok)' : 'Önce / Sonra · basılı tutun'}
                  </button>

                  <div className="mt-auto flex flex-col gap-2 pt-8">
                    <button
                      type="button"
                      disabled={reloadingPhoto || !editing.photoUrl}
                      onClick={() => void reloadPhoto(editing)}
                      className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${reloadingPhoto ? 'animate-spin' : ''}`} /> Fotoğrafı yeniden yükle
                    </button>
                    <AdjustSaveActions
                      canSave={canSave}
                      dirty={dirty}
                      hasSaved={Boolean(settings[editing.key])}
                      onSave={saveDraft}
                      onResetScreen={() => {
                        setDraftAdjust(DEFAULT_GIRIS_ADJUST);
                        setDraftEffects(defaults);
                      }}
                      onDeleteSaved={async () => {
                        await removeSettings(editing.key);
                        setDraftAdjust(DEFAULT_GIRIS_ADJUST);
                        setDraftEffects(defaults);
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => void downloadPdfOne(editing, { adjust: draftAdjust, effects: draftEffects })}
                        className="z-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-50"
                      >
                        {busyKey === `pdf|${editing.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} PDF
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => void downloadPngOne(editing, { adjust: draftAdjust, effects: draftEffects })}
                        className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-50"
                      >
                        {busyKey === `png|${editing.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PNG
                      </button>
                    </div>
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
