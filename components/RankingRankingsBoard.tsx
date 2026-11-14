'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import {
  RANK_CATEGORIES,
  listRankLines,
  replaceRankLine,
  withRebuiltSheets,
  type ParsedRankings,
  type RankCategoryId,
  type RankPeriodId,
} from '../lib/rankingVisuals';

type Props = {
  parsed: ParsedRankings;
  periodId: RankPeriodId;
  canEdit: boolean;
  onChange: (next: ParsedRankings) => void;
};

function RankLineEditor({
  rank,
  rawName,
  canEdit,
  onCommit,
  onDelete,
}: {
  rank: number;
  rawName: string;
  canEdit: boolean;
  onCommit: (rank: number, rawName: string) => void;
  onDelete: () => void;
}) {
  const [draftRank, setDraftRank] = useState(String(rank));
  const [draftName, setDraftName] = useState(rawName);

  React.useEffect(() => {
    setDraftRank(String(rank));
    setDraftName(rawName);
  }, [rank, rawName]);

  const commit = () => {
    const nextRank = Math.max(1, Math.min(99, Math.round(Number(draftRank)) || rank));
    const nextName = draftName.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (nextRank === rank && nextName === rawName) return;
    onCommit(nextRank, nextName);
  };

  return (
    <div className="group grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--z-border)] px-3 py-2.5 last:border-0 sm:gap-3 sm:px-4">
      <input
        type="number"
        min={1}
        max={99}
        disabled={!canEdit}
        value={draftRank}
        onChange={(e) => setDraftRank(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        className="z-field h-10 w-full px-2 text-center text-[14px] tabular-nums disabled:opacity-70"
        aria-label="Sıra"
      />
      <input
        type="text"
        disabled={!canEdit}
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="İsim / Takım  ·  , berabere  ·  & ortak"
        className="z-field h-10 w-full text-[14px] disabled:opacity-70"
        aria-label="İsim"
      />
      {canEdit ? (
        <button
          type="button"
          onClick={onDelete}
          className="z-btn-icon h-9 w-9 opacity-50 transition-opacity group-hover:opacity-100"
          aria-label="Satırı sil"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      ) : (
        <span className="w-9" />
      )}
    </div>
  );
}

export default function RankingRankingsBoard({
  parsed,
  periodId,
  canEdit,
  onChange,
}: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('tr-TR');

  const updateLine = (
    category: RankCategoryId,
    prevRank: number,
    prevRawName: string,
    nextRank: number,
    nextRawName: string
  ) => {
    let entries = parsed.entries;
    // Eski satırı kaldır
    entries = replaceRankLine(entries, periodId, category, prevRank, prevRawName, '');
    // Yeni satırı ekle (isim boşsa silinmiş say)
    if (nextRawName.trim()) {
      entries = replaceRankLine(entries, periodId, category, nextRank, null, nextRawName);
    }
    onChange(withRebuiltSheets(entries, parsed.warnings));
  };

  const addLine = (category: RankCategoryId) => {
    const lines = listRankLines(parsed.entries, periodId, category);
    const nextRank = lines.length ? Math.max(...lines.map((l) => l.rank)) + 1 : 1;
    onChange(
      withRebuiltSheets(
        replaceRankLine(parsed.entries, periodId, category, nextRank, null, 'Yeni satır'),
        parsed.warnings
      )
    );
  };

  const sections = useMemo(() => {
    return RANK_CATEGORIES.map((category) => {
      let lines = listRankLines(parsed.entries, periodId, category.id);
      if (q) {
        lines = lines.filter((line) =>
          line.rawName.toLocaleLowerCase('tr-TR').includes(q)
        );
      }
      return { category, lines };
    });
  }, [parsed.entries, periodId, q]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--z-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kişi veya takım ara…"
          className="z-field w-full pl-11 pr-4 text-[15px]"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map(({ category, lines }) => (
          <section
            key={category.id}
            className="overflow-hidden rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] shadow-[var(--z-shadow-soft)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--z-border)] px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold tracking-tight text-[var(--z-fg)]">
                  {category.short}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--z-muted)]">
                  {lines.length} satır
                  {canEdit ? ' · düzenlenebilir' : ''}
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => addLine(category.id)}
                  className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Satır
                </button>
              ) : null}
            </div>

            {!lines.length ? (
              <p className="px-4 py-10 text-center text-[13px] text-[var(--z-muted)] sm:px-5">
                {q ? 'Eşleşen satır yok.' : 'Bu kategoride satır yok.'}
              </p>
            ) : (
              <div>
                <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-2 border-b border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--z-muted)] sm:gap-3 sm:px-4">
                  <span className="text-center">Sıra</span>
                  <span>İsim / Takım</span>
                  <span className="w-9" />
                </div>
                {lines.map((line) => (
                  <RankLineEditor
                    key={`${category.id}|${line.rank}|${line.rawName}`}
                    rank={line.rank}
                    rawName={line.rawName}
                    canEdit={canEdit}
                    onCommit={(nextRank, nextName) =>
                      updateLine(category.id, line.rank, line.rawName, nextRank, nextName)
                    }
                    onDelete={() =>
                      updateLine(category.id, line.rank, line.rawName, line.rank, '')
                    }
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--z-muted)]">
        Virgül (,) berabere ayrı görseller; &amp; / - ortak çalışan (aynı görsel). Değişiklikler
        otomatik kaydedilir.
      </p>
    </div>
  );
}
