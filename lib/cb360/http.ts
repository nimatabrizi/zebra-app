import { NextResponse } from 'next/server';
import { authorizeCb360MachineRequest, redactForLogs } from './auth';
import { Cb360Error } from './types';

export function cb360Json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function cb360ErrorResponse(err: unknown) {
  if (err instanceof Cb360Error) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.httpStatus }
    );
  }
  console.error('[cb360]', redactForLogs({ message: String(err) }));
  return NextResponse.json(
    { error: 'Internal error', code: 'internal' },
    { status: 500 }
  );
}

export function withCb360Auth(
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      authorizeCb360MachineRequest(request);
      return await handler(request);
    } catch (err) {
      return cb360ErrorResponse(err);
    }
  };
}

/** Auth + uniform error envelope for route handlers that may throw Cb360Error. */
export function cb360Route(
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return withCb360Auth(handler);
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Cb360Error('invalid_payload', 'JSON body gerekli', 400);
  }
}
