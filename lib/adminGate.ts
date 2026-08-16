import {
  isUserAdmin,
  type AppRole,
} from './authIdentity';
import { createClient } from '../utils/supabase/server';

export const ADMIN_ALLOWED_ROLES: AppRole[] = [
  'danisman',
  'pilot',
  'broker',
  'personel',
];

export type AdminGateOk = {
  ok: true;
  user: { id: string };
  profile: { tam_isim: string; role: string | null };
};

export type AdminGateFail = {
  ok: false;
  status: number;
  message: string;
};

export async function assertCallerIsUserAdmin(): Promise<
  AdminGateOk | AdminGateFail
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, message: 'Oturum gerekli' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('tam_isim, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, status: 403, message: 'Profil bulunamadı' };
  }

  if (!isUserAdmin(profile.tam_isim, profile.role)) {
    return {
      ok: false,
      status: 403,
      message: 'Bu işlem için yetkiniz yok',
    };
  }

  return {
    ok: true,
    user: { id: user.id },
    profile: {
      tam_isim: String(profile.tam_isim || ''),
      role: profile.role ?? null,
    },
  };
}

export function isAllowedAdminRole(role: string): role is AppRole {
  return (ADMIN_ALLOWED_ROLES as string[]).includes(role);
}
