/**
 * Offline unit tests for previewHttpE2eRunner — no network.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import {
  PreviewE2eCleanupError,
  type PreviewE2eDbClient,
} from './previewE2eCleanup';
import {
  assertPreviewHttpE2eFailClosed,
  assertPreviewHttpE2eHost,
  buildSyntheticArtifactBytes,
  CB360_PREVIEW_E2E_HOST,
  CB360_PREVIEW_E2E_STAGING_REF,
  isIncompleteTrackerPhase,
  parsePreviewHttpE2eArgv,
  runPreviewHttpE2e,
  sha256HexBuffer,
  type PreviewHttpE2eDeps,
  type PreviewHttpE2eFs,
  type PreviewHttpE2eHttpResponse,
  type PreviewHttpE2eStagingSnapshot,
  type PreviewHttpE2eTrackerFile,
} from './previewHttpE2eRunner';

function stagingEnv(
  partial: Record<string, string | undefined> = {}
): Cb360EnvBag {
  return {
    CB360_STAGING_PROJECT_REF: CB360_PREVIEW_E2E_STAGING_REF,
    CB360_STAGING_SUPABASE_URL: `https://${CB360_PREVIEW_E2E_STAGING_REF}.supabase.co`,
    CB360_API_SECRET: 'test-cb360-api-secret-16chars',
    VERCEL_AUTOMATION_BYPASS_SECRET: 'test-vercel-bypass-secret',
    ...partial,
  };
}

function memoryFs(): PreviewHttpE2eFs & {
  store: Map<string, PreviewHttpE2eTrackerFile>;
  failNextWrite: boolean;
} {
  const store = new Map<string, PreviewHttpE2eTrackerFile>();
  const api: PreviewHttpE2eFs & {
    store: Map<string, PreviewHttpE2eTrackerFile>;
    failNextWrite: boolean;
  } = {
    store,
    failNextWrite: false,
    trackerDir: ':memory:',
    async listSessionIds() {
      return [...store.keys()];
    },
    async readTracker(sessionId) {
      return store.get(sessionId) ?? null;
    },
    async writeTrackerAtomic(tracker) {
      if (api.failNextWrite) {
        api.failNextWrite = false;
        throw new Error('simulated tracker write failure');
      }
      // Ensure no secrets slipped in
      const raw = JSON.stringify(tracker);
      assert.equal(/leaseToken|signedUrl|"token"/i.test(raw), false);
      store.set(tracker.sessionId, structuredClone(tracker));
    },
  };
  return api;
}

type FakeWorld = {
  snap: PreviewHttpE2eStagingSnapshot;
  runs: Map<
    string,
    {
      id: string;
      status: string;
      published: boolean;
      becameCurrent: boolean;
      outputVersionId: string | null;
      leaseToken: string;
    }
  >;
  versions: Map<string, { id: string; objectPath: string; createdByRunId: string }>;
  objects: Set<string>;
  lease: { runId: string | null; leaseExpiresAt: string | null };
  httpCalls: Array<{ method: string; url: string }>;
  uploadCalls: number;
  mutations: string[];
};

function emptySnap(): PreviewHttpE2eStagingSnapshot {
  return {
    projectRef: CB360_PREVIEW_E2E_STAGING_REF,
    current: null,
    runCount: 0,
    versionCount: 0,
    lease: { runId: null, leaseExpiresAt: null },
    activeLease: false,
  };
}

function createDeps(opts?: {
  env?: Cb360EnvBag;
  world?: Partial<FakeWorld>;
  httpHandler?: (
    req: { method: string; url: string; body?: string },
    world: FakeWorld
  ) => PreviewHttpE2eHttpResponse;
}): { deps: PreviewHttpE2eDeps; fs: ReturnType<typeof memoryFs>; world: FakeWorld } {
  const fsApi = memoryFs();
  const world: FakeWorld = {
    snap: emptySnap(),
    runs: new Map(),
    versions: new Map(),
    objects: new Set(),
    lease: { runId: null, leaseExpiresAt: null },
    httpCalls: [],
    uploadCalls: 0,
    mutations: [],
    ...opts?.world,
  };

  const defaultHttp = (
    req: { method: string; url: string; body?: string },
    w: FakeWorld
  ): PreviewHttpE2eHttpResponse => {
    const body = req.body ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    if (req.url.endsWith('/api/rakip/start') && req.method === 'POST') {
      const runId = 'run_e2e_001';
      const leaseToken = 'lease_token_memory_only';
      w.runs.set(runId, {
        id: runId,
        status: 'started',
        published: false,
        becameCurrent: false,
        outputVersionId: null,
        leaseToken,
      });
      w.lease = {
        runId,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      w.snap = {
        ...w.snap,
        runCount: w.runs.size,
        lease: { ...w.lease },
        activeLease: true,
      };
      w.mutations.push('start');
      return {
        status: 201,
        json: {
          runId,
          leaseToken,
          leaseExpiresAt: w.lease.leaseExpiresAt,
          leaseGeneration: 1,
          baseVersionId: null,
          baseSha256: null,
          logicalBundleId: 'bundle_1',
          mode: 'synthetic',
        },
      };
    }
    if (req.url.endsWith('/api/rakip/heartbeat')) {
      const runId = String(body.runId);
      const run = w.runs.get(runId);
      if (!run || body.leaseToken !== run.leaseToken) {
        return { status: 403, json: { code: 'forbidden_lease' } };
      }
      run.status = 'running';
      w.mutations.push('heartbeat');
      return {
        status: 200,
        json: { leaseExpiresAt: w.lease.leaseExpiresAt, status: 'running' },
      };
    }
    if (req.url.endsWith('/api/rakip/upload-authorize')) {
      const runId = String(body.runId);
      const path = `snapshots/2026/11/18/${runId}/source.xlsx`;
      w.mutations.push('upload-authorize');
      return {
        status: 200,
        json: {
          signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/${CB360_BUCKET}/${path}?token=upload-token`,
          token: 'upload-token',
          path,
          bucket: CB360_BUCKET,
          expiresInSeconds: 7200,
          upsert: false,
        },
      };
    }
    if (req.url.endsWith('/api/rakip/complete')) {
      const runId = String(body.runId);
      const run = w.runs.get(runId);
      const objectPath = String(body.objectPath);
      if (!run || body.leaseToken !== run.leaseToken) {
        return { status: 403, json: { code: 'forbidden_lease' } };
      }
      if (run.status === 'completed' && run.outputVersionId) {
        w.mutations.push('complete-idempotent');
        return {
          status: 200,
          json: {
            idempotent: true,
            status: 'completed',
            published: true,
            becameCurrent: true,
            outputVersionId: run.outputVersionId,
            serverSha256: body.clientSha256,
          },
        };
      }
      if (!w.objects.has(objectPath)) {
        return { status: 502, json: { code: 'storage_error' } };
      }
      const outputVersionId = 'ver_e2e_001';
      w.versions.set(outputVersionId, {
        id: outputVersionId,
        objectPath,
        createdByRunId: runId,
      });
      run.status = 'completed';
      run.published = true;
      run.becameCurrent = true;
      run.outputVersionId = outputVersionId;
      w.lease = { runId: null, leaseExpiresAt: null };
      w.snap = {
        projectRef: CB360_PREVIEW_E2E_STAGING_REF,
        current: {
          sourceVersionId: outputVersionId,
          updatedByRunId: runId,
        },
        runCount: w.runs.size,
        versionCount: w.versions.size,
        lease: { ...w.lease },
        activeLease: false,
      };
      w.mutations.push('complete');
      return {
        status: 200,
        json: {
          idempotent: false,
          status: 'completed',
          published: true,
          becameCurrent: true,
          outputVersionId,
          serverSha256: body.clientSha256,
        },
      };
    }
    if (req.url.includes('/api/rakip/status')) {
      const runId = new URL(req.url).searchParams.get('runId') ?? '';
      const run = w.runs.get(runId);
      if (!run) return { status: 404, json: { code: 'not_found' } };
      return {
        status: 200,
        json: {
          runId,
          status: run.status,
          published: run.published,
          becameCurrent: run.becameCurrent,
          outputVersionId: run.outputVersionId,
        },
      };
    }
    return { status: 404, json: { code: 'not_found' } };
  };

  const handler = opts?.httpHandler ?? defaultHttp;

  function cleanupClient(): PreviewE2eDbClient {
    type Filter = { type: 'eq' | 'in'; column: string; value: unknown };
    const matches = (row: Record<string, unknown>, filters: Filter[]) => {
      for (const f of filters) {
        if (f.type === 'eq' && row[f.column] !== f.value) return false;
        if (f.type === 'in' && !(f.value as unknown[]).includes(row[f.column])) {
          return false;
        }
      }
      return true;
    };

    const builder = (table: string) => {
      let mode: 'select' | 'update' | 'delete' = 'select';
      let patch: Record<string, unknown> = {};
      const filters: Filter[] = [];
      const api = {
        select() {
          return api;
        },
        update(values: Record<string, unknown>) {
          mode = 'update';
          patch = values;
          return api;
        },
        delete() {
          mode = 'delete';
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push({ type: 'eq', column, value });
          return api;
        },
        in(column: string, values: readonly string[]) {
          filters.push({ type: 'in', column, value: [...values] });
          return api;
        },
        maybeSingle() {
          return execute().then((r) => ({
            data: r.data?.[0] ?? null,
            error: r.error,
          }));
        },
        then(
          onfulfilled?: ((v: {
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }) => unknown) | null,
          onrejected?: ((e: unknown) => unknown) | null
        ) {
          return execute().then(onfulfilled, onrejected);
        },
      };

      async function execute() {
        if (table === 'cb360_lease_lock') {
          const row = {
            id: 1,
            run_id: world.lease.runId,
          } as Record<string, unknown>;
          if (mode === 'update' && matches(row, filters)) {
            world.mutations.push('cleanup_lease');
            world.lease.runId = null;
            world.lease.leaseExpiresAt = null;
            world.snap.activeLease = false;
            world.snap.lease = { ...world.lease };
            return { data: [{ id: 1, run_id: null }], error: null };
          }
          return { data: [], error: null };
        }
        if (table === 'cb360_current_bundle') {
          if (mode === 'delete') {
            if (!world.snap.current) return { data: [], error: null };
            const row = {
              id: 1,
              source_version_id: world.snap.current.sourceVersionId,
              updated_by_run_id: world.snap.current.updatedByRunId,
            } as Record<string, unknown>;
            if (!matches(row, filters)) return { data: [], error: null };
            world.mutations.push('cleanup_current');
            const deleted = { ...row };
            world.snap.current = null;
            return { data: [deleted], error: null };
          }
          if (mode === 'select') {
            if (!world.snap.current) return { data: [], error: null };
            return {
              data: [
                {
                  id: 1,
                  source_version_id: world.snap.current.sourceVersionId,
                  updated_by_run_id: world.snap.current.updatedByRunId,
                },
              ],
              error: null,
            };
          }
        }
        if (table === 'cb360_scan_runs') {
          if (mode === 'select') {
            const rows = [...world.runs.values()].map((r) => ({
              id: r.id,
              base_version_id: null,
              output_version_id: r.outputVersionId,
            }));
            return {
              data: rows.filter((r) =>
                matches(r as unknown as Record<string, unknown>, filters)
              ) as unknown as Record<string, unknown>[],
              error: null,
            };
          }
          if (mode === 'delete') {
            const removed: Record<string, unknown>[] = [];
            for (const [id, run] of [...world.runs.entries()]) {
              if (matches({ id: run.id }, filters)) {
                world.runs.delete(id);
                removed.push({ id });
              }
            }
            world.snap.runCount = world.runs.size;
            world.mutations.push(`cleanup_runs:${removed.length}`);
            return { data: removed, error: null };
          }
        }
        if (table === 'cb360_source_versions') {
          if (mode === 'delete') {
            const removed: Record<string, unknown>[] = [];
            for (const [id, ver] of [...world.versions.entries()]) {
              if (matches({ id: ver.id }, filters)) {
                world.versions.delete(id);
                removed.push({ id });
              }
            }
            world.snap.versionCount = world.versions.size;
            world.mutations.push(`cleanup_versions:${removed.length}`);
            return { data: removed, error: null };
          }
          if (mode === 'select') {
            return {
              data: [...world.versions.values()].map((v) => ({
                id: v.id,
                object_path: v.objectPath,
              })),
              error: null,
            };
          }
        }
        void patch;
        return { data: null, error: { message: `unsupported ${table}` } };
      }

      return api;
    };

    return {
      from(table: string) {
        return builder(table) as unknown as ReturnType<PreviewE2eDbClient['from']>;
      },
      storage: {
        from(bucket: string) {
          return {
            async download(objectPath: string) {
              assert.equal(bucket, CB360_BUCKET);
              if (world.objects.has(objectPath)) {
                return { data: Buffer.from('x'), error: null };
              }
              return { data: null, error: { message: 'Object not found' } };
            },
            async remove(paths: string[]) {
              assert.equal(bucket, CB360_BUCKET);
              world.mutations.push(`cleanup_storage:${paths.join(',')}`);
              for (const p of paths) world.objects.delete(p);
              return {
                data: paths.map((p) => ({ name: p })),
                error: null,
              };
            },
          };
        },
      },
    };
  }

  const deps: PreviewHttpE2eDeps = {
    env: opts?.env ?? stagingEnv(),
    fs: fsApi,
    createSessionId: () => 'pe2e_fixed_session',
    http: {
      async request(req) {
        world.httpCalls.push({ method: req.method, url: req.url });
        return handler(req, world);
      },
    },
    upload: {
      async putSigned(input) {
        world.uploadCalls += 1;
        world.objects.add(input.path);
        world.mutations.push(`upload:${input.path}`);
      },
    },
    staging: {
      async snapshot() {
        return {
          ...world.snap,
          runCount: world.runs.size,
          versionCount: world.versions.size,
          lease: { ...world.lease },
          activeLease: Boolean(
            world.lease.runId &&
              world.lease.leaseExpiresAt &&
              new Date(world.lease.leaseExpiresAt).getTime() > Date.now()
          ),
        };
      },
      async getRun(runId) {
        const r = world.runs.get(runId);
        if (!r) return null;
        return {
          id: r.id,
          status: r.status,
          published: r.published,
          becameCurrent: r.becameCurrent,
          outputVersionId: r.outputVersionId,
        };
      },
      async getVersion(versionId) {
        const v = world.versions.get(versionId);
        return v ? { id: v.id, objectPath: v.objectPath } : null;
      },
      async storageObjectExists(objectPath) {
        return world.objects.has(objectPath);
      },
      asCleanupClient: cleanupClient,
    },
  };

  return { deps, fs: fsApi, world };
}

describe('previewHttpE2eRunner gates (offline)', () => {
  it('parse argv defaults to dry-run', () => {
    assert.equal(parsePreviewHttpE2eArgv([]), 'dry-run');
    assert.equal(parsePreviewHttpE2eArgv(['--execute']), 'execute');
    assert.equal(parsePreviewHttpE2eArgv(['--inspect']), 'inspect');
  });

  it('rejects wrong preview host', () => {
    assert.throws(() => assertPreviewHttpE2eHost('https://evil.example'), Error);
    assert.doesNotThrow(() => assertPreviewHttpE2eHost(CB360_PREVIEW_E2E_HOST));
  });

  it('fail-closed on production / wrong ref', () => {
    assert.throws(
      () =>
        assertPreviewHttpE2eFailClosed(
          stagingEnv({ VERCEL_ENV: 'production' })
        ),
      Error
    );
    assert.throws(
      () =>
        assertPreviewHttpE2eFailClosed(
          stagingEnv({
            CB360_STAGING_PROJECT_REF: 'otherref00001',
            CB360_STAGING_SUPABASE_URL: 'https://otherref00001.supabase.co',
          })
        ),
      Error
    );
  });

  it('synthetic bytes are not xlsx and hash stably', () => {
    const bytes = buildSyntheticArtifactBytes('pe2e_x');
    assert.equal(bytes.includes('PK'), false);
    assert.match(bytes.toString('utf8'), /CB360-PE2E-SYNTHETIC/);
    assert.equal(sha256HexBuffer(bytes).length, 64);
  });
});

describe('previewHttpE2eRunner dry-run (offline)', () => {
  it('dry-run never touches http/staging/fs deps', async () => {
    let touched = false;
    const poison: PreviewHttpE2eDeps = {
      env: stagingEnv(),
      fs: {
        trackerDir: ':poison:',
        async listSessionIds() {
          touched = true;
          throw new Error('fs');
        },
        async readTracker() {
          touched = true;
          throw new Error('fs');
        },
        async writeTrackerAtomic() {
          touched = true;
          throw new Error('fs');
        },
      },
      http: {
        async request() {
          touched = true;
          throw new Error('http');
        },
      },
      upload: {
        async putSigned() {
          touched = true;
          throw new Error('upload');
        },
      },
      staging: {
        async snapshot() {
          touched = true;
          throw new Error('staging');
        },
        async getRun() {
          touched = true;
          return null;
        },
        async getVersion() {
          touched = true;
          return null;
        },
        async storageObjectExists() {
          touched = true;
          return false;
        },
        asCleanupClient() {
          touched = true;
          throw new Error('cleanup');
        },
      },
    };

    const result = await runPreviewHttpE2e({ mode: 'dry-run', deps: poison });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'dry-run');
    assert.equal(touched, false);
    assert.ok(result.steps.some((s) => s.status === 'planned'));
  });
});

describe('previewHttpE2eRunner execute (offline mocked)', () => {
  it('happy path publishes, verifies, cleans exact paths', async () => {
    const { deps, world, fs } = createDeps();
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, true);
    assert.equal(result.sessionId, 'pe2e_fixed_session');
    assert.ok(world.mutations.includes('complete'));
    assert.ok(world.mutations.some((m) => m.startsWith('cleanup_storage:')));
    assert.equal(world.objects.size, 0);
    assert.equal(world.runs.size, 0);
    assert.equal(world.versions.size, 0);
    assert.equal(world.snap.current, null);
    const tracker = await fs.readTracker('pe2e_fixed_session');
    assert.equal(tracker?.phase, 'cleaned');
    assert.equal(
      JSON.stringify(tracker).includes('lease_token_memory_only'),
      false
    );
  });

  it('blocks execute when incomplete prior session exists', async () => {
    const { deps, fs } = createDeps();
    await fs.writeTrackerAtomic({
      sessionId: 'pe2e_old',
      projectRefExpected: CB360_PREVIEW_E2E_STAGING_REF,
      runIds: ['run_old'],
      versionIds: [],
      objectPaths: [],
      expectedCurrentAfterPublish: null,
      phase: 'started',
      previewHost: CB360_PREVIEW_E2E_HOST,
      requestedBy: 'cb360-pe2e-pe2e_old',
      clientSha256: null,
      byteSize: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
    });
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.match(String(result.error), /incomplete/);
    assert.equal(deps ? true : true, true);
  });

  it('aborts when staging has active lease', async () => {
    const { deps } = createDeps({
      world: {
        snap: {
          ...emptySnap(),
          activeLease: true,
          lease: {
            runId: 'run_other',
            leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        lease: {
          runId: 'run_other',
          leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    // Force snapshot activeLease true via lease fields — createDeps snapshot recomputes.
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.match(String(result.error), /lease|Unexpected|refusing/i);
  });

  it('aborts when unexpected current_bundle exists', async () => {
    const { deps, world } = createDeps();
    world.snap.current = {
      sourceVersionId: 'ver_existing',
      updatedByRunId: 'run_existing',
    };
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
  });

  it('start ok + tracker write fail → stop without re-start', async () => {
    const { deps, fs, world } = createDeps();
    let writes = 0;
    const orig = fs.writeTrackerAtomic.bind(fs);
    fs.writeTrackerAtomic = async (tracker) => {
      writes += 1;
      // Allow pending_start, fail the post-start 'started' persist
      if (tracker.phase === 'started') {
        throw new Error('simulated tracker write failure after start');
      }
      return orig(tracker);
    };
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /tracker persist failed after start/);
    assert.equal(world.mutations.filter((m) => m === 'start').length, 1);
    assert.equal(world.mutations.includes('heartbeat'), false);
    assert.ok(writes >= 1);
  });

  it('unexpected HTTP 302 aborts without following redirects', async () => {
    const { deps, world } = createDeps({
      httpHandler: () => ({ status: 302, json: {} }),
    });
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.equal(world.uploadCalls, 0);
  });

  it('HTTP 401 aborts', async () => {
    const { deps } = createDeps({
      httpHandler: () => ({ status: 401, json: { code: 'unauthorized' } }),
    });
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
  });

  it('HTTP 503 aborts', async () => {
    const { deps } = createDeps({
      httpHandler: () => ({ status: 503, json: { code: 'environment_blocked' } }),
    });
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
  });

  it('cleanup abort leaves foreign current untouched and fails closed', async () => {
    const { deps, world } = createDeps();
    // After publish, flip current to foreign before cleanup client runs.
    const origCleanup = deps.staging.asCleanupClient.bind(deps.staging);
    deps.staging.asCleanupClient = () => {
      world.snap.current = {
        sourceVersionId: 'ver_FOREIGN',
        updatedByRunId: 'run_FOREIGN',
      };
      return origCleanup();
    };
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.equal(world.snap.current?.sourceVersionId, 'ver_FOREIGN');
    // Our published version/run may still exist — no broad wipe
    assert.ok(world.runs.size >= 1 || world.versions.size >= 1);
  });

  it('PreviewE2eCleanupError during cleanup → tracker cleanup_failed', async () => {
    const { deps, fs } = createDeps();
    deps.staging.asCleanupClient = () => {
      throw new PreviewE2eCleanupError(
        'storage_remove_visibility_timeout',
        { ok: false, aborted: false, steps: [] },
        'storage_remove_visibility_timeout'
      );
    };
    const result = await runPreviewHttpE2e({ mode: 'execute', deps });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /storage_remove_visibility_timeout/);
    const tracker = await fs.readTracker('pe2e_fixed_session');
    assert.equal(tracker?.phase, 'cleanup_failed');
  });

  it('inspect is read-only and reports incomplete session', async () => {
    const { deps, fs, world } = createDeps();
    await fs.writeTrackerAtomic({
      sessionId: 'pe2e_crash',
      projectRefExpected: CB360_PREVIEW_E2E_STAGING_REF,
      runIds: ['run_crash'],
      versionIds: [],
      objectPaths: ['snapshots/2026/11/18/run_crash/source.xlsx'],
      expectedCurrentAfterPublish: null,
      phase: 'uploaded',
      previewHost: CB360_PREVIEW_E2E_HOST,
      requestedBy: 'cb360-pe2e-pe2e_crash',
      clientSha256: 'a'.repeat(64),
      byteSize: 12,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
    });
    const beforeMutations = world.mutations.length;
    const result = await runPreviewHttpE2e({ mode: 'inspect', deps });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'inspect');
    assert.ok(result.steps.some((s) => s.detail.includes('pe2e_crash')));
    assert.ok(
      result.steps.some((s) => s.detail.includes('no lease release'))
    );
    assert.equal(world.mutations.length, beforeMutations);
    assert.equal(world.httpCalls.length, 0);
  });

  it('marks incomplete phases correctly for crash recovery gate', () => {
    assert.equal(isIncompleteTrackerPhase('started'), true);
    assert.equal(isIncompleteTrackerPhase('uploaded'), true);
    assert.equal(isIncompleteTrackerPhase('cleanup_failed'), true);
    assert.equal(isIncompleteTrackerPhase('cleaned'), false);
    assert.equal(isIncompleteTrackerPhase('dry_run_planned'), false);
  });
});
