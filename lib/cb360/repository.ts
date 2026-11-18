import type {
  Cb360CurrentBundle,
  Cb360LeaseLock,
  Cb360RunMode,
  Cb360ScanRun,
  Cb360SourceVersion,
} from './types';

export type Cb360StartRunInput = {
  runId: string;
  leaseTokenHash: string;
  leaseExpiresAt: string;
  mode: Cb360RunMode;
  configVersion: string | null;
  plannedBrandCount: number | null;
  requestedBy: string | null;
  logicalBundleId: string;
  baseVersionId: string | null;
  baseSha256: string | null;
  now: Date;
};

export type Cb360Repository = {
  getLeaseLock(): Promise<Cb360LeaseLock>;

  /**
   * Atomically acquire lease + insert run (short critical section).
   * On conflict throws Cb360Error code `active_run_exists` (HTTP 409).
   * Assigns lease_generation server-side.
   */
  tryStartRun(input: Cb360StartRunInput): Promise<Cb360ScanRun>;

  /**
   * Atomic heartbeat: verify token hash + ownership + generation + expiry,
   * then extend lease and bump started→running in one critical section.
   */
  heartbeatRun(params: {
    runId: string;
    leaseTokenHash: string;
    leaseExpiresAt: string;
    now?: Date;
  }): Promise<{ leaseExpiresAt: string; status: string; leaseGeneration: number }>;

  releaseLease(params: { runId: string; leaseGeneration: number }): Promise<void>;

  getRun(runId: string): Promise<Cb360ScanRun | null>;
  updateRun(runId: string, patch: Partial<Cb360ScanRun>): Promise<Cb360ScanRun>;

  getCurrentBundle(): Promise<Cb360CurrentBundle | null>;
  getVersion(id: string): Promise<Cb360SourceVersion | null>;
  insertVersion(version: Cb360SourceVersion): Promise<Cb360SourceVersion>;

  /**
   * Atomic publish: insert output version + update current bundle + finalize run.
   * Must fail entirely on conflict/stale base. Idempotent if already published.
   */
  publishBundle(params: {
    run: Cb360ScanRun;
    outputVersion: Cb360SourceVersion;
    expectedBaseVersionId: string | null;
    completePayloadHash: string;
  }): Promise<{ run: Cb360ScanRun; bundle: Cb360CurrentBundle; idempotent: boolean }>;
};
