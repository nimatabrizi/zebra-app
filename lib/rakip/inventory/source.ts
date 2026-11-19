/**
 * Server-only inventory loader with Staging-ready precedence:
 * 1) in-memory store (tests / hydrated)
 * 2) Staging durable store (RAKIP_INVENTORY_USE_STAGING_STORE=1 + gates)
 * 3) RAKIP_INVENTORY_SNAPSHOT_PATH (versioned JSON snapshot on disk)
 * 4) RAKIP_INVENTORY_XLSX_PATH (Mac local workbook RO)
 *
 * Never uploads, publishes, or becomes "current".
 */
import { promises as fs } from 'node:fs';
import { parseCodexSourceWorkbook } from './codexWorkbook';
import { normalizeCodexInventory } from './normalize';
import {
  bundleFromSnapshot,
  loadSnapshotFromPath,
  memoryRakipInventoryStore,
  RAKIP_INVENTORY_SNAPSHOT_PATH_ENV,
} from './store';
import type { RakipInventoryBundle, RakipInventoryScope } from './types';
import { isRakipInventoryStagingStoreEnabled } from './stagingEnv';
import {
  createSupabaseStagingInventoryReadDeps,
  loadInventorySnapshotFromStagingStore,
  type StagingInventoryReadDeps,
} from './stagingRepository';

export type RakipInventoryEnvBag = Record<string, string | undefined>;

export const RAKIP_INVENTORY_XLSX_PATH_ENV = 'RAKIP_INVENTORY_XLSX_PATH';
export const RAKIP_INVENTORY_SCOPE_ENV = 'RAKIP_INVENTORY_SCOPE';

type CacheEntry = {
  key: string;
  mtimeMs: number;
  scope: RakipInventoryScope;
  bundle: RakipInventoryBundle;
};

let cache: CacheEntry | null = null;

/** Test seam — inject Staging read deps without live Supabase. */
let stagingReadDepsOverride: StagingInventoryReadDeps | null = null;

export function setStagingInventoryReadDepsForTests(
  deps: StagingInventoryReadDeps | null
): void {
  stagingReadDepsOverride = deps;
}

export function resolveInventoryScope(
  env: RakipInventoryEnvBag = process.env
): RakipInventoryScope {
  const raw = String(env[RAKIP_INVENTORY_SCOPE_ENV] || 'regional')
    .trim()
    .toLowerCase();
  return raw === 'all' ? 'all' : 'regional';
}

export function resolveInventoryXlsxPath(
  env: RakipInventoryEnvBag = process.env
): string | null {
  const raw = env[RAKIP_INVENTORY_XLSX_PATH_ENV];
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim();
}

export function resolveInventorySnapshotPath(
  env: RakipInventoryEnvBag = process.env
): string | null {
  const raw = env[RAKIP_INVENTORY_SNAPSHOT_PATH_ENV];
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim();
}

export type LoadInventoryResult =
  | {
      ok: true;
      bundle: RakipInventoryBundle;
      fromCache: boolean;
      source:
        | 'memory_store'
        | 'staging_store'
        | 'local_snapshot'
        | 'local_xlsx';
    }
  | {
      ok: false;
      reason: 'path_unset' | 'read_failed' | 'staging_failed';
      message: string;
    };

async function tryLoadStagingStore(
  env: RakipInventoryEnvBag
): Promise<LoadInventoryResult | null> {
  if (!isRakipInventoryStagingStoreEnabled(env)) return null;

  try {
    const deps =
      stagingReadDepsOverride ||
      (await createSupabaseStagingInventoryReadDeps(env));
    const loaded = await loadInventorySnapshotFromStagingStore({ env, deps });
    if (!loaded.ok) {
      // Staging explicitly enabled but unreadable → fail closed (no silent xlsx).
      return {
        ok: false,
        reason: 'staging_failed',
        message: loaded.message,
      };
    }
    const bundle = bundleFromSnapshot(loaded.snapshot);
    return {
      ok: true,
      bundle,
      fromCache: false,
      source: 'staging_store',
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'staging_failed',
      message: err instanceof Error ? err.message : 'staging_read_failed',
    };
  }
}

/**
 * Load inventory for Rakip UI.
 * Prefers durable Staging/memory snapshot over Mac xlsx when available.
 */
export async function loadRakipInventoryBundle(
  env: RakipInventoryEnvBag = process.env
): Promise<LoadInventoryResult> {
  const scope = resolveInventoryScope(env);

  try {
    const mem = await memoryRakipInventoryStore.getLatestSnapshot();
    if (mem) {
      const bundle = bundleFromSnapshot(mem);
      return { ok: true, bundle, fromCache: false, source: 'memory_store' };
    }

    const staging = await tryLoadStagingStore(env);
    if (staging) return staging;

    const snapshotPath = resolveInventorySnapshotPath(env);
    if (snapshotPath) {
      const stat = await fs.stat(snapshotPath);
      const key = `snap:${snapshotPath}`;
      if (
        cache &&
        cache.key === key &&
        cache.scope === scope &&
        cache.mtimeMs === stat.mtimeMs
      ) {
        return {
          ok: true,
          bundle: cache.bundle,
          fromCache: true,
          source: 'local_snapshot',
        };
      }
      const snap = await loadSnapshotFromPath(snapshotPath);
      const bundle = bundleFromSnapshot(snap);
      cache = { key, mtimeMs: stat.mtimeMs, scope, bundle };
      return {
        ok: true,
        bundle,
        fromCache: false,
        source: 'local_snapshot',
      };
    }

    const xlsxPath = resolveInventoryXlsxPath(env);
    if (!xlsxPath) {
      return {
        ok: false,
        reason: 'path_unset',
        message:
          'No inventory source configured (memory empty; Staging store off; RAKIP_INVENTORY_SNAPSHOT_PATH and RAKIP_INVENTORY_XLSX_PATH unset).',
      };
    }

    const stat = await fs.stat(xlsxPath);
    const key = `xlsx:${xlsxPath}`;
    if (
      cache &&
      cache.key === key &&
      cache.scope === scope &&
      cache.mtimeMs === stat.mtimeMs
    ) {
      return {
        ok: true,
        bundle: cache.bundle,
        fromCache: true,
        source: 'local_xlsx',
      };
    }

    const bytes = await fs.readFile(xlsxPath);
    const parsed = parseCodexSourceWorkbook(bytes);
    const bundle = normalizeCodexInventory(parsed, scope);
    cache = { key, mtimeMs: stat.mtimeMs, scope, bundle };
    return { ok: true, bundle, fromCache: false, source: 'local_xlsx' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'inventory_read_failed';
    return { ok: false, reason: 'read_failed', message };
  }
}

/** Test helper — build from in-memory bytes (no disk). */
export function inventoryBundleFromBytes(
  bytes: Buffer,
  scope: RakipInventoryScope = 'regional'
): RakipInventoryBundle {
  return normalizeCodexInventory(parseCodexSourceWorkbook(bytes), scope);
}

/** Clear module cache + memory store + staging test deps (tests). */
export function clearRakipInventoryCache(): void {
  cache = null;
  memoryRakipInventoryStore.clear();
  stagingReadDepsOverride = null;
}
