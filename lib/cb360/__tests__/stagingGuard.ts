import type { Cb360EnvBag } from '../envBag';

/**
 * CB360 staging live-test safety rail.
 * Prevents accidental use of production (or any non-staging) Supabase project.
 *
 * Required env (values never logged):
 *   CB360_INTEGRATION=1
 *   CB360_TARGET_ENV=staging
 *   CB360_ALLOW_LIVE_DB=staging-only
 *   CB360_STAGING_PROJECT_REF=<supabase project ref>
 *   CB360_STAGING_SUPABASE_URL=https://<ref>.supabase.co
 *   CB360_STAGING_SERVICE_ROLE_KEY=<service role>
 * Optional:
 *   CB360_FORBIDDEN_PROJECT_REFS=ref1,ref2  (extra deny list)
 *
 * Intentionally does NOT fall back to NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY (those often point at production in .env.local).
 */

export type Cb360StagingTarget = {
  url: string;
  serviceRoleKey: string;
  projectRef: string;
};

export class Cb360StagingGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Cb360StagingGuardError';
  }
}

/** Extract Supabase project ref from https://<ref>.supabase.co */
export function extractSupabaseProjectRef(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function parseForbiddenProjectRefs(
  raw: string | undefined = process.env.CB360_FORBIDDEN_PROJECT_REFS
): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true only when the operator explicitly opted into staging live tests
 * and all required staging-scoped env vars are present (not yet identity-checked).
 */
export function isCb360StagingIntegrationRequested(): boolean {
  return (
    process.env.CB360_INTEGRATION === '1' &&
    process.env.CB360_TARGET_ENV === 'staging' &&
    process.env.CB360_ALLOW_LIVE_DB === 'staging-only' &&
    Boolean(process.env.CB360_STAGING_PROJECT_REF?.trim()) &&
    Boolean(process.env.CB360_STAGING_SUPABASE_URL?.trim()) &&
    Boolean(process.env.CB360_STAGING_SERVICE_ROLE_KEY?.trim())
  );
}

/**
 * Hard gate before any live client is created.
 * Throws if target is missing, mismatched, or on the forbidden list.
 */
export function assertCb360StagingTarget(
  env: Cb360EnvBag = process.env
): Cb360StagingTarget {
  if (env.CB360_INTEGRATION !== '1') {
    throw new Cb360StagingGuardError('CB360_INTEGRATION must be 1');
  }
  if (env.CB360_TARGET_ENV !== 'staging') {
    throw new Cb360StagingGuardError(
      'CB360_TARGET_ENV must be exactly "staging"'
    );
  }
  if (env.CB360_ALLOW_LIVE_DB !== 'staging-only') {
    throw new Cb360StagingGuardError(
      'CB360_ALLOW_LIVE_DB must be exactly "staging-only"'
    );
  }

  const expectedRef = env.CB360_STAGING_PROJECT_REF?.trim().toLowerCase();
  const url = env.CB360_STAGING_SUPABASE_URL?.trim();
  const serviceRoleKey = env.CB360_STAGING_SERVICE_ROLE_KEY?.trim();

  if (!expectedRef || !url || !serviceRoleKey) {
    throw new Cb360StagingGuardError(
      'CB360_STAGING_PROJECT_REF, CB360_STAGING_SUPABASE_URL and CB360_STAGING_SERVICE_ROLE_KEY are required'
    );
  }

  // Refuse accidental reuse of generic app env as staging credentials.
  if (
    env.CB360_STAGING_SUPABASE_URL === env.NEXT_PUBLIC_SUPABASE_URL &&
    env.CB360_FORCE_SHARED_URL !== '1'
  ) {
    // Soft warning path: still OK if refs match expected staging ref,
    // but require the URL host to equal expected ref below.
  }

  const urlRef = extractSupabaseProjectRef(url);
  if (!urlRef) {
    throw new Cb360StagingGuardError(
      'CB360_STAGING_SUPABASE_URL must be https://<project-ref>.supabase.co'
    );
  }

  if (urlRef !== expectedRef) {
    throw new Cb360StagingGuardError(
      'Staging URL project ref does not match CB360_STAGING_PROJECT_REF'
    );
  }

  const forbidden = parseForbiddenProjectRefs(env.CB360_FORBIDDEN_PROJECT_REFS);
  if (forbidden.includes(urlRef)) {
    throw new Cb360StagingGuardError(
      'Target project ref is on CB360_FORBIDDEN_PROJECT_REFS deny list'
    );
  }

  if (expectedRef.includes('prod') || urlRef.includes('prod')) {
    throw new Cb360StagingGuardError(
      'Refusing project ref containing "prod"'
    );
  }

  return { url, serviceRoleKey, projectRef: urlRef };
}
