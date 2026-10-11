'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ImageOff, Loader2, Search, X } from 'lucide-react';

export type PeoplePickerItem = {
  key: string;
  label: string;
  meta?: string;
  count?: number;
  missingPhoto?: boolean;
};

type PeoplePickerProps = {
  label: string;
  noun: string;
  /** Items matching the current query/filters, in display order. */
  items: PeoplePickerItem[];
  /** Currently selected items (used for the summary and removable tags). */
  selectedItems: PeoplePickerItem[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (key: string) => void;
  onClear: () => void;
  onSelectVisible?: () => void;
  searchPlaceholder?: string;
  emptySelectionText?: string;
  emptyResultsText?: string;
  loading?: boolean;
  /** Extra controls rendered between the search field and the list (filters, actions). */
  toolbar?: React.ReactNode;
  /** True when `items` is narrowed by filters other than the search query. */
  filtered?: boolean;
};

const MAX_TAGS = 12;

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toLocaleUpperCase('tr-TR');
}

function Avatar({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--z-elevated)] font-semibold text-[var(--z-fg-soft)] ${
        size === 'sm' ? 'h-6 w-6 text-[9px] ring-2 ring-[var(--z-surface)]' : 'h-8 w-8 text-[11px]'
      }`}
    >
      {initials(label)}
    </span>
  );
}

export default function PeoplePicker({
  label,
  noun,
  items,
  selectedItems,
  query,
  onQueryChange,
  onToggle,
  onClear,
  onSelectVisible,
  searchPlaceholder = 'Ara',
  emptySelectionText,
  emptyResultsText = 'Eşleşen kişi yok.',
  loading = false,
  toolbar,
  filtered = false,
}: PeoplePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(selectedItems.map((item) => item.key));
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[role="dialog"]')) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const handleQueryChange = (value: string) => {
    setActiveIndex(0);
    onQueryChange(value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[active];
      if (item) onToggle(item.key);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  const summary = selectedItems.length
    ? `${selectedItems.length} ${noun} seçili`
    : emptySelectionText ?? `${noun.charAt(0).toLocaleUpperCase('tr-TR')}${noun.slice(1)} seçin`;

  const hiddenTagCount = Math.max(selectedItems.length - MAX_TAGS, 0);

  return (
    <div ref={rootRef} className="relative">
      <p className="z-label">{label}</p>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-3 rounded-2xl border bg-[var(--z-surface)] px-4 py-3 text-left transition-colors duration-200 ${
          open
            ? 'border-[var(--z-border-strong)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--z-fg)_6%,transparent)]'
            : 'border-[var(--z-border)] hover:border-[var(--z-border-strong)]'
        }`}
      >
        {selectedItems.length ? (
          <span className="flex shrink-0 -space-x-2">
            {selectedItems.slice(0, 4).map((item) => (
              <Avatar key={item.key} label={item.label} size="sm" />
            ))}
          </span>
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate text-[14px] ${
            selectedItems.length ? 'font-medium text-[var(--z-fg)]' : 'text-[var(--z-muted)]'
          }`}
        >
          {summary}
        </span>
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--z-muted)]" /> : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--z-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {selectedItems.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selectedItems.slice(0, MAX_TAGS).map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--z-elevated)] py-1 pl-3 pr-1 text-[12px] font-medium text-[var(--z-fg)]"
            >
              {item.label}
              <button
                type="button"
                aria-label={`${item.label} seçimini kaldır`}
                onClick={() => onToggle(item.key)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--z-muted)] hover:bg-[var(--z-hover-strong)] hover:text-[var(--z-fg)]"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          {hiddenTagCount ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--z-muted)] hover:text-[var(--z-fg)]"
            >
              +{hiddenTagCount} kişi
            </button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[70] bg-[var(--z-scrim)] sm:hidden"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[80dvh] flex-col overflow-hidden rounded-t-[1.75rem] border border-[var(--z-border)] bg-[var(--z-surface)] shadow-[var(--z-shadow-float)] sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:z-40 sm:mt-2 sm:max-h-[min(30rem,70vh)] sm:rounded-2xl"
          >
            <div className="border-b border-[var(--z-border)] p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--z-muted)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="z-field py-2.5 pl-10 pr-9 text-[14px]"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Aramayı temizle"
                    onClick={() => handleQueryChange('')}
                    className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--z-muted)] hover:bg-[var(--z-hover-strong)] hover:text-[var(--z-fg)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {toolbar ? <div className="mt-3">{toolbar}</div> : null}

              <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
                <span className="text-[var(--z-muted)]">
                  {items.length} {noun}
                  {selectedItems.length ? ` · ${selectedItems.length} seçili` : ''}
                </span>
                <span className="flex items-center gap-3">
                  {onSelectVisible && items.length ? (
                    <button
                      type="button"
                      onClick={onSelectVisible}
                      className="font-medium text-[var(--z-blue-text,#0a84ff)] hover:opacity-80"
                    >
                      Tümünü seç{query || filtered ? ' (görünen)' : ''}
                    </button>
                  ) : null}
                  {selectedItems.length ? (
                    <button
                      type="button"
                      onClick={onClear}
                      className="font-medium text-[var(--z-muted)] hover:text-[var(--z-fg)]"
                    >
                      Temizle
                    </button>
                  ) : null}
                </span>
              </div>
            </div>

            <div ref={listRef} role="listbox" aria-multiselectable className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--z-muted)]" />
                </div>
              ) : items.length ? (
                items.map((item, index) => {
                  const isSelected = selectedSet.has(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-index={index}
                      onClick={() => onToggle(item.key)}
                      onMouseMove={() => (index !== active ? setActiveIndex(index) : undefined)}
                      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 ${
                        index === active ? 'bg-[var(--z-hover)]' : ''
                      }`}
                    >
                      <Avatar label={item.label} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[14px] font-medium text-[var(--z-fg)]">
                          {item.label}
                          {item.missingPhoto ? (
                            <ImageOff className="h-3 w-3 shrink-0 text-[var(--z-muted)]" aria-label="Fotoğraf yok" />
                          ) : null}
                        </span>
                        {item.meta ? (
                          <span className="block truncate text-[12px] text-[var(--z-muted)]">{item.meta}</span>
                        ) : null}
                      </span>
                      {item.count !== undefined ? (
                        <span className="shrink-0 text-[12px] tabular-nums text-[var(--z-muted)]">{item.count}</span>
                      ) : null}
                      <span
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                          isSelected
                            ? 'border-transparent bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]'
                            : 'border-[var(--z-border-strong)]'
                        }`}
                      >
                        {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-8 text-center text-[13px] text-[var(--z-muted)]">{emptyResultsText}</p>
              )}
            </div>

            <div className="border-t border-[var(--z-border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="z-btn-primary w-full py-2.5 text-[14px]"
              >
                Tamam{selectedItems.length ? ` (${selectedItems.length})` : ''}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
