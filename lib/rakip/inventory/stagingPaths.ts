/**
 * Private object paths for Rakip inventory snapshots in cb360-private.
 * Never write under public buckets or static app paths.
 */
import { RAKIP_INVENTORY_PRIVATE_BUCKET } from './stagingEnv';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function assertSafeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value) || value.includes('..')) {
    throw new Error(`Invalid inventory path segment: ${label}`);
  }
  return value;
}

/**
 * inventory-snapshots/YYYY/MM/DD/{snapshotVersionId}/rakip-inventory-snapshot-v1.json
 */
export function buildInventorySnapshotObjectPath(params: {
  snapshotVersionId: string;
  at?: Date;
}): string {
  const at = params.at ?? new Date();
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(at.getUTCDate()).padStart(2, '0');
  const id = assertSafeSegment(params.snapshotVersionId, 'snapshotVersionId');
  return `inventory-snapshots/${yyyy}/${mm}/${dd}/${id}/rakip-inventory-snapshot-v1.json`;
}

export function assertPrivateInventoryObjectPath(objectPath: string): void {
  const p = objectPath.trim();
  if (!p.startsWith('inventory-snapshots/')) {
    throw new Error('Inventory object_path must be under inventory-snapshots/');
  }
  if (p.includes('..') || p.startsWith('/') || p.includes('\\')) {
    throw new Error('Inventory object_path traversal rejected');
  }
  if (!p.endsWith('rakip-inventory-snapshot-v1.json')) {
    throw new Error('Inventory object_path must end with snapshot filename');
  }
}

export function inventoryPrivateBucket(): string {
  return RAKIP_INVENTORY_PRIVATE_BUCKET;
}
