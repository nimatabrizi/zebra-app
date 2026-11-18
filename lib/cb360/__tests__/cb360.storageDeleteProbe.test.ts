/**
 * Offline unit tests for storage delete probe — no network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Cb360EnvBag } from '../envBag';
import { createPreviewHttpE2eSignedUploader } from './previewHttpE2eLive';
import {
  runStorageDeleteProbeCli,
  type StorageDeleteProbeCliFactories,
} from './storageDeleteProbeCli';
import {
  assertProbeObjectPath,
  assertStorageDeleteProbeFailClosed,
  buildProbeObjectPath,
  buildSyntheticProbeBytes,
  CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS,
  CB360_STORAGE_DELETE_PROBE_MAX_BYTES,
  CB360_STORAGE_DELETE_PROBE_POLL_SECONDS,
  CB360_STORAGE_DELETE_PROBE_STAGING_REF,
  CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS,
  createProbeSessionId,
  parseStorageDeleteProbeArgv,
  runStorageDeleteProbe,
  summarizeRemoveResponse,
  type StorageDeleteProbeCell,
  type StorageDeleteProbeDeps,
  type StorageDeleteProbeStorage,
  type StorageDeleteProbeTracker,
} from './storageDeleteProbe';

const STAGING_REF = CB360_STORAGE_DELETE_PROBE_STAGING_REF;

function stagingEnv(
  partial: Record<string, string | undefined> = {}
): Cb360EnvBag {
  return {
    CB360_INTEGRATION: '1',
    CB360_TARGET_ENV: 'staging',
    CB360_ALLOW_LIVE_DB: 'staging-only',
    CB360_STAGING_PROJECT_REF: STAGING_REF,
    CB360_STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    CB360_STAGING_SERVICE_ROLE_KEY: 'test-service-role-not-real',
    ...partial,
  };
}

type FakeStorageState = {
  objects: Set<string>;
  /** Last uploaded bytes per path (for cell C payload match). */
  payloads: Map<string, Uint8Array>;
  uploadCalls: number;
  signedUploadCalls: number;
  downloadCalls: number;
  removeCalls: number;
  /** After remove, force download to report exists for N polls. */
  forceDownloadExistsPolls?: number;
  /** After remove, force list to report exists for N polls. */
  forceListExistsPolls?: number;
  removeMode?: 'ok-match' | 'ok-empty' | 'api-error';
  /** Corrupt pre-remove GET payload for mismatch tests. */
  corruptDownloadPayload?: boolean;
};

function createFakeStorage(state: FakeStorageState): StorageDeleteProbeStorage {
  return {
    async upload(objectPath, bytes) {
      state.uploadCalls += 1;
      assert.ok(bytes.byteLength > 0);
      assert.ok(bytes.byteLength <= CB360_STORAGE_DELETE_PROBE_MAX_BYTES);
      state.objects.add(objectPath);
      state.payloads.set(objectPath, new Uint8Array(bytes));
      return { error: null };
    },
    async uploadViaSignedPut(objectPath, bytes) {
      state.signedUploadCalls += 1;
      assert.ok(bytes.byteLength > 0);
      assert.ok(bytes.byteLength <= CB360_STORAGE_DELETE_PROBE_MAX_BYTES);
      state.objects.add(objectPath);
      state.payloads.set(objectPath, new Uint8Array(bytes));
      return { error: null };
    },
    async remove(paths) {
      state.removeCalls += 1;
      assert.equal(paths.length, 1);
      const only = paths[0]!;
      if (state.removeMode === 'api-error') {
        return { data: null, error: { message: 'simulated remove failure' } };
      }
      state.objects.delete(only);
      if (state.removeMode === 'ok-empty') {
        return { data: [], error: null };
      }
      return { data: [{ name: only }], error: null };
    },
    async download(objectPath) {
      state.downloadCalls += 1;
      if (
        typeof state.forceDownloadExistsPolls === 'number' &&
        state.forceDownloadExistsPolls > 0 &&
        state.removeCalls > 0
      ) {
        state.forceDownloadExistsPolls -= 1;
        return { data: Buffer.from('x'), error: null };
      }
      if (state.objects.has(objectPath)) {
        if (state.corruptDownloadPayload) {
          return { data: Buffer.from('wrong'), error: null };
        }
        const payload = state.payloads.get(objectPath) ?? Buffer.from('x');
        return { data: Buffer.from(payload), error: null };
      }
      return { data: null, error: { message: 'Object not found' } };
    },
    async list(folderPath) {
      const objectPath = `${folderPath}/probe.bin`;
      if (
        typeof state.forceListExistsPolls === 'number' &&
        state.forceListExistsPolls > 0 &&
        state.removeCalls > 0
      ) {
        state.forceListExistsPolls -= 1;
        return { data: [{ name: 'probe.bin' }], error: null };
      }
      if (state.objects.has(objectPath)) {
        return { data: [{ name: 'probe.bin' }], error: null };
      }
      return { data: [], error: null };
    },
  };
}

function createDeps(
  state: FakeStorageState,
  env: Cb360EnvBag = stagingEnv(),
  cell: StorageDeleteProbeCell = 'A'
): {
  deps: StorageDeleteProbeDeps;
  trackers: StorageDeleteProbeTracker[];
} {
  const trackers: StorageDeleteProbeTracker[] = [];
  const deps: StorageDeleteProbeDeps = {
    env,
    cell,
    storage: createFakeStorage(state),
    fs: {
      async writeTrackerAtomic(tracker) {
        trackers.push(structuredClone(tracker));
      },
    },
    sleep: async () => {},
    createSessionId: () => 'probe_fixed_session',
    pollSeconds: CB360_STORAGE_DELETE_PROBE_POLL_SECONDS,
  };
  return { deps, trackers };
}

function freshState(
  partial: Partial<FakeStorageState> = {}
): FakeStorageState {
  return {
    objects: new Set(),
    payloads: new Map(),
    uploadCalls: 0,
    signedUploadCalls: 0,
    downloadCalls: 0,
    removeCalls: 0,
    ...partial,
  };
}

describe('storageDeleteProbe gates (offline)', () => {
  it('parse argv defaults to dry-run cell A', () => {
    assert.deepEqual(parseStorageDeleteProbeArgv([]), {
      mode: 'dry-run',
      cell: 'A',
    });
    assert.deepEqual(parseStorageDeleteProbeArgv(['--execute']), {
      mode: 'execute',
      cell: 'A',
    });
    assert.deepEqual(parseStorageDeleteProbeArgv(['--execute', '--cell=B']), {
      mode: 'execute',
      cell: 'B',
    });
    assert.deepEqual(parseStorageDeleteProbeArgv(['--cell-b', '--execute']), {
      mode: 'execute',
      cell: 'B',
    });
    assert.deepEqual(parseStorageDeleteProbeArgv(['--cell', 'B']), {
      mode: 'dry-run',
      cell: 'B',
    });
    assert.deepEqual(parseStorageDeleteProbeArgv(['--execute', '--cell=C']), {
      mode: 'execute',
      cell: 'C',
    });
    assert.deepEqual(parseStorageDeleteProbeArgv(['--cell-c']), {
      mode: 'dry-run',
      cell: 'C',
    });
  });

  it('builds allowlisted probe path and rejects unsafe paths', () => {
    const p = buildProbeObjectPath('probe_abc_123');
    assert.equal(p, 'pe2e_probe/probe_abc_123/probe.bin');
    assert.doesNotThrow(() => assertProbeObjectPath(p));
    assert.throws(() => buildProbeObjectPath('../evil'));
    assert.throws(() =>
      assertProbeObjectPath('snapshots/2026/11/18/run_x/source.xlsx')
    );
    assert.throws(() => assertProbeObjectPath('pe2e_probe/x/other.bin'));
  });

  it('synthetic bytes are <= 64 and session-tagged', () => {
    const id = createProbeSessionId(() => new Date(0));
    const bytes = buildSyntheticProbeBytes(id);
    assert.ok(bytes.byteLength <= CB360_STORAGE_DELETE_PROBE_MAX_BYTES);
    assert.match(Buffer.from(bytes).toString('utf8'), /^cb360-probe:/);
  });

  it('summarizeRemoveResponse keeps only safe fields', () => {
    const summary = summarizeRemoveResponse(
      [{ name: 'pe2e_probe/probe_x/probe.bin' }],
      null,
      'pe2e_probe/probe_x/probe.bin'
    );
    assert.equal(summary.errorMessage, null);
    assert.equal(summary.dataRowCount, 1);
    assert.equal(summary.matchedTrackedPath, true);
    assert.deepEqual(summary.names, [
      { name: 'pe2e_probe/probe_x/probe.bin' },
    ]);
  });

  it('fail-closed on production and wrong ref', () => {
    assert.throws(
      () =>
        assertStorageDeleteProbeFailClosed(
          stagingEnv({ VERCEL_ENV: 'production' })
        ),
      /production/
    );
    assert.throws(
      () =>
        assertStorageDeleteProbeFailClosed(
          stagingEnv({
            CB360_STAGING_PROJECT_REF: 'otherref012345678901',
            CB360_STAGING_SUPABASE_URL:
              'https://otherref012345678901.supabase.co',
          })
        ),
      /allowlisted|expected/
    );
  });
});

describe('storageDeleteProbe dry-run (offline)', () => {
  it('dry-run never touches storage or fs deps', async () => {
    const result = await runStorageDeleteProbe({ mode: 'dry-run' });
    assert.equal(result.ok, true);
    assert.equal(result.verdict, 'DRY-RUN');
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.cell, 'A');
    assert.ok(result.objectPath?.startsWith('pe2e_probe/'));
    assert.ok(result.steps.some((s) => s.step === 'policy'));
  });

  it('dry-run --cell B plans signed PUT without network', async () => {
    const result = await runStorageDeleteProbe({ mode: 'dry-run', cell: 'B' });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'B');
    assert.ok(
      result.steps.some(
        (s) => s.step === 'plan' && /cell=B/.test(s.detail) && /max-age=3600/.test(s.detail)
      )
    );
  });

  it('dry-run --cell C plans pre-remove GET', async () => {
    const result = await runStorageDeleteProbe({ mode: 'dry-run', cell: 'C' });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'C');
    assert.ok(
      result.steps.some(
        (s) =>
          s.step === 'plan' &&
          /cell=C/.test(s.detail) &&
          /preRemoveGet=1/.test(s.detail) &&
          /max-age=3600/.test(s.detail)
      )
    );
  });
});

describe('Probe B vs E2E post-upload Storage access (offline source)', () => {
  it('completeScanRun always downloads object on live path', () => {
    const serviceSrc = readFileSync(
      path.join(process.cwd(), 'lib/cb360/service.ts'),
      'utf8'
    );
    assert.match(
      serviceSrc,
      /downloadAndHashObject\(\s*requireStorage\(deps\),\s*objectPath\s*\)/
    );
    assert.match(serviceSrc, /if \(input\.syntheticServerBytes\)/);

    const routeSrc = readFileSync(
      path.join(process.cwd(), 'app/api/rakip/complete/route.ts'),
      'utf8'
    );
    assert.equal(routeSrc.includes('syntheticServerBytes'), false);
    assert.match(routeSrc, /completeScanRun\(deps,/);
  });

  it('E2E cleanup/pre-verify download before remove; cell C mirrors one GET', () => {
    const runnerSrc = readFileSync(
      path.join(
        process.cwd(),
        'lib/cb360/__tests__/previewHttpE2eRunner.ts'
      ),
      'utf8'
    );
    assert.match(runnerSrc, /storageObjectExists\(objectPath\)/);
    assert.match(runnerSrc, /cleanupPreviewE2eSession\(/);

    const cleanupSrc = readFileSync(
      path.join(process.cwd(), 'lib/cb360/__tests__/previewE2eCleanup.ts'),
      'utf8'
    );
    assert.match(
      cleanupSrc,
      /existedBefore\.set\(p, await storageObjectExists\(client, p\)\)/
    );
    assert.match(cleanupSrc, /\.remove\(objectPaths\)/);

    const probeSrc = readFileSync(
      path.join(process.cwd(), 'lib/cb360/__tests__/storageDeleteProbe.ts'),
      'utf8'
    );
    assert.match(
      probeSrc,
      /Cell C only: exactly one pre-remove GET/
    );
    assert.match(probeSrc, /if \(cell === 'C'\)/);
  });
});

describe('E2E signed upload vs probe upload contract (offline)', () => {
  it('documents cache-control / upsert / content-type divergence', async () => {
    // Cell A: service-role SDK upload uses cacheControl "0".
    assert.equal(CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS.cacheControl, '0');
    assert.equal(CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS.upsert, false);
    assert.equal(
      CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS.contentType,
      'application/octet-stream'
    );

    // Cell B constants match E2E signed PUT headers.
    assert.equal(
      CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS['cache-control'],
      'max-age=3600'
    );
    assert.equal(
      CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS['Content-Type'],
      'application/octet-stream'
    );
    assert.equal(CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS['x-upsert'], 'false');

    let captured: {
      method?: string;
      cacheControl?: string | null;
      contentType?: string | null;
      upsert?: string | null;
      hasTokenQuery?: boolean;
    } = {};
    const uploader = createPreviewHttpE2eSignedUploader(async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      captured = {
        method: init?.method,
        cacheControl: headers.get('cache-control'),
        contentType: headers.get('content-type'),
        upsert: headers.get('x-upsert'),
        hasTokenQuery: Boolean(url.searchParams.get('token')),
      };
      return new Response(null, { status: 200 });
    });
    await uploader.putSigned({
      signedUrl: 'https://example.supabase.co/storage/v1/object/upload/sign/cb360-private/p/x?token=t',
      token: 't',
      path: 'pe2e_probe/x/probe.bin',
      bytes: Buffer.from('x'),
    });
    assert.equal(captured.method, 'PUT');
    assert.equal(
      captured.cacheControl,
      CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS['cache-control']
    );
    assert.equal(
      captured.contentType,
      CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS['Content-Type']
    );
    assert.equal(
      captured.upsert,
      CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS['x-upsert']
    );
    assert.equal(captured.hasTokenQuery, true);
  });
});

describe('storageDeleteProbe execute (offline mocked)', () => {
  it('cell A happy path: delayed disappearance, single upload/remove', async () => {
    const state = freshState({
      forceDownloadExistsPolls: 4, // visible through t=3s, gone at t=5s
      forceListExistsPolls: 4,
      removeMode: 'ok-match',
    });
    const { deps, trackers } = createDeps(state, stagingEnv(), 'A');
    const result = await runStorageDeleteProbe({
      mode: 'execute',
      cell: 'A',
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'A');
    assert.equal(result.verdict, 'GO');
    assert.equal(state.uploadCalls, 1);
    assert.equal(state.signedUploadCalls, 0);
    assert.equal(state.removeCalls, 1);
    assert.equal(result.preRemoveGetCallCount, 0);
    assert.equal(result.preRemoveGetMatched, null);
    assert.equal(result.firstDownloadAbsentElapsedSec, 5);
    assert.equal(result.firstListAbsentElapsedSec, 5);
    assert.equal(result.stillPresentAt60s, false);
    assert.equal(result.divergenceObserved, false);
    assert.ok(result.removeSummary?.matchedTrackedPath);
    assert.ok(trackers.length >= 1);
    assert.equal(trackers.at(-1)?.phase, 'done');
    assert.equal(trackers.at(-1)?.cell, 'A');
    assert.equal(trackers.at(-1)?.removeCallCount, 1);
  });

  it('cell B uses signed PUT path only (A upload untouched)', async () => {
    const state = freshState({ removeMode: 'ok-match' });
    const { deps, trackers } = createDeps(state, stagingEnv(), 'B');
    const result = await runStorageDeleteProbe({
      mode: 'execute',
      cell: 'B',
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'B');
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.signedUploadCalls, 1);
    assert.equal(state.removeCalls, 1);
    assert.equal(result.preRemoveGetCallCount, 0);
    assert.equal(result.preRemoveGetMatched, null);
    // B: downloads only during post-remove polls (8 ticks)
    assert.equal(state.downloadCalls, result.timeline.length);
    assert.equal(trackers.at(-1)?.cell, 'B');
    assert.equal(result.firstDownloadAbsentElapsedSec, 0);
    assert.equal(result.firstListAbsentElapsedSec, 0);
  });

  it('cell C: signed PUT + one pre-remove GET matching payload + one remove', async () => {
    const state = freshState({ removeMode: 'ok-match' });
    const { deps, trackers } = createDeps(state, stagingEnv(), 'C');
    const result = await runStorageDeleteProbe({
      mode: 'execute',
      cell: 'C',
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'C');
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.signedUploadCalls, 1);
    assert.equal(state.removeCalls, 1);
    assert.equal(result.preRemoveGetCallCount, 1);
    assert.equal(result.preRemoveGetMatched, true);
    // 1 pre-remove GET + 8 post-remove poll downloads
    assert.equal(state.downloadCalls, 1 + result.timeline.length);
    assert.equal(trackers.at(-1)?.cell, 'C');
    assert.equal(trackers.at(-1)?.preRemoveGetCallCount, 1);
    assert.equal(trackers.at(-1)?.preRemoveGetMatched, true);
    assert.ok(result.steps.some((s) => s.step === 'pre_remove_get' && s.status === 'ok'));
  });

  it('cell C payload mismatch → aborted before remove', async () => {
    const state = freshState({
      removeMode: 'ok-match',
      corruptDownloadPayload: true,
    });
    const { deps } = createDeps(state, stagingEnv(), 'C');
    const result = await runStorageDeleteProbe({
      mode: 'execute',
      cell: 'C',
      deps,
    });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.equal(state.signedUploadCalls, 1);
    assert.equal(state.downloadCalls, 1);
    assert.equal(state.removeCalls, 0);
    assert.equal(result.preRemoveGetCallCount, 1);
    assert.equal(result.preRemoveGetMatched, false);
    assert.match(String(result.error), /payload mismatch/);
  });

  it('cell B missing uploadViaSignedPut → aborted', async () => {
    const state = freshState();
    const { deps } = createDeps(state, stagingEnv(), 'B');
    delete deps.storage.uploadViaSignedPut;
    const result = await runStorageDeleteProbe({
      mode: 'execute',
      cell: 'B',
      deps,
    });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.signedUploadCalls, 0);
    assert.equal(state.removeCalls, 0);
  });

  it('orphan at 60s → NO-GO without second remove', async () => {
    const state = freshState({
      forceDownloadExistsPolls: 100,
      forceListExistsPolls: 100,
      removeMode: 'ok-empty',
    });
    const { deps, trackers } = createDeps(state);
    const result = await runStorageDeleteProbe({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, 'NO-GO');
    assert.equal(result.stillPresentAt60s, true);
    assert.equal(state.removeCalls, 1);
    assert.equal(state.uploadCalls, 1);
    assert.equal(trackers.at(-1)?.phase, 'orphan_at_60s');
    assert.match(String(result.error), /still present at 60s/);
    assert.match(String(result.objectPath), /^pe2e_probe\/probe_fixed_session\/probe\.bin$/);
  });

  it('reports download vs list divergence', async () => {
    const state = freshState({
      forceDownloadExistsPolls: 6, // download lags longer
      forceListExistsPolls: 2, // list clears earlier
      removeMode: 'ok-match',
    });
    const { deps } = createDeps(state);
    const result = await runStorageDeleteProbe({ mode: 'execute', deps });
    assert.equal(result.ok, true);
    assert.equal(result.divergenceObserved, true);
    assert.ok(result.timeline.some((t) => t.divergent));
    assert.ok(
      (result.firstListAbsentElapsedSec ?? 99) <
        (result.firstDownloadAbsentElapsedSec ?? 0)
    );
  });

  it('remove API error → NO-GO and no polling required', async () => {
    const state = freshState({ removeMode: 'api-error' });
    const { deps } = createDeps(state);
    const result = await runStorageDeleteProbe({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, 'NO-GO');
    assert.equal(state.removeCalls, 1);
    assert.equal(result.timeline.length, 0);
    assert.match(String(result.error), /simulated remove failure/);
  });
});

describe('storageDeleteProbeCli wiring (offline)', () => {
  it('dry-run never loads env file or execute factory', async () => {
    let loadCalls = 0;
    let execCalls = 0;
    const factories: Partial<StorageDeleteProbeCliFactories> = {
      async loadEnvFile() {
        loadCalls += 1;
        return stagingEnv();
      },
      async createExecuteDeps() {
        execCalls += 1;
        throw new Error('should not create execute deps in dry-run');
      },
    };
    const result = await runStorageDeleteProbeCli([], { factories });
    assert.equal(result.ok, true);
    assert.equal(result.verdict, 'DRY-RUN');
    assert.equal(result.cell, 'A');
    assert.equal(loadCalls, 0);
    assert.equal(execCalls, 0);
  });

  it('dry-run --cell-b never loads env', async () => {
    let loadCalls = 0;
    const result = await runStorageDeleteProbeCli(['--cell-b'], {
      factories: {
        async loadEnvFile() {
          loadCalls += 1;
          return stagingEnv();
        },
        async createExecuteDeps() {
          throw new Error('unreachable');
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'B');
    assert.equal(loadCalls, 0);
  });

  it('execute uses factory after env load (cell A)', async () => {
    const state = freshState({ removeMode: 'ok-match' });
    const { deps } = createDeps(state, stagingEnv(), 'A');
    let loadCalls = 0;
    const result = await runStorageDeleteProbeCli(['--execute'], {
      factories: {
        async loadEnvFile() {
          loadCalls += 1;
          return stagingEnv();
        },
        async createExecuteDeps(env, cell) {
          assert.equal(env.CB360_STAGING_PROJECT_REF, STAGING_REF);
          assert.equal(cell, 'A');
          return deps;
        },
      },
    });
    assert.equal(loadCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'A');
    assert.equal(result.verdict, 'GO');
    assert.equal(state.uploadCalls, 1);
    assert.equal(state.signedUploadCalls, 0);
    assert.equal(state.removeCalls, 1);
  });

  it('execute --cell=B uses signed upload factory path', async () => {
    const state = freshState({ removeMode: 'ok-match' });
    const { deps } = createDeps(state, stagingEnv(), 'B');
    const result = await runStorageDeleteProbeCli(['--execute', '--cell=B'], {
      factories: {
        async loadEnvFile() {
          return stagingEnv();
        },
        async createExecuteDeps(_env, cell) {
          assert.equal(cell, 'B');
          return deps;
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'B');
    assert.equal(state.uploadCalls, 0);
    assert.equal(state.signedUploadCalls, 1);
    assert.equal(state.removeCalls, 1);
  });

  it('execute --cell=C wires pre-remove GET', async () => {
    const state = freshState({ removeMode: 'ok-match' });
    const { deps } = createDeps(state, stagingEnv(), 'C');
    const result = await runStorageDeleteProbeCli(['--execute', '--cell-c'], {
      factories: {
        async loadEnvFile() {
          return stagingEnv();
        },
        async createExecuteDeps(_env, cell) {
          assert.equal(cell, 'C');
          return deps;
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.cell, 'C');
    assert.equal(state.signedUploadCalls, 1);
    assert.equal(state.removeCalls, 1);
    assert.equal(result.preRemoveGetCallCount, 1);
    assert.equal(result.preRemoveGetMatched, true);
  });

  it('execute fail-closed when production env in bag', async () => {
    const result = await runStorageDeleteProbeCli(['--execute'], {
      factories: {
        async loadEnvFile() {
          return stagingEnv({ VERCEL_ENV: 'production' });
        },
        async createExecuteDeps(env) {
          assertStorageDeleteProbeFailClosed(env);
          throw new Error('unreachable');
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.match(String(result.error), /production/);
  });
});
