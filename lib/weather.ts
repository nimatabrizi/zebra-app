/**
 * Open-Meteo hava durumu — API key yok.
 * Forecast: weather_code + wind_speed_10m_max (14 gün)
 */

export type DayWeather = {
  /** YYYY-MM-DD */
  date: string;
  weatherCode: number;
  /** Maks. rüzgar 10m (km/h) — UI'da km/s olarak gösterilir */
  windMaxKmh: number;
  emoji: string;
  label: string;
};

export type WeatherByDate = Record<string, DayWeather>;

type Coords = { lat: number; lon: number };

/** İl merkezleri (fallback) */
const IL_COORDS: Record<string, Coords> = {
  Adana: { lat: 37.0, lon: 35.3213 },
  Adıyaman: { lat: 37.7648, lon: 38.2786 },
  Afyonkarahisar: { lat: 38.7507, lon: 30.5567 },
  Ağrı: { lat: 39.7191, lon: 43.0503 },
  Aksaray: { lat: 38.3687, lon: 34.037 },
  Amasya: { lat: 40.6499, lon: 35.8353 },
  Ankara: { lat: 39.9334, lon: 32.8597 },
  Antalya: { lat: 36.8969, lon: 30.7133 },
  Ardahan: { lat: 41.1105, lon: 42.7022 },
  Artvin: { lat: 41.1828, lon: 41.8183 },
  Aydın: { lat: 37.856, lon: 27.8416 },
  Balıkesir: { lat: 39.6484, lon: 27.8826 },
  Bartın: { lat: 41.6358, lon: 32.3375 },
  Batman: { lat: 37.8812, lon: 41.1351 },
  Bayburt: { lat: 40.2552, lon: 40.2249 },
  Bilecik: { lat: 40.1506, lon: 29.983 },
  Bingöl: { lat: 38.8854, lon: 40.4966 },
  Bitlis: { lat: 38.4006, lon: 42.1095 },
  Bolu: { lat: 40.735, lon: 31.6061 },
  Burdur: { lat: 37.7205, lon: 30.2906 },
  Bursa: { lat: 40.1885, lon: 29.061 },
  Çanakkale: { lat: 40.1553, lon: 26.4142 },
  Çankırı: { lat: 40.6013, lon: 33.6134 },
  Çorum: { lat: 40.5506, lon: 34.9556 },
  Denizli: { lat: 37.7765, lon: 29.0864 },
  Diyarbakır: { lat: 37.9144, lon: 40.2306 },
  Düzce: { lat: 40.8438, lon: 31.1565 },
  Edirne: { lat: 41.6771, lon: 26.5557 },
  Elazığ: { lat: 38.681, lon: 39.2264 },
  Erzincan: { lat: 39.75, lon: 39.5 },
  Erzurum: { lat: 39.9043, lon: 41.2679 },
  Eskişehir: { lat: 39.7767, lon: 30.5206 },
  Gaziantep: { lat: 37.0662, lon: 37.3833 },
  Giresun: { lat: 40.9128, lon: 38.3895 },
  Gümüşhane: { lat: 40.4386, lon: 39.5086 },
  Hakkari: { lat: 37.5744, lon: 43.7408 },
  Hatay: { lat: 36.4018, lon: 36.3498 },
  Iğdır: { lat: 39.888, lon: 44.0048 },
  Isparta: { lat: 37.7648, lon: 30.5566 },
  İstanbul: { lat: 41.0082, lon: 28.9784 },
  İzmir: { lat: 38.4192, lon: 27.1287 },
  Kahramanmaraş: { lat: 37.5858, lon: 36.9371 },
  Karabük: { lat: 41.2061, lon: 32.6204 },
  Karaman: { lat: 37.1759, lon: 33.2287 },
  Kars: { lat: 40.6013, lon: 43.0975 },
  Kastamonu: { lat: 41.3887, lon: 33.7827 },
  Kayseri: { lat: 38.7312, lon: 35.4787 },
  Kırıkkale: { lat: 39.8468, lon: 33.5153 },
  Kırklareli: { lat: 41.735, lon: 27.2252 },
  Kırşehir: { lat: 39.1425, lon: 34.1709 },
  Kilis: { lat: 36.7184, lon: 37.1212 },
  Kocaeli: { lat: 40.8533, lon: 29.8815 },
  Konya: { lat: 37.8746, lon: 32.4932 },
  Kütahya: { lat: 39.4192, lon: 29.9857 },
  Malatya: { lat: 38.3552, lon: 38.3095 },
  Manisa: { lat: 38.6191, lon: 27.4289 },
  Mardin: { lat: 37.3212, lon: 40.7245 },
  Mersin: { lat: 36.8121, lon: 34.6415 },
  Muğla: { lat: 37.2153, lon: 28.3636 },
  Muş: { lat: 38.9462, lon: 41.7539 },
  Nevşehir: { lat: 38.6939, lon: 34.6857 },
  Niğde: { lat: 37.9667, lon: 34.6833 },
  Ordu: { lat: 40.9839, lon: 37.8764 },
  Osmaniye: { lat: 37.0742, lon: 36.2478 },
  Rize: { lat: 41.0201, lon: 40.5234 },
  Sakarya: { lat: 40.7889, lon: 30.4053 },
  Samsun: { lat: 41.2867, lon: 36.33 },
  Siirt: { lat: 37.9333, lon: 41.95 },
  Sinop: { lat: 42.0231, lon: 35.1531 },
  Sivas: { lat: 39.7477, lon: 37.0179 },
  Şanlıurfa: { lat: 37.1674, lon: 38.7955 },
  Şırnak: { lat: 37.5183, lon: 42.4611 },
  Tekirdağ: { lat: 40.9833, lon: 27.5167 },
  Tokat: { lat: 40.3167, lon: 36.55 },
  Trabzon: { lat: 41.0027, lon: 39.7168 },
  Tunceli: { lat: 39.1079, lon: 39.5401 },
  Uşak: { lat: 38.6823, lon: 29.4082 },
  Van: { lat: 38.5012, lon: 43.373 },
  Yalova: { lat: 40.65, lon: 29.2667 },
  Yozgat: { lat: 39.8181, lon: 34.8147 },
  Zonguldak: { lat: 41.4564, lon: 31.7987 },
};

const geoCache = new Map<string, Coords | null>();
const forecastCache = new Map<
  string,
  { at: number; byDate: WeatherByDate }
>();

const FORECAST_TTL_MS = 30 * 60 * 1000;

/** WMO weather_code → emoji + kısa etiket */
export function weatherCodeToMeta(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Açık' };
  if (code === 1) return { emoji: '🌤️', label: 'Az bulutlu' };
  if (code === 2) return { emoji: '⛅', label: 'Parçalı bulutlu' };
  if (code === 3) return { emoji: '☁️', label: 'Kapalı' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Sis' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Çisenti' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Yağmur' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'Kar' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: 'Sağanak' };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', label: 'Kar sağanağı' };
  if (code >= 95 && code <= 99) return { emoji: '⛈️', label: 'Fırtına' };
  return { emoji: '☁️', label: 'Bulutlu' };
}

export function locationCacheKey(
  il?: string | null,
  ilce?: string | null
): string {
  return `${(il || '').trim().toLocaleLowerCase('tr-TR')}|${(ilce || '').trim().toLocaleLowerCase('tr-TR')}`;
}

/** DD.MM.YYYY veya Date → YYYY-MM-DD */
export function toIsoDateKey(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

function findIlCoords(il: string): Coords | null {
  if (!il) return null;
  if (IL_COORDS[il]) return IL_COORDS[il];
  const key = Object.keys(IL_COORDS).find(
    (k) => k.toLocaleLowerCase('tr-TR') === il.toLocaleLowerCase('tr-TR')
  );
  return key ? IL_COORDS[key] : null;
}

/**
 * İlçe için Open-Meteo geocoding; başarısızsa il merkezi.
 * Ağ / parse hatalarında asla throw etmez.
 */
export async function resolveLocationCoords(
  il?: string | null,
  ilce?: string | null
): Promise<Coords | null> {
  try {
    const key = locationCacheKey(il, ilce);
    if (geoCache.has(key)) return geoCache.get(key) ?? null;

    const ilFallback = il ? findIlCoords(il) : null;

    if (ilce && ilce.trim() && ilce !== 'Merkez') {
      try {
        const q = encodeURIComponent(`${ilce.trim()}, ${il || 'Türkiye'}`);
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=tr&countryCode=TR`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const results = Array.isArray(data?.results) ? data.results : [];
          const ilLower = (il || '').toLocaleLowerCase('tr-TR');
          const match =
            results.find((r: { admin1?: string; name?: string }) =>
              String(r.admin1 || '')
                .toLocaleLowerCase('tr-TR')
                .includes(ilLower)
            ) || results[0];
          if (match?.latitude != null && match?.longitude != null) {
            const coords = {
              lat: Number(match.latitude),
              lon: Number(match.longitude),
            };
            if (Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
              geoCache.set(key, coords);
              return coords;
            }
          }
        }
      } catch {
        /* ağ kopması → il fallback */
      }
    }

    geoCache.set(key, ilFallback);
    return ilFallback;
  } catch {
    return il ? findIlCoords(il) : null;
  }
}

function parseForecastDaily(data: unknown): WeatherByDate {
  try {
    const daily = (data as { daily?: Record<string, unknown> })?.daily;
    if (!daily) return {};
    const time = daily.time;
    if (!Array.isArray(time) || time.length === 0) return {};

    const codes = (daily.weather_code || daily.weathercode || []) as number[];
    const winds = (daily.wind_speed_10m_max ||
      daily.windspeed_10m_max ||
      []) as number[];
    const byDate: WeatherByDate = {};

    time.forEach((date, i) => {
      try {
        if (typeof date !== 'string' || !date) return;
        const code = Number(codes[i] ?? 3);
        const meta = weatherCodeToMeta(Number.isFinite(code) ? code : 3);
        const wind = Number(winds[i] ?? 0);
        byDate[date] = {
          date,
          weatherCode: Number.isFinite(code) ? code : 3,
          windMaxKmh: Number.isFinite(wind) ? wind : 0,
          emoji: meta.emoji,
          label: meta.label,
        };
      } catch {
        /* tek gün bozuksa atla */
      }
    });
    return byDate;
  } catch {
    return {};
  }
}

/**
 * 14 günlük tahmin — konum başına cache.
 * Ağ / API hatalarında boş obje döner; asla throw etmez.
 */
export async function fetchLocationForecast(
  il?: string | null,
  ilce?: string | null
): Promise<WeatherByDate> {
  try {
    if (!il) return {};

    const key = locationCacheKey(il, ilce);
    const cached = forecastCache.get(key);
    if (cached && Date.now() - cached.at < FORECAST_TTL_MS) {
      return cached.byDate;
    }

    const coords = await resolveLocationCoords(il, ilce);
    if (!coords) return cached?.byDate || {};

    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lon),
      daily: 'weather_code,wind_speed_10m_max',
      forecast_days: '14',
      timezone: 'Europe/Istanbul',
      wind_speed_unit: 'kmh',
    });

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    );
    if (!res.ok) return cached?.byDate || {};

    const json = await res.json().catch(() => null);
    if (!json) return cached?.byDate || {};

    const byDate = parseForecastDaily(json);
    forecastCache.set(key, { at: Date.now(), byDate });
    return byDate;
  } catch {
    try {
      const key = locationCacheKey(il, ilce);
      return forecastCache.get(key)?.byDate || {};
    } catch {
      return {};
    }
  }
}

export function getDayFromForecast(
  byDate: WeatherByDate | null | undefined,
  dateValue: unknown
): DayWeather | null {
  try {
    if (!byDate || typeof byDate !== 'object') return null;
    const iso = toIsoDateKey(dateValue);
    if (!iso) return null;
    return byDate[iso] || null;
  } catch {
    return null;
  }
}
