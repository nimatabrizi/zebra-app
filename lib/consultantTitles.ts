import { toTurkishUpper } from './formatName';

export const DEFAULT_CONSULTANT_TITLE = 'Gayrimenkul Danışmanı';

const TITLE_ALIASES: Record<string, string> = {
  broker: 'Broker',
  danisman: DEFAULT_CONSULTANT_TITLE,
  danışman: DEFAULT_CONSULTANT_TITLE,
  personel: 'Personel',
  pilot: 'Pilot',
  'saha direktoru': 'Saha Direktörü',
  'saha direktörü': 'Saha Direktörü',
};

function normalizeKey(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

/**
 * Danışman ünvanını tek noktadan normalize eder.
 * - explicitTitle doluysa onu kullanır.
 * - boşsa varsayılan danışman ünvanına döner.
 */
export function resolveConsultantTitle(
  _fullName: string | null | undefined,
  explicitTitle?: string | null
): string {
  const raw = String(explicitTitle || '').trim();
  if (!raw) return DEFAULT_CONSULTANT_TITLE;
  const key = normalizeKey(raw);
  const mapped = TITLE_ALIASES[key] || raw;
  return toTurkishUpper(mapped)
    .toLocaleLowerCase('tr-TR')
    .replace(/\b\w/g, (c) => c.toLocaleUpperCase('tr-TR'));
}

