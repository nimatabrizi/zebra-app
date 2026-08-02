/** Ortak randevu / tarih yardımcıları */

import type {
  Appointment,
  AppointmentStatus,
} from '../types/appointments';
import { APPOINTMENT_STATUSES } from '../types/appointments';

export function formatDateStr(date: Date | null | undefined): string {
  if (!date) return '';
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
}

export function toDisplayDate(value: unknown): string {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}.${m}.${y}`;
  }
  return String(value);
}

export function parseDisplayDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, mo, d] = raw.slice(0, 10).split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  return null;
}

export function ownerRoleFromPilot(pilotName: string): 'fatima' | 'selim' | null {
  const key = (pilotName || '').trim().toLocaleUpperCase('tr-TR');
  if (key.includes('FATİMA') || key.includes('FATIMA')) return 'fatima';
  if (key.includes('SELİM') || key.includes('SELIM')) return 'selim';
  return null;
}

export function ownerRoleDisplayName(ownerRole: string | null | undefined): string | null {
  if (ownerRole === 'fatima') return 'Fatima Bayramova';
  if (ownerRole === 'selim') return 'Mehmet Selim İdiz';
  return null;
}

/** Eski DB değerlerini yeni ENUM'a normalize et (UI geçiş dönemi) */
export function normalizeAppointmentStatus(status: unknown): AppointmentStatus {
  const s = String(status ?? '').trim();
  if ((APPOINTMENT_STATUSES as readonly string[]).includes(s)) {
    return s as AppointmentStatus;
  }
  if (s === 'pending' || s === 'Bekliyor' || s === 'bekliyor') return 'pilot_bekleniyor';
  if (s === 'confirmed' || s === 'Onaylandı' || s === 'onaylandı' || s === 'approved') {
    return 'kesinlesti';
  }
  if (s === 'rejected' || s === 'Reddedildi' || s === 'reddedildi') return 'iptal';
  return 'pilot_bekleniyor';
}

/** İptal / red */
export function isRejectedStatus(status: string): boolean {
  return (
    status === 'rejected' ||
    status === 'Reddedildi' ||
    status === 'iptal' ||
    normalizeAppointmentStatus(status) === 'iptal'
  );
}

/** Pilot veya danışman kesinleştirmesi bekleyen */
export function isPendingStatus(status: string): boolean {
  const n = normalizeAppointmentStatus(status);
  return (
    n === 'pilot_bekleniyor' ||
    n === 'danisman_onayi_bekliyor' ||
    status === 'pending' ||
    status === 'Bekliyor'
  );
}

/** Kesinleşmiş */
export function isConfirmedStatus(status: string): boolean {
  const n = normalizeAppointmentStatus(status);
  return (
    n === 'kesinlesti' ||
    status === 'confirmed' ||
    status === 'Onaylandı' ||
    status === 'approved'
  );
}

export function formatAppointmentRow(row: Record<string, unknown>): Appointment {
  const tarihRaw = row.tarih;
  return {
    id: String(row.id),
    danismanIsmi: row.danisman_ismi as string,
    tarih: tarihRaw != null && tarihRaw !== '' ? toDisplayDate(tarihRaw) : null,
    saatBlok: (row.saat_blok as string) ?? null,
    il: (row.il as string) ?? '',
    ilce: (row.ilce as string) ?? '',
    semt: (row.semt as string) ?? null,
    konum: (row.konum as string) ?? null,
    portfoyTuru: (row.portfoy_turu as string) ?? null,
    aciklama: (row.aciklama as string) ?? null,
    danismanNotu: (row.danisman_notu as string) ?? null,
    pilot: (row.pilot as string) ?? null,
    pilotId: String(row.pilot_id ?? ''),
    ownerRole: (row.owner_role as string) ?? null,
    status: normalizeAppointmentStatus(row.status),
    reddedilmeSebebi: (row.reddedilme_sebebi as string) ?? null,
    isManual: row.is_manual === true,
    createdByRole: (row.created_by_role as string) || null,
    createdBy: (row.created_by as string) || null,
  };
}

/** İlçeye göre grupla (pilot talep paneli) */
export function groupAppointmentsByIlce(
  appointments: Appointment[]
): Record<string, Appointment[]> {
  return appointments.reduce<Record<string, Appointment[]>>((acc, app) => {
    const key = app.ilce?.trim() || 'Belirsiz';
    if (!acc[key]) acc[key] = [];
    acc[key].push(app);
    return acc;
  }, {});
}
