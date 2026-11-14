/**
 * Sahibinden HTML çekim kanalları (IVO organizer karşılığı).
 *
 * Env:
 *   SAHIBINDEN_FETCH_PROVIDER=direct|scrapingbee|scraperapi|template
 *   SCRAPINGBEE_API_KEY=...
 *   SCRAPERAPI_KEY=...
 *   SAHIBINDEN_FETCH_URL_TEMPLATE=https://proxy.example/?url={url}
 *     ({url} URL-encoded hedef ile değişir)
 *
 * ScrapingBee: stealth + TR (CF için önerilen)
 * ScraperAPI: country_code=tr&render=true
 */

export type SahibindenFetchProviderName =
  | 'direct'
  | 'scrapingbee'
  | 'scraperapi'
  | 'template';

export type FetchHtmlResult = {
  html: string;
  httpStatus: number;
  provider: SahibindenFetchProviderName;
  finalUrl?: string;
};

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.sahibinden.com/',
};

export function resolveSahibindenFetchProvider(): SahibindenFetchProviderName {
  const raw = (process.env.SAHIBINDEN_FETCH_PROVIDER || '').trim().toLowerCase();
  if (
    raw === 'scrapingbee' ||
    raw === 'scraperapi' ||
    raw === 'template' ||
    raw === 'direct'
  ) {
    return raw;
  }
  if (process.env.SCRAPINGBEE_API_KEY?.trim()) return 'scrapingbee';
  if (process.env.SCRAPERAPI_KEY?.trim()) return 'scraperapi';
  if (process.env.SAHIBINDEN_FETCH_URL_TEMPLATE?.includes('{url}')) {
    return 'template';
  }
  return 'direct';
}

export function describeSahibindenFetchProvider(): {
  provider: SahibindenFetchProviderName;
  configured: boolean;
  hint: string;
} {
  const provider = resolveSahibindenFetchProvider();
  if (provider === 'direct') {
    return {
      provider,
      configured: false,
      hint: 'CF engeli beklenir. .env.local → SCRAPINGBEE_API_KEY veya SCRAPERAPI_KEY ekleyin.',
    };
  }
  return {
    provider,
    configured: true,
    hint: `${provider} aktif`,
  };
}

async function fetchDirect(targetUrl: string): Promise<FetchHtmlResult> {
  const res = await fetch(targetUrl, {
    redirect: 'follow',
    headers: DEFAULT_HEADERS,
    next: { revalidate: 0 },
  });
  return {
    html: await res.text(),
    httpStatus: res.status,
    provider: 'direct',
    finalUrl: res.url,
  };
}

async function fetchScrapingBee(targetUrl: string): Promise<FetchHtmlResult> {
  const key = process.env.SCRAPINGBEE_API_KEY?.trim();
  if (!key) {
    throw new Error('SCRAPINGBEE_API_KEY eksik');
  }
  const stealth = process.env.SCRAPINGBEE_STEALTH !== '0';
  const country = (process.env.SCRAPINGBEE_COUNTRY || 'tr').toLowerCase();
  const qs = new URLSearchParams({
    api_key: key,
    url: targetUrl,
    country_code: country,
    block_resources: 'false',
  });
  if (stealth) {
    qs.set('stealth_proxy', 'true');
  } else {
    qs.set('premium_proxy', 'true');
    qs.set('render_js', 'true');
  }
  const endpoint = `https://app.scrapingbee.com/api/v1/?${qs.toString()}`;
  const res = await fetch(endpoint, {
    redirect: 'follow',
    next: { revalidate: 0 },
  });
  return {
    html: await res.text(),
    httpStatus: res.status,
    provider: 'scrapingbee',
  };
}

async function fetchScraperApi(targetUrl: string): Promise<FetchHtmlResult> {
  const key = process.env.SCRAPERAPI_KEY?.trim();
  if (!key) {
    throw new Error('SCRAPERAPI_KEY eksik');
  }
  const qs = new URLSearchParams({
    api_key: key,
    url: targetUrl,
    country_code: 'tr',
    render: 'true',
  });
  const endpoint = `http://api.scraperapi.com?${qs.toString()}`;
  const res = await fetch(endpoint, {
    redirect: 'follow',
    next: { revalidate: 0 },
  });
  return {
    html: await res.text(),
    httpStatus: res.status,
    provider: 'scraperapi',
  };
}

async function fetchTemplate(targetUrl: string): Promise<FetchHtmlResult> {
  const tpl = process.env.SAHIBINDEN_FETCH_URL_TEMPLATE?.trim();
  if (!tpl || !tpl.includes('{url}')) {
    throw new Error('SAHIBINDEN_FETCH_URL_TEMPLATE {url} içermeli');
  }
  const endpoint = tpl.replaceAll('{url}', encodeURIComponent(targetUrl));
  const res = await fetch(endpoint, {
    redirect: 'follow',
    headers: DEFAULT_HEADERS,
    next: { revalidate: 0 },
  });
  return {
    html: await res.text(),
    httpStatus: res.status,
    provider: 'template',
    finalUrl: res.url,
  };
}

/** Hedef URL HTML’ini seçili provider ile getir. */
export async function fetchSahibindenHtml(
  targetUrl: string
): Promise<FetchHtmlResult> {
  const provider = resolveSahibindenFetchProvider();
  switch (provider) {
    case 'scrapingbee':
      return fetchScrapingBee(targetUrl);
    case 'scraperapi':
      return fetchScraperApi(targetUrl);
    case 'template':
      return fetchTemplate(targetUrl);
    default:
      return fetchDirect(targetUrl);
  }
}
