import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertLeaseTokenMatch,
  hashCompletePayload,
  hashLeaseToken,
  mintLeaseToken,
  newId,
  normalizeSha256,
  sha256Hex,
} from './integrity';
import {
  assertRunOwnsLease,
  CB360_HEARTBEAT_EXTEND_MS,
  computeLeaseExpiry,
  isActiveStatus,
} from './lease';
import { buildImmutableObjectPath } from './paths';
import { assertBaseNotStale, decidePublish } from './publish';
import type { Cb360Repository } from './repository';
import {
  assertClientHashMatchesServer,
  createCb360SignedDownloadUrl,
  createCb360SignedUploadUrl,
  downloadAndHashObject,
} from './storage';
import {
  Cb360Error,
  type Cb360BrandResult,
  type Cb360RunMode,
  type Cb360ScanRun,
  type Cb360SourceVersion,
} from './types';

export type Cb360ServiceDeps = {
  repo: Cb360Repository;
  /** Required for signed URL + server hash paths; optional for pure metadata tests */
  storageClient?: SupabaseClient;
  now?: () => Date;
};

export type CompleteResult = {
  idempotent: boolean;
  status: string;
  published: boolean;
  becameCurrent: boolean;
  outputVersionId: string | null;
  serverSha256: string | null;
  errorCode?: string | null;
};

function nowOf(deps: Cb360ServiceDeps): Date {
  return deps.now?.() ?? new Date();
}

function requireStorage(deps: Cb360ServiceDeps): SupabaseClient {
  if (!deps.storageClient) {
    throw new Cb360Error('config_missing', 'Storage client yok', 503);
  }
  return deps.storageClient;
}

/** Active mutating ops: full fencing (lock + generation + token + expiry). */
async function loadOwnedRun(
  deps: Cb360ServiceDeps,
  runId: string,
  leaseToken: string
): Promise<{ run: Cb360ScanRun }> {
  const run = await deps.repo.getRun(runId);
  if (!run) throw new Cb360Error('not_found', 'Run bulunamadı', 404);
  const lock = await deps.repo.getLeaseLock();
  assertRunOwnsLease({
    run,
    lock,
    presentedToken: leaseToken,
    now: nowOf(deps),
  });
  return { run };
}

/**
 * Complete path auth:
 * - Always: machine API auth (caller) + lease token matches run hash
 * - Terminal same-payload: no active lease required (idempotent replay)
 * - Terminal different-payload / re-publish: rejected
 * - Non-terminal: full fencing required
 */
async function loadRunForComplete(
  deps: Cb360ServiceDeps,
  runId: string,
  leaseToken: string,
  payloadHash: string
): Promise<{ run: Cb360ScanRun; idempotentReplay: CompleteResult | null }> {
  const run = await deps.repo.getRun(runId);
  if (!run) throw new Cb360Error('not_found', 'Run bulunamadı', 404);

  // Ownership proof without skipping auth: token must match stored hash
  assertLeaseTokenMatch(leaseToken, run.leaseTokenHash);

  if (!isActiveStatus(run.status)) {
    if (run.completePayloadHash && run.completePayloadHash === payloadHash) {
      return {
        run,
        idempotentReplay: {
          idempotent: true,
          status: run.status,
          published: run.published,
          becameCurrent: run.becameCurrent,
          outputVersionId: run.outputVersionId,
          serverSha256: run.serverSha256,
          errorCode: run.errorCode,
        },
      };
    }
    throw new Cb360Error(
      run.becameCurrent || run.published ? 'idempotent_replay' : 'already_terminal',
      'Run terminal durumda; farklı sonuç veya yeniden yayın kabul edilmez',
      409
    );
  }

  const lock = await deps.repo.getLeaseLock();
  assertRunOwnsLease({
    run,
    lock,
    presentedToken: leaseToken,
    now: nowOf(deps),
  });
  return { run, idempotentReplay: null };
}

export async function startScanRun(
  deps: Cb360ServiceDeps,
  input: {
    mode?: Cb360RunMode;
    configVersion?: string;
    plannedBrandCount?: number;
    requestedBy?: string;
  } = {}
): Promise<{
  runId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  leaseGeneration: number;
  baseVersionId: string | null;
  baseSha256: string | null;
  logicalBundleId: string;
  mode: Cb360RunMode;
}> {
  const now = nowOf(deps);
  const { token, hash } = mintLeaseToken();
  const leaseExpiresAt = computeLeaseExpiry(now);
  const runId = newId('run');
  const logicalBundleId = newId('bundle');
  const mode: Cb360RunMode = input.mode ?? 'synthetic';

  const current = await deps.repo.getCurrentBundle();
  let baseVersionId: string | null = null;
  let baseSha256: string | null = null;
  if (current) {
    const version = await deps.repo.getVersion(current.sourceVersionId);
    baseVersionId = current.sourceVersionId;
    baseSha256 = version?.sha256 ?? null;
  }

  // Atomic lease + insert (RPC / mutex). Generation assigned server-side.
  const run = await deps.repo.tryStartRun({
    runId,
    leaseTokenHash: hash,
    leaseExpiresAt,
    mode,
    configVersion: input.configVersion ?? null,
    plannedBrandCount: input.plannedBrandCount ?? null,
    requestedBy: input.requestedBy ?? null,
    logicalBundleId,
    baseVersionId,
    baseSha256,
    now,
  });

  return {
    runId: run.id,
    leaseToken: token,
    leaseExpiresAt: run.leaseExpiresAt,
    leaseGeneration: run.leaseGeneration,
    baseVersionId: run.baseVersionId,
    baseSha256: run.baseSha256,
    logicalBundleId: run.logicalBundleId,
    mode: run.mode,
  };
}

export async function heartbeatScanRun(
  deps: Cb360ServiceDeps,
  input: { runId: string; leaseToken: string }
): Promise<{ leaseExpiresAt: string; status: string }> {
  // API sözleşmesi aynı: runId + leaseToken → leaseExpiresAt + status
  // Doğrulama + uzatma atomik RPC/mutex içinde (ayrı read-then-write yok)
  const now = nowOf(deps);
  const leaseExpiresAt = computeLeaseExpiry(now, CB360_HEARTBEAT_EXTEND_MS);
  const result = await deps.repo.heartbeatRun({
    runId: input.runId,
    leaseTokenHash: hashLeaseToken(input.leaseToken),
    leaseExpiresAt,
    now,
  });
  return {
    leaseExpiresAt: result.leaseExpiresAt,
    status: result.status,
  };
}

export async function createDownloadUrl(
  deps: Cb360ServiceDeps,
  input: { runId: string; leaseToken: string }
) {
  const { run } = await loadOwnedRun(deps, input.runId, input.leaseToken);
  if (!run.baseVersionId) {
    throw new Cb360Error('not_found', 'Henüz current/base version yok', 404);
  }
  const version = await deps.repo.getVersion(run.baseVersionId);
  if (!version) throw new Cb360Error('not_found', 'Base version bulunamadı', 404);

  const signed = await createCb360SignedDownloadUrl(
    requireStorage(deps),
    version.objectPath
  );

  return {
    ...signed,
    versionId: version.id,
    sha256: version.sha256,
    byteSize: version.byteSize,
  };
}

export async function authorizeUpload(
  deps: Cb360ServiceDeps,
  input: { runId: string; leaseToken: string; artifact?: 'source_xlsx' }
) {
  const { run } = await loadOwnedRun(deps, input.runId, input.leaseToken);
  const artifact = input.artifact ?? 'source_xlsx';
  const objectPath = buildImmutableObjectPath({
    runId: run.id,
    artifact,
    at: nowOf(deps),
  });

  const signed = await createCb360SignedUploadUrl(requireStorage(deps), objectPath);

  await deps.repo.updateRun(run.id, {
    status: 'uploading',
    outputObjectPath: objectPath,
  });

  return signed;
}

export type CompleteInput = {
  runId: string;
  leaseToken: string;
  clientSha256: string;
  objectPath?: string;
  brandResults: Cb360BrandResult[];
  plannedBrandCount?: number;
  forcePartial?: boolean;
  forceFailed?: boolean;
  /** Skip storage download — only for synthetic unit tests with injected hash */
  syntheticServerBytes?: Buffer;
};

export async function completeScanRun(
  deps: Cb360ServiceDeps,
  input: CompleteInput
): Promise<CompleteResult> {
  const clientSha = normalizeSha256(input.clientSha256);
  const preliminaryPath = input.objectPath;

  // Payload hash uses objectPath from request or will recompute after load
  const runPeek = await deps.repo.getRun(input.runId);
  if (!runPeek) throw new Cb360Error('not_found', 'Run bulunamadı', 404);

  const objectPathForHash = preliminaryPath ?? runPeek.outputObjectPath;
  const payloadHash = hashCompletePayload({
    runId: input.runId,
    clientSha256: clientSha,
    brandResults: input.brandResults,
    objectPath: objectPathForHash,
  });

  const { run, idempotentReplay } = await loadRunForComplete(
    deps,
    input.runId,
    input.leaseToken,
    payloadHash
  );
  if (idempotentReplay) return idempotentReplay;

  const objectPath = input.objectPath ?? run.outputObjectPath;
  if (!objectPath) {
    throw new Cb360Error('invalid_payload', 'objectPath gerekli', 400);
  }

  await deps.repo.updateRun(run.id, { status: 'verifying', clientSha256: clientSha });

  let serverSha: string;
  let byteSize: number;

  if (input.syntheticServerBytes) {
    serverSha = sha256Hex(input.syntheticServerBytes);
    byteSize = input.syntheticServerBytes.byteLength;
  } else {
    const hashed = await downloadAndHashObject(requireStorage(deps), objectPath);
    serverSha = hashed.sha256;
    byteSize = hashed.byteSize;
  }

  try {
    assertClientHashMatchesServer(clientSha, serverSha);
  } catch (err) {
    await deps.repo.updateRun(run.id, {
      status: 'rejected_integrity',
      serverSha256: serverSha,
      byteSize,
      errorCode: 'hash_mismatch',
      finishedAt: nowOf(deps).toISOString(),
      completePayloadHash: payloadHash,
    });
    await deps.repo.releaseLease({
      runId: run.id,
      leaseGeneration: run.leaseGeneration,
    });
    throw err;
  }

  const planned = input.plannedBrandCount ?? run.plannedBrandCount;
  const decision = decidePublish({
    brandResults: input.brandResults,
    plannedBrandCount: planned,
    forcePartial: input.forcePartial,
    forceFailed: input.forceFailed,
  });

  const brandOk = input.brandResults.filter((r) => r.outcome === 'ok').length;
  const brandFailed = input.brandResults.filter((r) => r.outcome === 'failed').length;
  const brandSkipped = input.brandResults.filter((r) => r.outcome === 'skipped').length;

  if (!decision.publish) {
    const finalized = await deps.repo.updateRun(run.id, {
      status: decision.status,
      brandResults: input.brandResults,
      brandOk,
      brandFailed,
      brandSkipped,
      plannedBrandCount: planned,
      serverSha256: serverSha,
      byteSize,
      outputObjectPath: objectPath,
      published: false,
      becameCurrent: false,
      errorCode: decision.errorCode,
      finishedAt: nowOf(deps).toISOString(),
      completePayloadHash: payloadHash,
    });
    await deps.repo.releaseLease({
      runId: run.id,
      leaseGeneration: run.leaseGeneration,
    });
    return {
      idempotent: false,
      status: finalized.status,
      published: false,
      becameCurrent: false,
      outputVersionId: null,
      serverSha256: serverSha,
      errorCode: decision.errorCode,
    };
  }

  const current = await deps.repo.getCurrentBundle();
  assertBaseNotStale({
    claimedBaseVersionId: run.baseVersionId,
    claimedBaseSha256: run.baseSha256,
    currentSourceVersionId: current?.sourceVersionId ?? null,
    currentSourceSha256: current
      ? (await deps.repo.getVersion(current.sourceVersionId))?.sha256 ?? null
      : null,
  });

  const outputVersion: Cb360SourceVersion = {
    id: newId('ver'),
    kind: 'snapshot',
    artifact: 'source_xlsx',
    objectPath,
    sha256: serverSha,
    byteSize,
    bundleId: run.logicalBundleId,
    createdByRunId: run.id,
    immutable: true,
    createdAt: nowOf(deps).toISOString(),
  };

  const prepared: Cb360ScanRun = {
    ...run,
    status: 'verifying',
    brandResults: input.brandResults,
    brandOk,
    brandFailed,
    brandSkipped,
    plannedBrandCount: planned,
    clientSha256: clientSha,
    serverSha256: serverSha,
    byteSize,
    outputObjectPath: objectPath,
    completePayloadHash: payloadHash,
  };

  await deps.repo.updateRun(run.id, {
    brandResults: input.brandResults,
    brandOk,
    brandFailed,
    brandSkipped,
    plannedBrandCount: planned,
    clientSha256: clientSha,
    serverSha256: serverSha,
    byteSize,
    outputObjectPath: objectPath,
    completePayloadHash: payloadHash,
  });

  const published = await deps.repo.publishBundle({
    run: prepared,
    outputVersion,
    expectedBaseVersionId: run.baseVersionId,
    completePayloadHash: payloadHash,
  });

  return {
    idempotent: published.idempotent,
    status: published.run.status,
    published: published.run.published,
    becameCurrent: published.run.becameCurrent,
    outputVersionId: published.run.outputVersionId,
    serverSha256: serverSha,
  };
}

export async function getScanRunStatus(
  deps: Cb360ServiceDeps,
  runId: string
): Promise<{
  runId: string;
  status: string;
  published: boolean;
  becameCurrent: boolean;
  leaseExpiresAt: string;
  leaseGeneration: number;
  baseVersionId: string | null;
  outputVersionId: string | null;
  errorCode: string | null;
  brandOk: number | null;
  brandFailed: number | null;
  brandSkipped: number | null;
}> {
  const run = await deps.repo.getRun(runId);
  if (!run) throw new Cb360Error('not_found', 'Run bulunamadı', 404);
  return {
    runId: run.id,
    status: run.status,
    published: run.published,
    becameCurrent: run.becameCurrent,
    leaseExpiresAt: run.leaseExpiresAt,
    leaseGeneration: run.leaseGeneration,
    baseVersionId: run.baseVersionId,
    outputVersionId: run.outputVersionId,
    errorCode: run.errorCode,
    brandOk: run.brandOk,
    brandFailed: run.brandFailed,
    brandSkipped: run.brandSkipped,
  };
}
