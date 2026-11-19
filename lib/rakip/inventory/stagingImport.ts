/**
 * Staging-only import of rakip-inventory-snapshot-v1 into private storage + metadata.
 * Live network only when caller injects deps AND live-import env is set.
 * Never publishes current; never logs person lists / secret values.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import type { Cb360EnvBag } from '../../cb360/envBag';
import {
  parseInventorySnapshotJson,
} from './store';
import type { RakipInventorySnapshotV1 } from './types';
import { RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION } from './types';
import {
  assertInventoryPreviewHost,
  assertInventoryStagingEnvFailClosed,
  assertInventoryStagingRef,
  assertNeverCurrentPublish,
  assertNotProductionRuntime,
  assertOperatorApprovalForSnapshot,
  isRakipInventoryLiveImportAllowed,
  RakipInventoryStagingGateError,
  RAKIP_INVENTORY_PRIVATE_BUCKET,
} from './stagingEnv';
import {
  assertPrivateInventoryObjectPath,
  buildInventorySnapshotObjectPath,
} from './stagingPaths';

export type InventorySnapshotMetaRow = {
  id: string;
  schema_version: string;
  supersedes_id: string | null;
  source_captured_at: string | null;
  last_observed_at: string | null;
  last_research_at: string | null;
  office_count: number;
  person_count: number;
  research_target_brand_count: number;
  archive_only_brand_count: number;
  labeled_as_current: boolean;
  object_path: string;
  sha256: string;
  byte_size: number;
  bucket_id: string;
  notes: unknown;
  import_attestation: string | null;
};

export type InventoryImportDeps = {
  getSnapshotById(id: string): Promise<InventorySnapshotMetaRow | null>;
  upsertSnapshot(row: InventorySnapshotMetaRow): Promise<void>;
  setLatest(snapshotId: string): Promise<void>;
  objectExists(bucket: string, objectPath: string): Promise<boolean>;
  uploadObject(params: {
    bucket: string;
    objectPath: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<void>;
  downloadObject(bucket: string, objectPath: string): Promise<Buffer>;
};

export type InventoryImportRequest = {
  filePath: string;
  expectedSha256: string;
  expectedSnapshotId: string;
  expectedByteSize: number;
  approve: boolean;
  mode: 'dry-run' | 'execute';
  previewHost?: string;
  supersedesSnapshotId?: string | null;
  env?: Cb360EnvBag;
  deps?: InventoryImportDeps;
};

export type InventoryImportReport = {
  ok: boolean;
  mode: 'dry-run' | 'execute';
  outcome: 'ready' | 'imported' | 'idempotent_replay' | 'refused' | 'failed';
  snapshotVersionId: string | null;
  objectPath: string | null;
  sha256: string | null;
  byteSize: number | null;
  officeCount: number | null;
  personCount: number | null;
  researchTargetBrandCount: number | null;
  archiveOnlyBrandCount: number | null;
  labeledAsCurrent: false;
  lastResearchAt: string | null;
  steps: Array<{ step: string; status: 'ok' | 'skip' | 'fail'; detail: string }>;
  error?: string;
};

function push(
  steps: InventoryImportReport['steps'],
  step: string,
  status: 'ok' | 'skip' | 'fail',
  detail: string
): void {
  steps.push({ step, status, detail });
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function refuse(
  steps: InventoryImportReport['steps'],
  partial: Partial<InventoryImportReport>,
  error: string
): InventoryImportReport {
  return {
    ok: false,
    mode: partial.mode || 'dry-run',
    outcome: 'refused',
    snapshotVersionId: partial.snapshotVersionId ?? null,
    objectPath: partial.objectPath ?? null,
    sha256: partial.sha256 ?? null,
    byteSize: partial.byteSize ?? null,
    officeCount: partial.officeCount ?? null,
    personCount: partial.personCount ?? null,
    researchTargetBrandCount: partial.researchTargetBrandCount ?? null,
    archiveOnlyBrandCount: partial.archiveOnlyBrandCount ?? null,
    labeledAsCurrent: false,
    lastResearchAt: partial.lastResearchAt ?? null,
    steps,
    error,
  };
}

export function validateSnapshotIntegrity(params: {
  bytes: Buffer;
  expectedSha256: string;
  expectedSnapshotId: string;
  expectedByteSize: number;
}): {
  snapshot: RakipInventorySnapshotV1;
  sha256: string;
  byteSize: number;
} {
  const byteSize = params.bytes.byteLength;
  if (byteSize !== params.expectedByteSize) {
    throw new RakipInventoryStagingGateError(
      `byteSize mismatch: got ${byteSize} expected ${params.expectedByteSize}`,
      'wrong_env'
    );
  }
  const sha256 = sha256Hex(params.bytes);
  if (sha256 !== params.expectedSha256.toLowerCase()) {
    throw new RakipInventoryStagingGateError(
      'SHA-256 mismatch',
      'wrong_env'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(params.bytes.toString('utf8'));
  } catch {
    throw new RakipInventoryStagingGateError(
      'Snapshot JSON parse failed',
      'wrong_env'
    );
  }

  const snapshot = parseInventorySnapshotJson(parsed);
  if (snapshot.schemaVersion !== RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION) {
    throw new RakipInventoryStagingGateError(
      'Unsupported snapshot schemaVersion',
      'wrong_env'
    );
  }
  if (snapshot.snapshotVersionId !== params.expectedSnapshotId) {
    throw new RakipInventoryStagingGateError(
      'snapshotVersionId mismatch',
      'wrong_env'
    );
  }
  assertNeverCurrentPublish(snapshot.attestations.labeledAsCurrent);
  if (!snapshot.attestations.contactsOmitted) {
    throw new RakipInventoryStagingGateError(
      'contactsOmitted attestation required',
      'wrong_env'
    );
  }
  if (!snapshot.attestations.missingObservationNotDeparture) {
    throw new RakipInventoryStagingGateError(
      'missingObservationNotDeparture attestation required',
      'wrong_env'
    );
  }
  if (!snapshot.attestations.archiveBrandsRetained) {
    throw new RakipInventoryStagingGateError(
      'archiveBrandsRetained attestation required',
      'wrong_env'
    );
  }
  if (!Array.isArray(snapshot.bundle.offices) || snapshot.bundle.offices.length === 0) {
    throw new RakipInventoryStagingGateError(
      'Partial/empty offices rejected',
      'wrong_env'
    );
  }
  if (!Array.isArray(snapshot.bundle.people) || snapshot.bundle.people.length === 0) {
    throw new RakipInventoryStagingGateError(
      'Partial/empty people rejected',
      'wrong_env'
    );
  }

  const researchTargets = snapshot.bundle.meta.brands.filter(
    (b) => b.brandClass === 'research_target'
  ).length;
  const archiveOnly = snapshot.bundle.meta.brands.filter(
    (b) => b.brandClass === 'archive_only'
  ).length;
  if (researchTargets !== 13) {
    throw new RakipInventoryStagingGateError(
      `Expected 13 research_target brands, got ${researchTargets}`,
      'wrong_env'
    );
  }
  if (archiveOnly < 1) {
    throw new RakipInventoryStagingGateError(
      'archive_only Armada retention required',
      'wrong_env'
    );
  }

  return { snapshot, sha256, byteSize };
}

function metaFromSnapshot(params: {
  snapshot: RakipInventorySnapshotV1;
  objectPath: string;
  sha256: string;
  byteSize: number;
  supersedesId: string | null;
}): InventorySnapshotMetaRow {
  const { snapshot } = params;
  return {
    id: snapshot.snapshotVersionId,
    schema_version: snapshot.schemaVersion,
    supersedes_id: params.supersedesId,
    source_captured_at: snapshot.bundle.meta.sourceCapturedAt,
    last_observed_at: snapshot.bundle.meta.lastObservedAt,
    last_research_at: snapshot.bundle.meta.lastResearchAt,
    office_count: snapshot.bundle.offices.length,
    person_count: snapshot.bundle.people.length,
    research_target_brand_count: snapshot.bundle.meta.brands.filter(
      (b) => b.brandClass === 'research_target'
    ).length,
    archive_only_brand_count: snapshot.bundle.meta.brands.filter(
      (b) => b.brandClass === 'archive_only'
    ).length,
    labeled_as_current: false,
    object_path: params.objectPath,
    sha256: params.sha256,
    byte_size: params.byteSize,
    bucket_id: RAKIP_INVENTORY_PRIVATE_BUCKET,
    notes: [...snapshot.bundle.meta.notes],
    import_attestation:
      'baseline_son_kayitli_envanter; not current publish; contacts omitted',
  };
}

/**
 * Import (or dry-run) a local snapshot-v1 into Staging private storage + metadata.
 */
export async function importInventorySnapshotToStaging(
  req: InventoryImportRequest
): Promise<InventoryImportReport> {
  const steps: InventoryImportReport['steps'] = [];
  const env = req.env ?? process.env;
  const mode = req.mode;

  try {
    assertNotProductionRuntime(env);
    push(steps, 'not_production', 'ok', 'VERCEL_ENV≠production');

    assertInventoryPreviewHost(req.previewHost);
    push(steps, 'preview_host', 'ok', 'preview host allowlisted');

    assertInventoryStagingRef(env.CB360_STAGING_PROJECT_REF);
    assertInventoryStagingEnvFailClosed(env);
    push(steps, 'staging_env', 'ok', 'staging ref + secrets present (values not logged)');

    if (!req.filePath?.trim()) {
      return refuse(steps, { mode }, 'file path required');
    }
    if (!/^[a-f0-9]{64}$/i.test(req.expectedSha256 || '')) {
      return refuse(steps, { mode }, 'expectedSha256 must be 64 hex chars');
    }
    if (!req.expectedSnapshotId?.trim()) {
      return refuse(steps, { mode }, 'expectedSnapshotId required');
    }
    if (!Number.isFinite(req.expectedByteSize) || req.expectedByteSize <= 0) {
      return refuse(steps, { mode }, 'expectedByteSize must be positive');
    }

    assertOperatorApprovalForSnapshot({
      snapshotVersionId: req.expectedSnapshotId,
      env,
      cliApproveFlag: req.approve,
    });
    push(steps, 'operator_approval', 'ok', 'approval bound to snapshotVersionId');

    const bytes = await fs.readFile(req.filePath);
    const { snapshot, sha256, byteSize } = validateSnapshotIntegrity({
      bytes,
      expectedSha256: req.expectedSha256,
      expectedSnapshotId: req.expectedSnapshotId,
      expectedByteSize: req.expectedByteSize,
    });
    push(steps, 'integrity', 'ok', 'schema + sha256 + counts + brand scope');

    const objectPath = buildInventorySnapshotObjectPath({
      snapshotVersionId: snapshot.snapshotVersionId,
    });
    assertPrivateInventoryObjectPath(objectPath);
    push(steps, 'object_path', 'ok', 'private inventory-snapshots/ path');

    const base: Partial<InventoryImportReport> = {
      mode,
      snapshotVersionId: snapshot.snapshotVersionId,
      objectPath,
      sha256,
      byteSize,
      officeCount: snapshot.bundle.offices.length,
      personCount: snapshot.bundle.people.length,
      researchTargetBrandCount: snapshot.bundle.meta.brands.filter(
        (b) => b.brandClass === 'research_target'
      ).length,
      archiveOnlyBrandCount: snapshot.bundle.meta.brands.filter(
        (b) => b.brandClass === 'archive_only'
      ).length,
      lastResearchAt: snapshot.bundle.meta.lastResearchAt,
    };

    if (mode === 'dry-run') {
      push(steps, 'execute', 'skip', 'dry-run only; no upload');
      return {
        ok: true,
        mode,
        outcome: 'ready',
        snapshotVersionId: base.snapshotVersionId!,
        objectPath,
        sha256,
        byteSize,
        officeCount: base.officeCount!,
        personCount: base.personCount!,
        researchTargetBrandCount: base.researchTargetBrandCount!,
        archiveOnlyBrandCount: base.archiveOnlyBrandCount!,
        labeledAsCurrent: false,
        lastResearchAt: snapshot.bundle.meta.lastResearchAt,
        steps,
      };
    }

    if (!isRakipInventoryLiveImportAllowed(env)) {
      return refuse(
        steps,
        base,
        'execute refused: RAKIP_INVENTORY_ALLOW_LIVE_IMPORT≠1'
      );
    }
    if (!req.deps) {
      return refuse(
        steps,
        base,
        'execute refused: storage/db deps not injected (no accidental live client)'
      );
    }

    const deps = req.deps;
    const existing = await deps.getSnapshotById(snapshot.snapshotVersionId);
    if (existing) {
      if (
        existing.sha256 === sha256 &&
        existing.byte_size === byteSize &&
        existing.schema_version === snapshot.schemaVersion &&
        existing.labeled_as_current === false
      ) {
        const stillThere = await deps.objectExists(
          RAKIP_INVENTORY_PRIVATE_BUCKET,
          existing.object_path
        );
        if (!stillThere) {
          return refuse(
            steps,
            { ...base, objectPath: existing.object_path },
            'stale metadata: object missing in private storage'
          );
        }
        await deps.setLatest(existing.id);
        push(steps, 'idempotent', 'ok', 'same id+sha+bytes; latest pointer refreshed');
        return {
          ok: true,
          mode,
          outcome: 'idempotent_replay',
          snapshotVersionId: existing.id,
          objectPath: existing.object_path,
          sha256: existing.sha256,
          byteSize: existing.byte_size,
          officeCount: existing.office_count,
          personCount: existing.person_count,
          researchTargetBrandCount: existing.research_target_brand_count,
          archiveOnlyBrandCount: existing.archive_only_brand_count,
          labeledAsCurrent: false,
          lastResearchAt: existing.last_research_at,
          steps,
        };
      }
      return refuse(
        steps,
        base,
        'snapshot id exists with different integrity metadata'
      );
    }

    const row = metaFromSnapshot({
      snapshot,
      objectPath,
      sha256,
      byteSize,
      supersedesId: req.supersedesSnapshotId ?? null,
    });

    await deps.uploadObject({
      bucket: RAKIP_INVENTORY_PRIVATE_BUCKET,
      objectPath,
      bytes,
      contentType: 'application/json',
    });
    push(steps, 'upload', 'ok', 'private bucket upload');

    const downloaded = await deps.downloadObject(
      RAKIP_INVENTORY_PRIVATE_BUCKET,
      objectPath
    );
    if (sha256Hex(downloaded) !== sha256) {
      return refuse(steps, base, 'post-upload SHA mismatch');
    }
    push(steps, 'verify_download', 'ok', 'storage round-trip sha match');

    await deps.upsertSnapshot(row);
    await deps.setLatest(row.id);
    push(steps, 'metadata', 'ok', 'snapshot row + latest pointer');

    return {
      ok: true,
      mode,
      outcome: 'imported',
      snapshotVersionId: row.id,
      objectPath: row.object_path,
      sha256: row.sha256,
      byteSize: row.byte_size,
      officeCount: row.office_count,
      personCount: row.person_count,
      researchTargetBrandCount: row.research_target_brand_count,
      archiveOnlyBrandCount: row.archive_only_brand_count,
      labeledAsCurrent: false,
      lastResearchAt: row.last_research_at,
      steps,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    push(steps, 'error', 'fail', message);
    return {
      ok: false,
      mode,
      outcome: err instanceof RakipInventoryStagingGateError ? 'refused' : 'failed',
      snapshotVersionId: req.expectedSnapshotId || null,
      objectPath: null,
      sha256: null,
      byteSize: null,
      officeCount: null,
      personCount: null,
      researchTargetBrandCount: null,
      archiveOnlyBrandCount: null,
      labeledAsCurrent: false,
      lastResearchAt: null,
      steps,
      error: message,
    };
  }
}

/** In-memory deps for offline tests (no network). */
export function createMemoryInventoryImportDeps(): InventoryImportDeps & {
  snapshots: Map<string, InventorySnapshotMetaRow>;
  objects: Map<string, Buffer>;
  latestId: string | null;
} {
  const snapshots = new Map<string, InventorySnapshotMetaRow>();
  const objects = new Map<string, Buffer>();
  let latestId: string | null = null;

  return {
    snapshots,
    objects,
    get latestId() {
      return latestId;
    },
    async getSnapshotById(id) {
      return snapshots.get(id) ?? null;
    },
    async upsertSnapshot(row) {
      snapshots.set(row.id, row);
    },
    async setLatest(snapshotId) {
      latestId = snapshotId;
    },
    async objectExists(bucket, objectPath) {
      return objects.has(`${bucket}:${objectPath}`);
    },
    async uploadObject({ bucket, objectPath, bytes }) {
      objects.set(`${bucket}:${objectPath}`, Buffer.from(bytes));
    },
    async downloadObject(bucket, objectPath) {
      const buf = objects.get(`${bucket}:${objectPath}`);
      if (!buf) throw new Error('object not found');
      return Buffer.from(buf);
    },
  };
}
