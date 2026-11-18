/**
 * CB360 Preview HTTP E2E runner (synthetic).
 *
 * Default: dry-run (no network / DB / Storage).
 * Live path requires explicit mode 'execute' and injected deps.
 * Recovery: mode 'inspect' is read-only (no lease release / reclaim).
 *
 * Secrets stay in memory only. Tracker persists ids/paths/phases — never tokens.
 */
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Cb360EnvBag } from '../envBag';
import { CB360_BUCKET } from '../paths';
import {
  assertPreviewE2eCleanupEnvironment,
  assertPreviewE2eTrackerHasNoSecrets,
  cleanupPreviewE2eSession,
  type PreviewE2eDbClient,
  type PreviewE2eSessionTracker,
} from './previewE2eCleanup';

export const CB360_PREVIEW_E2E_HOST =
  'https://zebra-app-git-feature-cb360-competitor-monitoring-zebra-360.vercel.app';

export const CB360_PREVIEW_E2E_STAGING_REF = 'noagxyztimvefmewjybj';

export const CB360_PREVIEW_E2E_TRACKER_DIR = '.cb360-preview-e2e';

export type PreviewHttpE2eMode = 'dry-run' | 'execute' | 'inspect';

export type PreviewHttpE2ePhase =
  | 'init'
  | 'dry_run_planned'
  | 'pending_start'
  | 'started'
  | 'pending_heartbeat'
  | 'heartbeat_done'
  | 'pending_upload_authorize'
  | 'upload_authorized'
  | 'pending_storage_upload'
  | 'uploaded'
  | 'pending_complete'
  | 'published'
  | 'pending_status'
  | 'status_verified'
  | 'pending_idempotent'
  | 'idempotent_verified'
  | 'pending_cleanup_verify_before'
  | 'cleanup_verify_before_ok'
  | 'pending_cleanup'
  | 'cleaned'
  | 'cleanup_failed'
  | 'aborted'
  | 'failed';

export type PreviewHttpE2eTrackerFile = PreviewE2eSessionTracker & {
  phase: PreviewHttpE2ePhase;
  previewHost: string;
  requestedBy: string;
  clientSha256: string | null;
  byteSize: number | null;
  startedAt: string;
  updatedAt: string;
  lastError: string | null;
};

export type PreviewHttpE2eSecrets = {
  apiSecret: string;
  bypassSecret: string;
};

export type PreviewHttpE2eHttpResponse = {
  status: number;
  json: unknown;
};

export type PreviewHttpE2eHttp = {
  request: (input: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }) => Promise<PreviewHttpE2eHttpResponse>;
};

export type PreviewHttpE2eStagingSnapshot = {
  projectRef: string;
  current: {
    sourceVersionId: string;
    updatedByRunId: string | null;
  } | null;
  runCount: number;
  versionCount: number;
  lease: { runId: string | null; leaseExpiresAt: string | null };
  activeLease: boolean;
};

export type PreviewHttpE2eStaging = {
  snapshot: () => Promise<PreviewHttpE2eStagingSnapshot>;
  getRun: (runId: string) => Promise<{
    id: string;
    status: string;
    published: boolean;
    becameCurrent: boolean;
    outputVersionId: string | null;
  } | null>;
  getVersion: (versionId: string) => Promise<{ id: string; objectPath: string } | null>;
  storageObjectExists: (objectPath: string) => Promise<boolean>;
  asCleanupClient: () => PreviewE2eDbClient;
};

export type PreviewHttpE2eUpload = {
  putSigned: (input: {
    signedUrl: string;
    token: string;
    path: string;
    bytes: Buffer;
  }) => Promise<void>;
};

export type PreviewHttpE2eFs = {
  trackerDir: string;
  listSessionIds: () => Promise<string[]>;
  readTracker: (sessionId: string) => Promise<PreviewHttpE2eTrackerFile | null>;
  writeTrackerAtomic: (tracker: PreviewHttpE2eTrackerFile) => Promise<void>;
};

export type PreviewHttpE2eDeps = {
  env: Cb360EnvBag;
  http: PreviewHttpE2eHttp;
  staging: PreviewHttpE2eStaging;
  upload: PreviewHttpE2eUpload;
  fs: PreviewHttpE2eFs;
  now?: () => Date;
  createSessionId?: () => string;
};

export type PreviewHttpE2eStep = {
  step: string;
  status: 'ok' | 'skipped' | 'aborted' | 'failed' | 'planned';
  detail: string;
};

export type PreviewHttpE2eResult = {
  ok: boolean;
  mode: PreviewHttpE2eMode;
  aborted: boolean;
  sessionId: string | null;
  steps: PreviewHttpE2eStep[];
  error: string | null;
};

export class PreviewHttpE2eError extends Error {
  readonly result: PreviewHttpE2eResult;

  constructor(message: string, result: PreviewHttpE2eResult) {
    super(message);
    this.name = 'PreviewHttpE2eError';
    this.result = result;
  }
}

export class PreviewHttpE2eGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewHttpE2eGateError';
  }
}

const TERMINAL_OK_PHASES: ReadonlySet<PreviewHttpE2ePhase> = new Set([
  'cleaned',
  'dry_run_planned',
]);

const FORBIDDEN_TRACKER_BLOB =
  /secret|token|password|authorization|service.?role|api.?key|bearer|signedUrl|leaseToken/i;

function pushStep(
  steps: PreviewHttpE2eStep[],
  step: string,
  status: PreviewHttpE2eStep['status'],
  detail: string
): void {
  steps.push({ step, status, detail });
}

function iso(now: () => Date): string {
  return now().toISOString();
}

export function sha256HexBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function buildSyntheticArtifactBytes(sessionId: string): Buffer {
  // Transport/integrity only — not a real XLSX workbook.
  return Buffer.from(`CB360-PE2E-SYNTHETIC\nsession=${sessionId}\n`, 'utf8');
}

export function assertPreviewHttpE2eHost(host: string): void {
  const normalized = host.replace(/\/$/, '');
  if (normalized !== CB360_PREVIEW_E2E_HOST) {
    throw new PreviewHttpE2eGateError(
      'Preview host is not the fixed CB360 feature Preview URL'
    );
  }
}

export function assertPreviewHttpE2eFailClosed(env: Cb360EnvBag): void {
  if (env.VERCEL_ENV === 'production') {
    throw new PreviewHttpE2eGateError(
      'Preview HTTP E2E blocked: VERCEL_ENV=production'
    );
  }
  assertPreviewE2eCleanupEnvironment(env, CB360_PREVIEW_E2E_STAGING_REF);
}

export function assertTrackerFileSafe(tracker: PreviewHttpE2eTrackerFile): void {
  assertPreviewE2eTrackerHasNoSecrets(tracker);
  const json = JSON.stringify(tracker);
  if (FORBIDDEN_TRACKER_BLOB.test(json)) {
    throw new PreviewHttpE2eGateError(
      'Tracker JSON contains forbidden secret-like content'
    );
  }
}

export function isIncompleteTrackerPhase(phase: PreviewHttpE2ePhase): boolean {
  return !TERMINAL_OK_PHASES.has(phase);
}

export function parsePreviewHttpE2eArgv(
  argv: string[]
): PreviewHttpE2eMode {
  const hasExecute = argv.includes('--execute');
  const hasInspect = argv.includes('--inspect');
  if (hasExecute && hasInspect) {
    throw new PreviewHttpE2eGateError(
      'Pass only one of --execute or --inspect'
    );
  }
  if (hasExecute) return 'execute';
  if (hasInspect) return 'inspect';
  return 'dry-run';
}

/** Load secrets from env bag — values must never be logged by callers. */
export function loadPreviewHttpE2eSecrets(env: Cb360EnvBag): PreviewHttpE2eSecrets {
  const apiSecret = env.CB360_API_SECRET?.trim();
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!apiSecret || !bypassSecret) {
    throw new PreviewHttpE2eGateError(
      'CB360_API_SECRET and VERCEL_AUTOMATION_BYPASS_SECRET are required'
    );
  }
  return { apiSecret, bypassSecret };
}

export function createDefaultTrackerFs(
  trackerDir = path.join(process.cwd(), CB360_PREVIEW_E2E_TRACKER_DIR)
): PreviewHttpE2eFs {
  return {
    trackerDir,
    async listSessionIds() {
      try {
        const names = await fs.readdir(trackerDir);
        return names
          .filter((n) => n.endsWith('.json'))
          .map((n) => n.replace(/\.json$/, ''));
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return [];
        throw err;
      }
    },
    async readTracker(sessionId: string) {
      const file = path.join(trackerDir, `${sessionId}.json`);
      try {
        const raw = await fs.readFile(file, 'utf8');
        return JSON.parse(raw) as PreviewHttpE2eTrackerFile;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return null;
        throw err;
      }
    },
    async writeTrackerAtomic(tracker: PreviewHttpE2eTrackerFile) {
      assertTrackerFileSafe(tracker);
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

async function persist(
  fsApi: PreviewHttpE2eFs,
  tracker: PreviewHttpE2eTrackerFile,
  steps: PreviewHttpE2eStep[],
  phase: PreviewHttpE2ePhase,
  now: () => Date,
  patch: Partial<PreviewHttpE2eTrackerFile> = {}
): Promise<PreviewHttpE2eTrackerFile> {
  const next: PreviewHttpE2eTrackerFile = {
    ...tracker,
    ...patch,
    phase,
    updatedAt: iso(now),
  };
  assertTrackerFileSafe(next);
  try {
    await fsApi.writeTrackerAtomic(next);
  } catch (err) {
    pushStep(
      steps,
      'tracker_persist',
      'failed',
      `phase=${phase}; sessionId=${tracker.sessionId}`
    );
    throw err;
  }
  pushStep(steps, 'tracker_persist', 'ok', `phase=${phase}`);
  return next;
}

async function findIncompleteSessions(
  fsApi: PreviewHttpE2eFs
): Promise<PreviewHttpE2eTrackerFile[]> {
  const ids = await fsApi.listSessionIds();
  const out: PreviewHttpE2eTrackerFile[] = [];
  for (const id of ids) {
    const t = await fsApi.readTracker(id);
    if (t && isIncompleteTrackerPhase(t.phase)) out.push(t);
  }
  return out;
}

function assertStagingEmptyForExecute(snap: PreviewHttpE2eStagingSnapshot): void {
  if (snap.projectRef !== CB360_PREVIEW_E2E_STAGING_REF) {
    throw new PreviewHttpE2eGateError('Staging snapshot ref mismatch');
  }
  if (snap.activeLease) {
    throw new PreviewHttpE2eGateError(
      'Active lease present on Staging; refusing execute'
    );
  }
  if (snap.current) {
    throw new PreviewHttpE2eGateError(
      'Unexpected cb360_current_bundle row; refusing execute'
    );
  }
  if (snap.runCount !== 0 || snap.versionCount !== 0) {
    throw new PreviewHttpE2eGateError(
      'Unexpected Staging runs/versions; refusing execute'
    );
  }
}

function authHeaders(secrets: PreviewHttpE2eSecrets): Record<string, string> {
  return {
    Authorization: `Bearer ${secrets.apiSecret}`,
    'x-vercel-protection-bypass': secrets.bypassSecret,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function apiJson(
  http: PreviewHttpE2eHttp,
  secrets: PreviewHttpE2eSecrets,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await http.request({
    method,
    url,
    headers: authHeaders(secrets),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    throw new PreviewHttpE2eError(
      `Unexpected redirect HTTP ${res.status}`,
      {
        ok: false,
        mode: 'execute',
        aborted: true,
        sessionId: null,
        steps: [{ step: 'http', status: 'aborted', detail: `redirect ${res.status}` }],
        error: `redirect ${res.status}`,
      }
    );
  }
  if (res.status === 401) {
    throw new PreviewHttpE2eError('Unauthorized (401)', {
      ok: false,
      mode: 'execute',
      aborted: true,
      sessionId: null,
      steps: [{ step: 'http', status: 'aborted', detail: '401' }],
      error: '401',
    });
  }
  if (res.status >= 500) {
    throw new PreviewHttpE2eError(`Server error HTTP ${res.status}`, {
      ok: false,
      mode: 'execute',
      aborted: true,
      sessionId: null,
      steps: [{ step: 'http', status: 'aborted', detail: `5xx ${res.status}` }],
      error: `5xx ${res.status}`,
    });
  }

  const data =
    res.json && typeof res.json === 'object'
      ? (res.json as Record<string, unknown>)
      : {};
  return { status: res.status, data };
}

function asCleanupTracker(
  tracker: PreviewHttpE2eTrackerFile
): PreviewE2eSessionTracker {
  return {
    sessionId: tracker.sessionId,
    projectRefExpected: tracker.projectRefExpected,
    runIds: [...tracker.runIds],
    versionIds: [...tracker.versionIds],
    objectPaths: [...tracker.objectPaths],
    expectedCurrentAfterPublish: tracker.expectedCurrentAfterPublish
      ? { ...tracker.expectedCurrentAfterPublish }
      : null,
  };
}

export async function runPreviewHttpE2e(input: {
  mode: PreviewHttpE2eMode;
  deps?: PreviewHttpE2eDeps;
  previewHost?: string;
}): Promise<PreviewHttpE2eResult> {
  const mode = input.mode;
  const steps: PreviewHttpE2eStep[] = [];
  const host = (input.previewHost ?? CB360_PREVIEW_E2E_HOST).replace(/\/$/, '');

  try {
    assertPreviewHttpE2eHost(host);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode,
      aborted: true,
      sessionId: null,
      steps: [{ step: 'host_gate', status: 'aborted', detail: message }],
      error: message,
    };
  }

  if (mode === 'dry-run') {
    pushStep(steps, 'mode', 'ok', 'dry-run (no network/DB/Storage)');
    pushStep(
      steps,
      'plan',
      'planned',
      'start→heartbeat→upload-authorize→signed PUT→complete→status→idempotent→cleanup'
    );
    pushStep(steps, 'host', 'ok', 'fixed Preview host accepted');
    pushStep(
      steps,
      'staging_ref',
      'ok',
      `expected=${CB360_PREVIEW_E2E_STAGING_REF}`
    );
    pushStep(
      steps,
      'synthetic',
      'planned',
      'bytes=CB360-PE2E-SYNTHETIC (not real source.xlsx)'
    );
    return {
      ok: true,
      mode,
      aborted: false,
      sessionId: null,
      steps: [
        ...steps,
        {
          step: 'phase',
          status: 'ok',
          detail: 'dry_run_planned',
        },
      ],
      error: null,
    };
  }

  if (!input.deps) {
    throw new PreviewHttpE2eGateError(
      'execute/inspect require deps (http, staging, fs, upload, env)'
    );
  }

  const deps = input.deps;
  const now = deps.now ?? (() => new Date());

  try {
    assertPreviewHttpE2eFailClosed(deps.env);
    pushStep(steps, 'fail_closed', 'ok', 'staging ref + non-production');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode,
      aborted: true,
      sessionId: null,
      steps: [{ step: 'fail_closed', status: 'aborted', detail: message }],
      error: message,
    };
  }

  if (mode === 'inspect') {
    const incomplete = await findIncompleteSessions(deps.fs);
    pushStep(
      steps,
      'inspect_sessions',
      'ok',
      `incomplete=${incomplete.length}`
    );
    const snap = await deps.staging.snapshot();
    pushStep(
      steps,
      'inspect_staging',
      'ok',
      `runs=${snap.runCount};versions=${snap.versionCount};activeLease=${snap.activeLease};current=${snap.current ? 'yes' : 'no'}`
    );
    for (const t of incomplete) {
      pushStep(
        steps,
        'inspect_tracker',
        'ok',
        `sessionId=${t.sessionId};phase=${t.phase};runs=${t.runIds.length};versions=${t.versionIds.length};paths=${t.objectPaths.length}`
      );
    }
    pushStep(
      steps,
      'inspect_policy',
      'ok',
      'read-only; no lease release / orphan reclaim'
    );
    return {
      ok: true,
      mode,
      aborted: false,
      sessionId: incomplete[0]?.sessionId ?? null,
      steps,
      error: null,
    };
  }

  // —— execute ——
  let secrets: PreviewHttpE2eSecrets;
  try {
    secrets = loadPreviewHttpE2eSecrets(deps.env);
    pushStep(steps, 'secrets', 'ok', 'loaded from env bag (values not logged)');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode,
      aborted: true,
      sessionId: null,
      steps: [{ step: 'secrets', status: 'aborted', detail: message }],
      error: message,
    };
  }

  const incomplete = await findIncompleteSessions(deps.fs);
  if (incomplete.length) {
    const ids = incomplete.map((t) => t.sessionId).join(',');
    pushStep(
      steps,
      'incomplete_session_gate',
      'aborted',
      `incomplete session(s): ${ids}`
    );
    return {
      ok: false,
      mode,
      aborted: true,
      sessionId: incomplete[0]?.sessionId ?? null,
      steps,
      error: 'incomplete prior session blocks execute',
    };
  }
  pushStep(steps, 'incomplete_session_gate', 'ok', 'none');

  let snap: PreviewHttpE2eStagingSnapshot;
  try {
    snap = await deps.staging.snapshot();
    assertStagingEmptyForExecute(snap);
    pushStep(steps, 'preflight_staging', 'ok', 'empty + no active lease');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushStep(steps, 'preflight_staging', 'aborted', message);
    return {
      ok: false,
      mode,
      aborted: true,
      sessionId: null,
      steps,
      error: message,
    };
  }

  const sessionId =
    deps.createSessionId?.() ??
    `pe2e_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const requestedBy = `cb360-pe2e-${sessionId}`;
  const artifact = buildSyntheticArtifactBytes(sessionId);
  const clientSha256 = sha256HexBuffer(artifact);

  let tracker: PreviewHttpE2eTrackerFile = {
    sessionId,
    projectRefExpected: CB360_PREVIEW_E2E_STAGING_REF,
    runIds: [],
    versionIds: [],
    objectPaths: [],
    expectedCurrentAfterPublish: null,
    phase: 'init',
    previewHost: host,
    requestedBy,
    clientSha256,
    byteSize: artifact.byteLength,
    startedAt: iso(now),
    updatedAt: iso(now),
    lastError: null,
  };

  // Memory-only credentials / lease — never written to tracker.
  let leaseToken: string | null = null;

  const fail = async (
    message: string,
    phase: PreviewHttpE2ePhase = 'failed'
  ): Promise<PreviewHttpE2eResult> => {
    try {
      tracker = await persist(deps.fs, tracker, steps, phase, now, {
        lastError: message,
      });
    } catch {
      pushStep(steps, 'tracker_persist', 'failed', 'could not record failure phase');
    }
    leaseToken = null;
    return {
      ok: false,
      mode,
      aborted: phase === 'aborted',
      sessionId,
      steps,
      error: message,
    };
  };

  try {
    tracker = await persist(deps.fs, tracker, steps, 'pending_start', now);

    const startRes = await apiJson(
      deps.http,
      secrets,
      'POST',
      `${host}/api/rakip/start`,
      {
        mode: 'synthetic',
        plannedBrandCount: 1,
        requestedBy,
        configVersion: 'preview-http-e2e-1',
      }
    );
    if (startRes.status !== 201) {
      return await fail(`start HTTP ${startRes.status}`, 'aborted');
    }
    const runId = String(startRes.data.runId ?? '');
    leaseToken = String(startRes.data.leaseToken ?? '');
    if (!runId || !leaseToken) {
      leaseToken = null;
      return await fail('start missing runId/leaseToken', 'failed');
    }
    pushStep(steps, 'start', 'ok', `runId=${runId}`);

    try {
      tracker = await persist(deps.fs, tracker, steps, 'started', now, {
        runIds: [runId],
      });
    } catch {
      // Start succeeded but tracker did not — do NOT auto re-start.
      leaseToken = null;
      pushStep(
        steps,
        'start_tracker',
        'failed',
        `runId=${runId}; manual inspect required; no automatic re-start`
      );
      return {
        ok: false,
        mode,
        aborted: false,
        sessionId,
        steps,
        error: 'tracker persist failed after start',
      };
    }

    tracker = await persist(deps.fs, tracker, steps, 'pending_heartbeat', now);
    const hb = await apiJson(deps.http, secrets, 'POST', `${host}/api/rakip/heartbeat`, {
      runId,
      leaseToken,
    });
    if (hb.status !== 200 || hb.data.status !== 'running') {
      return await fail(`heartbeat unexpected status=${hb.status}`, 'aborted');
    }
    pushStep(steps, 'heartbeat', 'ok', 'status=running');
    tracker = await persist(deps.fs, tracker, steps, 'heartbeat_done', now);

    tracker = await persist(
      deps.fs,
      tracker,
      steps,
      'pending_upload_authorize',
      now
    );
    const up = await apiJson(
      deps.http,
      secrets,
      'POST',
      `${host}/api/rakip/upload-authorize`,
      { runId, leaseToken, artifact: 'source_xlsx' }
    );
    if (up.status !== 200) {
      return await fail(`upload-authorize HTTP ${up.status}`, 'aborted');
    }
    const objectPath = String(up.data.path ?? '');
    const signedUrl = String(up.data.signedUrl ?? '');
    const uploadToken = String(up.data.token ?? '');
    if (!objectPath || !signedUrl || !uploadToken) {
      return await fail('upload-authorize missing path/signedUrl/token', 'failed');
    }
    if (up.data.bucket && up.data.bucket !== CB360_BUCKET) {
      return await fail('upload-authorize unexpected bucket', 'failed');
    }
    pushStep(steps, 'upload_authorize', 'ok', `path=${objectPath}`);
    tracker = await persist(deps.fs, tracker, steps, 'upload_authorized', now, {
      objectPaths: [objectPath],
    });

    tracker = await persist(
      deps.fs,
      tracker,
      steps,
      'pending_storage_upload',
      now
    );
    await deps.upload.putSigned({
      signedUrl,
      token: uploadToken,
      path: objectPath,
      bytes: artifact,
    });
    pushStep(steps, 'storage_upload', 'ok', 'synthetic bytes uploaded');
    tracker = await persist(deps.fs, tracker, steps, 'uploaded', now);

    const completeBody = {
      runId,
      leaseToken,
      clientSha256,
      objectPath,
      brandResults: [{ brandId: 'synth_brand_alpha', outcome: 'ok' as const }],
      plannedBrandCount: 1,
    };

    tracker = await persist(deps.fs, tracker, steps, 'pending_complete', now);
    const complete = await apiJson(
      deps.http,
      secrets,
      'POST',
      `${host}/api/rakip/complete`,
      completeBody
    );
    if (complete.status !== 200) {
      return await fail(`complete HTTP ${complete.status}`, 'aborted');
    }
    if (complete.data.published !== true || complete.data.becameCurrent !== true) {
      return await fail('complete did not publish/become current', 'failed');
    }
    const outputVersionId = String(complete.data.outputVersionId ?? '');
    if (!outputVersionId) {
      return await fail('complete missing outputVersionId', 'failed');
    }
    const serverSha = complete.data.serverSha256
      ? String(complete.data.serverSha256)
      : null;
    if (serverSha && serverSha.toLowerCase() !== clientSha256) {
      return await fail('serverSha256 mismatch', 'failed');
    }
    pushStep(
      steps,
      'complete',
      'ok',
      `published; outputVersionId=${outputVersionId}`
    );
    tracker = await persist(deps.fs, tracker, steps, 'published', now, {
      versionIds: [outputVersionId],
      expectedCurrentAfterPublish: {
        sourceVersionId: outputVersionId,
        updatedByRunId: runId,
      },
    });

    tracker = await persist(deps.fs, tracker, steps, 'pending_status', now);
    const status = await apiJson(
      deps.http,
      secrets,
      'GET',
      `${host}/api/rakip/status?runId=${encodeURIComponent(runId)}`
    );
    if (
      status.status !== 200 ||
      status.data.status !== 'completed' ||
      status.data.published !== true ||
      status.data.becameCurrent !== true
    ) {
      return await fail('status verification failed', 'failed');
    }
    pushStep(steps, 'status', 'ok', 'completed+published');
    tracker = await persist(deps.fs, tracker, steps, 'status_verified', now);

    tracker = await persist(deps.fs, tracker, steps, 'pending_idempotent', now);
    const again = await apiJson(
      deps.http,
      secrets,
      'POST',
      `${host}/api/rakip/complete`,
      completeBody
    );
    if (
      again.status !== 200 ||
      again.data.idempotent !== true ||
      String(again.data.outputVersionId ?? '') !== outputVersionId
    ) {
      return await fail('idempotent replay verification failed', 'failed');
    }
    pushStep(steps, 'idempotent', 'ok', 'same outputVersionId');
    tracker = await persist(deps.fs, tracker, steps, 'idempotent_verified', now);

    // Pre-cleanup verification (must pass before success path)
    tracker = await persist(
      deps.fs,
      tracker,
      steps,
      'pending_cleanup_verify_before',
      now
    );
    const runRow = await deps.staging.getRun(runId);
    const verRow = await deps.staging.getVersion(outputVersionId);
    const snapBefore = await deps.staging.snapshot();
    const objectOk = await deps.staging.storageObjectExists(objectPath);
    if (
      !runRow ||
      runRow.status !== 'completed' ||
      !verRow ||
      verRow.objectPath !== objectPath ||
      !snapBefore.current ||
      snapBefore.current.sourceVersionId !== outputVersionId ||
      snapBefore.current.updatedByRunId !== runId ||
      !objectOk
    ) {
      return await fail(
        'pre-cleanup verification failed; refusing to report success',
        'failed'
      );
    }
    pushStep(steps, 'cleanup_verify_before', 'ok', 'db+storage match tracker');
    tracker = await persist(
      deps.fs,
      tracker,
      steps,
      'cleanup_verify_before_ok',
      now
    );

    tracker = await persist(deps.fs, tracker, steps, 'pending_cleanup', now);
    const cleanupResult = await cleanupPreviewE2eSession(
      deps.staging.asCleanupClient(),
      asCleanupTracker(tracker),
      deps.env
    );
    if (!cleanupResult.ok || cleanupResult.aborted) {
      tracker = await persist(deps.fs, tracker, steps, 'cleanup_failed', now, {
        lastError: 'cleanupPreviewE2eSession aborted or failed',
      });
      pushStep(
        steps,
        'cleanup',
        'aborted',
        cleanupResult.steps.map((s) => `${s.step}:${s.status}`).join(',')
      );
      leaseToken = null;
      return {
        ok: false,
        mode,
        aborted: true,
        sessionId,
        steps,
        error: 'cleanup failed; no broad delete attempted',
      };
    }
    pushStep(steps, 'cleanup', 'ok', 'exact tracked ids/paths only');

    const snapAfter = await deps.staging.snapshot();
    const objectGone = !(await deps.staging.storageObjectExists(objectPath));
    const runGone = (await deps.staging.getRun(runId)) === null;
    const verGone = (await deps.staging.getVersion(outputVersionId)) === null;
    if (
      snapAfter.current !== null ||
      snapAfter.runCount !== 0 ||
      snapAfter.versionCount !== 0 ||
      snapAfter.activeLease ||
      !objectGone ||
      !runGone ||
      !verGone
    ) {
      tracker = await persist(deps.fs, tracker, steps, 'cleanup_failed', now, {
        lastError: 'post-cleanup verification failed',
      });
      pushStep(steps, 'cleanup_verify_after', 'failed', 'staging not empty');
      leaseToken = null;
      return {
        ok: false,
        mode,
        aborted: false,
        sessionId,
        steps,
        error: 'post-cleanup verification failed; not reporting success',
      };
    }
    pushStep(steps, 'cleanup_verify_after', 'ok', 'staging empty');

    tracker = await persist(deps.fs, tracker, steps, 'cleaned', now, {
      lastError: null,
    });
    leaseToken = null;
    return {
      ok: true,
      mode,
      aborted: false,
      sessionId,
      steps,
      error: null,
    };
  } catch (err) {
    if (err instanceof PreviewHttpE2eError) {
      leaseToken = null;
      return {
        ...err.result,
        sessionId: err.result.sessionId ?? sessionId,
        steps: [...steps, ...err.result.steps],
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return await fail(message, 'failed');
  }
}
