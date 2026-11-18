/** CB360 machine-API types — no PII fields by design. */

export type Cb360RunStatus =
  | 'started'
  | 'running'
  | 'uploading'
  | 'verifying'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'rejected_integrity'
  | 'rejected_policy'
  | 'aborted_lease'
  | 'aborted';

export type Cb360RunMode = 'synthetic' | 'production';

export type Cb360Artifact =
  | 'source_xlsx'
  | 'identity_maps'
  | 'user_decisions'
  | 'manifest';

export type Cb360VersionKind = 'baseline' | 'snapshot' | 'backup' | 'state';

export type Cb360BrandOutcome = 'ok' | 'failed' | 'skipped';

export type Cb360BrandResult = {
  brandId: string;
  outcome: Cb360BrandOutcome;
  /** Machine-safe reason code only — never free-text PII */
  reasonCode?: string;
};

export const CB360_ACTIVE_STATUSES: readonly Cb360RunStatus[] = [
  'started',
  'running',
  'uploading',
  'verifying',
] as const;

export const CB360_TERMINAL_STATUSES: readonly Cb360RunStatus[] = [
  'completed',
  'partial',
  'failed',
  'rejected_integrity',
  'rejected_policy',
  'aborted_lease',
  'aborted',
] as const;

export type Cb360SourceVersion = {
  id: string;
  kind: Cb360VersionKind;
  artifact: Cb360Artifact;
  objectPath: string;
  sha256: string;
  byteSize: number;
  bundleId: string;
  createdByRunId: string | null;
  immutable: boolean;
  createdAt: string;
};

export type Cb360ScanRun = {
  id: string;
  status: Cb360RunStatus;
  mode: Cb360RunMode;
  configVersion: string | null;
  plannedBrandCount: number | null;
  brandResults: Cb360BrandResult[];
  brandOk: number | null;
  brandFailed: number | null;
  brandSkipped: number | null;
  requestedBy: string | null;
  leaseTokenHash: string;
  leaseGeneration: number;
  leaseExpiresAt: string;
  baseVersionId: string | null;
  baseSha256: string | null;
  outputVersionId: string | null;
  outputSha256: string | null;
  outputObjectPath: string | null;
  logicalBundleId: string;
  published: boolean;
  becameCurrent: boolean;
  clientSha256: string | null;
  serverSha256: string | null;
  byteSize: number | null;
  errorCode: string | null;
  notes: string | null;
  completePayloadHash: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type Cb360CurrentBundle = {
  id: 1;
  bundleId: string;
  sourceVersionId: string;
  identityMapsVersionId: string | null;
  userDecisionsVersionId: string | null;
  updatedAt: string;
  updatedByRunId: string | null;
};

export type Cb360LeaseLock = {
  id: 1;
  runId: string | null;
  leaseGeneration: number;
  leaseExpiresAt: string | null;
  updatedAt: string;
};

export type Cb360ApiErrorCode =
  | 'unauthorized'
  | 'forbidden_lease'
  | 'lease_expired'
  | 'active_run_exists'
  /** @deprecated use active_run_exists */
  | 'lease_busy'
  | 'not_found'
  | 'invalid_payload'
  | 'hash_mismatch'
  | 'stale_base'
  | 'partial_not_publishable'
  | 'idempotent_replay'
  | 'already_terminal'
  | 'storage_error'
  | 'config_missing'
  | 'environment_blocked'
  | 'internal';

export class Cb360Error extends Error {
  readonly code: Cb360ApiErrorCode;
  readonly httpStatus: number;

  constructor(code: Cb360ApiErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'Cb360Error';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
