import { assertLeaseTokenMatch } from './integrity';
import {
  CB360_ACTIVE_STATUSES,
  Cb360Error,
  type Cb360LeaseLock,
  type Cb360RunStatus,
  type Cb360ScanRun,
} from './types';

export const CB360_DEFAULT_LEASE_TTL_MS = 15 * 60 * 1000;
export const CB360_HEARTBEAT_EXTEND_MS = 15 * 60 * 1000;

export function isActiveStatus(status: Cb360RunStatus): boolean {
  return (CB360_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function isLeaseExpired(expiresAtIso: string, now = new Date()): boolean {
  return new Date(expiresAtIso).getTime() <= now.getTime();
}

export function computeLeaseExpiry(from = new Date(), ttlMs = CB360_DEFAULT_LEASE_TTL_MS): string {
  return new Date(from.getTime() + ttlMs).toISOString();
}

/**
 * Can a new run acquire the global lease?
 * Expired lock or empty lock → yes.
 */
export function canAcquireLease(
  lock: Cb360LeaseLock,
  now = new Date()
): { ok: true } | { ok: false; runId: string; expiresAt: string } {
  if (!lock.runId || !lock.leaseExpiresAt) return { ok: true };
  if (isLeaseExpired(lock.leaseExpiresAt, now)) return { ok: true };
  return { ok: false, runId: lock.runId, expiresAt: lock.leaseExpiresAt };
}

/**
 * Fencing: run must own lock generation + valid token + not expired + active status.
 */
export function assertRunOwnsLease(params: {
  run: Cb360ScanRun;
  lock: Cb360LeaseLock;
  presentedToken: string;
  now?: Date;
}): void {
  const now = params.now ?? new Date();
  const { run, lock, presentedToken } = params;

  if (!isActiveStatus(run.status)) {
    throw new Cb360Error('forbidden_lease', 'Run aktif lease durumunda değil', 403);
  }

  if (lock.runId !== run.id || lock.leaseGeneration !== run.leaseGeneration) {
    throw new Cb360Error(
      'forbidden_lease',
      'Lease fencing başarısız: sahiplik/generation uyuşmuyor',
      403
    );
  }

  if (isLeaseExpired(run.leaseExpiresAt, now) || isLeaseExpired(lock.leaseExpiresAt ?? '', now)) {
    throw new Cb360Error('lease_expired', 'Lease süresi dolmuş', 410);
  }

  assertLeaseTokenMatch(presentedToken, run.leaseTokenHash);
}

export function nextLeaseGeneration(current: number): number {
  return current + 1;
}
