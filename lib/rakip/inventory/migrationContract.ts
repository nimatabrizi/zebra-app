/**
 * Offline validation of the draft inventory migration SQL.
 * Does not apply migrations.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RAKIP_INVENTORY_MIGRATION_RELATIVE_PATH =
  'supabase/migrations/20261119_cb360_inventory_snapshot_draft.sql';

export type InventoryMigrationContractReport = {
  ok: boolean;
  path: string;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
};

function check(
  checks: InventoryMigrationContractReport['checks'],
  id: string,
  ok: boolean,
  detail: string
): void {
  checks.push({ id, ok, detail });
}

export function validateInventoryMigrationSql(
  sql: string,
  path = RAKIP_INVENTORY_MIGRATION_RELATIVE_PATH
): InventoryMigrationContractReport {
  const checks: InventoryMigrationContractReport['checks'] = [];

  check(
    checks,
    'draft_banner',
    /DRAFT ONLY/i.test(sql) && /DO NOT apply to Production/i.test(sql),
    'Must remain draft-only / Production-banned'
  );
  check(
    checks,
    'tables',
    /cb360_inventory_snapshots/.test(sql) &&
      /cb360_inventory_latest/.test(sql) &&
      /cb360_inventory_review_items/.test(sql),
    'Required inventory tables present'
  );
  check(
    checks,
    'schema_version_lock',
    /schema_version = 'rakip-inventory-snapshot-v1'/.test(sql),
    'schema_version constrained to snapshot-v1'
  );
  check(
    checks,
    'never_current',
    /labeled_as_current boolean NOT NULL DEFAULT false CHECK \(labeled_as_current = false\)/.test(
      sql
    ),
    'labeled_as_current forced false'
  );
  check(
    checks,
    'private_bucket',
    /bucket_id text NOT NULL DEFAULT 'cb360-private'/.test(sql) &&
      /bucket_id = 'cb360-private'/.test(sql),
    'bucket locked to cb360-private'
  );
  check(
    checks,
    'object_path_unique',
    /object_path text NOT NULL UNIQUE/.test(sql),
    'object_path NOT NULL UNIQUE'
  );
  check(
    checks,
    'sha256_hex',
    /sha256 ~ '\^\[a-f0-9\]\{64\}\$'/.test(sql),
    'sha256 hex-64 CHECK'
  );
  check(
    checks,
    'rls_enabled',
    /ENABLE ROW LEVEL SECURITY/.test(sql),
    'RLS enabled on inventory tables'
  );
  check(
    checks,
    'revoke_anon_auth',
    /REVOKE ALL ON TABLE public\.cb360_inventory_snapshots FROM anon, authenticated/.test(
      sql
    ) &&
      /REVOKE ALL ON TABLE public\.cb360_inventory_latest FROM anon, authenticated/.test(
        sql
      ) &&
      /REVOKE ALL ON TABLE public\.cb360_inventory_review_items FROM anon, authenticated/.test(
        sql
      ),
    'REVOKE anon/authenticated'
  );
  check(
    checks,
    'grant_service_role',
    /GRANT ALL ON TABLE public\.cb360_inventory_snapshots TO service_role/.test(
      sql
    ) &&
      /GRANT ALL ON TABLE public\.cb360_inventory_latest TO service_role/.test(
        sql
      ) &&
      /GRANT ALL ON TABLE public\.cb360_inventory_review_items TO service_role/.test(
        sql
      ),
    'GRANT service_role only'
  );
  check(
    checks,
    'deny_policies',
    /cb360_inventory_snapshots_anon_deny/.test(sql) &&
      /cb360_inventory_latest_anon_deny/.test(sql) &&
      /cb360_inventory_review_anon_deny/.test(sql),
    'Explicit anon/authenticated deny policies'
  );
  check(
    checks,
    'no_current_bundle_touch',
    !/\b(UPDATE|DELETE\s+FROM|INSERT\s+INTO|ALTER\s+TABLE)\s+public\.cb360_current_bundle\b/i.test(
      sql
    ) &&
      !/\b(CREATE|REPLACE|DROP)\s+FUNCTION\s+public\.cb360_publish_bundle\b/i.test(
        sql
      ) &&
      /does NOT touch/i.test(sql),
    'Must not mutate current publish tables/RPCs'
  );
  check(
    checks,
    'no_anon_grant',
    !/GRANT .+ ON TABLE public\.cb360_inventory_.+ TO (anon|authenticated)/.test(
      sql
    ),
    'No GRANT to anon/authenticated'
  );

  return {
    ok: checks.every((c) => c.ok),
    path,
    checks,
  };
}

export function loadAndValidateInventoryMigration(
  cwd: string = process.cwd()
): InventoryMigrationContractReport {
  const path = join(cwd, RAKIP_INVENTORY_MIGRATION_RELATIVE_PATH);
  const sql = readFileSync(path, 'utf8');
  return validateInventoryMigrationSql(sql, path);
}
