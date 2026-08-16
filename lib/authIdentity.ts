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

/** Telefon numarasını Auth şifresi ile uyumlu hale getirir */
export function normalizeWhatsappPassword(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let clean = raw.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('90')) clean = clean.substring(2);
  if (clean.startsWith('0')) clean = clean.substring(1);
  return clean;
}

/**
 * Uygulama rolleri.
 * Fatima / Selim kişi adıdır — login rolü her zaman `pilot`.
 * Eski DB değerleri (`fatima` / `selim`) oturumda `pilot`e normalize edilir.
 * appointments.owner_role kişi anahtarıdır (`fatima` | `selim`) — AppRole değildir.
 */
export type AppRole = 'broker' | 'pilot' | 'danisman' | 'personel';

/** Eski kişi-rol değerleri (profiles.role / created_by_role geçiş dönemi) */
const LEGACY_PILOT_ROLES = new Set(['selim', 'fatima']);

/** Sabit pilot kişiler — Excel / admin UI bunları personel yazsa bile pilot kalır */
export const KNOWN_PILOT_PERSONS = [
  {
    key: 'fatima' as const,
    displayName: 'Fatima Bayramova',
    // Soyadsız "fatima" yok: Fatima Yılmaz gibi danışmanları pilot saymaz.
    match: ['fatima bayramova'],
  },
  {
    key: 'selim' as const,
    displayName: 'Mehmet Selim İdiz',
    // "mehmet selim" yok: başka Mehmet Selim … kişilerini yakalamasın.
    match: ['mehmet selim idiz', 'selim idiz'],
  },
] as const;

export type KnownPilotKey = (typeof KNOWN_PILOT_PERSONS)[number]['key'];

/** UI seçim listesi (büyük harf) */
export const PILOT_OPTIONS = KNOWN_PILOT_PERSONS.map((p) =>
  p.displayName.toLocaleUpperCase('tr-TR')
);

function foldPersonName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

/** İsim Fatima Bayramova veya Mehmet Selim İdiz mi? */
export function isKnownPilotPerson(
  fullName: string | null | undefined
): boolean {
  return knownPilotKeyFromName(fullName) != null;
}

/**
 * Aday metinle isim eşleşmesi.
 * Tek kelimelik aday yalnızca tam eşitlikte geçer (startsWith yok).
 * Çok kelimelik adaylar tam ad veya ek orta isim ile eşleşebilir.
 */
function foldedNameMatchesCandidate(
  folded: string,
  candidate: string
): boolean {
  if (!candidate) return false;
  if (folded === candidate) return true;

  const tokenCount = candidate.split(' ').filter(Boolean).length;
  // "fatima" gibi kısa token'lar startsWith ile yanlış pozitif üretir.
  if (tokenCount < 2) return false;

  return (
    folded.startsWith(`${candidate} `) ||
    folded.endsWith(` ${candidate}`) ||
    folded.includes(` ${candidate} `)
  );
}

export function knownPilotKeyFromName(
  fullName: string | null | undefined
): KnownPilotKey | null {
  const folded = foldPersonName(fullName);
  if (!folded) return null;

  // appointments.owner_role kişi anahtarları (yalnızca tam "fatima" / "selim")
  if (folded === 'fatima' || folded === 'selim') return folded;

  let best: { key: KnownPilotKey; len: number } | null = null;

  for (const person of KNOWN_PILOT_PERSONS) {
    const candidates = [
      foldPersonName(person.displayName),
      ...person.match.map((m) => foldPersonName(m)),
    ];
    for (const m of candidates) {
      if (!foldedNameMatchesCandidate(folded, m)) continue;
      if (!best || m.length > best.len) {
        best = { key: person.key, len: m.length };
      }
    }
  }

  return best?.key ?? null;
}

/** Bilinen pilot için kanonik görünen ad */
export function knownPilotDisplayName(
  fullName: string | null | undefined
): string | null {
  const key = knownPilotKeyFromName(fullName);
  if (!key) return null;
  return (
    KNOWN_PILOT_PERSONS.find((p) => p.key === key)?.displayName || null
  );
}

/**
 * İsim bilinen pilotsa rolü zorla `pilot` yap.
 * Excel "Personel" / eski "Yönetici" yazsa bile Fatima/Selim demote edilmez.
 */
export function enforcePilotRoleForPerson(
  fullName: string | null | undefined,
  role: string | null | undefined
): AppRole | string {
  if (isKnownPilotPerson(fullName)) return 'pilot';
  return normalizeAppRole(role);
}

/**
 * profiles.role yazımı: bilinen pilot → `pilot` + is_pilot.
 * Canlı DB enum'unda `pilot` yoksa fallback için legacy kişi anahtarı.
 */
export function profilePilotFlagsForPerson(
  fullName: string | null | undefined,
  role: string | null | undefined
): { role: AppRole | string; is_pilot: boolean; legacyRole: KnownPilotKey | null } {
  const enforced = enforcePilotRoleForPerson(fullName, role);
  const legacy = knownPilotKeyFromName(fullName);
  const isPilot = enforced === 'pilot' || isPilotRole(enforced) || legacy != null;
  return {
    role: isPilot ? 'pilot' : enforced,
    is_pilot: isPilot,
    legacyRole: legacy,
  };
}

/** Eski fatima/selim → pilot; eski yonetici → personel */
export function normalizeAppRole(
  role: string | null | undefined
): AppRole | string {
  const r = String(role || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (LEGACY_PILOT_ROLES.has(r)) return 'pilot';
  if (r === 'yonetici') return 'personel';
  return r;
}

/** Rol personel mi? (yeni `personel` + eski `yonetici`) */
export function isPersonelRole(role: string | null | undefined): boolean {
  return normalizeAppRole(role) === 'personel';
}

/** Rol pilot mu? (yeni `pilot` + eski fatima/selim) */
export function isPilotRole(role: string | null | undefined): boolean {
  const r = String(role || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return r === 'pilot' || LEGACY_PILOT_ROLES.has(r);
}

/** Rol veya isim pilot mu? */
export function isPilotAccount(opts: {
  role?: string | null;
  fullName?: string | null;
  is_pilot?: boolean | null;
}): boolean {
  if (opts.is_pilot === true) return true;
  if (isPilotRole(opts.role)) return true;
  return isKnownPilotPerson(opts.fullName);
}

/** UUID v1–v5 biçimi (pilot_id / notifications.user_id) */
export function isUuid(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

/** Kullanıcı yönetimi paneli — sabit yetkili isimler */
const USER_ADMIN_NAMES = [
  'nima tabrizi',
  'cansu koc',
  'elizaveta',
] as const;

function normalizePersonKey(fullName: string): string {
  return fullName
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** İsimle kilitli yetkili (silinemez) — Nima, Cansu Koç, Elizaveta */
export function isNamedUserAdmin(
  fullName: string | null | undefined
): boolean {
  if (!fullName || typeof fullName !== 'string') return false;
  const normalized = normalizePersonKey(fullName);
  return USER_ADMIN_NAMES.some(
    (name) => normalized === name || normalized.startsWith(`${name} `)
  );
}

/**
 * Kullanıcı yönetimi paneli erişimi:
 * - broker rolü
 * - veya isimle yetkili hesaplar (Nima, Cansu Koç, Elizaveta)
 */
export function isUserAdmin(
  fullName?: string | null,
  role?: AppRole | string | null
): boolean {
  if (normalizeAppRole(role) === 'broker') return true;
  return isNamedUserAdmin(fullName);
}

/** Rol → giriş sonrası varsayılan panel sekmesi (her zaman Genel Bakış) */
export function defaultTabForRole(_role?: AppRole | string): string {
  return 'genel';
}

export function roleLabel(role: AppRole | string): string {
  switch (normalizeAppRole(role)) {
    case 'broker':
      return 'Broker';
    case 'pilot':
      return 'Pilot';
    case 'danisman':
      return 'Danışman';
    case 'personel':
      return 'Personel';
    default:
      return role || '';
  }
}

/** Personel / broker / pilot kabuğu (takvim / çekim paneli) kullanan roller */
export function usesManagerShell(role: AppRole | string): boolean {
  const r = normalizeAppRole(role);
  return r === 'broker' || r === 'pilot' || r === 'personel' || isPilotRole(role);
}

/** Kesinleştirme / ret yetkisi */
export function canApproveAppointments(role: AppRole | string): boolean {
  const r = normalizeAppRole(role);
  return r === 'broker' || r === 'pilot' || isPilotRole(role);
}

/** Manuel çekim ekleme yetkisi (Çekim Talepleri) */
export function canCreateManualAppointment(role: AppRole | string): boolean {
  const r = normalizeAppRole(role);
  return r === 'broker' || r === 'pilot' || isPilotRole(role);
}

/**
 * created_by_role → arşiv etiketi.
 * Eski fatima/selim değerleri ve yeni pilot desteklenir.
 */
export function manualEntryDisplayName(
  createdByRole: string | null | undefined,
  createdByName?: string | null
): string {
  if (createdByName && String(createdByName).trim()) {
    return String(createdByName).trim();
  }
  const r = String(createdByRole || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (r === 'fatima') return 'Fatima Bayramova';
  if (r === 'selim') return 'Mehmet Selim İdiz';
  if (r === 'pilot') return 'Pilot';
  if (r === 'broker') return 'Broker';
  return createdByRole || 'Bilinmiyor';
}
