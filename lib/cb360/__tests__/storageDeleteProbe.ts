/**
 * Isolated Staging Storage delete-visibility probe.
 *
 * Measures one synthetic object: 1 upload + 1 remove, then bounded
 * download/list polls. No CB360 DB tables, no Preview HTTP, no second remove.
 *
 * Default mode is dry-run (zero network). Live mutate requires explicit execute
 * via CLI factories — this module never creates Supabase clients.
 */
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import {
  assertCb360StagingTarget,
  extractSupabaseProjectRef,
} from './stagingGuard';

export const CB360_STORAGE_DELETE_PROBE_STAGING_REF = 'noagxyztimvefmewjybj';
export const CB360_STORAGE_DELETE_PROBE_BUCKET = CB360_BUCKET;
export const CB360_STORAGE_DELETE_PROBE_TRACKER_DIR = '.cb360-preview-e2e';
export const CB360_STORAGE_DELETE_PROBE_MAX_BYTES = 64;

/**
 * Cell A — service-role upload options.
 * Intentionally differs from cell B / Preview E2E signed PUT (`max-age=3600`).
 */
export const CB360_STORAGE_DELETE_PROBE_UPLOAD_OPTIONS = {
  upsert: false as const,
  contentType: 'application/octet-stream',
  cacheControl: '0',
};

/**
 * Cell B — signed PUT headers (must match createPreviewHttpE2eSignedUploader).
 * Values only; never log URLs or upload tokens.
 */
export const CB360_STORAGE_DELETE_PROBE_CELL_B_PUT_HEADERS = {
  'Content-Type': 'application/octet-stream',
  'cache-control': 'max-age=3600',
  'x-upsert': 'false',
} as const;

/** Elapsed seconds after remove when download/list are sampled. */
export const CB360_STORAGE_DELETE_PROBE_POLL_SECONDS: readonly number[] = [
  0, 0.5, 1.5, 3, 5, 10, 30, 60,
];

const PROBE_OBJECT_PATH_RE = /^pe2e_probe\/[A-Za-z0-9_-]+\/probe\.bin$/;
const PROBE_SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;
/** Forbid credential-like keys; bare "signed" catches signedUrl/token leaks. */
const FORBIDDEN_TRACKER_KEYS =
  /secret|token|password|authorization|service.?role|api.?key|bearer|signed/i;

export type StorageDeleteProbeMode = 'dry-run' | 'execute';

/**
 * A = service_role upload (cacheControl 0)
 * B = createSignedUploadUrl + PUT max-age=3600
 * C = B upload + one service_role GET before remove (complete-path mirror)
 */
export type StorageDeleteProbeCell = 'A' | 'B' | 'C';

export type StorageDeleteProbeArgv = {
  mode: StorageDeleteProbeMode;
  cell: StorageDeleteProbeCell;
};

export type StorageDeleteProbePhase =
  | 'planned'
  | 'uploaded'
  | 'pre_remove_get'
  | 'removed'
  | 'polling'
  | 'done'
  | 'failed'
  | 'orphan_at_60s';

export type StorageDeleteProbeVerdict = 'DRY-RUN' | 'GO' | 'NO-GO';

export type StorageDeleteProbeStepStatus =
  | 'ok'
  | 'planned'
  | 'failed'
  | 'aborted';

export type StorageDeleteProbeStep = {
  step: string;
  status: StorageDeleteProbeStepStatus;
  detail: string;
};

export type StorageRemoveEntrySummary = {
  name: string;
};

export type StorageRemoveResponseSummary = {
  errorMessage: string | null;
  dataRowCount: number;
  names: StorageRemoveEntrySummary[];
  matchedTrackedPath: boolean;
};

export type StorageDeleteProbeObservation = {
  elapsedSec: number;
  wallClock: string;
  downloadExists: boolean;
  downloadErrorClass: string | null;
  listExists: boolean;
  listErrorClass: string | null;
  divergent: boolean;
};

export type StorageDeleteProbeTracker = {
  kind: 'storage_delete_probe';
  cell: StorageDeleteProbeCell;
  sessionId: string;
  projectRefExpected: string;
  bucket: string;
  objectPath: string;
  folderPath: string;
  byteSize: number;
  phase: StorageDeleteProbePhase;
  removeSummary: StorageRemoveResponseSummary | null;
  timeline: StorageDeleteProbeObservation[];
  firstDownloadAbsentElapsedSec: number | null;
  firstListAbsentElapsedSec: number | null;
  divergenceObserved: boolean;
  stillPresentAt60s: boolean;
  uploadCallCount: number;
  preRemoveGetCallCount: number;
  preRemoveGetMatched: boolean | null;
  removeCallCount: number;
  verdict: StorageDeleteProbeVerdict;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
};

export type StorageDeleteProbeResult = {
  ok: boolean;
  mode: StorageDeleteProbeMode;
  cell: StorageDeleteProbeCell;
  aborted: boolean;
  sessionId: string | null;
  objectPath: string | null;
  verdict: StorageDeleteProbeVerdict;
  steps: StorageDeleteProbeStep[];
  timeline: StorageDeleteProbeObservation[];
  removeSummary: StorageRemoveResponseSummary | null;
  preRemoveGetCallCount: number;
  preRemoveGetMatched: boolean | null;
  firstDownloadAbsentElapsedSec: number | null;
  firstListAbsentElapsedSec: number | null;
  divergenceObserved: boolean;
  stillPresentAt60s: boolean;
  error: string | null;
};

export type StorageDeleteProbeStorage = {
  /** Cell A only — direct service-role upload (cacheControl 0). */
  upload: (
    objectPath: string,
    bytes: Uint8Array
  ) => Promise<{ error: { message: string } | null }>;
  /**
   * Cells B and C — createSignedUploadUrl + PUT with E2E headers.
   * Must never return or log URL/token material.
   */
  uploadViaSignedPut?: (
    objectPath: string,
    bytes: Uint8Array
  ) => Promise<{ error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<{
    data: Array<{ name?: string | null }> | null;
    error: { message: string } | null;
  }>;
  download: (
    objectPath: string
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  list: (
    folderPath: string
  ) => Promise<{
    data: Array<{ name?: string | null }> | null;
    error: { message: string } | null;
  }>;
};

export type StorageDeleteProbeFs = {
  writeTrackerAtomic: (tracker: StorageDeleteProbeTracker) => Promise<void>;
};

export type StorageDeleteProbeDeps = {
  env: Cb360EnvBag;
  storage: StorageDeleteProbeStorage;
  fs: StorageDeleteProbeFs;
  cell?: StorageDeleteProbeCell;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  createSessionId?: () => string;
  pollSeconds?: readonly number[];
};

export class StorageDeleteProbeGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageDeleteProbeGateError';
  }
}

function pushStep(
  steps: StorageDeleteProbeStep[],
  step: string,
  status: StorageDeleteProbeStepStatus,
  detail: string
): void {
  steps.push({ step, status, detail });
}

async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function assignProbeCell(
  current: StorageDeleteProbeCell | null,
  next: StorageDeleteProbeCell
): StorageDeleteProbeCell {
  if (current && current !== next) {
    throw new StorageDeleteProbeGateError('Pass only one --cell value');
  }
  return next;
}

export function parseStorageDeleteProbeCell(
  argv: readonly string[]
): StorageDeleteProbeCell {
  let cell: StorageDeleteProbeCell | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--cell-a' || arg === '--cell=A') {
      cell = assignProbeCell(cell, 'A');
      continue;
    }
    if (arg === '--cell-b' || arg === '--cell=B') {
      cell = assignProbeCell(cell, 'B');
      continue;
    }
    if (arg === '--cell-c' || arg === '--cell=C') {
      cell = assignProbeCell(cell, 'C');
      continue;
    }
    if (arg === '--cell') {
      const value = argv[i + 1];
      if (value !== 'A' && value !== 'B' && value !== 'C') {
        throw new StorageDeleteProbeGateError(
          'Expected --cell A, --cell B, or --cell C'
        );
      }
      cell = assignProbeCell(cell, value);
      i += 1;
    }
  }
  return cell ?? 'A';
}

/** Convert storage.download() payload to bytes for equality checks (cell C). */
export async function probeDownloadDataToBytes(
  data: unknown
): Promise<Uint8Array | null> {
  if (data == null) return null;
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

export function probeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function parseStorageDeleteProbeArgv(
  argv: readonly string[]
): StorageDeleteProbeArgv {
  const hasExecute = argv.includes('--execute');
  if (hasExecute && argv.includes('--dry-run')) {
    throw new StorageDeleteProbeGateError(
      'Pass only one of --execute or --dry-run'
    );
  }
  const cell = parseStorageDeleteProbeCell(argv);
  return {
    mode: hasExecute ? 'execute' : 'dry-run',
    cell,
  };
}

export function createProbeSessionId(now = () => new Date()): string {
  const t = now().getTime().toString(36);
  const r = randomBytes(4).toString('hex');
  return `probe_${t}_${r}`;
}

export function buildProbeObjectPath(sessionId: string): string {
  const id = sessionId.trim();
  if (!id || !PROBE_SESSION_ID_RE.test(id) || id.includes('..')) {
    throw new StorageDeleteProbeGateError('Invalid probe sessionId');
  }
  const objectPath = `pe2e_probe/${id}/probe.bin`;
  assertProbeObjectPath(objectPath);
  return objectPath;
}

export function probeFolderPath(objectPath: string): string {
  assertProbeObjectPath(objectPath);
  return objectPath.slice(0, objectPath.lastIndexOf('/'));
}

export function assertProbeObjectPath(objectPath: string): void {
  const p = objectPath.replace(/^\/+/, '').trim();
  if (!PROBE_OBJECT_PATH_RE.test(p)) {
    throw new StorageDeleteProbeGateError(
      'Probe path must match pe2e_probe/<sessionId>/probe.bin'
    );
  }
  if (p.includes('..') || p.toLowerCase().includes('source.xlsx')) {
    throw new StorageDeleteProbeGateError('Refusing unsafe probe path');
  }
}

export function buildSyntheticProbeBytes(sessionId: string): Uint8Array {
  const raw = Buffer.from(`cb360-probe:${sessionId}`, 'utf8');
  if (raw.byteLength <= CB360_STORAGE_DELETE_PROBE_MAX_BYTES) {
    return new Uint8Array(raw);
  }
  return new Uint8Array(raw.subarray(0, CB360_STORAGE_DELETE_PROBE_MAX_BYTES));
}

export function summarizeRemoveResponse(
  data: Array<{ name?: string | null }> | null | undefined,
  error: { message: string } | null | undefined,
  trackedPath: string
): StorageRemoveResponseSummary {
  const names: StorageRemoveEntrySummary[] = [];
  if (Array.isArray(data)) {
    for (const entry of data) {
      const name = String(entry?.name ?? '')
        .replace(/^\/+/, '')
        .trim()
        .slice(0, 200);
      if (name) names.push({ name });
    }
  }
  const tracked = trackedPath.replace(/^\/+/, '').trim();
  const base = tracked.includes('/')
    ? tracked.slice(tracked.lastIndexOf('/') + 1)
    : tracked;
  const matchedTrackedPath = names.some(
    (n) =>
      n.name === tracked ||
      n.name === base ||
      n.name.endsWith(`/${tracked}`) ||
      n.name.endsWith(tracked)
  );
  return {
    errorMessage: error?.message
      ? String(error.message).slice(0, 200)
      : null,
    dataRowCount: Array.isArray(data) ? data.length : 0,
    names,
    matchedTrackedPath,
  };
}

function classifyStorageError(
  error: { message: string } | null | undefined
): string | null {
  if (!error?.message) return null;
  const msg = error.message.toLowerCase();
  if (msg.includes('not found') || msg.includes('404')) return 'not_found';
  return 'other';
}

export function assertStorageDeleteProbeFailClosed(
  env: Cb360EnvBag,
  expectedRef = CB360_STORAGE_DELETE_PROBE_STAGING_REF
): { projectRef: string } {
  if (env.VERCEL_ENV === 'production') {
    throw new StorageDeleteProbeGateError(
      'Storage delete probe blocked: VERCEL_ENV=production'
    );
  }
  const target = assertCb360StagingTarget(env);
  if (target.projectRef !== expectedRef) {
    throw new StorageDeleteProbeGateError(
      `Refusing non-allowlisted Staging project ref; expected=${expectedRef}`
    );
  }
  const urlRef = extractSupabaseProjectRef(
    env.CB360_STAGING_SUPABASE_URL?.trim() ?? ''
  );
  if (urlRef !== expectedRef) {
    throw new StorageDeleteProbeGateError('Staging URL ref mismatch');
  }
  return { projectRef: target.projectRef };
}

export function assertProbeTrackerHasNoSecrets(
  tracker: StorageDeleteProbeTracker
): void {
  const json = JSON.stringify(tracker);
  if (FORBIDDEN_TRACKER_KEYS.test(json)) {
    throw new StorageDeleteProbeGateError(
      'Probe tracker must not contain secret-like fields'
    );
  }
}

export function createProbeTrackerFs(
  trackerDir = path.join(process.cwd(), CB360_STORAGE_DELETE_PROBE_TRACKER_DIR)
): StorageDeleteProbeFs {
  return {
    async writeTrackerAtomic(tracker) {
      assertProbeTrackerHasNoSecrets(tracker);
      await fs.mkdir(trackerDir, { recursive: true });
      const file = path.join(trackerDir, `${tracker.sessionId}.json`);
      const tmp = path.join(
        trackerDir,
        `.${tracker.sessionId}.${process.pid}.${Date.now()}.tmp`
      );
      const payload = `${JSON.stringify(tracker, null, 2)}\n`;
      await fs.writeFile(tmp, payload, { encoding: 'utf8', flag: 'w' });
      await fs.rename(tmp, file);
    },
  };
}

function listContainsProbeBin(
  entries: Array<{ name?: string | null }> | null | undefined
): boolean {
  if (!Array.isArray(entries)) return false;
  return entries.some((e) => {
    const name = String(e?.name ?? '')
      .replace(/^\/+/, '')
      .trim();
    return name === 'probe.bin' || name.endsWith('/probe.bin');
  });
}

function cellUploadPlan(cell: StorageDeleteProbeCell): string {
  if (cell === 'A') {
    return 'upload=cell_a_service_role; cacheControl=0; preRemoveGet=0; remove=service_role_exact';
  }
  if (cell === 'B') {
    return 'upload=cell_b_put; cache-control=max-age=3600; preRemoveGet=0; remove=service_role_exact';
  }
  return 'upload=cell_b_put; cache-control=max-age=3600; preRemoveGet=1; remove=service_role_exact';
}

/**
 * Dry-run: plan only. Execute: requires injected deps (tests or CLI live factory).
 * A: service-role upload. B: signed PUT. C: B + one pre-remove GET.
 */
export async function runStorageDeleteProbe(options: {
  mode: StorageDeleteProbeMode;
  cell?: StorageDeleteProbeCell;
  deps?: StorageDeleteProbeDeps;
}): Promise<StorageDeleteProbeResult> {
  const { mode } = options;
  const cell: StorageDeleteProbeCell = options.cell ?? options.deps?.cell ?? 'A';
  const steps: StorageDeleteProbeStep[] = [];

  if (mode === 'dry-run') {
    const sessionId = 'probe_dry_run_example';
    const objectPath = buildProbeObjectPath(sessionId);
    pushStep(
      steps,
      'fail_closed',
      'planned',
      `ref=${CB360_STORAGE_DELETE_PROBE_STAGING_REF}; production blocked`
    );
    pushStep(
      steps,
      'plan',
      'planned',
      `cell=${cell}; bucket=${CB360_STORAGE_DELETE_PROBE_BUCKET}; path=${objectPath}; maxBytes=${CB360_STORAGE_DELETE_PROBE_MAX_BYTES}; ${cellUploadPlan(cell)}; uploadCount=1; removeCount=1`
    );
    pushStep(
      steps,
      'poll_schedule',
      'planned',
      `elapsedSec=${CB360_STORAGE_DELETE_PROBE_POLL_SECONDS.join(',')}`
    );
    pushStep(
      steps,
      'policy',
      'planned',
      'no second remove; no prefix sweep; no DB; no Preview HTTP; no URL/token in tracker'
    );
    return {
      ok: true,
      mode,
      cell,
      aborted: false,
      sessionId: null,
      objectPath,
      verdict: 'DRY-RUN',
      steps,
      timeline: [],
      removeSummary: null,
      preRemoveGetCallCount: 0,
      preRemoveGetMatched: null,
      firstDownloadAbsentElapsedSec: null,
      firstListAbsentElapsedSec: null,
      divergenceObserved: false,
      stillPresentAt60s: false,
      error: null,
    };
  }

  const deps = options.deps;
  if (!deps) {
    throw new StorageDeleteProbeGateError(
      'execute requires deps (storage, fs, env)'
    );
  }

  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const pollSeconds =
    deps.pollSeconds ?? CB360_STORAGE_DELETE_PROBE_POLL_SECONDS;
  const startedAt = now().toISOString();

  let sessionId = '';
  let objectPath = '';
  let folderPath = '';
  let tracker: StorageDeleteProbeTracker | null = null;
  let uploadCallCount = 0;
  let preRemoveGetCallCount = 0;
  let preRemoveGetMatched: boolean | null = null;
  let removeCallCount = 0;
  let removeSummary: StorageRemoveResponseSummary | null = null;
  const timeline: StorageDeleteProbeObservation[] = [];

  const persist = async (
    phase: StorageDeleteProbePhase,
    patch: Partial<StorageDeleteProbeTracker> = {}
  ): Promise<void> => {
    if (!tracker) return;
    tracker = {
      ...tracker,
      ...patch,
      phase,
      uploadCallCount,
      preRemoveGetCallCount,
      preRemoveGetMatched,
      removeCallCount,
      updatedAt: now().toISOString(),
    };
    await deps.fs.writeTrackerAtomic(tracker);
    pushStep(steps, 'tracker_persist', 'ok', `phase=${phase}`);
  };

  try {
    const { projectRef } = assertStorageDeleteProbeFailClosed(deps.env);
    pushStep(steps, 'fail_closed', 'ok', `ref=${projectRef}; cell=${cell}`);

    sessionId = (deps.createSessionId ?? createProbeSessionId)();
    objectPath = buildProbeObjectPath(sessionId);
    folderPath = probeFolderPath(objectPath);
    const bytes = buildSyntheticProbeBytes(sessionId);
    if (bytes.byteLength === 0 || bytes.byteLength > CB360_STORAGE_DELETE_PROBE_MAX_BYTES) {
      throw new StorageDeleteProbeGateError('Synthetic probe bytes out of bounds');
    }

    tracker = {
      kind: 'storage_delete_probe',
      cell,
      sessionId,
      projectRefExpected: projectRef,
      bucket: CB360_STORAGE_DELETE_PROBE_BUCKET,
      objectPath,
      folderPath,
      byteSize: bytes.byteLength,
      phase: 'planned',
      removeSummary: null,
      timeline: [],
      firstDownloadAbsentElapsedSec: null,
      firstListAbsentElapsedSec: null,
      divergenceObserved: false,
      stillPresentAt60s: false,
      uploadCallCount: 0,
      preRemoveGetCallCount: 0,
      preRemoveGetMatched: null,
      removeCallCount: 0,
      verdict: 'NO-GO',
      lastError: null,
      startedAt,
      updatedAt: startedAt,
    };
    assertProbeTrackerHasNoSecrets(tracker);
    await persist('planned');

    // Exactly one upload (A: service_role; B/C: signed PUT). Never both methods.
    uploadCallCount += 1;
    if (uploadCallCount !== 1) {
      throw new StorageDeleteProbeGateError('upload budget exceeded');
    }
    let up: { error: { message: string } | null };
    if (cell === 'B' || cell === 'C') {
      if (!deps.storage.uploadViaSignedPut) {
        throw new StorageDeleteProbeGateError(
          `cell ${cell} requires storage.uploadViaSignedPut`
        );
      }
      up = await deps.storage.uploadViaSignedPut(objectPath, bytes);
    } else {
      up = await deps.storage.upload(objectPath, bytes);
    }
    if (up.error) {
      throw new StorageDeleteProbeGateError(
        `upload failed: ${up.error.message.slice(0, 200)}`
      );
    }
    pushStep(
      steps,
      'upload',
      'ok',
      `cell=${cell}; path=${objectPath}; bytes=${bytes.byteLength}`
    );
    await persist('uploaded');

    // Cell C only: exactly one pre-remove GET (mirrors complete downloadAndHash).
    if (cell === 'C') {
      preRemoveGetCallCount += 1;
      if (preRemoveGetCallCount !== 1) {
        throw new StorageDeleteProbeGateError('pre-remove GET budget exceeded');
      }
      const pre = await deps.storage.download(objectPath);
      if (pre.error || pre.data == null) {
        throw new StorageDeleteProbeGateError(
          `pre_remove_get failed: ${(pre.error?.message ?? 'missing').slice(0, 200)}`
        );
      }
      const got = await probeDownloadDataToBytes(pre.data);
      if (!got || !probeBytesEqual(got, bytes)) {
        preRemoveGetMatched = false;
        throw new StorageDeleteProbeGateError(
          'pre_remove_get payload mismatch vs synthetic upload'
        );
      }
      preRemoveGetMatched = true;
      pushStep(
        steps,
        'pre_remove_get',
        'ok',
        `matched=true; bytes=${got.byteLength}`
      );
      await persist('pre_remove_get');
    } else {
      preRemoveGetCallCount = 0;
      preRemoveGetMatched = null;
    }

    // Exactly one remove — never retried.
    removeCallCount += 1;
    if (removeCallCount !== 1) {
      throw new StorageDeleteProbeGateError('remove budget exceeded');
    }
    const removed = await deps.storage.remove([objectPath]);
    removeSummary = summarizeRemoveResponse(
      removed.data,
      removed.error,
      objectPath
    );
    if (removed.error) {
      await persist('failed', {
        removeSummary,
        lastError: `remove_api_error; ${removeSummary.errorMessage}`,
        verdict: 'NO-GO',
      });
      pushStep(
        steps,
        'remove',
        'failed',
        `error=${removeSummary.errorMessage}; dataRows=${removeSummary.dataRowCount}`
      );
      return {
        ok: false,
        mode,
        cell,
        aborted: false,
        sessionId,
        objectPath,
        verdict: 'NO-GO',
        steps,
        timeline,
        removeSummary,
        preRemoveGetCallCount,
        preRemoveGetMatched,
        firstDownloadAbsentElapsedSec: null,
        firstListAbsentElapsedSec: null,
        divergenceObserved: false,
        stillPresentAt60s: true,
        error: removeSummary.errorMessage,
      };
    }
    pushStep(
      steps,
      'remove',
      'ok',
      `dataRows=${removeSummary.dataRowCount}; matched=${removeSummary.matchedTrackedPath}; names=${removeSummary.names.map((n) => n.name).join('|') || 'none'}`
    );
    await persist('removed', { removeSummary });

    await persist('polling');
    let firstDownloadAbsentElapsedSec: number | null = null;
    let firstListAbsentElapsedSec: number | null = null;
    let divergenceObserved = false;
    let previousElapsedSec = 0;
    const removeCompletedAt = now().getTime();

    for (const elapsedSec of pollSeconds) {
      const waitMs = Math.max(0, (elapsedSec - previousElapsedSec) * 1000);
      await sleep(waitMs);
      previousElapsedSec = elapsedSec;

      const dl = await deps.storage.download(objectPath);
      const downloadExists = !dl.error && dl.data != null;
      const downloadErrorClass = classifyStorageError(dl.error);

      const listed = await deps.storage.list(folderPath);
      const listErrorClass = classifyStorageError(listed.error);
      const listExists = listErrorClass
        ? false
        : listContainsProbeBin(listed.data);
      const divergent = downloadExists !== listExists;
      if (divergent) divergenceObserved = true;

      const observation: StorageDeleteProbeObservation = {
        elapsedSec,
        wallClock: now().toISOString(),
        downloadExists,
        downloadErrorClass,
        listExists,
        listErrorClass,
        divergent,
      };
      timeline.push(observation);

      if (!downloadExists && firstDownloadAbsentElapsedSec == null) {
        firstDownloadAbsentElapsedSec = elapsedSec;
      }
      if (!listExists && firstListAbsentElapsedSec == null) {
        firstListAbsentElapsedSec = elapsedSec;
      }

      pushStep(
        steps,
        'poll',
        'ok',
        `t=${elapsedSec}s; download=${downloadExists}; list=${listExists}; divergent=${divergent}`
      );

      // Keep wall-clock aligned even if sleep is mocked.
      void removeCompletedAt;
    }

    const last = timeline[timeline.length - 1];
    const stillPresentAt60s = Boolean(
      last && (last.downloadExists || last.listExists)
    );
    const verdict: StorageDeleteProbeVerdict = stillPresentAt60s
      ? 'NO-GO'
      : 'GO';
    const phase: StorageDeleteProbePhase = stillPresentAt60s
      ? 'orphan_at_60s'
      : 'done';

    await persist(phase, {
      removeSummary,
      timeline,
      firstDownloadAbsentElapsedSec,
      firstListAbsentElapsedSec,
      divergenceObserved,
      stillPresentAt60s,
      verdict,
      lastError: stillPresentAt60s
        ? `still present at 60s; path=${objectPath}; no second remove`
        : null,
    });

    if (stillPresentAt60s) {
      pushStep(
        steps,
        'verdict',
        'failed',
        `NO-GO; orphan path retained; removeCallCount=${removeCallCount}`
      );
      return {
        ok: false,
        mode,
        cell,
        aborted: false,
        sessionId,
        objectPath,
        verdict,
        steps,
        timeline,
        removeSummary,
        preRemoveGetCallCount,
        preRemoveGetMatched,
        firstDownloadAbsentElapsedSec,
        firstListAbsentElapsedSec,
        divergenceObserved,
        stillPresentAt60s,
        error: `still present at 60s; path=${objectPath}`,
      };
    }

    pushStep(
      steps,
      'verdict',
      'ok',
      `GO; cell=${cell}; preRemoveGet=${preRemoveGetCallCount}; matched=${preRemoveGetMatched}; downloadAbsent@${firstDownloadAbsentElapsedSec}; listAbsent@${firstListAbsentElapsedSec}; divergent=${divergenceObserved}`
    );
    return {
      ok: true,
      mode,
      cell,
      aborted: false,
      sessionId,
      objectPath,
      verdict,
      steps,
      timeline,
      removeSummary,
      preRemoveGetCallCount,
      preRemoveGetMatched,
      firstDownloadAbsentElapsedSec,
      firstListAbsentElapsedSec,
      divergenceObserved,
      stillPresentAt60s: false,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (tracker) {
      try {
        await persist('failed', {
          lastError: message.slice(0, 300),
          verdict: 'NO-GO',
          removeSummary,
          timeline,
        });
      } catch {
        // tracker write best-effort after failure
      }
    }
    pushStep(steps, 'probe', 'aborted', message.slice(0, 300));
    return {
      ok: false,
      mode,
      cell,
      aborted: true,
      sessionId: sessionId || null,
      objectPath: objectPath || null,
      verdict: 'NO-GO',
      steps,
      timeline,
      removeSummary,
      preRemoveGetCallCount,
      preRemoveGetMatched,
      firstDownloadAbsentElapsedSec: null,
      firstListAbsentElapsedSec: null,
      divergenceObserved: timeline.some((t) => t.divergent),
      stillPresentAt60s: true,
      error: message.slice(0, 300),
    };
  }
}
