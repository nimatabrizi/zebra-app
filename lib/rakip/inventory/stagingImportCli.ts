/**
 * Staging-only CLI for rakip-inventory-snapshot-v1 import.
 *
 * Dry-run (default):
 *   npx tsx lib/rakip/inventory/stagingImportCli.ts \
 *     --file /path/to/snapshot.json \
 *     --sha256 <hex> --snapshot-id snap_… --byte-size N \
 *     --approve \
 *     --mode dry-run
 *
 * Execute requires RAKIP_INVENTORY_ALLOW_LIVE_IMPORT=1 and
 * RAKIP_INVENTORY_OPERATOR_APPROVAL=<snapshotVersionId>.
 * Never prints secret values or person lists.
 */
import { createClient } from '@supabase/supabase-js';

import type { Cb360EnvBag } from '../../cb360/envBag';
import {
  importInventorySnapshotToStaging,
  type InventoryImportDeps,
  type InventorySnapshotMetaRow,
} from './stagingImport';
import {
  assertInventoryStagingEnvFailClosed,
  isRakipInventoryLiveImportAllowed,
  RAKIP_INVENTORY_ALLOW_LIVE_IMPORT_ENV,
  RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV,
  RAKIP_INVENTORY_PRIVATE_BUCKET,
} from './stagingEnv';

type CliArgs = {
  file: string;
  sha256: string;
  snapshotId: string;
  byteSize: number;
  approve: boolean;
  mode: 'dry-run' | 'execute';
  previewHost?: string;
};

function parseArgs(argv: string[]): CliArgs {
  let file = '';
  let sha256 = '';
  let snapshotId = '';
  let byteSize = NaN;
  let approve = false;
  let mode: 'dry-run' | 'execute' = 'dry-run';
  let previewHost: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') file = argv[++i] || '';
    else if (a === '--sha256') sha256 = argv[++i] || '';
    else if (a === '--snapshot-id') snapshotId = argv[++i] || '';
    else if (a === '--byte-size') byteSize = Number(argv[++i]);
    else if (a === '--approve') approve = true;
    else if (a === '--mode') {
      const m = (argv[++i] || '').trim();
      mode = m === 'execute' ? 'execute' : 'dry-run';
    } else if (a === '--preview-host') previewHost = argv[++i] || undefined;
  }

  return { file, sha256, snapshotId, byteSize, approve, mode, previewHost };
}

async function createLiveImportDeps(
  env: Cb360EnvBag
): Promise<InventoryImportDeps> {
  const target = assertInventoryStagingEnvFailClosed(env);
  const client = createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async getSnapshotById(id) {
      const { data, error } = await client
        .from('cb360_inventory_snapshots')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`getSnapshotById failed: ${error.message}`);
      return (data as InventorySnapshotMetaRow | null) ?? null;
    },
    async upsertSnapshot(row) {
      const { error } = await client
        .from('cb360_inventory_snapshots')
        .upsert(row, { onConflict: 'id' });
      if (error) throw new Error(`upsertSnapshot failed: ${error.message}`);
    },
    async setLatest(snapshotId) {
      const { error } = await client.from('cb360_inventory_latest').upsert(
        {
          id: 1,
          snapshot_id: snapshotId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (error) throw new Error(`setLatest failed: ${error.message}`);
    },
    async objectExists(bucket, objectPath) {
      const dir = objectPath.split('/').slice(0, -1).join('/');
      const name = objectPath.split('/').pop() || '';
      const { data, error } = await client.storage.from(bucket).list(dir, {
        search: name,
        limit: 20,
      });
      if (error) throw new Error(`objectExists failed: ${error.message}`);
      return (data || []).some((o) => o.name === name);
    },
    async uploadObject({ bucket, objectPath, bytes, contentType }) {
      if (bucket !== RAKIP_INVENTORY_PRIVATE_BUCKET) {
        throw new Error('Refusing non-private bucket upload');
      }
      const { error } = await client.storage.from(bucket).upload(objectPath, bytes, {
        contentType,
        upsert: false,
      });
      if (error) throw new Error(`upload failed: ${error.message}`);
    },
    async downloadObject(bucket, objectPath) {
      const { data, error } = await client.storage.from(bucket).download(objectPath);
      if (error || !data) throw new Error(error?.message || 'download failed');
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env as Cb360EnvBag;

  let deps: InventoryImportDeps | undefined;
  if (args.mode === 'execute') {
    if (!isRakipInventoryLiveImportAllowed(env)) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            outcome: 'refused',
            error: `execute blocked without ${RAKIP_INVENTORY_ALLOW_LIVE_IMPORT_ENV}=1`,
            hint: `${RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV} must equal snapshot id`,
          },
          null,
          2
        )
      );
      process.exit(2);
    }
    deps = await createLiveImportDeps(env);
  }

  const report = await importInventorySnapshotToStaging({
    filePath: args.file,
    expectedSha256: args.sha256,
    expectedSnapshotId: args.snapshotId,
    expectedByteSize: args.byteSize,
    approve: args.approve,
    mode: args.mode,
    previewHost: args.previewHost,
    env,
    deps,
  });

  // Machine-readable summary only — no person payloads / secrets.
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
