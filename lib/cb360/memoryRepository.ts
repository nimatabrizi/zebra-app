import { canAcquireLease, isActiveStatus } from './lease';
import type { Cb360Repository, Cb360StartRunInput } from './repository';
import {
  Cb360Error,
  type Cb360CurrentBundle,
  type Cb360LeaseLock,
  type Cb360ScanRun,
  type Cb360SourceVersion,
} from './types';

/**
 * In-memory repo for synthetic tests — no Supabase / no real Postgres.
 * Serializes tryStartRun/publish via a promise mutex to emulate short critical sections.
 * This does NOT prove PostgreSQL FOR UPDATE semantics.
 */
export function createMemoryRepository(seed?: {
  current?: Cb360CurrentBundle | null;
  versions?: Cb360SourceVersion[];
}): Cb360Repository {
  const runs = new Map<string, Cb360ScanRun>();
  const versions = new Map<string, Cb360SourceVersion>();
  for (const v of seed?.versions ?? []) versions.set(v.id, v);

  let current: Cb360CurrentBundle | null = seed?.current ?? null;
  let lock: Cb360LeaseLock = {
    id: 1,
    runId: null,
    leaseGeneration: 0,
    leaseExpiresAt: null,
    updatedAt: new Date().toISOString(),
  };

  let chain: Promise<unknown> = Promise.resolve();
  function withMutex<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = chain.then(() => fn());
    chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  const repo: Cb360Repository = {
    async getLeaseLock() {
      return { ...lock };
    },

    async tryStartRun(input: Cb360StartRunInput) {
      return withMutex(() => {
        const gate = canAcquireLease(lock, input.now);
        if (!gate.ok) {
          throw new Cb360Error(
            'active_run_exists',
            `Aktif run var: ${gate.runId}`,
            409
          );
        }

        if (lock.runId) {
          const prev = runs.get(lock.runId);
          if (prev && isActiveStatus(prev.status)) {
            runs.set(lock.runId, {
              ...prev,
              status: 'aborted_lease',
              errorCode: 'lease_expired',
              finishedAt: prev.finishedAt ?? input.now.toISOString(),
              updatedAt: input.now.toISOString(),
            });
          }
        }

        const leaseGeneration = lock.leaseGeneration + 1;
        lock = {
          id: 1,
          runId: input.runId,
          leaseGeneration,
          leaseExpiresAt: input.leaseExpiresAt,
          updatedAt: input.now.toISOString(),
        };

        if (runs.has(input.runId)) {
          throw new Cb360Error('invalid_payload', 'run id exists', 409);
        }

        const run: Cb360ScanRun = {
          id: input.runId,
          status: 'started',
          mode: input.mode,
          configVersion: input.configVersion,
          plannedBrandCount: input.plannedBrandCount,
          brandResults: [],
          brandOk: null,
          brandFailed: null,
          brandSkipped: null,
          requestedBy: input.requestedBy,
          leaseTokenHash: input.leaseTokenHash,
          leaseGeneration,
          leaseExpiresAt: input.leaseExpiresAt,
          baseVersionId: input.baseVersionId,
          baseSha256: input.baseSha256,
          outputVersionId: null,
          outputSha256: null,
          outputObjectPath: null,
          logicalBundleId: input.logicalBundleId,
          published: false,
          becameCurrent: false,
          clientSha256: null,
          serverSha256: null,
          byteSize: null,
          errorCode: null,
          notes: null,
          completePayloadHash: null,
          createdAt: input.now.toISOString(),
          updatedAt: input.now.toISOString(),
          finishedAt: null,
        };
        runs.set(run.id, run);
        return { ...run };
      });
    },

    async heartbeatRun({ runId, leaseTokenHash, leaseExpiresAt, now }) {
      return withMutex(() => {
        const at = now ?? new Date();
        if (new Date(leaseExpiresAt).getTime() <= at.getTime()) {
          throw new Cb360Error('invalid_payload', 'leaseExpiresAt must be future', 400);
        }

        const run = runs.get(runId);
        if (!run) throw new Cb360Error('not_found', 'Run bulunamadı', 404);

        if (run.leaseTokenHash !== leaseTokenHash) {
          throw new Cb360Error('forbidden_lease', 'Lease token hash uyuşmuyor', 403);
        }

        if (
          lock.runId !== runId ||
          lock.leaseGeneration !== run.leaseGeneration
        ) {
          throw new Cb360Error('forbidden_lease', 'Lease sahipliği uyuşmuyor', 403);
        }

        if (!isActiveStatus(run.status)) {
          throw new Cb360Error(
            'already_terminal',
            `Run terminal durumda: ${run.status}`,
            409
          );
        }

        if (
          !lock.leaseExpiresAt ||
          new Date(lock.leaseExpiresAt).getTime() <= at.getTime() ||
          new Date(run.leaseExpiresAt).getTime() <= at.getTime()
        ) {
          throw new Cb360Error('lease_expired', 'Lease süresi dolmuş', 410);
        }

        const status = run.status === 'started' ? 'running' : run.status;
        lock = {
          ...lock,
          leaseExpiresAt,
          updatedAt: at.toISOString(),
        };
        const next = {
          ...run,
          status,
          leaseExpiresAt,
          updatedAt: at.toISOString(),
        };
        runs.set(runId, next);
        return {
          leaseExpiresAt,
          status,
          leaseGeneration: run.leaseGeneration,
        };
      });
    },

    async releaseLease({ runId, leaseGeneration }) {
      if (lock.runId === runId && lock.leaseGeneration === leaseGeneration) {
        lock = {
          id: 1,
          runId: null,
          leaseGeneration,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        };
      }
    },

    async getRun(runId) {
      const r = runs.get(runId);
      return r ? { ...r } : null;
    },

    async updateRun(runId, patch) {
      const existing = runs.get(runId);
      if (!existing) throw new Cb360Error('not_found', 'Run bulunamadı', 404);
      const next = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      runs.set(runId, next);
      return { ...next };
    },

    async getCurrentBundle() {
      return current ? { ...current } : null;
    },

    async getVersion(id) {
      const v = versions.get(id);
      return v ? { ...v } : null;
    },

    async insertVersion(version) {
      if ([...versions.values()].some((v) => v.objectPath === version.objectPath)) {
        throw new Cb360Error('invalid_payload', 'object_path already exists', 409);
      }
      versions.set(version.id, { ...version });
      return { ...version };
    },

    async publishBundle({ run, outputVersion, expectedBaseVersionId, completePayloadHash }) {
      return withMutex(() => {
        const existing = runs.get(run.id);
        if (!existing) throw new Cb360Error('not_found', 'Run bulunamadı', 404);

        if (existing.becameCurrent && existing.outputVersionId) {
          if (
            existing.completePayloadHash &&
            completePayloadHash &&
            existing.completePayloadHash !== completePayloadHash
          ) {
            throw new Cb360Error(
              'idempotent_replay',
              'Farklı payload ile tekrar publish reddedildi',
              409
            );
          }
          return {
            run: { ...existing },
            bundle: current!,
            idempotent: true,
          };
        }

        if (!isActiveStatus(existing.status)) {
          throw new Cb360Error(
            'already_terminal',
            `Run terminal durumda: ${existing.status}`,
            409
          );
        }

        if (
          lock.runId !== run.id ||
          lock.leaseGeneration !== run.leaseGeneration ||
          !lock.leaseExpiresAt ||
          new Date(lock.leaseExpiresAt).getTime() <= Date.now()
        ) {
          throw new Cb360Error('forbidden_lease', 'Publish fencing failed', 403);
        }

        if (current && current.sourceVersionId !== expectedBaseVersionId) {
          throw new Cb360Error('stale_base', 'Stale base during publish', 409);
        }
        if (!current && expectedBaseVersionId != null) {
          throw new Cb360Error('stale_base', 'Stale base during publish', 409);
        }

        if ([...versions.values()].some((v) => v.objectPath === outputVersion.objectPath)) {
          throw new Cb360Error('invalid_payload', 'object_path already exists', 409);
        }

        versions.set(outputVersion.id, { ...outputVersion });
        current = {
          id: 1,
          bundleId: outputVersion.bundleId,
          sourceVersionId: outputVersion.id,
          identityMapsVersionId: current?.identityMapsVersionId ?? null,
          userDecisionsVersionId: current?.userDecisionsVersionId ?? null,
          updatedAt: new Date().toISOString(),
          updatedByRunId: run.id,
        };

        const finalized: Cb360ScanRun = {
          ...existing,
          ...run,
          status: 'completed',
          published: true,
          becameCurrent: true,
          outputVersionId: outputVersion.id,
          outputSha256: outputVersion.sha256,
          outputObjectPath: outputVersion.objectPath,
          completePayloadHash,
          finishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        runs.set(run.id, finalized);

        lock = {
          id: 1,
          runId: null,
          leaseGeneration: run.leaseGeneration,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        };

        return { run: { ...finalized }, bundle: { ...current }, idempotent: false };
      });
    },
  };

  return repo;
}
