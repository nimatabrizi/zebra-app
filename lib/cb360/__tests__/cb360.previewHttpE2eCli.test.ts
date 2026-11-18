/**
 * Offline tests for Preview HTTP E2E CLI wiring — no real network.
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Cb360EnvBag } from '../envBag';
import { runPreviewHttpE2eCli } from './previewHttpE2eCli';
import {
  createPreviewHttpE2eFetchHttp,
  createPreviewHttpE2eSignedUploader,
  loadCb360StagingEnvFile,
  mergeEnvBags,
} from './previewHttpE2eLive';
import {
  CB360_PREVIEW_E2E_HOST,
  CB360_PREVIEW_E2E_STAGING_REF,
  type PreviewHttpE2eDeps,
} from './previewHttpE2eRunner';

function stagingFileEnv(): string {
  return [
    'CB360_INTEGRATION=1',
    'CB360_TARGET_ENV=staging',
    'CB360_ALLOW_LIVE_DB=staging-only',
    `CB360_STAGING_PROJECT_REF=${CB360_PREVIEW_E2E_STAGING_REF}`,
    `CB360_STAGING_SUPABASE_URL=https://${CB360_PREVIEW_E2E_STAGING_REF}.supabase.co`,
    'CB360_STAGING_SERVICE_ROLE_KEY=test-service-role-key-not-real',
    'CB360_API_SECRET=test-cb360-api-secret-16chars',
    'VERCEL_AUTOMATION_BYPASS_SECRET=test-vercel-bypass-secret',
    'CB360_ALLOWED_SUPABASE_REF=' + CB360_PREVIEW_E2E_STAGING_REF,
    '',
  ].join('\n');
}

describe('previewHttpE2eLive env loading (offline)', () => {
  it('loads env file without requiring network', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cb360-env-'));
    const file = path.join(dir, '.env.cb360.staging.local');
    await fs.writeFile(file, stagingFileEnv(), 'utf8');
    const bag = await loadCb360StagingEnvFile(file);
    assert.equal(bag.CB360_STAGING_PROJECT_REF, CB360_PREVIEW_E2E_STAGING_REF);
    assert.ok(bag.CB360_API_SECRET);
    assert.ok(bag.VERCEL_AUTOMATION_BYPASS_SECRET);
    // Ensure merge prefers file CB360 keys
    const merged = mergeEnvBags(bag, {
      CB360_STAGING_PROJECT_REF: 'should-not-win',
      VERCEL_ENV: 'preview',
    });
    assert.equal(merged.CB360_STAGING_PROJECT_REF, CB360_PREVIEW_E2E_STAGING_REF);
    assert.equal(merged.VERCEL_ENV, 'preview');
  });
});

describe('previewHttpE2eLive HTTP helpers (offline)', () => {
  it('fetch http uses redirect=manual and returns status', async () => {
    const calls: Array<{ redirect?: RequestRedirect }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push({ redirect: init?.redirect });
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    };
    const http = createPreviewHttpE2eFetchHttp(fetchImpl);
    const res = await http.request({
      method: 'POST',
      url: `${CB360_PREVIEW_E2E_HOST}/api/rakip/start`,
      headers: { Authorization: 'Bearer x' },
      body: '{}',
    });
    assert.equal(res.status, 201);
    assert.equal(calls[0]?.redirect, 'manual');
  });

  it('signed uploader PUTs with token + x-upsert false; stops on 302', async () => {
    const seen: Array<{
      method?: string;
      redirect?: RequestRedirect;
      headers: Headers;
      url: string;
    }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seen.push({
        method: init?.method,
        redirect: init?.redirect,
        headers: new Headers(init?.headers),
        url: String(url),
      });
      return new Response('', { status: 302 });
    };
    const upload = createPreviewHttpE2eSignedUploader(fetchImpl);
    await assert.rejects(
      () =>
        upload.putSigned({
          signedUrl:
            'https://example.supabase.co/storage/v1/object/upload/sign/cb360-private/p/source.xlsx',
          token: 'upload-token',
          path: 'p/source.xlsx',
          bytes: Buffer.from('synth'),
        }),
      /redirect HTTP 302/
    );
    assert.equal(seen[0]?.method, 'PUT');
    assert.equal(seen[0]?.redirect, 'manual');
    assert.equal(seen[0]?.headers.get('x-upsert'), 'false');
    assert.match(seen[0]?.url ?? '', /token=upload-token/);
  });
});

describe('previewHttpE2eCli wiring (offline)', () => {
  it('dry-run never loads env file or live factories', async () => {
    let loaded = false;
    let executeFactory = false;
    let inspectFactory = false;
    const result = await runPreviewHttpE2eCli([], {
      factories: {
        async loadEnvFile() {
          loaded = true;
          throw new Error('should not load env in dry-run');
        },
        async createExecuteDeps() {
          executeFactory = true;
          throw new Error('no execute factory in dry-run');
        },
        async createInspectDeps() {
          inspectFactory = true;
          throw new Error('no inspect factory in dry-run');
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'dry-run');
    assert.equal(loaded, false);
    assert.equal(executeFactory, false);
    assert.equal(inspectFactory, false);
  });

  it('inspect uses inspect factory only (no execute factory)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cb360-cli-'));
    await fs.writeFile(
      path.join(dir, '.env.cb360.staging.local'),
      stagingFileEnv(),
      'utf8'
    );
    let executeFactory = false;
    let inspectFactory = false;

    const result = await runPreviewHttpE2eCli(['--inspect'], {
      cwd: dir,
      factories: {
        loadEnvFile: loadCb360StagingEnvFile,
        async createExecuteDeps() {
          executeFactory = true;
          throw new Error('execute factory must not run for inspect');
        },
        async createInspectDeps(env: Cb360EnvBag) {
          inspectFactory = true;
          assert.equal(
            env.CB360_STAGING_PROJECT_REF,
            CB360_PREVIEW_E2E_STAGING_REF
          );
          const deps: PreviewHttpE2eDeps = {
            env,
            fs: {
              trackerDir: ':memory:',
              async listSessionIds() {
                return [];
              },
              async readTracker() {
                return null;
              },
              async writeTrackerAtomic() {
                throw new Error('inspect must not write trackers here');
              },
            },
            http: {
              async request() {
                throw new Error('inspect must not call preview http');
              },
            },
            upload: {
              async putSigned() {
                throw new Error('inspect must not upload');
              },
            },
            staging: {
              async snapshot() {
                return {
                  projectRef: CB360_PREVIEW_E2E_STAGING_REF,
                  current: null,
                  runCount: 0,
                  versionCount: 0,
                  lease: { runId: null, leaseExpiresAt: null },
                  activeLease: false,
                };
              },
              async getRun() {
                return null;
              },
              async getVersion() {
                return null;
              },
              async storageObjectExists() {
                return false;
              },
              asCleanupClient() {
                throw new Error('inspect cleanup blocked');
              },
            },
          };
          return deps;
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'inspect');
    assert.equal(inspectFactory, true);
    assert.equal(executeFactory, false);
  });

  it('execute fail-closed when production env in bag', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cb360-cli-prod-'));
    await fs.writeFile(
      path.join(dir, '.env.cb360.staging.local'),
      stagingFileEnv() + 'VERCEL_ENV=production\n',
      'utf8'
    );

    const result = await runPreviewHttpE2eCli(['--execute'], {
      cwd: dir,
      factories: {
        loadEnvFile: loadCb360StagingEnvFile,
        async createExecuteDeps(env) {
          // Mimic live factory gate
          const { createLiveExecuteDeps } = await import('./previewHttpE2eLive');
          return createLiveExecuteDeps(env, {
            fetchImpl: async () => {
              throw new Error('network forbidden in offline test');
            },
          });
        },
        async createInspectDeps() {
          throw new Error('unused');
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.match(String(result.error), /production/i);
  });

  it('execute uses execute factory after env load', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cb360-cli-ex-'));
    await fs.writeFile(
      path.join(dir, '.env.cb360.staging.local'),
      stagingFileEnv(),
      'utf8'
    );
    let executeFactory = false;

    const result = await runPreviewHttpE2eCli(['--execute'], {
      cwd: dir,
      factories: {
        loadEnvFile: loadCb360StagingEnvFile,
        async createInspectDeps() {
          throw new Error('inspect unused');
        },
        async createExecuteDeps(env) {
          executeFactory = true;
          // Return deps that abort at preflight empty check with active lease —
          // proves wiring without real network.
          const deps: PreviewHttpE2eDeps = {
            env,
            fs: {
              trackerDir: ':memory:',
              async listSessionIds() {
                return [];
              },
              async readTracker() {
                return null;
              },
              async writeTrackerAtomic() {},
            },
            http: {
              async request() {
                throw new Error('should not reach http before preflight abort');
              },
            },
            upload: {
              async putSigned() {
                throw new Error('no upload');
              },
            },
            staging: {
              async snapshot() {
                return {
                  projectRef: CB360_PREVIEW_E2E_STAGING_REF,
                  current: {
                    sourceVersionId: 'ver_block',
                    updatedByRunId: 'run_block',
                  },
                  runCount: 1,
                  versionCount: 1,
                  lease: { runId: null, leaseExpiresAt: null },
                  activeLease: false,
                };
              },
              async getRun() {
                return null;
              },
              async getVersion() {
                return null;
              },
              async storageObjectExists() {
                return false;
              },
              asCleanupClient() {
                throw new Error('no cleanup');
              },
            },
          };
          return deps;
        },
      },
    });

    assert.equal(executeFactory, true);
    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.match(String(result.error), /Unexpected|refusing/i);
  });
});
