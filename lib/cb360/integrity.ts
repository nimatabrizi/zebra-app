import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Cb360Error } from './types';

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function normalizeSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_HEX.test(normalized)) {
    throw new Cb360Error('invalid_payload', 'sha256 must be 64 lowercase hex chars');
  }
  return normalized;
}

export function assertSha256Match(
  expected: string,
  actual: string,
  label = 'hash'
): void {
  const a = normalizeSha256(expected);
  const b = normalizeSha256(actual);
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    throw new Cb360Error(
      'hash_mismatch',
      `${label} mismatch: client/server SHA-256 uyuşmuyor`,
      409
    );
  }
}

export function hashLeaseToken(token: string): string {
  return sha256Hex(token);
}

export function mintLeaseToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashLeaseToken(token) };
}

export function assertLeaseTokenMatch(presented: string, storedHash: string): void {
  const presentedHash = hashLeaseToken(presented);
  const a = Buffer.from(presentedHash, 'utf8');
  const b = Buffer.from(normalizeSha256(storedHash), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Cb360Error('forbidden_lease', 'Lease token geçersiz', 403);
  }
}

/** Stable hash for idempotent complete — fixed field order only. */
export function hashCompletePayload(payload: {
  runId: string;
  clientSha256: string;
  brandResults: unknown;
  objectPath: string | null | undefined;
}): string {
  const canonical = JSON.stringify({
    runId: payload.runId,
    clientSha256: payload.clientSha256,
    brandResults: payload.brandResults,
    objectPath: payload.objectPath ?? null,
  });
  return sha256Hex(canonical);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}
