/**
 * Danışman görsellerinde ikili kompozisyon z-sırası için
 * isimden kadın tahmini (profiles’ta cinsiyet yok).
 */

function normalizeToken(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\./g, '');
}

/** İlk gerçek isim (Dr./Prof. atlanır) */
export function firstGivenName(displayName: string): string {
  const parts = String(displayName || '')
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const part of parts) {
    const bare = normalizeToken(part);
    if (!bare || bare === 'dr' || bare === 'prof' || bare === 'doç' || bare === 'doc') {
      continue;
    }
    return bare;
  }
  return '';
}

/** Ofis kadrosu + sık Türk kadın adları */
const FEMALE_FIRST_NAMES = new Set(
  [
    'acelya',
    'arzu',
    'aynur',
    'ayse',
    'ayşegül',
    'aysegul',
    'banu',
    'başak',
    'basak',
    'buse',
    'bahar',
    'burcu',
    'canan',
    'ceren',
    'ceyda',
    'çiğdem',
    'cigdem',
    'damla',
    'demet',
    'derya',
    'dilara',
    'dilman',
    'duygu',
    'ebru',
    'ece',
    'ecehan',
    'eda',
    'elif',
    'emine',
    'esin',
    'esra',
    'ezgi',
    'fahriye',
    'fatma',
    'feride',
    'filiz',
    'fulya',
    'gamze',
    'gaye',
    'gizem',
    'gönül',
    'gonul',
    'gül',
    'gul',
    'gülşah',
    'gulsah',
    'hazal',
    'hilal',
    'hülya',
    'hulya',
    'ipek',
    'kadriye',
    'meltem',
    'merve',
    'mehtap',
    'melisa',
    'melis',
    'mine',
    'nermin',
    'nil',
    'nilgün',
    'nilgun',
    'nur',
    'nuray',
    'özge',
    'ozge',
    'özgü',
    'ozgu',
    'pınar',
    'pinar',
    'selin',
    'selma',
    'serap',
    'serpil',
    'sevgi',
    'sevim',
    'sezgi',
    'sibel',
    'sunay',
    'şeyda',
    'seyda',
    'tülay',
    'tulay',
    'yağmur',
    'yagmur',
    'yasemin',
    'yeşim',
    'yesim',
    'yıldız',
    'yildiz',
    'zeynep',
  ].map((n) => normalizeToken(n))
);

const MALE_FIRST_NAMES = new Set(
  [
    'ahmet',
    'ali',
    'anil',
    'anıl',
    'arif',
    'aytaç',
    'aytac',
    'burak',
    'burhan',
    'cahit',
    'can',
    'cengiz',
    'cihan',
    'çağrı',
    'cagri',
    'emre',
    'erhan',
    'fahri',
    'fatih',
    'gökan',
    'gokhan',
    'hasan',
    'hüseyin',
    'huseyin',
    'ihsan',
    'kağan',
    'kagan',
    'kemal',
    'mehmet',
    'mesut',
    'metin',
    'murat',
    'mustafa',
    'okan',
    'onur',
    'özkan',
    'ozkan',
    'serhan',
    'serkan',
    'suat',
    'şenol',
    'senol',
    'turgay',
    'umut',
    'umit',
    'ümit',
    'umur',
    'volkan',
    'yavuz',
  ].map((n) => normalizeToken(n))
);

/** Bilinen kadın adı → true; bilinen erkek → false; belirsiz → null */
export function isLikelyFemaleName(displayName: string): boolean | null {
  const first = firstGivenName(displayName);
  if (!first) return null;
  if (FEMALE_FIRST_NAMES.has(first)) return true;
  if (MALE_FIRST_NAMES.has(first)) return false;
  return null;
}

/**
 * İkili çizimde kadın en sonda (önde) kalsın.
 * Karışık değilse / belirsizse sağdan sola klasik sıra.
 */
export function photoDrawOrder(displayNames: string[]): number[] {
  const n = displayNames.length;
  const defaultOrder = Array.from({ length: n }, (_, i) => n - 1 - i);
  if (n !== 2) return defaultOrder;

  const a = isLikelyFemaleName(displayNames[0] || '');
  const b = isLikelyFemaleName(displayNames[1] || '');
  if (a === true && b !== true) return [1, 0]; // 0 kadın → sonda
  if (b === true && a !== true) return [0, 1]; // 1 kadın → sonda
  return defaultOrder;
}
