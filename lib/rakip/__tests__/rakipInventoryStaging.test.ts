/**
 * Offline Staging inventory import/read gates — no network, no real PII.
 * Run: npm run test:rakip:inventory:staging
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import {
  RAKIP_RESEARCH_TARGET_BRANDS,
  RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION,
  RAKIP_INVENTORY_ALLOW_LIVE_IMPORT_ENV,
  RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV,
  RAKIP_INVENTORY_USE_STAGING_STORE_ENV,
  RAKIP_INVENTORY_STAGING_REF,
  RAKIP_INVENTORY_PREVIEW_HOST,
  RAKIP_INVENTORY_PRIVATE_BUCKET,
  RAKIP_BASELINE_IMPORT_PLAN,
  RAKIP_INVENTORY_STAGING_OPERATOR_CHECKLIST,
  assertInventoryPreviewHost,
  assertInventoryStagingEnvFailClosed,
  assertNeverCurrentPublish,
  assertNotProductionRuntime,
  buildInventorySnapshotObjectPath,
  clearRakipInventoryCache,
  createMemoryInventoryImportDeps,
  createMemoryStagingInventoryReadDeps,
  importInventorySnapshotToStaging,
  loadAndValidateInventoryMigration,
  loadInventorySnapshotFromStagingStore,
  loadRakipInventoryBundle,
  setStagingInventoryReadDepsForTests,
  type RakipInventorySnapshotV1,
  type InventorySnapshotMetaRow,
} from '../inventory';
import { isRakipUserIdAllowed, RAKIP_ALLOWED_USER_IDS_ENV } from '../../rakipAccess';

const NIMA_ID = '11111111-1111-4111-8111-111111111111';

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function buildMiniSnapshot(overrides?: {
  snapshotVersionId?: string;
  labeledAsCurrent?: boolean;
  officesEmpty?: boolean;
  dropArchive?: boolean;
  lastResearchAt?: string | null;
}): RakipInventorySnapshotV1 {
  const snapshotVersionId = overrides?.snapshotVersionId || 'snap_testbaseline01';
  const brands: Array<{
    id: string;
    label: string;
    brandClass: 'research_target' | 'archive_only';
    officeCount: number;
    personCount: number;
  }> = [
    ...RAKIP_RESEARCH_TARGET_BRANDS.map((b) => ({
      id: b.slug,
      label: b.label,
      brandClass: 'research_target' as const,
      officeCount: 1,
      personCount: 1,
    })),
  ];
  if (!overrides?.dropArchive) {
    brands.push({
      id: 'armada',
      label: 'Armada',
      brandClass: 'archive_only',
      officeCount: 1,
      personCount: 1,
    });
  }

  const offices = overrides?.officesEmpty
    ? []
    : [
        {
          officeKey: 'cb:test-office',
          brand: 'Coldwell Banker',
          brandSlug: 'coldwell-banker',
          brandClass: 'research_target' as const,
          officeName: 'TEST OFFICE',
          province: 'İzmir',
          district: 'Konak',
          sourceUrl: 'https://example.invalid/ofis',
          firstSeen: '2026-08-01',
          lastSeen: '2026-11-16',
          lastUpdated: '2026-11-16',
          observedAt: '2026-11-16',
          coverageStatus: 'ok',
          verificationStatus: 'recorded',
        },
        {
          officeKey: 'armada:test-office',
          brand: 'Armada',
          brandSlug: 'armada',
          brandClass: 'archive_only' as const,
          officeName: 'TEST ARMADA',
          province: 'İzmir',
          district: 'Bornova',
          sourceUrl: 'https://example.invalid/armada',
          firstSeen: '2026-08-01',
          lastSeen: '2026-11-16',
          lastUpdated: '2026-11-16',
          observedAt: '2026-11-16',
          coverageStatus: 'archive',
          verificationStatus: 'recorded',
        },
      ];

  const people = overrides?.officesEmpty
    ? []
    : [
        {
          personKey: 'cb:test-person',
          fullName: 'EXAMPLE PERSON',
          brand: 'Coldwell Banker',
          brandSlug: 'coldwell-banker',
          brandClass: 'research_target' as const,
          officeKey: 'cb:test-office',
          officeName: 'TEST OFFICE',
          province: 'İzmir',
          district: 'Konak',
          roleTitle: 'Danışman',
          officialProfileUrl: 'https://example.invalid/p/1',
          firstSeen: '2026-08-01',
          lastSeen: '2026-11-16',
          lastUpdated: '2026-11-16',
          observedAt: '2026-11-16',
          status: 'active',
          departureTracking: 'none',
          verificationStatus: 'recorded',
        },
      ];

  return {
    schemaVersion: RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION,
    snapshotVersionId,
    createdAt: '2026-11-19T10:00:00.000Z',
    supersedesSnapshotVersionId: null,
    attestations: {
      labeledAsCurrent: (overrides?.labeledAsCurrent ?? false) as false,
      contactsOmitted: true,
      missingObservationNotDeparture: true,
      archiveBrandsRetained: true,
    },
    bundle: {
      meta: {
        schemaVersion: 'rakip-inventory-view-v1',
        freshnessLabel: 'son_kayitli_envanter',
        inventoryStatusLabel: 'Son Kayıtlı Envanter',
        sourceLabel: 'synthetic-test',
        sourceCapturedAt: 'synthetic capture label',
        sourceSnapshotAt: 'synthetic capture label',
        lastObservedAt: '2026-11-16',
        lastResearchAt:
          overrides?.lastResearchAt === undefined
            ? null
            : overrides.lastResearchAt,
        lastVerificationAt: null,
        scope: 'regional',
        rawOfficeRows: offices.length,
        rawPersonRows: people.length,
        uniqueOfficeKeys: offices.length,
        uniquePersonKeys: people.length,
        scopedOfficeCount: offices.length,
        scopedPersonCount: people.length,
        researchTargetBrandCount: 13,
        archiveOnlyBrandCount: overrides?.dropArchive ? 0 : 1,
        brands,
        notes: ['synthetic offline fixture'],
        snapshotVersionId,
        origin: 'local_xlsx',
      },
      offices,
      people,
      reviewQueue: [],
    },
  };
}

function stagingEnv(extra: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: 'preview',
    CB360_TARGET_ENV: 'staging',
    CB360_ALLOWED_SUPABASE_REF: RAKIP_INVENTORY_STAGING_REF,
    CB360_STAGING_PROJECT_REF: RAKIP_INVENTORY_STAGING_REF,
    CB360_STAGING_SUPABASE_URL: `https://${RAKIP_INVENTORY_STAGING_REF}.supabase.co`,
    CB360_STAGING_SERVICE_ROLE_KEY: 'test-service-role-not-real',
    ...extra,
  };
}

describe('inventory migration contract', () => {
  it('draft SQL passes offline validation checks', () => {
    const report = loadAndValidateInventoryMigration();
    assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.ok)));
  });
});

describe('staging env gates', () => {
  it('refuses production runtime', () => {
    assert.throws(
      () => assertNotProductionRuntime({ VERCEL_ENV: 'production' }),
      /production/
    );
  });

  it('refuses wrong preview host', () => {
    assert.throws(
      () => assertInventoryPreviewHost('https://evil.example'),
      /Preview host/
    );
    assert.equal(
      assertInventoryPreviewHost(RAKIP_INVENTORY_PREVIEW_HOST),
      RAKIP_INVENTORY_PREVIEW_HOST
    );
  });

  it('fail-closed on wrong staging ref / missing secrets', () => {
    assert.throws(
      () =>
        assertInventoryStagingEnvFailClosed(
          stagingEnv({ CB360_STAGING_PROJECT_REF: 'wrongref000001' })
        ),
      /approved Staging ref/
    );
    assert.throws(
      () =>
        assertInventoryStagingEnvFailClosed(
          stagingEnv({ CB360_STAGING_SERVICE_ROLE_KEY: '' })
        ),
      /required/
    );
  });

  it('rejects labeledAsCurrent publish', () => {
    assert.throws(() => assertNeverCurrentPublish(true), /labeledAsCurrent/);
  });
});

describe('unauthorized access (UUID gate)', () => {
  it('denies missing allowlist and non-allowlisted UUID', () => {
    assert.equal(isRakipUserIdAllowed(NIMA_ID, {}), false);
    assert.equal(
      isRakipUserIdAllowed(NIMA_ID, { [RAKIP_ALLOWED_USER_IDS_ENV]: '' }),
      false
    );
    assert.equal(
      isRakipUserIdAllowed('22222222-2222-4222-8222-222222222222', {
        [RAKIP_ALLOWED_USER_IDS_ENV]: NIMA_ID,
      }),
      false
    );
    assert.equal(
      isRakipUserIdAllowed(NIMA_ID, { [RAKIP_ALLOWED_USER_IDS_ENV]: NIMA_ID }),
      true
    );
  });
});

describe('import integrity + idempotency', () => {
  let tmpDir = '';
  let filePath = '';
  let snapshot: RakipInventorySnapshotV1;
  let bytes: Buffer;
  let digest = '';

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rakip-inv-'));
    snapshot = buildMiniSnapshot();
    bytes = Buffer.from(`${JSON.stringify(snapshot)}\n`, 'utf8');
    digest = sha256Hex(bytes);
    filePath = path.join(tmpDir, 'snap.json');
    await fs.writeFile(filePath, bytes);
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('dry-run ready with approval + integrity', async () => {
    const report = await importInventorySnapshotToStaging({
      filePath,
      expectedSha256: digest,
      expectedSnapshotId: snapshot.snapshotVersionId,
      expectedByteSize: bytes.byteLength,
      approve: true,
      mode: 'dry-run',
      env: stagingEnv({
        [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: snapshot.snapshotVersionId,
      }),
    });
    assert.equal(report.ok, true);
    assert.equal(report.outcome, 'ready');
    assert.equal(report.labeledAsCurrent, false);
    assert.equal(report.lastResearchAt, null);
    assert.equal(report.researchTargetBrandCount, 13);
    assert.equal(report.archiveOnlyBrandCount, 1);
  });

  it('refuses SHA mismatch', async () => {
    const report = await importInventorySnapshotToStaging({
      filePath,
      expectedSha256: 'a'.repeat(64),
      expectedSnapshotId: snapshot.snapshotVersionId,
      expectedByteSize: bytes.byteLength,
      approve: true,
      mode: 'dry-run',
      env: stagingEnv({
        [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: snapshot.snapshotVersionId,
      }),
    });
    assert.equal(report.ok, false);
    assert.match(report.error || '', /SHA-256|mismatch/i);
  });

  it('refuses wrong environment (production)', async () => {
    const report = await importInventorySnapshotToStaging({
      filePath,
      expectedSha256: digest,
      expectedSnapshotId: snapshot.snapshotVersionId,
      expectedByteSize: bytes.byteLength,
      approve: true,
      mode: 'dry-run',
      env: stagingEnv({
        VERCEL_ENV: 'production',
        [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: snapshot.snapshotVersionId,
      }),
    });
    assert.equal(report.ok, false);
    assert.equal(report.outcome, 'refused');
  });

  it('refuses partial empty snapshot', async () => {
    const partial = buildMiniSnapshot({ officesEmpty: true });
    const partialBytes = Buffer.from(`${JSON.stringify(partial)}\n`, 'utf8');
    const partialPath = path.join(tmpDir, 'partial.json');
    await fs.writeFile(partialPath, partialBytes);
    const report = await importInventorySnapshotToStaging({
      filePath: partialPath,
      expectedSha256: sha256Hex(partialBytes),
      expectedSnapshotId: partial.snapshotVersionId,
      expectedByteSize: partialBytes.byteLength,
      approve: true,
      mode: 'dry-run',
      env: stagingEnv({
        [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: partial.snapshotVersionId,
      }),
    });
    assert.equal(report.ok, false);
    assert.match(report.error || '', /Partial|empty/i);
  });

  it('refuses drop of archive_only brands', async () => {
    const noArchive = buildMiniSnapshot({
      snapshotVersionId: 'snap_testnoarchive01',
      dropArchive: true,
    });
    const b = Buffer.from(`${JSON.stringify(noArchive)}\n`, 'utf8');
    const p = path.join(tmpDir, 'noarchive.json');
    await fs.writeFile(p, b);
    const report = await importInventorySnapshotToStaging({
      filePath: p,
      expectedSha256: sha256Hex(b),
      expectedSnapshotId: noArchive.snapshotVersionId,
      expectedByteSize: b.byteLength,
      approve: true,
      mode: 'dry-run',
      env: stagingEnv({
        [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: noArchive.snapshotVersionId,
      }),
    });
    assert.equal(report.ok, false);
    assert.match(report.error || '', /archive_only/i);
  });

  it('execute idempotent replay with memory deps', async () => {
    const deps = createMemoryInventoryImportDeps();
    const env = stagingEnv({
      [RAKIP_INVENTORY_ALLOW_LIVE_IMPORT_ENV]: '1',
      [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: snapshot.snapshotVersionId,
    });

    const first = await importInventorySnapshotToStaging({
      filePath,
      expectedSha256: digest,
      expectedSnapshotId: snapshot.snapshotVersionId,
      expectedByteSize: bytes.byteLength,
      approve: true,
      mode: 'execute',
      env,
      deps,
    });
    assert.equal(first.ok, true);
    assert.equal(first.outcome, 'imported');
    assert.ok(first.objectPath?.startsWith('inventory-snapshots/'));
    assert.equal(deps.latestId, snapshot.snapshotVersionId);

    const second = await importInventorySnapshotToStaging({
      filePath,
      expectedSha256: digest,
      expectedSnapshotId: snapshot.snapshotVersionId,
      expectedByteSize: bytes.byteLength,
      approve: true,
      mode: 'execute',
      env,
      deps,
    });
    assert.equal(second.ok, true);
    assert.equal(second.outcome, 'idempotent_replay');
  });

  it('execute refuses without live-import flag', async () => {
    const report = await importInventorySnapshotToStaging({
      filePath,
      expectedSha256: digest,
      expectedSnapshotId: snapshot.snapshotVersionId,
      expectedByteSize: bytes.byteLength,
      approve: true,
      mode: 'execute',
      env: stagingEnv({
        [RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]: snapshot.snapshotVersionId,
      }),
      deps: createMemoryInventoryImportDeps(),
    });
    assert.equal(report.ok, false);
    assert.match(report.error || '', /ALLOW_LIVE_IMPORT/);
  });
});

describe('staging durable read + fallback', () => {
  it('loads from staging store when enabled and integrity matches', async () => {
    clearRakipInventoryCache();
    const snapshot = buildMiniSnapshot({ snapshotVersionId: 'snap_readtest00001' });
    const bytes = Buffer.from(`${JSON.stringify(snapshot)}\n`, 'utf8');
    const objectPath = buildInventorySnapshotObjectPath({
      snapshotVersionId: snapshot.snapshotVersionId,
      at: new Date('2026-11-19T00:00:00Z'),
    });
    const meta: InventorySnapshotMetaRow = {
      id: snapshot.snapshotVersionId,
      schema_version: snapshot.schemaVersion,
      supersedes_id: null,
      source_captured_at: snapshot.bundle.meta.sourceCapturedAt,
      last_observed_at: snapshot.bundle.meta.lastObservedAt,
      last_research_at: null,
      office_count: snapshot.bundle.offices.length,
      person_count: snapshot.bundle.people.length,
      research_target_brand_count: 13,
      archive_only_brand_count: 1,
      labeled_as_current: false,
      object_path: objectPath,
      sha256: sha256Hex(bytes),
      byte_size: bytes.byteLength,
      bucket_id: RAKIP_INVENTORY_PRIVATE_BUCKET,
      notes: [],
      import_attestation: 'test',
    };
    const deps = createMemoryStagingInventoryReadDeps({ meta, objectBytes: bytes });
    const loaded = await loadInventorySnapshotFromStagingStore({
      env: stagingEnv({ [RAKIP_INVENTORY_USE_STAGING_STORE_ENV]: '1' }),
      deps,
    });
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.snapshot.bundle.meta.inventoryStatusLabel, 'Son Kayıtlı Envanter');
    assert.equal(loaded.snapshot.bundle.meta.lastResearchAt, null);
    assert.equal(loaded.snapshot.attestations.missingObservationNotDeparture, true);
  });

  it('fail-closed on SHA mismatch / stale storage', async () => {
    const snapshot = buildMiniSnapshot({ snapshotVersionId: 'snap_readbad000002' });
    const bytes = Buffer.from(`${JSON.stringify(snapshot)}\n`, 'utf8');
    const objectPath = buildInventorySnapshotObjectPath({
      snapshotVersionId: snapshot.snapshotVersionId,
    });
    const meta: InventorySnapshotMetaRow = {
      id: snapshot.snapshotVersionId,
      schema_version: snapshot.schemaVersion,
      supersedes_id: null,
      source_captured_at: null,
      last_observed_at: null,
      last_research_at: null,
      office_count: 1,
      person_count: 1,
      research_target_brand_count: 13,
      archive_only_brand_count: 1,
      labeled_as_current: false,
      object_path: objectPath,
      sha256: 'b'.repeat(64),
      byte_size: bytes.byteLength,
      bucket_id: RAKIP_INVENTORY_PRIVATE_BUCKET,
      notes: [],
      import_attestation: null,
    };
    const badSha = await loadInventorySnapshotFromStagingStore({
      env: stagingEnv({ [RAKIP_INVENTORY_USE_STAGING_STORE_ENV]: '1' }),
      deps: createMemoryStagingInventoryReadDeps({ meta, objectBytes: bytes }),
    });
    assert.equal(badSha.ok, false);
    if (!badSha.ok) assert.equal(badSha.reason, 'integrity_failed');

    const stale = await loadInventorySnapshotFromStagingStore({
      env: stagingEnv({ [RAKIP_INVENTORY_USE_STAGING_STORE_ENV]: '1' }),
      deps: createMemoryStagingInventoryReadDeps({
        meta,
        objectBytes: null,
      }),
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.reason, 'stale_storage');
  });

  it('falls back to path_unset when staging disabled and no local paths', async () => {
    clearRakipInventoryCache();
    const loaded = await loadRakipInventoryBundle({
      VERCEL_ENV: 'preview',
    });
    assert.equal(loaded.ok, false);
    if (!loaded.ok) assert.equal(loaded.reason, 'path_unset');
  });

  it('staging enabled + failing store does not silently fall back', async () => {
    clearRakipInventoryCache();
    setStagingInventoryReadDepsForTests(
      createMemoryStagingInventoryReadDeps({ meta: null, objectBytes: null })
    );
    const loaded = await loadRakipInventoryBundle(
      stagingEnv({ [RAKIP_INVENTORY_USE_STAGING_STORE_ENV]: '1' })
    );
    assert.equal(loaded.ok, false);
    if (!loaded.ok) assert.equal(loaded.reason, 'staging_failed');
    clearRakipInventoryCache();
  });
});

describe('operator checklist + baseline plan', () => {
  it('documents privacy classification and known baseline ids without PII lists', () => {
    assert.equal(RAKIP_INVENTORY_STAGING_OPERATOR_CHECKLIST.privacyClassification.anonymous, false);
    assert.equal(
      RAKIP_INVENTORY_STAGING_OPERATOR_CHECKLIST.privacyClassification.contactsOmitted,
      true
    );
    assert.equal(
      RAKIP_BASELINE_IMPORT_PLAN.knownLocalBaseline.snapshotVersionId,
      'snap_3428ab85404569e8'
    );
    assert.equal(RAKIP_BASELINE_IMPORT_PLAN.brandPolicy.researchTargets, 13);
  });
});
