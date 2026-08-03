/** 09:00–18:00 arası 30 dakikalık çekim saat dilimleri (manuel giriş vb.) */

export const TIME_SLOT_OPTIONS: string[] = (() => {
  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes <= 18 * 60; minutes += 30) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
})();

/** Pilot teklifi: 2 saatlik aralık seçenekleri (09, 11, …, 19) */
export const OFFER_HOUR_OPTIONS: readonly number[] = [9, 11, 13, 15, 17, 19];

export function formatOfferHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Bitiş: başlangıçtan en az 2 saat sonra, 2 saat aralıkla */
export function getOfferEndHours(startHour: number): number[] {
  if (!Number.isFinite(startHour)) return [];
  return OFFER_HOUR_OPTIONS.filter((h) => h >= startHour + 2);
}

export function formatOfferRange(startHour: number, endHour: number): string {
  return `${formatOfferHour(startHour)}–${formatOfferHour(endHour)}`;
}

/** "09:00–13:00" | "09:00-13:00" | "09:00 - 13:00" → saatler */
export function parseOfferRange(
  saatBlok: string | null | undefined
): { start: number; end: number } | null {
  if (!saatBlok) return null;
  const m = String(saatBlok).trim().match(
    /^(\d{1,2}):(\d{2})\s*[–\-]\s*(\d{1,2}):(\d{2})$/
  );
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

/** Aralık veya tek saat (legacy "09:00" / "09:30") → sayısal [start, end) */
export function resolveSaatBlokRange(
  saatBlok: string | null | undefined
): { start: number; end: number } | null {
  const range = parseOfferRange(saatBlok);
  if (range) return range;
  if (!saatBlok) return null;
  const m = String(saatBlok).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const start =
    Number.parseInt(m[1], 10) + Number.parseInt(m[2], 10) / 60;
  if (!Number.isFinite(start)) return null;
  return { start, end: start + 0.5 };
}

/** Yarım açık aralık çakışması: [aStart, aEnd) ∩ [bStart, bEnd) */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
