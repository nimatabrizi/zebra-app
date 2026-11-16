/**
 * Detail popup analizleri — comps + property detail üzerinden IVO-benzeri yüzeyler.
 * AI / değerleme motoru yok; kural + istatistik.
 */

import type { IvoListingCardModel } from './ivoListingCard';
import type { IvoPropertyDetail } from './ivoPropertyDetail';

export type Peer = IvoListingCardModel & { rank: number; isSubject: boolean };

export type MetricTone = 'good' | 'near' | 'weak' | 'unknown';

export type CompareMetric = {
  id: string;
  label: string;
  subject: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** subject vs median % (yüksek fiyat = zayıf satış için) */
  diffPct: number | null;
  tone: MetricTone;
  /** true = düşük daha iyi (fiyat); false = yüksek daha iyi (m², olanak) */
  lowerIsBetter: boolean;
  format: 'tl' | 'm2price' | 'm2' | 'number' | 'years' | 'bool';
  peers: number[];
};

export type FeatureFlag = {
  key: string;
  label: string;
  kind: 'strong' | 'verify' | 'neutral' | 'mismatch';
};

export type OfferScenario = {
  offerPct: number;
  offerPrice: number;
  medianPrice: number | null;
  vsMedianPct: number | null;
  label: string;
};

export type FinanceSnapshot = {
  price: number;
  downPct: number;
  downPayment: number;
  loanAmount: number;
  annualRatePct: number;
  termMonths: number;
  monthlyPayment: number;
  totalInterest: number;
  estimatedRentMonthly: number | null;
  grossYieldPct: number | null;
  aidatMonthly: number | null;
  depositAnnual: number;
  depositVsLoanGap: number | null;
};

export type DecisionScore = {
  score: number; // 0–100
  label: string;
  bullets: string[];
  positionLabel: string;
  positionDiffPct: number | null;
};

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

function toneFromDiff(
  diffPct: number | null,
  lowerIsBetter: boolean
): MetricTone {
  if (diffPct == null || !Number.isFinite(diffPct)) return 'unknown';
  const adjusted = lowerIsBetter ? diffPct : -diffPct;
  if (adjusted <= -5) return 'good';
  if (adjusted >= 5) return 'weak';
  return 'near';
}

function numFromDetail(
  detail: IvoPropertyDetail,
  keys: string[]
): number | null {
  const top = detail.propertyDetails?.top_details || {};
  const facts = detail.facts || {};
  for (const k of keys) {
    const v = top[k] ?? facts[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
      const years = String(v).match(/(\d+)\s*(yaş|yıl)/i);
      if (years) return Number(years[1]);
    }
  }
  return null;
}

function strFlag(
  detail: IvoPropertyDetail,
  keys: string[]
): string | boolean | null {
  const top = detail.propertyDetails?.top_details || {};
  const facts = detail.facts || {};
  for (const k of keys) {
    const v = top[k] ?? facts[k];
    if (v == null || v === '') continue;
    return v as string | boolean;
  }
  return null;
}

function isTruthyFlag(v: string | boolean | null): boolean | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase().trim();
  if (['var', 'evet', 'uygun', 'true', '1', 'boş', 'krediye uygun'].some((x) => s.includes(x)))
    return true;
  if (['yok', 'hayır', 'uygun değil', 'false', '0'].some((x) => s.includes(x)))
    return false;
  return true;
}

export function peerMedianPrice(peers: Peer[]): number | null {
  return median(
    peers.filter((p) => !p.isSubject).map((p) => p.priceTl).filter((n): n is number => n != null)
  );
}

export function peerMedianM2Price(peers: Peer[]): number | null {
  return median(
    peers.filter((p) => !p.isSubject).map((p) => p.priceM2).filter((n): n is number => n != null)
  );
}

export function buildCompareMetrics(
  detail: IvoPropertyDetail,
  peers: Peer[],
  v4?: {
    medyanlar?: {
      fiyat?: { deger?: number | null; sapma_pct?: number | null; min?: number | null; max?: number | null };
      m2_fiyat?: { deger?: number | null; sapma_pct?: number | null; min?: number | null; max?: number | null };
      alan?: { deger?: number | null; sapma_pct?: number | null; min?: number | null; max?: number | null };
      yas?: { deger?: number | null; sapma_pct?: number | null; min?: number | null; max?: number | null };
      olanak?: { deger?: number | null; sapma_pct?: number | null; min?: number | null; max?: number | null };
    };
    istatistik?: { min?: number; max?: number; medyan?: number };
    emsal?: Array<{
      fiyat?: number | null;
      m2_fiyat?: number | null;
      net_m2?: number | null;
      yas?: number | null;
      olanak?: number | null;
    }>;
    ilan?: {
      olanak?: number | null;
      yas?: number | null;
      fiyat?: number | null;
      m2_fiyat?: number | null;
      alan?: { net?: number };
    };
  } | null
): CompareMetric[] {
  const others = peers.filter((p) => !p.isSubject);
  const prices =
    v4?.emsal?.map((e) => e.fiyat).filter((n): n is number => n != null) ||
    others.map((p) => p.priceTl).filter((n): n is number => n != null);
  const m2ps =
    v4?.emsal?.map((e) => e.m2_fiyat).filter((n): n is number => n != null) ||
    others.map((p) => p.priceM2).filter((n): n is number => n != null);
  const areas =
    v4?.emsal?.map((e) => e.net_m2).filter((n): n is number => n != null) ||
    others.map((p) => p.areaM2).filter((n): n is number => n != null);

  const buildingAge =
    v4?.ilan?.yas ??
    numFromDetail(detail, [
      'Bina Yaşı',
      'Bina Yaşı (Yıl)',
      'bina_yasi',
      'age',
    ]);

  const metrics: CompareMetric[] = [
    {
      id: 'price',
      label: 'Toplam fiyat (ham)',
      subject: v4?.ilan?.fiyat ?? detail.price,
      median: v4?.medyanlar?.fiyat?.deger ?? median(prices),
      min:
        v4?.medyanlar?.fiyat?.min ??
        (prices.length ? Math.min(...prices) : null),
      max:
        v4?.medyanlar?.fiyat?.max ??
        (prices.length ? Math.max(...prices) : null),
      diffPct: v4?.medyanlar?.fiyat?.sapma_pct ?? null,
      tone: 'unknown',
      lowerIsBetter: true,
      format: 'tl',
      peers: prices,
    },
    {
      id: 'm2price',
      label: 'Net m² fiyatı',
      subject: v4?.ilan?.m2_fiyat ?? detail.m2Price,
      median: v4?.medyanlar?.m2_fiyat?.deger ?? median(m2ps),
      min:
        v4?.medyanlar?.m2_fiyat?.min ??
        v4?.istatistik?.min ??
        (m2ps.length ? Math.min(...m2ps) : null),
      max:
        v4?.medyanlar?.m2_fiyat?.max ??
        v4?.istatistik?.max ??
        (m2ps.length ? Math.max(...m2ps) : null),
      diffPct: v4?.medyanlar?.m2_fiyat?.sapma_pct ?? null,
      tone: 'unknown',
      lowerIsBetter: true,
      format: 'm2price',
      peers: m2ps,
    },
    {
      id: 'area',
      label: 'Net m²',
      subject: v4?.ilan?.alan?.net ?? detail.m2,
      median: v4?.medyanlar?.alan?.deger ?? median(areas),
      min:
        v4?.medyanlar?.alan?.min ??
        (areas.length ? Math.min(...areas) : null),
      max:
        v4?.medyanlar?.alan?.max ??
        (areas.length ? Math.max(...areas) : null),
      diffPct: v4?.medyanlar?.alan?.sapma_pct ?? null,
      tone: 'unknown',
      lowerIsBetter: false,
      format: 'm2',
      peers: areas,
    },
  ];

  if (buildingAge != null || v4?.medyanlar?.yas?.deger != null) {
    const ages =
      v4?.emsal?.map((e) => e.yas).filter((n): n is number => n != null) || [];
    metrics.push({
      id: 'age',
      label: 'Bina yaşı',
      subject: buildingAge,
      median: v4?.medyanlar?.yas?.deger ?? median(ages),
      min:
        v4?.medyanlar?.yas?.min ??
        (ages.length ? Math.min(...ages) : buildingAge),
      max:
        v4?.medyanlar?.yas?.max ??
        (ages.length ? Math.max(...ages) : buildingAge),
      diffPct: v4?.medyanlar?.yas?.sapma_pct ?? null,
      tone: 'unknown',
      lowerIsBetter: true,
      format: 'years',
      peers: ages.length ? ages : buildingAge != null ? [buildingAge] : [],
    });
  }

  if (v4?.ilan?.olanak != null || v4?.medyanlar?.olanak?.deger != null) {
    const ol =
      v4?.emsal?.map((e) => e.olanak).filter((n): n is number => n != null) ||
      [];
    metrics.push({
      id: 'amenities',
      label: 'Site olanakları',
      subject: v4?.ilan?.olanak ?? null,
      median: v4?.medyanlar?.olanak?.deger ?? median(ol),
      min: ol.length ? Math.min(...ol) : 0,
      max: ol.length ? Math.max(...ol) : 8,
      diffPct: v4?.medyanlar?.olanak?.sapma_pct ?? null,
      tone: 'unknown',
      lowerIsBetter: false,
      format: 'number',
      peers: ol,
    });
  }

  for (const m of metrics) {
    if (m.diffPct == null && m.subject != null && m.median != null && m.median !== 0) {
      m.diffPct = ((m.subject - m.median) / m.median) * 100;
    }
    m.tone = toneFromDiff(m.diffPct, m.lowerIsBetter);
  }

  return metrics;
}

export function compareSummary(metrics: CompareMetric[]): {
  good: number;
  near: number;
  weak: number;
  ahead: string[];
  behind: string[];
  compared: number;
} {
  const scored = metrics.filter((m) => m.tone !== 'unknown');
  return {
    good: scored.filter((m) => m.tone === 'good').length,
    near: scored.filter((m) => m.tone === 'near').length,
    weak: scored.filter((m) => m.tone === 'weak').length,
    ahead: scored.filter((m) => m.tone === 'good').map((m) => m.label),
    behind: scored.filter((m) => m.tone === 'weak').map((m) => m.label),
    compared: scored.length,
  };
}

export function positionBadge(
  detail: IvoPropertyDetail,
  peers: Peer[],
  v4Konum?: { sapma_pct?: number; kisa?: string; uzun?: string } | null
): { label: string; diffPct: number | null; tone: MetricTone } {
  if (v4Konum?.kisa) {
    const diffPct =
      typeof v4Konum.sapma_pct === 'number' ? v4Konum.sapma_pct : null;
    return {
      label: v4Konum.kisa,
      diffPct,
      tone: toneFromDiff(diffPct, true),
    };
  }
  const med = peerMedianM2Price(peers);
  const statsDiff = detail.priceStats?.diff_pct ?? null;
  let diffPct: number | null = statsDiff;
  if (
    (diffPct == null || !Number.isFinite(diffPct)) &&
    detail.m2Price != null &&
    med != null &&
    med > 0
  ) {
    diffPct = ((detail.m2Price - med) / med) * 100;
  }
  if (diffPct == null) {
    return { label: 'Emsal konum bilinmiyor', diffPct: null, tone: 'unknown' };
  }
  const tone = toneFromDiff(diffPct, true);
  const abs = Math.abs(diffPct).toLocaleString('tr-TR', {
    maximumFractionDigits: 1,
  });
  const sign = diffPct > 0 ? '+' : diffPct < 0 ? '−' : '';
  let label: string;
  if (diffPct > 8) label = `Benzerlerde üst uçta · ${sign}%${abs}`;
  else if (diffPct < -8) label = `Benzerlerde alt uçta · ${sign}%${abs}`;
  else if (Math.abs(diffPct) <= 3) label = `Benzerlerde ortada · ${sign}%${abs}`;
  else if (diffPct > 0) label = `Benzerlerin üstünde · ${sign}%${abs}`;
  else label = `Benzerlerin altında · ${sign}%${abs}`;
  return { label, diffPct, tone };
}

export function buildOfferScenario(
  detail: IvoPropertyDetail,
  peers: Peer[],
  offerPct: number
): OfferScenario | null {
  if (detail.price == null || detail.price <= 0) return null;
  const offerPrice = Math.round(detail.price * (1 + offerPct / 100));
  const medianPrice = peerMedianPrice(peers);
  const vsMedianPct =
    medianPrice != null && medianPrice > 0
      ? ((offerPrice - medianPrice) / medianPrice) * 100
      : null;
  let label = 'Piyasaya yakın teklif';
  if (vsMedianPct != null) {
    if (vsMedianPct <= -8) label = 'Agresif / çekici teklif';
    else if (vsMedianPct >= 8) label = 'Pahalı kalır';
    else if (vsMedianPct < 0) label = 'Medyanın altında';
    else label = 'Medyanın üstünde';
  }
  return { offerPct, offerPrice, medianPrice, vsMedianPct, label };
}

export function extractFeatures(detail: IvoPropertyDetail): FeatureFlag[] {
  const out: FeatureFlag[] = [];
  const top = detail.propertyDetails?.top_details || {};
  const bottom = detail.propertyDetails?.bottom_details || {};

  const strongChecks: { keys: string[]; label: string; want?: boolean }[] = [
    { keys: ['Krediye Uygunluk', 'Krediye Uygun'], label: 'Krediye uygun', want: true },
    { keys: ['Asansör'], label: 'Asansör', want: true },
    { keys: ['Otopark', 'Park Yeri'], label: 'Otopark', want: true },
    { keys: ['Kullanım Durumu'], label: 'Kullanım durumu' },
    { keys: ['Site İçerisinde', 'Site'], label: 'Site olanakları' },
  ];

  for (const c of strongChecks) {
    const raw = strFlag(detail, c.keys);
    if (raw == null) {
      out.push({ key: c.label, label: `${c.label} belirtilmemiş`, kind: 'verify' });
      continue;
    }
    const t = isTruthyFlag(raw);
    if (c.want === true && t === false) {
      out.push({ key: c.label, label: `${c.label}: ${String(raw)}`, kind: 'mismatch' });
    } else if (c.keys[0] === 'Kullanım Durumu') {
      out.push({
        key: c.label,
        label: `Kullanım durumu (${String(raw)})`,
        kind: 'strong',
      });
    } else if (t !== false) {
      const rawStr = String(raw);
      const bare =
        typeof raw === 'boolean' ||
        rawStr.toLowerCase() === 'var' ||
        rawStr.toLowerCase() === 'evet';
      out.push({
        key: c.label,
        label: bare ? c.label : `${c.label} (${rawStr})`,
        kind: 'strong',
      });
    }
  }

  // Site amenities from bottom_details
  for (const [k, v] of Object.entries(bottom)) {
    if (/site|olanak|havuz|spor|güvenlik/i.test(k) && v) {
      const items = Array.isArray(v) ? v : [v];
      const text = items.filter(Boolean).map(String).join(', ');
      if (text) {
        out.push({
          key: `site-${k}`,
          label: `Site olanakları (${text})`,
          kind: 'strong',
        });
      }
    }
  }

  const verifyKeys = [
    ['Aidat', 'Aidat (TL)'],
    ['Enerji Kimlik Belgesi', 'EKB'],
    ['Tapu Durumu', 'Tapu'],
  ];
  for (const keys of verifyKeys) {
    const raw = strFlag(detail, keys);
    if (raw == null || raw === '' || String(raw).toLowerCase() === 'belirtilmemiş') {
      out.push({
        key: keys[0]!,
        label: `${keys[0]} belirtilmemiş`,
        kind: 'verify',
      });
    }
  }

  // Deduplicate by key
  const seen = new Set<string>();
  return out.filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
}

export function dataAdequacy(
  detail: IvoPropertyDetail,
  peerCount: number
): {
  level: 'Yüksek' | 'Orta' | 'Düşük';
  bars: number;
  notes: { ok: boolean | null; text: string }[];
} {
  const historyCount = Object.keys(detail.pastPrices || {}).length;
  const notes: { ok: boolean | null; text: string }[] = [
    {
      ok: peerCount >= 5,
      text: `${Math.max(peerCount, 0)} benzer ilan`,
    },
    {
      ok: historyCount >= 2 ? true : historyCount === 1 ? null : false,
      text:
        historyCount <= 1
          ? `Fiyat geçmişi · ${historyCount} kayıt${historyCount === 1 ? ' (değişim yok)' : ''}`
          : `Fiyat geçmişi · ${historyCount} kayıt`,
    },
    {
      ok: true,
      text: 'Kayıtlar arasında uyuşmazlık görülmedi',
    },
    {
      ok: false,
      text: 'Gerçekleşen satış verisi yok',
    },
  ];
  const score =
    (peerCount >= 5 ? 1 : 0) +
    (historyCount >= 2 ? 1 : 0) +
    (detail.priceStats?.count && detail.priceStats.count >= 3 ? 1 : 0);
  const level = score >= 3 ? 'Yüksek' : score >= 1 ? 'Orta' : 'Düşük';
  return { level, bars: Math.min(3, Math.max(1, score || 1)), notes };
}

export function buildFinance(
  detail: IvoPropertyDetail,
  opts: {
    downPct: number;
    annualRatePct: number;
    termMonths: number;
    rentMonthly?: number | null;
  }
): FinanceSnapshot | null {
  if (detail.price == null || detail.price <= 0) return null;
  const price = detail.price;
  const downPct = opts.downPct;
  const downPayment = Math.round(price * (downPct / 100));
  const loanAmount = Math.max(0, price - downPayment);
  const r = opts.annualRatePct / 100 / 12;
  const n = opts.termMonths;
  const monthlyPayment =
    r === 0
      ? Math.round(loanAmount / n)
      : Math.round(
          (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
        );
  const totalInterest = monthlyPayment * n - loanAmount;

  const aidatRaw = strFlag(detail, ['Aidat', 'Aidat (TL)']);
  let aidatMonthly: number | null = null;
  if (typeof aidatRaw === 'number') aidatMonthly = aidatRaw;
  else if (typeof aidatRaw === 'string') {
    const nAidat = Number(String(aidatRaw).replace(/[^\d]/g, ''));
    if (Number.isFinite(nAidat) && nAidat > 0) aidatMonthly = nAidat;
  }

  // Kabaca kira: m² × bölge m² fiyatının ~%0.25’i / ay (veya kullanıcı)
  let estimatedRentMonthly = opts.rentMonthly ?? null;
  if (estimatedRentMonthly == null && detail.m2 != null && detail.m2Price != null) {
    estimatedRentMonthly = Math.round(detail.m2 * detail.m2Price * 0.0025);
  }

  const grossYieldPct =
    estimatedRentMonthly != null
      ? ((estimatedRentMonthly * 12) / price) * 100
      : null;

  const depositAnnual = Math.round(downPayment * (opts.annualRatePct / 100));
  const depositVsLoanGap =
    estimatedRentMonthly != null
      ? estimatedRentMonthly * 12 - depositAnnual
      : null;

  return {
    price,
    downPct,
    downPayment,
    loanAmount,
    annualRatePct: opts.annualRatePct,
    termMonths: n,
    monthlyPayment,
    totalInterest,
    estimatedRentMonthly,
    grossYieldPct,
    aidatMonthly,
    depositAnnual,
    depositVsLoanGap,
  };
}

export function buildDecision(
  detail: IvoPropertyDetail,
  metrics: CompareMetric[],
  peers: Peer[]
): DecisionScore {
  const badge = positionBadge(detail, peers);
  const summary = compareSummary(metrics);
  let score = 50;
  if (badge.diffPct != null) {
    // Düşük m² fiyatı → yüksek skor
    score -= Math.max(-25, Math.min(25, badge.diffPct));
  }
  score += summary.good * 6;
  score -= summary.weak * 6;
  if (detail.isActive) score += 4;
  if ((detail.priceChange?.change_count ?? 0) >= 2) score += 3;
  score = Math.round(Math.max(5, Math.min(95, score)));

  let label = 'Nötr — daha fazla veri topla';
  if (score >= 70) label = 'Olumlu — görüşmeye değer';
  else if (score >= 55) label = 'Temkinli olumlu';
  else if (score <= 35) label = 'Zayıf — fiyat/konum baskısı';
  else if (score <= 45) label = 'Temkinli — pazarlık şart';

  const bullets: string[] = [];
  if (badge.diffPct != null) bullets.push(badge.label);
  if (summary.ahead.length) bullets.push(`Önde: ${summary.ahead.join(', ')}`);
  if (summary.behind.length) bullets.push(`Geride: ${summary.behind.join(', ')}`);
  if (detail.statusSummary?.active_days != null) {
    bullets.push(`Yayında ~${detail.statusSummary.active_days} gün`);
  }
  if (!bullets.length) bullets.push('Emsal verisi sınırlı — karar için ek kıyas gerekir');

  return {
    score,
    label,
    bullets,
    positionLabel: badge.label,
    positionDiffPct: badge.diffPct,
  };
}

export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`;
}

export function meterPct(value: number, min: number, max: number): number {
  if (!(max > min)) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function draftSellerMessage(detail: IvoPropertyDetail): string {
  const loc = [detail.neighborhood, detail.district].filter(Boolean).join(', ');
  const price =
    detail.price != null
      ? new Intl.NumberFormat('tr-TR').format(detail.price) + ' ₺'
      : '';
  const bits = [
    `Merhaba${detail.agent?.name ? ` ${detail.agent.name}` : ''},`,
    `${loc || 'ilgilendiğim'} ${detail.rooms || ''} ${detail.kind || 'mülk'} ilanınızı inceliyorum${price ? ` (${price})` : ''}.`,
    'Uygun bir zamanda kısa bir görüşme / yerinde bakış için müsait misiniz?',
  ];
  return bits.join(' ');
}

export function parseAidat(detail: IvoPropertyDetail): number | null {
  const raw = strFlag(detail, ['Aidat', 'Aidat (TL)']);
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(String(raw).replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
