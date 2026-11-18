import type { Cb360EnvBag } from './envBag';
import { Cb360Error } from './types';

const GENERIC_UNAVAILABLE = 'CB360 is unavailable in this environment';

/** Only https://<project-ref>.supabase.co with optional trailing slash. */
const STRICT_SUPABASE_HTTPS =
  /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i;

/**
 * Strict Supabase HTTPS project URL parser.
 * Accepts only: https://<project-ref>.supabase.co[/]
 * Rejects http, ports, userinfo, paths, query, hash, and lookalike hosts.
 */
export function parseStrictSupabaseHttpsProjectRef(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(STRICT_SUPABASE_HTTPS);
  if (!match) return null;

  // Defense in depth: URL API must agree (blocks weird unicode / parsing tricks)
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port) return null;
  if (parsed.search || parsed.hash) return null;
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null;

  const hostMatch = parsed.hostname.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!hostMatch) return null;
  if (hostMatch[1] !== match[1].toLowerCase()) return null;

  return hostMatch[1];
}

function denyRuntime(
  code: 'environment_blocked' | 'config_missing' = 'environment_blocked'
): never {
  throw new Cb360Error(code, GENERIC_UNAVAILABLE, 503);
}

/**
 * Fail-closed CB360 runtime gate (server env only — never request headers/body).
 *
 * - VERCEL_ENV=production → always blocked (this phase)
 * - CB360_ALLOWED_SUPABASE_REF required
 * - NEXT_PUBLIC_SUPABASE_URL must be https://<ref>.supabase.co and ref must match
 *
 * Call before any Supabase client / data access.
 */
export function assertCb360RuntimeEnvironment(
  env: Cb360EnvBag = process.env
): { projectRef: string } {
  if (env.VERCEL_ENV === 'production') {
    denyRuntime('environment_blocked');
  }

  const allowed = env.CB360_ALLOWED_SUPABASE_REF?.trim().toLowerCase();
  if (!allowed) {
    denyRuntime('config_missing');
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    denyRuntime('config_missing');
  }

  const urlRef = parseStrictSupabaseHttpsProjectRef(url);
  if (!urlRef || urlRef !== allowed) {
    denyRuntime('environment_blocked');
  }

  return { projectRef: urlRef };
}
