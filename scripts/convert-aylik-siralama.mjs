/**
 * AYLIK / ÇEYREK matris Excel → Zebra sıralama formatı (Siralamalar_Zebra.xlsx).
 *
 * Kullanım:
 *   node scripts/convert-aylik-siralama.mjs [kaynak.xlsx] [hedef.xlsx]
 *
 * Varsayılan kaynak/hedef: Desktop/sırlama zebra/
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const DEFAULT_SRC = path.join(
  process.env.HOME || '',
  'Desktop/sırlama zebra/AYLIK _ ÇEYREK SIRALAMALAR (1).xlsx'
);
const DEFAULT_OUT = path.join(
  process.env.HOME || '',
  'Desktop/sırlama zebra/Siralamalar_Zebra.xlsx'
);

const SRC = process.argv[2] || DEFAULT_SRC;
const OUT = process.argv[3] || DEFAULT_OUT;

function normKey(s) {
  return String(s || '')
    .normalize('NFC')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

function titleCaseTr(s) {
  return String(s || '')
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR'))
    .join(' ');
}

/** Virgül = berabere (ayrı satır); & veya / = ortak (tek satırda "A - B"). */
function expandCell(raw) {
  const text = String(raw || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];
  return text
    .split(/\s*,\s*/)
    .map((g) => g.trim())
    .filter(Boolean)
    .map((group) => {
      const partners = group
        .split(/\s*&\s*|\s*\/\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (partners.length <= 1) return titleCaseTr(group);
      const last = partners[partners.length - 1].split(/\s+/);
      const surname = last.length >= 2 ? last.slice(1).join(' ') : '';
      const named = partners.map((p) => {
        const parts = p.split(/\s+/);
        if (surname && parts.length === 1) return `${parts[0]} ${surname}`;
        return p;
      });
      return named.map(titleCaseTr).join(' - ');
    });
}

function monthSheetName(v) {
  const k = normKey(v);
  if (k.includes('MAYIS')) return 'Mayıs';
  if (k.includes('HAZIRAN')) return 'Haziran';
  if (k.includes('TEMMUZ')) return 'Temmuz';
  if (k.includes('AGUSTOS')) return 'Ağustos';
  if (k.includes('EYLUL')) return 'Eylül';
  if (k.includes('EKIM')) return 'Ekim';
  return null;
}

function isMonthHeader(v) {
  const name = monthSheetName(v);
  return name != null && normKey(v).length <= 14;
}

function isQuarterHeader(v) {
  const k = normKey(v);
  if (!k.includes('CEYREK')) return null;
  if (k.includes('III') || /(^|\s)3(\s|$)/.test(k.replace(/CEYREK/g, ' '))) return '3. Çeyrek';
  if (k.includes('II') || /(^|\s)2(\s|$)/.test(k.replace(/CEYREK/g, ' '))) return '2. Çeyrek';
  return null;
}

function isCategoryHeaderRow(row) {
  const joined = row.map((c) => normKey(c)).join(' ');
  return joined.includes('CIRO') && joined.includes('ISLEM') && joined.includes('PORTFOY');
}

function categoryColumns(row) {
  const map = {};
  row.forEach((cell, i) => {
    const k = normKey(cell);
    if (k.includes('CIRO')) map.ciro = i;
    else if (k.includes('ISLEM')) map.islem = i;
    else if (k.includes('PORTFOY')) map.portfoy = i;
    else if (k.includes('TAKIM') || k.includes('VERIML')) map.takim = i;
  });
  return map;
}

function emptyBuckets() {
  return { islem: [], ciro: [], portfoy: [], takim: [] };
}

function parseMatrixSheet(rows, mode) {
  const periods = new Map();
  let current = null;
  let cols = null;

  for (const row of rows) {
    const cells = row.map((c) => (c == null ? '' : String(c)));
    const nonEmpty = cells.map((c, i) => [i, c.trim()]).filter(([, c]) => c);
    if (!nonEmpty.length) continue;

    let switched = false;
    for (const [, c] of nonEmpty) {
      const name =
        mode === 'month' ? (isMonthHeader(c) ? monthSheetName(c) : null) : isQuarterHeader(c);
      if (name) {
        current = name;
        if (!periods.has(current)) periods.set(current, emptyBuckets());
        cols = null;
        switched = true;
        break;
      }
    }
    if (switched) continue;
    if (!current) continue;

    if (isCategoryHeaderRow(cells)) {
      cols = categoryColumns(cells);
      continue;
    }

    const rankIdx = cells.findIndex((c) => /^\d{1,2}\s*\.?$/.test(String(c).trim()));
    if (rankIdx < 0 || !cols) continue;
    const rank = Number.parseInt(String(cells[rankIdx]).trim(), 10);
    if (!rank) continue;

    const buckets = periods.get(current);
    for (const [cat, col] of Object.entries(cols)) {
      const raw = cells[col];
      if (!raw || !String(raw).trim()) continue;
      for (const name of expandCell(raw)) {
        buckets[cat].push({ rank, name });
      }
    }
  }
  return periods;
}

function sheetAoA(buckets) {
  const blocks = [
    ['İşlem Sıralaması', 'islem'],
    ['Ciro Sıralaması', 'ciro'],
    ['Portföy Sıralaması', 'portfoy'],
    ['Takım Verimliliği', 'takim'],
  ];
  const rows = [];
  for (const [title, key] of blocks) {
    rows.push([title]);
    rows.push(['Sıra', 'İsim / Takım']);
    const list = [...(buckets[key] || [])].sort(
      (a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'tr')
    );
    if (!list.length) rows.push(['', '']);
    else for (const row of list) rows.push([row.rank, row.name]);
    rows.push([]);
  }
  return rows;
}

if (!fs.existsSync(SRC)) {
  console.error('Kaynak bulunamadı:', SRC);
  process.exit(1);
}

const wbIn = XLSX.read(fs.readFileSync(SRC), { type: 'buffer' });
const aylarName = wbIn.SheetNames.find((n) => /AYLAR.*SIRALAMA/i.test(n));
const ceyrekName = wbIn.SheetNames.find((n) => /ÇEYREK.*SIRALAMA|CEYREK.*SIRALAMA/i.test(n));
if (!aylarName || !ceyrekName) {
  console.error('Beklenen sayfalar yok. Bulunan:', wbIn.SheetNames);
  process.exit(1);
}

const aylar = XLSX.utils.sheet_to_json(wbIn.Sheets[aylarName], {
  header: 1,
  defval: '',
  raw: false,
});
const ceyrek = XLSX.utils.sheet_to_json(wbIn.Sheets[ceyrekName], {
  header: 1,
  defval: '',
  raw: false,
});

const all = new Map([
  ...parseMatrixSheet(aylar, 'month'),
  ...parseMatrixSheet(ceyrek, 'quarter'),
]);

const order = ['Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', '2. Çeyrek', '3. Çeyrek'];
const wbOut = XLSX.utils.book_new();
for (const name of order) {
  const buckets = all.get(name) || emptyBuckets();
  const ws = XLSX.utils.aoa_to_sheet(sheetAoA(buckets));
  ws['!cols'] = [{ wch: 8 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(wbOut, ws, name);
  console.log(
    name,
    Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]))
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const buf = XLSX.write(wbOut, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(OUT, buf);
console.log('Yazıldı:', OUT);
