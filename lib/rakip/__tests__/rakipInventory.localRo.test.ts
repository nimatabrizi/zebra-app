/**
 * Optional local read-only validation against a real source.xlsx path.
 * Skips unless RAKIP_INVENTORY_XLSX_PATH is set.
 * Never prints contact values.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clearRakipInventoryCache,
  loadRakipInventoryBundle,
  RAKIP_INVENTORY_XLSX_PATH_ENV,
} from '../inventory';

describe('local source.xlsx read-only validation (optional)', () => {
  it('loads regional inventory without contact leakage when path set', async () => {
    const path = process.env[RAKIP_INVENTORY_XLSX_PATH_ENV];
    if (!path) {
      // Soft skip — CI / default offline runs stay green.
      assert.ok(true);
      return;
    }

    clearRakipInventoryCache();
    const loaded = await loadRakipInventoryBundle(process.env);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;

    const { bundle } = loaded;
    assert.ok(bundle.meta.rawOfficeRows > 0);
    assert.ok(bundle.meta.rawPersonRows > 0);
    assert.ok(bundle.meta.uniquePersonKeys > 0);
    assert.ok(bundle.meta.scopedOfficeCount > 0);
    assert.ok(bundle.meta.scopedPersonCount > 0);
    // Row count ≠ assumed unique humans without key check — keys must be present.
    assert.equal(bundle.meta.uniquePersonKeys <= bundle.meta.rawPersonRows, true);

    const blob = JSON.stringify(bundle);
    // Guard against contact values / header keys — not Turkish words in free notes.
    assert.equal(/\+90\s*\d/.test(blob), false);
    assert.equal(/"Telefon"\s*:/.test(blob), false);
    assert.equal(/"WhatsApp"\s*:/.test(blob), false);
    assert.equal(/"E-posta"\s*:/.test(blob), false);
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(blob), false);
  });
});
