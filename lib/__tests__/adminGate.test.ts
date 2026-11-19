/**
 * User-admin gate — offline unit tests (no network).
 * Run: npx tsx --test lib/__tests__/adminGate.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  authSupabaseProjectRef,
  isNameBasedUserAdminBlockedForAuthEnv,
} from '../adminGate';
import { RAKIP_INVENTORY_STAGING_REF } from '../rakip/inventory/stagingEnv';
import { isUserAdmin } from '../authIdentity';

describe('authSupabaseProjectRef', () => {
  it('parses strict supabase.co hosts', () => {
    assert.equal(
      authSupabaseProjectRef(
        `https://${RAKIP_INVENTORY_STAGING_REF}.supabase.co`
      ),
      RAKIP_INVENTORY_STAGING_REF
    );
    assert.equal(
      authSupabaseProjectRef('https://ebpgkyitofvqpmfvdlor.supabase.co/'),
      'ebpgkyitofvqpmfvdlor'
    );
  });

  it('fails closed on bad hosts', () => {
    assert.equal(authSupabaseProjectRef(''), null);
    assert.equal(authSupabaseProjectRef('https://evil.example.com'), null);
    assert.equal(
      authSupabaseProjectRef(
        `https://${RAKIP_INVENTORY_STAGING_REF}.supabase.co.attacker.com`
      ),
      null
    );
  });
});

describe('isNameBasedUserAdminBlockedForAuthEnv', () => {
  it('blocks when Auth URL is Staging project', () => {
    assert.equal(
      isNameBasedUserAdminBlockedForAuthEnv({
        NEXT_PUBLIC_SUPABASE_URL: `https://${RAKIP_INVENTORY_STAGING_REF}.supabase.co`,
      }),
      true
    );
  });

  it('does not block Production Auth URL (name admin remains available)', () => {
    assert.equal(
      isNameBasedUserAdminBlockedForAuthEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://ebpgkyitofvqpmfvdlor.supabase.co',
      }),
      false
    );
  });

  it('blocks when Auth URL missing or unparseable (fail closed)', () => {
    assert.equal(isNameBasedUserAdminBlockedForAuthEnv({}), true);
    assert.equal(
      isNameBasedUserAdminBlockedForAuthEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://evil.example.com',
      }),
      true
    );
  });
});

describe('Production name admin unchanged', () => {
  it('isUserAdmin still recognizes Nima Tabrizi by name', () => {
    assert.equal(isUserAdmin('Nima Tabrizi', 'personel'), true);
    assert.equal(isUserAdmin('Other Person', 'personel'), false);
  });
});
