import { cb360Json, cb360Route } from '@/lib/cb360/http';
import { createCb360LiveDeps } from '@/lib/cb360/server';
import { getScanRunStatus } from '@/lib/cb360/service';
import { Cb360Error } from '@/lib/cb360/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const GET = cb360Route(async (request: Request) => {
  const runId = new URL(request.url).searchParams.get('runId')?.trim();
  if (!runId) {
    throw new Cb360Error('invalid_payload', 'runId query gerekli', 400);
  }
  const deps = createCb360LiveDeps();
  const result = await getScanRunStatus(deps, runId);
  return cb360Json(result);
});
