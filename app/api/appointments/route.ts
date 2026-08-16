import { NextResponse } from 'next/server';
import {
  filterAppointmentsForCaller,
  getAppointmentCaller,
} from '../../../lib/appointmentsAccess';
import {
  isPilotAccount,
  isPilotRole,
} from '../../../lib/authIdentity';
import { ownerRoleFromPilot } from '../../../lib/appointmentUtils';
import { createServiceClient } from '../../../utils/supabase/admin';

export const runtime = 'nodejs';

/**
 * Appointments listesi — service role + caller filtresi.
 * profiles.role = pilot olduktan sonra eski appointments RLS
 * (selim/fatima) boş döndüğü için client select yetersiz kalıyordu.
 */
export async function GET() {
  try {
    const gate = await getAppointmentCaller();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const admin = createServiceClient();
    const { data, error } = await admin.from('appointments').select('*');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = filterAppointmentsForCaller(
      (data || []) as Record<string, unknown>[],
      gate.caller
    );

    return NextResponse.json({ appointments: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type ManualAppointmentBody = {
  pilot?: unknown;
  pilot_id?: unknown;
  danisman_ismi?: unknown;
  tarih?: unknown;
  saat_blok?: unknown;
  il?: unknown;
  ilce?: unknown;
  semt?: unknown;
  konum?: unknown;
  portfoy_turu?: unknown;
  aciklama?: unknown;
};

function optionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

/** Pilot / broker tarafından doğrudan kesinleştirilen manuel çekim. */
export async function POST(request: Request) {
  try {
    const gate = await getAppointmentCaller();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const { caller } = gate;
    const isBroker = caller.role === 'broker';
    const isPilot =
      caller.isPilot || isPilotRole(caller.role) || caller.role === 'pilot';
    if (!isBroker && !isPilot) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz yok' },
        { status: 403 }
      );
    }

    let body: ManualAppointmentBody;
    try {
      body = (await request.json()) as ManualAppointmentBody;
    } catch {
      return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
    }

    const danismanName = optionalText(body.danisman_ismi);
    const tarih = optionalText(body.tarih);
    const saatBlok = optionalText(body.saat_blok);
    const il = optionalText(body.il);
    const ilce = optionalText(body.ilce);
    if (!danismanName || !tarih || !saatBlok || !il || !ilce) {
      return NextResponse.json(
        { error: 'Danışman, tarih, saat aralığı, il ve ilçe zorunludur' },
        { status: 400 }
      );
    }

    const admin = createServiceClient();
    let pilotId = caller.userId;
    let pilotName = caller.fullName;

    if (isBroker) {
      const requestedPilotId = optionalText(body.pilot_id);
      if (!requestedPilotId) {
        return NextResponse.json({ error: 'Pilot seçin' }, { status: 400 });
      }
      const { data: pilotProfile, error: pilotError } = await admin
        .from('profiles')
        .select('id, tam_isim, role, is_pilot')
        .eq('id', requestedPilotId)
        .maybeSingle();
      if (
        pilotError ||
        !pilotProfile ||
        (!pilotProfile.is_pilot &&
          !isPilotAccount({
            role: pilotProfile.role,
            fullName: pilotProfile.tam_isim,
          }))
      ) {
        return NextResponse.json(
          { error: 'Geçerli bir pilot seçin' },
          { status: 400 }
        );
      }
      pilotId = String(pilotProfile.id);
      pilotName = String(pilotProfile.tam_isim || '');
    }

    const ownerRole = ownerRoleFromPilot(pilotName);
    if (!ownerRole) {
      return NextResponse.json(
        { error: 'Pilot takvim anahtarı çözülemedi' },
        { status: 400 }
      );
    }

    const locationLabel =
      optionalText(body.konum) ||
      [il, ilce, optionalText(body.semt)].filter(Boolean).join(' / ');
    const payload = {
      created_by: caller.userId,
      created_by_role: caller.role,
      owner_role: ownerRole,
      danisman_ismi: danismanName,
      pilot: pilotName,
      pilot_id: pilotId,
      tarih,
      saat_blok: saatBlok,
      il,
      ilce,
      semt: optionalText(body.semt),
      konum: locationLabel,
      portfoy_turu: optionalText(body.portfoy_turu),
      aciklama: optionalText(body.aciklama),
      status: 'kesinlesti',
      source: 'other',
      is_manual: true,
      reddedilme_sebebi: null,
    };

    const { data: appointment, error: insertError } = await admin
      .from('appointments')
      .insert(payload)
      .select('*')
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const recipients = new Set<string>();
    const { data: consultant } = await admin
      .from('profiles')
      .select('id')
      .ilike('tam_isim', danismanName)
      .limit(1)
      .maybeSingle();
    if (consultant?.id && consultant.id !== caller.userId) {
      recipients.add(String(consultant.id));
    }
    if (pilotId !== caller.userId) recipients.add(pilotId);

    let notificationSent = false;
    if (recipients.size > 0) {
      const rows = Array.from(recipients).map((userId) => ({
        user_id: userId,
        title: 'Yeni Kesinleşmiş Çekim',
        message:
          userId === consultant?.id
            ? `${locationLabel} için ${tarih} • ${saatBlok} çekimi ${pilotName} tarafından kesinleştirildi.`
            : `${danismanName} — ${locationLabel} için ${tarih} • ${saatBlok} çekimi takviminize eklendi.`,
        appointment_id: String(appointment.id),
        link_tab: userId === consultant?.id ? 'randevularim' : 'takvim',
        is_read: false,
      }));
      const { error: notificationError } = await admin
        .from('notifications')
        .insert(rows);
      if (notificationError) {
        console.error(
          'Manuel çekim bildirimleri yazılamadı:',
          notificationError.message
        );
      } else {
        notificationSent = true;
      }
    }

    return NextResponse.json(
      { appointment, notificationSent },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
