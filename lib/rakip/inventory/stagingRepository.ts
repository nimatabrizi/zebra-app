/**
 * Server-only durable Staging inventory read.
 * Uses service_role only inside injected/factory clients — never exposed to browser.
 * Does not publish current; returns Son Kayıtlı Envanter snapshots only.
 */
import { createHash } from 'node:crypto';

import type { Cb360EnvBag } from '../../cb360/envBag';
import { parseInventorySnapshotJson } from './store';
import type { RakipInventorySnapshotV1 } from './types';
import {
  assertInventoryStagingEnvFailClosed,
  assertNeverCurrentPublish,
  assertNotProductionRuntime,
  isRakipInventoryStagingStoreEnabled,
  RakipInventoryStagingGateError,
  RAKIP_INVENTORY_PRIVATE_BUCKET,
} from './stagingEnv';
import { assertPrivateInventoryObjectPath } from './stagingPaths';
import type { InventorySnapshotMetaRow } from './stagingImport';

export type StagingInventoryReadDeps = {
  getLatestMeta(): Promise<InventorySnapshotMetaRow | null>;
  downloadObject(bucket: string, objectPath: string): Promise<Buffer>;
};

export type StagingInventoryReadResult =
  | {
      ok: true;
      snapshot: RakipInventorySnapshotV1;
      meta: InventorySnapshotMetaRow;
      origin: 'staging_store';
    }
  | {
      ok: false;
      reason:
        | 'disabled'
        | 'gate_failed'
        | 'not_found'
        | 'integrity_failed'
        | 'stale_storage';
      message: string;
    };

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Load latest recorded inventory snapshot from private Staging storage.
 * Fail-closed on missing RLS-backed metadata, SHA mismatch, or current flag.
 */
export async function loadInventorySnapshotFromStagingStore(params: {
  env?: Cb360EnvBag;
  deps: StagingInventoryReadDeps;
}): Promise<StagingInventoryReadResult> {
  const env = params.env ?? process.env;

  if (!isRakipInventoryStagingStoreEnabled(env)) {
    return {
      ok: false,
      reason: 'disabled',
      message: 'RAKIP_INVENTORY_USE_STAGING_STORE≠1',
    };
  }

  try {
    assertNotProductionRuntime(env);
    assertInventoryStagingEnvFailClosed(env);
  } catch (err) {
    return {
      ok: false,
      reason: 'gate_failed',
      message: err instanceof Error ? err.message : 'staging_gate_failed',
    };
  }

  const meta = await params.deps.getLatestMeta();
  if (!meta) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'No cb360_inventory_latest pointer',
    };
  }

  if (meta.labeled_as_current) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: 'labeled_as_current must be false',
    };
  }
  if (meta.bucket_id !== RAKIP_INVENTORY_PRIVATE_BUCKET) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: 'bucket_id must be cb360-private',
    };
  }

  try {
    assertPrivateInventoryObjectPath(meta.object_path);
  } catch (err) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: err instanceof Error ? err.message : 'bad_object_path',
    };
  }

  let bytes: Buffer;
  try {
    bytes = await params.deps.downloadObject(
      meta.bucket_id,
      meta.object_path
    );
  } catch {
    return {
      ok: false,
      reason: 'stale_storage',
      message: 'Storage object missing for metadata pointer',
    };
  }

  if (bytes.byteLength !== meta.byte_size) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: 'byte_size mismatch vs metadata',
    };
  }
  const digest = sha256Hex(bytes);
  if (digest !== meta.sha256.toLowerCase()) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: 'SHA-256 mismatch vs metadata',
    };
  }

  let snapshot: RakipInventorySnapshotV1;
  try {
    snapshot = parseInventorySnapshotJson(JSON.parse(bytes.toString('utf8')));
  } catch (err) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: err instanceof Error ? err.message : 'invalid_snapshot_json',
    };
  }

  try {
    assertNeverCurrentPublish(snapshot.attestations.labeledAsCurrent);
  } catch (err) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: err instanceof Error ? err.message : 'current_publish',
    };
  }

  if (snapshot.snapshotVersionId !== meta.id) {
    return {
      ok: false,
      reason: 'integrity_failed',
      message: 'snapshotVersionId ≠ metadata id',
    };
  }

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      bundle: {
        ...snapshot.bundle,
        meta: {
          ...snapshot.bundle.meta,
          origin: 'versioned_snapshot',
          freshnessLabel: 'son_kayitli_envanter',
          inventoryStatusLabel: 'Son Kayıtlı Envanter',
          snapshotVersionId: snapshot.snapshotVersionId,
        },
      },
    },
    meta,
    origin: 'staging_store',
  };
}

/**
 * Optional live Supabase deps factory — only constructed when Staging read enabled.
 * Never returns the service_role key to callers.
 */
export async function createSupabaseStagingInventoryReadDeps(
  env: Cb360EnvBag = process.env
): Promise<StagingInventoryReadDeps> {
  const target = assertInventoryStagingEnvFailClosed(env);
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async getLatestMeta() {
      const { data: latest, error: latestErr } = await client
        .from('cb360_inventory_latest')
        .select('snapshot_id')
        .eq('id', 1)
        .maybeSingle();
      if (latestErr) {
        throw new RakipInventoryStagingGateError(
          'inventory_latest read failed (RLS/permissions?)',
          'missing_secret'
        );
      }
      if (!latest?.snapshot_id) return null;
      const { data, error } = await client
        .from('cb360_inventory_snapshots')
        .select('*')
        .eq('id', latest.snapshot_id)
        .maybeSingle();
      if (error) {
        throw new RakipInventoryStagingGateError(
          'inventory_snapshots read failed (RLS/permissions?)',
          'missing_secret'
        );
      }
      return (data as InventorySnapshotMetaRow | null) ?? null;
    },
    async downloadObject(bucket, objectPath) {
      const { data, error } = await client.storage.from(bucket).download(objectPath);
      if (error || !data) {
        throw new Error(error?.message || 'download_failed');
      }
      const ab = await data.arrayBuffer();
      return Buffer.from(ab);
    },
  };
}

/** Test helper: memory-backed Staging read deps. */
export function createMemoryStagingInventoryReadDeps(seed?: {
  meta: InventorySnapshotMetaRow | null;
  objectBytes?: Buffer | null;
}): StagingInventoryReadDeps & {
  setMeta(meta: InventorySnapshotMetaRow | null): void;
  setObject(bytes: Buffer | null): void;
} {
  let meta = seed?.meta ?? null;
  let objectBytes = seed?.objectBytes ?? null;
  return {
    setMeta(m) {
      meta = m;
    },
    setObject(b) {
      objectBytes = b;
    },
    async getLatestMeta() {
      return meta;
    },
    async downloadObject(_bucket, objectPath) {
      if (!meta || meta.object_path !== objectPath || !objectBytes) {
        throw new Error('object not found');
      }
      return Buffer.from(objectBytes);
    },
  };
}
