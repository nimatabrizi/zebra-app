import { cb360Json, readJsonBody, cb360Route } from '@/lib/cb360/http';
import { createCb360LiveDeps } from '@/lib/cb360/server';
import { authorizeUpload } from '@/lib/cb360/service';
import { Cb360Error } from '@/lib/cb360/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  runId?: string;
  leaseToken?: string;
  artifact?: 'source_xlsx';
};

export const POST = cb360Route(async (request: Request) => {
  const body = await readJsonBody<Body>(request);
  if (!body.runId || !body.leaseToken) {
    throw new Cb360Error('invalid_payload', 'runId ve leaseToken gerekli', 400);
  }
  const deps = createCb360LiveDeps();
  const result = await authorizeUpload(deps, {
    runId: body.runId,
    leaseToken: body.leaseToken,
    artifact: body.artifact,
  });
  return cb360Json(result);
});
