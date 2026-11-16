/**
 * Portföy / ofis listesi → Excel (.xlsx) dışa aktarım.
 */

import { toListingCard, type IvoListingCardModel } from './ivoListingCard';
import type { IvoListingRow } from './ivoListingTypes';

export type PortfolioExportRow = {
  ilan_no: string;
  baslik: string;
  durum: string;
  islem: string;
  tur: string;
  tip: string;
  oda: string;
  net_m2: number | '';
  fiyat_tl: number | '';
  m2_fiyat: number | '';
  fiyat_usd: number | '';
  il: string;
  ilce: string;
  mahalle: string;
  ofis: string;
  danisman: string;
  kimden: string;
  ilan_tarihi: string;
  guncelleme: string;
  gun: number | '';
  foto: number | '';
  url: string;
};

function cardToExportRow(c: IvoListingCardModel): PortfolioExportRow {
  return {
    ilan_no: c.listingNo,
    baslik: c.title,
    durum: c.isActive ? 'Aktif' : 'Pasif',
    islem: c.statusLabel || c.listingType || '',
    tur: c.kind || '',
    tip: c.type || '',
    oda: c.rooms || '',
    net_m2: c.areaM2 ?? '',
    fiyat_tl: c.priceTl ?? '',
    m2_fiyat: c.priceM2 ?? '',
    fiyat_usd: c.priceUsd != null ? Math.round(c.priceUsd) : '',
    il: c.city || '',
    ilce: c.district || '',
    mahalle: c.neighborhood || '',
    ofis: c.agency?.name || '',
    danisman: c.agent?.name || '',
    kimden: c.whom || '',
    ilan_tarihi: c.firstDate ? String(c.firstDate).slice(0, 10) : '',
    guncelleme: c.updatedAt ? String(c.updatedAt).slice(0, 10) : '',
    gun: c.activeDays ?? '',
    foto: c.photoCount ?? '',
    url: c.url,
  };
}

export function listingsToExportRows(
  listings: IvoListingRow[]
): PortfolioExportRow[] {
  return listings.map((r) => cardToExportRow(toListingCard(r)));
}

const HEADERS: Array<{ key: keyof PortfolioExportRow; label: string }> = [
  { key: 'ilan_no', label: 'İlan No' },
  { key: 'baslik', label: 'Başlık' },
  { key: 'durum', label: 'Durum' },
  { key: 'islem', label: 'İşlem' },
  { key: 'tur', label: 'Tür' },
  { key: 'tip', label: 'Tip' },
  { key: 'oda', label: 'Oda' },
  { key: 'net_m2', label: 'Net m²' },
  { key: 'fiyat_tl', label: 'Fiyat ₺' },
  { key: 'm2_fiyat', label: '₺/m²' },
  { key: 'fiyat_usd', label: '≈ USD' },
  { key: 'il', label: 'İl' },
  { key: 'ilce', label: 'İlçe' },
  { key: 'mahalle', label: 'Mahalle' },
  { key: 'ofis', label: 'Ofis' },
  { key: 'danisman', label: 'Danışman' },
  { key: 'kimden', label: 'Kimden' },
  { key: 'ilan_tarihi', label: 'İlan tarihi' },
  { key: 'guncelleme', label: 'Güncelleme' },
  { key: 'gun', label: 'Gün' },
  { key: 'foto', label: 'Foto' },
  { key: 'url', label: 'URL' },
];

export async function downloadPortfolioExcel(
  listings: IvoListingRow[],
  fileBase: string
): Promise<number> {
  const rows = listingsToExportRows(listings);
  const XLSX = await import('xlsx');
  const aoa: (string | number)[][] = [
    HEADERS.map((h) => h.label),
    ...rows.map((r) => HEADERS.map((h) => r[h.key])),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = HEADERS.map((h) => ({
    wch: Math.min(
      40,
      Math.max(
        h.label.length + 2,
        ...rows.slice(0, 50).map((r) => String(r[h.key] ?? '').length + 1)
      )
    ),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Portföy');
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = fileBase.replace(/[^\w\-ğüşıöçĞÜŞİÖÇ]+/gi, '_').slice(0, 48);
  XLSX.writeFile(workbook, `${safe}_${stamp}.xlsx`);
  return rows.length;
}

/** Aktif filtreyle tüm sayfaları çeker (üst sınır). */
export async function fetchAllFilteredListings(
  buildUrl: (limit: number, offset: number) => string,
  opts?: { pageSize?: number; maxRows?: number }
): Promise<IvoListingRow[]> {
  const pageSize = opts?.pageSize ?? 100;
  const maxRows = opts?.maxRows ?? 3000;
  const out: IvoListingRow[] = [];
  let offset = 0;
  let total = Infinity;

  while (out.length < maxRows && offset < total) {
    const res = await fetch(buildUrl(pageSize, offset));
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Dışa aktarım yüklenemedi');
    const batch = (json.listings || []) as IvoListingRow[];
    total =
      typeof json.total === 'number' ? json.total : offset + batch.length;
    out.push(...batch);
    if (!batch.length || batch.length < pageSize) break;
    offset += batch.length;
  }

  return out.slice(0, maxRows);
}
