'use client';

import React from 'react';
import {
  ALIGN_GRID_LABELS,
  ALIGN_GRID_LINE_MAX,
  type AlignGrid,
  type AlignGridKind,
} from '../lib/rankingAlignGrid';

/** Önizleme üstünde hizalama çizgileri (PNG’ye çizilmez) */
export function AlignGridOverlay({ grid }: { grid: AlignGrid }) {
  if (!grid.v && !grid.h) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
      {Array.from({ length: grid.v }, (_, i) => (
        <div
          key={`v-${i}`}
          className="absolute top-0 bottom-0 w-px bg-[#5eead4]/55"
          style={{ left: `${((i + 1) / (grid.v + 1)) * 100}%` }}
        />
      ))}
      {Array.from({ length: grid.h }, (_, i) => (
        <div
          key={`h-${i}`}
          className="absolute left-0 right-0 h-px bg-[#5eead4]/55"
          style={{ top: `${((i + 1) / (grid.h + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function AlignGridControls({
  kind,
  grid,
  canSave,
  dirty,
  hasSaved,
  onChange,
  onSave,
  onReset,
}: {
  kind: AlignGridKind;
  grid: AlignGrid;
  canSave: boolean;
  dirty: boolean;
  hasSaved: boolean;
  onChange: (patch: Partial<AlignGrid>) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-6 border-t border-[var(--z-border)] pt-5">
      <p className="text-[12px] font-medium text-[var(--z-fg)]">Hizalama grid’i</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--z-muted)]">
        {ALIGN_GRID_LABELS[kind]} · tüm aylık canvas’larda ortak · sistem kaydı
      </p>
      <label className="mt-3 block">
        <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
          <span>Dikey çizgi</span>
          <span className="tabular-nums text-[var(--z-fg)]">{grid.v}</span>
        </span>
        <input
          type="range"
          min={0}
          max={ALIGN_GRID_LINE_MAX}
          step={1}
          value={grid.v}
          onChange={(e) => onChange({ v: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--z-fg)]"
        />
      </label>
      <label className="mt-3 block">
        <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
          <span>Yatay çizgi</span>
          <span className="tabular-nums text-[var(--z-fg)]">{grid.h}</span>
        </span>
        <input
          type="range"
          min={0}
          max={ALIGN_GRID_LINE_MAX}
          step={1}
          value={grid.h}
          onChange={(e) => onChange({ h: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--z-fg)]"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSave || !dirty}
          onClick={onSave}
          className="z-btn-ghost px-3 py-1.5 text-[12px] disabled:opacity-40"
        >
          Grid’i kaydet
        </button>
        <button
          type="button"
          onClick={onReset}
          className="z-btn-ghost px-3 py-1.5 text-[12px]"
        >
          Sıfırla
        </button>
        {hasSaved ? (
          <span className="self-center text-[10px] text-[var(--z-muted)]">Kayıtlı</span>
        ) : null}
      </div>
    </div>
  );
}
