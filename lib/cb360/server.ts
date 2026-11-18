import { createServiceClient } from '@/utils/supabase/admin';
import { assertCb360RuntimeEnvironment } from './runtimeGuard';
import type { Cb360ServiceDeps } from './service';
import { createSupabaseRepository } from './supabaseRepository';

/**
 * Live server deps — service role stays on Zebra server only.
 * Fail-closed: production Vercel env blocked; Supabase URL must match
 * CB360_ALLOWED_SUPABASE_REF before any client is created.
 * Do not import this module from client components.
 */
export function createCb360LiveDeps(): Cb360ServiceDeps {
  assertCb360RuntimeEnvironment();
  const client = createServiceClient();
  return {
    repo: createSupabaseRepository(client),
    storageClient: client,
  };
}
