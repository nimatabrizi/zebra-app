/**
 * IVO ofis API istemcisi (sunucu tarafı).
 * Token: IVO_NCT_TOKEN (Bearer) — tarayıcı localStorage['nct_token'] ile aynı.
 * SMS gerekmez; JWT süresi dolunca yeniden bir kez giriş gerekir.
 */

export type IvoAuthMe = {
  id: number | string;
  visname?: string;
  company_name?: string;
  cardname?: string;
  active?: number;
  abonelik?: { aktif?: boolean; kalan_gun?: number; bitis?: string };
};

export type IvoApiErrorKind = 'missing_token' | 'unauthorized' | 'http' | 'network' | 'parse';

export class IvoApiError extends Error {
  readonly kind: IvoApiErrorKind;
  readonly httpStatus?: number;

  constructor(kind: IvoApiErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = 'IvoApiError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

function apiBase(): string {
  return (
    process.env.IVO_API_BASE?.replace(/\/$/, '') || 'https://app.ivo.tc/api'
  );
}

export function getIvoToken(): string | null {
  const t = process.env.IVO_NCT_TOKEN?.trim();
  return t || null;
}

/** JWT exp (unix sn) — imza doğrulamaz, sadece uyarı için. */
export function peekIvoTokenExpiry(token = getIvoToken()): {
  exp: number | null;
  expired: boolean;
  daysLeft: number | null;
} {
  if (!token) return { exp: null, expired: true, daysLeft: null };
  try {
    const part = token.split('.')[1];
    if (!part) return { exp: null, expired: false, daysLeft: null };
    const json = JSON.parse(
      Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
        'utf8'
      )
    ) as { exp?: number };
    const exp = typeof json.exp === 'number' ? json.exp : null;
    if (!exp) return { exp: null, expired: false, daysLeft: null };
    const now = Math.floor(Date.now() / 1000);
    const daysLeft = Math.floor((exp - now) / 86400);
    return { exp, expired: exp <= now, daysLeft };
  } catch {
    return { exp: null, expired: false, daysLeft: null };
  }
}

export async function ivoRequest<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<T> {
  const token = getIvoToken();
  if (!token) {
    throw new IvoApiError(
      'missing_token',
      'IVO_NCT_TOKEN tanımlı değil. Ofis IVO oturumu sunucuya kaydedilmemiş.'
    );
  }
  const expiry = peekIvoTokenExpiry(token);
  if (expiry.expired) {
    throw new IvoApiError(
      'unauthorized',
      'IVO oturumu süresi dolmuş. Bir kez SMS ile IVO’ya girip token’ı yenileyin.'
    );
  }

  const method = opts?.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (e) {
    throw new IvoApiError(
      'network',
      e instanceof Error ? e.message : 'IVO ağ hatası'
    );
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new IvoApiError(
      'unauthorized',
      'IVO yetkisiz (401/403). Oturum düşmüş olabilir — bir kez yeniden giriş.',
      res.status
    );
  }
  if (!res.ok) {
    throw new IvoApiError(
      'http',
      `IVO HTTP ${res.status}: ${text.slice(0, 200)}`,
      res.status
    );
  }

  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IvoApiError('parse', 'IVO JSON parse hatası', res.status);
  }
}

export async function ivoAuthMe(): Promise<IvoAuthMe> {
  return ivoRequest<IvoAuthMe>('/auth/me');
}

export type IvoSessionStatus = {
  configured: boolean;
  ok: boolean;
  expired: boolean;
  daysLeft: number | null;
  expIso: string | null;
  me: IvoAuthMe | null;
  error: string | null;
};

export async function getIvoSessionStatus(): Promise<IvoSessionStatus> {
  const token = getIvoToken();
  const peek = peekIvoTokenExpiry(token);
  const expIso =
    peek.exp != null
      ? new Date(peek.exp * 1000).toISOString()
      : null;

  if (!token) {
    return {
      configured: false,
      ok: false,
      expired: true,
      daysLeft: null,
      expIso: null,
      me: null,
      error: 'IVO_NCT_TOKEN yok',
    };
  }
  if (peek.expired) {
    return {
      configured: true,
      ok: false,
      expired: true,
      daysLeft: 0,
      expIso,
      me: null,
      error: 'JWT süresi dolmuş',
    };
  }

  try {
    const me = await ivoAuthMe();
    return {
      configured: true,
      ok: true,
      expired: false,
      daysLeft: peek.daysLeft,
      expIso,
      me,
      error: null,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      expired: peek.expired,
      daysLeft: peek.daysLeft,
      expIso,
      me: null,
      error: e instanceof Error ? e.message : 'IVO oturum kontrolü başarısız',
    };
  }
}
