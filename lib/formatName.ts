/**
 * Sondaki unvanı öne alır: "Bahtiyar Cilli Dr." → "Dr. Bahtiyar Cilli"
 */
function moveTrailingHonorificToFront(raw: string): string {
  const parts = raw
    .normalize('NFC')
    .trim()
    .replace(/\./g, '. ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (parts.length < 2) return parts.join(' ');

  const last = parts[parts.length - 1].replace(/\./g, '').toLocaleLowerCase('tr-TR');
  if (last !== 'dr' && last !== 'prof' && last !== 'doç' && last !== 'doc') {
    return parts.join(' ');
  }

  const honorific =
    last === 'dr' ? 'Dr.' : last === 'prof' ? 'Prof.' : 'Doç.';
  return [honorific, ...parts.slice(0, -1)].join(' ');
}

/**
 * Kişi adlarını arayüzde Title Case gösterir (TR locale).
 * Örn: "CAHİT EREZ" → "Cahit Erez"
 * "BAHTİYAR CİLLİ DR." → "Dr. Bahtiyar Cilli"
 * Veriyi değiştirmez; yalnızca görüntüleme için kullanın.
 */
export function toTitleCaseName(value: unknown): string {
  if (value == null) return '';
  const raw = moveTrailingHonorificToFront(String(value));
  if (!raw) return '';

  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const bare = word.replace(/\./g, '').toLocaleLowerCase('tr-TR');
      if (bare === 'dr') return 'Dr.';
      if (bare === 'prof') return 'Prof.';
      if (bare === 'doç' || bare === 'doc') return 'Doç.';
      const lower = word.toLocaleLowerCase('tr-TR');
      if (!lower) return '';
      const first = lower.charAt(0).toLocaleUpperCase('tr-TR');
      return `${first}${lower.slice(1)}`;
    })
    .join(' ');
}

/**
 * Yaka kartı: ilk ad(lar) ince, soyad kalın.
 * "Aslı Çeşme" → given Aslı, family Çeşme
 * "Semih Nihat Uysal" → given Semih Nihat, family Uysal
 * "Dr. Bahtiyar Cilli" → given Bahtiyar, family Cilli
 */
export function splitGivenAndFamilyName(value: unknown): {
  given: string;
  family: string;
} {
  const titled = toTitleCaseName(value);
  const parts = titled
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => {
      const bare = part.replace(/\./g, '').toLocaleLowerCase('tr-TR');
      return bare !== 'dr' && bare !== 'prof' && bare !== 'doç' && bare !== 'doc';
    });
  if (parts.length === 0) return { given: '', family: '' };
  if (parts.length === 1) return { given: '', family: parts[0] };
  return {
    given: parts.slice(0, -1).join(' '),
    family: parts[parts.length - 1],
  };
}

/**
 * TR locale büyük harf: "iz" → "İZ", "ılık" → "ILIK".
 * i/ı eşlemesi elle yapılır; html-to-image gibi kopya DOM'larda
 * `lang="tr"` kaybolduğunda CSS `text-transform` yanlış harf üretir.
 */
export function toTurkishUpper(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .normalize('NFC')
    .replace(/i/g, 'İ')
    .replace(/ı/g, 'I')
    .toLocaleUpperCase('tr-TR')
    .normalize('NFC');
}

/**
 * Storage-safe slug (Supabase object key ASCII olmalı).
 * Örn: "Cahit Erez" → "cahit-erez"
 * "Ayşe Yılmaz" → "ayse-yilmaz"
 * "AHMET M.KILINÇARSLAN" → "ahmet-m-kilincarslan"
 */
export function toConsultantPhotoSlug(value: unknown): string {
  const titled = toTitleCaseName(value);
  if (!titled) return '';

  let normalized = titled.toLocaleLowerCase('tr-TR');
  normalized = normalized
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
