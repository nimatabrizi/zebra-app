/**
 * Server-side gate for /api/rakip-ui/* — session + UUID allowlist.
 * Menu visibility is not a security boundary.
 */

import {
  getAppointmentCaller,
  type AppointmentCaller,
} from './appointmentsAccess';
import { isRakipUserIdAllowed, type RakipEnvBag } from './rakipAccess';

export type RakipGateOk = {
  ok: true;
  caller: AppointmentCaller;
};

export type RakipGateFail = {
  ok: false;
  status: number;
  message: string;
};

export async function assertRakipUiAccess(
  env: RakipEnvBag = process.env
): Promise<RakipGateOk | RakipGateFail> {
  const session = await getAppointmentCaller();
  if (!session.ok) {
    return {
      ok: false,
      status: session.status,
      message: session.message,
    };
  }

  if (!isRakipUserIdAllowed(session.caller.userId, env)) {
    return {
      ok: false,
      status: 403,
      message: 'Bu modül için yetkiniz yok',
    };
  }

  return { ok: true, caller: session.caller };
}
