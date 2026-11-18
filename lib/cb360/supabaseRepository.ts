import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cb360Repository, Cb360StartRunInput } from './repository';
import {
  Cb360Error,
  type Cb360CurrentBundle,
  type Cb360LeaseLock,
  type Cb360ScanRun,
  type Cb360SourceVersion,
} from './types';

type RunRow = {
  id: string;
  status: Cb360ScanRun['status'];
  mode: Cb360ScanRun['mode'];
  config_version: string | null;
  planned_brand_count: number | null;
  brand_results: Cb360ScanRun['brandResults'];
  brand_ok: number | null;
  brand_failed: number | null;
  brand_skipped: number | null;
  requested_by: string | null;
  lease_token_hash: string;
  lease_generation: number;
  lease_expires_at: string;
  base_version_id: string | null;
  base_sha256: string | null;
  output_version_id: string | null;
  output_sha256: string | null;
  output_object_path: string | null;
  logical_bundle_id: string;
  published: boolean;
  became_current: boolean;
  client_sha256: string | null;
  server_sha256: string | null;
  byte_size: number | null;
  error_code: string | null;
  notes: string | null;
  complete_payload_hash: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

type VersionRow = {
  id: string;
  kind: Cb360SourceVersion['kind'];
  artifact: Cb360SourceVersion['artifact'];
  object_path: string;
  sha256: string;
  byte_size: number;
  bundle_id: string;
  created_by_run_id: string | null;
  immutable: boolean;
  created_at: string;
};

function mapRun(row: RunRow): Cb360ScanRun {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    configVersion: row.config_version,
    plannedBrandCount: row.planned_brand_count,
    brandResults: row.brand_results ?? [],
    brandOk: row.brand_ok,
    brandFailed: row.brand_failed,
    brandSkipped: row.brand_skipped,
    requestedBy: row.requested_by,
    leaseTokenHash: row.lease_token_hash,
    leaseGeneration: row.lease_generation,
    leaseExpiresAt: row.lease_expires_at,
    baseVersionId: row.base_version_id,
    baseSha256: row.base_sha256,
    outputVersionId: row.output_version_id,
    outputSha256: row.output_sha256,
    outputObjectPath: row.output_object_path,
    logicalBundleId: row.logical_bundle_id,
    published: row.published,
    becameCurrent: row.became_current,
    clientSha256: row.client_sha256,
    serverSha256: row.server_sha256,
    byteSize: row.byte_size,
    errorCode: row.error_code,
    notes: row.notes,
    completePayloadHash: row.complete_payload_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

function mapVersion(row: VersionRow): Cb360SourceVersion {
  return {
    id: row.id,
    kind: row.kind,
    artifact: row.artifact,
    objectPath: row.object_path,
    sha256: row.sha256,
    byteSize: row.byte_size,
    bundleId: row.bundle_id,
    createdByRunId: row.created_by_run_id,
    immutable: row.immutable,
    createdAt: row.created_at,
  };
}

function mapLock(row: {
  id: number;
  run_id: string | null;
  lease_generation: number;
  lease_expires_at: string | null;
  updated_at: string;
}): Cb360LeaseLock {
  return {
    id: 1,
    runId: row.run_id,
    leaseGeneration: row.lease_generation,
    leaseExpiresAt: row.lease_expires_at,
    updatedAt: row.updated_at,
  };
}

function mapBundle(row: {
  id: number;
  bundle_id: string;
  source_version_id: string;
  identity_maps_version_id: string | null;
  user_decisions_version_id: string | null;
  updated_at: string;
  updated_by_run_id: string | null;
}): Cb360CurrentBundle {
  return {
    id: 1,
    bundleId: row.bundle_id,
    sourceVersionId: row.source_version_id,
    identityMapsVersionId: row.identity_maps_version_id,
    userDecisionsVersionId: row.user_decisions_version_id,
    updatedAt: row.updated_at,
    updatedByRunId: row.updated_by_run_id,
  };
}

export function throwFromPg(message: string): never {
  if (message.includes('cb360_active_run_exists')) {
    throw new Cb360Error('active_run_exists', 'Aktif run var', 409);
  }
  if (message.includes('cb360_stale_base')) {
    throw new Cb360Error('stale_base', 'Stale base during publish', 409);
  }
  if (message.includes('cb360_forbidden_lease')) {
    throw new Cb360Error('forbidden_lease', 'Lease fencing failed', 403);
  }
  if (message.includes('cb360_lease_expired')) {
    throw new Cb360Error('lease_expired', 'Lease expired', 410);
  }
  if (message.includes('cb360_invalid_payload')) {
    throw new Cb360Error('invalid_payload', 'Geçersiz heartbeat payload', 400);
  }
  if (message.includes('cb360_not_found')) {
    throw new Cb360Error('not_found', 'Run bulunamadı', 404);
  }
  if (message.includes('cb360_idempotent_replay')) {
    throw new Cb360Error(
      'idempotent_replay',
      'Farklı payload ile tekrar publish reddedildi',
      409
    );
  }
  if (message.includes('cb360_already_terminal')) {
    throw new Cb360Error('already_terminal', 'Run zaten terminal durumda', 409);
  }
  throw new Cb360Error('internal', message, 500);
}

export function createSupabaseRepository(client: SupabaseClient): Cb360Repository {
  return {
    async getLeaseLock() {
      const { data, error } = await client
        .from('cb360_lease_lock')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw new Cb360Error('internal', error.message, 500);
      if (!data) {
        return {
          id: 1,
          runId: null,
          leaseGeneration: 0,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        };
      }
      return mapLock(data);
    },

    async tryStartRun(input: Cb360StartRunInput) {
      const { data, error } = await client.rpc('cb360_try_start_run', {
        p_run_id: input.runId,
        p_lease_token_hash: input.leaseTokenHash,
        p_lease_expires_at: input.leaseExpiresAt,
        p_mode: input.mode,
        p_config_version: input.configVersion,
        p_planned_brand_count: input.plannedBrandCount,
        p_requested_by: input.requestedBy,
        p_logical_bundle_id: input.logicalBundleId,
        p_base_version_id: input.baseVersionId,
        p_base_sha256: input.baseSha256,
      });

      if (error) throwFromPg(error.message);

      const result = data as {
        run_id: string;
        lease_generation: number;
        lease_expires_at: string;
      };

      const run = await this.getRun(result.run_id);
      if (!run) {
        throw new Cb360Error('internal', 'Start sonrası run okunamadı', 500);
      }
      return run;
    },

    async heartbeatRun({ runId, leaseTokenHash, leaseExpiresAt }) {
      const { data, error } = await client.rpc('cb360_heartbeat_run', {
        p_run_id: runId,
        p_lease_token_hash: leaseTokenHash,
        p_lease_expires_at: leaseExpiresAt,
      });
      if (error) throwFromPg(error.message);
      const rpc = data as {
        lease_expires_at: string;
        status: string;
        lease_generation: number;
      };
      return {
        leaseExpiresAt: rpc.lease_expires_at,
        status: rpc.status,
        leaseGeneration: rpc.lease_generation,
      };
    },

    async releaseLease({ runId, leaseGeneration }) {
      await client
        .from('cb360_lease_lock')
        .update({
          run_id: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
        .eq('run_id', runId)
        .eq('lease_generation', leaseGeneration);
    },

    async getRun(runId) {
      const { data, error } = await client
        .from('cb360_scan_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle();
      if (error) throw new Cb360Error('internal', error.message, 500);
      return data ? mapRun(data as RunRow) : null;
    },

    async updateRun(runId, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.brandResults !== undefined) row.brand_results = patch.brandResults;
      if (patch.brandOk !== undefined) row.brand_ok = patch.brandOk;
      if (patch.brandFailed !== undefined) row.brand_failed = patch.brandFailed;
      if (patch.brandSkipped !== undefined) row.brand_skipped = patch.brandSkipped;
      if (patch.leaseExpiresAt !== undefined) row.lease_expires_at = patch.leaseExpiresAt;
      if (patch.outputVersionId !== undefined) row.output_version_id = patch.outputVersionId;
      if (patch.outputSha256 !== undefined) row.output_sha256 = patch.outputSha256;
      if (patch.outputObjectPath !== undefined) {
        row.output_object_path = patch.outputObjectPath;
      }
      if (patch.published !== undefined) row.published = patch.published;
      if (patch.becameCurrent !== undefined) row.became_current = patch.becameCurrent;
      if (patch.clientSha256 !== undefined) row.client_sha256 = patch.clientSha256;
      if (patch.serverSha256 !== undefined) row.server_sha256 = patch.serverSha256;
      if (patch.byteSize !== undefined) row.byte_size = patch.byteSize;
      if (patch.errorCode !== undefined) row.error_code = patch.errorCode;
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (patch.completePayloadHash !== undefined) {
        row.complete_payload_hash = patch.completePayloadHash;
      }
      if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
      if (patch.plannedBrandCount !== undefined) {
        row.planned_brand_count = patch.plannedBrandCount;
      }

      const { data, error } = await client
        .from('cb360_scan_runs')
        .update(row)
        .eq('id', runId)
        .select('*')
        .single();
      if (error) throw new Cb360Error('internal', error.message, 500);
      return mapRun(data as RunRow);
    },

    async getCurrentBundle() {
      const { data, error } = await client
        .from('cb360_current_bundle')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw new Cb360Error('internal', error.message, 500);
      return data ? mapBundle(data) : null;
    },

    async getVersion(id) {
      const { data, error } = await client
        .from('cb360_source_versions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Cb360Error('internal', error.message, 500);
      return data ? mapVersion(data as VersionRow) : null;
    },

    async insertVersion(version) {
      const { data, error } = await client
        .from('cb360_source_versions')
        .insert({
          id: version.id,
          kind: version.kind,
          artifact: version.artifact,
          object_path: version.objectPath,
          sha256: version.sha256,
          byte_size: version.byteSize,
          bundle_id: version.bundleId,
          created_by_run_id: version.createdByRunId,
          immutable: version.immutable,
        })
        .select('*')
        .single();
      if (error) throw new Cb360Error('internal', error.message, 500);
      return mapVersion(data as VersionRow);
    },

    async publishBundle({
      run,
      outputVersion,
      expectedBaseVersionId,
      completePayloadHash,
    }) {
      const { data, error } = await client.rpc('cb360_publish_bundle', {
        p_run_id: run.id,
        p_lease_generation: run.leaseGeneration,
        p_expected_base_version_id: expectedBaseVersionId,
        p_version_id: outputVersion.id,
        p_version_kind: outputVersion.kind,
        p_artifact: outputVersion.artifact,
        p_object_path: outputVersion.objectPath,
        p_sha256: outputVersion.sha256,
        p_byte_size: outputVersion.byteSize,
        p_bundle_id: outputVersion.bundleId,
        p_complete_payload_hash: completePayloadHash,
      });

      if (error) throwFromPg(error.message);

      const rpc = data as { idempotent?: boolean; output_version_id?: string };
      const updated = await this.getRun(run.id);
      const bundle = await this.getCurrentBundle();
      if (!updated || !bundle) {
        throw new Cb360Error('internal', 'Publish sonrası state okunamadı', 500);
      }

      return {
        run: updated,
        bundle,
        idempotent: Boolean(rpc?.idempotent),
      };
    },
  };
}
