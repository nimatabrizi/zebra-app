import { NextResponse } from 'next/server';
import { assertRakipUiAccess } from '../../../../lib/rakipGate';
import { buildRakipShellPayload } from '../../../../lib/rakipUiMeta';

export const runtime = 'nodejs';

/**
 * GET — UI shell metadata for authorized users only.
 * No CB360 machine secrets. No Staging/Production competitor rows in this phase.
 */
export async function GET() {
  const gate = await assertRakipUiAccess();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  return NextResponse.json(buildRakipShellPayload());
}
