/**
 * Staging-only gates for Rakip inventory snapshot import/read.
 * Fail closed. Host/ref constants are owned here so inventory commits do not
 * depend on untracked cb360/ingest modules (keep values aligned with CB360
 * Staging Preview allowlist used elsewhere on this branch).
 */
import type { Cb360EnvBag } from '../../cb360/envBag';
import { extractSupabaseProjectRef } from '../../cb360/__tests__/stagingGuard';
import { CB360_BUCKET } from '../../cb360/paths';

/** Fixed Staging Preview host allowlist (must match CB360 Staging Preview). */
export const RAKIP_INVENTORY_PREVIEW_HOST =
  'https://zebra-app-git-feature-cb360-competitor-monitoring-zebra-360.vercel.app';

/** Approved Staging Supabase project ref (must match CB360 Staging). */
export const RAKIP_INVENTORY_STAGING_REF = 'noagxyztimvefmewjybj';

export const RAKIP_INVENTORY_PRIVATE_BUCKET = CB360_BUCKET;

/** Shell must set =1 for live Staging import (never default on). */
export const RAKIP_INVENTORY_ALLOW_LIVE_IMPORT_ENV =
  'RAKIP_INVENTORY_ALLOW_LIVE_IMPORT' as const;

/**
 * Explicit operator approval token for one import.
 * Must equal the snapshotVersionId being imported (binds approval to artifact).
 */
export const RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV =
  'RAKIP_INVENTORY_OPERATOR_APPROVAL' as const;

/** Preview/runtime: enable durable Staging store read (server-only). */
export const RAKIP_INVENTORY_USE_STAGING_STORE_ENV =
  'RAKIP_INVENTORY_USE_STAGING_STORE' as const;

export class RakipInventoryStagingGateError extends Error {
  readonly code:
    | 'wrong_env'
    | 'missing_secret'
    | 'wrong_host'
    | 'wrong_ref'
    | 'approval'
    | 'production'
    | 'current_publish';

  constructor(
    message: string,
    code: RakipInventoryStagingGateError['code'] = 'wrong_env'
  ) {
    super(message);
    this.name = 'RakipInventoryStagingGateError';
    this.code = code;
  }
}

export function isRakipInventoryLiveImportAllowed(
  env: Cb360EnvBag = process.env
): boolean {
  return env[RAKIP_INVENTORY_ALLOW_LIVE_IMPORT_ENV] === '1';
}

export function isRakipInventoryStagingStoreEnabled(
  env: Cb360EnvBag = process.env
): boolean {
  return env[RAKIP_INVENTORY_USE_STAGING_STORE_ENV] === '1';
}

export function assertNotProductionRuntime(
  env: Cb360EnvBag = process.env
): void {
  if (env.VERCEL_ENV === 'production') {
    throw new RakipInventoryStagingGateError(
      'Inventory Staging path blocked: VERCEL_ENV=production',
      'production'
    );
  }
  if (env.CB360_TARGET_ENV && env.CB360_TARGET_ENV !== 'staging') {
    throw new RakipInventoryStagingGateError(
      'CB360_TARGET_ENV must be staging for inventory Staging ops',
      'wrong_env'
    );
  }
}

export function assertInventoryPreviewHost(previewHost?: string): string {
  const host = (previewHost ?? RAKIP_INVENTORY_PREVIEW_HOST).replace(/\/$/, '');
  if (host !== RAKIP_INVENTORY_PREVIEW_HOST) {
    throw new RakipInventoryStagingGateError(
      'Preview host is not the fixed CB360 feature Preview URL',
      'wrong_host'
    );
  }
  return host;
}

export function assertInventoryStagingRef(projectRef?: string): string {
  const ref = (projectRef ?? RAKIP_INVENTORY_STAGING_REF).trim().toLowerCase();
  if (ref !== RAKIP_INVENTORY_STAGING_REF) {
    throw new RakipInventoryStagingGateError(
      'Staging project ref is not the approved Staging ref',
      'wrong_ref'
    );
  }
  return ref;
}

/**
 * Fail-closed Staging credential + ref checks. Never logs secret values.
 */
export function assertInventoryStagingEnvFailClosed(
  env: Cb360EnvBag = process.env
): {
  url: string;
  serviceRoleKey: string;
  projectRef: string;
} {
  assertNotProductionRuntime(env);

  const allowed = env.CB360_ALLOWED_SUPABASE_REF?.trim().toLowerCase();
  if (allowed && allowed !== RAKIP_INVENTORY_STAGING_REF) {
    throw new RakipInventoryStagingGateError(
      'CB360_ALLOWED_SUPABASE_REF is not the approved Staging ref',
      'wrong_ref'
    );
  }

  const projectRef = env.CB360_STAGING_PROJECT_REF?.trim().toLowerCase();
  const url = env.CB360_STAGING_SUPABASE_URL?.trim();
  const serviceRoleKey = env.CB360_STAGING_SERVICE_ROLE_KEY?.trim();

  if (!projectRef || !url || !serviceRoleKey) {
    throw new RakipInventoryStagingGateError(
      'CB360_STAGING_PROJECT_REF / SUPABASE_URL / SERVICE_ROLE_KEY required',
      'missing_secret'
    );
  }

  assertInventoryStagingRef(projectRef);

  const urlRef = extractSupabaseProjectRef(url);
  if (!urlRef || urlRef !== RAKIP_INVENTORY_STAGING_REF) {
    throw new RakipInventoryStagingGateError(
      'CB360_STAGING_SUPABASE_URL does not match approved Staging ref',
      'wrong_ref'
    );
  }

  if (
    env.CB360_STAGING_SUPABASE_URL?.trim() ===
      env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    env.CB360_FORCE_SHARED_URL !== '1'
  ) {
    const publicRef = extractSupabaseProjectRef(
      env.NEXT_PUBLIC_SUPABASE_URL || ''
    );
    if (publicRef && publicRef !== RAKIP_INVENTORY_STAGING_REF) {
      throw new RakipInventoryStagingGateError(
        'Refusing shared NEXT_PUBLIC_SUPABASE_URL as Staging inventory target',
        'wrong_ref'
      );
    }
  }

  return { url, serviceRoleKey, projectRef };
}

export function assertOperatorApprovalForSnapshot(params: {
  snapshotVersionId: string;
  env?: Cb360EnvBag;
  cliApproveFlag?: boolean;
}): void {
  const env = params.env ?? process.env;
  if (!params.cliApproveFlag) {
    throw new RakipInventoryStagingGateError(
      'Missing explicit --approve flag',
      'approval'
    );
  }
  const token = env[RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV]?.trim();
  if (!token) {
    throw new RakipInventoryStagingGateError(
      `${RAKIP_INVENTORY_OPERATOR_APPROVAL_ENV} must equal snapshotVersionId`,
      'approval'
    );
  }
  if (token !== params.snapshotVersionId) {
    throw new RakipInventoryStagingGateError(
      'Operator approval token does not match snapshotVersionId',
      'approval'
    );
  }
}

export function assertNeverCurrentPublish(labeledAsCurrent: boolean): void {
  if (labeledAsCurrent) {
    throw new RakipInventoryStagingGateError(
      'SECURITY: labeledAsCurrent=true forbidden for inventory baseline',
      'current_publish'
    );
  }
}
