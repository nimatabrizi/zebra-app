/**
 * Aylık sıralama canvas hizalama grid’i.
 * 3 ayrı sistem kaydı (visual_adjustments / studio: siralama):
 *  - grid|award-single  → tek danışman Ödülünüz var
 *  - grid|rank-single   → tek danışman sıralama görseli
 *  - grid|award-team    → takım Ödülünüz var şeridi
 */

export type AlignGridKind = 'award-single' | 'rank-single' | 'award-team';

export type AlignGrid = {
  /** Dikey çizgi sayısı (0–12) */
  v: number;
  /** Yatay çizgi sayısı (0–12) */
  h: number;
};

export const DEFAULT_ALIGN_GRID: AlignGrid = { v: 0, h: 0 };

export const ALIGN_GRID_LINE_MAX = 12;

export const ALIGN_GRID_LABELS: Record<AlignGridKind, string> = {
  'award-single': 'Tek danışman · Ödülünüz var',
  'rank-single': 'Tek danışman · Sıralama',
  'award-team': 'Takım · Ödülünüz var',
};

export function alignGridKey(kind: AlignGridKind) {
  return `grid|${kind}`;
}

export function normalizeAlignGrid(raw: unknown): AlignGrid {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ALIGN_GRID };
  }
  const obj = raw as Record<string, unknown>;
  const clamp = (n: unknown) =>
    Math.max(0, Math.min(ALIGN_GRID_LINE_MAX, Math.round(Number(n) || 0)));
  return { v: clamp(obj.v), h: clamp(obj.h) };
}

export function sameAlignGrid(a: AlignGrid, b: AlignGrid) {
  return a.v === b.v && a.h === b.h;
}

/** Çeyrekte veya çift kişide grid yok; takım şeridi ayrı. */
export function resolveAlignGridKind(input: {
  periodKind: 'month' | 'quarter' | undefined;
  outputKind: 'award' | 'rank';
  isTeam?: boolean;
  peopleCount: number;
}): AlignGridKind | null {
  if (input.periodKind !== 'month') return null;
  if (input.isTeam) return 'award-team';
  if (input.peopleCount !== 1) return null;
  return input.outputKind === 'award' ? 'award-single' : 'rank-single';
}
