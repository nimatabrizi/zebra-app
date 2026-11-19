import { NextResponse } from 'next/server';
import { assertRakipUiAccess } from '../../../../lib/rakipGate';
import {
  listInventoryOffices,
  listInventoryPeople,
  loadRakipInventoryBundle,
  type RakipBrandClass,
} from '../../../../lib/rakip/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
} as const;

function json(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  });
}

/**
 * GET /api/rakip-ui/inventory
 * UUID-gated read-only inventory for RakipStudio.
 * Precedence: memory → Staging durable store → local snapshot path → local xlsx.
 * Never uploads/publishes; never returns phone/email/WhatsApp.
 * Never caches across users (no-store).
 *
 * Query:
 *   view=summary|offices|people|review
 *   brand, brandClass, province, office, q, limit, offset
 */
export async function GET(request: Request) {
  const gate = await assertRakipUiAccess();
  if (!gate.ok) {
    return json({ error: gate.message }, { status: gate.status });
  }

  const url = new URL(request.url);
  const view = (url.searchParams.get('view') || 'summary').toLowerCase();
  const brandClassRaw = url.searchParams.get('brandClass');
  const brandClass =
    brandClassRaw === 'research_target' ||
    brandClassRaw === 'archive_only' ||
    brandClassRaw === 'unknown' ||
    brandClassRaw === 'all'
      ? (brandClassRaw as RakipBrandClass | 'all')
      : undefined;

  const query = {
    brand: url.searchParams.get('brand') || undefined,
    brandClass,
    province: url.searchParams.get('province') || undefined,
    office: url.searchParams.get('office') || undefined,
    q: url.searchParams.get('q') || undefined,
    limit: url.searchParams.get('limit')
      ? Number(url.searchParams.get('limit'))
      : undefined,
    offset: url.searchParams.get('offset')
      ? Number(url.searchParams.get('offset'))
      : undefined,
  };

  const loaded = await loadRakipInventoryBundle();
  if (!loaded.ok) {
    return json({
      inventoryReady: false,
      reason: loaded.reason,
      message: loaded.message,
      schemaVersion: 'rakip-inventory-view-v1',
      inventoryStatusLabel: 'Son Kayıtlı Envanter',
    });
  }

  const { bundle } = loaded;

  if (view === 'offices') {
    const page = listInventoryOffices(bundle, query);
    return json({
      inventoryReady: true,
      view: 'offices',
      source: loaded.source,
      ...page,
    });
  }

  if (view === 'people') {
    const page = listInventoryPeople(bundle, query);
    return json({
      inventoryReady: true,
      view: 'people',
      source: loaded.source,
      ...page,
    });
  }

  if (view === 'review') {
    return json({
      inventoryReady: true,
      view: 'review',
      source: loaded.source,
      meta: bundle.meta,
      total: bundle.reviewQueue.length,
      items: bundle.reviewQueue,
      notifications: 'not_sent',
    });
  }

  return json({
    inventoryReady: true,
    view: 'summary',
    source: loaded.source,
    meta: bundle.meta,
    inventoryStatusLabel: bundle.meta.inventoryStatusLabel,
    provinces: [
      ...new Set(bundle.offices.map((o) => o.province).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'tr')),
    reviewQueueCount: bundle.reviewQueue.length,
    fromCache: loaded.fromCache,
  });
}
