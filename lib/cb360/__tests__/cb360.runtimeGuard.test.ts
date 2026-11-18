/**
 * CB360 runtime fail-closed guard — offline unit tests (no network).
 * Run via: npm run test:cb360  (included) or tsx --test this file
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCb360RuntimeEnvironment,
  parseStrictSupabaseHttpsProjectRef,
} from '../runtimeGuard';
import { Cb360Error } from '../types';

const STAGING_REF = 'noagxyztimvefmewjybj';

function env(partial: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...partial } as NodeJS.ProcessEnv;
}

describe('parseStrictSupabaseHttpsProjectRef', () => {
  it('accepts canonical https://<ref>.supabase.co', () => {
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://${STAGING_REF}.supabase.co`
      ),
      STAGING_REF
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://${STAGING_REF}.supabase.co/`
      ),
      STAGING_REF
    );
  });

  it('rejects http, ports, paths, query, userinfo, lookalike hosts', () => {
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(`http://${STAGING_REF}.supabase.co`),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://${STAGING_REF}.supabase.co:443`
      ),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://${STAGING_REF}.supabase.co/rest/v1`
      ),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://${STAGING_REF}.supabase.co?x=1`
      ),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://user:pass@${STAGING_REF}.supabase.co`
      ),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://${STAGING_REF}.supabase.co.evil.com`
      ),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef(
        `https://evil-${STAGING_REF}.supabase.co`
      ),
      null
    );
    assert.equal(
      parseStrictSupabaseHttpsProjectRef('https://supabase.co'),
      null
    );
  });
});

describe('assertCb360RuntimeEnvironment', () => {
  it('rejects missing CB360_ALLOWED_SUPABASE_REF with 503', () => {
    assert.throws(
      () =>
        assertCb360RuntimeEnvironment(
          env({
            VERCEL_ENV: 'preview',
            NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
          })
        ),
      (err: unknown) =>
        err instanceof Cb360Error &&
        err.code === 'config_missing' &&
        err.httpStatus === 503 &&
        !String(err.message).includes(STAGING_REF)
    );
  });

  it('rejects empty CB360_ALLOWED_SUPABASE_REF', () => {
    assert.throws(
      () =>
        assertCb360RuntimeEnvironment(
          env({
            VERCEL_ENV: 'preview',
            CB360_ALLOWED_SUPABASE_REF: '   ',
            NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
          })
        ),
      (err: unknown) =>
        err instanceof Cb360Error && err.code === 'config_missing'
    );
  });

  it('rejects mismatched ref (e.g. Production URL on Preview)', () => {
    assert.throws(
      () =>
        assertCb360RuntimeEnvironment(
          env({
            VERCEL_ENV: 'preview',
            CB360_ALLOWED_SUPABASE_REF: STAGING_REF,
            NEXT_PUBLIC_SUPABASE_URL: 'https://prodprojectref001.supabase.co',
          })
        ),
      (err: unknown) =>
        err instanceof Cb360Error &&
        err.code === 'environment_blocked' &&
        err.httpStatus === 503 &&
        !String(err.message).includes('prodprojectref001')
    );
  });

  it('rejects fake/lookalike host even if allowed ref string appears', () => {
    assert.throws(
      () =>
        assertCb360RuntimeEnvironment(
          env({
            VERCEL_ENV: 'preview',
            CB360_ALLOWED_SUPABASE_REF: STAGING_REF,
            NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co.attacker.com`,
          })
        ),
      (err: unknown) =>
        err instanceof Cb360Error && err.code === 'environment_blocked'
    );
  });

  it('blocks VERCEL_ENV=production even with matching staging URL', () => {
    assert.throws(
      () =>
        assertCb360RuntimeEnvironment(
          env({
            VERCEL_ENV: 'production',
            CB360_ALLOWED_SUPABASE_REF: STAGING_REF,
            NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
          })
        ),
      (err: unknown) =>
        err instanceof Cb360Error &&
        err.code === 'environment_blocked' &&
        err.httpStatus === 503
    );
  });

  it('allows Preview/local when ref matches staging', () => {
    const preview = assertCb360RuntimeEnvironment(
      env({
        VERCEL_ENV: 'preview',
        CB360_ALLOWED_SUPABASE_REF: STAGING_REF,
        NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      })
    );
    assert.equal(preview.projectRef, STAGING_REF);

    const local = assertCb360RuntimeEnvironment(
      env({
        CB360_ALLOWED_SUPABASE_REF: STAGING_REF,
        NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      })
    );
    assert.equal(local.projectRef, STAGING_REF);
  });
});
