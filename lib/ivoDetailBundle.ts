/**
 * IVO ilan detay paketi — detail + v4 + yan uçlar.
 * AI üretimi yok; ham ürün yüzeyleri.
 */

import { ivoRequest } from './ivoApiClient';
import {
  fetchIvoPropertyDetail,
  type IvoPropertyDetail,
} from './ivoPropertyDetail';

export type IvoV4Emsal = {
  no?: number | string;
  baslik?: string;
  net_m2?: number | null;
  foto?: string | null;
  fiyat?: number | null;
  m2_fiyat?: number | null;
  lat?: number | null;
  lng?: number | null;
  aidat?: number | null;
  yas?: number | null;
  yas_etiket?: string | null;
  olanak?: number | null;
  olanak_etiket?: string | null;
  benzerlik?: string | null;
  aktif?: boolean;
  gorulme_tarihi?: string | null;
  gorulme_gun?: number | null;
  fark_pct?: number | null;
};

export type IvoV4MedianMetric = {
  deger?: number | null;
  etiket?: string | null;
  sapma_pct?: number | null;
  ton?: string | null;
  min?: number | null;
  max?: number | null;
  [key: string]: unknown;
};

export type IvoV4Payload = {
  surum?: string;
  no?: number;
  hesap_zamani?: string;
  veri_tarihi?: string;
  onbellek?: boolean;
  ilan?: {
    no?: number;
    baslik?: string;
    kiralik?: boolean;
    aktif?: boolean;
    fiyat?: number;
    alan?: { net?: number; brut?: number };
    m2_fiyat?: number;
    aidat?: number | null;
    yas?: number | null;
    yas_etiket?: string | null;
    olanak?: number | null;
    olanak_etiket?: string | null;
    olanak_max?: number | null;
    site_ici?: boolean;
    konum?: {
      lat?: number;
      lng?: number;
      city?: string;
      district?: string;
      neighborhood?: string;
    };
    [key: string]: unknown;
  };
  kume?: {
    durum?: string;
    aday_sayisi?: number;
    emsal_sayisi?: number;
    elenen_sayisi?: number;
    aktif_sayisi?: number;
    pasif_sayisi?: number;
    tanim?: Record<string, unknown>;
    [key: string]: unknown;
  };
  emsal?: IvoV4Emsal[];
  elenen?: {
    sayi?: number;
    nedenler?: Record<string, unknown>;
    liste?: unknown[];
  };
  istatistik?: {
    n?: number;
    medyan?: number;
    q1?: number;
    q3?: number;
    min?: number;
    max?: number;
    medyan_toplam_fiyat?: number;
    formul?: string;
  };
  medyanlar?: {
    fiyat?: IvoV4MedianMetric;
    m2_fiyat?: IvoV4MedianMetric;
    alan?: IvoV4MedianMetric;
    yas?: IvoV4MedianMetric;
    aidat?: IvoV4MedianMetric;
    olanak?: IvoV4MedianMetric;
  };
  konum?: {
    sapma_pct?: number;
    kisa?: string;
    uzun?: string;
    ucuz_sayisi?: number;
    pahali_sayisi?: number;
  };
  gecmis?: {
    ilk_fiyat?: number;
    guncel_fiyat?: number;
    degisim_sayisi?: number;
    yayinda_gun?: number;
    ivo_ilk_kayit?: string;
    ilan_tarihi?: string;
    guncel_tarih?: string;
    degisimler?: unknown[];
  };
  bulgular?: Record<string, unknown>;
  uretilmedi?: Array<{ alan?: string; sebep?: string }>;
  [key: string]: unknown;
};

export type IvoSahipIstatistik = {
  arastirma_toplam?: number;
  arastiran_kisi?: number;
  iletisim_kisi?: number;
  ara_kisi?: number;
  whatsapp_kisi?: number;
  sms_kisi?: number;
  ara_kez?: number;
  whatsapp_kez?: number;
  sms_kez?: number;
  mesaj_kisi?: number;
  mesaj_kez?: number;
  ben?: {
    ara?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    mesaj?: boolean;
  };
  ofisimden?: unknown[];
};

export type IvoPriceHistoryPayload = {
  no?: number;
  first_price?: number;
  first_date?: string;
  current_price?: number;
  current_date?: string;
  is_active?: boolean;
  change_count?: number;
  changes?: Array<{
    date?: string;
    price?: number;
    prev?: number | null;
    diff?: number | null;
    pct?: number | null;
    usd?: number | null;
    eur?: number | null;
  }>;
  status_changes?: Array<{ date?: string; status?: string }>;
  days_listed?: number;
  region?: {
    avg_price?: number;
    avg_m2_price?: number;
    count?: number;
    scope?: string;
  };
};

export type IvoOpportunityScore = {
  no?: number;
  score?: number;
  band?: string;
  percentile?: number;
  confidence?: string;
  components?: Array<{
    key?: string;
    weight?: number;
    points?: number;
    available?: boolean;
    reason?: string;
  }>;
  reasons?: string[];
  disclaimer?: string;
};

export type IvoTwinMeta = {
  total?: number;
  ikiz_kesin?: number;
  ikiz_olasi?: number;
  parsel_kardesleri?: number;
  destek?: boolean;
};

export type IvoDetailBundle = {
  detail: IvoPropertyDetail;
  v4: IvoV4Payload | null;
  sahipIstatistik: IvoSahipIstatistik | null;
  priceHistory: IvoPriceHistoryPayload | null;
  opportunity: IvoOpportunityScore | null;
  twins: { items: unknown[]; meta: IvoTwinMeta | null };
};

async function soft<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function unwrapData<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { success?: boolean; data?: T };
  if ('data' in o) return (o.data as T) ?? null;
  return raw as T;
}

export async function fetchIvoDetailBundle(
  listingNo: string
): Promise<IvoDetailBundle> {
  const no = String(listingNo || '').replace(/\D/g, '');
  if (!no || no.length < 8) throw new Error('Geçersiz ilan no');

  const [detail, v4Raw, sahipRaw, histRaw, oppRaw, twinsRaw] =
    await Promise.all([
      fetchIvoPropertyDetail(no),
      soft(() =>
        ivoRequest<{ success?: boolean; data?: IvoV4Payload }>(
          `/properties/${no}/v4`
        )
      ),
      soft(() =>
        ivoRequest<{ success?: boolean; data?: IvoSahipIstatistik }>(
          `/properties/${no}/sahip-istatistik`
        )
      ),
      soft(() =>
        ivoRequest<{ success?: boolean; data?: IvoPriceHistoryPayload }>(
          `/properties/${no}/price-history`
        )
      ),
      soft(() =>
        ivoRequest<{ success?: boolean; data?: IvoOpportunityScore }>(
          `/properties/${no}/opportunity-score`
        )
      ),
      soft(() =>
        ivoRequest<{
          success?: boolean;
          data?: unknown[];
          meta?: IvoTwinMeta;
        }>(`/properties/${no}/twins?view=detail&limit=20`)
      ),
    ]);

  const twinsData = twinsRaw as {
    data?: unknown[];
    meta?: IvoTwinMeta;
  } | null;

  return {
    detail,
    v4: unwrapData<IvoV4Payload>(v4Raw),
    sahipIstatistik: unwrapData<IvoSahipIstatistik>(sahipRaw),
    priceHistory: unwrapData<IvoPriceHistoryPayload>(histRaw),
    opportunity: unwrapData<IvoOpportunityScore>(oppRaw),
    twins: {
      items: Array.isArray(twinsData?.data)
        ? twinsData!.data!
        : Array.isArray(unwrapData(twinsRaw))
          ? (unwrapData(twinsRaw) as unknown[])
          : [],
      meta: twinsData?.meta || null,
    },
  };
}
