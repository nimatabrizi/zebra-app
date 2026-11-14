import { NextResponse } from 'next/server';
import { getIvoSessionStatus } from '../../../../lib/ivoApiClient';
import { runIvoCorpusSync, type IvoSyncFeed } from '../../../../lib/ivoSync';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Arka plan sync — yalnızca sunucu/cron.
 * Auth:
 *   - x-ivo-sync-secret / Authorization: Bearer $IVO_SYNC_SECRET
 *   - veya Vercel Cron: Authorization: Bearer $CRON_SECRET
 * Kullanıcı arayüzünden tetiklenmez.
 */
function authorizeSync(request: Request): boolean {
  const syncSecret = process.env.IVO_SYNC_SECRET?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const header =
    request.headers.get('x-ivo-sync-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';
  if (syncSecret && header === syncSecret) return true;
  if (cronSecret && header === cronSecret) return true;
  // Vercel Cron bazen sadece bu header’ı gönderir
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) {
    return true;
  }
  return false;
}

function deny() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * GET — Vercel Cron bu path’i GET ile çağırır → sync çalışır.
 * ?status=1 ile yalnızca oturum durumu (secret gerekir).
 */
export async function GET(request: Request) {
  if (!authorizeSync(request)) return deny();
  try {
    const statusOnly = new URL(request.url).searchParams.get('status') === '1';
    if (statusOnly) {
      const session = await getIvoSessionStatus();
      return NextResponse.json({
        session: {
          configured: session.configured,
          ok: session.ok,
          expired: session.expired,
          daysLeft: session.daysLeft,
          expIso: session.expIso,
          error: session.error,
          me: session.me
            ? {
                id: session.me.id,
                visname: session.me.visname,
                company_name: session.me.company_name,
              }
            : null,
        },
      });
    }

    if (!process.env.IVO_NCT_TOKEN?.trim()) {
      return NextResponse.json(
        { error: 'IVO_NCT_TOKEN tanımlı değil' },
        { status: 503 }
      );
    }
    const result = await runIvoCorpusSync();
    return NextResponse.json({
      ...result,
      session: {
        configured: result.session.configured,
        ok: result.session.ok,
        expired: result.session.expired,
        daysLeft: result.session.daysLeft,
        expIso: result.session.expIso,
        error: result.session.error,
        me: result.session.me
          ? {
              id: result.session.me.id,
              visname: result.session.me.visname,
              company_name: result.session.me.company_name,
            }
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — corpus sync (sadece secret) */
export async function POST(request: Request) {
  if (!authorizeSync(request)) return deny();

  try {
    if (!process.env.IVO_NCT_TOKEN?.trim()) {
      return NextResponse.json(
        { error: 'IVO_NCT_TOKEN tanımlı değil' },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      feeds?: IvoSyncFeed[];
      enrichCoords?: boolean;
      maxPagesLarge?: number;
      maxPagesSmall?: number;
    };

    const result = await runIvoCorpusSync({
      feeds: Array.isArray(body.feeds) ? body.feeds : undefined,
      enrichCoords: body.enrichCoords,
      maxPagesLarge:
        typeof body.maxPagesLarge === 'number' ? body.maxPagesLarge : undefined,
      maxPagesSmall:
        typeof body.maxPagesSmall === 'number' ? body.maxPagesSmall : undefined,
    });

    return NextResponse.json({
      ...result,
      session: {
        configured: result.session.configured,
        ok: result.session.ok,
        expired: result.session.expired,
        daysLeft: result.session.daysLeft,
        expIso: result.session.expIso,
        error: result.session.error,
        me: result.session.me
          ? {
              id: result.session.me.id,
              visname: result.session.me.visname,
              company_name: result.session.me.company_name,
            }
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
