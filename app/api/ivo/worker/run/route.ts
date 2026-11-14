import { NextResponse } from 'next/server';
import { runWorkerTick } from '../../../../../lib/ivoListingJobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * IVO organizer tick karşılığı.
 * Auth: Authorization: Bearer $IVO_WORKER_SECRET  veya  x-ivo-worker-secret
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.IVO_WORKER_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: 'IVO_WORKER_SECRET tanımlı değil' },
        { status: 503 }
      );
    }
    const header =
      request.headers.get('x-ivo-worker-secret') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (header !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      workerId?: string;
    };

    const result = await runWorkerTick({
      limit: Math.min(Math.max(Number(body.limit) || 5, 1), 20),
      workerId: body.workerId || `api-${process.pid}`,
    });

    return NextResponse.json({
      ...result,
      note:
        result.failed > 0 && result.provider === 'direct'
          ? 'Provider=direct → CF beklenir. .env.local: SCRAPINGBEE_API_KEY=... sonra job’ı yeniden kuyruğa alıp worker çalıştırın.'
          : result.failed > 0
            ? `Provider=${result.provider} hata verdi. ${result.providerHint}`
            : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Worker hatası';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
