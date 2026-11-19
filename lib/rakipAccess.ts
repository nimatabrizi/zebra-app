/**
 * Rakip İstihbaratı (CB360 UI) access — user-ID allowlist from env.
 * Fail-closed: missing/empty/invalid allowlist → deny everyone.
 * Never match on display name or email.
 */

import { isUuid } from './authIdentity';

export type RakipEnvBag = Record<string, string | undefined>;

/** Comma-separated auth.users UUIDs. Server-only; never expose secrets. */
export const RAKIP_ALLOWED_USER_IDS_ENV = 'RAKIP_ALLOWED_USER_IDS';

export function parseRakipAllowedUserIds(
  env: RakipEnvBag = process.env
): ReadonlySet<string> {
  const raw = env[RAKIP_ALLOWED_USER_IDS_ENV];
  if (raw == null || !String(raw).trim()) return new Set();

  const ids = new Set<string>();
  for (const part of String(raw).split(',')) {
    const id = part.trim().toLowerCase();
    if (isUuid(id)) ids.add(id);
  }
  return ids;
}

/** True only when userId is a valid UUID present in the configured allowlist. */
export function isRakipUserIdAllowed(
  userId: string | null | undefined,
  env: RakipEnvBag = process.env
): boolean {
  const id = String(userId || '')
    .trim()
    .toLowerCase();
  if (!isUuid(id)) return false;

  const allowed = parseRakipAllowedUserIds(env);
  if (allowed.size === 0) return false;

  return allowed.has(id);
}
