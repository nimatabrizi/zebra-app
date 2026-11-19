/**
 * Research target brands (13) vs archive-only labels found in workbook history.
 * Archive rows are retained; never silently deleted.
 */

export type RakipBrandClass = 'research_target' | 'archive_only' | 'unknown';

/** Daily Cloud / Codex research order — matches config/brands.json. */
export const RAKIP_RESEARCH_TARGET_BRANDS: ReadonlyArray<{
  order: number;
  slug: string;
  label: string;
  aliases: readonly string[];
}> = [
  {
    order: 1,
    slug: 'coldwell-banker',
    label: 'Coldwell Banker',
    aliases: ['coldwell banker', 'cb'],
  },
  {
    order: 2,
    slug: 're-max',
    label: 'RE/MAX',
    aliases: ['remax', 're/max'],
  },
  {
    order: 3,
    slug: 'keller-williams',
    label: 'Keller Williams',
    aliases: ['keller williams', 'kw'],
  },
  {
    order: 4,
    slug: 'turyap',
    label: 'Turyap',
    aliases: ['turyap'],
  },
  {
    order: 5,
    slug: 'realty-world',
    label: 'Realty World',
    aliases: ['realty world'],
  },
  {
    order: 6,
    slug: 'century-21',
    label: 'Century 21',
    aliases: ['century 21', 'century21'],
  },
  {
    order: 7,
    slug: 'redstone',
    label: 'Redstone',
    aliases: ['redstone'],
  },
  {
    order: 8,
    slug: 'network-gayrimenkul',
    label: 'Network Gayrimenkul',
    aliases: ['network gayrimenkul', 'network'],
  },
  {
    order: 9,
    slug: 'startkey',
    label: 'Startkey',
    aliases: ['startkey'],
  },
  {
    order: 10,
    slug: 'ekinox',
    label: 'Ekinox',
    aliases: ['ekinox'],
  },
  {
    order: 11,
    slug: 'dialog',
    label: 'Dialog',
    aliases: ['dialog'],
  },
  {
    order: 12,
    slug: 'casavera',
    label: 'Casavera',
    aliases: ['casavera'],
  },
  {
    order: 13,
    slug: 'connecturk',
    label: 'ConnectTurk',
    aliases: ['connecturk', 'connectürk', 'connectturk'],
  },
];

/** Known archive labels present in workbook history but outside daily research 13. */
export const RAKIP_ARCHIVE_ONLY_BRANDS: ReadonlyArray<{
  slug: string;
  label: string;
  aliases: readonly string[];
  reason: string;
}> = [
  {
    slug: 'armada',
    label: 'Armada',
    aliases: ['armada', 'ekinox armada'],
    reason:
      'Workbook archive label; excluded from daily research target list and competitor table rows — retain inventory rows.',
  },
];

function normalizeBrandToken(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function classifyBrandLabel(brand: string): {
  brandClass: RakipBrandClass;
  slug: string;
  canonicalLabel: string;
} {
  const token = normalizeBrandToken(brand);
  if (!token) {
    return { brandClass: 'unknown', slug: 'unknown', canonicalLabel: brand || 'unknown' };
  }

  for (const b of RAKIP_RESEARCH_TARGET_BRANDS) {
    const keys = [b.label, b.slug, ...b.aliases].map(normalizeBrandToken);
    if (keys.some((k) => k === token || token.includes(k) || k.includes(token))) {
      return {
        brandClass: 'research_target',
        slug: b.slug,
        canonicalLabel: b.label,
      };
    }
  }

  for (const b of RAKIP_ARCHIVE_ONLY_BRANDS) {
    const keys = [b.label, b.slug, ...b.aliases].map(normalizeBrandToken);
    if (keys.some((k) => k === token || token.includes(k) || k.includes(token))) {
      return {
        brandClass: 'archive_only',
        slug: b.slug,
        canonicalLabel: b.label,
      };
    }
  }

  return {
    brandClass: 'unknown',
    slug:
      token.replace(/\s+/g, '-') || 'unknown',
    canonicalLabel: brand,
  };
}

export function isResearchTargetBrand(brand: string): boolean {
  return classifyBrandLabel(brand).brandClass === 'research_target';
}
