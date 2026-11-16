/**
 * Sahibinden ilan URL çözümleme + sayfa ayrıştırma.
 * IVO modeli: istemci Sahibinden'e gitmez; sunucu sync eder, uygulama kendi DB'sinden okur.
 *
 * Faz 0 bulgu: datacenter / otomasyon IP'lerinde Cloudflare + "olağan dışı erişim"
 * engeli var. Doğrudan fetch çoğu ortamda başarısız; HTML ingest yolu pipeline'ı kanıtlar.
 */

export type ParsedSahibindenListing = {
  source: 'sahibinden';
  listingNo: string;
  url: string;
  title: string | null;
  priceTl: number | null;
  priceM2: number | null;
  areaM2: number | null;
  rooms: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  whom: string | null;
  kind: string | null;
  listingType: string | null; // satilik | kiralik
  dateText: string | null;
  status: 'active' | 'inactive' | 'unknown';
  raw: Record<string, string>;
};

export type SahibindenBlockKind =
  | 'cloudflare'
  | 'unusual_access'
  | 'http_error'
  | 'not_found'
  | 'empty'
  | 'invalid_input';

export class SahibindenFetchError extends Error {
  readonly kind: SahibindenBlockKind;
  readonly httpStatus?: number;

  constructor(kind: SahibindenBlockKind, message: string, httpStatus?: number) {
    super(message);
    this.name = 'SahibindenFetchError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

/** /ilan/123… veya …-daire-1337269958/detay slug’u */
const LISTING_NO_RES = [
  /(?:ilan[/-]|classifiedId[=:])(\d{8,12})\b/i,
  /(?:^|[^\d])(\d{8,12})(?:\/detay|$|\?|#)/i,
  /-(\d{8,12})(?:\/|$|\?|#)/,
];

const TR_SLUG_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
  â: 'a',
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
};

export type SahibindenUrlMeta = {
  title?: string | null;
  kind?: string | null;
  status?: string | null;
};

export function extractSahibindenListingNo(input: string): string | null {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^\d{8,12}$/.test(s)) return s;
  for (const re of LISTING_NO_RES) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Slug’suz `/ilan/{no}` — Sahibinden’de 404. */
export function isBareSahibindenListingUrl(url: string): boolean {
  const path = String(url || '')
    .trim()
    .split(/[?#]/)[0]
    .replace(/^https?:\/\/(?:www\.)?sahibinden\.com/i, '');
  return /^\/ilan\/\d{8,12}\/?$/i.test(path);
}

function transliterateTr(s: string): string {
  return String(s || '').replace(
    /[çÇğĞıIİöÖşŞüÜâÂîÎûÛ]/g,
    (ch) => TR_SLUG_MAP[ch] || ch
  );
}

/** IVO / Sahibinden başlık slug’u (1+1 → 1-plus1, m² → m2, 2.045 korunur). */
export function slugifySahibindenTitle(title: string): string {
  const DOT = '\uE000';
  return transliterateTr(title)
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/\+/g, '-plus')
    .replace(/['’]/g, '-')
    .replace(/&/g, ' ')
    .replace(/(\d+)\.(\d+)/g, (_, a: string, b: string) => `${a}${DOT}${b}`)
    .replace(/[^a-z0-9\uE000]+/g, '-')
    .replace(new RegExp(DOT, 'g'), '.')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function kindPathSegment(kind: string | null | undefined): string {
  const k = transliterateTr(String(kind || ''))
    .toLowerCase()
    .trim();
  if (!k) return 'konut';
  if (k === 'arazi') return 'arsa';
  if (k === 'is yeri') return 'is-yeri';
  return k.replace(/\s+/g, '-') || 'konut';
}

function statusPathSegment(status: string | null | undefined): string {
  const s = transliterateTr(String(status || '')).toLowerCase();
  if (s.includes('kira')) return 'kiralik';
  return 'satilik';
}

/**
 * IVO’nun verdiği göreli path ile aynı format:
 * `/ilan/emlak-{kind}-{status}-{title-slug}-{no}/detay`
 */
export function buildSahibindenListingPath(
  listingNo: string | number,
  meta?: SahibindenUrlMeta
): string | null {
  const no = String(listingNo ?? '')
    .replace(/\D/g, '')
    .trim();
  if (no.length < 8) return null;
  const titleSlug = slugifySahibindenTitle(String(meta?.title || '').trim());
  if (!titleSlug) return null;
  return `/ilan/emlak-${kindPathSegment(meta?.kind)}-${statusPathSegment(meta?.status)}-${titleSlug}-${no}/detay`;
}

export function buildSahibindenListingUrl(
  listingNo: string | number,
  meta?: SahibindenUrlMeta
): string | null {
  const path = buildSahibindenListingPath(listingNo, meta);
  return path ? `https://www.sahibinden.com${path}` : null;
}

export function normalizeSahibindenUrl(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let abs: string | null = null;

  // Göreli path: /ilan/baslik-slug-123…/detay
  if (raw.startsWith('/')) {
    abs = `https://www.sahibinden.com${raw.split(/[?#]/)[0]}`;
  } else if (/^(?:www\.)?sahibinden\.com\//i.test(raw)) {
    abs = `https://${raw.replace(/^https?:\/\//i, '').split(/[?#]/)[0]}`;
  } else if (/^https?:\/\/([^/]*\.)?sahibinden\.com\//i.test(raw)) {
    try {
      const u = new URL(raw);
      u.hash = '';
      abs = u.toString();
    } catch {
      abs = null;
    }
  }

  if (abs) {
    if (isBareSahibindenListingUrl(abs)) return null;
    return abs;
  }

  // Salt ilan no → slug’suz URL üretme (404)
  return null;
}

/**
 * IVO kart / satır URL’sini Sahibinden absolut linke çevir.
 * Göreli `/ilan/…-no/detay` yollarını korur; slug yoksa başlıktan üretir.
 * Asla slug’suz `/ilan/{no}` döndürmez (404).
 */
export function resolveSahibindenListingUrl(
  url: string | null | undefined,
  listingNo?: string | number | null,
  meta?: SahibindenUrlMeta
): string {
  const raw = url != null ? String(url).trim() : '';
  if (raw) {
    const normalized = normalizeSahibindenUrl(raw);
    if (normalized) return normalized;
    if (raw.startsWith('/') && !isBareSahibindenListingUrl(raw)) {
      return `https://www.sahibinden.com${raw.split(/[?#]/)[0]}`;
    }
    if (/^https?:\/\//i.test(raw) && !isBareSahibindenListingUrl(raw)) {
      return raw.split(/[?#]/)[0];
    }
  }

  const no = String(listingNo ?? '')
    .replace(/\D/g, '')
    .trim();
  const built = no ? buildSahibindenListingUrl(no, meta) : null;
  if (built) return built;

  return 'https://www.sahibinden.com';
}

function parsePriceToTl(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i'
  );
  return html.match(re)?.[1] || html.match(re2)?.[1] || null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Info satırları: "m²: 135", "Oda Sayısı: 3+1" vb. */
function extractInfoPairs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: string) => {
    const key = decodeHtml(k).trim().toLocaleLowerCase('tr-TR').replace(/:$/, '');
    const val = decodeHtml(v).trim();
    if (key && val && !out[key]) out[key] = val;
  };

  // <li>Kimden:<span>Sahibinden</span></li>  (Sahibinden klasik)
  let m: RegExpExecArray | null;
  const reInline =
    /<(?:li|div|dt|th)[^>]*>\s*([^<:]{1,40})\s*:\s*<(?:span|strong|dd|td)[^>]*>\s*([^<]{1,80})\s*</gi;
  while ((m = reInline.exec(html))) put(m[1]!, m[2]!);

  // Etiket kapalı, değer sonraki hücrede
  const reSplit =
    /<(?:li|div|dt|th)[^>]*>\s*([^<:]{2,40})\s*:?\s*<\/(?:li|div|dt|th)>\s*<(?:span|strong|dd|td)[^>]*>\s*([^<]{1,80})\s*</gi;
  while ((m = reSplit.exec(html))) put(m[1]!, m[2]!);

  const re2 =
    /class=["'][^"']*classifiedInfo[^"']*["'][^>]*>[\s\S]{0,200}?>([^<]{2,40})<\/[\s\S]{0,80}?>([^<]{1,80})</gi;
  while ((m = re2.exec(html))) put(m[1]!, m[2]!);

  return out;
}

function pick(raw: Record<string, string>, keys: string[]): string | null {
  // Önce tam eşleşme (kısa anahtarlar: "il" ⊂ "ilan tarihi" tuzağı)
  for (const k of keys) {
    if (raw[k]) return raw[k]!;
  }
  for (const k of keys) {
    if (k.length < 3) continue; // "il" gibi kısa anahtarları substring yapma
    for (const [rk, rv] of Object.entries(raw)) {
      if (rk.includes(k) && rv) return rv;
    }
  }
  return null;
}

export function detectSahibindenBlock(
  html: string,
  httpStatus?: number
): SahibindenBlockKind | null {
  const head = html.slice(0, 8000);
  if (/just a moment|cf-chl|challenge-platform|challenges\.cloudflare/i.test(head)) {
    return 'cloudflare';
  }
  if (
    /ola[ğg]an\s*d[iı][sş][iı]\s*eri[sş]im|olagan-disi-kullanim|destek kodu/i.test(
      head
    )
  ) {
    return 'unusual_access';
  }
  if (httpStatus === 404 || /ilan bulunamad[ıi]|yay[ıi]nda de[ğg]il|kald[ıi]r[ıi]ld[ıi]/i.test(head)) {
    if (httpStatus === 404 || /ilan bulunamad[ıi]/i.test(head)) return 'not_found';
  }
  if (!html.trim()) return 'empty';
  return null;
}

function inferListingStatus(html: string): 'active' | 'inactive' | 'unknown' {
  if (
    /yay[ıi]ndan kald[ıi]r[ıi]ld[ıi]|ilan yay[ıi]nda de[ğg]il|bu ilan yay[ıi]nda de[ğg]il|pasife al[ıi]nd[ıi]/i.test(
      html.slice(0, 12000)
    )
  ) {
    return 'inactive';
  }
  if (metaContent(html, 'og:title') || /classifiedInfo|product:price/i.test(html)) {
    return 'active';
  }
  return 'unknown';
}

export function parseSahibindenHtml(
  html: string,
  url: string,
  listingNo: string
): ParsedSahibindenListing {
  const block = detectSahibindenBlock(html);
  if (block === 'cloudflare' || block === 'unusual_access') {
    throw new SahibindenFetchError(
      block,
      block === 'cloudflare'
        ? 'Sahibinden Cloudflare engeli (Just a moment). Sunucu IP’si geçemiyor.'
        : 'Sahibinden olağan dışı erişim engeli. Otomasyon / veri merkezi IP’si engellenmiş.'
    );
  }

  const title =
    decodeHtml(metaContent(html, 'og:title') || '') ||
    decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') || '') ||
    null;
  const ogDesc = metaContent(html, 'og:description');
  const priceFromMeta = parsePriceToTl(
    metaContent(html, 'product:price:amount') ||
      html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/"price"\s*:\s*"?(\d[\d.\s]*)"?/i)?.[1]
  );
  const priceFromTitle = parsePriceToTl(
    title?.match(/([\d.\s]+)\s*(?:TL|₺)/i)?.[1] || null
  );
  const priceFromBody = parsePriceToTl(
    html.match(/classifiedInfo[^>]*>[\s\S]{0,400}?([\d.\s]{4,})\s*(?:TL|₺)/i)?.[1] ||
      html.match(/>([\d.\s]{5,})\s*TL</i)?.[1]
  );

  const raw = extractInfoPairs(html);
  const areaRaw = pick(raw, ['m²', 'm2', 'brut', 'net']);
  const areaM2 = areaRaw ? Number(String(areaRaw).replace(/[^\d.]/g, '')) || null : null;
  const rooms = pick(raw, ['oda sayısı', 'oda sayisi', 'oda']);
  const whom = pick(raw, ['kimden']);
  const kind = pick(raw, ['emlak tipi', 'kategori', 'tip']);
  const dateText = pick(raw, ['ilan tarihi', 'tarih']);

  const locBits =
    metaContent(html, 'og:title')
      ?.split(/[-|·]/)
      .map((x) => x.trim())
      .filter(Boolean) || [];

  let city: string | null = pick(raw, ['il', 'şehir', 'sehir']);
  let district: string | null = pick(raw, ['ilçe', 'ilce']);
  let neighborhood: string | null = pick(raw, ['mahalle', 'semt']);

  const crumb = html.match(
    /sahibinden\.com\/(?:satilik|kiralik)[^"']*|breadcrumb[\s\S]{0,800}/i
  )?.[0];
  if (crumb) {
    const parts = Array.from(
      crumb.matchAll(/>([A-ZÇĞİÖŞÜa-zçğıöşü0-9][^<]{1,40})</g)
    ).map((x) => decodeHtml(x[1]!).trim());
    if (!city && parts.length >= 2) city = parts[parts.length - 3] || null;
    if (!district && parts.length >= 1) district = parts[parts.length - 2] || null;
    if (!neighborhood && parts.length) neighborhood = parts[parts.length - 1] || null;
  }

  const listingType = /kiralik/i.test(url + html.slice(0, 5000))
    ? 'kiralik'
    : /satilik/i.test(url + html.slice(0, 5000))
      ? 'satilik'
      : null;

  const priceTl = priceFromMeta || priceFromBody || priceFromTitle;
  const priceM2 =
    priceTl && areaM2 && areaM2 > 0 ? Math.round(priceTl / areaM2) : null;
  const status = inferListingStatus(html);

  return {
    source: 'sahibinden',
    listingNo,
    url,
    title: title || locBits[0] || null,
    priceTl,
    priceM2,
    areaM2: areaM2 && Number.isFinite(areaM2) ? areaM2 : null,
    rooms,
    city,
    district,
    neighborhood,
    whom,
    kind,
    listingType,
    dateText,
    status,
    raw: {
      ...raw,
      ...(ogDesc ? { og_description: decodeHtml(ogDesc) } : {}),
    },
  };
}

/** Canlı sayfa çek — provider (proxy) üzerinden; CF’de SahibindenFetchError. */
export async function fetchSahibindenListing(
  input: string
): Promise<ParsedSahibindenListing> {
  const listingNo = extractSahibindenListingNo(input);
  const url = normalizeSahibindenUrl(input);
  if (!listingNo || !url) {
    throw new SahibindenFetchError(
      'invalid_input',
      'Geçerli bir Sahibinden ilan linki veya ilan numarası girin.'
    );
  }

  const { fetchSahibindenHtml, describeSahibindenFetchProvider } = await import(
    './sahibindenFetchProvider'
  );
  const info = describeSahibindenFetchProvider();
  const { html, httpStatus, provider } = await fetchSahibindenHtml(url);
  const block = detectSahibindenBlock(html, httpStatus);

  if (block === 'cloudflare') {
    throw new SahibindenFetchError(
      'cloudflare',
      provider === 'direct'
        ? `Sahibinden Cloudflare engeli. ${info.hint}`
        : `Sahibinden Cloudflare engeli (provider=${provider}). Stealth/residential ayarını kontrol edin.`,
      httpStatus
    );
  }
  if (block === 'unusual_access') {
    throw new SahibindenFetchError(
      'unusual_access',
      `Sahibinden olağan dışı erişim engeli (provider=${provider}).`,
      httpStatus
    );
  }
  if (httpStatus >= 400) {
    throw new SahibindenFetchError(
      httpStatus === 404 ? 'not_found' : 'http_error',
      `Sahibinden / proxy yanıt vermedi (${httpStatus}, provider=${provider}).`,
      httpStatus
    );
  }
  if (block === 'not_found') {
    throw new SahibindenFetchError('not_found', 'İlan bulunamadı veya yayında değil.', 404);
  }

  return parseSahibindenHtml(html, url, listingNo);
}

/** Kullanıcı / eklenti HTML verdiğinde parse (CF bypass yolu). */
export function parseSahibindenListingHtml(
  input: string,
  html: string
): ParsedSahibindenListing {
  const listingNo = extractSahibindenListingNo(input);
  const url = normalizeSahibindenUrl(input);
  if (!listingNo || !url) {
    throw new SahibindenFetchError(
      'invalid_input',
      'Geçerli bir Sahibinden ilan linki veya ilan numarası girin.'
    );
  }
  if (!html || html.trim().length < 200) {
    throw new SahibindenFetchError('empty', 'HTML boş veya çok kısa.');
  }
  return parseSahibindenHtml(html, url, listingNo);
}

/** Engeli ölç — UI / ops için (seçili provider ile). */
export async function probeSahibindenAccess(input?: string): Promise<{
  ok: boolean;
  kind: SahibindenBlockKind | 'ok' | 'network';
  httpStatus?: number;
  message: string;
  listingNo?: string;
  provider?: string;
}> {
  const sample = input?.trim() || 'https://www.sahibinden.com/';
  const listingNo = extractSahibindenListingNo(sample) || undefined;
  const url = listingNo
    ? normalizeSahibindenUrl(sample)!
    : 'https://www.sahibinden.com/';
  try {
    const { fetchSahibindenHtml, describeSahibindenFetchProvider } = await import(
      './sahibindenFetchProvider'
    );
    const info = describeSahibindenFetchProvider();
    const { html, httpStatus, provider } = await fetchSahibindenHtml(url);
    const block = detectSahibindenBlock(html, httpStatus);
    if (block) {
      return {
        ok: false,
        kind: block,
        httpStatus,
        listingNo,
        provider,
        message:
          block === 'cloudflare'
            ? `Cloudflare (${provider}) — ${info.hint}`
            : block === 'unusual_access'
              ? `Olağan dışı erişim (${provider})`
              : block,
      };
    }
    if (httpStatus >= 400) {
      return {
        ok: false,
        kind: 'http_error',
        httpStatus,
        listingNo,
        provider,
        message: `HTTP ${httpStatus} (${provider})`,
      };
    }
    return {
      ok: true,
      kind: 'ok',
      httpStatus,
      listingNo,
      provider,
      message: `Erişim OK (${provider})`,
    };
  } catch (e) {
    return {
      ok: false,
      kind: 'network',
      listingNo,
      message: e instanceof Error ? e.message : 'Ağ hatası',
    };
  }
}

export function isFsboWhom(whom: string | null | undefined): boolean {
  if (!whom) return false;
  const w = whom.toLocaleLowerCase('tr-TR');
  return w.includes('sahibinden') || w.includes('sahibi');
}
