/**
 * İşlem Kapatma — tutar hesabı (kuruş), kayıt tipleri, PDF.
 * Girişler KDV hariç; KDV %20 ve dahil otomatik.
 * Royalty = toplam × %9; net = toplam − royalty;
 * danışman payı = net × (40|50|60|70)%; ofis = net − danışman.
 */

export const DEAL_CLOSING_TABLE = 'deal_closings';

export const KDV_PERCENT = 20;
export const ROYALTY_PERCENT = 9;
export const CONSULTANT_SHARE_OPTIONS = [40, 50, 60, 70] as const;

export type ConsultantSharePercent = (typeof CONSULTANT_SHARE_OPTIONS)[number];
export type DealClosingType = 'sale' | 'rent';

/** Para satırı: KDV hariç / KDV / dahil (hepsi kuruş) */
export type MoneyTriple = {
  excl: number;
  vat: number;
  incl: number;
};

export type DealClosingComputed = {
  buyerFee: MoneyTriple | null;
  sellerFee: MoneyTriple | null;
  consultantFee: MoneyTriple | null;
  total: MoneyTriple;
  royalty: MoneyTriple;
  net: MoneyTriple;
  consultantShare: MoneyTriple;
  officeShare: MoneyTriple;
};

export type DealClosingInput = {
  type: DealClosingType;
  closedAt: string; // YYYY-MM-DD
  consultantName: string;
  address: string;
  roomCount: string;
  areaSqm: string;
  listingNo: string;
  phone: string;
  buyerInvoiceInfo: string;
  sellerInvoiceInfo: string;
  /** Satılık: alıcı hizmet bedeli (KDV hariç, TL string) */
  buyerFeeTl: string;
  /** Satılık: satıcı hizmet bedeli (KDV hariç, TL string) */
  sellerFeeTl: string;
  /** Kiralık: danışman hizmet bedeli (KDV hariç, TL string) */
  consultantFeeTl: string;
  consultantSharePercent: ConsultantSharePercent;
  notes: string;
};

export type DealClosingRecord = DealClosingInput & {
  id: string;
  buyerFeeExcl: number | null;
  sellerFeeExcl: number | null;
  consultantFeeExcl: number | null;
  totalExcl: number;
  totalVat: number;
  totalIncl: number;
  royaltyExcl: number;
  royaltyVat: number;
  royaltyIncl: number;
  netExcl: number;
  netVat: number;
  netIncl: number;
  consultantShareExcl: number;
  consultantShareVat: number;
  consultantShareIncl: number;
  officeShareExcl: number;
  officeShareVat: number;
  officeShareIncl: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_DEAL_CLOSING_INPUT: DealClosingInput = {
  type: 'sale',
  closedAt: '',
  consultantName: '',
  address: '',
  roomCount: '',
  areaSqm: '',
  listingNo: '',
  phone: '',
  buyerInvoiceInfo: '',
  sellerInvoiceInfo: '',
  buyerFeeTl: '',
  sellerFeeTl: '',
  consultantFeeTl: '',
  consultantSharePercent: 50,
  notes: '',
};

/** Yarıdan yukarı (pozitif) — kuruş × yüzde */
export function percentOfKurus(kurus: number, percent: number): number {
  if (!Number.isFinite(kurus) || kurus <= 0 || percent <= 0) return 0;
  return Math.floor((kurus * percent + 50) / 100);
}

export function moneyTriple(exclKurus: number): MoneyTriple {
  const excl = Math.max(0, Math.round(exclKurus));
  const vat = percentOfKurus(excl, KDV_PERCENT);
  return { excl, vat, incl: excl + vat };
}

/** "100000" | "100.000,50" | "100000,5" → kuruş; boş/geçersiz → null */
export function parseTlToKurus(raw: string): number | null {
  const s = String(raw || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/₺/g, '')
    .replace(/TL/gi, '');
  if (!s) return null;
  let normalized = s;
  if (s.includes(',') && s.includes('.')) {
    // 100.000,50
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    normalized = s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // 100.000 → binlik ayırıcı
    normalized = s.replace(/\./g, '');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n * 100 + 0.5);
}

export function formatTl(kurus: number): string {
  const tl = kurus / 100;
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: Number.isInteger(tl) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(tl)} TL`;
}

export function computeDealClosing(input: DealClosingInput): DealClosingComputed {
  const share = CONSULTANT_SHARE_OPTIONS.includes(input.consultantSharePercent)
    ? input.consultantSharePercent
    : 50;

  if (input.type === 'rent') {
    const fee = parseTlToKurus(input.consultantFeeTl) ?? 0;
    const total = moneyTriple(fee);
    const royalty = moneyTriple(percentOfKurus(total.excl, ROYALTY_PERCENT));
    const netExcl = Math.max(0, total.excl - royalty.excl);
    const net = moneyTriple(netExcl);
    const consultantShare = moneyTriple(percentOfKurus(net.excl, share));
    const officeShare = moneyTriple(Math.max(0, net.excl - consultantShare.excl));
    return {
      buyerFee: null,
      sellerFee: null,
      consultantFee: total,
      total,
      royalty,
      net,
      consultantShare,
      officeShare,
    };
  }

  const buyer = moneyTriple(parseTlToKurus(input.buyerFeeTl) ?? 0);
  const seller = moneyTriple(parseTlToKurus(input.sellerFeeTl) ?? 0);
  const total = moneyTriple(buyer.excl + seller.excl);
  const royalty = moneyTriple(percentOfKurus(total.excl, ROYALTY_PERCENT));
  const net = moneyTriple(Math.max(0, total.excl - royalty.excl));
  const consultantShare = moneyTriple(percentOfKurus(net.excl, share));
  const officeShare = moneyTriple(Math.max(0, net.excl - consultantShare.excl));
  return {
    buyerFee: buyer,
    sellerFee: seller,
    consultantFee: null,
    total,
    royalty,
    net,
    consultantShare,
    officeShare,
  };
}

export function dealTypeLabel(type: DealClosingType): string {
  return type === 'rent' ? 'Kiralık' : 'Satılık';
}

type DbRow = {
  id: string;
  deal_type: DealClosingType;
  closed_at: string;
  consultant_name: string;
  address: string | null;
  room_count: string | null;
  area_sqm: string | null;
  listing_no: string | null;
  phone: string | null;
  buyer_invoice_info: string | null;
  seller_invoice_info: string | null;
  buyer_fee_excl: number | null;
  seller_fee_excl: number | null;
  consultant_fee_excl: number | null;
  total_excl: number;
  total_vat: number;
  total_incl: number;
  royalty_excl: number;
  royalty_vat: number;
  royalty_incl: number;
  net_excl: number;
  net_vat: number;
  net_incl: number;
  consultant_share_percent: number;
  consultant_share_excl: number;
  consultant_share_vat: number;
  consultant_share_incl: number;
  office_share_excl: number;
  office_share_vat: number;
  office_share_incl: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

function kurusToTlInput(kurus: number | null | undefined): string {
  if (kurus == null || !Number.isFinite(kurus)) return '';
  const tl = kurus / 100;
  return Number.isInteger(tl) ? String(tl) : tl.toFixed(2);
}

export function rowToRecord(row: DbRow): DealClosingRecord {
  const share = CONSULTANT_SHARE_OPTIONS.includes(
    row.consultant_share_percent as ConsultantSharePercent
  )
    ? (row.consultant_share_percent as ConsultantSharePercent)
    : 50;
  return {
    id: row.id,
    type: row.deal_type,
    closedAt: row.closed_at?.slice(0, 10) || '',
    consultantName: row.consultant_name || '',
    address: row.address || '',
    roomCount: row.room_count || '',
    areaSqm: row.area_sqm || '',
    listingNo: row.listing_no || '',
    phone: row.phone || '',
    buyerInvoiceInfo: row.buyer_invoice_info || '',
    sellerInvoiceInfo: row.seller_invoice_info || '',
    buyerFeeTl: kurusToTlInput(row.buyer_fee_excl),
    sellerFeeTl: kurusToTlInput(row.seller_fee_excl),
    consultantFeeTl: kurusToTlInput(row.consultant_fee_excl),
    consultantSharePercent: share,
    notes: row.notes || '',
    buyerFeeExcl: row.buyer_fee_excl,
    sellerFeeExcl: row.seller_fee_excl,
    consultantFeeExcl: row.consultant_fee_excl,
    totalExcl: row.total_excl,
    totalVat: row.total_vat,
    totalIncl: row.total_incl,
    royaltyExcl: row.royalty_excl,
    royaltyVat: row.royalty_vat,
    royaltyIncl: row.royalty_incl,
    netExcl: row.net_excl,
    netVat: row.net_vat,
    netIncl: row.net_incl,
    consultantShareExcl: row.consultant_share_excl,
    consultantShareVat: row.consultant_share_vat,
    consultantShareIncl: row.consultant_share_incl,
    officeShareExcl: row.office_share_excl,
    officeShareVat: row.office_share_vat,
    officeShareIncl: row.office_share_incl,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function recordToInput(rec: DealClosingRecord): DealClosingInput {
  return {
    type: rec.type,
    closedAt: rec.closedAt,
    consultantName: rec.consultantName,
    address: rec.address,
    roomCount: rec.roomCount,
    areaSqm: rec.areaSqm,
    listingNo: rec.listingNo,
    phone: rec.phone,
    buyerInvoiceInfo: rec.buyerInvoiceInfo,
    sellerInvoiceInfo: rec.sellerInvoiceInfo,
    buyerFeeTl: rec.buyerFeeTl,
    sellerFeeTl: rec.sellerFeeTl,
    consultantFeeTl: rec.consultantFeeTl,
    consultantSharePercent: rec.consultantSharePercent,
    notes: rec.notes,
  };
}

export function buildPayload(
  input: DealClosingInput,
  userId: string | null,
  existingId?: string | null
) {
  const c = computeDealClosing(input);
  return {
    ...(existingId ? { id: existingId } : {}),
    deal_type: input.type,
    closed_at: input.closedAt || null,
    consultant_name: input.consultantName.trim(),
    address: input.address.trim() || null,
    room_count: input.roomCount.trim() || null,
    area_sqm: input.areaSqm.trim() || null,
    listing_no: input.listingNo.trim() || null,
    phone: input.phone.trim() || null,
    buyer_invoice_info: input.buyerInvoiceInfo.trim() || null,
    seller_invoice_info:
      input.type === 'sale' ? input.sellerInvoiceInfo.trim() || null : null,
    buyer_fee_excl: c.buyerFee?.excl ?? null,
    seller_fee_excl: c.sellerFee?.excl ?? null,
    consultant_fee_excl: c.consultantFee?.excl ?? null,
    total_excl: c.total.excl,
    total_vat: c.total.vat,
    total_incl: c.total.incl,
    royalty_excl: c.royalty.excl,
    royalty_vat: c.royalty.vat,
    royalty_incl: c.royalty.incl,
    net_excl: c.net.excl,
    net_vat: c.net.vat,
    net_incl: c.net.incl,
    consultant_share_percent: input.consultantSharePercent,
    consultant_share_excl: c.consultantShare.excl,
    consultant_share_vat: c.consultantShare.vat,
    consultant_share_incl: c.consultantShare.incl,
    office_share_excl: c.officeShare.excl,
    office_share_vat: c.officeShare.vat,
    office_share_incl: c.officeShare.incl,
    notes: input.notes.trim() || null,
    updated_by: userId,
    ...(existingId ? {} : { created_by: userId }),
  };
}

export function validateDealClosing(input: DealClosingInput): string | null {
  if (!input.closedAt) return 'Kapanış tarihi zorunlu.';
  if (!input.consultantName.trim()) return 'Danışman seçin veya yazın.';
  if (input.type === 'sale') {
    const a = parseTlToKurus(input.buyerFeeTl);
    const b = parseTlToKurus(input.sellerFeeTl);
    if (a == null && b == null) {
      return 'Alıcı veya satıcı hizmet bedeli girin.';
    }
    if (
      (input.buyerFeeTl.trim() && a == null) ||
      (input.sellerFeeTl.trim() && b == null)
    ) {
      return 'Hizmet bedeli tutarları geçersiz.';
    }
  } else {
    const f = parseTlToKurus(input.consultantFeeTl);
    if (f == null || f <= 0) return 'Danışman hizmet bedeli girin.';
  }
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadDealClosingPdf(
  input: DealClosingInput,
  opts?: { id?: string }
): Promise<void> {
  const c = computeDealClosing(input);
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  let y = 16;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('ISLEM KAPATMA FORMU', W / 2, y, { align: 'center' });
  y += 8;
  pdf.setFontSize(11);
  pdf.text(dealTypeLabel(input.type), W / 2, y, { align: 'center' });
  y += 10;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  const meta: [string, string][] = [
    ['Kapanis tarihi', input.closedAt || '—'],
    ['Danisman', input.consultantName || '—'],
    ['Adres', input.address || '—'],
    ['Oda', input.roomCount || '—'],
    ['m2', input.areaSqm || '—'],
    ['Ilan no', input.listingNo || '—'],
    ['Telefon', input.phone || '—'],
  ];
  for (const [k, v] of meta) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${k}:`, 14, y);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(v, W - 50);
    pdf.text(lines, 48, y);
    y += Math.max(6, lines.length * 4.5);
  }

  y += 2;
  if (input.type === 'sale') {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Alici / Kiraci fatura:', 14, y);
    pdf.setFont('helvetica', 'normal');
    y += 5;
    pdf.text(pdf.splitTextToSize(input.buyerInvoiceInfo || '—', W - 28), 14, y);
    y += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Satici fatura:', 14, y);
    pdf.setFont('helvetica', 'normal');
    y += 5;
    pdf.text(pdf.splitTextToSize(input.sellerInvoiceInfo || '—', W - 28), 14, y);
    y += 12;
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Kiraci fatura:', 14, y);
    pdf.setFont('helvetica', 'normal');
    y += 5;
    pdf.text(pdf.splitTextToSize(input.buyerInvoiceInfo || '—', W - 28), 14, y);
    y += 12;
  }

  const colX = [14, 95, 135, 175];
  pdf.setFont('helvetica', 'bold');
  pdf.text('Kalem', colX[0]!, y);
  pdf.text('KDV haric', colX[1]!, y, { align: 'right' });
  pdf.text('KDV %20', colX[2]!, y, { align: 'right' });
  pdf.text('Dahil', colX[3]!, y, { align: 'right' });
  y += 5;
  pdf.setDrawColor(180);
  pdf.line(14, y, W - 14, y);
  y += 5;

  const rows: [string, MoneyTriple | null][] =
    input.type === 'sale'
      ? [
          ['Alici hizmet bedeli', c.buyerFee],
          ['Satici hizmet bedeli', c.sellerFee],
        ]
      : [['Danisman hizmet bedeli', c.consultantFee]];

  rows.push(
    ['Toplam hizmet bedeli', c.total],
    [`Royalty (%${ROYALTY_PERCENT})`, c.royalty],
    ['Kalan net tutar', c.net],
    [`Danisman payi (%${input.consultantSharePercent})`, c.consultantShare],
    ['Ofis payi', c.officeShare]
  );

  pdf.setFont('helvetica', 'normal');
  for (const [label, m] of rows) {
    if (!m) continue;
    if (y > 270) {
      pdf.addPage();
      y = 16;
    }
    pdf.text(label, colX[0]!, y);
    pdf.text(formatTl(m.excl), colX[1]!, y, { align: 'right' });
    pdf.text(formatTl(m.vat), colX[2]!, y, { align: 'right' });
    pdf.text(formatTl(m.incl), colX[3]!, y, { align: 'right' });
    y += 6;
  }

  if (input.notes.trim()) {
    y += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Not:', 14, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text(pdf.splitTextToSize(input.notes, W - 28), 14, y);
  }

  const slug = (input.consultantName || 'islem')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const name = `islem-kapatma-${input.closedAt || 'taslak'}-${slug}${
    opts?.id ? `-${opts.id.slice(0, 8)}` : ''
  }.pdf`;
  downloadBlob(pdf.output('blob'), name);
}
