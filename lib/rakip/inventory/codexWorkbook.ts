/**
 * Read-only parser for Codex regional source.xlsx sheets.
 * Strips contact / social PII columns. Does not write the workbook.
 */
import * as XLSX from 'xlsx';

export const CODEX_OFFICES_SHEET = 'Ofisler';
export const CODEX_PEOPLE_SHEET = 'Aktif Ekip';
export const CODEX_SUMMARY_SHEET = 'Özet';
export const CODEX_SCAN_STATUS_SHEET = '_Tarama Durumu';

/** Columns that must never leave the server inventory view model. */
export const CODEX_CONTACT_HEADERS = new Set([
  'Telefon',
  'Telefon 2',
  'WhatsApp',
  'E-posta',
  'Instagram Profil',
  'Adres',
]);

export type CodexOfficeRaw = {
  officeKey: string;
  brand: string;
  officeName: string;
  province: string;
  district: string;
  sourceUrl: string;
  firstSeen: string;
  lastSeen: string;
  lastUpdated: string;
  coverageStatus: string;
};

export type CodexPersonRaw = {
  personKey: string;
  fullName: string;
  brand: string;
  officeKey: string;
  officeName: string;
  province: string;
  district: string;
  roleTitle: string;
  officialProfileUrl: string;
  firstSeen: string;
  lastSeen: string;
  lastUpdated: string;
  status: string;
  departureTracking: string;
};

export type CodexWorkbookParseResult = {
  sheetNames: string[];
  offices: CodexOfficeRaw[];
  people: CodexPersonRaw[];
  summaryTitle: string | null;
  summarySubtitle: string | null;
  scanStatusRows: Array<Record<string, string>>;
};

function cell(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function findHeaderRow(
  rows: unknown[][],
  required: string
): { headerIdx: number; headers: string[] } {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const headers = (rows[i] || []).map((h) => cell(h));
    if (headers.includes(required)) {
      return { headerIdx: i, headers };
    }
  }
  throw new Error(`Header row with "${required}" not found`);
}

function rowsToObjects(
  rows: unknown[][],
  headerIdx: number,
  headers: string[]
): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const line = rows[i] || [];
    const obj: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      if (CODEX_CONTACT_HEADERS.has(key)) continue;
      const value = cell(line[c]);
      if (value) any = true;
      obj[key] = value;
    }
    if (any) out.push(obj);
  }
  return out;
}

function pickFirst(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return '';
}

function mapOffice(row: Record<string, string>): CodexOfficeRaw | null {
  const officeKey = row['Ofis Anahtarı'];
  if (!officeKey) return null;
  return {
    officeKey,
    brand: row['Marka'] || '',
    officeName: row['Ofis'] || '',
    province: row['İl'] || '',
    district: row['İlçe'] || '',
    sourceUrl: pickFirst(row, ['Kaynak', 'Web Sitesi']),
    firstSeen: pickFirst(row, ['İlk Görülme']),
    lastSeen: row['Son Görülme'] || '',
    lastUpdated: row['Son Güncelleme'] || '',
    coverageStatus: row['Kapsam Durumu'] || '',
  };
}

function mapPerson(row: Record<string, string>): CodexPersonRaw | null {
  const personKey = row['Kişi Anahtarı'];
  if (!personKey) return null;
  return {
    personKey,
    fullName: row['Ad Soyad'] || '',
    brand: row['Marka'] || '',
    officeKey: row['Ofis Anahtarı'] || '',
    officeName: row['Ofis'] || '',
    province: row['İl'] || '',
    district: row['İlçe'] || '',
    roleTitle: row['Görev'] || '',
    officialProfileUrl: pickFirst(row, ['Profil', 'Kaynak']),
    firstSeen: pickFirst(row, ['İlk Görülme']),
    lastSeen: row['Son Görülme'] || '',
    lastUpdated: row['Son Güncelleme'] || '',
    status: row['Durum'] || '',
    departureTracking: row['Ayrılma Takibi'] || '',
  };
}

/**
 * Parse Codex source.xlsx bytes into contact-stripped raw rows.
 * Read-only — never mutates input.
 */
export function parseCodexSourceWorkbook(bytes: Buffer): CodexWorkbookParseResult {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true });
  const sheetNames = [...workbook.SheetNames];

  if (!sheetNames.includes(CODEX_OFFICES_SHEET)) {
    throw new Error(`Missing sheet: ${CODEX_OFFICES_SHEET}`);
  }
  if (!sheetNames.includes(CODEX_PEOPLE_SHEET)) {
    throw new Error(`Missing sheet: ${CODEX_PEOPLE_SHEET}`);
  }

  const officeAoa = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[CODEX_OFFICES_SHEET],
    { header: 1, defval: '', raw: false }
  );
  const peopleAoa = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[CODEX_PEOPLE_SHEET],
    { header: 1, defval: '', raw: false }
  );

  const officeHeader = findHeaderRow(officeAoa, 'Ofis Anahtarı');
  const peopleHeader = findHeaderRow(peopleAoa, 'Kişi Anahtarı');

  const officeObjs = rowsToObjects(
    officeAoa,
    officeHeader.headerIdx,
    officeHeader.headers
  );
  const peopleObjs = rowsToObjects(
    peopleAoa,
    peopleHeader.headerIdx,
    peopleHeader.headers
  );

  const offices = officeObjs
    .map(mapOffice)
    .filter((x): x is CodexOfficeRaw => Boolean(x));
  const people = peopleObjs
    .map(mapPerson)
    .filter((x): x is CodexPersonRaw => Boolean(x));

  let summaryTitle: string | null = null;
  let summarySubtitle: string | null = null;
  if (sheetNames.includes(CODEX_SUMMARY_SHEET)) {
    const summaryAoa = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[CODEX_SUMMARY_SHEET],
      { header: 1, defval: '', raw: false }
    );
    summaryTitle = cell(summaryAoa[0]?.[0]) || null;
    summarySubtitle = cell(summaryAoa[1]?.[0]) || null;
  }

  let scanStatusRows: Array<Record<string, string>> = [];
  if (sheetNames.includes(CODEX_SCAN_STATUS_SHEET)) {
    const statusAoa = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[CODEX_SCAN_STATUS_SHEET],
      { header: 1, defval: '', raw: false }
    );
    if (statusAoa.length > 0) {
      const headers = (statusAoa[0] || []).map((h) => cell(h));
      scanStatusRows = rowsToObjects(statusAoa, 0, headers);
    }
  }

  return {
    sheetNames,
    offices,
    people,
    summaryTitle,
    summarySubtitle,
    scanStatusRows,
  };
}
