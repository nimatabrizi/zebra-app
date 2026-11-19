/**
 * Staging-ready inventory store contract + in-memory implementation.
 * Live Supabase/Staging upload is intentionally not wired here.
 */
import { promises as fs } from 'node:fs';
import type {
  RakipInventoryBundle,
  RakipInventorySnapshotV1,
} from './types';
import { RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION } from './types';

export const RAKIP_INVENTORY_SNAPSHOT_PATH_ENV = 'RAKIP_INVENTORY_SNAPSHOT_PATH';

export type RakipInventoryStore = {
  getLatestSnapshot(): Promise<RakipInventorySnapshotV1 | null>;
  /** Offline/tests only — never called by production publish path in this phase. */
  putSnapshot(snapshot: RakipInventorySnapshotV1): Promise<void>;
};

class MemoryRakipInventoryStore implements RakipInventoryStore {
  private latest: RakipInventorySnapshotV1 | null = null;

  async getLatestSnapshot(): Promise<RakipInventorySnapshotV1 | null> {
    return this.latest;
  }

  async putSnapshot(snapshot: RakipInventorySnapshotV1): Promise<void> {
    if (snapshot.schemaVersion !== RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(`Unsupported snapshot schema: ${snapshot.schemaVersion}`);
    }
    if (snapshot.attestations.labeledAsCurrent !== false) {
      throw new Error('Snapshot must not be labeled as current');
    }
    this.latest = snapshot;
  }

  clear(): void {
    this.latest = null;
  }
}

/** Process-local memory store (dev/tests). */
export const memoryRakipInventoryStore = new MemoryRakipInventoryStore();

export function parseInventorySnapshotJson(
  raw: unknown
): RakipInventorySnapshotV1 {
  const snap = raw as RakipInventorySnapshotV1;
  if (!snap || snap.schemaVersion !== RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('Invalid rakip-inventory-snapshot-v1');
  }
  if (!snap.bundle?.meta || !Array.isArray(snap.bundle.offices)) {
    throw new Error('Snapshot missing bundle');
  }
  if (snap.attestations?.labeledAsCurrent !== false) {
    throw new Error('Snapshot labeledAsCurrent must be false');
  }
  return snap;
}

export async function loadSnapshotFromPath(
  path: string
): Promise<RakipInventorySnapshotV1> {
  const text = await fs.readFile(path, 'utf8');
  return parseInventorySnapshotJson(JSON.parse(text));
}

export function bundleFromSnapshot(
  snapshot: RakipInventorySnapshotV1
): RakipInventoryBundle {
  return {
    ...snapshot.bundle,
    meta: {
      ...snapshot.bundle.meta,
      snapshotVersionId: snapshot.snapshotVersionId,
      freshnessLabel: 'son_kayitli_envanter',
      inventoryStatusLabel: 'Son Kayıtlı Envanter',
      origin: snapshot.bundle.meta.origin || 'versioned_snapshot',
    },
    reviewQueue: snapshot.bundle.reviewQueue || [],
  };
}
