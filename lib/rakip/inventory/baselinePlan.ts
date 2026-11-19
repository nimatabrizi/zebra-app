/**
 * Dated baseline import plan for regional inventory → Staging snapshot.
 * This module is documentation-as-code; it does not upload or mutate workbooks.
 */

export const RAKIP_BASELINE_IMPORT_PLAN = {
  planId: 'rakip-baseline-regional-v1',
  status: 'code_ready_awaiting_staging_operator_approval',
  expectedRegionalCounts: {
    offices: 318,
    people: 4052,
    note: 'Matched local baseline export 2026-11-19; re-measure at Staging import time.',
  },
  knownLocalBaseline: {
    snapshotVersionId: 'snap_3428ab85404569e8',
    sha256:
      'def953c7845401a40963966beec2b7802320af27d24b42dc617aaaa36e7a6758',
    byteSize: 3147379,
  },
  dateFields: {
    sourceCapturedAt:
      'Workbook Özet subtitle / import attestation (may be older, e.g. 31.07.2026 style labels)',
    recordObservedAt:
      'Per-row Son Görülme / observedAt — may be newer than sourceCapturedAt',
    lastResearchAt: 'Null until a Cloud Research v2 run is merged',
    freshnessLabel: 'son_kayitli_envanter (never "güncel"/"current")',
  },
  brandPolicy: {
    researchTargets: 13,
    archiveLabelsRetained: ['Armada'],
    deleteArchiveRows: false,
  },
  idempotency: {
    snapshotSchema: 'rakip-inventory-snapshot-v1',
    keyOffices: 'officeKey',
    keyPeople: 'personKey',
    supersedesChain: true,
    importReplay: 'same id+sha256+byteSize → idempotent_replay',
  },
  safetyGates: [
    'UUID Rakip UI gate remains enforced on every /api/rakip-ui/inventory read',
    'Contacts stripped before any snapshot leaves Mac',
    'No Production publish',
    'No current-bundle publish from baseline pilot',
    'Private bucket cb360-private only',
    'RAKIP_INVENTORY_ALLOW_LIVE_IMPORT + operator approval bound to snapshot id',
    'CB360 lease/upload bridge remains separate (opaque xlsx path)',
  ],
  blockersForStagingUpload: [
    'Explicit operator approval for Staging migration + upload',
    'Apply cb360_inventory_* draft migration on Staging only',
    'Shell: RAKIP_INVENTORY_ALLOW_LIVE_IMPORT=1 + OPERATOR_APPROVAL=<snapshot id>',
    'Preview: RAKIP_INVENTORY_USE_STAGING_STORE=1 + Staging secrets + allowlist',
  ],
  localBaselineReady: {
    schema: 'rakip-inventory-snapshot-v1',
    contactsOmitted: true,
    labeledAsCurrent: false,
    lastResearchAt: null,
    storageHint:
      'Local file lives outside git (Desktop CB360-Cloud-Hazirlik/local-snapshots); never commit or push',
  },
  nextConcreteStepWhenApproved:
    'Apply draft inventory migration on Staging → dry-run import CLI → one execute import → enable Staging store read on Preview → verify UUID gate.',
} as const;
