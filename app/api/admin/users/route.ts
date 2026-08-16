import { NextResponse } from 'next/server';
import { assertCallerIsUserAdmin } from '../../../../lib/adminGate';
import { createServiceClient } from '../../../../utils/supabase/admin';
import { consultantPhotoPublicUrl } from '../../../../lib/studioAssets';
import { isPilotAccount, normalizeAppRole } from '../../../../lib/authIdentity';
import type { Profile } from '../../../../types/profiles';
import { pickProfileDetails } from '../../../../lib/profileFields';

export const runtime = 'nodejs';

export type AdminUserRow = Pick<
  Profile,
  | 'id'
  | 'tam_isim'
  | 'unvan'
  | 'whatsapp_number'
  | 'is_pilot'
  | 'takim_ekip'
  | 'kulup_uyelikleri'
  | 'dogum_gunu'
  | 'beden'
  | 'ise_giris_tarihi'
  | 'blue_start'
  | 'kartvizit'
  | 'branda'
  | 'giris_gorseli'
  | 'yaka_karti'
  | 'folkart_karti'
  | 'cbx'
  | 'cbx_kayit'
  | 'ofis'
  | 'sube'
> & {
  role: string;
  photoUrl: string | null;
  created_at: string | null;
};

function pickUnvan(row: Record<string, unknown>): string | null {
  const raw =
    row.unvan ?? row.title ?? row.job_title ?? row.pozisyon ?? null;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

export async function GET() {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const admin = createServiceClient();
    // select('*') — şemada olmayan kolon adı (unvan vb.) hataya düşmesin
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .order('tam_isim', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users: AdminUserRow[] = (data || []).map((row) => {
      const r = row as Record<string, unknown>;
      const name = String(r.tam_isim || '');
      const rawRole = String(r.role || '');
      return {
        id: String(r.id),
        tam_isim: name,
        role: String(normalizeAppRole(rawRole) || rawRole),
        unvan: pickUnvan(r),
        whatsapp_number:
          r.whatsapp_number != null ? String(r.whatsapp_number) : null,
        is_pilot:
          Boolean(r.is_pilot) ||
          isPilotAccount({ role: rawRole, fullName: name }),
        ...pickProfileDetails(r),
        photoUrl: name ? consultantPhotoPublicUrl(name) : null,
        created_at: r.created_at != null ? String(r.created_at) : null,
      };
    });

    const counts = users.reduce(
      (acc, u) => {
        const key = String(normalizeAppRole(u.role) || u.role || 'diger');
        acc.byRole[key] = (acc.byRole[key] || 0) + 1;
        if (isPilotAccount({ role: u.role, fullName: u.tam_isim, is_pilot: u.is_pilot })) {
          acc.pilots += 1;
        }
        return acc;
      },
      { total: 0, pilots: 0, byRole: {} as Record<string, number> }
    );
    counts.total = users.length;

    return NextResponse.json({ users, counts });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Kullanıcı listesi alınamadı';
    console.error('admin/users GET:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
