/**
 * Offline unit tests for previewE2eCleanup — no network.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import {
  assertPreviewE2eCleanupEnvironment,
  assertPreviewE2eTrackerHasNoSecrets,
  cleanupPreviewE2eSession,
  classifyVisibilityChannels,
  PreviewE2eCleanupError,
  PreviewE2eCleanupGateError,
  storageRemoveEntryMatchesPath,
  type PreviewE2eCleanupOptions,
  type PreviewE2eDbClient,
  type PreviewE2eSessionTracker,
} from './previewE2eCleanup';

/** Fast offline visibility polls (no real waiting). Enough ticks for lag tests. */
const FAST_VISIBILITY: PreviewE2eCleanupOptions = {
  sleep: async () => {},
  visibilityRecheckElapsedMs: [0, 0, 0, 0, 0, 0],
};

const STAGING_REF = 'noagxyztimvefmewjybj';

function objectFolder(objectPath: string): string {
  const i = objectPath.lastIndexOf('/');
  return i >= 0 ? objectPath.slice(0, i) : '';
}

function stagingEnv(
  partial: Record<string, string | undefined> = {}
): Cb360EnvBag {
  return {
    CB360_STAGING_PROJECT_REF: STAGING_REF,
    CB360_STAGING_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    ...partial,
  };
}

function baseTracker(
  overrides: Partial<PreviewE2eSessionTracker> = {}
): PreviewE2eSessionTracker {
  return {
    sessionId: 'pe2e_test_session',
    projectRefExpected: STAGING_REF,
    runIds: ['run_aaa'],
    versionIds: ['ver_aaa'],
    objectPaths: ['snapshots/2026/11/18/run_aaa/source.xlsx'],
    expectedCurrentAfterPublish: {
      sourceVersionId: 'ver_aaa',
      updatedByRunId: 'run_aaa',
    },
    ...overrides,
  };
}

type FakeState = {
  lease: { id: number; run_id: string | null };
  current: {
    id: number;
    source_version_id: string;
    updated_by_run_id: string | null;
  } | null;
  runs: Array<{
    id: string;
    base_version_id: string | null;
    output_version_id: string | null;
  }>;
  versions: Array<{ id: string }>;
  storagePaths: string[];
  mutations: string[];
  /** Fail storage remove once, then succeed */
  failStorageOnce?: boolean;
  /** Fail run delete once, then succeed */
  failDeleteRunsOnce?: boolean;
  /**
   * Storage remove behavior override:
   * - default: delete all requested paths and return matching data rows
   * - empty-data-keep: error null, data [], keep objects
   * - empty-data-delete: error null, data [], delete objects
   * - data-keep: return data rows but keep objects
   * - partial: delete/confirm only the first requested path
   */
  storageRemoveMode?:
    | 'default'
    | 'empty-data-keep'
    | 'empty-data-delete'
    | 'data-keep'
    | 'partial'
    | 'mismatch';
  /**
   * After remove(), force download to report exists for N checks
   * (even if path was deleted from storagePaths). Used for visibility lag /
   * visibility_pending tests (list follows storagePaths).
   */
  postRemoveForceExistsChecks?: number;
  /** After remove(), force list to report exists for N checks. */
  postRemoveForceListExistsChecks?: number;
  removeCallCount?: number;
};

function createFakeClient(state: FakeState): PreviewE2eDbClient {
  type Filter = { type: 'eq' | 'in'; column: string; value: unknown };

  function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
    for (const f of filters) {
      if (f.type === 'eq') {
        if (row[f.column] !== f.value) return false;
      } else {
        const vals = f.value as unknown[];
        if (!vals.includes(row[f.column])) return false;
      }
    }
    return true;
  }

  function builder(table: string) {
    let mode: 'select' | 'update' | 'delete' = 'select';
    let patch: Record<string, unknown> = {};
    let columns = '*';
    const filters: Filter[] = [];
    let wantMaybeSingle = false;

    const api = {
      select(cols?: string) {
        columns = cols ?? '*';
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
        wantMaybeSingle = true;
        return execute().then((r) => ({
          data:
            Array.isArray(r.data) && r.data.length
              ? (r.data[0] as Record<string, unknown>)
              : null,
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

    async function execute(): Promise<{
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    }> {
      if (table === 'cb360_lease_lock') {
        const row = {
          id: state.lease.id,
          run_id: state.lease.run_id,
        } as Record<string, unknown>;
        if (mode === 'update') {
          if (matches(row, filters)) {
            state.mutations.push('lease_update');
            if ('run_id' in patch) {
              state.lease.run_id = (patch.run_id as string | null) ?? null;
            }
            return {
              data: [{ id: 1, run_id: state.lease.run_id }],
              error: null,
            };
          }
          return { data: [], error: null };
        }
        if (mode === 'select') {
          return matches(row, filters) ? { data: [row], error: null } : { data: [], error: null };
        }
      }

      if (table === 'cb360_current_bundle') {
        if (mode === 'delete') {
          if (!state.current) return { data: [], error: null };
          const row = {
            id: state.current.id,
            source_version_id: state.current.source_version_id,
            updated_by_run_id: state.current.updated_by_run_id,
          } as Record<string, unknown>;
          if (!matches(row, filters)) return { data: [], error: null };
          state.mutations.push('current_delete');
          const deleted = { ...row };
          state.current = null;
          return { data: [deleted], error: null };
        }
        if (mode === 'select') {
          if (!state.current) return { data: [], error: null };
          const row = {
            id: state.current.id,
            source_version_id: state.current.source_version_id,
            updated_by_run_id: state.current.updated_by_run_id,
          } as Record<string, unknown>;
          return matches(row, filters)
            ? { data: [row], error: null }
            : { data: [], error: null };
        }
      }

      if (table === 'cb360_scan_runs') {
        if (mode === 'select') {
          const rows = state.runs
            .map((r) => ({ ...r }) as Record<string, unknown>)
            .filter((r) => matches(r, filters));
          return { data: rows, error: null };
        }
        if (mode === 'delete') {
          if (state.failDeleteRunsOnce) {
            state.failDeleteRunsOnce = false;
            state.mutations.push('runs_delete_failed');
            return { data: null, error: { message: 'simulated runs delete failure' } };
          }
          const before = state.runs.length;
          const removed: Record<string, unknown>[] = [];
          state.runs = state.runs.filter((r) => {
            const row = { ...r } as Record<string, unknown>;
            if (matches(row, filters)) {
              removed.push({ id: r.id });
              return false;
            }
            return true;
          });
          if (removed.length || before !== state.runs.length) {
            state.mutations.push(`runs_delete:${removed.length}`);
          }
          return { data: removed, error: null };
        }
      }

      if (table === 'cb360_source_versions') {
        if (mode === 'delete') {
          const removed: Record<string, unknown>[] = [];
          state.versions = state.versions.filter((v) => {
            const row = { id: v.id } as Record<string, unknown>;
            if (matches(row, filters)) {
              removed.push({ id: v.id });
              return false;
            }
            return true;
          });
          if (removed.length) state.mutations.push(`versions_delete:${removed.length}`);
          return { data: removed, error: null };
        }
        if (mode === 'select') {
          const rows = state.versions
            .map((v) => ({ id: v.id }) as Record<string, unknown>)
            .filter((r) => matches(r, filters));
          return { data: rows, error: null };
        }
      }

      void columns;
      void wantMaybeSingle;
      return { data: null, error: { message: `unsupported table ${table}` } };
    }

    return api;
  }

  return {
    from(table: string) {
      return builder(table) as unknown as ReturnType<PreviewE2eDbClient['from']>;
    },
    storage: {
      from(bucket: string) {
        return {
          async download(objectPath: string) {
            if (bucket !== CB360_BUCKET) {
              return { data: null, error: { message: 'wrong bucket' } };
            }
            if (
              typeof state.postRemoveForceExistsChecks === 'number' &&
              state.postRemoveForceExistsChecks > 0 &&
              (state.removeCallCount ?? 0) > 0
            ) {
              state.postRemoveForceExistsChecks -= 1;
              return { data: Buffer.from('x'), error: null };
            }
            if (state.storagePaths.includes(objectPath)) {
              return { data: Buffer.from('x'), error: null };
            }
            return {
              data: null,
              error: { message: 'Object not found' },
            };
          },
          async list(folderPath: string) {
            if (bucket !== CB360_BUCKET) {
              return { data: null, error: { message: 'wrong bucket' } };
            }
            if (
              typeof state.postRemoveForceListExistsChecks === 'number' &&
              state.postRemoveForceListExistsChecks > 0 &&
              (state.removeCallCount ?? 0) > 0
            ) {
              state.postRemoveForceListExistsChecks -= 1;
              const match = state.storagePaths.find(
                (p) => objectFolder(p) === folderPath
              );
              const name = match
                ? match.slice(match.lastIndexOf('/') + 1)
                : folderPath.startsWith('pe2e_probe/')
                  ? 'probe.bin'
                  : 'source.xlsx';
              return { data: [{ name }], error: null };
            }
            const entries = state.storagePaths
              .filter((p) => objectFolder(p) === folderPath)
              .map((p) => ({ name: p.slice(p.lastIndexOf('/') + 1) }));
            return { data: entries, error: null };
          },
          async remove(paths: string[]) {
            if (bucket !== CB360_BUCKET) {
              return { data: null, error: { message: 'wrong bucket' } };
            }
            if (state.failStorageOnce) {
              state.failStorageOnce = false;
              state.mutations.push('storage_remove_failed');
              return {
                data: null,
                error: { message: 'simulated storage failure' },
              };
            }
            const mode = state.storageRemoveMode ?? 'default';
            state.removeCallCount = (state.removeCallCount ?? 0) + 1;
            state.mutations.push(`storage_remove:${paths.join(',')}`);

            if (mode === 'empty-data-keep') {
              return { data: [], error: null };
            }
            if (mode === 'empty-data-delete') {
              state.storagePaths = state.storagePaths.filter(
                (p) => !paths.includes(p)
              );
              return { data: [], error: null };
            }
            if (mode === 'data-keep') {
              return {
                data: paths.map((p) => ({ name: p })),
                error: null,
              };
            }
            if (mode === 'partial') {
              const first = paths[0];
              if (first) {
                state.storagePaths = state.storagePaths.filter((p) => p !== first);
              }
              return {
                data: first ? [{ name: first }] : [],
                error: null,
              };
            }
            if (mode === 'mismatch') {
              state.storagePaths = state.storagePaths.filter(
                (p) => !paths.includes(p)
              );
              return {
                data: [{ name: 'totally-other.xlsx' }],
                error: null,
              };
            }

            state.storagePaths = state.storagePaths.filter(
              (p) => !paths.includes(p)
            );
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

function mutationClient(): {
  client: PreviewE2eDbClient;
  mutations: string[];
} {
  const mutations: string[] = [];
  return {
    mutations,
    client: {
      from() {
        mutations.push('from');
        throw new Error('client must not be used after gate failure');
      },
      storage: {
        from() {
          mutations.push('storage');
          throw new Error('storage must not be used after gate failure');
        },
      },
    },
  };
}

describe('storageRemoveEntryMatchesPath', () => {
  it('matches full path and basename FileObject.name forms', () => {
    const tracked = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    assert.equal(
      storageRemoveEntryMatchesPath({ name: tracked }, tracked),
      true
    );
    assert.equal(
      storageRemoveEntryMatchesPath({ name: 'source.xlsx' }, tracked),
      true
    );
    assert.equal(
      storageRemoveEntryMatchesPath({ name: 'other.xlsx' }, tracked),
      false
    );
  });
});

describe('assertPreviewE2eCleanupEnvironment', () => {
  it('rejects wrong project ref with zero intention to mutate', () => {
    assert.throws(
      () =>
        assertPreviewE2eCleanupEnvironment(
          stagingEnv({ CB360_STAGING_PROJECT_REF: 'otherref00001' }),
          STAGING_REF
        ),
      (err: unknown) => err instanceof PreviewE2eCleanupGateError
    );
  });

  it('blocks VERCEL_ENV=production', () => {
    assert.throws(
      () =>
        assertPreviewE2eCleanupEnvironment(
          stagingEnv({ VERCEL_ENV: 'production' }),
          STAGING_REF
        ),
      (err: unknown) => err instanceof PreviewE2eCleanupGateError
    );
  });

  it('accepts matching staging ref', () => {
    const r = assertPreviewE2eCleanupEnvironment(stagingEnv(), STAGING_REF);
    assert.equal(r.projectRef, STAGING_REF);
  });
});

describe('assertPreviewE2eTrackerHasNoSecrets', () => {
  it('rejects secret-like keys in tracker JSON', () => {
    const bad = {
      ...baseTracker(),
      leaseToken: 'should-not-be-here',
    } as PreviewE2eSessionTracker & { leaseToken: string };
    assert.throws(
      () => assertPreviewE2eTrackerHasNoSecrets(bad),
      (err: unknown) => err instanceof PreviewE2eCleanupGateError
    );
  });
});

describe('cleanupPreviewE2eSession (offline)', () => {
  it('wrong project ref → zero mutations', async () => {
    const { client, mutations } = mutationClient();
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          client,
          baseTracker(),
          stagingEnv({
            CB360_STAGING_PROJECT_REF: 'wrongref000001',
            CB360_STAGING_SUPABASE_URL: 'https://wrongref000001.supabase.co',
          })
        ),
      (err: unknown) => err instanceof PreviewE2eCleanupGateError
    );
    assert.deepEqual(mutations, []);
  });

  it('current mismatch → abort; runs/versions/storage untouched', async () => {
    const state: FakeState = {
      lease: { id: 1, run_id: null },
      current: {
        id: 1,
        source_version_id: 'ver_OTHER',
        updated_by_run_id: 'run_OTHER',
      },
      runs: [
        { id: 'run_aaa', base_version_id: null, output_version_id: 'ver_aaa' },
      ],
      versions: [{ id: 'ver_aaa' }],
      storagePaths: ['snapshots/2026/11/18/run_aaa/source.xlsx'],
      mutations: [],
    };
    const client = createFakeClient(state);
    const result = await cleanupPreviewE2eSession(
      client,
      baseTracker(),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.ok(result.steps.some((s) => s.step === 'current_bundle' && s.status === 'aborted'));
    assert.equal(state.current?.source_version_id, 'ver_OTHER');
    assert.equal(state.runs.length, 1);
    assert.equal(state.versions.length, 1);
    assert.equal(state.storagePaths.length, 1);
    assert.ok(!state.mutations.some((m) => m.startsWith('runs_delete')));
    assert.ok(!state.mutations.some((m) => m.startsWith('versions_delete')));
    assert.ok(!state.mutations.some((m) => m.startsWith('storage_remove')));
  });

  it('current match → only matching current row deleted, then tracked cleanup', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state: FakeState = {
      lease: { id: 1, run_id: 'run_aaa' },
      current: {
        id: 1,
        source_version_id: 'ver_aaa',
        updated_by_run_id: 'run_aaa',
      },
      runs: [
        { id: 'run_aaa', base_version_id: null, output_version_id: 'ver_aaa' },
        {
          id: 'run_keep',
          base_version_id: null,
          output_version_id: 'ver_keep',
        },
      ],
      versions: [{ id: 'ver_aaa' }, { id: 'ver_keep' }],
      storagePaths: [path, 'snapshots/2026/11/18/run_keep/source.xlsx'],
      mutations: [],
    };
    const result = await cleanupPreviewE2eSession(
      createFakeClient(state),
      baseTracker({ objectPaths: [path] }),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, true);
    assert.equal(result.aborted, false);
    assert.equal(state.current, null);
    assert.deepEqual(
      state.runs.map((r) => r.id),
      ['run_keep']
    );
    assert.deepEqual(
      state.versions.map((v) => v.id),
      ['ver_keep']
    );
    assert.deepEqual(state.storagePaths, [
      'snapshots/2026/11/18/run_keep/source.xlsx',
    ]);
    assert.ok(state.mutations.includes('current_delete'));
    assert.ok(
      state.mutations.some((m) => m === `storage_remove:${path}`)
    );
  });

  it('foreign run references tracked version → abort before version/storage delete', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state: FakeState = {
      lease: { id: 1, run_id: null },
      current: null, // already cleared / never claimed
      runs: [
        { id: 'run_aaa', base_version_id: null, output_version_id: 'ver_aaa' },
        {
          id: 'run_foreign',
          base_version_id: 'ver_aaa',
          output_version_id: null,
        },
      ],
      versions: [{ id: 'ver_aaa' }],
      storagePaths: [path],
      mutations: [],
    };
    const result = await cleanupPreviewE2eSession(
      createFakeClient(state),
      baseTracker({
        expectedCurrentAfterPublish: null,
        objectPaths: [path],
      }),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.ok(
      result.steps.some(
        (s) => s.step === 'foreign_ref_check' && s.status === 'aborted'
      )
    );
    // Runs not deleted yet either — abort before destructive deletes after foreign check.
    // Actually looking at our order: foreign check is BEFORE run delete. Good.
    assert.equal(state.runs.length, 2);
    assert.equal(state.versions.length, 1);
    assert.equal(state.storagePaths.length, 1);
  });

  it('storage removes only exact tracked paths', async () => {
    const tracked = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const other = 'snapshots/2099/01/01/run_bbbbbbbbbbbbbbbbbbbbbbbb/source.xlsx';
    const state: FakeState = {
      lease: { id: 1, run_id: null },
      current: null,
      runs: [],
      versions: [],
      storagePaths: [tracked, other],
      mutations: [],
    };
    const result = await cleanupPreviewE2eSession(
      createFakeClient(state),
      baseTracker({
        runIds: [],
        versionIds: [],
        objectPaths: [tracked],
        expectedCurrentAfterPublish: null,
      }),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, true);
    assert.deepEqual(state.storagePaths, [other]);
    assert.equal(
      state.mutations.filter((m) => m.startsWith('storage_remove')).length,
      1
    );
    assert.ok(!state.mutations.some((m) => m.includes(other)));
  });

  it('second cleanup is safe no-op', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state: FakeState = {
      lease: { id: 1, run_id: 'run_aaa' },
      current: {
        id: 1,
        source_version_id: 'ver_aaa',
        updated_by_run_id: 'run_aaa',
      },
      runs: [
        { id: 'run_aaa', base_version_id: null, output_version_id: 'ver_aaa' },
      ],
      versions: [{ id: 'ver_aaa' }],
      storagePaths: [path],
      mutations: [],
    };
    const client = createFakeClient(state);
    const tracker = baseTracker({ objectPaths: [path] });
    const first = await cleanupPreviewE2eSession(client, tracker, stagingEnv(),
      FAST_VISIBILITY);
    assert.equal(first.ok, true);
    state.mutations = [];
    const second = await cleanupPreviewE2eSession(client, tracker, stagingEnv(),
      FAST_VISIBILITY);
    assert.equal(second.ok, true);
    assert.equal(second.aborted, false);
    assert.ok(
      second.steps.some(
        (s) =>
          s.step === 'current_bundle' &&
          (s.status === 'skipped' || s.status === 'ok')
      )
    );
    assert.equal(state.current, null);
    assert.equal(state.runs.length, 0);
    assert.equal(state.versions.length, 0);
    assert.ok(!state.mutations.includes('current_delete'));
  });

  it('partial failure then retry completes remaining work', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state: FakeState = {
      lease: { id: 1, run_id: null },
      current: {
        id: 1,
        source_version_id: 'ver_aaa',
        updated_by_run_id: 'run_aaa',
      },
      runs: [
        { id: 'run_aaa', base_version_id: null, output_version_id: 'ver_aaa' },
      ],
      versions: [{ id: 'ver_aaa' }],
      storagePaths: [path],
      mutations: [],
      failDeleteRunsOnce: true,
    };
    const client = createFakeClient(state);
    const tracker = baseTracker({ objectPaths: [path] });

    await assert.rejects(
      () => cleanupPreviewE2eSession(client, tracker, stagingEnv(),
      FAST_VISIBILITY),
      (err: unknown) => err instanceof PreviewE2eCleanupError
    );
    // Current already deleted on first attempt; runs/versions/storage remain
    assert.equal(state.current, null);
    assert.equal(state.runs.length, 1);
    assert.equal(state.versions.length, 1);
    assert.equal(state.storagePaths.length, 1);

    const retry = await cleanupPreviewE2eSession(client, tracker, stagingEnv(),
      FAST_VISIBILITY);
    assert.equal(retry.ok, true);
    assert.ok(
      retry.steps.some(
        (s) =>
          s.step === 'current_bundle' && s.status === 'skipped'
      )
    );
    assert.equal(state.runs.length, 0);
    assert.equal(state.versions.length, 0);
    assert.equal(state.storagePaths.length, 0);
  });
});

describe('cleanupPreviewE2eSession storage verification (offline)', () => {
  function storageOnlyState(
    paths: string[],
    mode?: FakeState['storageRemoveMode']
  ): FakeState {
    return {
      lease: { id: 1, run_id: null },
      current: null,
      runs: [],
      versions: [],
      storagePaths: [...paths],
      mutations: [],
      storageRemoveMode: mode,
    };
  }

  function storageTracker(paths: string[]): PreviewE2eSessionTracker {
    return baseTracker({
      runIds: [],
      versionIds: [],
      expectedCurrentAfterPublish: null,
      objectPaths: paths,
    });
  }

  it('error:null + data:[] + object still present → FAIL', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'empty-data-keep');
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
      FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        err.code === 'storage_remove_visibility_timeout'
    );
    assert.deepEqual(state.storagePaths, [path]);
    assert.equal(state.removeCallCount, 1);
  });

  it('error:null + data:[] + object absent → idempotent success', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([], 'empty-data-delete');
    const result = await cleanupPreviewE2eSession(
      createFakeClient(state),
      storageTracker([path]),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, true);
    assert.ok(
      result.steps.some(
        (s) =>
          s.step === 'storage_remove' &&
          s.status === 'ok' &&
          /idempotent|absent/.test(s.detail)
      )
    );
  });

  it('data rows present but object still downloadable → FAIL', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'data-keep');
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
          FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        err.code === 'storage_remove_visibility_timeout'
    );
    assert.deepEqual(state.storagePaths, [path]);
    assert.equal(state.removeCallCount, 1);
  });

  it('data matches tracked path and object gone → PASS', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'default');
    const result = await cleanupPreviewE2eSession(
      createFakeClient(state),
      storageTracker([path]),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, true);
    assert.deepEqual(state.storagePaths, []);
    assert.ok(
      result.steps.some(
        (s) =>
          s.step === 'storage_remove' &&
          s.status === 'ok' &&
          /removed_confirmed/.test(s.detail)
      )
    );
  });

  it('storage API error → FAIL', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path]);
    state.failStorageOnce = true;
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
      FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        err.code === 'storage_remove_api_error'
    );
  });

  it('delayed download disappearance (list already absent) → PASS', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'default');
    // Remove clears list; download lags for 2 polls → visibility_pending then absent.
    state.postRemoveForceExistsChecks = 2;
    const result = await cleanupPreviewE2eSession(
      createFakeClient(state),
      storageTracker([path]),
      stagingEnv(),
      FAST_VISIBILITY
    );
    assert.equal(result.ok, true);
    assert.equal(state.removeCallCount, 1);
    assert.equal(
      state.mutations.filter((m) => m.startsWith('storage_remove:')).length,
      1
    );
    assert.ok(
      result.steps.some(
        (s) =>
          s.step === 'storage_visibility' &&
          /classification=visibility_pending/.test(s.detail)
      )
    );
    assert.ok(
      result.steps.some(
        (s) =>
          s.step === 'storage_visibility' &&
          /classification=absent/.test(s.detail)
      )
    );
  });

  it('list/download divergence timeout → visibility_pending code', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'default');
    state.postRemoveForceExistsChecks = 100; // download never clears within budget
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
          FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        err.code === 'storage_remove_visibility_pending'
    );
    assert.equal(state.removeCallCount, 1);
  });

  it('90s elapsed schedule honored (offline, no real wait)', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'empty-data-keep');
    const elapsed: number[] = [];
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
          {
            sleep: async () => {},
            visibilityRecheckElapsedMs: [0, 30000, 60000, 90000],
          }
        ),
      (err: unknown) => {
        if (!(err instanceof PreviewE2eCleanupError)) return false;
        for (const s of err.result.steps) {
          if (s.step === 'storage_visibility') {
            const m = /elapsedMs=(\d+)/.exec(s.detail);
            if (m) elapsed.push(Number(m[1]));
          }
        }
        return (
          err.code === 'storage_remove_visibility_timeout' &&
          elapsed.includes(0) &&
          elapsed.includes(90000)
        );
      }
    );
    assert.equal(state.removeCallCount, 1);
  });

  it('visibility timeout after single remove → FAIL with classified code', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'empty-data-keep');
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
          FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        err.code === 'storage_remove_visibility_timeout'
    );
    assert.equal(state.removeCallCount, 1);
  });

  it('response mismatch unmatched data entry → FAIL', async () => {
    const path = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const state = storageOnlyState([path], 'mismatch');
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([path]),
          stagingEnv(),
          FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        err.code === 'storage_remove_response_mismatch'
    );
    assert.equal(state.removeCallCount, 1);
  });

  it('multiple exact paths with partial delete → FAIL', async () => {
    const a = 'snapshots/2026/11/18/run_aaa/source.xlsx';
    const b = 'snapshots/2026/11/18/run_bbb/source.xlsx';
    const state = storageOnlyState([a, b], 'partial');
    await assert.rejects(
      () =>
        cleanupPreviewE2eSession(
          createFakeClient(state),
          storageTracker([a, b]),
          stagingEnv(),
          FAST_VISIBILITY
        ),
      (err: unknown) =>
        err instanceof PreviewE2eCleanupError &&
        (err.code === 'storage_remove_visibility_timeout' ||
          err.code === 'storage_remove_visibility_pending')
    );
    assert.equal(state.storagePaths.includes(b), true);
    assert.equal(state.storagePaths.includes(a), false);
    assert.equal(state.removeCallCount, 1);
  });

  it('classifyVisibilityChannels maps pending vs absent', () => {
    assert.equal(classifyVisibilityChannels(false, false), 'absent');
    assert.equal(
      classifyVisibilityChannels(false, true),
      'visibility_pending'
    );
    assert.equal(classifyVisibilityChannels(true, true), 'visible');
    assert.equal(classifyVisibilityChannels(true, false), 'visible');
  });
});

