import {
  isPilotAccount,
  isPilotRole,
  isPersonelRole,
  normalizeAppRole,
  type AppRole,
} from './authIdentity';
import {
  ownerRoleFromPilot,
  pilotOwnsAppointment,
  appointmentNamesMatch,
  normalizeAppointmentStatus,
} from './appointmentUtils';
import { createClient } from '../utils/supabase/server';
import { createServiceClient } from '../utils/supabase/admin';
import type { AppointmentStatus } from '../types/appointments';

export type AppointmentCaller = {
  userId: string;
  fullName: string;
  role: string;
  isPilot: boolean;
};

export async function getAppointmentCaller(): Promise<
  | { ok: true; caller: AppointmentCaller }
  | { ok: false; status: number; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, message: 'Oturum gerekli' };
  }

  const admin = createServiceClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('tam_isim, role, is_pilot')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, status: 403, message: 'Profil bulunamadı' };
  }

  const fullName = String(profile.tam_isim || '');
  const rawRole = String(profile.role || '');
  const role = String(normalizeAppRole(rawRole) || rawRole);
  const isPilot =
    Boolean(profile.is_pilot) ||
    isPilotAccount({ role: rawRole, fullName });

  return {
    ok: true,
    caller: {
      userId: user.id,
      fullName,
      role,
      isPilot,
    },
  };
}

/** RLS bozulsa bile kullanıcının görmesi gereken satırlar (service-role sonrası filtre). */
export function filterAppointmentsForCaller(
  rows: Record<string, unknown>[],
  caller: AppointmentCaller
): Record<string, unknown>[] {
  const role = caller.role as AppRole | string;

  if (role === 'broker') return rows;

  if (isPersonelRole(role)) {
    return rows.filter((row) => String(row.status) === 'kesinlesti');
  }

  if (caller.isPilot || isPilotRole(role) || role === 'pilot') {
    // Pilot yalnız kendi programını / taleplerini görür (diğer pilot sızıntısı yok).
    return rows.filter((row) =>
      pilotOwnsAppointment(
        {
          ownerRole: (row.owner_role as string) || null,
          pilot: (row.pilot as string) || null,
          pilotId: row.pilot_id != null ? String(row.pilot_id) : null,
        },
        { fullName: caller.fullName, userId: caller.userId }
      )
    );
  }

  if (role === 'danisman') {
    return rows.filter((row) => {
      const isOwn =
        String(row.created_by || '') === caller.userId ||
        appointmentNamesMatch(
          row.danisman_ismi != null ? String(row.danisman_ismi) : null,
          caller.fullName
        );
      if (isOwn) return true;
      // Takım / bölge bilgisi: diğer danışmanların aktif çekimleri salt okunur.
      const status = String(row.status || '');
      return (
        status === 'pilot_bekleniyor' ||
        status === 'danisman_onayi_bekliyor' ||
        status === 'kesinlesti'
      );
    });
  }

  return [];
}

export function callerCanUpdateAppointment(
  row: Record<string, unknown>,
  caller: AppointmentCaller
): boolean {
  const role = caller.role as AppRole | string;
  if (role === 'broker') return true;

  if (caller.isPilot || isPilotRole(role) || role === 'pilot') {
    return pilotOwnsAppointment(
      {
        ownerRole: (row.owner_role as string) || null,
        pilot: (row.pilot as string) || null,
        pilotId: row.pilot_id != null ? String(row.pilot_id) : null,
      },
      { fullName: caller.fullName, userId: caller.userId }
    );
  }

  if (role === 'danisman') {
    const isOwner =
      String(row.created_by || '') === caller.userId ||
      appointmentNamesMatch(
        row.danisman_ismi != null ? String(row.danisman_ismi) : null,
        caller.fullName
      );
    const status = String(row.status || '');
    return (
      isOwner &&
      (status === 'pilot_bekleniyor' ||
        status === 'danisman_onayi_bekliyor' ||
        status === 'kesinlesti')
    );
  }

  return false;
}

/** Service-role PATCH için izin verilen kolonlar. */
const APPOINTMENT_PATCH_KEYS = new Set([
  'tarih',
  'saat_blok',
  'il',
  'ilce',
  'semt',
  'konum',
  'portfoy_turu',
  'aciklama',
  'danisman_notu',
  'pilot',
  'pilot_id',
  'owner_role',
  'status',
  'reddedilme_sebebi',
  'source',
  'is_manual',
]);

const NOTE_ONLY_KEYS = new Set(['aciklama', 'danisman_notu']);

const SUBSTANTIVE_KEYS = new Set([
  'tarih',
  'saat_blok',
  'il',
  'ilce',
  'semt',
  'konum',
  'portfoy_turu',
  'pilot',
  'pilot_id',
  'owner_role',
]);

function samePatchValue(left: unknown, right: unknown): boolean {
  const a = left == null || left === '' ? null : String(left).trim();
  const b = right == null || right === '' ? null : String(right).trim();
  return a === b;
}

function isPilotCaller(caller: AppointmentCaller): boolean {
  return (
    caller.isPilot ||
    isPilotRole(caller.role) ||
    caller.role === 'pilot'
  );
}

/**
 * Service-role PATCH gövdesini rol × mevcut status’a göre temizler.
 * UI’daki kesinleşmiş düzenleme kurallarını API’de de zorunlu kılar.
 */
export function sanitizeAppointmentPatch(
  existing: Record<string, unknown>,
  body: Record<string, unknown>,
  caller: AppointmentCaller
):
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; status: number; message: string } {
  const role = caller.role as AppRole | string;
  const currentStatus = normalizeAppointmentStatus(existing.status);
  const raw: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (!APPOINTMENT_PATCH_KEYS.has(key)) continue;
    raw[key] = value;
  }

  if (Object.keys(raw).length === 0) {
    return { ok: false, status: 400, message: 'Güncellenecek alan yok' };
  }

  const requestedStatus =
    raw.status != null
      ? normalizeAppointmentStatus(raw.status)
      : currentStatus;

  const changedKeys = Object.keys(raw).filter(
    (key) => !samePatchValue(raw[key], existing[key])
  );
  const noteChanged = changedKeys.some((key) => NOTE_ONLY_KEYS.has(key));
  const substantiveChanged = changedKeys.some((key) =>
    SUBSTANTIVE_KEYS.has(key)
  );
  const statusRequested =
    raw.status != null &&
    normalizeAppointmentStatus(raw.status) !== currentStatus;

  if (role === 'broker') {
    return { ok: true, patch: raw };
  }

  if (isPilotCaller(caller)) {
    const patch = { ...raw };

    // Pilot kendi takviminden çıkamaz.
    if (patch.pilot != null || patch.owner_role != null || patch.pilot_id != null) {
      const nextPilotName =
        patch.pilot != null ? String(patch.pilot) : String(existing.pilot || '');
      const nextOwner =
        patch.owner_role != null
          ? String(patch.owner_role)
          : ownerRoleFromPilot(nextPilotName);
      const myKey = ownerRoleFromPilot(caller.fullName);
      if (myKey && nextOwner && nextOwner !== myKey) {
        return {
          ok: false,
          status: 403,
          message: 'Yalnızca kendi takviminizdeki randevuları güncelleyebilirsiniz.',
        };
      }
      if (patch.pilot_id != null && String(patch.pilot_id) !== caller.userId) {
        return {
          ok: false,
          status: 403,
          message: 'Yalnızca kendi takviminizdeki randevuları güncelleyebilirsiniz.',
        };
      }
    }

    // Pilot kesinleştiremez — danışman onayı zorunlu (UI: handleDanismanConfirm).
    if (currentStatus === 'pilot_bekleniyor') {
      if (
        statusRequested &&
        requestedStatus !== 'danisman_onayi_bekliyor' &&
        requestedStatus !== 'iptal'
      ) {
        return {
          ok: false,
          status: 400,
          message:
            'Pilot yalnızca teklif gönderebilir veya iptal edebilir; kesinleştirme danışmana aittir.',
        };
      }
    } else if (currentStatus === 'danisman_onayi_bekliyor') {
      if (
        statusRequested &&
        requestedStatus !== 'danisman_onayi_bekliyor' &&
        requestedStatus !== 'iptal' &&
        requestedStatus !== 'pilot_bekleniyor'
      ) {
        return {
          ok: false,
          status: 400,
          message:
            'Kesinleştirme yalnızca danışman tarafından yapılabilir.',
        };
      }
    } else if (currentStatus === 'kesinlesti') {
      if (substantiveChanged) {
        patch.status = 'danisman_onayi_bekliyor';
      } else if (noteChanged && !statusRequested) {
        patch.status = 'kesinlesti';
      } else if (
        statusRequested &&
        requestedStatus !== 'iptal' &&
        requestedStatus !== 'danisman_onayi_bekliyor' &&
        requestedStatus !== 'kesinlesti'
      ) {
        return {
          ok: false,
          status: 400,
          message: 'Kesinleşmiş randevu için geçersiz durum geçişi',
        };
      }
    }

    return { ok: true, patch };
  }

  if (role === 'danisman') {
    const allowedByStatus: Record<AppointmentStatus, Set<string>> = {
      pilot_bekleniyor: new Set([
        'il',
        'ilce',
        'semt',
        'konum',
        'portfoy_turu',
        'aciklama',
        'danisman_notu',
        'pilot',
        'pilot_id',
        'owner_role',
        'status',
        'reddedilme_sebebi',
      ]),
      danisman_onayi_bekliyor: new Set([
        'status',
        'reddedilme_sebebi',
        'aciklama',
        'danisman_notu',
      ]),
      kesinlesti: new Set([
        'tarih',
        'saat_blok',
        'il',
        'ilce',
        'semt',
        'konum',
        'portfoy_turu',
        'aciklama',
        'danisman_notu',
        'pilot',
        'pilot_id',
        'owner_role',
        'status',
        'reddedilme_sebebi',
      ]),
      iptal: new Set([]),
    };

    const allowed = allowedByStatus[currentStatus] || new Set<string>();
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
      if (!allowed.has(key)) {
        return {
          ok: false,
          status: 403,
          message: `Bu durumda "${key}" güncellenemez`,
        };
      }
      patch[key] = raw[key];
    }

    if (currentStatus === 'pilot_bekleniyor') {
      if (statusRequested && requestedStatus !== 'iptal') {
        patch.status = 'pilot_bekleniyor';
      } else if (!statusRequested) {
        patch.status = 'pilot_bekleniyor';
      }
    }

    if (currentStatus === 'danisman_onayi_bekliyor') {
      if (
        statusRequested &&
        requestedStatus !== 'kesinlesti' &&
        requestedStatus !== 'iptal'
      ) {
        return {
          ok: false,
          status: 400,
          message: 'Teklif yalnızca kesinleştirilebilir veya iptal edilebilir',
        };
      }
    }

    if (currentStatus === 'kesinlesti') {
      if (substantiveChanged) {
        patch.status = 'pilot_bekleniyor';
        // Pilot değiştiyse yeni teklif gerekir.
        const pilotChanged =
          (patch.pilot != null &&
            !samePatchValue(patch.pilot, existing.pilot)) ||
          (patch.pilot_id != null &&
            !samePatchValue(patch.pilot_id, existing.pilot_id)) ||
          (patch.owner_role != null &&
            !samePatchValue(patch.owner_role, existing.owner_role));
        if (pilotChanged) {
          patch.tarih = null;
          patch.saat_blok = null;
        }
      } else if (noteChanged && !statusRequested) {
        patch.status = 'kesinlesti';
      } else if (
        statusRequested &&
        requestedStatus !== 'iptal' &&
        requestedStatus !== 'pilot_bekleniyor' &&
        requestedStatus !== 'kesinlesti'
      ) {
        return {
          ok: false,
          status: 400,
          message: 'Kesinleşmiş randevu için geçersiz durum geçişi',
        };
      }
    }

    if (currentStatus === 'iptal') {
      return {
        ok: false,
        status: 403,
        message: 'İptal edilmiş randevu danışman tarafından güncellenemez',
      };
    }

    return { ok: true, patch };
  }

  return { ok: false, status: 403, message: 'Bu kayıt için yetkiniz yok' };
}
