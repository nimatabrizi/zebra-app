#!/usr/bin/env node
/**
 * IVO → Zebra corpus sync (sunucu / cron)
 *
 *   npm run ivo:sync
 *
 * Gereken env (.env.local veya host):
 *   IVO_NCT_TOKEN, IVO_SYNC_SECRET
 *   IVO_WORKER_APP_URL veya NEXT_PUBLIC_APP_URL (varsayılan http://127.0.0.1:3000)
 *
 * Production cron örneği (her 15 dk):
 *   curl -X POST "$APP_URL/api/ivo/sync" -H "x-ivo-sync-secret: $IVO_SYNC_SECRET"
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

const base =
  process.env.IVO_WORKER_APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://127.0.0.1:3000';
const secret = process.env.IVO_SYNC_SECRET;

if (!secret) {
  console.error('IVO_SYNC_SECRET eksik');
  process.exit(1);
}
if (!process.env.IVO_NCT_TOKEN) {
  console.error('IVO_NCT_TOKEN eksik');
  process.exit(1);
}

async function main() {
  console.log(`IVO sync → ${base.replace(/\/$/, '')}/api/ivo/sync`);
  const res = await fetch(`${base.replace(/\/$/, '')}/api/ivo/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ivo-sync-secret': secret,
    },
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('FAIL', res.status, json.error || json);
    process.exit(1);
  }
  console.log(
    new Date().toISOString(),
    `ok=${json.ok} fetched=${json.totals?.fetched} upserted=${json.totals?.upserted} priceChanges=${json.totals?.priceChanges}`
  );
  console.log(
    'session',
    json.session?.me?.visname || '?',
    `daysLeft=${json.session?.daysLeft}`
  );
  if (json.schema) {
    console.log(' schema', JSON.stringify(json.schema));
  }
  for (const f of json.feeds || []) {
    console.log(
      ' ',
      f.feed,
      f.error
        ? `ERR ${f.error}`
        : `fetched=${f.fetched} upserted=${f.upserted} pages=${f.pages} next=${f.nextOffset} total=${f.totalHint ?? '?'} done=${f.done} Δprice=${f.priceChanges}`
    );
  }
  if (json.snapshots?.keys?.length) {
    console.log(' snapshots', json.snapshots.keys.join(', '));
  }
  if (json.enrich?.map) {
    console.log(
      ' enrich.map',
      `points=${json.enrich.map.points} updated=${json.enrich.map.updated}`,
      json.enrich.map.error || ''
    );
  }
  if (json.enrich?.detail) {
    console.log(
      ' enrich.detail',
      `attempted=${json.enrich.detail.attempted} updated=${json.enrich.detail.updated} errors=${json.enrich.detail.errors}`
    );
  }
  if (!json.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
