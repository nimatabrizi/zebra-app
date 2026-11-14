/**
 * Sunum canvas serbest hizalama grid’i.
 * Sadece studio önizlemesinde çizilir — PNG/PDF çıktısına asla basılmaz.
 * Kayıt: visual_adjustments / studio: siralama / shared|sunum|free-grid
 */

export type PresentationFreeGrid = {
  /** Dikey çizgiler: canvas genişliğine oran (0–1) */
  vertical: number[];
  /** Yatay çizgiler: canvas yüksekliğine oran (0–1) */
  horizontal: number[];
};

export const PRESENTATION_FREE_GRID_KEY = 'shared|sunum|free-grid';

export const DEFAULT_PRESENTATION_FREE_GRID: PresentationFreeGrid = {
  vertical: [],
  horizontal: [],
};

export const PRESENTATION_FREE_GRID_LINE_MAX = 24;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(0.98, Math.max(0.02, n));
}

function normalizeAxis(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isFinite(n)) continue;
    out.push(clamp01(n));
    if (out.length >= PRESENTATION_FREE_GRID_LINE_MAX) break;
  }
  return out.sort((a, b) => a - b);
}

export function normalizePresentationFreeGrid(raw: unknown): PresentationFreeGrid {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_PRESENTATION_FREE_GRID, vertical: [], horizontal: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    vertical: normalizeAxis(obj.vertical),
    horizontal: normalizeAxis(obj.horizontal),
  };
}

export function samePresentationFreeGrid(a: PresentationFreeGrid, b: PresentationFreeGrid) {
  return (
    a.vertical.length === b.vertical.length &&
    a.horizontal.length === b.horizontal.length &&
    a.vertical.every((v, i) => Math.abs(v - (b.vertical[i] ?? 0)) < 1e-6) &&
    a.horizontal.every((v, i) => Math.abs(v - (b.horizontal[i] ?? 0)) < 1e-6)
  );
}

export type FreeGridAxis = 'vertical' | 'horizontal';

export function addFreeGridLine(
  grid: PresentationFreeGrid,
  axis: FreeGridAxis,
  at = 0.5
): PresentationFreeGrid {
  const key = axis === 'vertical' ? 'vertical' : 'horizontal';
  if (grid[key].length >= PRESENTATION_FREE_GRID_LINE_MAX) return grid;
  const next = [...grid[key], clamp01(at)].sort((a, b) => a - b);
  return { ...grid, [key]: next };
}

export function removeFreeGridLine(
  grid: PresentationFreeGrid,
  axis: FreeGridAxis,
  index: number
): PresentationFreeGrid {
  const key = axis === 'vertical' ? 'vertical' : 'horizontal';
  if (index < 0 || index >= grid[key].length) return grid;
  return { ...grid, [key]: grid[key].filter((_, i) => i !== index) };
}

export function moveFreeGridLine(
  grid: PresentationFreeGrid,
  axis: FreeGridAxis,
  index: number,
  position: number
): PresentationFreeGrid {
  const key = axis === 'vertical' ? 'vertical' : 'horizontal';
  if (index < 0 || index >= grid[key].length) return grid;
  const next = grid[key].map((v, i) => (i === index ? clamp01(position) : v));
  // Sıralamayı korumak yerine indeksi sabit tut (sürüklerken satır zıplamasın)
  return { ...grid, [key]: next };
}
