/** Varsayılan danışman ünvanı (stüdyo / toplu üretim) */
export const DEFAULT_CONSULTANT_TITLE = 'Gayrimenkul Danışmanı';

/**
 * Rol = danışman kalır; ünvan ayrı alandır.
 * DB’de `profiles.unvan` yoksa veya boşsa bu eşleme kullanılır.
 */
const TITLE_OVERRIDES: Record<string, string> = {
  'esra uslu': 'Saha Direktörü',
  'yunus örük': 'Saha Direktörü',
  'yunus oruk': 'Saha Direktörü',
  'alper topbaşoğlu': 'Saha Direktörü',
  'alper topbasoglu': 'Saha Direktörü',
  'semih nihat uysal': 'Saha Direktörü',
  'semih nşhat uysal': 'Saha Direktörü',
};

function nameKey(value: string): string {
  return String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ASCII’ye yakın anahtar (ö→o vb.) — slug / eski yazımlar için */
function asciiKey(value: string): string {
  return nameKey(value)
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/**
 * Öncelik: profiles.unvan → isim override → varsayılan.
 */
export function resolveConsultantTitle(
  tamIsim: string,
  unvanFromDb?: string | null
): string {
  const fromDb = String(unvanFromDb || '').trim();
  if (fromDb) return fromDb;

  const key = nameKey(tamIsim);
  if (TITLE_OVERRIDES[key]) return TITLE_OVERRIDES[key];

  const folded = asciiKey(tamIsim);
  for (const [k, title] of Object.entries(TITLE_OVERRIDES)) {
    if (asciiKey(k) === folded) return title;
  }

  return DEFAULT_CONSULTANT_TITLE;
}
