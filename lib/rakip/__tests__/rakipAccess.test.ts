/**
 * Rakip UI access — offline unit tests (no network).
 * Run: npm run test:rakip
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isRakipUserIdAllowed,
  parseRakipAllowedUserIds,
  RAKIP_ALLOWED_USER_IDS_ENV,
  type RakipEnvBag,
} from '../../rakipAccess';
import {
  buildRakipShellPayload,
  isRakipTabId,
  RAKIP_SCAN_EXECUTOR_READY,
  RAKIP_NIGHTLY_AUTOMATION_READY,
  RAKIP_TRACKED_BRANDS,
} from '../../rakipUiMeta';

const NIMA_ID = '46c2ed6e-4b82-429e-8c40-8fe878a62c39';
const OTHER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function env(partial: RakipEnvBag): RakipEnvBag {
  return partial;
}

describe('parseRakipAllowedUserIds', () => {
  it('returns empty set when env missing or blank (fail-closed)', () => {
    assert.equal(parseRakipAllowedUserIds(env({})).size, 0);
    assert.equal(
      parseRakipAllowedUserIds(env({ [RAKIP_ALLOWED_USER_IDS_ENV]: '   ' })).size,
      0
    );
  });

  it('parses comma-separated UUIDs and ignores junk', () => {
    const set = parseRakipAllowedUserIds(
      env({
        [RAKIP_ALLOWED_USER_IDS_ENV]: ` ${NIMA_ID}, not-a-uuid, ${OTHER_ID.toUpperCase()} `,
      })
    );
    assert.equal(set.size, 2);
    assert.equal(set.has(NIMA_ID), true);
    assert.equal(set.has(OTHER_ID), true);
  });
});

describe('isRakipUserIdAllowed', () => {
  it('denies everyone when allowlist empty', () => {
    assert.equal(isRakipUserIdAllowed(NIMA_ID, env({})), false);
    assert.equal(
      isRakipUserIdAllowed(NIMA_ID, env({ [RAKIP_ALLOWED_USER_IDS_ENV]: '' })),
      false
    );
  });

  it('allows only listed UUID (authorized)', () => {
    const e = env({ [RAKIP_ALLOWED_USER_IDS_ENV]: NIMA_ID });
    assert.equal(isRakipUserIdAllowed(NIMA_ID, e), true);
    assert.equal(isRakipUserIdAllowed(NIMA_ID.toUpperCase(), e), true);
  });

  it('denies other valid UUID (unauthorized)', () => {
    const e = env({ [RAKIP_ALLOWED_USER_IDS_ENV]: NIMA_ID });
    assert.equal(isRakipUserIdAllowed(OTHER_ID, e), false);
  });

  it('denies null, empty, and non-UUID callers', () => {
    const e = env({ [RAKIP_ALLOWED_USER_IDS_ENV]: NIMA_ID });
    assert.equal(isRakipUserIdAllowed(null, e), false);
    assert.equal(isRakipUserIdAllowed('', e), false);
    assert.equal(isRakipUserIdAllowed('nima.tabrizi@zebra.local', e), false);
    assert.equal(isRakipUserIdAllowed('NİMA TABRİZİ', e), false);
  });

  it('does not match by name even if name-like string is in env', () => {
    const e = env({
      [RAKIP_ALLOWED_USER_IDS_ENV]: 'Nima Tabrizi,nima.tabrizi@zebra.local',
    });
    assert.equal(parseRakipAllowedUserIds(e).size, 0);
    assert.equal(isRakipUserIdAllowed(NIMA_ID, e), false);
  });
});

describe('rakip UI meta', () => {
  it('recognizes rakip tab ids', () => {
    assert.equal(isRakipTabId('rakip-ozet'), true);
    assert.equal(isRakipTabId('ivo-fsbo'), false);
  });

  it('keeps scan executor and nightly automation disabled in shell phase', () => {
    assert.equal(RAKIP_SCAN_EXECUTOR_READY, false);
    assert.equal(RAKIP_NIGHTLY_AUTOMATION_READY, false);
    const shell = buildRakipShellPayload();
    assert.equal(shell.inventoryReady, false);
    assert.equal(shell.scanExecutorReady, false);
    assert.equal(shell.nightlyAutomationReady, false);
    assert.equal(shell.brands.length, 13);
    assert.equal(RAKIP_TRACKED_BRANDS.length, 13);
  });
});
