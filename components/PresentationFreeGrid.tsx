'use client';

import React, { useRef, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  PRESENTATION_FREE_GRID_LINE_MAX,
  addFreeGridLine,
  moveFreeGridLine,
  removeFreeGridLine,
  type FreeGridAxis,
  type PresentationFreeGrid,
} from '../lib/presentationFreeGrid';
import { AdjustSaveActions } from './AdjustSaveControls';

export type FreeGridSelection = { axis: FreeGridAxis; index: number } | null;

/**
 * Önizleme üstünde sürüklenen hizalama çizgileri.
 * PNG/PDF render’a dahil edilmez — yalnızca DOM overlay.
 */
export function PresentationFreeGridOverlay({
  grid,
  visible,
  selected,
  onSelect,
  onMove,
}: {
  grid: PresentationFreeGrid;
  visible: boolean;
  selected: FreeGridSelection;
  onSelect: (sel: FreeGridSelection) => void;
  onMove: (axis: FreeGridAxis, index: number, position: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    axis: FreeGridAxis;
    index: number;
    pointerId: number;
  } | null>(null);

  if (!visible) return null;

  const positionFromEvent = (axis: FreeGridAxis, clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return 0.5;
    const rect = el.getBoundingClientRect();
    if (axis === 'vertical') {
      return (clientX - rect.left) / Math.max(1, rect.width);
    }
    return (clientY - rect.top) / Math.max(1, rect.height);
  };

  const onPointerDown = (
    event: React.PointerEvent,
    axis: FreeGridAxis,
    index: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { axis, index, pointerId: event.pointerId };
    onSelect({ axis, index });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    onMove(drag.axis, drag.index, positionFromEvent(drag.axis, event.clientX, event.clientY));
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[6]">
      {grid.vertical.map((x, index) => {
        const active = selected?.axis === 'vertical' && selected.index === index;
        return (
          <div
            key={`v-${index}`}
            role="presentation"
            onPointerDown={(e) => onPointerDown(e, 'vertical', index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`pointer-events-auto absolute top-0 bottom-0 z-[7] w-3 -translate-x-1/2 cursor-ew-resize ${
              active ? 'bg-[#5eead4]/25' : 'hover:bg-[#5eead4]/12'
            }`}
            style={{ left: `${x * 100}%` }}
            title={`Dikey ${(x * 100).toFixed(1)}%`}
          >
            <div
              className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${
                active ? 'bg-[#5eead4]' : 'bg-[#5eead4]/70'
              }`}
            />
          </div>
        );
      })}
      {grid.horizontal.map((y, index) => {
        const active = selected?.axis === 'horizontal' && selected.index === index;
        return (
          <div
            key={`h-${index}`}
            role="presentation"
            onPointerDown={(e) => onPointerDown(e, 'horizontal', index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`pointer-events-auto absolute left-0 right-0 z-[7] h-3 -translate-y-1/2 cursor-ns-resize ${
              active ? 'bg-[#5eead4]/25' : 'hover:bg-[#5eead4]/12'
            }`}
            style={{ top: `${y * 100}%` }}
            title={`Yatay ${(y * 100).toFixed(1)}%`}
          >
            <div
              className={`pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${
                active ? 'bg-[#5eead4]' : 'bg-[#5eead4]/70'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PresentationFreeGridControls({
  grid,
  visible,
  selected,
  canSave,
  dirty,
  hasSaved,
  onVisibleChange,
  onChange,
  onSelect,
  onSave,
  onResetScreen,
  onDeleteSaved,
}: {
  grid: PresentationFreeGrid;
  visible: boolean;
  selected: FreeGridSelection;
  canSave: boolean;
  dirty: boolean;
  hasSaved: boolean;
  onVisibleChange: (v: boolean) => void;
  onChange: (next: PresentationFreeGrid) => void;
  onSelect: (sel: FreeGridSelection) => void;
  onSave: () => Promise<void>;
  onResetScreen: () => void;
  onDeleteSaved: () => Promise<void>;
}) {
  const [newAt, setNewAt] = useState(50);

  const add = (axis: FreeGridAxis) => {
    const next = addFreeGridLine(grid, axis, newAt / 100);
    onChange(next);
    const list = axis === 'vertical' ? next.vertical : next.horizontal;
    // Yeni eklenen konuma en yakın indeksi seç
    let best = list.length - 1;
    let bestD = Infinity;
    list.forEach((p, i) => {
      const d = Math.abs(p - newAt / 100);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    onSelect({ axis, index: best });
  };

  const removeSelected = () => {
    if (!selected) return;
    onChange(removeFreeGridLine(grid, selected.axis, selected.index));
    onSelect(null);
  };

  return (
    <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.8} />
          Hizalama grid’i
          <span className="font-normal text-[var(--z-muted)]">· PNG’ye çizilmez</span>
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--z-muted)]">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => onVisibleChange(e.target.checked)}
            className="accent-[var(--z-fg)]"
          />
          Göster
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--z-muted)]">
        İstediğin kadar yatay/dikey çizgi ekle, sürükleyerek yerleştir, kaydet. Tüm sunum
        önizlemelerinde ortak.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[var(--z-muted)]">
          Ekleme konumu %
          <input
            type="number"
            min={2}
            max={98}
            value={newAt}
            onChange={(e) => setNewAt(Math.min(98, Math.max(2, Number(e.target.value) || 50)))}
            className="z-field mt-1 w-20 px-2 py-1 text-[12px]"
          />
        </label>
        <button
          type="button"
          onClick={() => add('vertical')}
          disabled={grid.vertical.length >= PRESENTATION_FREE_GRID_LINE_MAX}
          className="z-btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Dikey
        </button>
        <button
          type="button"
          onClick={() => add('horizontal')}
          disabled={grid.horizontal.length >= PRESENTATION_FREE_GRID_LINE_MAX}
          className="z-btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Yatay
        </button>
        <button
          type="button"
          onClick={removeSelected}
          disabled={!selected}
          className="z-btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[var(--z-danger)] disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Seçiliyi sil
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <LineList
          label={`Dikey (${grid.vertical.length})`}
          axis="vertical"
          values={grid.vertical}
          selected={selected}
          onSelect={onSelect}
          onMove={(index, pos) => onChange(moveFreeGridLine(grid, 'vertical', index, pos))}
        />
        <LineList
          label={`Yatay (${grid.horizontal.length})`}
          axis="horizontal"
          values={grid.horizontal}
          selected={selected}
          onSelect={onSelect}
          onMove={(index, pos) => onChange(moveFreeGridLine(grid, 'horizontal', index, pos))}
        />
      </div>

      <div className="mt-3">
        <AdjustSaveActions
          canSave={canSave}
          dirty={dirty}
          hasSaved={hasSaved}
          onSave={onSave}
          onResetScreen={onResetScreen}
          onDeleteSaved={onDeleteSaved}
          resetLabel="Grid’i sıfırla"
        />
      </div>
    </div>
  );
}

function LineList({
  label,
  axis,
  values,
  selected,
  onSelect,
  onMove,
}: {
  label: string;
  axis: FreeGridAxis;
  values: number[];
  selected: FreeGridSelection;
  onSelect: (sel: FreeGridSelection) => void;
  onMove: (index: number, pos: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[var(--z-muted)]">{label}</p>
      {!values.length ? (
        <p className="mt-1 text-[11px] text-[var(--z-muted)]">Çizgi yok</p>
      ) : (
        <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
          {values.map((v, index) => {
            const active = selected?.axis === axis && selected.index === index;
            return (
              <li key={`${axis}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect({ axis, index })}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] ${
                    active
                      ? 'bg-[color-mix(in_srgb,var(--z-fg)_10%,transparent)] text-[var(--z-fg)]'
                      : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                  }`}
                >
                  <span className="w-6 tabular-nums">{index + 1}.</span>
                  <input
                    type="range"
                    min={2}
                    max={98}
                    step={0.5}
                    value={+(v * 100).toFixed(1)}
                    onChange={(e) => onMove(index, Number(e.target.value) / 100)}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 accent-[var(--z-fg)]"
                  />
                  <span className="w-12 tabular-nums text-right">{(v * 100).toFixed(1)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
