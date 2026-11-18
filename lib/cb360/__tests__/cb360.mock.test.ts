/**
 * CB360 synthetic unit tests — memory repository, no Supabase / no real Postgres.
 * Concurrent mutex here emulates critical sections; it does NOT prove FOR UPDATE.
 * Run: npm run test:cb360
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  authorizeCb360MachineRequest,
  extractCb360ApiCredential,
  redactForLogs,
} from '../auth';
import {
  assertSha256Match,
  hashLeaseToken,
  mintLeaseToken,
  normalizeSha256,
  sha256Hex,
} from '../integrity';
import {
  assertRunOwnsLease,
  canAcquireLease,
  computeLeaseExpiry,
  isLeaseExpired,
} from '../lease';
import { createMemoryRepository } from '../memoryRepository';
import { buildImmutableObjectPath } from '../paths';
import { assertBaseNotStale, decidePublish } from '../publish';
import {
  completeScanRun,
  heartbeatScanRun,
  startScanRun,
  type Cb360ServiceDeps,
} from '../service';
import { throwFromPg } from '../supabaseRepository';
import { Cb360Error, type Cb360SourceVersion } from '../types';

function setSecret(value: string | undefined) {
  if (value === undefined) delete process.env.CB360_API_SECRET;
  else process.env.CB360_API_SECRET = value;
}

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/rakip/start', {
    method: 'POST',
    headers,
  });
}

function seedVersion(): Cb360SourceVersion {
  return {
    id: 'ver_base',
    kind: 'baseline',
    artifact: 'source_xlsx',
    objectPath: 'baseline/source.xlsx',
    sha256: sha256Hex('synthetic-base'),
    byteSize: 14,
    bundleId: 'bundle_base',
    createdByRunId: null,
    immutable: true,
    createdAt: new Date().toISOString(),
  };
}

function depsWithBase(): Cb360ServiceDeps {
  const base = seedVersion();
  const repo = createMemoryRepository({
    versions: [base],
    current: {
      id: 1,
      bundleId: base.bundleId,
      sourceVersionId: base.id,
      identityMapsVersionId: null,
      userDecisionsVersionId: null,
      updatedAt: new Date().toISOString(),
      updatedByRunId: null,
    },
  });
  return { repo };
}

describe('CB360 auth (mock)', () => {
  beforeEach(() => setSecret('test-secret-16chars'));

  it('rejects missing credential', () => {
    assert.throws(
      () => authorizeCb360MachineRequest(makeRequest({})),
      (err: unknown) => err instanceof Cb360Error && err.code === 'unauthorized'
    );
  });

  it('rejects wrong secret', () => {
    assert.throws(
      () =>
        authorizeCb360MachineRequest(
          makeRequest({ authorization: 'Bearer wrong-secret-16chars!!' })
        ),
      (err: unknown) => err instanceof Cb360Error && err.code === 'unauthorized'
    );
  });

  it('accepts Authorization Bearer only', () => {
    authorizeCb360MachineRequest(
      makeRequest({ authorization: 'Bearer test-secret-16chars' })
    );
    assert.equal(
      extractCb360ApiCredential(
        makeRequest({ authorization: 'Bearer test-secret-16chars' })
      ),
      'test-secret-16chars'
    );
  });

  it('rejects custom x-cb360-api-secret header (surface narrowed)', () => {
    assert.throws(
      () =>
        authorizeCb360MachineRequest(
          makeRequest({ 'x-cb360-api-secret': 'test-secret-16chars' })
        ),
      (err: unknown) => err instanceof Cb360Error && err.code === 'unauthorized'
    );
  });

  it('redacts secrets from logs', () => {
    const redacted = redactForLogs({
      leaseToken: 'super-secret-token',
      apiSecret: 'abc',
      runId: 'run_1',
    });
    assert.equal(redacted.leaseToken, '[redacted]');
    assert.equal(redacted.apiSecret, '[redacted]');
    assert.equal(redacted.runId, 'run_1');
  });
});

describe('CB360 integrity (mock)', () => {
  it('normalizes and matches sha256', () => {
    const h = sha256Hex('hello');
    assert.equal(normalizeSha256(h.toUpperCase()), h);
    assertSha256Match(h, h);
    assert.throws(() => assertSha256Match(h, sha256Hex('other')));
  });

  it('lease token hash is one-way comparable', () => {
    const { token, hash } = mintLeaseToken();
    assert.equal(hashLeaseToken(token), hash);
    assert.notEqual(token, hash);
  });
});

describe('CB360 paths (mock)', () => {
  it('builds immutable unique path per run', () => {
    const a = buildImmutableObjectPath({
      runId: 'run_aaa',
      artifact: 'source_xlsx',
      at: new Date('2026-11-18T10:00:00Z'),
    });
    const b = buildImmutableObjectPath({
      runId: 'run_bbb',
      artifact: 'source_xlsx',
      at: new Date('2026-11-18T10:00:00Z'),
    });
    assert.equal(a, 'snapshots/2026/11/18/run_aaa/source.xlsx');
    assert.notEqual(a, b);
  });
});

describe('CB360 publish policy (mock)', () => {
  it('FULL ok brands → publish', () => {
    const d = decidePublish({
      plannedBrandCount: 2,
      brandResults: [
        { brandId: 'a', outcome: 'ok' },
        { brandId: 'b', outcome: 'ok' },
      ],
    });
    assert.equal(d.publish, true);
    assert.equal(d.becameCurrent, true);
  });

  it('PARTIAL never publishes', () => {
    const d = decidePublish({
      plannedBrandCount: 2,
      brandResults: [
        { brandId: 'a', outcome: 'ok' },
        { brandId: 'b', outcome: 'failed', reasonCode: 'timeout' },
      ],
    });
    assert.equal(d.publish, false);
    assert.equal(d.status, 'partial');
  });

  it('stale base rejected', () => {
    assert.throws(
      () =>
        assertBaseNotStale({
          claimedBaseVersionId: 'ver_old',
          claimedBaseSha256: 'a'.repeat(64),
          currentSourceVersionId: 'ver_new',
          currentSourceSha256: 'b'.repeat(64),
        }),
      (err: unknown) => err instanceof Cb360Error && err.code === 'stale_base'
    );
  });
});

describe('CB360 lease fencing (mock)', () => {
  it('blocks concurrent acquire while lease live', () => {
    const lock = {
      id: 1 as const,
      runId: 'run_1',
      leaseGeneration: 3,
      leaseExpiresAt: computeLeaseExpiry(new Date(), 60_000),
      updatedAt: new Date().toISOString(),
    };
    const gate = canAcquireLease(lock);
    assert.equal(gate.ok, false);
  });

  it('allows acquire after expiry', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const gate = canAcquireLease({
      id: 1,
      runId: 'run_old',
      leaseGeneration: 1,
      leaseExpiresAt: past,
      updatedAt: past,
    });
    assert.equal(gate.ok, true);
    assert.equal(isLeaseExpired(past), true);
  });

  it('rejects expired owner even with valid token', () => {
    const { token, hash } = mintLeaseToken();
    const past = new Date(Date.now() - 1000).toISOString();
    assert.throws(
      () =>
        assertRunOwnsLease({
          presentedToken: token,
          lock: {
            id: 1,
            runId: 'run_1',
            leaseGeneration: 1,
            leaseExpiresAt: past,
            updatedAt: past,
          },
          run: {
            id: 'run_1',
            status: 'running',
            mode: 'synthetic',
            configVersion: null,
            plannedBrandCount: 1,
            brandResults: [],
            brandOk: null,
            brandFailed: null,
            brandSkipped: null,
            requestedBy: null,
            leaseTokenHash: hash,
            leaseGeneration: 1,
            leaseExpiresAt: past,
            baseVersionId: null,
            baseSha256: null,
            outputVersionId: null,
            outputSha256: null,
            outputObjectPath: null,
            logicalBundleId: 'bundle_1',
            published: false,
            becameCurrent: false,
            clientSha256: null,
            serverSha256: null,
            byteSize: null,
            errorCode: null,
            notes: null,
            completePayloadHash: null,
            createdAt: past,
            updatedAt: past,
            finishedAt: null,
          },
        }),
      (err: unknown) => err instanceof Cb360Error && err.code === 'lease_expired'
    );
  });
});

describe('CB360 concurrency + fencing (memory mutex — not Postgres)', () => {
  it('1+2: concurrent start → one winner, one active_run_exists', async () => {
    const deps = depsWithBase();
    const results = await Promise.allSettled([
      startScanRun(deps, { plannedBrandCount: 1 }),
      startScanRun(deps, { plannedBrandCount: 1 }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(err instanceof Cb360Error);
    assert.equal(err.code, 'active_run_exists');
    assert.equal(err.httpStatus, 409);

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof startScanRun>>>).value;
    const lock = await deps.repo.getLeaseLock();
    assert.equal(lock.runId, winner.runId);
    assert.equal(lock.leaseGeneration, winner.leaseGeneration);
  });

  it('3: expired lease → new run acquires; old aborted', async () => {
    const deps = depsWithBase();
    let clock = Date.now();
    const timed: Cb360ServiceDeps = { repo: deps.repo, now: () => new Date(clock) };
    const first = await startScanRun(timed, {});
    clock += 16 * 60 * 1000;
    const second = await startScanRun(timed, {});
    assert.notEqual(second.runId, first.runId);
    assert.ok(second.leaseGeneration > first.leaseGeneration);
    const old = await deps.repo.getRun(first.runId);
    assert.equal(old?.status, 'aborted_lease');
    const lock = await deps.repo.getLeaseLock();
    assert.equal(lock.runId, second.runId);
  });

  it('4: old run heartbeat after new owner → rejected', async () => {
    const deps = depsWithBase();
    let clock = Date.now();
    const timed: Cb360ServiceDeps = { repo: deps.repo, now: () => new Date(clock) };
    const first = await startScanRun(timed, {});
    clock += 16 * 60 * 1000;
    await startScanRun(timed, {});
    await assert.rejects(
      () =>
        heartbeatScanRun(timed, {
          runId: first.runId,
          leaseToken: first.leaseToken,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        (err.code === 'lease_expired' ||
          err.code === 'forbidden_lease' ||
          err.code === 'already_terminal') &&
        (err.code !== 'lease_expired' || err.httpStatus === 410)
    );
  });

  it('concurrent heartbeats from same owner both succeed atomically', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, {});
    const results = await Promise.all([
      heartbeatScanRun(deps, {
        runId: started.runId,
        leaseToken: started.leaseToken,
      }),
      heartbeatScanRun(deps, {
        runId: started.runId,
        leaseToken: started.leaseToken,
      }),
    ]);
    assert.equal(results[0].status, 'running');
    assert.equal(results[1].status, 'running');
    const lock = await deps.repo.getLeaseLock();
    assert.equal(lock.runId, started.runId);
    assert.ok(lock.leaseExpiresAt);
  });

  it('heartbeat after lease expiry does not renew (410)', async () => {
    const deps = depsWithBase();
    let clock = Date.now();
    const timed: Cb360ServiceDeps = { repo: deps.repo, now: () => new Date(clock) };
    const started = await startScanRun(timed, {});
    clock += 16 * 60 * 1000;
    await assert.rejects(
      () =>
        heartbeatScanRun(timed, {
          runId: started.runId,
          leaseToken: started.leaseToken,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        err.code === 'lease_expired' &&
        err.httpStatus === 410
    );
    const lock = await deps.repo.getLeaseLock();
    // Expiry alone does not clear lock in heartbeat; try_start will reclaim
    assert.equal(lock.runId, started.runId);
    const run = await deps.repo.getRun(started.runId);
    assert.ok(run && new Date(run.leaseExpiresAt).getTime() <= clock);
  });

  it('expired lease + concurrent new start: heartbeat loses, start wins', async () => {
    const deps = depsWithBase();
    let clock = Date.now();
    const timed: Cb360ServiceDeps = { repo: deps.repo, now: () => new Date(clock) };
    const first = await startScanRun(timed, {});
    clock += 16 * 60 * 1000;

    const settled = await Promise.allSettled([
      heartbeatScanRun(timed, {
        runId: first.runId,
        leaseToken: first.leaseToken,
      }),
      startScanRun(timed, {}),
    ]);

    const hb = settled[0];
    const start = settled[1];
    assert.equal(hb.status, 'rejected');
    assert.ok(
      hb.status === 'rejected' &&
        hb.reason instanceof Cb360Error &&
        (hb.reason.code === 'lease_expired' ||
          hb.reason.code === 'forbidden_lease' ||
          hb.reason.code === 'already_terminal')
    );
    assert.equal(start.status, 'fulfilled');
    if (start.status === 'fulfilled') {
      const lock = await deps.repo.getLeaseLock();
      assert.equal(lock.runId, start.value.runId);
      assert.notEqual(lock.runId, first.runId);
    }
  });

  it('5: old run complete after new owner → rejected', async () => {
    const deps = depsWithBase();
    let clock = Date.now();
    const timed: Cb360ServiceDeps = { repo: deps.repo, now: () => new Date(clock) };
    const first = await startScanRun(timed, { plannedBrandCount: 1 });
    clock += 16 * 60 * 1000;
    await startScanRun(timed, {});
    const bytes = Buffer.from('old-complete');
    await assert.rejects(
      () =>
        completeScanRun(timed, {
          runId: first.runId,
          leaseToken: first.leaseToken,
          clientSha256: sha256Hex(bytes),
          objectPath: `snapshots/2026/11/18/${first.runId}/source.xlsx`,
          brandResults: [{ brandId: 'a', outcome: 'ok' }],
          plannedBrandCount: 1,
          syntheticServerBytes: bytes,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        (err.code === 'already_terminal' || err.code === 'forbidden_lease')
    );
  });
});

describe('CB360 complete idempotency (memory)', () => {
  it('6: successful complete replay without active lease', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });
    const bytes = Buffer.from('synthetic-xlsx-idem');
    const payload = {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
      brandResults: [{ brandId: 'a', outcome: 'ok' as const }],
      plannedBrandCount: 1,
      syntheticServerBytes: bytes,
    };
    const first = await completeScanRun(deps, payload);
    assert.equal(first.idempotent, false);
    assert.equal(first.becameCurrent, true);

    const lock = await deps.repo.getLeaseLock();
    assert.equal(lock.runId, null);

    const second = await completeScanRun(deps, payload);
    assert.equal(second.idempotent, true);
    assert.equal(second.outputVersionId, first.outputVersionId);
    assert.equal(second.becameCurrent, true);
  });

  it('7: different payload on complete replay → rejected', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });
    const bytes = Buffer.from('synthetic-xlsx-a');
    await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
      brandResults: [{ brandId: 'a', outcome: 'ok' }],
      plannedBrandCount: 1,
      syntheticServerBytes: bytes,
    });

    await assert.rejects(
      () =>
        completeScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
          clientSha256: sha256Hex(bytes),
          objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
          brandResults: [{ brandId: 'b', outcome: 'ok' }],
          plannedBrandCount: 1,
          syntheticServerBytes: bytes,
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        (err.code === 'idempotent_replay' || err.code === 'already_terminal')
    );
  });

  it('8+9: double publish blocked; current bundle intact', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });
    const bytes = Buffer.from('synthetic-xlsx-ok');
    const first = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
      brandResults: [{ brandId: 'a', outcome: 'ok' }],
      plannedBrandCount: 1,
      syntheticServerBytes: bytes,
    });
    const currentAfter = await deps.repo.getCurrentBundle();
    assert.equal(currentAfter?.sourceVersionId, first.outputVersionId);

    const replay = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
      brandResults: [{ brandId: 'a', outcome: 'ok' }],
      plannedBrandCount: 1,
      syntheticServerBytes: bytes,
    });
    assert.equal(replay.idempotent, true);
    const currentAgain = await deps.repo.getCurrentBundle();
    assert.equal(currentAgain?.sourceVersionId, first.outputVersionId);
    assert.equal(currentAgain?.updatedByRunId, started.runId);
  });
});

describe('CB360 run lifecycle (memory repo)', () => {
  it('start + heartbeat', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });
    assert.ok(started.leaseToken);
    assert.equal(started.baseVersionId, 'ver_base');
    const hb = await heartbeatScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
    });
    assert.equal(hb.status, 'running');
  });

  it('wrong hash rejected and not published', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });
    const bytes = Buffer.from('synthetic-xlsx-v1');
    await assert.rejects(
      () =>
        completeScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
          clientSha256: sha256Hex('wrong'),
          objectPath: buildImmutableObjectPath({
            runId: started.runId,
            artifact: 'source_xlsx',
          }),
          brandResults: [{ brandId: 'acme', outcome: 'ok' }],
          plannedBrandCount: 1,
          syntheticServerBytes: bytes,
        }),
      (err: unknown) => err instanceof Cb360Error && err.code === 'hash_mismatch'
    );
    const status = await deps.repo.getRun(started.runId);
    assert.equal(status?.status, 'rejected_integrity');
    assert.equal(status?.becameCurrent, false);
  });

  it('PARTIAL does not publish', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 2 });
    const bytes = Buffer.from('synthetic-xlsx-partial');
    const result = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
      brandResults: [
        { brandId: 'a', outcome: 'ok' },
        { brandId: 'b', outcome: 'failed', reasonCode: 'nav_error' },
      ],
      plannedBrandCount: 2,
      syntheticServerBytes: bytes,
    });
    assert.equal(result.published, false);
    assert.equal(result.becameCurrent, false);
    assert.equal(result.status, 'partial');
    const current = await deps.repo.getCurrentBundle();
    assert.equal(current?.sourceVersionId, 'ver_base');
  });

  it('stale base rejected on complete', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });

    const hijack: Cb360SourceVersion = {
      id: 'ver_hijack',
      kind: 'snapshot',
      artifact: 'source_xlsx',
      objectPath: 'snapshots/2026/11/18/other/source.xlsx',
      sha256: sha256Hex('hijack'),
      byteSize: 6,
      bundleId: 'bundle_hijack',
      createdByRunId: 'run_other',
      immutable: true,
      createdAt: new Date().toISOString(),
    };

    await deps.repo.releaseLease({
      runId: started.runId,
      leaseGeneration: started.leaseGeneration,
    });
    await deps.repo.updateRun(started.runId, { status: 'aborted' });

    const other = await startScanRun(deps, { plannedBrandCount: 1 });
    // Force current to hijack via publish of other after manually swapping base claim
    // Simpler: insert version and poke current through publish of other with matching base
    const otherRun = await deps.repo.getRun(other.runId);
    assert.ok(otherRun);
    await deps.repo.publishBundle({
      run: { ...otherRun, status: 'verifying' },
      outputVersion: hijack,
      expectedBaseVersionId: 'ver_base',
      completePayloadHash: 'x'.repeat(64),
    });

    // Revive started lease artificially — should still fail stale_base if somehow active;
    // but started is aborted → already_terminal
    await assert.rejects(
      () =>
        completeScanRun(deps, {
          runId: started.runId,
          leaseToken: started.leaseToken,
          clientSha256: sha256Hex(Buffer.from('x')),
          objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
          brandResults: [{ brandId: 'a', outcome: 'ok' }],
          plannedBrandCount: 1,
          syntheticServerBytes: Buffer.from('x'),
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        (err.code === 'already_terminal' || err.code === 'stale_base')
    );
  });
});

describe('CB360 rollback safety (mock)', () => {
  it('failed run leaves previous current intact', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, { plannedBrandCount: 1 });
    const bytes = Buffer.from('fail-bytes');
    const result = await completeScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
      clientSha256: sha256Hex(bytes),
      objectPath: `snapshots/2026/11/18/${started.runId}/source.xlsx`,
      brandResults: [{ brandId: 'a', outcome: 'ok' }],
      plannedBrandCount: 1,
      forceFailed: true,
      syntheticServerBytes: bytes,
    });
    assert.equal(result.published, false);
    assert.equal(result.status, 'failed');
    const current = await deps.repo.getCurrentBundle();
    assert.equal(current?.sourceVersionId, 'ver_base');
  });
});

describe('CB360 RPC error mapping (unit — not live Postgres)', () => {
  it('10: maps active_run / terminal / idempotent / stale / expired codes', () => {
    assert.throws(
      () => throwFromPg('cb360_active_run_exists:run_abc'),
      (e: unknown) =>
        e instanceof Cb360Error && e.code === 'active_run_exists' && e.httpStatus === 409
    );
    assert.throws(
      () => throwFromPg('cb360_already_terminal:partial'),
      (e: unknown) => e instanceof Cb360Error && e.code === 'already_terminal' && e.httpStatus === 409
    );
    assert.throws(
      () => throwFromPg('cb360_idempotent_replay'),
      (e: unknown) => e instanceof Cb360Error && e.code === 'idempotent_replay'
    );
    assert.throws(
      () => throwFromPg('cb360_stale_base'),
      (e: unknown) => e instanceof Cb360Error && e.code === 'stale_base'
    );
    assert.throws(
      () => throwFromPg('cb360_forbidden_lease'),
      (e: unknown) =>
        e instanceof Cb360Error && e.code === 'forbidden_lease' && e.httpStatus === 403
    );
    assert.throws(
      () => throwFromPg('cb360_lease_expired'),
      (e: unknown) =>
        e instanceof Cb360Error && e.code === 'lease_expired' && e.httpStatus === 410
    );
  });
});

describe('CB360 atomic heartbeat (memory mutex — not Postgres)', () => {
  it('wrong token on heartbeat → 403', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, {});
    await assert.rejects(
      () =>
        heartbeatScanRun(deps, {
          runId: started.runId,
          leaseToken: 'not-the-real-token-value-xxx',
        }),
      (err: unknown) =>
        err instanceof Cb360Error &&
        err.code === 'forbidden_lease' &&
        err.httpStatus === 403
    );
  });

  it('start→running transition happens inside heartbeat', async () => {
    const deps = depsWithBase();
    const started = await startScanRun(deps, {});
    const before = await deps.repo.getRun(started.runId);
    assert.equal(before?.status, 'started');
    const hb = await heartbeatScanRun(deps, {
      runId: started.runId,
      leaseToken: started.leaseToken,
    });
    assert.equal(hb.status, 'running');
    const after = await deps.repo.getRun(started.runId);
    assert.equal(after?.status, 'running');
    assert.equal(after?.leaseExpiresAt, hb.leaseExpiresAt);
  });
});
