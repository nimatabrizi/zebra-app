/**
 * CB360 live integration tests — staging Supabase only.
 *
 * Atomic FOR UPDATE / RPC behavior is proven here when enabled.
 * Mock tests do NOT count as Postgres proof.
 *
 * Required env (do not commit values):
 *   CB360_INTEGRATION=1
 *   CB360_TARGET_ENV=staging
 *   CB360_ALLOW_LIVE_DB=staging-only
 *   CB360_STAGING_PROJECT_REF
 *   CB360_STAGING_SUPABASE_URL
 *   CB360_STAGING_SERVICE_ROLE_KEY
 * Optional:
 *   CB360_FORBIDDEN_PROJECT_REFS
 *
 * Run (when ready — not in this agent turn):
 *   CB360_INTEGRATION=1 CB360_TARGET_ENV=staging CB360_ALLOW_LIVE_DB=staging-only \
 *   CB360_STAGING_PROJECT_REF=… CB360_STAGING_SUPABASE_URL=… \
 *   CB360_STAGING_SERVICE_ROLE_KEY=… \
 *   npm run test:cb360:integration
 *
 * Without the staging gate, the live suite SKIPS (never fake PASS).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { sha256Hex } from '../integrity';
import { CB360_BUCKET, CB360_SIGNED_UPLOAD_TTL_SECONDS } from '../paths';
import { createSupabaseRepository } from '../supabaseRepository';
import {
  completeScanRun,
  heartbeatScanRun,
  startScanRun,
  type Cb360ServiceDeps,
} from '../service';
import { Cb360Error } from '../types';
import {
  cleanupSession,
  isCb360ItestObjectPath,
} from './cleanupSession';
import {
  assertCb360StagingTarget,
  extractSupabaseProjectRef,
  isCb360StagingIntegrationRequested,
  Cb360StagingGuardError,
} from './stagingGuard';

const liveEnabled = isCb360StagingIntegrationRequested();

const SESSION = `itest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

type Tracked = {
  runIds: string[];
  versionIds: string[];
  objectPaths: string[];
  /** runId → plaintext lease token (tests only; never logged) */
  leaseTokens: Map<string, string>;
  previousCurrent: {
    bundleId: string;
    sourceVersionId: string;
    identityMapsVersionId: string | null;
    userDecisionsVersionId: string | null;
    updatedByRunId: string | null;
  } | null;
  touchedCurrent: boolean;
};

function createTracked(): Tracked {
  return {
    runIds: [],
    versionIds: [],
    objectPaths: [],
    leaseTokens: new Map(),
    previousCurrent: null,
    touchedCurrent: false,
  };
}

function trackRun(
  tracked: Tracked,
  started: { runId: string; leaseToken: string }
) {
  tracked.runIds.push(started.runId);
  tracked.leaseTokens.set(started.runId, started.leaseToken);
}

async function createStagingDeps(): Promise<{
  deps: Cb360ServiceDeps;
  client: SupabaseClient;
  projectRef: string;
}> {
  const target = assertCb360StagingTarget();
  const client = createClient(target.url, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    client,
    projectRef: target.projectRef,
    deps: {
      repo: createSupabaseRepository(client),
      storageClient: client,
    },
  };
}

async function snapshotCurrent(client: SupabaseClient, tracked: Tracked) {
  const { data } = await client
    .from('cb360_current_bundle')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (data && !tracked.previousCurrent) {
    tracked.previousCurrent = {
      bundleId: data.bundle_id,
      sourceVersionId: data.source_version_id,
      identityMapsVersionId: data.identity_maps_version_id,
      userDecisionsVersionId: data.user_decisions_version_id,
      updatedByRunId: data.updated_by_run_id,
    };
  }
}

async function forceExpireLease(
  client: SupabaseClient,
  runId: string
): Promise<void> {
  const past = new Date(Date.now() - 60_000).toISOString();
  await client
    .from('cb360_lease_lock')
    .update({ lease_expires_at: past })
    .eq('id', 1)
    .eq('run_id', runId);
  await client
    .from('cb360_scan_runs')
    .update({ lease_expires_at: past })
    .eq('id', runId);
}

async function uploadSyntheticObject(
  client: SupabaseClient,
  objectPath: string,
  bytes: Buffer,
  tracked: Tracked
): Promise<void> {
  const { error } = await client.storage
    .from(CB360_BUCKET)
    .upload(objectPath, bytes, {
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  tracked.objectPaths.push(objectPath);
}

// ---------------------------------------------------------------------------
// Always-on: staging guard unit checks (no network)
// ---------------------------------------------------------------------------
describe('CB360 cleanup path classifier (offline)', () => {
  it('accepts synthetic 2099 itest paths only', () => {
    assert.equal(
      isCb360ItestObjectPath(
        'snapshots/2099/06/15/run_aaaaaaaaaaaaaaaaaaaaaaaa/source.xlsx'
      ),
      true
    );
    assert.equal(
      isCb360ItestObjectPath('baseline/source.xlsx'),
      false
    );
    assert.equal(
      isCb360ItestObjectPath(
        'snapshots/2026/11/18/run_aaaaaaaaaaaaaaaaaaaaaaaa/source.xlsx'
      ),
      false
    );
  });
});

describe('CB360 staging guard (offline)', () => {
  it('extracts project ref from supabase URL', () => {
    assert.equal(
      extractSupabaseProjectRef('https://abcdefghijklmnop.supabase.co'),
      'abcdefghijklmnop'
    );
    assert.equal(extractSupabaseProjectRef('https://evil.example.com'), null);
  });

  it('rejects missing staging allow flags', () => {
    assert.throws(
      () =>
        assertCb360StagingTarget({
          CB360_INTEGRATION: '1',
          CB360_TARGET_ENV: 'production',
          CB360_ALLOW_LIVE_DB: 'staging-only',
          CB360_STAGING_PROJECT_REF: 'abc',
          CB360_STAGING_SUPABASE_URL: 'https://abc.supabase.co',
          CB360_STAGING_SERVICE_ROLE_KEY: 'key',
        } as NodeJS.ProcessEnv),
      (err: unknown) => err instanceof Cb360StagingGuardError
    );
  });

  it('rejects URL/ref mismatch', () => {
    assert.throws(
      () =>
        assertCb360StagingTarget({
          CB360_INTEGRATION: '1',
          CB360_TARGET_ENV: 'staging',
          CB360_ALLOW_LIVE_DB: 'staging-only',
          CB360_STAGING_PROJECT_REF: 'stagingref001',
          CB360_STAGING_SUPABASE_URL: 'https://otherref001.supabase.co',
          CB360_STAGING_SERVICE_ROLE_KEY: 'key',
        } as NodeJS.ProcessEnv),
      (err: unknown) => err instanceof Cb360StagingGuardError
    );
  });

  it('rejects forbidden project refs', () => {
    assert.throws(
      () =>
        assertCb360StagingTarget({
          CB360_INTEGRATION: '1',
          CB360_TARGET_ENV: 'staging',
          CB360_ALLOW_LIVE_DB: 'staging-only',
          CB360_STAGING_PROJECT_REF: 'prodlike00001',
          CB360_STAGING_SUPABASE_URL: 'https://prodlike00001.supabase.co',
          CB360_STAGING_SERVICE_ROLE_KEY: 'key',
          CB360_FORBIDDEN_PROJECT_REFS: 'prodlike00001,other',
        } as NodeJS.ProcessEnv),
      (err: unknown) => err instanceof Cb360StagingGuardError
    );
  });

  it('rejects refs containing prod', () => {
    assert.throws(
      () =>
        assertCb360StagingTarget({
          CB360_INTEGRATION: '1',
          CB360_TARGET_ENV: 'staging',
          CB360_ALLOW_LIVE_DB: 'staging-only',
          CB360_STAGING_PROJECT_REF: 'myprodproject1',
          CB360_STAGING_SUPABASE_URL: 'https://myprodproject1.supabase.co',
          CB360_STAGING_SERVICE_ROLE_KEY: 'key',
        } as NodeJS.ProcessEnv),
      (err: unknown) => err instanceof Cb360StagingGuardError
    );
  });

  it('accepts well-formed staging target', () => {
    const target = assertCb360StagingTarget({
      CB360_INTEGRATION: '1',
      CB360_TARGET_ENV: 'staging',
      CB360_ALLOW_LIVE_DB: 'staging-only',
      CB360_STAGING_PROJECT_REF: 'cb360staging01',
      CB360_STAGING_SUPABASE_URL: 'https://cb360staging01.supabase.co',
      CB360_STAGING_SERVICE_ROLE_KEY: 'service-role-key',
    } as NodeJS.ProcessEnv);
    assert.equal(target.projectRef, 'cb360staging01');
  });
});

describe('CB360 integration gate', () => {
  it('skips live suite unless staging gate is fully set', () => {
    if (!liveEnabled) {
      assert.ok(
        true,
        'live suite skipped — not claimed as Postgres PASS'
      );
    } else {
      // Identity check must succeed before any live test body runs
      const target = assertCb360StagingTarget();
      assert.ok(target.projectRef.length >= 8);
    }
  });
});

// ---------------------------------------------------------------------------
// Live staging suite
// ---------------------------------------------------------------------------
describe('CB360 staging live Postgres', { skip: !liveEnabled }, () => {
  const tracked = createTracked();
  let client: SupabaseClient;
  let deps: Cb360ServiceDeps;

  after(async () => {
    if (client) await cleanupSession(client, tracked, SESSION);
  });

  it('0: staging identity + schema smoke', async () => {
    const created = await createStagingDeps();
    client = created.client;
    deps = created.deps;
    assert.ok(created.projectRef);

    const { data: lock, error: lockErr } = await client
      .from('cb360_lease_lock')
      .select('id')
      .eq('id', 1)
      .maybeSingle();
    assert.equal(lockErr, null);
    assert.ok(lock);

    const { data: buckets, error: bucketErr } =
      await client.storage.listBuckets();
    assert.equal(bucketErr, null);
    assert.ok(buckets?.some((b) => b.id === CB360_BUCKET && b.public === false));
  });

  it('signed upload URL (synthetic path, upsert false)', async () => {
    const path = `snapshots/2099/01/01/${SESSION}_probe/source.xlsx`;
    const { data, error } = await client.storage
      .from(CB360_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    assert.equal(error, null);
    assert.ok(data?.signedUrl.includes('/storage/v1/object/upload/sign/'));
    assert.ok(data?.token);
    assert.equal(CB360_SIGNED_UPLOAD_TTL_SECONDS, 7200);
    tracked.objectPaths.push(path);
  });

  it('atomic concurrent start → one winner, one active_run_exists', async () => {
    await snapshotCurrent(client, tracked);
    // Ensure no stray active lease from prior crash
    await client
      .from('cb360_lease_lock')
      .update({
        run_id: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    const results = await Promise.allSettled([
      startScanRun(deps, {
        mode: 'synthetic',
        plannedBrandCount: 1,
        requestedBy: `cb360-${SESSION}-c1`,
      }),
      startScanRun(deps, {
        mode: 'synthetic',
        plannedBrandCount: 1,
        requestedBy: `cb360-${SESSION}-c2`,
      }),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);
    const winner = (ok[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof startScanRun>>
    >).value;
    trackRun(tracked, winner);

    const err = (bad[0] as PromiseRejectedResult).reason;
    assert.ok(err instanceof Cb360Error);
    assert.equal(err.code, 'active_run_exists');
    assert.equal(err.httpStatus, 409);

    const { data: lock } = await client
      .from('cb360_lease_lock')
      .select('run_id, lease_generation')
      .eq('id', 1)
      .single();
    assert.equal(lock.run_id, winner.runId);
    assert.equal(lock.lease_generation, winner.leaseGeneration);
  });

  it('heartbeat extends lease and moves started→running', async () => {
    const { data: lock } = await client
      .from('cb360_lease_lock')
      .select('run_id')
      .eq('id', 1)
      .single();
    assert.ok(lock?.run_id);
    const runId = lock.run_id as string;

    const { data: runRow } = await client
      .from('cb360_scan_runs')
      .select('id')
      .eq('id', runId)
      .single();
    // Recover lease token is impossible (only hash stored). Start a fresh run for heartbeat.
    // Release previous winner first.
    await client
      .from('cb360_lease_lock')
      .update({
        run_id: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (runRow?.id) {
      await client
        .from('cb360_scan_runs')
        .update({
          status: 'aborted',
          finished_at: new Date().toISOString(),
          error_code: 'itest_reset',
        })
        .eq('id', runRow.id)
        .in('status', ['started', 'running', 'uploading', 'verifying']);
    }

    const started = await startScanRun(deps, {
      mode: 'synthetic',
      plannedBrandCount: 1,
      requestedBy: `cb360-${SESSION}-hb`,
    });
    trackRun(tracked, started);

    const hb = await heartbeatScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
    });
    assert.equal(hb.status, 'running');
    assert.ok(new Date(hb.leaseExpiresAt).getTime() > Date.now());
  });

  it('lease expiration: heartbeat 410; new start fences old run', async () => {
    const { data: priorLock } = await client
      .from('cb360_lease_lock')
      .select('run_id')
      .eq('id', 1)
      .maybeSingle();
    if (priorLock?.run_id) {
      await forceExpireLease(client, priorLock.run_id);
      if (!tracked.runIds.includes(priorLock.run_id)) {
        tracked.runIds.push(priorLock.run_id);
      }
    }

    const started = await startScanRun(deps, {
      mode: 'synthetic',
      plannedBrandCount: 1,
      requestedBy: `cb360-${SESSION}-exp`,
    });
    trackRun(tracked, started);

    await forceExpireLease(client, started.runId);

    await assert.rejects(
      () =>
        heartbeatScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        err.code === 'lease_expired' &&
        err.httpStatus === 410
    );

    const next = await startScanRun(deps, {
      mode: 'synthetic',
      plannedBrandCount: 1,
      requestedBy: `cb360-${SESSION}-exp2`,
    });
    trackRun(tracked, next);
    assert.notEqual(next.runId, started.runId);
    assert.ok(next.leaseGeneration > started.leaseGeneration);

    const { data: old } = await client
      .from('cb360_scan_runs')
      .select('status')
      .eq('id', started.runId)
      .single();
    assert.equal(old?.status, 'aborted_lease');

    // Old token must not heartbeat against new owner
    await assert.rejects(
      () =>
        heartbeatScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        (err.code === 'forbidden_lease' ||
          err.code === 'already_terminal' ||
          err.code === 'lease_expired')
    );
  });

  it('PARTIAL complete does not publish / does not change current', async () => {
    await snapshotCurrent(client, tracked);
    const { data: before } = await client
      .from('cb360_current_bundle')
      .select('source_version_id')
      .eq('id', 1)
      .maybeSingle();

    // Free lease
    const { data: lock } = await client
      .from('cb360_lease_lock')
      .select('run_id')
      .eq('id', 1)
      .maybeSingle();
    if (lock?.run_id) await forceExpireLease(client, lock.run_id);

    const started = await startScanRun(deps, {
      mode: 'synthetic',
      plannedBrandCount: 2,
      requestedBy: `cb360-${SESSION}-partial`,
    });
    trackRun(tracked, started);

    const bytes = Buffer.from(`synthetic-partial-${SESSION}`);
    const objectPath = `snapshots/2099/06/15/${started.runId}/source.xlsx`;
    await uploadSyntheticObject(client, objectPath, bytes, tracked);

    const result = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath,
      brandResults: [
        { brandId: 'brand_a', outcome: 'ok' },
        { brandId: 'brand_b', outcome: 'failed', reasonCode: 'nav_error' },
      ],
      plannedBrandCount: 2,
    });
    assert.equal(result.published, false);
    assert.equal(result.becameCurrent, false);
    assert.equal(result.status, 'partial');

    const { data: after } = await client
      .from('cb360_current_bundle')
      .select('source_version_id')
      .eq('id', 1)
      .maybeSingle();
    assert.equal(after?.source_version_id ?? null, before?.source_version_id ?? null);
  });

  it('successful publish + idempotent complete replay (no second version)', async () => {
    await snapshotCurrent(client, tracked);
    const { data: lock } = await client
      .from('cb360_lease_lock')
      .select('run_id')
      .eq('id', 1)
      .maybeSingle();
    if (lock?.run_id) await forceExpireLease(client, lock.run_id);

    const started = await startScanRun(deps, {
      mode: 'synthetic',
      plannedBrandCount: 1,
      requestedBy: `cb360-${SESSION}-pub`,
    });
    trackRun(tracked, started);

    const bytes = Buffer.from(`synthetic-ok-${SESSION}`);
    const objectPath = `snapshots/2099/06/15/${started.runId}/source.xlsx`;
    await uploadSyntheticObject(client, objectPath, bytes, tracked);

    const first = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath,
      brandResults: [{ brandId: 'brand_a', outcome: 'ok' }],
      plannedBrandCount: 1,
    });
    assert.equal(first.published, true);
    assert.equal(first.becameCurrent, true);
    assert.ok(first.outputVersionId);
    tracked.versionIds.push(first.outputVersionId!);
    tracked.touchedCurrent = true;

    const { count: versionCountBefore } = await client
      .from('cb360_source_versions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by_run_id', started.runId);

    const second = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath,
      brandResults: [{ brandId: 'brand_a', outcome: 'ok' }],
      plannedBrandCount: 1,
    });
    assert.equal(second.idempotent, true);
    assert.equal(second.outputVersionId, first.outputVersionId);

    const { count: versionCountAfter } = await client
      .from('cb360_source_versions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by_run_id', started.runId);
    assert.equal(versionCountAfter, versionCountBefore);

    const { data: current } = await client
      .from('cb360_current_bundle')
      .select('source_version_id, updated_by_run_id')
      .eq('id', 1)
      .single();
    assert.equal(current.source_version_id, first.outputVersionId);
    assert.equal(current.updated_by_run_id, started.runId);

    // Different payload with valid ownership token → rejected (no second publish)
    await assert.rejects(
      () =>
        completeScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
          clientSha256: sha256Hex(bytes),
          objectPath,
          brandResults: [{ brandId: 'other_brand', outcome: 'ok' }],
          plannedBrandCount: 1,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        (err.code === 'idempotent_replay' || err.code === 'already_terminal')
    );
  });

  it('hash mismatch rejects and does not publish', async () => {
    const { data: lock } = await client
      .from('cb360_lease_lock')
      .select('run_id')
      .eq('id', 1)
      .maybeSingle();
    if (lock?.run_id) await forceExpireLease(client, lock.run_id);

    const started = await startScanRun(deps, {
      mode: 'synthetic',
      plannedBrandCount: 1,
      requestedBy: `cb360-${SESSION}-hash`,
    });
    trackRun(tracked, started);

    const bytes = Buffer.from(`synthetic-hash-${SESSION}`);
    const objectPath = `snapshots/2099/06/15/${started.runId}/source.xlsx`;
    await uploadSyntheticObject(client, objectPath, bytes, tracked);

    await assert.rejects(
      () =>
        completeScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
          clientSha256: sha256Hex('wrong-bytes'),
          objectPath,
          brandResults: [{ brandId: 'brand_a', outcome: 'ok' }],
          plannedBrandCount: 1,
        }),
      (err: unknown) =>
        err instanceof Cb360Error && err.code === 'hash_mismatch'
    );

    const { data: run } = await client
      .from('cb360_scan_runs')
      .select('status, became_current, published')
      .eq('id', started.runId)
      .single();
    assert.equal(run?.status, 'rejected_integrity');
    assert.equal(run?.became_current, false);
    assert.equal(run?.published, false);
  });
});
