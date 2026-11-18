import { timingSafeEqual } from 'node:crypto';
import { Cb360Error } from './types';

/**
 * Machine API auth — Authorization Bearer only (narrow surface).
 * Secret must never appear in client bundles or logs.
 */
export function getCb360ApiSecret(): string | null {
  const secret = process.env.CB360_API_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export function assertCb360ApiSecretConfigured(): string {
  const secret = getCb360ApiSecret();
  if (!secret) {
    throw new Cb360Error(
      'config_missing',
      'CB360_API_SECRET tanımlı değil veya çok kısa (min 16)',
      503
    );
  }
  return secret;
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Extract Bearer credential only — custom secret headers are not accepted. */
export function extractCb360ApiCredential(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function authorizeCb360MachineRequest(request: Request): void {
  const expected = assertCb360ApiSecretConfigured();
  const provided = extractCb360ApiCredential(request);
  if (!provided || !safeEqualString(provided, expected)) {
    throw new Cb360Error('unauthorized', 'Unauthorized', 401);
  }
}

/** Redact secrets from arbitrary log-bound objects. */
export function redactForLogs<T extends Record<string, unknown>>(input: T): T {
  const sensitive =
    /secret|token|password|authorization|service.?role|api.?key|lease.?token/i;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (sensitive.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > 200) {
      out[key] = `${value.slice(0, 32)}…[truncated]`;
    } else {
      out[key] = value;
    }
  }
  return out as T;
}
