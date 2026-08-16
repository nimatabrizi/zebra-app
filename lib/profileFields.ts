export const PROFILE_DETAIL_FIELDS = [
  { key: 'takim_ekip', label: 'Takım / Ekip', type: 'text', group: 'Kurumsal' },
  {
    key: 'kulup_uyelikleri',
    label: 'Kulüp Üyelikleri',
    type: 'text',
    group: 'Kurumsal',
  },
  { key: 'ofis', label: 'Ofis', type: 'text', group: 'Kurumsal' },
  { key: 'sube', label: 'Şube', type: 'text', group: 'Kurumsal' },
  { key: 'beden', label: 'Beden', type: 'text', group: 'Kişisel' },
  { key: 'dogum_gunu', label: 'Doğum Günü', type: 'date', group: 'Kişisel' },
  {
    key: 'ise_giris_tarihi',
    label: 'İşe Giriş Tarihi',
    type: 'date',
    group: 'Kişisel',
  },
  {
    key: 'blue_start',
    label: 'Blue Start',
    type: 'boolean',
    group: 'Materyal ve Sistem',
    trueValue: 'Katıldı',
    falseValue: 'Katılmadı',
  },
  {
    key: 'kartvizit',
    label: 'Kartvizit',
    type: 'boolean',
    group: 'Materyal ve Sistem',
    trueValue: 'Var',
    falseValue: 'Yok',
  },
  {
    key: 'branda',
    label: 'Branda',
    type: 'boolean',
    group: 'Materyal ve Sistem',
    trueValue: 'Var',
    falseValue: 'Yok',
  },
  {
    key: 'giris_gorseli',
    label: 'Giriş Görseli',
    type: 'boolean',
    group: 'Materyal ve Sistem',
    trueValue: 'Var',
    falseValue: 'Yok',
  },
  {
    key: 'yaka_karti',
    label: 'Yaka Kartı',
    type: 'boolean',
    group: 'Materyal ve Sistem',
    trueValue: 'Var',
    falseValue: 'Yok',
  },
  {
    key: 'folkart_karti',
    label: 'Folkart Kartı',
    type: 'boolean',
    group: 'Materyal ve Sistem',
    trueValue: 'Var',
    falseValue: 'Yok',
  },
  {
    key: 'cbx',
    label: 'CBX',
    type: 'select',
    group: 'Materyal ve Sistem',
    options: ['Var Aktif', 'Eğitim Sürecinde', 'Yok'],
  },
  {
    key: 'cbx_kayit',
    label: 'CBX Kayıt',
    type: 'text',
    group: 'Materyal ve Sistem',
  },
] as const;

export type ProfileDetailKey = (typeof PROFILE_DETAIL_FIELDS)[number]['key'];
export type ProfileDetailValues = Record<ProfileDetailKey, string | null>;

export const PROFILE_DETAIL_KEYS = PROFILE_DETAIL_FIELDS.map(
  (field) => field.key
) as ProfileDetailKey[];

function cleanValue(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).normalize('NFC').trim();
  return text || null;
}

function isValidIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return (
    date.getUTCFullYear() === +match[1] &&
    date.getUTCMonth() === +match[2] - 1 &&
    date.getUTCDate() === +match[3]
  );
}

/** API JSON gövdesinden yalnızca izin verilen profil detaylarını alır. */
export function sanitizeProfileDetails(
  body: Record<string, unknown>
): ProfileDetailValues {
  return Object.fromEntries(
    PROFILE_DETAIL_FIELDS.map((field) => {
      const value = cleanValue(body[field.key]);
      if (field.type === 'date' && value && !isValidIsoDate(value)) {
        throw new Error(`${field.label} geçerli bir tarih değil`);
      }
      if (field.type === 'boolean' && value) {
        const normalized = value.toLocaleLowerCase('tr-TR');
        const checked =
          normalized === String(field.trueValue).toLocaleLowerCase('tr-TR') ||
          normalized === 'true' ||
          normalized === 'var';
        return [field.key, checked ? field.trueValue : field.falseValue];
      }
      if (
        field.type === 'select' &&
        value &&
        !field.options.some(
          (option) =>
            option.toLocaleLowerCase('tr-TR') ===
            value.toLocaleLowerCase('tr-TR')
        )
      ) {
        throw new Error(`${field.label} değeri geçersiz`);
      }
      return [field.key, value];
    })
  ) as ProfileDetailValues;
}

export function pickProfileDetails(
  row: Record<string, unknown>
): ProfileDetailValues {
  return Object.fromEntries(
    PROFILE_DETAIL_KEYS.map((key) => [key, cleanValue(row[key])])
  ) as ProfileDetailValues;
}

export function emptyProfileDetails(): ProfileDetailValues {
  return Object.fromEntries(
    PROFILE_DETAIL_FIELDS.map((field) => [
      field.key,
      field.type === 'boolean' ? field.falseValue : null,
    ])
  ) as ProfileDetailValues;
}

export function isCheckedProfileValue(
  value: string | null | undefined,
  trueValue: string
): boolean {
  return (
    String(value || '')
      .trim()
      .toLocaleLowerCase('tr-TR') === trueValue.toLocaleLowerCase('tr-TR')
  );
}
