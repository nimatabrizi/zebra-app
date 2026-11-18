/**
 * Live Preview/Staging wiring for previewHttpE2eRunner.
 *
 * Factories are intentional: call only from CLI for --execute / --inspect.
 * Dry-run must never import-call these factories.
 *
 * Secrets: load from gitignored env file into memory — never log values.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import type { PreviewE2eDbClient } from './previewE2eCleanup';
import { assertCb360StagingTarget } from './stagingGuard';
import {
  assertPreviewHttpE2eFailClosed,
  assertPreviewHttpE2eHost,
  CB360_PREVIEW_E2E_HOST,
  CB360_PREVIEW_E2E_STAGING_REF,
  createDefaultTrackerFs,
  type PreviewHttpE2eDeps,
  type PreviewHttpE2eHttp,
  type PreviewHttpE2eStaging,
  type PreviewHttpE2eUpload,
} from './previewHttpE2eRunner';

export const CB360_STAGING_ENV_FILE = '.env.cb360.staging.local';

/**
 * Parse KEY=VALUE env file into a bag. Values are not logged.
 */
export async function loadCb360StagingEnvFile(
  filePath: string
): Promise<Cb360EnvBag> {
  const raw = await fs.readFile(filePath, 'utf8');
  const bag: Record<string, string | undefined> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    bag[key] = value;
  }
  return bag;
}

export function mergeEnvBags(
  fileEnv: Cb360EnvBag,
  processEnv: Cb360EnvBag = process.env
): Cb360EnvBag {
  // File wins for CB360_* / VERCEL_AUTOMATION_* to avoid .env.local production bleed.
  return {
    ...processEnv,
    ...fileEnv,
  };
}

function assertNoRedirectOrAuthFailure(status: number, label: string): void {
  if (status === 301 || status === 302 || status === 307 || status === 308) {
    throw new Error(`${label}: unexpected redirect HTTP ${status}`);
  }
  if (status === 401) {
    throw new Error(`${label}: unauthorized HTTP 401`);
  }
  if (status >= 500) {
    throw new Error(`${label}: server error HTTP ${status}`);
  }
}

/** Preview API HTTP — redirect: manual, never follows. Status returned to runner. */
export function createPreviewHttpE2eFetchHttp(
  fetchImpl: typeof fetch = fetch
): PreviewHttpE2eHttp {
  return {
    async request({ method, url, headers, body }) {
      const res = await fetchImpl(url, {
        method,
        headers,
        body,
        redirect: 'manual',
      });
      let json: unknown = null;
      const text = await res.text();
      if (text) {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          json = null;
        }
      }
      return { status: res.status, json };
    },
  };
}

/**
 * Signed upload per @supabase/storage-js uploadToSignedUrl contract:
 * PUT to signed URL with token query param, raw body, content-type,
 * x-upsert false. No redirect following.
 */
export function createPreviewHttpE2eSignedUploader(
  fetchImpl: typeof fetch = fetch
): PreviewHttpE2eUpload {
  return {
    async putSigned({ signedUrl, token, bytes }) {
      const url = new URL(signedUrl);
      if (!url.searchParams.get('token')) {
        url.searchParams.set('token', token);
      }
      const res = await fetchImpl(url.toString(), {
        method: 'PUT',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/octet-stream',
          'cache-control': 'max-age=3600',
          'x-upsert': 'false',
        },
        // BodyInit typing: use Uint8Array view over the synthetic buffer.
        body: new Uint8Array(bytes),
      });
      assertNoRedirectOrAuthFailure(res.status, 'signed-upload');
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`signed-upload: unexpected HTTP ${res.status}`);
      }
    },
  };
}

function asCleanupClient(client: SupabaseClient): PreviewE2eDbClient {
  return client as unknown as PreviewE2eDbClient;
}

export function createPreviewHttpE2eStagingFromClient(
  client: SupabaseClient,
  projectRef: string
): PreviewHttpE2eStaging {
  if (projectRef !== CB360_PREVIEW_E2E_STAGING_REF) {
    throw new Error('Staging client projectRef mismatch');
  }

  return {
    async snapshot() {
      const { data: current, error: curErr } = await client
        .from('cb360_current_bundle')
        .select('source_version_id, updated_by_run_id')
        .eq('id', 1)
        .maybeSingle();
      if (curErr) throw new Error(`current_bundle read: ${curErr.message}`);

      const { count: runCount, error: runErr } = await client
        .from('cb360_scan_runs')
        .select('id', { count: 'exact', head: true });
      if (runErr) throw new Error(`scan_runs count: ${runErr.message}`);

      const { count: versionCount, error: verErr } = await client
        .from('cb360_source_versions')
        .select('id', { count: 'exact', head: true });
      if (verErr) throw new Error(`source_versions count: ${verErr.message}`);

      const { data: lock, error: lockErr } = await client
        .from('cb360_lease_lock')
        .select('run_id, lease_expires_at')
        .eq('id', 1)
        .maybeSingle();
      if (lockErr) throw new Error(`lease_lock read: ${lockErr.message}`);

      const leaseExpiresAt =
        typeof lock?.lease_expires_at === 'string' ? lock.lease_expires_at : null;
      const runId = typeof lock?.run_id === 'string' ? lock.run_id : null;
      const activeLease = Boolean(
        runId &&
          leaseExpiresAt &&
          new Date(leaseExpiresAt).getTime() > Date.now()
      );

      return {
        projectRef,
        current: current
          ? {
              sourceVersionId: String(current.source_version_id),
              updatedByRunId:
                current.updated_by_run_id == null
                  ? null
                  : String(current.updated_by_run_id),
            }
          : null,
        runCount: runCount ?? 0,
        versionCount: versionCount ?? 0,
        lease: { runId, leaseExpiresAt },
        activeLease,
      };
    },

    async getRun(runId) {
      const { data, error } = await client
        .from('cb360_scan_runs')
        .select('id, status, published, became_current, output_version_id')
        .eq('id', runId)
        .maybeSingle();
      if (error) throw new Error(`getRun: ${error.message}`);
      if (!data) return null;
      return {
        id: String(data.id),
        status: String(data.status),
        published: Boolean(data.published),
        becameCurrent: Boolean(data.became_current),
        outputVersionId:
          data.output_version_id == null
            ? null
            : String(data.output_version_id),
      };
    },

    async getVersion(versionId) {
      const { data, error } = await client
        .from('cb360_source_versions')
        .select('id, object_path')
        .eq('id', versionId)
        .maybeSingle();
      if (error) throw new Error(`getVersion: ${error.message}`);
      if (!data) return null;
      return {
        id: String(data.id),
        objectPath: String(data.object_path),
      };
    },

    async storageObjectExists(objectPath) {
      const { data, error } = await client.storage
        .from(CB360_BUCKET)
        .download(objectPath);
      return !error && data != null;
    },

    asCleanupClient: () => asCleanupClient(client),
  };
}

async function createStagingSupabaseClient(
  env: Cb360EnvBag
): Promise<{ client: SupabaseClient; projectRef: string }> {
  assertPreviewHttpE2eFailClosed(env);
  const target = assertCb360StagingTarget(env);
  if (target.projectRef !== CB360_PREVIEW_E2E_STAGING_REF) {
    throw new Error('Refusing non-allowlisted Staging project ref');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(target.url, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { client, projectRef: target.projectRef };
}

function readOnlyBlocked(op: string): never {
  throw new Error(`inspect is read-only; blocked: ${op}`);
}

/**
 * Read-only Staging deps for --inspect.
 * No Preview fetch, no signed upload, no cleanup client usage.
 */
export async function createLiveInspectDeps(
  env: Cb360EnvBag,
  options?: { trackerDir?: string; fetchImpl?: typeof fetch }
): Promise<PreviewHttpE2eDeps> {
  assertPreviewHttpE2eHost(CB360_PREVIEW_E2E_HOST);
  assertPreviewHttpE2eFailClosed(env);
  const { client, projectRef } = await createStagingSupabaseClient(env);
  const staging = createPreviewHttpE2eStagingFromClient(client, projectRef);
  staging.asCleanupClient = () => readOnlyBlocked('asCleanupClient');

  return {
    env,
    fs: createDefaultTrackerFs(
      options?.trackerDir ??
        path.join(process.cwd(), '.cb360-preview-e2e')
    ),
    staging,
    http: {
      async request() {
        readOnlyBlocked('preview http');
      },
    },
    upload: {
      async putSigned() {
        readOnlyBlocked('signed upload');
      },
    },
  };
}

/**
 * Full live deps for --execute only.
 * Creates real fetch + Supabase client + signed uploader.
 */
export async function createLiveExecuteDeps(
  env: Cb360EnvBag,
  options?: { trackerDir?: string; fetchImpl?: typeof fetch }
): Promise<PreviewHttpE2eDeps> {
  assertPreviewHttpE2eHost(CB360_PREVIEW_E2E_HOST);
  assertPreviewHttpE2eFailClosed(env);
  // Secrets presence checked later by runner; ensure staging target is valid first.
  assertCb360StagingTarget(env);

  const fetchImpl = options?.fetchImpl ?? fetch;
  const { client, projectRef } = await createStagingSupabaseClient(env);

  return {
    env,
    fs: createDefaultTrackerFs(
      options?.trackerDir ??
        path.join(process.cwd(), '.cb360-preview-e2e')
    ),
    http: createPreviewHttpE2eFetchHttp(fetchImpl),
    upload: createPreviewHttpE2eSignedUploader(fetchImpl),
    staging: createPreviewHttpE2eStagingFromClient(client, projectRef),
  };
}
