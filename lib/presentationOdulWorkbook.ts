/**
 * Birleştirilmiş ödül sıralamaları Excel → RankEntry[].
 * Kaynak: public/templates/siralama/Birlestirilmis_Odul_Siralamalari_2026.xlsx
 * ("Tüm Dereceler" sayfası)
 */

import type { WorkBook } from 'xlsx';
import { toConsultantPhotoSlug } from './formatName';
import {
  normalizeRankKey,
  periodFromText,
  splitPartnerNames,
  type ParsedRankings,
  type RankCategoryId,
  type RankEntry,
  type RankPeriodId,
} from './rankingVisuals';
import { TEAM_DEFS, type TeamDef } from './rankingTeamVisuals';

export const PRESENTATION_ODUL_XLSX_URL =
  '/templates/siralama/Birlestirilmis_Odul_Siralamalari_2026.xlsx';

const MONTH_TR: Record<string, RankPeriodId> = {
  mayis: '2026-05',
  haziran: '2026-06',
  temmuz: '2026-07',
  agustos: '2026-08',
  eylul: '2026-09',
  ekim: '2026-10',
};

function categoryFromOdul(value: unknown): RankCategoryId | null {
  const key = normalizeRankKey(value);
  if (!key) return null;
  if (key.includes('verimlil') || key.includes('takim')) return 'takim';
  if (key.includes('portfoy')) return 'portfoy';
  if (key.includes('ciro')) return 'ciro';
  if (key.includes('islem')) return 'islem';
  return null;
}

/** "II"/"III" — tr-TR lowercasetr-TR "I"→"ı" olduğu için ASCII upper kullan */
function quarterFromRoman(value: unknown): RankPeriodId | null {
  const raw = String(value ?? '')
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/\./g, '');
  if (raw === 'II' || raw === '2') return '2026-q2';
  if (raw === 'III' || raw === '3') return '2026-q3';
  return null;
}

function periodFromOdulRow(row: Record<string, unknown>): RankPeriodId | null {
  const tur = normalizeRankKey(row['Dönem Türü'] ?? row['Donem Turu']);
  const ceyrekRaw = row['Çeyrek'] ?? row['Ceyrek'];
  const ay = row['Ay'];
  const quarterId = quarterFromRoman(ceyrekRaw);

  if (tur.includes('ceyrek') || (!tur && quarterId)) {
    if (quarterId) return quarterId;
  }

  if (tur === 'ay' || tur.includes('ay')) {
    const monthKey = normalizeRankKey(ay);
    if (MONTH_TR[monthKey]) return MONTH_TR[monthKey];
    return periodFromText(ay);
  }

  if (ay) {
    const monthKey = normalizeRankKey(ay);
    if (MONTH_TR[monthKey]) return MONTH_TR[monthKey];
  }
  return quarterId;
}

function toRank(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const m = String(value ?? '')
    .trim()
    .match(/^(\d{1,3})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/** Excel takım adını TEAM_DEFS ile eşle */
export function resolveTeamDef(name: string): TeamDef | null {
  const raw = name.normalize('NFC').trim();
  if (!raw) return null;
  const exact = TEAM_DEFS.find((t) =>
    t.labels.some(
      (l) => l.normalize('NFC').toLocaleLowerCase('tr-TR') === raw.toLocaleLowerCase('tr-TR')
    )
  );
  if (exact) return exact;
  const nk = normalizeRankKey(raw);
  return (
    TEAM_DEFS.find((t) =>
      t.labels.some((l) => normalizeRankKey(l) === nk) ||
      normalizeRankKey(t.displayName) === nk ||
      normalizeRankKey(t.id) === nk
    ) || null
  );
}

/**
 * Workbook → RankEntry listesi.
 * Danışman satırları: people = [kişi]
 * Takım satırları: people = [takım adı], category = takim
 */
export function parseOdulWorkbook(
  workbook: WorkBook,
  sheetToRows: (sheetName: string) => unknown[][]
): ParsedRankings {
  const warnings: string[] = [];
  const preferred =
    workbook.SheetNames.find((n) => normalizeRankKey(n).includes('tum dereceler')) ||
    workbook.SheetNames.find((n) => normalizeRankKey(n).includes('danisman')) ||
    workbook.SheetNames[0];

  if (!preferred) {
    return { entries: [], sheets: [], warnings: ['Excel sayfası bulunamadı'] };
  }

  const rows = sheetToRows(preferred);
  if (!rows.length) {
    return { entries: [], sheets: [], warnings: [`Boş sayfa: ${preferred}`] };
  }

  const header = (rows[0] || []).map((c) => String(c ?? '').normalize('NFC').trim());
  const col = (name: string) =>
    header.findIndex((h) => normalizeRankKey(h) === normalizeRankKey(name));

  const iYear = col('Yıl');
  const iOwner = col('Ödül Sahibi Türü') >= 0 ? col('Ödül Sahibi Türü') : col('Odul Sahibi Turu');
  const iName = col('Danışman / Takım') >= 0 ? col('Danışman / Takım') : col('Danisman / Takim');
  const iCat = col('Kategori');
  const iRank = col('Derece');
  const iTur = col('Dönem Türü') >= 0 ? col('Dönem Türü') : col('Donem Turu');
  const iCeyrek = col('Çeyrek') >= 0 ? col('Çeyrek') : col('Ceyrek');
  const iAy = col('Ay');

  if (iName < 0 || iCat < 0 || iRank < 0) {
    return {
      entries: [],
      sheets: [],
      warnings: ['Beklenen sütunlar yok (Danışman / Takım, Kategori, Derece)'],
    };
  }

  const entries: RankEntry[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const line = rows[r] || [];
    const get = (idx: number) => (idx >= 0 ? line[idx] : '');
    const rawName = String(get(iName) ?? '')
      .normalize('NFC')
      .trim();
    if (!rawName) continue;

    const year = Number(get(iYear));
    if (Number.isFinite(year) && year !== 2026) {
      skipped += 1;
      continue;
    }

    const rowObj: Record<string, unknown> = {
      'Dönem Türü': get(iTur),
      Çeyrek: get(iCeyrek),
      Ay: get(iAy),
    };
    const periodId = periodFromOdulRow(rowObj);
    const category = categoryFromOdul(get(iCat));
    const rank = toRank(get(iRank));
    if (!periodId || !category || !rank) {
      skipped += 1;
      continue;
    }

    const owner = String(get(iOwner) ?? '')
      .normalize('NFC')
      .toLocaleLowerCase('tr-TR');
    const isTeam =
      owner.includes('takım') || owner.includes('takim') || category === 'takim';
    const finalCat: RankCategoryId = isTeam ? 'takim' : category;

    // Ortaklar (& / - / +): tek satır → tek slayt, people[] iki foto için ayrılır
    const people = isTeam
      ? [
          {
            name: rawName,
            key: resolveTeamDef(rawName)?.id || toConsultantPhotoSlug(rawName),
          },
        ]
      : splitPartnerNames(rawName).map((name) => ({
          name,
          key: toConsultantPhotoSlug(name),
        }));
    const key = people.map((p) => p.key).join('+') || toConsultantPhotoSlug(rawName);

    entries.push({
      id: `odul|${periodId}|${finalCat}|${rank}|${key}|${r}`,
      periodId,
      category: finalCat,
      rank,
      rawName,
      people,
    });
  }

  if (skipped) warnings.push(`${skipped} satır atlandı`);

  return {
    entries,
    sheets: [{ name: preferred, periodId: null, count: entries.length }],
    warnings,
  };
}
