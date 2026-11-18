import { cb360Json, readJsonBody, cb360Route } from '@/lib/cb360/http';
import { createCb360LiveDeps } from '@/lib/cb360/server';
import { startScanRun } from '@/lib/cb360/service';
import type { Cb360RunMode } from '@/lib/cb360/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  mode?: Cb360RunMode;
  configVersion?: string;
  plannedBrandCount?: number;
  requestedBy?: string;
};

export const POST = cb360Route(async (request: Request) => {
  const body = (await readJsonBody<Body>(request).catch(() => ({}))) as Body;
  const deps = createCb360LiveDeps();
  const result = await startScanRun(deps, {
    mode: body.mode === 'production' ? 'production' : 'synthetic',
    configVersion: body.configVersion,
    plannedBrandCount: body.plannedBrandCount,
    requestedBy: body.requestedBy,
  });
  return cb360Json(result, 201);
});
