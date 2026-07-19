/** Ortak randevu / tarih yardımcıları */

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

export function isRejectedStatus(status: string): boolean {
  return status === 'rejected' || status === 'Reddedildi';
}

export function isPendingStatus(status: string): boolean {
  return status === 'pending' || status === 'Bekliyor';
}

/** DB: confirmed — kullanıcı dili: approved / Onaylandı */
export function isConfirmedStatus(status: string): boolean {
  return status === 'confirmed' || status === 'Onaylandı' || status === 'approved';
}

export function formatAppointmentRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    danismanIsmi: row.danisman_ismi as string,
    tarih: toDisplayDate(row.tarih),
    saatBlok: row.saat_blok as string,
    konum: row.konum as string,
    portfoyTuru: row.portfoy_turu as string,
    aciklama: row.aciklama as string,
    pilot: row.pilot as string,
    ownerRole: row.owner_role as string,
    status: row.status as string,
    reddedilmeSebebi: row.reddedilme_sebebi as string,
    isManual: row.is_manual === true,
    createdByRole: (row.created_by_role as string) || null,
  };
}
