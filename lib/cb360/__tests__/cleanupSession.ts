/**
 * Staging itest cleanup helpers.
 * Only removes artifacts owned by the current test session / synthetic 2099 paths.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CB360_BUCKET } from '../paths';

export type CleanupTracked = {
  runIds: string[];
  versionIds: string[];
  objectPaths: string[];
  previousCurrent: {
    bundleId: string;
    sourceVersionId: string;
    identityMapsVersionId: string | null;
    userDecisionsVersionId: string | null;
    updatedByRunId: string | null;
  } | null;
  touchedCurrent: boolean;
};

/**
 * Synthetic itest object paths use calendar year 2099 as a non-production marker:
 *   snapshots/2099/MM/DD/run_<24hex>/…
 * Real baselines use baseline/…; real runs use real years (e.g. 2026).
 */
export const CB360_ITEST_OBJECT_PATH =
  /^snapshots\/2099\/\d{2}\/\d{2}\/run_[a-f0-9]{24}\/[A-Za-z0-9._-]+$/;

export function isCb360ItestObjectPath(objectPath: string): boolean {
  return CB360_ITEST_OBJECT_PATH.test(objectPath);
}

function sbError(
  step: string,
  error: { message: string } | null
): string | null {
  return error ? `${step}: ${error.message}` : null;
}

/**
 * FK-safe cleanup order:
 * 1) Release lease if held by a tracked run
 * 2) Clear/restore current_bundle if it points at our version or our run
 * 3) Delete scan_runs FIRST (FK → source_versions)
 * 4) Delete source_versions (tracked + discovery + narrow 2099 orphans)
 * 5) Remove storage objects
 *
 * Previous bug: versions were deleted while runs still referenced output_version_id;
 * PostgREST errors were ignored → orphan versions after runs deleted.
 */
export async function cleanupSession(
  client: SupabaseClient,
  tracked: CleanupTracked,
  sessionTag: string
): Promise<void> {
  const failures: string[] = [];

  const { data: lock, error: lockReadErr } = await client
    .from('cb360_lease_lock')
    .select('run_id, lease_generation')
    .eq('id', 1)
    .maybeSingle();
  const lockReadFail = sbError('lease_lock read', lockReadErr);
  if (lockReadFail) failures.push(lockReadFail);

  if (lock?.run_id && tracked.runIds.includes(lock.run_id)) {
    const { error } = await client
      .from('cb360_lease_lock')
      .update({
        run_id: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .eq('run_id', lock.run_id);
    const fail = sbError('lease_lock release', error);
    if (fail) failures.push(fail);
  }

  const { data: current, error: currentReadErr } = await client
    .from('cb360_current_bundle')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  const currentReadFail = sbError('current_bundle read', currentReadErr);
  if (currentReadFail) failures.push(currentReadFail);

  const currentIsOurs =
    !!current &&
    (tracked.versionIds.includes(current.source_version_id) ||
      (current.updated_by_run_id != null &&
        tracked.runIds.includes(current.updated_by_run_id)) ||
      tracked.touchedCurrent);

  if (current && currentIsOurs) {
    const canRestore =
      tracked.previousCurrent &&
      !tracked.versionIds.includes(tracked.previousCurrent.sourceVersionId);

    if (canRestore && tracked.previousCurrent) {
      const { error } = await client.from('cb360_current_bundle').upsert({
        id: 1,
        bundle_id: tracked.previousCurrent.bundleId,
        source_version_id: tracked.previousCurrent.sourceVersionId,
        identity_maps_version_id: tracked.previousCurrent.identityMapsVersionId,
        user_decisions_version_id:
          tracked.previousCurrent.userDecisionsVersionId,
        updated_by_run_id: tracked.previousCurrent.updatedByRunId,
        updated_at: new Date().toISOString(),
      });
      const fail = sbError('current_bundle restore', error);
      if (fail) failures.push(fail);
    } else {
      const { error } = await client
        .from('cb360_current_bundle')
        .delete()
        .eq('id', 1);
      const fail = sbError('current_bundle delete', error);
      if (fail) failures.push(fail);
    }
  }

  const versionIdSet = new Set<string>(tracked.versionIds);
  const objectPathSet = new Set<string>(tracked.objectPaths);

  if (tracked.runIds.length) {
    const { data: byRun, error } = await client
      .from('cb360_source_versions')
      .select('id, object_path')
      .in('created_by_run_id', tracked.runIds);
    const fail = sbError('versions by created_by_run_id', error);
    if (fail) failures.push(fail);
    for (const row of byRun ?? []) {
      versionIdSet.add(row.id);
      if (row.object_path) objectPathSet.add(row.object_path);
    }

    for (const runId of tracked.runIds) {
      const { data: byPath, error: pathErr } = await client
        .from('cb360_source_versions')
        .select('id, object_path')
        .like('object_path', `%/${runId}/%`);
      const pathFail = sbError(`versions by path runId`, pathErr);
      if (pathFail) failures.push(pathFail);
      for (const row of byPath ?? []) {
        if (row.object_path && isCb360ItestObjectPath(row.object_path)) {
          versionIdSet.add(row.id);
          objectPathSet.add(row.object_path);
        }
      }
    }
  }

  if (tracked.objectPaths.length) {
    const { data: byExact, error } = await client
      .from('cb360_source_versions')
      .select('id, object_path')
      .in('object_path', tracked.objectPaths);
    const fail = sbError('versions by object_path', error);
    if (fail) failures.push(fail);
    for (const row of byExact ?? []) {
      versionIdSet.add(row.id);
      if (row.object_path) objectPathSet.add(row.object_path);
    }
  }

  // 3) Delete runs FIRST (FK: scan_runs.output/base_version_id → source_versions)
  if (tracked.runIds.length) {
    const { error } = await client
      .from('cb360_scan_runs')
      .delete()
      .in('id', tracked.runIds);
    const fail = sbError('delete tracked runs', error);
    if (fail) failures.push(fail);
  }

  const { error: sessionRunErr } = await client
    .from('cb360_scan_runs')
    .delete()
    .like('requested_by', `cb360-${sessionTag}%`);
  const sessionRunFail = sbError('delete session-tagged runs', sessionRunErr);
  if (sessionRunFail) failures.push(sessionRunFail);

  // Narrow orphan sweep: synthetic year 2099 itest paths with no remaining refs
  {
    const { data: candidates, error } = await client
      .from('cb360_source_versions')
      .select('id, object_path')
      .like('object_path', 'snapshots/2099/%');
    const fail = sbError('list 2099 version candidates', error);
    if (fail) failures.push(fail);

    const { data: remainingRuns, error: runsErr } = await client
      .from('cb360_scan_runs')
      .select('id, base_version_id, output_version_id');
    const runsFail = sbError('list runs for FK check', runsErr);
    if (runsFail) failures.push(runsFail);

    const referenced = new Set<string>();
    for (const r of remainingRuns ?? []) {
      if (r.base_version_id) referenced.add(r.base_version_id);
      if (r.output_version_id) referenced.add(r.output_version_id);
    }

    const { data: currentAfter, error: curErr } = await client
      .from('cb360_current_bundle')
      .select(
        'source_version_id, identity_maps_version_id, user_decisions_version_id'
      )
      .eq('id', 1)
      .maybeSingle();
    const curFail = sbError('re-read current for FK check', curErr);
    if (curFail) failures.push(curFail);
    if (currentAfter?.source_version_id) {
      referenced.add(currentAfter.source_version_id);
    }
    if (currentAfter?.identity_maps_version_id) {
      referenced.add(currentAfter.identity_maps_version_id);
    }
    if (currentAfter?.user_decisions_version_id) {
      referenced.add(currentAfter.user_decisions_version_id);
    }

    for (const row of candidates ?? []) {
      if (
        row.object_path &&
        isCb360ItestObjectPath(row.object_path) &&
        !referenced.has(row.id)
      ) {
        versionIdSet.add(row.id);
        objectPathSet.add(row.object_path);
      }
    }
  }

  // 4) Delete versions after runs are gone
  const versionIds = [...versionIdSet];
  if (versionIds.length) {
    const { error } = await client
      .from('cb360_source_versions')
      .delete()
      .in('id', versionIds);
    const fail = sbError('delete source_versions', error);
    if (fail) failures.push(fail);
  }

  // 5) Storage — only itest paths or explicitly tracked paths
  const paths = [...objectPathSet].filter(
    (p) => isCb360ItestObjectPath(p) || tracked.objectPaths.includes(p)
  );
  if (paths.length) {
    const { error } = await client.storage.from(CB360_BUCKET).remove(paths);
    const fail = sbError('storage remove', error);
    if (fail) failures.push(fail);
  }

  if (failures.length) {
    throw new Error(
      `CB360 itest cleanup incomplete (${failures.length}): ${failures.join(' | ')}`
    );
  }
}
