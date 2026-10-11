'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { matchNameList, type MatchStatus, type NameMatch } from '../lib/girisNameMatch';

export type PasteListPerson = { key: string; name: string; displayName: string };

const MATCH_STYLES: Record<MatchStatus, { label: string; className: string }> = {
  found: { label: 'Bulundu', className: 'bg-emerald-500/15 text-emerald-400' },
  near: { label: 'Yakın eşleşme', className: 'bg-amber-400/15 text-amber-300' },
  ambiguous: { label: 'Birden fazla aday', className: 'bg-orange-500/15 text-orange-400' },
  missing: { label: 'Bulunamadı', className: 'bg-red-500/15 text-red-400' },
};

function initialChoice(match: NameMatch) {
  if (match.duplicate) return '';
  return match.status === 'found' || match.status === 'near' ? match.candidates[0]!.key : '';
}

/** Yapıştırılan isim listesini kişilerle eşleştirip seçim yaptıran pencere. */
export default function PasteListModal({
  people,
  storageKey,
  kicker,
  onApply,
  onClose,
}: {
  people: PasteListPerson[];
  /** Son yapıştırılan metnin saklandığı localStorage anahtarı */
  storageKey: string;
  kicker: string;
  onApply: (keys: string[], mode: 'add' | 'replace') => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });
  const [results, setResults] = useState<NameMatch[] | null>(null);
  const [choices, setChoices] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, text);
    } catch {
      /* kota dolu olabilir */
    }
  }, [storageKey, text]);

  const displayName = useMemo(() => new Map(people.map((p) => [p.key, p.displayName])), [people]);

  const runMatch = () => {
    const next = matchNameList(text, people.map((p) => ({ key: p.key, name: p.name })));
    setResults(next);
    setChoices(next.map(initialChoice));
  };

  const setChoice = (index: number, key: string) =>
    setChoices((current) => current.map((value, i) => (i === index ? key : value)));

  const chosenKeys = Array.from(new Set(choices.filter(Boolean)));
  const count = (status: MatchStatus) => results?.filter((r) => r.status === status).length || 0;

  const apply = (mode: 'add' | 'replace') => {
    onApply(chosenKeys, mode);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="z-modal zebra-sheet-enter flex max-h-[90vh] w-full max-w-2xl flex-col p-5 sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="z-page-kicker">{kicker}</p>
            <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">Listeden seç</p>
            <p className="mt-1 text-[12px] text-[var(--z-muted)]">
              İsim listesini size geldiği gibi yapıştırın; satır, sekme veya virgülle ayrılmış olabilir.
            </p>
          </div>
          <button type="button" onClick={onClose} className="z-btn-icon h-9 w-9" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResults(null);
          }}
          rows={results ? 4 : 10}
          placeholder={'DEVRİM ŞEN\nHAZAL ULUSOY\n…'}
          className="z-field mt-5 w-full resize-y px-4 py-3 font-mono text-[13px] leading-relaxed"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={runMatch}
            disabled={!text.trim()}
            className="z-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[13px] disabled:opacity-40"
          >
            <Search className="h-3.5 w-3.5" /> Eşleştir
          </button>
        </div>

        {results ? (
          <>
            <p className="mt-5 text-[12px] text-[var(--z-muted)]">
              {results.length} satır · {count('found')} bulundu · {count('near')} yakın
              {count('ambiguous') ? ` · ${count('ambiguous')} birden fazla aday` : ''} · {count('missing')} bulunamadı
            </p>
            <ul className="mt-3 min-h-0 flex-1 divide-y divide-[var(--z-border)] overflow-y-auto rounded-2xl border border-[var(--z-border)]">
              {results.map((match, index) => {
                const style = MATCH_STYLES[match.status];
                const single = match.candidates.length === 1 ? match.candidates[0]! : null;
                return (
                  <li key={`${index}-${match.line}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                    {single && !match.duplicate ? (
                      <input
                        type="checkbox"
                        checked={choices[index] === single.key}
                        onChange={(event) => setChoice(index, event.target.checked ? single.key : '')}
                        className="accent-[var(--z-fg)]"
                        aria-label={`${match.line} seç`}
                      />
                    ) : (
                      <span className="w-[13px]" />
                    )}
                    <span className="min-w-0 flex-1 text-[var(--z-fg)]">
                      {match.line}
                      {single && match.status === 'near' ? (
                        <span className="text-[var(--z-muted)]"> → {displayName.get(single.key)}</span>
                      ) : null}
                    </span>
                    {match.status === 'ambiguous' ? (
                      <select
                        value={choices[index] || ''}
                        onChange={(event) => setChoice(index, event.target.value)}
                        className="z-field px-3 py-1.5 text-[12px]"
                      >
                        <option value="">Seçme</option>
                        {match.candidates.map((c) => (
                          <option key={c.key} value={c.key}>
                            {displayName.get(c.key) || c.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {match.duplicate ? (
                      <span className="rounded-full bg-[var(--z-border)] px-2 py-0.5 text-[11px] text-[var(--z-muted)]">
                        Tekrar
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}>
                      {style.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-[12px] text-[var(--z-muted)]">{chosenKeys.length} kişi seçilecek</span>
              <button
                type="button"
                disabled={!chosenKeys.length}
                onClick={() => apply('add')}
                className="z-btn-ghost px-5 py-2.5 text-[13px] disabled:opacity-40"
              >
                Seçime ekle
              </button>
              <button
                type="button"
                disabled={!chosenKeys.length}
                onClick={() => apply('replace')}
                className="z-btn-primary px-5 py-2.5 text-[13px] disabled:opacity-40"
              >
                Seçimi bununla değiştir
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
