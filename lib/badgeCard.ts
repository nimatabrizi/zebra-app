import { splitGivenAndFamilyName, toTurkishUpper } from './formatName';

/**
 * Örnek Yaka Kartı PDF: MediaBox 226.772×354.331 pt = 80×125 mm.
 * Tuval örnek render ile birebir (2048×3200) — yerleşim kayması olmasın.
 */
export const BADGE_CARD = {
  widthMm: 80,
  heightMm: 125,
  widthPx: 2048,
  heightPx: 3200,
  dpi: 650,
} as const;

/**
 * Örnek ve x.pdf 2048×3200 karşılaştırmasından alınan yerleşim.
 * Birimler doğrudan tuval pikseli (= örnek PDF render pikseli).
 */
export const BADGE_LAYOUT = {
  barTop: 1723,
  barHeight: 16,
  solidTop: 1750,
  logoBlue: {
    top: 246,
    width: 786,
    height: 386,
  },
  /**
   * Fotoğraf: silüet genişliği kart üzerinde targetWidth (1160 px);
   * yüz merkezi faceCenterY / targetFaceWidth ile hizalanır.
   */
  photo: {
    headTop: 749,
    /** Logo alt kenarı ile fotoğraf üstü arasında minimum boşluk (px). */
    logoGap: 110,
    /** Kart üzerinde hedef silüet (gövde) genişliği. */
    targetWidth: 1160,
    targetFaceWidth: 420,
    faceCenterY: 1020,
    clipBottom: 2088,
  },
  name: {
    /** Oswald em-kutusu üst boşluğu; mürekkep örnekte y=1900’de başlar. */
    top: 1866,
    fontSize: 204,
    letterSpacing: '0.02em',
  },
  line: {
    width: 940,
    height: 4,
  },
  line1Top: 2137,
  title: {
    fontSize: 52,
    letterSpacing: '0.32em',
  },
  line2Top: 2270,
  location: {
    top: 2328,
    fontSize: 54,
    letterSpacing: '0.12em',
  },
  group: {
    top: 2450,
    width: 252,
    height: 110,
  },
  motto: {
    top: 2624,
    width: 1163,
    height: 151,
  },
  logoWhite: {
    top: 2854,
    width: 457,
    height: 215,
  },
} as const;

export const BADGE_ASSETS = {
  logoBlue: '/templates/yaka-karti/cb360-logo-blue.png?v=2',
  logoWhite: '/templates/yaka-karti/cb360-logo-white.png?v=2',
  group: '/templates/yaka-karti/360-group-white.png?v=2',
  folkart: '/templates/yaka-karti/folkart.png',
  motto: '/templates/yaka-karti/motto-white.png?v=2',
} as const;

export const BADGE_LOCATION_COLOR = '#00A3DA';

export function badgeLocationLabel(ofis?: string | null, sube?: string | null): string {
  const office = String(ofis || '').trim();
  const branch = String(sube || '').trim();
  if (office && /türkiye|turkey/i.test(office)) {
    return toTurkishUpper(office);
  }
  const city = office || branch || 'İzmir';
  if (/türkiye|turkey/i.test(city)) return toTurkishUpper(city);
  return `${toTurkishUpper(city)} / TÜRKİYE`;
}

export function badgeNameParts(fullName: string): {
  given: string;
  family: string;
} {
  const { given, family } = splitGivenAndFamilyName(fullName);
  return {
    given: toTurkishUpper(given),
    family: toTurkishUpper(family),
  };
}
