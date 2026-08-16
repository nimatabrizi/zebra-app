import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { assertCallerIsUserAdmin } from '../../../../../lib/adminGate';
import {
  isPilotAccount,
  normalizeAppRole,
  roleLabel,
} from '../../../../../lib/authIdentity';
import { pickProfileDetails } from '../../../../../lib/profileFields';
import { createServiceClient } from '../../../../../utils/supabase/admin';

export const runtime = 'nodejs';

type ExportRow = {
  'Ad Soyad': string;
  Rol: string;
  Unvan: string;
  'Telefon Numarası': string;
  'Takım Ekip': string;
  'Kulüp Üyelikleri': string;
  'Doğum Günü': string;
  Beden: string;
  'İşe Giriş Tarihi': string;
  'Blue Start': string;
  Kartvizit: string;
  Branda: string;
  'Giriş Görseli': string;
  'Yaka Kartı': string;
  'Folkart Kartı': string;
  CBX: string;
  'CBX Kayıt': string;
  Ofis: string;
  Şube: string;
};

function cell(value: unknown): string {
  if (value == null) return '';
  const text = String(value).normalize('NFC').trim();
  return text === '-' || text === '—' ? '' : text;
}

/** DB ISO (YYYY-MM-DD) → Excel uyumlu dd.mm.yyyy */
function formatDateTr(value: unknown): string {
  const text = cell(value);
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function pickUnvan(row: Record<string, unknown>): string {
  return cell(row.unvan ?? row.title ?? row.job_title ?? row.pozisyon);
}

function isPersonnelRow(row: ExportRow): boolean {
  return Boolean(row.Ofis.trim() || row.Şube.trim());
}

function toExportRow(row: Record<string, unknown>): ExportRow {
  const name = cell(row.tam_isim);
  const rawRole = String(row.role || '');
  const role = String(normalizeAppRole(rawRole) || rawRole);
  const details = pickProfileDetails(row);
  const displayRole = isPilotAccount({
    role: rawRole,
    fullName: name,
    is_pilot: Boolean(row.is_pilot),
  })
    ? roleLabel('pilot')
    : roleLabel(role);

  return {
    'Ad Soyad': name,
    Rol: displayRole,
    Unvan: pickUnvan(row),
    'Telefon Numarası': cell(row.whatsapp_number),
    'Takım Ekip': cell(details.takim_ekip),
    'Kulüp Üyelikleri': cell(details.kulup_uyelikleri),
    'Doğum Günü': formatDateTr(details.dogum_gunu),
    Beden: cell(details.beden),
    'İşe Giriş Tarihi': formatDateTr(details.ise_giris_tarihi),
    'Blue Start': cell(details.blue_start),
    Kartvizit: cell(details.kartvizit),
    Branda: cell(details.branda),
    'Giriş Görseli': cell(details.giris_gorseli),
    'Yaka Kartı': cell(details.yaka_karti),
    'Folkart Kartı': cell(details.folkart_karti),
    CBX: cell(details.cbx),
    'CBX Kayıt': cell(details.cbx_kayit),
    Ofis: cell(details.ofis),
    Şube: cell(details.sube),
  };
}

function sheetFromRows(rows: ExportRow[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = Object.keys(rows[0] || {
    'Ad Soyad': '',
    Rol: '',
    Unvan: '',
    'Telefon Numarası': '',
  }).map((key) => ({
    wch: Math.min(28, Math.max(12, key.length + 2)),
  }));
  return sheet;
}

export async function GET() {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const admin = createServiceClient();
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .order('tam_isim', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allRows = (data || []).map((row) =>
      toExportRow(row as Record<string, unknown>)
    );
    const consultants = allRows.filter((row) => !isPersonnelRow(row));
    const personnel = allRows.filter((row) => isPersonnelRow(row));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      sheetFromRows(allRows),
      'Tüm Kullanıcılar'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      sheetFromRows(consultants),
      'Tüm Danışmanlar'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      sheetFromRows(personnel),
      'Tüm Personel'
    );

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const stamp = new Date();
    const fileName = `zebra-kullanicilar-${stamp.getFullYear()}${String(
      stamp.getMonth() + 1
    ).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Excel dışa aktarılamadı';
    console.error('admin/users export-excel:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
