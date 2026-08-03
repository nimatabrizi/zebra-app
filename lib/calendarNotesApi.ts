import { supabase } from '../supabaseClient';
import type { CalendarEvent } from '../types/calendar';

type NoteRow = {
  id: string;
  user_id: string;
  tarih: string;
  title: string;
  body: string | null;
  created_at?: string;
  updated_at?: string;
};

export function noteRowToEvent(row: NoteRow): CalendarEvent {
  return {
    id: String(row.id),
    title: row.title || 'Not',
    date: row.tarih,
    type: 'note',
    status: 'note',
    time: null,
    subtitle: null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchCalendarNotes(
  userId: string
): Promise<CalendarEvent[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('calendar_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Takvim notları yüklenemedi:', error.message);
    return [];
  }
  return (data || []).map((row) => noteRowToEvent(row as NoteRow));
}

export async function insertCalendarNote(
  userId: string,
  dateStr: string,
  title: string,
  body = ''
): Promise<CalendarEvent | null> {
  if (!userId || !dateStr) return null;
  const { data, error } = await supabase
    .from('calendar_notes')
    .insert({
      user_id: userId,
      tarih: dateStr,
      title: title.trim() || 'Not',
      body: body.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('Takvim notu eklenemedi:', error.message);
    return null;
  }
  return noteRowToEvent(data as NoteRow);
}

export async function updateCalendarNote(
  noteId: string,
  title: string,
  body: string
): Promise<CalendarEvent | null> {
  if (!noteId) return null;
  const { data, error } = await supabase
    .from('calendar_notes')
    .update({
      title: title.trim() || 'Not',
      body: body.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .select('*')
    .single();

  if (error) {
    console.warn('Takvim notu güncellenemedi:', error.message);
    return null;
  }
  return noteRowToEvent(data as NoteRow);
}

/** Eski localStorage notlarını bir kez DB'ye taşı (opsiyonel migrasyon) */
const NOTES_KEY_PREFIX = 'zebra_calendar_notes:';

export async function migrateLocalNotesToSupabase(userId: string) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(NOTES_KEY_PREFIX)
    );
    if (keys.length === 0) return;

    const collected: { tarih: string; title: string; body: string | null }[] =
      [];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const n of parsed) {
        if (n?.type === 'note' && n.date && n.title) {
          collected.push({
            tarih: String(n.date),
            title: String(n.title),
            body: n.body ? String(n.body) : null,
          });
        }
      }
    }
    if (collected.length === 0) {
      keys.forEach((k) => localStorage.removeItem(k));
      return;
    }

    const { error } = await supabase.from('calendar_notes').insert(
      collected.map((n) => ({
        user_id: userId,
        tarih: n.tarih,
        title: n.title,
        body: n.body,
      }))
    );
    if (!error) {
      keys.forEach((k) => localStorage.removeItem(k));
    }
  } catch (e) {
    console.warn('localStorage not migrasyonu atlandı:', e);
  }
}
