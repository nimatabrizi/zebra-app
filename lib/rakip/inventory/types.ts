/**
 * PII-minimized Rakip inventory view model (read-only).
 * Never include phone / email / WhatsApp / Instagram handles here.
 */
import type { RakipBrandClass } from './brandScope';

export const RAKIP_INVENTORY_SCHEMA_VERSION = 'rakip-inventory-view-v1' as const;

/** Durable snapshot envelope for Staging / local versioned inventory. */
export const RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION =
  'rakip-inventory-snapshot-v1' as const;

export const RAKIP_REGIONAL_PROVINCES = [
  'İzmir',
  'Manisa',
  'Aydın',
  'Balıkesir',
] as const;

export type RakipInventoryScope = 'regional' | 'all';

/** Never label workbook/cloud data as "current" / "güncel". */
export type RakipFreshnessLabel = 'son_kayitli_envanter';

export type RakipOfficeView = {
  officeKey: string;
  brand: string;
  brandSlug: string;
  brandClass: RakipBrandClass;
  officeName: string;
  province: string;
  district: string;
  sourceUrl: string;
  firstSeen: string;
  /** Per-record last observation time (workbook Son Görülme / cloud observedAt). */
  lastSeen: string;
  lastUpdated: string;
  /** Explicit per-record observation timestamp when known. */
  observedAt: string;
  coverageStatus: string;
  verificationStatus: string;
};

export type RakipPersonView = {
  personKey: string;
  fullName: string;
  brand: string;
  brandSlug: string;
  brandClass: RakipBrandClass;
  officeKey: string;
  officeName: string;
  province: string;
  district: string;
  roleTitle: string;
  officialProfileUrl: string;
  firstSeen: string;
  lastSeen: string;
  lastUpdated: string;
  observedAt: string;
  status: string;
  departureTracking: string;
  verificationStatus: string;
};

export type RakipInventoryBrandStat = {
  id: string;
  label: string;
  brandClass: RakipBrandClass;
  officeCount: number;
  personCount: number;
};

export type RakipInventorySnapshotMeta = {
  schemaVersion: typeof RAKIP_INVENTORY_SCHEMA_VERSION;
  freshnessLabel: RakipFreshnessLabel;
  inventoryStatusLabel: 'Son Kayıtlı Envanter';
  sourceLabel: string;
  /**
   * Workbook / baseline capture label (e.g. Özet subtitle or import attestation).
   * Not the same as per-record observedAt.
   */
  sourceCapturedAt: string | null;
  /** @deprecated use sourceCapturedAt — kept for older UI clients */
  sourceSnapshotAt: string | null;
  /** Max per-record observation / lastSeen in scoped set */
  lastObservedAt: string | null;
  /** Last cloud research run finishedAt merged into this snapshot (if any) */
  lastResearchAt: string | null;
  /** Workbook scan-status / verification timestamps */
  lastVerificationAt: string | null;
  scope: RakipInventoryScope;
  rawOfficeRows: number;
  rawPersonRows: number;
  uniqueOfficeKeys: number;
  uniquePersonKeys: number;
  scopedOfficeCount: number;
  scopedPersonCount: number;
  researchTargetBrandCount: number;
  archiveOnlyBrandCount: number;
  brands: ReadonlyArray<RakipInventoryBrandStat>;
  notes: string[];
  snapshotVersionId: string | null;
  origin:
    | 'local_xlsx'
    | 'versioned_snapshot'
    | 'memory_store'
    | 'cloud_research_merge'
    | 'unknown';
};

export type RakipInventoryBundle = {
  meta: RakipInventorySnapshotMeta;
  offices: RakipOfficeView[];
  people: RakipPersonView[];
  reviewQueue: RakipReviewQueueItem[];
};

export type RakipInventoryQuery = {
  brand?: string;
  province?: string;
  office?: string;
  q?: string;
  brandClass?: RakipBrandClass | 'all';
  limit?: number;
  offset?: number;
};

export type RakipInventoryListResult<T> = {
  meta: RakipInventorySnapshotMeta;
  total: number;
  offset: number;
  limit: number;
  items: T[];
};

export type RakipEventCandidateType =
  | 'consultant_joined'
  | 'consultant_departed_candidate'
  | 'consultant_office_changed'
  | 'consultant_brand_transfer_candidate'
  | 'consultant_reactivated_candidate'
  | 'identity_match_proposed'
  | 'instagram_affiliation_signal'
  | 'coverage_gap'
  | 'source_access_failed';

export type RakipReviewQueueItem = {
  reviewId: string;
  eventType: RakipEventCandidateType;
  personKey: string | null;
  fullName: string | null;
  brandSlug: string | null;
  officeKey: string | null;
  observedAt: string | null;
  sourceUrl: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  verificationStatus: string;
  priorRecordAvailable: boolean;
  evidenceSummary: string;
  researchRunId: string | null;
  /** Unverified candidates stay in review — notifications not sent in this phase. */
  notificationStatus: 'not_sent';
};

/** Versioned durable snapshot (Staging-ready envelope; PII-minimized). */
export type RakipInventorySnapshotV1 = {
  schemaVersion: typeof RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION;
  snapshotVersionId: string;
  createdAt: string;
  supersedesSnapshotVersionId: string | null;
  attestations: {
    labeledAsCurrent: false;
    contactsOmitted: true;
    missingObservationNotDeparture: true;
    archiveBrandsRetained: true;
  };
  bundle: RakipInventoryBundle;
};
