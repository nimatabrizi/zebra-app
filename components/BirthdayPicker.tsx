'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cake, Check, ImageOff, Loader2, Search, X } from 'lucide-react';

export type BirthdayPickerPerson = {
  key: string;
  label: string;
  title?: string;
  month?: number | null;
  day?: number | null;
  missingPhoto?: boolean;
};

type BirthdayPickerProps = {
  people: BirthdayPickerPerson[];
  selectedKeys: string[];
  onAdd: (keys: string[]) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  loading?: boolean;
};

type Option =
  | { type: 'month'; month: number; keys: string[] }
  | { type: 'person'; person: BirthdayPickerPerson };

export const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const MAX_NAME_SUGGESTIONS = 8;

/** Lowercases with Turkish rules and strips diacritics so "EKİM", "ekım" and "ekim" compare equal. */
function fold(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const FOLDED_MONTHS = TR_MONTHS.map(fold);

function matchMonth(raw: string): number | null {
  const value = fold(raw);
  if (!value) return null;
  const numeric = value.match(/^(\d{1,2})\s*\.?\s*(ay)?\.?$/);
  if (numeric) {
    const n = Number(numeric[1]);
    return n >= 1 && n <= 12 ? n : null;
  }
  if (value.length < 3) return null;
  const index = FOLDED_MONTHS.findIndex((month) => month.startsWith(value));
  return index === -1 ? null : index + 1;
}

function formatBirthday(person: BirthdayPickerPerson) {
  return person.month && person.day ? `${person.day} ${TR_MONTHS[person.month - 1]}` : '';
}

function byDay(a: BirthdayPickerPerson, b: BirthdayPickerPerson) {
  return (a.day ?? 0) - (b.day ?? 0) || a.label.localeCompare(b.label, 'tr');
}

export default function BirthdayPicker({
  people,
  selectedKeys,
  onAdd,
  onRemove,
  onClear,
  loading = false,
}: BirthdayPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [today] = useState(() => new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people]);
  const selectedPeople = selectedKeys
    .map((key) => byKey.get(key))
    .filter(Boolean) as BirthdayPickerPerson[];

  const shortcuts = useMemo(() => {
    const thisMonth = today.getMonth() + 1;
    const nextMonth = (thisMonth % 12) + 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekDays = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return `${d.getMonth() + 1}-${d.getDate()}`;
      })
    );
    const inMonth = (month: number) => people.filter((p) => p.month === month).map((p) => p.key);
    return [
      { id: 'this-month', label: `Bu ay (${TR_MONTHS[thisMonth - 1]})`, keys: inMonth(thisMonth) },
      { id: 'next-month', label: `Gelecek ay (${TR_MONTHS[nextMonth - 1]})`, keys: inMonth(nextMonth) },
      {
        id: 'this-week',
        label: 'Bu hafta',
        keys: people.filter((p) => p.month && p.day && weekDays.has(`${p.month}-${p.day}`)).map((p) => p.key),
      },
    ];
  }, [people, today]);

  const options = useMemo<Option[]>(() => {
    const needle = fold(query);
    if (!needle) return [];
    const result: Option[] = [];
    const shown = new Set<string>();

    const month = matchMonth(query);
    if (month) {
      const monthPeople = people.filter((p) => p.month === month).sort(byDay);
      result.push({ type: 'month', month, keys: monthPeople.map((p) => p.key) });
      for (const person of monthPeople) {
        result.push({ type: 'person', person });
        shown.add(person.key);
      }
    }

    const nameMatches = people
      .filter((p) => !shown.has(p.key) && fold(p.label).includes(needle))
      .sort((a, b) => {
        const aStarts = fold(a.label).split(/\s+/).some((w) => w.startsWith(needle)) ? 0 : 1;
        const bStarts = fold(b.label).split(/\s+/).some((w) => w.startsWith(needle)) ? 0 : 1;
        return aStarts - bStarts || a.label.localeCompare(b.label, 'tr');
      })
      .slice(0, MAX_NAME_SUGGESTIONS);
    for (const person of nameMatches) result.push({ type: 'person', person });
    return result;
  }, [people, query]);

  const active = Math.min(activeIndex, Math.max(options.length - 1, 0));
  const showSuggestions = open && Boolean(query.trim());

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!showSuggestions) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, showSuggestions]);

  const resetQuery = () => {
    setQuery('');
    setActiveIndex(0);
  };

  const keepInputFocus = (event: React.MouseEvent) => event.preventDefault();

  const choose = (option: Option) => {
    if (option.type === 'month') {
      onAdd(option.keys);
      resetQuery();
      return;
    }
    if (selectedSet.has(option.person.key)) onRemove(option.person.key);
    else onAdd([option.person.key]);
    resetQuery();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.min(active + 1, options.length - 1));
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      if (query) setQuery('');
      else setOpen(false);
    } else if (event.key === 'Backspace' && !query && selectedKeys.length) {
      onRemove(selectedKeys[selectedKeys.length - 1]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="z-label mb-0">
          Danışmanlar{selectedKeys.length ? ` · ${selectedKeys.length} seçili` : ''}
        </p>
        {selectedKeys.length ? (
          <button
            type="button"
            onClick={onClear}
            className="py-1 text-[13px] font-medium text-[var(--z-muted)] hover:text-[var(--z-fg)] sm:text-[12px]"
          >
            Temizle
          </button>
        ) : null}
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-[52px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-2xl border bg-[var(--z-surface)] px-3 py-2 transition-colors duration-200 ${
          showSuggestions
            ? 'border-[var(--z-border-strong)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--z-fg)_6%,transparent)]'
            : 'border-[var(--z-border)] hover:border-[var(--z-border-strong)]'
        }`}
      >
        <Search className="mx-1 h-4 w-4 shrink-0 text-[var(--z-muted)]" />
        {selectedPeople.map((person) => (
          <span
            key={person.key}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--z-elevated)] py-1 pl-3 pr-1 text-[13px] font-medium text-[var(--z-fg)]"
          >
            {person.label}
            <button
              type="button"
              aria-label={`${person.label} seçimini kaldır`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(person.key);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--z-muted)] hover:bg-[var(--z-hover-strong)] hover:text-[var(--z-fg)] sm:h-5 sm:w-5"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedKeys.length ? 'Başka danışman ya da ay ekle' : 'İsim ya da ay yazın (ör. Ekim)'}
          aria-label="Danışman ya da ay ara"
          className="min-w-[10rem] flex-1 bg-transparent py-1.5 text-[16px] text-[var(--z-fg)] outline-none placeholder:text-[var(--z-muted)] sm:text-[14px]"
        />
        {loading ? <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin text-[var(--z-muted)]" /> : null}
      </div>

      {!query.trim() ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {shortcuts.map((shortcut) => {
            const allSelected = shortcut.keys.length > 0 && shortcut.keys.every((key) => selectedSet.has(key));
            return (
              <button
                key={shortcut.id}
                type="button"
                disabled={!shortcut.keys.length || allSelected}
                onClick={() => onAdd(shortcut.keys)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--z-border)] bg-[var(--z-surface)] px-3.5 py-2 text-[13px] font-medium text-[var(--z-fg)] transition-colors hover:border-[var(--z-border-strong)] disabled:cursor-default disabled:opacity-45 sm:py-1.5 sm:text-[12px]"
              >
                {allSelected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Cake className="h-3.5 w-3.5" />}
                {shortcut.label}
                <span className="tabular-nums text-[var(--z-muted)]">{shortcut.keys.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {showSuggestions ? (
        <div
          ref={listRef}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--z-border)] bg-[var(--z-surface)] p-1.5 shadow-[var(--z-shadow-float)]"
        >
          {options.length ? (
            options.map((option, index) => {
              const highlighted = index === active;
              const rowClass = `flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:bg-[var(--z-hover-strong)] sm:min-h-[44px] ${
                highlighted ? 'bg-[var(--z-hover)]' : ''
              }`;

              if (option.type === 'month') {
                const monthName = TR_MONTHS[option.month - 1];
                const pending = option.keys.filter((key) => !selectedSet.has(key)).length;
                return (
                  <button
                    key={`month-${option.month}`}
                    type="button"
                    data-index={index}
                    disabled={!option.keys.length}
                    onMouseDown={keepInputFocus}
                    onMouseMove={highlighted ? undefined : () => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={`${rowClass} mb-1 disabled:opacity-50`}
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]">
                      <Cake className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-[var(--z-fg)] sm:text-[14px]">
                        {monthName} doğumlular
                      </span>
                      <span className="block text-[12px] text-[var(--z-muted)]">
                        {option.keys.length
                          ? `${option.keys.length} kişi${pending < option.keys.length ? ` · ${option.keys.length - pending} zaten seçili` : ''}`
                          : 'Bu ayda doğum günü kayıtlı kişi yok'}
                      </span>
                    </span>
                    {option.keys.length ? (
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--z-blue-text,#0a84ff)]">
                        {pending ? 'Tümünü ekle' : 'Eklendi'}
                      </span>
                    ) : null}
                  </button>
                );
              }

              const { person } = option;
              const isSelected = selectedSet.has(person.key);
              const meta = [formatBirthday(person), person.title].filter(Boolean).join(' · ');
              return (
                <button
                  key={person.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onMouseDown={keepInputFocus}
                  onMouseMove={highlighted ? undefined : () => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={rowClass}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-[15px] font-medium text-[var(--z-fg)] sm:text-[14px]">
                      {person.label}
                      {person.missingPhoto ? (
                        <ImageOff className="h-3 w-3 shrink-0 text-[var(--z-muted)]" aria-label="Fotoğraf yok" />
                      ) : null}
                    </span>
                    {meta ? <span className="block truncate text-[12px] text-[var(--z-muted)]">{meta}</span> : null}
                  </span>
                  <span
                    className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
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
            <p className="px-3 py-6 text-center text-[13px] text-[var(--z-muted)]">
              Eşleşen danışman ya da ay yok.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
