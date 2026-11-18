import type { Cb360Artifact } from './types';
import { Cb360Error } from './types';

export const CB360_BUCKET = 'cb360-private';

/** SDK-documented TTL for createSignedUploadUrl (fixed ~2h). */
export const CB360_SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

/** Default download signed URL TTL — renew via download-url endpoint. */
export const CB360_SIGNED_DOWNLOAD_TTL_SECONDS = 15 * 60;

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function assertSafeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value) || value.includes('..')) {
    throw new Cb360Error('invalid_payload', `Geçersiz path segment: ${label}`);
  }
  return value;
}

/**
 * Immutable snapshot path:
 * snapshots/YYYY/MM/DD/{runId}/{artifactFile}
 * Never overwrite — path includes runId.
 */
export function buildImmutableObjectPath(params: {
  runId: string;
  at?: Date;
  artifact: Cb360Artifact;
}): string {
  const at = params.at ?? new Date();
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(at.getUTCDate()).padStart(2, '0');
  const runId = assertSafeSegment(params.runId, 'runId');

  const fileByArtifact: Record<Cb360Artifact, string> = {
    source_xlsx: 'source.xlsx',
    identity_maps: 'identity_maps.json',
    user_decisions: 'user_decisions.json',
    manifest: 'manifest.json',
  };

  return `snapshots/${yyyy}/${mm}/${dd}/${runId}/${fileByArtifact[params.artifact]}`;
}

export function buildBaselineObjectPath(artifact: Cb360Artifact = 'source_xlsx'): string {
  const fileByArtifact: Record<Cb360Artifact, string> = {
    source_xlsx: 'source.xlsx',
    identity_maps: 'identity_maps.json',
    user_decisions: 'user_decisions.json',
    manifest: 'manifest.json',
  };
  return `baseline/${fileByArtifact[artifact]}`;
}
