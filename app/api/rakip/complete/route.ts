import { cb360Json, readJsonBody, cb360Route } from '@/lib/cb360/http';
import { createCb360LiveDeps } from '@/lib/cb360/server';
import { completeScanRun } from '@/lib/cb360/service';
import { Cb360Error, type Cb360BrandResult } from '@/lib/cb360/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Body = {
  runId?: string;
  leaseToken?: string;
  clientSha256?: string;
  objectPath?: string;
  brandResults?: Cb360BrandResult[];
  plannedBrandCount?: number;
  forcePartial?: boolean;
  forceFailed?: boolean;
};

export const POST = cb360Route(async (request: Request) => {
  const body = await readJsonBody<Body>(request);
  if (!body.runId || !body.leaseToken || !body.clientSha256) {
    throw new Cb360Error(
      'invalid_payload',
      'runId, leaseToken ve clientSha256 gerekli',
      400
    );
  }
  if (!Array.isArray(body.brandResults)) {
    throw new Cb360Error('invalid_payload', 'brandResults dizi olmalı', 400);
  }

  const deps = createCb360LiveDeps();
  const result = await completeScanRun(deps, {
    runId: body.runId,
    leaseToken: body.leaseToken,
    clientSha256: body.clientSha256,
    objectPath: body.objectPath,
    brandResults: body.brandResults,
    plannedBrandCount: body.plannedBrandCount,
    forcePartial: body.forcePartial,
    forceFailed: body.forceFailed,
  });
  return cb360Json(result);
});
