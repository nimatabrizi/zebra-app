import { NextResponse } from 'next/server';
import {
  callerCanUpdateAppointment,
  getAppointmentCaller,
  sanitizeAppointmentPatch,
} from '../../../../lib/appointmentsAccess';
import { createServiceClient } from '../../../../utils/supabase/admin';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Appointment güncelleme — service role + sahiplik + alan/durum sanitizasyonu.
 * Pilot login rolü `pilot` iken eski RLS update de kırılıyordu.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const gate = await getAppointmentCaller();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'id gerekli' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 });
    }

    // id / created_by değiştirilemez
    const incoming = { ...body };
    delete incoming.id;
    delete incoming.created_by;
    delete incoming.created_at;
    delete incoming.updated_at;

    if (Object.keys(incoming).length === 0) {
      return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 });
    }

    const admin = createServiceClient();
    const { data: existing, error: loadError } = await admin
      .from('appointments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 });
    }

    if (
      !callerCanUpdateAppointment(
        existing as Record<string, unknown>,
        gate.caller
      )
    ) {
      return NextResponse.json({ error: 'Bu kayıt için yetkiniz yok' }, { status: 403 });
    }

    const sanitized = sanitizeAppointmentPatch(
      existing as Record<string, unknown>,
      incoming,
      gate.caller
    );
    if (!sanitized.ok) {
      return NextResponse.json(
        { error: sanitized.message },
        { status: sanitized.status }
      );
    }

    const { data: updated, error: updateError } = await admin
      .from('appointments')
      .update(sanitized.patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ appointment: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
