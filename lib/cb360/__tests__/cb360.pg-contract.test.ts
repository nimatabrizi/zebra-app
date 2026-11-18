/**
 * PostgreSQL / Supabase SQL contract notes (source inspection).
 *
 * Bu dosya gerçek FOR UPDATE / rollback kanıtı üretmez.
 * Canlı atomik senaryolar: cb360.integration.test.ts (staging gate).
 *
 * Run: npm run test:cb360:pg-contract
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCb360StagingIntegrationRequested } from './stagingGuard';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261118_cb360_monitor.sql'
);

describe('CB360 SQL contract (source inspection — not live DB)', () => {
  it('migration defines atomic try_start_run with FOR UPDATE', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    assert.match(sql, /cb360_try_start_run/);
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /cb360_active_run_exists/);
    assert.match(sql, /aborted_lease/);
  });

  it('migration defines atomic heartbeat_run with lock order lease_lock then run', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    assert.match(sql, /cb360_heartbeat_run/);
    const heartbeatBlock = sql.slice(sql.indexOf('cb360_heartbeat_run'));
    const lockIdx = heartbeatBlock.indexOf('cb360_lease_lock');
    const runIdx = heartbeatBlock.indexOf('cb360_scan_runs');
    assert.ok(lockIdx >= 0 && runIdx > lockIdx, 'lease_lock must be locked before run');
    assert.match(heartbeatBlock, /lease_token_hash/);
    assert.match(heartbeatBlock, /cb360_lease_expired/);
  });

  it('migration publish is idempotent and rejects terminal re-entry', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    assert.match(sql, /cb360_publish_bundle/);
    assert.match(sql, /cb360_already_terminal/);
    assert.match(sql, /cb360_idempotent_replay/);
    assert.match(sql, /p_complete_payload_hash/);
  });

  it('RPC lock order is consistently lease_lock-first across start/heartbeat/publish', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    for (const name of [
      'cb360_try_start_run',
      'cb360_heartbeat_run',
      'cb360_publish_bundle',
    ]) {
      const idx = sql.indexOf(`FUNCTION public.${name}`);
      assert.ok(idx >= 0, name);
      const block = sql.slice(idx, idx + 2500);
      const lockPos = block.search(/FROM public\.cb360_lease_lock[^\n]*FOR UPDATE/);
      assert.ok(lockPos >= 0, `${name} must FOR UPDATE lease_lock`);
    }
  });

  it('SECURITY DEFINER RPCs pin search_path and use schema-qualified tables', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    for (const name of [
      'cb360_try_start_run',
      'cb360_heartbeat_run',
      'cb360_publish_bundle',
    ]) {
      const idx = sql.indexOf(`FUNCTION public.${name}`);
      const block = sql.slice(idx, idx + 1800);
      assert.match(block, /SECURITY DEFINER/);
      assert.match(block, /SET search_path = public, pg_temp/);
      assert.match(block, /public\.cb360_lease_lock/);
    }
  });

  it('REVOKE PUBLIC/anon/authenticated and GRANT EXECUTE only to service_role', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    for (const name of [
      'cb360_try_start_run',
      'cb360_heartbeat_run',
      'cb360_publish_bundle',
    ]) {
      assert.match(
        sql,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*?FROM PUBLIC`,
          'm'
        )
      );
      assert.match(
        sql,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*?FROM anon, authenticated`,
          'm'
        )
      );
      assert.match(
        sql,
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*?TO service_role`,
          'm'
        )
      );
    }
    assert.doesNotMatch(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.cb360_(try_start_run|heartbeat_run|publish_bundle)[\s\S]*?TO (anon|authenticated)/
    );
  });

  it('CB360 table privileges are service_role-only; storage policies scoped to cb360-private', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    assert.match(sql, /GRANT ALL ON TABLE public\.cb360_scan_runs TO service_role/);
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.cb360_scan_runs FROM anon, authenticated/
    );
    assert.match(sql, /cb360_runs_anon_deny/);
    assert.match(sql, /cb360_private_anon_no_select/);
    assert.match(sql, /bucket_id = 'cb360-private' AND false/);
    assert.doesNotMatch(sql, /GRANT .+ ON TABLE public\.ivo_/);
    assert.doesNotMatch(sql, /ON TABLE public\.appointments/);
  });
});

describe('CB360 live Postgres pointer', () => {
  it('does not claim live PASS here; staging suite is integration.test.ts', () => {
    if (isCb360StagingIntegrationRequested()) {
      assert.ok(
        true,
        'staging gate set — run npm run test:cb360:integration for live proof'
      );
    } else {
      assert.ok(
        true,
        'staging gate unset — live atomicity not proven (expected)'
      );
    }
  });
});
