/**
 * CLI for CB360 Storage delete-visibility probe.
 *
 * Default argv → dry-run (zero network / no live client).
 * --execute → Staging storage-only mutate (explicit; requires env file).
 * --cell A (default) → service_role upload cacheControl 0.
 * --cell B | --cell-b → createSignedUploadUrl + E2E signed PUT max-age=3600.
 * --cell C | --cell-c → cell B upload + one service_role GET before remove.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import {
  createPreviewHttpE2eSignedUploader,
  loadCb360StagingEnvFile,
  mergeEnvBags,
  CB360_STAGING_ENV_FILE,
} from './previewHttpE2eLive';
import { assertCb360StagingTarget } from './stagingGuard';
import {
  assertProbeObjectPath,
  assertStorageDeleteProbeFailClosed,
  CB360_STORAGE_DELETE_PROBE_BUCKET,
  CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS,
  CB360_STORAGE_DELETE_PROBE_STAGING_REF,
  CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS,
  createProbeTrackerFs,
  parseStorageDeleteProbeArgv,
  probeFolderPath,
  runStorageDeleteProbe,
  type StorageDeleteProbeCell,
  type StorageDeleteProbeDeps,
  type StorageDeleteProbeResult,
} from './storageDeleteProbe';

export type StorageDeleteProbeCliFactories = {
  loadEnvFile: (filePath: string) => Promise<Cb360EnvBag>;
  createExecuteDeps: (
    env: Cb360EnvBag,
    cell: StorageDeleteProbeCell
  ) => Promise<StorageDeleteProbeDeps>;
};

export type StorageDeleteProbeCliOptions = {
  cwd?: string;
  envFileName?: string;
  processEnv?: Cb360EnvBag;
  factories?: Partial<StorageDeleteProbeCliFactories>;
};

/**
 * Live Staging storage adapter — constructed only for --execute.
 * Validates every path; never touches PostgREST/DB tables.
 * Always exposes cell A upload; cells B/C use uploadViaSignedPut.
 */
export async function createLiveStorageDeleteProbeDeps(
  env: Cb360EnvBag,
  options?: { trackerDir?: string; cell?: StorageDeleteProbeCell }
): Promise<StorageDeleteProbeDeps> {
  assertStorageDeleteProbeFailClosed(env);
  const target = assertCb360StagingTarget(env);
  if (target.projectRef !== CB360_STORAGE_DELETE_PROBE_STAGING_REF) {
    throw new Error('Refusing non-allowlisted Staging project ref');
  }
  if (CB360_STORAGE_DELETE_PROBE_BUCKET !== CB360_BUCKET) {
    throw new Error('Probe bucket constant mismatch');
  }

  const cell: StorageDeleteProbeCell = options?.cell ?? 'A';
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(target.url, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let uploadCalls = 0;
  let removeCalls = 0;
  const signedUploader = createPreviewHttpE2eSignedUploader(fetch);

  // Offline contract: E2E uploader headers must match cell B constants.
  void CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS;

  return {
    env,
    cell,
    fs: createProbeTrackerFs(options?.trackerDir),
    storage: {
      async upload(objectPath, bytes) {
        assertProbeObjectPath(objectPath);
        uploadCalls += 1;
        if (uploadCalls > 1) {
          throw new Error('live probe upload budget exceeded');
        }
        const { error } = await client.storage
          .from(CB360_BUCKET)
          .upload(objectPath, bytes, { ...CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS });
        return { error: error ? { message: error.message } : null };
      },
      async uploadViaSignedPut(objectPath, bytes) {
        assertProbeObjectPath(objectPath);
        uploadCalls += 1;
        if (uploadCalls > 1) {
          throw new Error('live probe upload budget exceeded');
        }
        const { data, error } = await client.storage
          .from(CB360_BUCKET)
          .createSignedUploadUrl(objectPath, { upsert: false });
        if (error || !data?.signedUrl || !data.token) {
          return {
            error: {
              message: (error?.message ?? 'cell_b_upload_url_missing').slice(
                0,
                200
              ),
            },
          };
        }
        // Intentionally do not log/store data.signedUrl or data.token.
        try {
          await signedUploader.putSigned({
            signedUrl: data.signedUrl,
            token: data.token,
            path: objectPath,
            bytes: Buffer.from(bytes),
          });
          return { error: null };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: { message: message.slice(0, 200) } };
        }
      },
      async remove(paths) {
        if (paths.length !== 1) {
          throw new Error('live probe remove accepts exactly one exact path');
        }
        const only = paths[0];
        if (!only) throw new Error('missing remove path');
        assertProbeObjectPath(only);
        removeCalls += 1;
        if (removeCalls > 1) {
          throw new Error('live probe remove budget exceeded');
        }
        const { data, error } = await client.storage
          .from(CB360_BUCKET)
          .remove([only]);
        return {
          data: Array.isArray(data)
            ? data.map((row) => ({ name: row?.name ?? null }))
            : null,
          error: error ? { message: error.message } : null,
        };
      },
      async download(objectPath) {
        assertProbeObjectPath(objectPath);
        const { data, error } = await client.storage
          .from(CB360_BUCKET)
          .download(objectPath);
        return {
          data,
          error: error ? { message: error.message } : null,
        };
      },
      async list(folderPath) {
        const objectPath = `${folderPath}/probe.bin`;
        assertProbeObjectPath(objectPath);
        if (probeFolderPath(objectPath) !== folderPath) {
          throw new Error('list folder mismatch');
        }
        const { data, error } = await client.storage
          .from(CB360_BUCKET)
          .list(folderPath, { limit: 20 });
        return {
          data: Array.isArray(data)
            ? data.map((row) => ({ name: row?.name ?? null }))
            : null,
          error: error ? { message: error.message } : null,
        };
      },
    },
  };
}

function defaultFactories(): StorageDeleteProbeCliFactories {
  return {
    loadEnvFile: loadCb360StagingEnvFile,
    createExecuteDeps: (env, cell) =>
      createLiveStorageDeleteProbeDeps(env, { cell }),
  };
}

/**
 * Programmatic CLI. Offline tests inject factories; dry-run never loads env.
 */
export async function runStorageDeleteProbeCli(
  argv: string[],
  options: StorageDeleteProbeCliOptions = {}
): Promise<StorageDeleteProbeResult> {
  const { mode, cell } = parseStorageDeleteProbeArgv(argv);
  const factories: StorageDeleteProbeCliFactories = {
    ...defaultFactories(),
    ...options.factories,
  };

  if (mode === 'dry-run') {
    return runStorageDeleteProbe({ mode: 'dry-run', cell });
  }

  const cwd = options.cwd ?? process.cwd();
  const envFile = path.join(
    cwd,
    options.envFileName ?? CB360_STAGING_ENV_FILE
  );

  try {
    const fileEnv = await factories.loadEnvFile(envFile);
    const env = mergeEnvBags(fileEnv, options.processEnv ?? process.env);
    const deps = await factories.createExecuteDeps(env, cell);
    return await runStorageDeleteProbe({ mode: 'execute', cell, deps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode,
      cell,
      aborted: true,
      sessionId: null,
      objectPath: null,
      verdict: 'NO-GO',
      steps: [{ step: 'cli_gate', status: 'aborted', detail: message }],
      timeline: [],
      removeSummary: null,
      preRemoveGetCallCount: 0,
      preRemoveGetMatched: null,
      firstDownloadAbsentElapsedSec: null,
      firstListAbsentElapsedSec: null,
      divergenceObserved: false,
      stillPresentAt60s: false,
      error: message,
    };
  }
}

function printSafeResult(result: StorageDeleteProbeResult): void {
  const safe = {
    ok: result.ok,
    mode: result.mode,
    cell: result.cell,
    aborted: result.aborted,
    sessionId: result.sessionId,
    objectPath: result.objectPath,
    verdict: result.verdict,
    error: result.error,
    removeSummary: result.removeSummary,
    preRemoveGetCallCount: result.preRemoveGetCallCount,
    preRemoveGetMatched: result.preRemoveGetMatched,
    firstDownloadAbsentElapsedSec: result.firstDownloadAbsentElapsedSec,
    firstListAbsentElapsedSec: result.firstListAbsentElapsedSec,
    divergenceObserved: result.divergenceObserved,
    stillPresentAt60s: result.stillPresentAt60s,
    timeline: result.timeline,
    steps: result.steps.map((s) => ({
      step: s.step,
      status: s.status,
      detail: s.detail,
    })),
  };
  console.log(JSON.stringify(safe, null, 2));
}

async function main(): Promise<void> {
  const result = await runStorageDeleteProbeCli(process.argv.slice(2));
  printSafeResult(result);
  process.exitCode = result.ok ? 0 : 1;
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
