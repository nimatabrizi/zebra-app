import {
  isUserAdmin,
  type AppRole,
} from './authIdentity';
import { createClient } from '../utils/supabase/server';
import { RAKIP_INVENTORY_STAGING_REF } from './rakip/inventory/stagingEnv';

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

export type AdminGateEnvBag = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

/** Extract https://<ref>.supabase.co project ref (fail-closed on bad URL). */
export function authSupabaseProjectRef(
  url: string | null | undefined
): string | null {
  if (!url || !String(url).trim()) return null;
  try {
    const parsed = new URL(String(url).trim());
    const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Name-based user-admin is blocked when:
 * - Auth URL is the CB360 Staging project, or
 * - Auth project identity is missing/unparseable (fail closed — no bypass).
 * Known non-Staging refs (e.g. Production) keep existing isUserAdmin(name) behavior.
 * Server-side only — does not change Rakip UUID allowlist.
 */
export function isNameBasedUserAdminBlockedForAuthEnv(
  env?: AdminGateEnvBag
): boolean {
  // Optional bag for tests; omit to read process.env at call time.
  // Avoid `env = process.env` default — ProcessEnv is not assignable to AdminGateEnvBag (TS2559).
  const source: AdminGateEnvBag | NodeJS.ProcessEnv = env ?? process.env;
  const ref = authSupabaseProjectRef(source.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) return true;
  return ref === RAKIP_INVENTORY_STAGING_REF;
}

export async function assertCallerIsUserAdmin(): Promise<
  AdminGateOk | AdminGateFail
> {
  // Staging Auth Preview: never elevate via display name alone.
  if (isNameBasedUserAdminBlockedForAuthEnv()) {
    return {
      ok: false,
      status: 403,
      message: 'Bu işlem için yetkiniz yok',
    };
  }

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
