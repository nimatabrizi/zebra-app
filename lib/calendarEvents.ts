import type { Appointment } from '../types/appointments';
import type {
  CalendarDayMarkers,
  CalendarEvent,
} from '../types/calendar';
import {
  appointmentNamesMatch,
  isConfirmedStatus,
  isPendingStatus,
  normalizeAppointmentStatus,
} from './appointmentUtils';
import { toTitleCaseName } from './formatName';

function isOwnAppointment(
  app: Appointment,
  opts?: { danismanIsmi?: string; currentUserId?: string }
): boolean {
  if (opts?.currentUserId && app.createdBy === opts.currentUserId) return true;
  if (opts?.danismanIsmi) {
    return appointmentNamesMatch(app.danismanIsmi, opts.danismanIsmi);
  }
  return false;
}

/** Map a randevu row → calendar event (Supabase-shaped) */
export function appointmentToCalendarEvent(
  app: Appointment,
  opts?: { isTeamInfo?: boolean }
): CalendarEvent | null {
  if (!app.tarih) return null;
  const status = normalizeAppointmentStatus(app.status);

  const isConfirmed = isConfirmedStatus(app.status);
  const isPending = isPendingStatus(app.status);
  const isCancelled = status === 'iptal';
  if (!isConfirmed && !isPending && !isCancelled) return null;
  // Takım bilgisi: aktif çekimler; iptal edilenler diğer danışmanlara gösterilmez.
  if (opts?.isTeamInfo && !isConfirmed && !isPending) return null;

  const place = [app.il, app.ilce, app.semt].filter(Boolean).join(' / ');
  const title = place || app.portfoyTuru || 'Çekim randevusu';

  return {
    id: `randevu-${app.id}`,
    sourceId: String(app.id),
    title,
    date: String(app.tarih),
    type: 'randevu',
    status: isConfirmed
      ? 'confirmed'
      : isPending
        ? 'pending'
        : 'cancelled',
    time: app.saatBlok || null,
    subtitle: [
      app.danismanIsmi ? `Danışman: ${toTitleCaseName(app.danismanIsmi)}` : null,
      app.portfoyTuru,
      app.pilot ? `Pilot: ${toTitleCaseName(app.pilot)}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    // Talep notları kişiseldir — diğer danışmanların takım görünümünde gizlenir.
    body: opts?.isTeamInfo
      ? null
      : app.danismanNotu || app.aciklama || null,
    isTeamInfo: opts?.isTeamInfo === true,
  };
}

export function buildCalendarEventsFromAppointments(
  appointments: Appointment[],
  opts?: { danismanIsmi?: string; currentUserId?: string; allTeam?: boolean }
): CalendarEvent[] {
  let list = appointments;
  if (!opts?.allTeam && (opts?.danismanIsmi || opts?.currentUserId)) {
    list = appointments.filter((a) => isOwnAppointment(a, opts));
  }

  return list
    .map((app) => appointmentToCalendarEvent(app))
    .filter((e): e is CalendarEvent => !!e);
}

/**
 * Diğer danışmanların aktif çekimleri — gün detayında bilgi;
 * gün kutusu noktalarına dahil edilmez.
 */
export function buildTeamInfoCalendarEvents(
  appointments: Appointment[],
  opts: { danismanIsmi?: string; currentUserId?: string }
): CalendarEvent[] {
  return appointments
    .filter((a) => !isOwnAppointment(a, opts))
    .map((app) => appointmentToCalendarEvent(app, { isTeamInfo: true }))
    .filter((e): e is CalendarEvent => !!e);
}

export function mergeCalendarEvents(
  appointments: CalendarEvent[],
  notes: CalendarEvent[]
): CalendarEvent[] {
  return [...appointments, ...notes].sort((a, b) => {
    const ta = a.time || '99:99';
    const tb = b.time || '99:99';
    if (ta !== tb) return ta.localeCompare(tb, 'tr');
    return a.title.localeCompare(b.title, 'tr');
  });
}

export function buildDayMarkers(
  events: CalendarEvent[]
): Record<string, CalendarDayMarkers> {
  const map: Record<string, CalendarDayMarkers> = {};
  for (const ev of events) {
    // Takım bilgisi gün kutusunda işaret üretmez
    if (ev.isTeamInfo) continue;
    if (!map[ev.date]) {
      map[ev.date] = {
        hasPending: false,
        hasConfirmed: false,
        hasCancelled: false,
        hasNote: false,
      };
    }
    if (ev.status === 'pending') map[ev.date].hasPending = true;
    if (ev.status === 'confirmed') map[ev.date].hasConfirmed = true;
    if (ev.status === 'cancelled') map[ev.date].hasCancelled = true;
    if (ev.status === 'note' || ev.type === 'note') map[ev.date].hasNote = true;
  }
  return map;
}

export function eventsForDate(
  events: CalendarEvent[],
  dateStr: string
): CalendarEvent[] {
  return events.filter((e) => e.date === dateStr);
}

export function formatLongDateTr(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function createNoteEvent(dateStr: string, title: string, body = ''): CalendarEvent {
  const now = new Date().toISOString();
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim() || 'Not',
    date: dateStr,
    type: 'note',
    status: 'note',
    time: null,
    subtitle: null,
    body: body.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}