/**
 * Normalize Codex workbook parse → Rakip inventory view.
 * Missing observation ≠ departure. No movement events are synthesized.
 */
import { classifyBrandLabel } from './brandScope';
import type {
  CodexOfficeRaw,
  CodexPersonRaw,
  CodexWorkbookParseResult,
} from './codexWorkbook';
import {
  RAKIP_INVENTORY_SCHEMA_VERSION,
  RAKIP_REGIONAL_PROVINCES,
  type RakipInventoryBundle,
  type RakipInventoryScope,
  type RakipOfficeView,
  type RakipPersonView,
} from './types';

function inRegionalScope(province: string, district: string): boolean {
  if (!(RAKIP_REGIONAL_PROVINCES as readonly string[]).includes(province)) {
    return false;
  }
  if (province === 'Balıkesir') {
    return district.includes('Ayvalık');
  }
  return true;
}

function verificationFromCoverage(coverageStatus: string, lastSeen: string): string {
  if (coverageStatus) return coverageStatus;
  if (lastSeen) return 'observed';
  return 'unknown';
}

function personVerification(person: CodexPersonRaw): string {
  if (person.status) return person.status;
  if (person.lastSeen) return 'observed';
  return 'unknown';
}

function maxTimestamp(values: string[]): string | null {
  const usable = values.map((v) => v.trim()).filter(Boolean);
  if (usable.length === 0) return null;
  return usable.sort().at(-1) ?? null;
}

function toOfficeView(row: CodexOfficeRaw): RakipOfficeView {
  const brandMeta = classifyBrandLabel(row.brand);
  const observedAt = row.lastSeen || row.lastUpdated || row.firstSeen || '';
  return {
    officeKey: row.officeKey,
    brand: row.brand,
    brandSlug: brandMeta.slug,
    brandClass: brandMeta.brandClass,
    officeName: row.officeName,
    province: row.province,
    district: row.district,
    sourceUrl: row.sourceUrl,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    lastUpdated: row.lastUpdated,
    observedAt,
    coverageStatus: row.coverageStatus,
    verificationStatus: verificationFromCoverage(row.coverageStatus, row.lastSeen),
  };
}

function toPersonView(row: CodexPersonRaw): RakipPersonView {
  const brandMeta = classifyBrandLabel(row.brand);
  const observedAt = row.lastSeen || row.lastUpdated || row.firstSeen || '';
  return {
    personKey: row.personKey,
    fullName: row.fullName,
    brand: row.brand,
    brandSlug: brandMeta.slug,
    brandClass: brandMeta.brandClass,
    officeKey: row.officeKey,
    officeName: row.officeName,
    province: row.province,
    district: row.district,
    roleTitle: row.roleTitle,
    officialProfileUrl: row.officialProfileUrl,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    lastUpdated: row.lastUpdated,
    observedAt,
    status: row.status || 'observed',
    departureTracking: row.departureTracking,
    verificationStatus: personVerification(row),
  };
}

function brandStats(
  offices: RakipOfficeView[],
  people: RakipPersonView[]
): RakipInventoryBundle['meta']['brands'] {
  const map = new Map<
    string,
    {
      id: string;
      label: string;
      brandClass: RakipOfficeView['brandClass'];
      officeCount: number;
      personCount: number;
    }
  >();
  for (const o of offices) {
    const cur = map.get(o.brandSlug) || {
      id: o.brandSlug,
      label: o.brand || o.brandSlug,
      brandClass: o.brandClass,
      officeCount: 0,
      personCount: 0,
    };
    cur.officeCount += 1;
    map.set(o.brandSlug, cur);
  }
  for (const p of people) {
    const cur = map.get(p.brandSlug) || {
      id: p.brandSlug,
      label: p.brand || p.brandSlug,
      brandClass: p.brandClass,
      officeCount: 0,
      personCount: 0,
    };
    cur.personCount += 1;
    map.set(p.brandSlug, cur);
  }
  return [...map.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'tr')
  );
}

export function normalizeCodexInventory(
  parsed: CodexWorkbookParseResult,
  scope: RakipInventoryScope = 'regional'
): RakipInventoryBundle {
  const uniqueOfficeKeys = new Set(parsed.offices.map((o) => o.officeKey));
  const uniquePersonKeys = new Set(parsed.people.map((p) => p.personKey));

  const scopedOfficesRaw =
    scope === 'all'
      ? parsed.offices
      : parsed.offices.filter((o) =>
          inRegionalScope(o.province, o.district)
        );
  const scopedPeopleRaw =
    scope === 'all'
      ? parsed.people
      : parsed.people.filter((p) =>
          inRegionalScope(p.province, p.district)
        );

  const offices = scopedOfficesRaw.map(toOfficeView);
  const people = scopedPeopleRaw.map(toPersonView);
  const brands = brandStats(offices, people);

  const scanChecks = parsed.scanStatusRows
    .map((r) => r['Kontrol Zamanı'] || r['Snapshot Son Doğrulama'] || '')
    .filter(Boolean);
  const lastObservedAt = maxTimestamp([
    ...offices.map((o) => o.observedAt || o.lastSeen),
    ...people.map((p) => p.observedAt || p.lastSeen),
  ]);
  const lastVerificationAt = maxTimestamp(scanChecks) || lastObservedAt;

  // Prefer Özet subtitle as source capture label; do not treat as "güncel".
  const sourceCapturedAt = parsed.summarySubtitle || null;

  const notes: string[] = [
    'Missing observation is not departure; no movement events are asserted from this read-only view.',
    'Contact and private social columns are stripped at parse time.',
    'Freshness label is Son Kayıtlı Envanter — never auto-labeled as current.',
    'Research target brands (13) are separate from archive-only labels (e.g. Armada); archive rows are retained.',
  ];
  if (uniquePersonKeys.size !== parsed.people.length) {
    notes.push(
      `Person key uniqueness check: rows=${parsed.people.length} uniqueKeys=${uniquePersonKeys.size}`
    );
  }

  const researchTargetBrandCount = brands.filter(
    (b) => b.brandClass === 'research_target'
  ).length;
  const archiveOnlyBrandCount = brands.filter(
    (b) => b.brandClass === 'archive_only'
  ).length;

  return {
    meta: {
      schemaVersion: RAKIP_INVENTORY_SCHEMA_VERSION,
      freshnessLabel: 'son_kayitli_envanter',
      inventoryStatusLabel: 'Son Kayıtlı Envanter',
      sourceLabel:
        parsed.summaryTitle ||
        'Codex source.xlsx (Ofisler + Aktif Ekip)',
      sourceCapturedAt,
      sourceSnapshotAt: sourceCapturedAt,
      lastObservedAt,
      lastResearchAt: null,
      lastVerificationAt,
      scope,
      rawOfficeRows: parsed.offices.length,
      rawPersonRows: parsed.people.length,
      uniqueOfficeKeys: uniqueOfficeKeys.size,
      uniquePersonKeys: uniquePersonKeys.size,
      scopedOfficeCount: offices.length,
      scopedPersonCount: people.length,
      researchTargetBrandCount,
      archiveOnlyBrandCount,
      brands,
      notes,
      snapshotVersionId: null,
      origin: 'local_xlsx',
    },
    offices,
    people,
    reviewQueue: [],
  };
}
