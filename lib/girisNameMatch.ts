/**
 * Yapıştırılan isim listesini profillerle eşleştirir (tamamen istemci tarafı).
 */

import { toConsultantPhotoSlug } from './formatName';

export type MatchStatus = 'found' | 'near' | 'ambiguous' | 'missing';

export type MatchCandidate = { key: string; name: string };

export type NameMatch = {
  line: string;
  status: MatchStatus;
  /** found/near: tek aday; ambiguous: eşit puanlı adaylar */
  candidates: MatchCandidate[];
  /** Listede aynı kişi daha önce geçtiyse true */
  duplicate: boolean;
};

const IGNORED_TOKENS = new Set(['dr', 'prof', 'doc', 'av', 'mimar', 'muh']);

export function nameTokens(value: string): string[] {
  return toConsultantPhotoSlug(value)
    .split('-')
    .filter((t) => t && !IGNORED_TOKENS.has(t));
}

/** Satır, sekme, virgül veya noktalı virgülle ayrılmış listeyi temizlenmiş satırlara böler. */
export function parseNameList(text: string): string[] {
  return text
    .split(/[\r\n\t,;]+/)
    .map((line) =>
      line
        .replace(/^\s*(?:\d+\s*[.)\-:]?|[-–—•*·▪●])\s*/u, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => /\p{L}/u.test(line));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function closeEnough(a: string, b: string) {
  const limit = Math.max(a.length, b.length) > 6 ? 2 : 1;
  return levenshtein(a, b) <= limit;
}

/** Tek harflik kısaltmalar (ör. "M.") kelime eşleşmesinde zorunlu sayılmaz. */
function containsAll(have: string[], want: string[]) {
  const set = new Set(have);
  return want.filter((t) => t.length > 1).every((t) => set.has(t));
}

type Scored = { candidate: MatchCandidate; tier: 3 | 2 | 1; distance: number };

function scoreProfile(input: string[], profile: string[], candidate: MatchCandidate): Scored | null {
  if (!input.length || !profile.length) return null;
  if (input.join('-') === profile.join('-')) return { candidate, tier: 3, distance: 0 };

  if (input.length >= 2 && profile.length >= 2) {
    if (containsAll(profile, input) || containsAll(input, profile)) {
      return { candidate, tier: 2, distance: Math.abs(profile.length - input.length) };
    }
    const first = [input[0]!, profile[0]!] as const;
    const last = [input[input.length - 1]!, profile[profile.length - 1]!] as const;
    if (closeEnough(...first) && closeEnough(...last)) {
      return { candidate, tier: 1, distance: levenshtein(...first) + levenshtein(...last) };
    }
    return null;
  }

  // Tek kelimelik satır: ada ya da soyada birebir uyan herkes aday olur.
  if (input.length === 1 && profile.includes(input[0]!)) return { candidate, tier: 1, distance: 0 };
  return null;
}

export function matchNameList(text: string, profiles: MatchCandidate[]): NameMatch[] {
  const indexed = profiles.map((p) => ({ candidate: p, tokens: nameTokens(p.name) }));
  const seen = new Set<string>();
  return parseNameList(text).map((line) => {
    const input = nameTokens(line);
    const scored = indexed
      .map(({ candidate, tokens }) => scoreProfile(input, tokens, candidate))
      .filter((s): s is Scored => Boolean(s));
    if (!scored.length) return { line, status: 'missing', candidates: [], duplicate: false };

    const bestTier = Math.max(...scored.map((s) => s.tier));
    const top = scored.filter((s) => s.tier === bestTier);
    const bestDistance = Math.min(...top.map((s) => s.distance));
    const best = top.filter((s) => s.distance === bestDistance).map((s) => s.candidate);

    let status: MatchStatus;
    if (best.length > 1) status = 'ambiguous';
    else if (bestTier >= 2) status = 'found';
    else status = 'near';

    let duplicate = false;
    if (best.length === 1) {
      duplicate = seen.has(best[0]!.key);
      seen.add(best[0]!.key);
    }
    return { line, status, candidates: best, duplicate };
  });
}
