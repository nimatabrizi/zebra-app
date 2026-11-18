/**
 * Preview HTTP E2E session cleanup — separate from cleanupSession.ts.
 *
 * Rules:
 * - Only exact tracked runIds / versionIds / objectPaths
 * - No requested_by LIKE, no 2099 orphan sweep
 * - current_bundle deleted only via conditional match + RETURNING
 * - Fail-closed staging ref gate; never run against production Vercel env
 * - Tracker must never hold secrets
 */
import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import {
  extractSupabaseProjectRef,
  parseForbiddenProjectRefs,
} from './stagingGuard';

export type PreviewE2eExpectedCurrent = {
  sourceVersionId: string;
  updatedByRunId: string;
};

/** Secrets are forbidden in this structure — ids/paths only. */
export type PreviewE2eSessionTracker = {
  sessionId: string;
  projectRefExpected: string;
  runIds: string[];
  versionIds: string[];
  objectPaths: string[];
  expectedCurrentAfterPublish: PreviewE2eExpectedCurrent | null;
};

export type PreviewE2eCleanupStepStatus =
  | 'ok'
  | 'skipped'
  | 'aborted'
  | 'failed';

export type PreviewE2eCleanupStep = {
  step: string;
  status: PreviewE2eCleanupStepStatus;
  detail: string;
};

export type PreviewE2eCleanupResult = {
  ok: boolean;
  aborted: boolean;
  steps: PreviewE2eCleanupStep[];
};

export class PreviewE2eCleanupError extends Error {
  readonly result: PreviewE2eCleanupResult;

  constructor(message: string, result: PreviewE2eCleanupResult) {
    super(message);
    this.name = 'PreviewE2eCleanupError';
    this.result = result;
  }
}

export class PreviewE2eCleanupGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewE2eCleanupGateError';
  }
}

/** Minimal shape from storage.remove() FileObject (name may be full path or basename). */
export type PreviewE2eStorageRemoveEntry = {
  name?: string | null;
  id?: string | null;
};

export type PreviewE2eStorageRemoveResult = {
  data: PreviewE2eStorageRemoveEntry[] | null;
  error: { message: string } | null;
};

/** Minimal PostgREST/storage surface used by this cleanup (mockable offline). */
export type PreviewE2eDbClient = {
  from: (table: string) => PreviewE2eQueryBuilder;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<PreviewE2eStorageRemoveResult>;
      /** Used only to verify object absence after remove (read-only). */
      download: (
        objectPath: string
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/**
 * Match a storage.remove() entry against a tracked exact object path.
 * SDK FileObject.name is documented as relative to a prefix and may be:
 * - the full object path, or
 * - only the basename (e.g. source.xlsx).
 */
export function storageRemoveEntryMatchesPath(
  entry: PreviewE2eStorageRemoveEntry,
  trackedPath: string
): boolean {
  const tracked = trackedPath.replace(/^\/+/, '').trim();
  if (!tracked) return false;
  const raw = (entry.name ?? '').replace(/^\/+/, '').trim();
  if (!raw) return false;
  if (raw === tracked) return true;
  // Basename-only responses: allow only when it matches the final segment.
  const base = tracked.includes('/') ? tracked.slice(tracked.lastIndexOf('/') + 1) : tracked;
  if (raw === base) return true;
  // Rare: bucket-qualified or leading folder variants ending with the tracked path.
  if (raw.endsWith(`/${tracked}`) || raw.endsWith(tracked)) return true;
  return false;
}

export async function storageObjectExists(
  client: PreviewE2eDbClient,
  objectPath: string
): Promise<boolean> {
  const { data, error } = await client.storage
    .from(CB360_BUCKET)
    .download(objectPath);
  return !error && data != null;
}

export type PreviewE2eQueryBuilder = {
  select: (columns?: string) => PreviewE2eQueryBuilder;
  update: (values: Record<string, unknown>) => PreviewE2eQueryBuilder;
  delete: () => PreviewE2eQueryBuilder;
  eq: (column: string, value: unknown) => PreviewE2eQueryBuilder;
  in: (column: string, values: readonly string[]) => PreviewE2eQueryBuilder;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
  /** Awaitable terminal — returns rows (RETURNING) or void-like data */
  then: Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>['then'];
};

const FORBIDDEN_TRACKER_KEYS =
  /secret|token|password|authorization|service.?role|api.?key|bearer/i;

/**
 * Refuse trackers that accidentally embed credentials.
 * Call before cleanup; also invoked inside cleanupPreviewE2eSession.
 */
export function assertPreviewE2eTrackerHasNoSecrets(
  tracker: PreviewE2eSessionTracker
): void {
  const json = JSON.stringify(tracker);
  if (FORBIDDEN_TRACKER_KEYS.test(json)) {
    throw new PreviewE2eCleanupGateError(
      'Preview E2E tracker must not contain secret-like fields'
    );
  }
}

/**
 * Fail-closed gate: staging ref only; block Vercel production.
 * Does not create clients and performs no mutations.
 */
export function assertPreviewE2eCleanupEnvironment(
  env: Cb360EnvBag,
  projectRefExpected: string
): { projectRef: string } {
  if (env.VERCEL_ENV === 'production') {
    throw new PreviewE2eCleanupGateError(
      'Preview E2E cleanup blocked: VERCEL_ENV=production'
    );
  }

  const expected = projectRefExpected.trim().toLowerCase();
  if (!expected) {
    throw new PreviewE2eCleanupGateError('projectRefExpected is required');
  }
  if (expected.includes('prod')) {
    throw new PreviewE2eCleanupGateError(
      'Refusing projectRefExpected containing "prod"'
    );
  }

  const stagingRef = env.CB360_STAGING_PROJECT_REF?.trim().toLowerCase();
  const stagingUrl = env.CB360_STAGING_SUPABASE_URL?.trim();
  if (!stagingRef || !stagingUrl) {
    throw new PreviewE2eCleanupGateError(
      'CB360_STAGING_PROJECT_REF and CB360_STAGING_SUPABASE_URL are required'
    );
  }

  const urlRef = extractSupabaseProjectRef(stagingUrl);
  if (!urlRef) {
    throw new PreviewE2eCleanupGateError(
      'CB360_STAGING_SUPABASE_URL must be https://<project-ref>.supabase.co'
    );
  }

  if (stagingRef !== expected || urlRef !== expected) {
    throw new PreviewE2eCleanupGateError(
      'Staging project ref does not match session projectRefExpected'
    );
  }

  const forbidden = parseForbiddenProjectRefs(env.CB360_FORBIDDEN_PROJECT_REFS);
  if (forbidden.includes(urlRef)) {
    throw new PreviewE2eCleanupGateError(
      'Target project ref is on CB360_FORBIDDEN_PROJECT_REFS'
    );
  }

  return { projectRef: urlRef };
}

function step(
  steps: PreviewE2eCleanupStep[],
  name: string,
  status: PreviewE2eCleanupStepStatus,
  detail: string
): void {
  steps.push({ step: name, status, detail });
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

async function awaitBuilder(
  builder: PreviewE2eQueryBuilder
): Promise<{
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}> {
  return await builder;
}

/**
 * Session-scoped Preview E2E cleanup.
 * Safe to re-run with the same tracker after partial failure.
 */
export async function cleanupPreviewE2eSession(
  client: PreviewE2eDbClient,
  tracker: PreviewE2eSessionTracker,
  env: Cb360EnvBag = process.env
): Promise<PreviewE2eCleanupResult> {
  const steps: PreviewE2eCleanupStep[] = [];

  assertPreviewE2eTrackerHasNoSecrets(tracker);
  assertPreviewE2eCleanupEnvironment(env, tracker.projectRefExpected);
  step(steps, 'gate', 'ok', `ref=${tracker.projectRefExpected}`);

  const runIds = uniqueNonEmpty(tracker.runIds);
  const versionIds = uniqueNonEmpty(tracker.versionIds);
  const objectPaths = uniqueNonEmpty(tracker.objectPaths);
  const expected = tracker.expectedCurrentAfterPublish;

  // 1) Lease — only if lock still held by a tracked run
  if (runIds.length) {
    const { data, error } = await awaitBuilder(
      client
        .from('cb360_lease_lock')
        .update({
          run_id: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
        .in('run_id', runIds)
        .select('id, run_id')
    );
    if (error) {
      step(steps, 'lease_release', 'failed', error.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('lease_release failed', result);
    }
    const n = data?.length ?? 0;
    step(
      steps,
      'lease_release',
      'ok',
      n === 0 ? 'no tracked lease held' : `released rows=${n}`
    );
  } else {
    step(steps, 'lease_release', 'skipped', 'no tracked runIds');
  }

  // 2) Current — conditional DELETE … RETURNING only
  if (!expected) {
    step(
      steps,
      'current_bundle',
      'skipped',
      'no expectedCurrentAfterPublish claim'
    );
  } else {
    const { data: deleted, error: delErr } = await awaitBuilder(
      client
        .from('cb360_current_bundle')
        .delete()
        .eq('id', 1)
        .eq('source_version_id', expected.sourceVersionId)
        .eq('updated_by_run_id', expected.updatedByRunId)
        .select('id, source_version_id, updated_by_run_id')
    );

    if (delErr) {
      step(steps, 'current_bundle', 'failed', delErr.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('current_bundle delete failed', result);
    }

    const deletedCount = deleted?.length ?? 0;
    if (deletedCount === 1) {
      step(
        steps,
        'current_bundle',
        'ok',
        `deleted source_version_id=${expected.sourceVersionId}`
      );
    } else if (deletedCount > 1) {
      step(
        steps,
        'current_bundle',
        'failed',
        `unexpected deleted count=${deletedCount}`
      );
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError(
        'current_bundle deleted unexpected row count',
        result
      );
    } else {
      // 0 rows: already gone (idempotent) OR changed by another writer → abort
      const { data: current, error: readErr } = await client
        .from('cb360_current_bundle')
        .select(
          'id, source_version_id, updated_by_run_id'
        )
        .eq('id', 1)
        .maybeSingle();

      if (readErr) {
        step(steps, 'current_bundle', 'failed', readErr.message);
        const result = { ok: false, aborted: false, steps };
        throw new PreviewE2eCleanupError('current_bundle re-read failed', result);
      }

      if (!current) {
        step(
          steps,
          'current_bundle',
          'skipped',
          'already absent (idempotent)'
        );
      } else {
        const src = String(current.source_version_id ?? '');
        const by = current.updated_by_run_id;
        const matches =
          src === expected.sourceVersionId &&
          by === expected.updatedByRunId;
        if (matches) {
          step(
            steps,
            'current_bundle',
            'failed',
            'conditional delete matched 0 but row still present'
          );
          const result = { ok: false, aborted: false, steps };
          throw new PreviewE2eCleanupError(
            'current_bundle conditional delete inconsistent',
            result
          );
        }
        step(
          steps,
          'current_bundle',
          'aborted',
          'current_bundle owned by another run; refusing further deletes'
        );
        return { ok: false, aborted: true, steps };
      }
    }
  }

  // 3) Foreign run references to tracked versions → abort before version delete
  if (versionIds.length) {
    const { data: byBase, error: baseErr } = await awaitBuilder(
      client
        .from('cb360_scan_runs')
        .select('id, base_version_id, output_version_id')
        .in('base_version_id', versionIds)
    );
    if (baseErr) {
      step(steps, 'foreign_ref_check', 'failed', baseErr.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('foreign_ref_check failed', result);
    }

    const { data: byOutput, error: outErr } = await awaitBuilder(
      client
        .from('cb360_scan_runs')
        .select('id, base_version_id, output_version_id')
        .in('output_version_id', versionIds)
    );
    if (outErr) {
      step(steps, 'foreign_ref_check', 'failed', outErr.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('foreign_ref_check failed', result);
    }

    const foreign = [...(byBase ?? []), ...(byOutput ?? [])].filter((row) => {
      const id = String(row.id ?? '');
      return id && !runIds.includes(id);
    });

    if (foreign.length) {
      step(
        steps,
        'foreign_ref_check',
        'aborted',
        `foreign runs reference tracked versions count=${foreign.length}`
      );
      return { ok: false, aborted: true, steps };
    }
    step(steps, 'foreign_ref_check', 'ok', 'no foreign refs');
  } else {
    step(steps, 'foreign_ref_check', 'skipped', 'no tracked versionIds');
  }

  // 4) Delete tracked runs only
  if (runIds.length) {
    const { data, error } = await awaitBuilder(
      client
        .from('cb360_scan_runs')
        .delete()
        .in('id', runIds)
        .select('id')
    );
    if (error) {
      step(steps, 'delete_runs', 'failed', error.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('delete_runs failed', result);
    }
    step(
      steps,
      'delete_runs',
      'ok',
      `deleted=${data?.length ?? 0} tracked=${runIds.length}`
    );
  } else {
    step(steps, 'delete_runs', 'skipped', 'no tracked runIds');
  }

  // 5) Delete tracked versions only
  if (versionIds.length) {
    const { data, error } = await awaitBuilder(
      client
        .from('cb360_source_versions')
        .delete()
        .in('id', versionIds)
        .select('id')
    );
    if (error) {
      step(steps, 'delete_versions', 'failed', error.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('delete_versions failed', result);
    }
    step(
      steps,
      'delete_versions',
      'ok',
      `deleted=${data?.length ?? 0} tracked=${versionIds.length}`
    );
  } else {
    step(steps, 'delete_versions', 'skipped', 'no tracked versionIds');
  }

  // 6) Storage — exact tracked paths only; error:null alone is not success
  if (objectPaths.length) {
    const existedBefore = new Map<string, boolean>();
    for (const p of objectPaths) {
      existedBefore.set(p, await storageObjectExists(client, p));
    }

    const { data, error } = await client.storage
      .from(CB360_BUCKET)
      .remove(objectPaths);
    if (error) {
      step(steps, 'storage_remove', 'failed', error.message);
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError('storage_remove failed', result);
    }

    const removedEntries: PreviewE2eStorageRemoveEntry[] = Array.isArray(data)
      ? data
      : [];
    const confirmedByData = new Set<string>();
    for (const entry of removedEntries) {
      for (const tracked of objectPaths) {
        if (storageRemoveEntryMatchesPath(entry, tracked)) {
          confirmedByData.add(tracked);
        }
      }
    }

    const stillPresent: string[] = [];
    for (const p of objectPaths) {
      if (await storageObjectExists(client, p)) stillPresent.push(p);
    }

    // Existence is authoritative: error:null / data rows never prove deletion alone.
    if (stillPresent.length) {
      step(
        steps,
        'storage_remove',
        'failed',
        `object still downloadable after remove count=${stillPresent.length}; dataConfirmed=${confirmedByData.size}; dataRows=${removedEntries.length}`
      );
      const result = { ok: false, aborted: false, steps };
      throw new PreviewE2eCleanupError(
        'storage_remove left downloadable objects',
        result
      );
    }

    if (removedEntries.length === 0) {
      // data:[] is acceptable only after independent absence verification (above).
      const anyExisted = objectPaths.some((p) => existedBefore.get(p));
      step(
        steps,
        'storage_remove',
        'ok',
        anyExisted
          ? `absent verified after empty data rows; tracked=${objectPaths.length}`
          : `idempotent already-absent paths=${objectPaths.length}`
      );
    } else {
      // Non-empty data must map to tracked paths; unconfirmed previously-existing
      // paths with objects now gone are OK only if every path is absent (checked).
      // Partial deletion = some paths still present — already failed above.
      const unmatchedEntries = removedEntries.filter(
        (entry) =>
          !objectPaths.some((tracked) =>
            storageRemoveEntryMatchesPath(entry, tracked)
          )
      );
      if (unmatchedEntries.length) {
        step(
          steps,
          'storage_remove',
          'failed',
          `remove data contained unmatched entries=${unmatchedEntries.length}`
        );
        const result = { ok: false, aborted: false, steps };
        throw new PreviewE2eCleanupError(
          'storage_remove data did not match tracked paths',
          result
        );
      }
      step(
        steps,
        'storage_remove',
        'ok',
        `removed_confirmed=${confirmedByData.size} tracked=${objectPaths.length}`
      );
    }
  } else {
    step(steps, 'storage_remove', 'skipped', 'no tracked objectPaths');
  }

  return { ok: true, aborted: false, steps };
}
