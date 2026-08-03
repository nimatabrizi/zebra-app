/** Pilot teklif saat aralığı çakışma kontrolleri */

import type { Appointment } from '../types/appointments';
import {
  normalizeAppointmentStatus,
  ownerRoleFromPilot,
  toDisplayDate,
} from './appointmentUtils';
import { rangesOverlap, resolveSaatBlokRange } from './timeSlots';

export type OfferConflictKind = 'confirmed' | 'pending';

export type OfferConflict = {
  appointment: Appointment;
  kind: OfferConflictKind;
};

function isSamePilot(
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

function sameDay(a: unknown, b: unknown): boolean {
  const da = toDisplayDate(a);
  const db = toDisplayDate(b);
  return !!da && !!db && da === db;
}

/**
 * Aynı pilot + aynı gün için seçilen aralıkla çakışan randevular.
 * - kesinleşti → seçilemez
 * - danisman_onayi_bekliyor → bilgilendirme (kimden onay bekleniyor)
 */
export function findOfferRangeConflicts(opts: {
  appointments: Appointment[];
  date: string | null | undefined;
  startHour: number;
  endHour: number;
  pilotName?: string | null;
  excludeId?: string | null;
}): { confirmed: Appointment[]; pending: Appointment[]; all: OfferConflict[] } {
  const {
    appointments,
    date,
    startHour,
    endHour,
    pilotName,
    excludeId,
  } = opts;

  const empty = { confirmed: [] as Appointment[], pending: [] as Appointment[], all: [] as OfferConflict[] };
  if (!date || !Number.isFinite(startHour) || !Number.isFinite(endHour) || endHour <= startHour) {
    return empty;
  }

  const confirmed: Appointment[] = [];
  const pending: Appointment[] = [];
  const all: OfferConflict[] = [];

  for (const app of appointments) {
    if (!app?.tarih || !app?.saatBlok) continue;
    if (excludeId && String(app.id) === String(excludeId)) continue;
    if (!sameDay(app.tarih, date)) continue;
    if (!isSamePilot(app, pilotName)) continue;

    const st = normalizeAppointmentStatus(app.status);
    if (st !== 'kesinlesti' && st !== 'danisman_onayi_bekliyor') continue;

    const other = resolveSaatBlokRange(app.saatBlok);
    if (!other) continue;
    if (!rangesOverlap(startHour, endHour, other.start, other.end)) continue;

    if (st === 'kesinlesti') {
      confirmed.push(app);
      all.push({ appointment: app, kind: 'confirmed' });
    } else {
      pending.push(app);
      all.push({ appointment: app, kind: 'pending' });
    }
  }

  return { confirmed, pending, all };
}

/** Bitiş saati kesinleşmiş bir çekimle çakışıyor mu? */
export function isOfferEndBlockedByConfirmed(opts: {
  appointments: Appointment[];
  date: string | null | undefined;
  startHour: number;
  endHour: number;
  pilotName?: string | null;
  excludeId?: string | null;
}): boolean {
  return findOfferRangeConflicts(opts).confirmed.length > 0;
}
