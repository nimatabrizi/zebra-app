import type { CalendarEvent } from '../types/calendar';

const NOTES_KEY_PREFIX = 'zebra_calendar_notes:';

function storageKey(userKey: string) {
  return `${NOTES_KEY_PREFIX}${userKey}`;
}

function parseNotes(raw: string | null): CalendarEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => n && n.type === 'note' && n.date && n.id);
  } catch {
    return [];
  }
}

/** Primary + fallback anahtarlarından oku; ilk dolu sonucu döner */
export function loadNotesFromStorage(
  userKey: string,
  fallbackKeys: string[] = []
): CalendarEvent[] {
  if (typeof window === 'undefined') return [];
  const keys = [...new Set([userKey, ...fallbackKeys].filter(Boolean))];
  for (const key of keys) {
    const notes = parseNotes(localStorage.getItem(storageKey(key)));
    if (notes.length > 0) return notes;
  }
  // Hiçbiri dolu değilse primary'nin (boş) halini dene
  if (userKey) return parseNotes(localStorage.getItem(storageKey(userKey)));
  return [];
}

export function saveNotesToStorage(userKey: string, notes: CalendarEvent[]) {
  if (typeof window === 'undefined' || !userKey) return;
  try {
    localStorage.setItem(
      storageKey(userKey),
      JSON.stringify(notes.filter((n) => n.type === 'note'))
    );
  } catch {
    /* ignore quota */
  }
}

/** Eski anahtarlardaki notları primary'ye taşı */
export function migrateNotesToPrimary(
  primaryKey: string,
  fallbackKeys: string[]
) {
  if (typeof window === 'undefined' || !primaryKey) return;
  const primary = parseNotes(localStorage.getItem(storageKey(primaryKey)));
  if (primary.length > 0) return;

  for (const key of fallbackKeys) {
    if (!key || key === primaryKey) continue;
    const notes = parseNotes(localStorage.getItem(storageKey(key)));
    if (notes.length > 0) {
      saveNotesToStorage(primaryKey, notes);
      return;
    }
  }
}
