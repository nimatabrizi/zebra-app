/**
 * Login + Auth migration ortak kimlik yardımcıları.
 * scripts/migrate-auth-users.mjs içindeki kopya ile BİREBİR aynı kalmalı.
 */

/** Tam isim → Auth e-postası (büyük/küçük harf duyarsız) */
export function generateEmailFromName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  let normalized = name.trim().toLocaleLowerCase('tr-TR');

  normalized = normalized
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

  normalized = normalized
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  return `${normalized}@zebra.local`;
}

/** WhatsApp şifresini Auth ile uyumlu hale getirir */
export function normalizeWhatsappPassword(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let clean = raw.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('90')) clean = clean.substring(2);
  if (clean.startsWith('0')) clean = clean.substring(1);
  return clean;
}

export type AppRole = 'broker' | 'selim' | 'fatima' | 'danisman' | 'yonetici';

/** Rol → giriş sonrası varsayılan panel sekmesi */
export function defaultTabForRole(role: AppRole | string): string {
  switch (role) {
    case 'danisman':
      return 'randevu';
    case 'selim':
    case 'fatima':
      return 'cekim';
    case 'broker':
      return 'genel';
    case 'yonetici':
      return 'takvim';
    default:
      return 'genel';
  }
}

export function roleLabel(role: AppRole | string): string {
  switch (role) {
    case 'broker':
      return 'Broker';
    case 'selim':
      return 'Selim';
    case 'fatima':
      return 'Fatima';
    case 'danisman':
      return 'Danışman';
    case 'yonetici':
      return 'Yönetici';
    default:
      return role || '';
  }
}

/** Yönetici kabuğu (takvim / çekim paneli) kullanan roller */
export function usesManagerShell(role: AppRole | string): boolean {
  return role === 'broker' || role === 'selim' || role === 'fatima' || role === 'yonetici';
}

/** Onay / ret yetkisi */
export function canApproveAppointments(role: AppRole | string): boolean {
  return role === 'broker' || role === 'selim' || role === 'fatima';
}

/** Manuel çekim ekleme yetkisi (Çekim Talepleri) */
export function canCreateManualAppointment(role: AppRole | string): boolean {
  return role === 'broker' || role === 'selim' || role === 'fatima';
}

/** created_by_role → arşiv etiketi */
export function manualEntryDisplayName(createdByRole: string | null | undefined): string {
  if (createdByRole === 'fatima') return 'Fatima Bayramova';
  if (createdByRole === 'selim') return 'Mehmet Selim İdiz';
  if (createdByRole === 'broker') return 'Broker';
  return createdByRole || 'Bilinmiyor';
}
