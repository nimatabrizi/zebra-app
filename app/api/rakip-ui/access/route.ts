import { NextResponse } from 'next/server';
import { assertRakipUiAccess } from '../../../../lib/rakipGate';

export const runtime = 'nodejs';

/** GET — session + UUID allowlist. Does not leak allowlist contents. */
export async function GET() {
  const gate = await assertRakipUiAccess();
  if (!gate.ok) {
    if (gate.status === 401) {
      return NextResponse.json({ allowed: false, error: gate.message }, { status: 401 });
    }
    return NextResponse.json({ allowed: false, error: gate.message }, { status: 403 });
  }

  return NextResponse.json({
    allowed: true,
    userId: gate.caller.userId,
  });
}
