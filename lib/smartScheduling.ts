/** Pilot teklif — akıllı planlama yardımcıları */

import type { Appointment, AppointmentStatus } from '../types/appointments';
import {
  isConfirmedStatus,
  normalizeAppointmentStatus,
  ownerRoleFromPilot,
} from './appointmentUtils';
import { resolveSaatBlokRange } from './timeSlots';

/** Günlük ajandada gösterilecek aktif statüler */
export const SMART_AGENDA_STATUSES: readonly AppointmentStatus[] = [
  'kesinlesti',
  'pilot_bekleniyor',
  'danisman_onayi_bekliyor',
] as const;

export function isSmartAgendaStatus(status: unknown): boolean {
  const n = normalizeAppointmentStatus(status);
  return (SMART_AGENDA_STATUSES as readonly string[]).includes(n);
}

function matchesPilot(
  app: Appointment,
  pilotName?: string | null
): boolean {
  if (!pilotName) return true;
  const a = String(app.pilot || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  const b = String(pilotName).trim().toLocaleLowerCase('tr-TR');
  if (a && b && a === b) return true;
  const roleA = app.ownerRole || ownerRoleFromPilot(app.pilot || '');
  const roleB = ownerRoleFromPilot(pilotName);
  return !!(roleA && roleB && roleA === roleB);
}

/** DD.MM.YYYY veya YYYY-MM-DD → karşılaştırma anahtarı (DD.MM.YYYY) */
function toDisplayDateKey(value: unknown): string {
  if (!value) return '';
  const raw = String(value).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}.${m}.${y}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}/.test(String(value))) {
    return String(value).trim().slice(0, 10);
  }
  return String(value).trim();
}

/** Seçili güne ait aktif randevular — saat sırası */
export function getDayAgenda(
  appointments: Appointment[],
  displayDate: string,
  pilotName?: string | null
): Appointment[] {
  if (!displayDate) return [];
  const dayKey = toDisplayDateKey(displayDate);
  return appointments
    .filter((app) => {
      if (!app.tarih) return false;
      if (toDisplayDateKey(app.tarih) !== dayKey) return false;
      const st = normalizeAppointmentStatus(app.status);
      // Kesinleşmiş + danışman kesinleştirmesi bekleyen (+ tarihli pilot bekleyen)
      if (
        st !== 'kesinlesti' &&
        st !== 'danisman_onayi_bekliyor' &&
        st !== 'pilot_bekleniyor'
      ) {
        return false;
      }
      return matchesPilot(app, pilotName);
    })
    .sort((a, b) => {
      const ta = a.saatBlok || '99:99';
      const tb = b.saatBlok || '99:99';
      return ta.localeCompare(tb) || Number(a.id) - Number(b.id);
    });
}

export type DayAvailability = {
  kind: 'free' | 'partial' | 'full';
  freeRanges: Array<{ start: number; end: number }>;
};

/**
 * 09:00–19:00 çalışma aralığında kesinleşmiş çekimlerden kalan boşluklar.
 * Çakışan veya bitişik çekimler önce birleştirilir.
 */
export function getDayAvailability(
  appointments: Appointment[],
  displayDate: string,
  pilotName?: string | null
): DayAvailability {
  const workStart = 9;
  const workEnd = 19;
  const busy = getDayAgenda(appointments, displayDate, pilotName)
    .filter((app) => isConfirmedStatus(app.status))
    .map((app) => resolveSaatBlokRange(app.saatBlok))
    .filter(
      (range): range is { start: number; end: number } =>
        Boolean(range && range.end > workStart && range.start < workEnd)
    )
    .map((range) => ({
      start: Math.max(workStart, range.start),
      end: Math.min(workEnd, range.end),
    }))
    .sort((a, b) => a.start - b.start);

  if (busy.length === 0) {
    return {
      kind: 'free',
      freeRanges: [{ start: workStart, end: workEnd }],
    };
  }

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of busy) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const freeRanges: Array<{ start: number; end: number }> = [];
  let cursor = workStart;
  for (const range of merged) {
    if (range.start > cursor) freeRanges.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < workEnd) freeRanges.push({ start: cursor, end: workEnd });

  return {
    kind: freeRanges.length === 0 ? 'full' : 'partial',
    freeRanges,
  };
}

/**
 * Aynı il/ilçede kesinleşmiş VEYA danışman kesinleştirmesi bekleyen çekimi olan günler.
 * Pilotun o bölgede zaten işi / teklifi olduğu günleri vurgulamak için.
 */
export function getSameDistrictConfirmedDates(
  appointments: Appointment[],
  il: string | null | undefined,
  ilce: string | null | undefined,
  pilotName?: string | null
): Set<string> {
  const set = new Set<string>();
  if (!ilce) return set;
  appointments.forEach((app) => {
    if (!app.tarih) return;
    const st = normalizeAppointmentStatus(app.status);
    const isRegionRelevant =
      isConfirmedStatus(app.status) || st === 'danisman_onayi_bekliyor';
    if (!isRegionRelevant) return;
    if (app.ilce !== ilce) return;
    if (il && app.il && app.il !== il) return;
    if (!matchesPilot(app, pilotName)) return;
    set.add(app.tarih);
  });
  return set;
}

/** Ay içindeki her gün için ajanda yoğunluğu (nokta göstergesi) */
export function getBusyDatesInMonth(
  appointments: Appointment[],
  month: number,
  year: number,
  pilotName?: string | null
): Set<string> {
  const set = new Set<string>();
  appointments.forEach((app) => {
    if (!app.tarih || !isSmartAgendaStatus(app.status)) return;
    if (!matchesPilot(app, pilotName)) return;
    const parts = String(app.tarih).split('.');
    if (parts.length !== 3) return;
    const d = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const y = Number(parts[2]);
    if (m === month && y === year && d >= 1) set.add(app.tarih);
  });
  return set;
}
