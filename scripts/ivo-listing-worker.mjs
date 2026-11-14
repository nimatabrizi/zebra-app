#!/usr/bin/env node
/**
 * IVO organizer worker spike
 *
 * 1) Supabase migration 20261114_ivo_listing_jobs.sql uygulanmış olmalı
 * 2) .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IVO_WORKER_SECRET
 * 3) App ayakta: npm run dev
 * 4) Bu script tick atar:
 *      npm run ivo:worker
 *      npm run ivo:worker -- --loop
 *
 * Mimari: app enqueue → ivo_listing_jobs → worker tick → Sahibinden fetch → ivo_listings
 * Not: Datacenter IP'de Cloudflare engeli beklenir; kuyruk+claim kanıtlanır.
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

const args = new Set(process.argv.slice(2));
const loop = args.has('--loop');
const limit = Number(
  (process.argv.find((a) => a.startsWith('--limit=')) || '--limit=5').split(
    '='
  )[1]
);
const base =
  process.env.IVO_WORKER_APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://127.0.0.1:3000';
const secret = process.env.IVO_WORKER_SECRET;

if (!secret) {
  console.error('IVO_WORKER_SECRET eksik (.env.local)');
  process.exit(1);
}

async function tick() {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/ivo/worker/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ivo-worker-secret': secret,
    },
    body: JSON.stringify({
      limit,
      workerId: `cli-${process.pid}`,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  console.log(
    new Date().toISOString(),
    `provider=${json.provider || '?'} claimed=${json.claimed} done=${json.done} failed=${json.failed}`
  );
  for (const r of json.results || []) {
    console.log(
      ' ',
      r.ok ? 'OK' : 'FAIL',
      r.listing_no,
      r.kind || '',
      r.error ? `— ${r.error}` : ''
    );
  }
  if (json.note) console.log(' ', json.note);
  return json;
}

async function main() {
  console.log(`Worker → ${base}/api/ivo/worker/run (limit=${limit})`);
  if (!loop) {
    await tick();
    return;
  }
  console.log('Loop mode — Ctrl+C ile çık');
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error('tick error', e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
