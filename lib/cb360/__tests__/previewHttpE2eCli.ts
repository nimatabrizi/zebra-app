/**
 * CLI entry for CB360 Preview HTTP E2E runner.
 *
 * Default argv → dry-run (zero network / no live factories).
 * --inspect → read-only Staging + local trackers.
 * --execute → full live factories (must be explicit).
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Cb360EnvBag } from '../envBag';
import {
  createLiveExecuteDeps,
  createLiveInspectDeps,
  loadCb360StagingEnvFile,
  mergeEnvBags,
  CB360_STAGING_ENV_FILE,
} from './previewHttpE2eLive';
import {
  parsePreviewHttpE2eArgv,
  runPreviewHttpE2e,
  type PreviewHttpE2eDeps,
  type PreviewHttpE2eMode,
  type PreviewHttpE2eResult,
} from './previewHttpE2eRunner';

export type PreviewHttpE2eCliFactories = {
  loadEnvFile: (filePath: string) => Promise<Cb360EnvBag>;
  createExecuteDeps: (env: Cb360EnvBag) => Promise<PreviewHttpE2eDeps>;
  createInspectDeps: (env: Cb360EnvBag) => Promise<PreviewHttpE2eDeps>;
};

export type PreviewHttpE2eCliOptions = {
  cwd?: string;
  envFileName?: string;
  processEnv?: Cb360EnvBag;
  factories?: Partial<PreviewHttpE2eCliFactories>;
};

function defaultFactories(): PreviewHttpE2eCliFactories {
  return {
    loadEnvFile: loadCb360StagingEnvFile,
    createExecuteDeps: (env) => createLiveExecuteDeps(env),
    createInspectDeps: (env) => createLiveInspectDeps(env),
  };
}

/**
 * Programmatic CLI. Safe for offline tests via injected factories.
 * Never constructs live clients in dry-run.
 */
export async function runPreviewHttpE2eCli(
  argv: string[],
  options: PreviewHttpE2eCliOptions = {}
): Promise<PreviewHttpE2eResult> {
  const mode: PreviewHttpE2eMode = parsePreviewHttpE2eArgv(argv);
  const factories: PreviewHttpE2eCliFactories = {
    ...defaultFactories(),
    ...options.factories,
  };

  if (mode === 'dry-run') {
    return runPreviewHttpE2e({ mode: 'dry-run' });
  }

  const cwd = options.cwd ?? process.cwd();
  const envFile = path.join(
    cwd,
    options.envFileName ?? CB360_STAGING_ENV_FILE
  );
  const fileEnv = await factories.loadEnvFile(envFile);
  const env = mergeEnvBags(fileEnv, options.processEnv ?? process.env);

  try {
    if (mode === 'inspect') {
      const deps = await factories.createInspectDeps(env);
      return await runPreviewHttpE2e({ mode: 'inspect', deps });
    }

    // execute — only path that builds mutating live deps
    const deps = await factories.createExecuteDeps(env);
    return await runPreviewHttpE2e({ mode: 'execute', deps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode,
      aborted: true,
      sessionId: null,
      steps: [{ step: 'cli_gate', status: 'aborted', detail: message }],
      error: message,
    };
  }
}

function printSafeResult(result: PreviewHttpE2eResult): void {
  // Never print secrets, tokens, or Authorization material.
  const safe = {
    ok: result.ok,
    mode: result.mode,
    aborted: result.aborted,
    sessionId: result.sessionId,
    error: result.error,
    steps: result.steps.map((s) => ({
      step: s.step,
      status: s.status,
      detail: s.detail,
    })),
  };
  console.log(JSON.stringify(safe, null, 2));
}

async function main(): Promise<void> {
  const result = await runPreviewHttpE2eCli(process.argv.slice(2));
  printSafeResult(result);
  process.exitCode = result.ok ? 0 : 1;
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
