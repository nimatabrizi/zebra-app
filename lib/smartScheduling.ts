import type { Appointment } from '../types/appointments';
import {
  normalizeAppointmentStatus,
  parseDisplayDate,
  toDisplayDate,
} from './appointmentUtils';

type HourRange = { start: number; end: number };

export type DayAvailability =
  | { kind: 'free'; freeRanges: HourRange[] }
  | { kind: 'full'; freeRanges: HourRange[] }
  | { kind: 'partial'; freeRanges: HourRange[] };

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function samePilot(app: Appointment, pilotName?: string | null): boolean {
  const target = normalizeText(pilotName);
  if (!target) return true;
  return normalizeText(app.pilot) === target;
}

function isActiveStatus(status: unknown): boolean {
  const n = normalizeAppointmentStatus(status);
  return n === 'kesinlesti' || n === 'danisman_onayi_bekliyor';
}

function parseHour(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h + min / 60;
}

function parseSaatBlokRange(saatBlok?: string | null): HourRange | null {
  const raw = String(saatBlok || '').trim();
  if (!raw) return null;
  const parts = raw
    .replace(/[—–]/g, '-')
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const start = parseHour(parts[0]!);
  const end = parseHour(parts[1]!);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

function mergeRanges(ranges: HourRange[]): HourRange[] {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: HourRange[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function freeRangesFromBusy(
  busy: HourRange[],
  dayStart = 9,
  dayEnd = 21
): HourRange[] {
  const merged = mergeRanges(
    busy
      .map((r) => ({
        start: Math.max(dayStart, r.start),
        end: Math.min(dayEnd, r.end),
      }))
      .filter((r) => r.end > r.start)
  );
  if (!merged.length) return [{ start: dayStart, end: dayEnd }];
  const free: HourRange[] = [];
  let cursor = dayStart;
  for (const r of merged) {
    if (r.start > cursor) free.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free.filter((r) => r.end - r.start >= 0.25);
}

function toDisplay(value: unknown): string {
  const d = parseDisplayDate(value);
  if (!d) return '';
  return toDisplayDate(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  );
}

export function getSameDistrictConfirmedDates(
  appointments: Appointment[],
  targetIl?: string | null,
  targetIlce?: string | null,
  pilotName?: string | null
): Set<string> {
  const il = normalizeText(targetIl);
  const ilce = normalizeText(targetIlce);
  const set = new Set<string>();
  if (!ilce) return set;

  for (const app of appointments) {
    if (!samePilot(app, pilotName)) continue;
    if (normalizeAppointmentStatus(app.status) !== 'kesinlesti') continue;
    if (normalizeText(app.ilce) !== ilce) continue;
    if (il && normalizeText(app.il) && normalizeText(app.il) !== il) continue;
    const d = toDisplay(app.tarih);
    if (d) set.add(d);
  }
  return set;
}

export function getBusyDatesInMonth(
  appointments: Appointment[],
  month: number,
  year: number,
  pilotName?: string | null
): Set<string> {
  const set = new Set<string>();
  for (const app of appointments) {
    if (!samePilot(app, pilotName)) continue;
    if (!isActiveStatus(app.status)) continue;
    const d = parseDisplayDate(app.tarih);
    if (!d) continue;
    if (d.getMonth() !== month || d.getFullYear() !== year) continue;
    const display = toDisplay(app.tarih);
    if (display) set.add(display);
  }
  return set;
}

export function getDayAgenda(
  appointments: Appointment[],
  displayDate: string,
  pilotName?: string | null
): Appointment[] {
  if (!displayDate) return [];
  return appointments
    .filter((app) => {
      if (!samePilot(app, pilotName)) return false;
      if (!isActiveStatus(app.status)) return false;
      return toDisplay(app.tarih) === displayDate;
    })
    .sort((a, b) => {
      const ar = parseSaatBlokRange(a.saatBlok);
      const br = parseSaatBlokRange(b.saatBlok);
      if (!ar && !br) return 0;
      if (!ar) return 1;
      if (!br) return -1;
      return ar.start - br.start;
    });
}

export function getDayAvailability(
  appointments: Appointment[],
  displayDate: string,
  pilotName?: string | null
): DayAvailability {
  const agenda = getDayAgenda(appointments, displayDate, pilotName);
  if (!agenda.length) {
    return { kind: 'free', freeRanges: [{ start: 9, end: 21 }] };
  }
  const busyRanges = agenda
    .map((a) => parseSaatBlokRange(a.saatBlok))
    .filter((r): r is HourRange => Boolean(r));
  if (!busyRanges.length) {
    return { kind: 'partial', freeRanges: [{ start: 9, end: 21 }] };
  }
  const freeRanges = freeRangesFromBusy(busyRanges);
  if (!freeRanges.length) return { kind: 'full', freeRanges: [] };
  if (freeRanges.length === 1 && freeRanges[0]!.start <= 9 && freeRanges[0]!.end >= 21) {
    return { kind: 'free', freeRanges };
  }
  return { kind: 'partial', freeRanges };
}

