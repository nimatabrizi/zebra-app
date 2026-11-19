/**
 * Idempotent merge of Cloud Research v2 artifacts into a prior inventory bundle.
 * Partial research never deletes prior verified/archive rows.
 * Missing observation ≠ departure (no auto event without prior + complete coverage).
 */
import { createHash, randomUUID } from 'node:crypto';
import { classifyBrandLabel } from './brandScope';
import {
  reviewItemsFromCloudEventCandidates,
  type CloudEventCandidateInput,
} from './eventCandidates';
import type {
  RakipInventoryBundle,
  RakipInventorySnapshotV1,
  RakipOfficeView,
  RakipPersonView,
  RakipReviewQueueItem,
} from './types';
import { RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION } from './types';

export type CloudResearchOfficeObs = {
  officeKey: string;
  brandSlug?: string;
  brandName?: string;
  officeName?: string;
  province?: string;
  district?: string;
  officeUrl?: string;
  firstSeen?: string;
  lastSeen?: string;
  observedAt?: string;
  priorRecordAvailable?: boolean;
  evidence?: { sourceUrl?: string; confidence?: string };
};

export type CloudResearchPersonObs = {
  personKey: string;
  fullName?: string;
  brandSlug?: string;
  brandName?: string;
  officeKey?: string;
  officeName?: string;
  province?: string;
  district?: string;
  roleTitle?: string;
  officialProfileUrl?: string;
  profileUrl?: string;
  firstSeen?: string;
  lastSeen?: string;
  observedAt?: string;
  status?: string;
  priorRecordAvailable?: boolean;
  evidence?: Array<{ sourceUrl?: string; confidence?: string }> | {
    sourceUrl?: string;
    confidence?: string;
  };
};

export type CloudResearchBrandSlice = {
  brandSlug?: string;
  brandName?: string;
  status?: 'success' | 'partial' | 'failed' | 'skipped_policy' | string;
  offices?: CloudResearchOfficeObs[];
  people?: CloudResearchPersonObs[];
  coverage?: { paginationComplete?: boolean };
};

export type CloudResearchArtifactV2 = {
  schemaVersion?: string;
  researchRunId: string;
  startedAt?: string;
  finishedAt?: string;
  outcome?: 'success' | 'partial' | 'failed' | string;
  priorInventory?: { available?: boolean };
  brands?: CloudResearchBrandSlice[];
  eventCandidates?: CloudEventCandidateInput[];
};

export type CloudResearchMergeReport = {
  researchRunId: string;
  outcome: string;
  officesUpserted: number;
  peopleUpserted: number;
  officesRetainedUnchanged: number;
  peopleRetainedUnchanged: number;
  reviewItemsAdded: number;
  deletedPriorRows: 0;
  partialSafe: boolean;
  notes: string[];
};

function evidenceUrl(
  evidence:
    | Array<{ sourceUrl?: string }>
    | { sourceUrl?: string }
    | undefined
): string {
  if (!evidence) return '';
  if (Array.isArray(evidence)) return evidence[0]?.sourceUrl || '';
  return evidence.sourceUrl || '';
}

function upsertOffice(
  prior: RakipOfficeView | undefined,
  obs: CloudResearchOfficeObs,
  brandName: string
): RakipOfficeView {
  const brandMeta = classifyBrandLabel(brandName || obs.brandName || obs.brandSlug || '');
  const observedAt = obs.observedAt || obs.lastSeen || prior?.observedAt || '';
  return {
    officeKey: obs.officeKey,
    brand: brandName || prior?.brand || brandMeta.canonicalLabel,
    brandSlug: obs.brandSlug || brandMeta.slug || prior?.brandSlug || 'unknown',
    brandClass: brandMeta.brandClass,
    officeName: obs.officeName || prior?.officeName || '',
    province: obs.province || prior?.province || '',
    district: obs.district || prior?.district || '',
    sourceUrl: obs.officeUrl || evidenceUrl(obs.evidence) || prior?.sourceUrl || '',
    firstSeen: prior?.firstSeen || obs.firstSeen || observedAt,
    lastSeen: observedAt || prior?.lastSeen || '',
    lastUpdated: observedAt || prior?.lastUpdated || '',
    observedAt,
    coverageStatus: prior?.coverageStatus || '',
    verificationStatus: 'observed',
  };
}

function upsertPerson(
  prior: RakipPersonView | undefined,
  obs: CloudResearchPersonObs,
  brandName: string
): RakipPersonView {
  const brandMeta = classifyBrandLabel(brandName || obs.brandName || obs.brandSlug || '');
  const observedAt = obs.observedAt || obs.lastSeen || prior?.observedAt || '';
  return {
    personKey: obs.personKey,
    fullName: obs.fullName || prior?.fullName || '',
    brand: brandName || prior?.brand || brandMeta.canonicalLabel,
    brandSlug: obs.brandSlug || brandMeta.slug || prior?.brandSlug || 'unknown',
    brandClass: brandMeta.brandClass,
    officeKey: obs.officeKey || prior?.officeKey || '',
    officeName: obs.officeName || prior?.officeName || '',
    province: obs.province || prior?.province || '',
    district: obs.district || prior?.district || '',
    roleTitle: obs.roleTitle || prior?.roleTitle || '',
    officialProfileUrl:
      obs.officialProfileUrl ||
      obs.profileUrl ||
      prior?.officialProfileUrl ||
      '',
    firstSeen: prior?.firstSeen || obs.firstSeen || observedAt,
    lastSeen: observedAt || prior?.lastSeen || '',
    lastUpdated: observedAt || prior?.lastUpdated || '',
    observedAt,
    status: obs.status || prior?.status || 'observed',
    departureTracking: prior?.departureTracking || '',
    verificationStatus: obs.status || 'observed',
  };
}

/**
 * Merge cloud research observations into prior inventory.
 * Never deletes prior offices/people on partial/failed slices.
 */
export function mergeCloudResearchIntoBundle(
  prior: RakipInventoryBundle,
  artifact: CloudResearchArtifactV2
): { bundle: RakipInventoryBundle; report: CloudResearchMergeReport } {
  const officeMap = new Map(prior.offices.map((o) => [o.officeKey, o]));
  const personMap = new Map(prior.people.map((p) => [p.personKey, p]));
  const priorOfficeCount = officeMap.size;
  const priorPersonCount = personMap.size;

  let officesUpserted = 0;
  let peopleUpserted = 0;
  const notes: string[] = [
    'Partial cloud research retains prior verified/archive rows.',
    'Missing observation is not treated as departure by the merge engine.',
  ];

  for (const brand of artifact.brands || []) {
    const brandName = brand.brandName || brand.brandSlug || '';
    for (const office of brand.offices || []) {
      if (!office.officeKey) continue;
      const prev = officeMap.get(office.officeKey);
      officeMap.set(office.officeKey, upsertOffice(prev, office, brandName));
      officesUpserted += 1;
    }
    for (const person of brand.people || []) {
      if (!person.personKey) continue;
      const prev = personMap.get(person.personKey);
      personMap.set(person.personKey, upsertPerson(prev, person, brandName));
      peopleUpserted += 1;
    }
    if (brand.status === 'partial' || brand.status === 'failed') {
      notes.push(
        `Brand ${brand.brandSlug || brandName || '?'} status=${brand.status}; prior rows kept.`
      );
    }
  }

  const reviewFromCloud = reviewItemsFromCloudEventCandidates(
    artifact.eventCandidates || [],
    {
      researchRunId: artifact.researchRunId,
      priorInventoryAvailable: artifact.priorInventory?.available === true,
    }
  );

  // Deduplicate review queue by reviewId / event+person+run
  const reviewMap = new Map<string, RakipReviewQueueItem>();
  for (const item of [...prior.reviewQueue, ...reviewFromCloud]) {
    reviewMap.set(item.reviewId, item);
  }

  const offices = [...officeMap.values()];
  const people = [...personMap.values()];
  const brands = rebuildBrandStats(offices, people);

  const lastObservedAt = maxTs([
    ...offices.map((o) => o.observedAt),
    ...people.map((p) => p.observedAt),
  ]);

  const bundle: RakipInventoryBundle = {
    meta: {
      ...prior.meta,
      freshnessLabel: 'son_kayitli_envanter',
      inventoryStatusLabel: 'Son Kayıtlı Envanter',
      lastObservedAt: lastObservedAt || prior.meta.lastObservedAt,
      lastResearchAt: artifact.finishedAt || prior.meta.lastResearchAt,
      scopedOfficeCount: offices.length,
      scopedPersonCount: people.length,
      uniqueOfficeKeys: offices.length,
      uniquePersonKeys: people.length,
      researchTargetBrandCount: brands.filter((b) => b.brandClass === 'research_target')
        .length,
      archiveOnlyBrandCount: brands.filter((b) => b.brandClass === 'archive_only')
        .length,
      brands,
      notes: [...new Set([...prior.meta.notes, ...notes])],
      origin: 'cloud_research_merge',
    },
    offices,
    people,
    reviewQueue: [...reviewMap.values()],
  };

  const report: CloudResearchMergeReport = {
    researchRunId: artifact.researchRunId,
    outcome: String(artifact.outcome || 'unknown'),
    officesUpserted,
    peopleUpserted,
    officesRetainedUnchanged: Math.max(0, priorOfficeCount - 0),
    peopleRetainedUnchanged: Math.max(0, priorPersonCount - 0),
    reviewItemsAdded: reviewFromCloud.length,
    deletedPriorRows: 0,
    partialSafe: artifact.outcome !== 'success',
    notes,
  };

  // retained unchanged = prior keys still present
  report.officesRetainedUnchanged = prior.offices.filter((o) =>
    officeMap.has(o.officeKey)
  ).length;
  report.peopleRetainedUnchanged = prior.people.filter((p) =>
    personMap.has(p.personKey)
  ).length;

  return { bundle, report };
}

function rebuildBrandStats(
  offices: RakipOfficeView[],
  people: RakipPersonView[]
): RakipInventoryBundle['meta']['brands'] {
  const map = new Map<string, RakipInventoryBundle['meta']['brands'][number]>();
  for (const o of offices) {
    const cur = map.get(o.brandSlug) || {
      id: o.brandSlug,
      label: o.brand,
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
      label: p.brand,
      brandClass: p.brandClass,
      officeCount: 0,
      personCount: 0,
    };
    cur.personCount += 1;
    map.set(p.brandSlug, cur);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'tr'));
}

function maxTs(values: string[]): string | null {
  const usable = values.map((v) => v.trim()).filter(Boolean);
  if (!usable.length) return null;
  return usable.sort().at(-1) ?? null;
}

export function buildInventorySnapshotV1(
  bundle: RakipInventoryBundle,
  opts?: { supersedesSnapshotVersionId?: string | null; createdAt?: string }
): RakipInventorySnapshotV1 {
  const createdAt = opts?.createdAt || new Date().toISOString();
  const snapshotVersionId = `snap_${createHash('sha256')
    .update(`${bundle.meta.sourceLabel}|${createdAt}|${randomUUID()}`)
    .digest('hex')
    .slice(0, 16)}`;

  return {
    schemaVersion: RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION,
    snapshotVersionId,
    createdAt,
    supersedesSnapshotVersionId: opts?.supersedesSnapshotVersionId ?? null,
    attestations: {
      labeledAsCurrent: false,
      contactsOmitted: true,
      missingObservationNotDeparture: true,
      archiveBrandsRetained: true,
    },
    bundle: {
      ...bundle,
      meta: {
        ...bundle.meta,
        snapshotVersionId,
        freshnessLabel: 'son_kayitli_envanter',
        inventoryStatusLabel: 'Son Kayıtlı Envanter',
      },
    },
  };
}
