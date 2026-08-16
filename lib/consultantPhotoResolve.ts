/**
 * Danışman fotoğrafı çözümleme.
 * Profil isimleri ile Storage dosya adları birebir olmayabilir
 * (örn. "AHMET M.KILINÇARSLAN" ↔ ahmet-musab-kilicarslan.png).
 */

import { toConsultantPhotoSlug, toTitleCaseName } from './formatName';
import generated from './consultantPhotoMap.generated.json';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

/** Bilinen isim/yazım farkları → Storage slug (uzantısız) */
const HARDCODED_ALIASES: Record<string, string> = {
  'ahmet-mkilincarslan': 'ahmet-musab-kilicarslan',
  'ahmet-m-kilincarslan': 'ahmet-musab-kilicarslan',
  'acelya-aycil': 'acelya-acil',
  'bahtiyar-cilli-dr': 'bahtiyar-cilli',
  'dr-bahtiyar-cilli': 'bahtiyar-cilli',
  'ceyda-birdal-demirulus': 'ceyd-birdal-demirulus',
  'cilem-karamanturk': 'cilem-kahramanturk',
  'elif-ozdiken': 'ekif-ozdiken',
  'kadriye-yildirim': 'kadiye-yildirim',
  'kultigin-yararbas': 'kultekin-yarabas',
  'merve-guldogan': 'merve-gundogan',
  'nurgun-alpdogan': 'nurgun-alprdogan',
  'nursel-hascizmeci': 'nursel-hascizemci',
  'umut-dag': 'umur-dag',
};

export const CONSULTANT_PHOTO_ALIASES: Record<string, string> = {
  ...((generated as { mapping?: Record<string, string> })?.mapping || {}),
  ...HARDCODED_ALIASES,
};

function significantTokens(slug: string): string[] {
  return slug
    .split('-')
    .filter((t) => t && t !== 'dr' && t.length >= 3);
}

/**
 * Profil adından Storage slug bul.
 * availableSlugs verilirse fuzzy eşleşme de denenir.
 */
export function resolveConsultantPhotoSlug(
  fullName: string,
  availableSlugs?: Iterable<string> | null
): string | null {
  const rawSlug = toConsultantPhotoSlug(fullName);
  if (!rawSlug) return null;

  const availableList = availableSlugs ? [...availableSlugs] : null;
  const available =
    availableList && availableList.length > 0
      ? new Set(
          availableList.map((s) =>
            String(s).replace(/\.png$/i, '').toLowerCase()
          )
        )
      : null;

  const has = (slug: string) => !available || available.has(slug);

  // 1) Alias
  const aliased = CONSULTANT_PHOTO_ALIASES[rawSlug];
  if (aliased && has(aliased)) return aliased;

  // 2) Exact
  if (has(rawSlug)) return rawSlug;

  // 3) Fuzzy against available files
  if (available && available.size) {
    const want = significantTokens(rawSlug);
    if (want.length) {
      let best: { slug: string; score: number } | null = null;
      for (const slug of available) {
        const have = significantTokens(slug);
        if (!have.length) continue;
        let score = 0;
        if (have.includes(want[0])) score += 45;
        if (want.length >= 2 && have.includes(want[want.length - 1])) score += 45;
        const inter = want.filter((t) => have.includes(t)).length;
        if (inter === want.length) score += 20;
        else score += Math.round((inter / want.length) * 25);
        if (!best || score > best.score) best = { slug, score };
      }
      if (best && best.score >= 70) return best.slug;
    }
  }

  // 4) Alias even if inventory unknown (public URL may still 200)
  if (aliased) return aliased;

  return rawSlug;
}

export function consultantPhotoPublicUrlFromSlug(slug: string | null): string | null {
  if (!slug || !SUPABASE_URL) return null;
  // Aynı path upsert edilince tarayıcı/CDN eski görseli tutabiliyor
  const bust =
    process.env.NEXT_PUBLIC_CONSULTANT_PHOTO_V || '20260814-cem2';
  return `${SUPABASE_URL}/storage/v1/object/public/consultant-photos/${slug}.png?v=${bust}`;
}

/** İsim → public URL (alias + opsiyonel envanter ile) */
export function resolveConsultantPhotoUrl(
  fullName: string,
  availableSlugs?: Iterable<string> | null
): string | null {
  const slug = resolveConsultantPhotoSlug(fullName, availableSlugs);
  return consultantPhotoPublicUrlFromSlug(slug);
}

/** Title Case: noktalı kısaltmaları da böl; sondaki Dr. öne alınır */
export function toStudioDisplayName(value: unknown): string {
  return toTitleCaseName(value);
}
