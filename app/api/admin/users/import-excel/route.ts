import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { assertCallerIsUserAdmin } from '../../../../../lib/adminGate';
import {
  isKnownPilotPerson,
  normalizeWhatsappPassword,
  profilePilotFlagsForPerson,
} from '../../../../../lib/authIdentity';
import { createServiceClient } from '../../../../../utils/supabase/admin';
import type { Profile, ProfileUpdate } from '../../../../../types/profiles';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

type ImportField = keyof Pick<
  ProfileUpdate,
  | 'takim_ekip'
  | 'kulup_uyelikleri'
  | 'dogum_gunu'
  | 'beden'
  | 'ise_giris_tarihi'
  | 'blue_start'
  | 'kartvizit'
  | 'branda'
  | 'giris_gorseli'
  | 'yaka_karti'
  | 'folkart_karti'
  | 'cbx'
  | 'cbx_kayit'
  | 'ofis'
  | 'sube'
  | 'unvan'
>;

type PreparedRow = {
  source: string;
  excelName: string;
  key: string;
  patch: ProfileUpdate;
};

const COLUMN_MAP: Record<string, ImportField> = {
  'takim ekip': 'takim_ekip',
  'kulup uyelikleri': 'kulup_uyelikleri',
  'dogum gunu': 'dogum_gunu',
  beden: 'beden',
  'ise giris tarihi': 'ise_giris_tarihi',
  'blue start': 'blue_start',
  kartvizit: 'kartvizit',
  branda: 'branda',
  'giris gorseli': 'giris_gorseli',
  'yaka karti': 'yaka_karti',
  'folkart karti': 'folkart_karti',
  cbx: 'cbx',
  'cbx kayit': 'cbx_kayit',
  ofisi: 'ofis',
  ofis: 'ofis',
  subesi: 'sube',
  sube: 'sube',
  unvani: 'unvan',
  unvan: 'unvan',
};

const DATE_FIELDS = new Set<ImportField>([
  'dogum_gunu',
  'ise_giris_tarihi',
]);

function normalizeTurkish(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dr./Prof./Doç. konumu eşleşmeyi etkilemez. */
function profileNameKey(value: unknown): string {
  return normalizeTurkish(value)
    .split(' ')
    .filter((token) => !['dr', 'prof', 'doc'].includes(token))
    .join(' ');
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '')
    .normalize('NFC')
    .trim();
  if (!text || text === '-' || text === '—') return null;
  return text;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0'
  )}-${String(day).padStart(2, '0')}`;
}

/** Excel seri gün (1899-12-30) → YYYY-MM-DD */
function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  // Makul doğum / işe giriş aralığı (~1955–2100)
  if (serial < 20000 || serial > 73000) return null;

  const parsed = XLSX.SSF.parse_date_code(serial);
  if (parsed && parsed.y && parsed.m && parsed.d) {
    return validDate(parsed.y, parsed.m, parsed.d);
  }

  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const date = new Date(utc);
  return validDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

/**
 * Dosyada danışman tarihleri m/d/yy, personel tarihleri dd.mm.yyyy.
 * Bazı hücreler biçimlenmemiş Excel seri numarası olarak gelir (örn. 28925).
 */
function parseExcelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }

  if (typeof value === 'number') {
    return excelSerialToISO(value);
  }

  const text = cleanText(value);
  if (!text) return null;

  // Biçimsiz seri: "28925" / "28925.0"
  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    const fromSerial = excelSerialToISO(Number(text));
    if (fromSerial) return fromSerial;
  }

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validDate(+match[1], +match[2], +match[3]);

  match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? expandYear(+match[3]) : +match[3];
    return validDate(year, +match[2], +match[1]);
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? expandYear(+match[3]) : +match[3];
    // "Tüm Danışmanlar" sayfasındaki Excel görünümü: ay/gün/yıl
    return validDate(year, +match[1], +match[2]);
  }

  return null;
}

function expandYear(year: number): number {
  return year >= 40 ? 1900 + year : 2000 + year;
}

function normalizePhone(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return normalizeWhatsappPassword(text.replace(/[^\d+]/g, '')) || null;
}

function normalizeRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([header, value]) => [
      normalizeTurkish(header),
      value,
    ])
  );
}

function findWorkbookSheets(workbook: XLSX.WorkBook): string[] {
  const consultant = workbook.SheetNames.find((name) => {
    const key = normalizeTurkish(name);
    // Kaynak dosyada "Tüm Damışmanlar" yazım hatası da mevcut.
    return key.includes('danismanlar') || key.includes('damismanlar');
  });
  const personnel = workbook.SheetNames.find((name) =>
    normalizeTurkish(name).includes('personel')
  );

  if (!consultant || !personnel) {
    throw new Error(
      '"Tüm Danışmanlar" ve "Tüm Personel" sayfaları bulunamadı'
    );
  }
  return [consultant, personnel];
}

function prepareWorkbookRows(
  workbook: XLSX.WorkBook,
  sheetNames: string[]
): { rows: PreparedRow[]; invalidRows: string[] } {
  const merged = new Map<string, PreparedRow>();
  const invalidRows: string[] = [];
  let inspected = 0;

  for (const sheetName of sheetNames) {
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
      { defval: null, raw: false }
    );

    for (let index = 0; index < rawRows.length; index += 1) {
      inspected += 1;
      if (inspected > MAX_IMPORT_ROWS) {
        throw new Error(`En fazla ${MAX_IMPORT_ROWS} Excel satırı yüklenebilir`);
      }

      const row = normalizeRow(rawRows[index]);
      const excelName = cleanText(row['ad soyad']);
      if (!excelName) continue;
      const key = profileNameKey(excelName);
      if (!key) {
        invalidRows.push(`${sheetName} / satır ${index + 2}: Ad Soyad geçersiz`);
        continue;
      }

      const patch: ProfileUpdate = {};
      for (const [excelColumn, dbColumn] of Object.entries(COLUMN_MAP)) {
        if (!(excelColumn in row)) continue;
        if (DATE_FIELDS.has(dbColumn)) {
          const rawDate = cleanText(row[excelColumn]);
          const date = parseExcelDate(row[excelColumn]);
          if (rawDate && !date) {
            // Satırı tamamen atlama — diğer alanları yine yaz; tarihi atla
            invalidRows.push(
              `${sheetName} / ${excelName}: ${excelColumn} tarihi atlandı (${rawDate})`
            );
            continue;
          }
          if (date) patch[dbColumn] = date;
        } else {
          patch[dbColumn] = cleanText(row[excelColumn]);
        }
      }

      const phone = normalizePhone(row['telefon numarasi']);
      if (phone && phone.length < 6) {
        invalidRows.push(
          `${sheetName} / ${excelName}: telefon numarası geçersiz`
        );
        continue;
      }
      if (phone) patch.whatsapp_number = phone;

      const previous = merged.get(key);
      if (previous) {
        const nonNullPatch = Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value != null)
        ) as ProfileUpdate;
        previous.patch = { ...previous.patch, ...nonNullPatch };
        previous.source = `${previous.source}, ${sheetName}`;
      } else {
        merged.set(key, { source: sheetName, excelName, key, patch });
      }
    }
  }

  return { rows: [...merged.values()], invalidRows };
}

function isAuthUserMissing(message: string): boolean {
  return /user not found|not found/i.test(message);
}

export async function POST(request: Request) {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Excel dosyası gerekli' }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json(
        { error: 'Yalnızca .xlsx dosyası yükleyebilirsiniz' },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'Excel dosyası boş veya 10 MB sınırını aşıyor' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return NextResponse.json(
        { error: 'Geçersiz XLSX dosya biçimi' },
        { status: 400 }
      );
    }

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      dense: false,
    });
    const sheetNames = findWorkbookSheets(workbook);
    const prepared = prepareWorkbookRows(workbook, sheetNames);

    const admin = createServiceClient();
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select(
        'id,tam_isim,whatsapp_number,role,is_pilot,takim_ekip,kulup_uyelikleri,dogum_gunu,beden,ise_giris_tarihi,blue_start,kartvizit,branda,giris_gorseli,yaka_karti,folkart_karti,cbx,cbx_kayit,ofis,sube,unvan'
      )
      .limit(MAX_IMPORT_ROWS);

    if (profilesError) {
      const migrationHint = /column|schema cache|does not exist/i.test(
        profilesError.message
      )
        ? ' Önce 20260816_profiles_excel_import_fields.sql migrationını çalıştırın.'
        : '';
      return NextResponse.json(
        { error: `${profilesError.message}.${migrationHint}` },
        { status: 500 }
      );
    }

    const profilesByName = new Map<string, Profile[]>();
    for (const profile of profiles || []) {
      const key = profileNameKey(profile.tam_isim);
      const existing = profilesByName.get(key) || [];
      existing.push(profile as Profile);
      profilesByName.set(key, existing);
    }

    const unmatched: string[] = [];
    const ambiguous: string[] = [];
    const errors: string[] = [...prepared.invalidRows];
    const authWarnings: string[] = [];
    let updated = 0;

    for (const row of prepared.rows) {
      const matches = profilesByName.get(row.key) || [];
      if (matches.length === 0) {
        unmatched.push(row.excelName);
        continue;
      }
      if (matches.length > 1) {
        ambiguous.push(row.excelName);
        continue;
      }

      const profile = matches[0];
      const nextPhone = row.patch.whatsapp_number;
      const phoneChanged =
        typeof nextPhone === 'string' &&
        nextPhone !== String(profile.whatsapp_number || '');
      let authPasswordUpdated = false;

      if (phoneChanged) {
        const { error: authError } = await admin.auth.admin.updateUserById(
          profile.id,
          { password: nextPhone }
        );
        if (authError && !isAuthUserMissing(authError.message || '')) {
          errors.push(`${row.excelName}: Auth telefonu güncellenemedi`);
          continue;
        }
        if (authError) {
          authWarnings.push(`${row.excelName}: Auth hesabı bulunamadı`);
        } else {
          authPasswordUpdated = true;
        }
      }

      // Fatima / Selim: Excel "Personel" olsa bile pilot olarak korunur
      const updatePayload: Record<string, unknown> = { ...row.patch };
      if (isKnownPilotPerson(profile.tam_isim) || isKnownPilotPerson(row.excelName)) {
        const flags = profilePilotFlagsForPerson(
          profile.tam_isim || row.excelName,
          profile.role || 'pilot'
        );
        updatePayload.role = flags.role;
        updatePayload.is_pilot = true;
      }

      let { error: updateError } = await admin
        .from('profiles')
        .update(updatePayload)
        .eq('id', profile.id);

      if (
        updateError &&
        updatePayload.role === 'pilot' &&
        /invalid input value for enum.*pilot/i.test(updateError.message)
      ) {
        const flags = profilePilotFlagsForPerson(
          profile.tam_isim || row.excelName,
          'pilot'
        );
        if (flags.legacyRole) {
          updatePayload.role = flags.legacyRole;
          updatePayload.is_pilot = true;
          ({ error: updateError } = await admin
            .from('profiles')
            .update(updatePayload)
            .eq('id', profile.id));
        }
      }

      if (updateError) {
        if (
          authPasswordUpdated &&
          profile.whatsapp_number &&
          profile.whatsapp_number.length >= 6
        ) {
          await admin.auth.admin.updateUserById(profile.id, {
            password: profile.whatsapp_number,
          });
        }
        errors.push(`${row.excelName}: ${updateError.message}`);
        continue;
      }
      updated += 1;
    }

    return NextResponse.json({
      ok: errors.length === 0,
      fileName: file.name,
      sheets: sheetNames,
      excelRows: prepared.rows.length,
      updated,
      unmatched,
      ambiguous,
      errors,
      authWarnings,
      roleNote:
        'Excel Rol sütunu içe aktarılmaz. Fatima Bayramova ve Mehmet Selim İdiz her zaman pilot olarak korunur.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Excel içe aktarılamadı';
    console.error('admin/users/import-excel:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
