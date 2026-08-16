'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Columns3,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  Download,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  isNamedUserAdmin,
  isKnownPilotPerson,
  isPilotAccount,
  normalizeAppRole,
  normalizeWhatsappPassword,
  roleLabel,
  type AppRole,
} from '../lib/authIdentity';
import { toTitleCaseName } from '../lib/formatName';
import type { Profile } from '../types/profiles';
import {
  emptyProfileDetails,
  isCheckedProfileValue,
  PROFILE_DETAIL_FIELDS,
  type ProfileDetailKey,
  type ProfileDetailValues,
} from '../lib/profileFields';
import PhotoCropDialog from './PhotoCropDialog';

export type UserAdminMode = 'overview' | 'add';

const ROLE_OPTIONS: AppRole[] = [
  'danisman',
  'pilot',
  'broker',
  'personel',
];

type AdminUser = Omit<Profile, 'role'> & {
  role: string;
  photoUrl: string | null;
  created_at: string | null;
};

type Counts = {
  total: number;
  pilots: number;
  byRole: Record<string, number>;
};

type ExcelImportResult = {
  fileName: string;
  excelRows: number;
  updated: number;
  unmatched: string[];
  ambiguous: string[];
  errors: string[];
  authWarnings: string[];
  roleNote?: string;
};

const inputClass =
  'w-full h-12 rounded-xl bg-[#0A0A0A] border border-white/10 text-white px-4 outline-none text-[14px] focus:border-white/25';
const labelClass = 'text-[12px] font-medium text-[#86868B]';

type TriFilter = 'all' | 'yes' | 'no';
type QuickUserFilter = 'all' | 'consultants' | 'personnel';
type EditableUserKey =
  | 'tam_isim'
  | 'role'
  | 'unvan'
  | 'whatsapp_number'
  | ProfileDetailKey;
type EditableUserDraft = Record<EditableUserKey, string>;

type UserListFilters = {
  roles: AppRole[];
  takim_ekip: string;
  kulup_uyelikleri: string;
  ofis: string;
  sube: string;
  beden: string;
  blue_start: TriFilter;
  kartvizit: TriFilter;
  branda: TriFilter;
  giris_gorseli: TriFilter;
  yaka_karti: TriFilter;
  folkart_karti: TriFilter;
  cbx: string;
  cbx_kayit: string;
  hasPhoto: TriFilter;
};

const EMPTY_USER_FILTERS: UserListFilters = {
  roles: [],
  takim_ekip: '',
  kulup_uyelikleri: '',
  ofis: '',
  sube: '',
  beden: '',
  blue_start: 'all',
  kartvizit: 'all',
  branda: 'all',
  giris_gorseli: 'all',
  yaka_karti: 'all',
  folkart_karti: 'all',
  cbx: '',
  cbx_kayit: '',
  hasPhoto: 'all',
};

const TRI_MATERIAL_FIELDS = [
  { key: 'kartvizit', label: 'Kartvizit' },
  { key: 'branda', label: 'Branda' },
  { key: 'giris_gorseli', label: 'Giriş Görseli' },
  { key: 'yaka_karti', label: 'Yaka Kartı' },
  { key: 'folkart_karti', label: 'Folkart Kartı' },
] as const;

function normalizeFilterText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

/**
 * Personel filtresi: AppRole = personel (üstteki Personel kartıyla aynı).
 * Danışman filtresi: AppRole = danisman.
 */
function isPersonelRoleUser(user: AdminUser): boolean {
  return String(normalizeAppRole(user.role) || user.role) === 'personel';
}

function isConsultantRoleUser(user: AdminUser): boolean {
  return String(normalizeAppRole(user.role) || user.role) === 'danisman';
}

function userMatchesQuickFilter(
  user: AdminUser,
  quickFilter: QuickUserFilter
): boolean {
  if (quickFilter === 'all') return true;
  if (quickFilter === 'personnel') return isPersonelRoleUser(user);
  return isConsultantRoleUser(user);
}

function editableDraftFromUser(user: AdminUser): EditableUserDraft {
  return {
    tam_isim: user.tam_isim || '',
    role: String(normalizeAppRole(user.role) || user.role || 'danisman'),
    unvan: user.unvan || '',
    whatsapp_number: user.whatsapp_number || '',
    ...Object.fromEntries(
      PROFILE_DETAIL_FIELDS.map((field) => [
        field.key,
        user[field.key] ??
          (field.type === 'boolean' ? field.falseValue : ''),
      ])
    ),
  } as EditableUserDraft;
}

function editableValueFromUser(
  user: AdminUser,
  key: EditableUserKey
): string {
  if (key === 'role') {
    return String(normalizeAppRole(user.role) || user.role || '');
  }
  return String(user[key] ?? '');
}

function changedDraftFields(
  user: AdminUser,
  draft: EditableUserDraft
): { key: EditableUserKey; label: string; before: string; after: string }[] {
  const labels = new Map<EditableUserKey, string>([
    ['tam_isim', 'Tam isim'],
    ['role', 'Rol'],
    ['unvan', 'Unvan'],
    ['whatsapp_number', 'Telefon numarası'],
    ...PROFILE_DETAIL_FIELDS.map(
      (field) => [field.key, field.label] as [ProfileDetailKey, string]
    ),
  ]);

  return (Array.from(labels.keys()) as EditableUserKey[])
    .map((key) => ({
      key,
      label: labels.get(key) || key,
      before: editableValueFromUser(user, key).trim(),
      after: String(draft[key] || '').trim(),
    }))
    .filter(
      (change) =>
        normalizeFilterText(change.before) !==
        normalizeFilterText(change.after)
    );
}

function matchesTriFilter(
  value: string | null | undefined,
  filter: TriFilter,
  trueValue: string,
  falseValue?: string
): boolean {
  if (filter === 'all') return true;
  const normalized = normalizeFilterText(value);
  if (!normalized) return filter === 'no';
  const isYes =
    normalized === trueValue.toLocaleLowerCase('tr-TR') ||
    normalized === 'var' ||
    normalized === 'true' ||
    normalized.includes('katildi');
  if (filter === 'yes') return isYes;
  if (falseValue) {
    return (
      normalized === falseValue.toLocaleLowerCase('tr-TR') ||
      normalized === 'yok' ||
      normalized.includes('katilmadi') ||
      !isYes
    );
  }
  return !isYes;
}

function countActiveFilters(filters: UserListFilters): number {
  let count = 0;
  if (filters.roles.length) count += 1;
  if (filters.takim_ekip) count += 1;
  if (filters.kulup_uyelikleri) count += 1;
  if (filters.ofis) count += 1;
  if (filters.sube) count += 1;
  if (filters.beden) count += 1;
  if (filters.blue_start !== 'all') count += 1;
  if (filters.kartvizit !== 'all') count += 1;
  if (filters.branda !== 'all') count += 1;
  if (filters.giris_gorseli !== 'all') count += 1;
  if (filters.yaka_karti !== 'all') count += 1;
  if (filters.folkart_karti !== 'all') count += 1;
  if (filters.cbx) count += 1;
  if (filters.cbx_kayit) count += 1;
  if (filters.hasPhoto !== 'all') count += 1;
  return count;
}

function uniqueSortedValues(
  users: AdminUser[],
  key: keyof AdminUser
): string[] {
  const set = new Set<string>();
  for (const user of users) {
    const value = String(user[key] ?? '').trim();
    if (value && value !== '-' && value !== '—') set.add(value);
  }
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, 'tr-TR', { sensitivity: 'base' })
  );
}

function userMatchesFilters(user: AdminUser, filters: UserListFilters): boolean {
  if (filters.roles.length) {
    const role = String(normalizeAppRole(user.role) || user.role);
    const isPilot = isPilotAccount({
      role: user.role,
      fullName: user.tam_isim,
      is_pilot: user.is_pilot,
    });
    const hit = filters.roles.some((r) =>
      r === 'pilot' ? isPilot : role === r
    );
    if (!hit) return false;
  }

  const textEquals = (actual: string | null | undefined, expected: string) =>
    !expected ||
    normalizeFilterText(actual) === normalizeFilterText(expected);

  if (!textEquals(user.takim_ekip, filters.takim_ekip)) return false;
  if (!textEquals(user.kulup_uyelikleri, filters.kulup_uyelikleri)) return false;
  if (!textEquals(user.ofis, filters.ofis)) return false;
  if (!textEquals(user.sube, filters.sube)) return false;
  if (!textEquals(user.beden, filters.beden)) return false;
  if (!textEquals(user.cbx, filters.cbx)) return false;
  if (!textEquals(user.cbx_kayit, filters.cbx_kayit)) return false;

  if (
    !matchesTriFilter(user.blue_start, filters.blue_start, 'Katıldı', 'Katılmadı')
  ) {
    return false;
  }
  for (const field of TRI_MATERIAL_FIELDS) {
    if (!matchesTriFilter(user[field.key], filters[field.key], 'Var', 'Yok')) {
      return false;
    }
  }
  if (filters.hasPhoto !== 'all') {
    const has = Boolean(user.photoUrl);
    if (filters.hasPhoto === 'yes' && !has) return false;
    if (filters.hasPhoto === 'no' && has) return false;
  }
  return true;
}

function detailsFromUser(user?: Partial<AdminUser>): ProfileDetailValues {
  return Object.fromEntries(
    PROFILE_DETAIL_FIELDS.map((field) => [
      field.key,
      user?.[field.key] ??
        (field.type === 'boolean' ? field.falseValue : null),
    ])
  ) as ProfileDetailValues;
}

function formatProfileDate(value: string | null): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function ProfileDetailsFields({
  values,
  onChange,
}: {
  values: ProfileDetailValues;
  onChange: (key: ProfileDetailKey, value: string | null) => void;
}) {
  const groups = Array.from(
    new Set(PROFILE_DETAIL_FIELDS.map((field) => field.group))
  );

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group} className="space-y-3">
          <h3 className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#636366]">
            {group}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROFILE_DETAIL_FIELDS.filter(
              (field) => field.group === group
            ).map((field) => {
              const value = values[field.key] || '';

              if (field.type === 'boolean') {
                const checked = isCheckedProfileValue(
                  value,
                  field.trueValue
                );
                return (
                  <label
                    key={field.key}
                    className="min-h-12 rounded-xl bg-[#0A0A0A] border border-white/10 px-4 py-3 flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <span>
                      <span className="block text-[13px] text-white">
                        {field.label}
                      </span>
                      <span className="block mt-0.5 text-[11px] text-[#636366]">
                        {checked ? field.trueValue : field.falseValue}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        onChange(
                          field.key,
                          event.target.checked
                            ? field.trueValue
                            : field.falseValue
                        )
                      }
                      className="h-5 w-5 accent-white"
                    />
                  </label>
                );
              }

              if (field.type === 'select') {
                return (
                  <label key={field.key} className="block space-y-2">
                    <span className={labelClass}>{field.label}</span>
                    <select
                      value={value}
                      onChange={(event) =>
                        onChange(field.key, event.target.value || null)
                      }
                      className={inputClass}
                    >
                      <option value="">Seçilmedi</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              return (
                <label key={field.key} className="block space-y-2">
                  <span className={labelClass}>{field.label}</span>
                  <input
                    type={field.type}
                    value={value}
                    onChange={(event) =>
                      onChange(field.key, event.target.value || null)
                    }
                    className={inputClass}
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModeHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[#636366]">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-[28px] sm:text-[32px] font-medium tracking-tight text-white leading-none">
        {title}
      </h1>
      <p className="mt-3 text-[14px] text-[#86868B] leading-relaxed max-w-2xl">
        {description}
      </p>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm cursor-pointer border-0"
        onClick={() => onCloseRef.current()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[min(92dvh,920px)] flex flex-col rounded-2xl border border-white/10 bg-[#141414] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/5">
          <h2 className="text-[17px] sm:text-[18px] font-medium text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="w-9 h-9 rounded-full text-[#86868B] hover:text-white inline-flex items-center justify-center cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 sm:px-6 py-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TriSegment({
  value,
  onChange,
  yesLabel = 'Var',
  noLabel = 'Yok',
}: {
  value: TriFilter;
  onChange: (next: TriFilter) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  const options: { id: TriFilter; label: string }[] = [
    { id: 'all', label: 'Tümü' },
    { id: 'yes', label: yesLabel },
    { id: 'no', label: noLabel },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#0A0A0A] border border-white/10 p-1">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`h-9 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
              active
                ? 'bg-white text-black'
                : 'text-[#86868B] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function UserFilterPanel({
  open,
  draft,
  setDraft,
  users,
  matchCount,
  onClose,
  onApply,
  onReset,
}: {
  open: boolean;
  draft: UserListFilters;
  setDraft: React.Dispatch<React.SetStateAction<UserListFilters>>;
  users: AdminUser[];
  matchCount: number;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  if (!open) return null;

  const teams = uniqueSortedValues(users, 'takim_ekip');
  const clubs = uniqueSortedValues(users, 'kulup_uyelikleri');
  const offices = uniqueSortedValues(users, 'ofis');
  const branches = uniqueSortedValues(users, 'sube');
  const sizes = uniqueSortedValues(users, 'beden');
  const cbxOptions = uniqueSortedValues(users, 'cbx');
  const cbxRecords = uniqueSortedValues(users, 'cbx_kayit');

  const toggleRole = (role: AppRole) => {
    setDraft((current) => {
      const exists = current.roles.includes(role);
      return {
        ...current,
        roles: exists
          ? current.roles.filter((item) => item !== role)
          : [...current.roles, role],
      };
    });
  };

  return (
    <ModalShell title="Filtre ayarları" onClose={onClose} wide>
      <div className="space-y-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] text-[#AEAEB2] leading-relaxed">
              Rol, ekip, ofis ve materyal durumuna göre listeyi daraltın.
            </p>
            <p className="mt-2 text-[12px] text-[#636366]">
              Önizleme:{' '}
              <span className="text-white tabular-nums">{matchCount}</span>{' '}
              kullanıcı
            </p>
          </div>
          <div className="shrink-0 w-11 h-11 rounded-full border border-white/10 bg-white/5 inline-flex items-center justify-center text-[#AEAEB2]">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#636366]">
            Rol
          </h3>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((role) => {
              const active = draft.roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`h-9 px-3.5 rounded-full text-[12px] font-medium cursor-pointer border transition-colors ${
                    active
                      ? 'bg-white text-black border-white'
                      : 'border-white/10 text-[#AEAEB2] hover:text-white hover:border-white/25'
                  }`}
                >
                  {roleLabel(role)}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#636366]">
            Kurumsal
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                ['takim_ekip', 'Takım / Ekip', teams],
                ['kulup_uyelikleri', 'Kulüp Üyelikleri', clubs],
                ['ofis', 'Ofis', offices],
                ['sube', 'Şube', branches],
                ['beden', 'Beden', sizes],
              ] as const
            ).map(([key, label, options]) => (
              <label key={key} className="block space-y-2">
                <span className={labelClass}>{label}</span>
                <select
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: e.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">Tümü</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#636366]">
            Materyal ve sistem
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className={labelClass}>Blue Start</span>
              <TriSegment
                value={draft.blue_start}
                onChange={(next) =>
                  setDraft((current) => ({ ...current, blue_start: next }))
                }
                yesLabel="Katıldı"
                noLabel="Katılmadı"
              />
            </div>
            {TRI_MATERIAL_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <span className={labelClass}>{field.label}</span>
                <TriSegment
                  value={draft[field.key]}
                  onChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: next,
                    }))
                  }
                />
              </div>
            ))}
            <label className="block space-y-2">
              <span className={labelClass}>CBX</span>
              <select
                value={draft.cbx}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, cbx: e.target.value }))
                }
                className={inputClass}
              >
                <option value="">Tümü</option>
                {(cbxOptions.length
                  ? cbxOptions
                  : ['Var Aktif', 'Eğitim Sürecinde', 'Yok']
                ).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>CBX Kayıt</span>
              <select
                value={draft.cbx_kayit}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    cbx_kayit: e.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">Tümü</option>
                {cbxRecords.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#636366]">
            Fotoğraf
          </h3>
          <TriSegment
            value={draft.hasPhoto}
            onChange={(next) =>
              setDraft((current) => ({ ...current, hasPhoto: next }))
            }
            yesLabel="Var"
            noLabel="Yok"
          />
        </section>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer"
          >
            Temizle
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onApply}
            className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-medium cursor-pointer"
          >
            Uygula ({matchCount})
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function DetailedUsersTable({
  users,
  loading,
  onSaved,
}: {
  users: AdminUser[];
  loading: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableUserDraft | null>(null);
  const [pendingUser, setPendingUser] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setDraft(editableDraftFromUser(user));
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setPendingUser(null);
    setError(null);
  };

  const requestSave = (user: AdminUser) => {
    if (!draft) return;
    const changes = changedDraftFields(user, draft);
    if (changes.length === 0) {
      cancelEdit();
      return;
    }
    setPendingUser(user);
  };

  const confirmSave = async () => {
    if (!pendingUser || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        tam_isim: draft.tam_isim.trim(),
        role: isKnownPilotPerson(draft.tam_isim)
          ? 'pilot'
          : draft.role,
        unvan: draft.unvan.trim() || null,
        ...Object.fromEntries(
          PROFILE_DETAIL_FIELDS.map((field) => [
            field.key,
            draft[field.key].trim() || null,
          ])
        ),
      };

      if (
        normalizeWhatsappPassword(draft.whatsapp_number) !==
        normalizeWhatsappPassword(pendingUser.whatsapp_number || '')
      ) {
        body.whatsapp_number = draft.whatsapp_number;
      }

      const response = await fetch(`/api/admin/users/${pendingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Değişiklik kaydedilemedi');

      await onSaved();
      cancelEdit();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Değişiklik kaydedilemedi'
      );
    } finally {
      setSaving(false);
    }
  };

  const pendingChanges =
    pendingUser && draft ? changedDraftFields(pendingUser, draft) : [];

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#141414]/95 py-16 flex items-center justify-center gap-2 text-[#86868B] text-[14px]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Yükleniyor…
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#141414]/95 py-16 text-center text-[14px] text-[#86868B]">
        Kullanıcı bulunamadı
      </div>
    );
  }

  const columns: {
    key: EditableUserKey;
    label: string;
    type: 'text' | 'date' | 'role' | 'boolean' | 'select';
    width: string;
    options?: readonly string[];
    trueValue?: string;
    falseValue?: string;
  }[] = [
    { key: 'tam_isim', label: 'Tam isim', type: 'text', width: 'w-[230px]' },
    { key: 'role', label: 'Rol', type: 'role', width: 'w-[150px]' },
    { key: 'unvan', label: 'Unvan', type: 'text', width: 'w-[220px]' },
    {
      key: 'whatsapp_number',
      label: 'Telefon',
      type: 'text',
      width: 'w-[170px]',
    },
    ...PROFILE_DETAIL_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      width:
        field.type === 'boolean'
          ? 'w-[145px]'
          : field.type === 'date'
            ? 'w-[165px]'
            : 'w-[190px]',
      options: field.type === 'select' ? field.options : undefined,
      trueValue: field.type === 'boolean' ? field.trueValue : undefined,
      falseValue: field.type === 'boolean' ? field.falseValue : undefined,
    })),
  ];

  return (
    <>
      <div className="rounded-2xl border border-white/5 bg-[#141414]/95 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="border-separate border-spacing-0 min-w-max text-left">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={column.key}
                    className={`${column.width} ${
                      index === 0
                        ? 'sticky left-0 z-20 bg-[#191919]'
                        : 'bg-[#191919]'
                    } h-11 px-3 border-b border-r border-white/5 text-[10px] font-medium tracking-[0.12em] uppercase text-[#636366] whitespace-nowrap`}
                  >
                    {column.label}
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-[#191919] w-[72px] h-11 px-2 border-b border-white/5 text-[10px] font-medium tracking-[0.12em] uppercase text-[#636366] text-center">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const editing = editingId === user.id && draft;
                const lockedPilot =
                  isKnownPilotPerson(user.tam_isim) ||
                  (draft ? isKnownPilotPerson(draft.tam_isim) : false);

                return (
                  <tr key={user.id} className="group">
                    {columns.map((column, index) => {
                      const raw = editing
                        ? draft[column.key]
                        : editableValueFromUser(user, column.key);
                      const display =
                        column.key === 'role'
                          ? roleLabel(normalizeAppRole(raw))
                          : column.type === 'date'
                            ? formatProfileDate(raw || null)
                            : raw || '—';

                      return (
                        <td
                          key={column.key}
                          className={`${column.width} ${
                            index === 0
                              ? 'sticky left-0 z-10 bg-[#141414] group-hover:bg-[#171717]'
                              : 'bg-[#141414] group-hover:bg-[#171717]'
                          } h-[58px] p-2 border-b border-r border-white/5 align-middle`}
                        >
                          {editing ? (
                            column.type === 'role' ? (
                              <select
                                value={lockedPilot ? 'pilot' : raw}
                                disabled={lockedPilot}
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          [column.key]: event.target.value,
                                        }
                                      : current
                                  )
                                }
                                className="w-full h-9 rounded-lg bg-[#0A0A0A] border border-white/10 text-white px-2.5 text-[12px] outline-none focus:border-white/30 disabled:opacity-60"
                              >
                                {ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>
                                    {roleLabel(role)}
                                  </option>
                                ))}
                              </select>
                            ) : column.type === 'boolean' ? (
                              <select
                                value={raw}
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          [column.key]: event.target.value,
                                        }
                                      : current
                                  )
                                }
                                className="w-full h-9 rounded-lg bg-[#0A0A0A] border border-white/10 text-white px-2.5 text-[12px] outline-none focus:border-white/30"
                              >
                                <option value={column.trueValue}>
                                  {column.trueValue}
                                </option>
                                <option value={column.falseValue}>
                                  {column.falseValue}
                                </option>
                              </select>
                            ) : column.type === 'select' ? (
                              <select
                                value={raw}
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          [column.key]: event.target.value,
                                        }
                                      : current
                                  )
                                }
                                className="w-full h-9 rounded-lg bg-[#0A0A0A] border border-white/10 text-white px-2.5 text-[12px] outline-none focus:border-white/30"
                              >
                                <option value="">—</option>
                                {column.options?.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={column.type}
                                value={raw}
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          [column.key]: event.target.value,
                                        }
                                      : current
                                  )
                                }
                                className="w-full h-9 rounded-lg bg-[#0A0A0A] border border-white/10 text-white px-2.5 text-[12px] outline-none focus:border-white/30"
                              />
                            )
                          ) : (
                            <span
                              className={`block px-1 text-[12px] truncate ${
                                raw ? 'text-[#D1D1D6]' : 'text-[#48484A]'
                              }`}
                              title={display}
                            >
                              {column.key === 'tam_isim'
                                ? toTitleCaseName(display)
                                : display}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={`sticky right-0 z-10 bg-[#141414] group-hover:bg-[#171717] h-[58px] border-b border-white/5 ${
                        editing ? 'w-[154px] px-2' : 'w-[72px] px-2'
                      }`}
                    >
                      {editing ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => requestSave(user)}
                            className="h-8 px-3 rounded-full bg-white text-black text-[11px] font-medium cursor-pointer"
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="h-8 w-8 rounded-full border border-white/10 text-[#86868B] hover:text-white inline-flex items-center justify-center cursor-pointer"
                            aria-label="Vazgeç"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => beginEdit(user)}
                            disabled={Boolean(editingId)}
                            className="h-8 w-8 rounded-full border border-white/10 text-[#AEAEB2] hover:text-white hover:border-white/25 inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
                            aria-label="Düzenle"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && !pendingUser ? (
        <p className="mt-3 text-[13px] text-[#FF3B30]">{error}</p>
      ) : null}

      {pendingUser ? (
        <ModalShell
          title="Değişiklikleri kaydet?"
          onClose={() => {
            if (!saving) setPendingUser(null);
          }}
          wide
        >
          <div className="space-y-5">
            <p className="text-[13px] text-[#AEAEB2] leading-relaxed">
              <span className="text-white font-medium">
                {toTitleCaseName(pendingUser.tam_isim)}
              </span>{' '}
              için aşağıdaki değişiklikler sisteme uygulanacak.
            </p>
            <div className="rounded-xl border border-white/5 overflow-hidden">
              {pendingChanges.map((change) => (
                <div
                  key={change.key}
                  className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr_24px_1fr] gap-2 sm:gap-3 px-3.5 py-3 border-b last:border-b-0 border-white/5 text-[12px]"
                >
                  <span className="text-[#636366]">{change.label}</span>
                  <span className="text-[#86868B] break-words">
                    {change.before || '—'}
                  </span>
                  <span className="hidden sm:block text-[#48484A]">→</span>
                  <span className="text-white break-words">
                    {change.after || '—'}
                  </span>
                </div>
              ))}
            </div>
            {pendingChanges.some(
              (change) => change.key === 'whatsapp_number'
            ) ? (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-[12px] text-amber-200">
                Telefon değişikliği kullanıcının giriş şifresini de günceller.
              </p>
            ) : null}
            {error ? (
              <p className="text-[13px] text-[#FF3B30]">{error}</p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingUser(null)}
                disabled={saving}
                className="flex-1 h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void confirmSave()}
                disabled={saving}
                className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Değişiklikleri uygula
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

type UserManagementProps = {
  mode: UserAdminMode;
  onNavigate?: (tabId: string) => void;
};

export default function UserManagement({
  mode,
  onNavigate,
}: UserManagementProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<UserListFilters>(EMPTY_USER_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<UserListFilters>(EMPTY_USER_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickUserFilter>('all');
  const [detailedView, setDetailedView] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(
    null
  );
  const [importError, setImportError] = useState<string | null>(null);

  const [viewUser, setViewUser] = useState<AdminUser | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Liste alınamadı');
      setUsers(data.users || []);
      setCounts(data.counts || null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers, mode]);

  const importExcel = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/users/import-excel', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Excel içe aktarılamadı');
      }
      setImportResult(data as ExcelImportResult);
      await loadUsers();
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Excel içe aktarılamadı'
      );
    } finally {
      setImporting(false);
    }
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    setImportError(null);
    try {
      const response = await fetch('/api/admin/users/export-excel');
      if (!response.ok) {
        let message = 'Excel dışa aktarılamadı';
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* gövde JSON değilse varsayılan mesaj */
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName =
        match?.[1] ||
        `zebra-kullanicilar-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Excel dışa aktarılamadı'
      );
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return users.filter((u) => {
      if (!userMatchesQuickFilter(u, quickFilter)) return false;
      if (!userMatchesFilters(u, filters)) return false;
      if (!q) return true;
      const hay = [
        u.tam_isim,
        u.unvan,
        u.role,
        u.whatsapp_number,
        u.takim_ekip,
        u.kulup_uyelikleri,
        u.ofis,
        u.sube,
        u.beden,
        u.cbx,
        u.cbx_kayit,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [users, query, filters, quickFilter]);

  const draftMatchCount = useMemo(
    () => users.filter((u) => userMatchesFilters(u, draftFilters)).length,
    [users, draftFilters]
  );

  const activeFilterCount = countActiveFilters(filters);

  const openFilters = () => {
    setDraftFilters(filters);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFilterOpen(false);
  };

  const resetDraftFilters = () => {
    setDraftFilters(EMPTY_USER_FILTERS);
  };

  const clearAllFilters = () => {
    setFilters(EMPTY_USER_FILTERS);
    setDraftFilters(EMPTY_USER_FILTERS);
  };

  if (mode === 'add') {
    return <UserAddForm onCreated={loadUsers} />;
  }

  return (
    <div
      className={`panel-enter w-full ${
        detailedView ? 'max-w-none' : 'max-w-6xl'
      }`}
    >
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[#636366]">
            Kullanıcı Yönetimi
          </p>
          <h1 className="mt-1 text-[28px] sm:text-[32px] font-medium tracking-tight text-white leading-none">
            Tüm Kullanıcılar
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting || loading || users.length === 0}
            onClick={() => void exportExcel()}
            className="h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.025] text-[12px] text-[#AEAEB2] inline-flex items-center justify-center gap-2 transition-colors hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Dışa aktar
          </button>
          <label
            className={`h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.025] text-[12px] text-[#AEAEB2] inline-flex items-center justify-center gap-2 transition-colors ${
              importing
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:text-white hover:bg-white/[0.06] cursor-pointer'
            }`}
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            İçe aktar
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importing}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importExcel(file);
                event.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onNavigate?.('users-add')}
            className="h-10 px-4 rounded-xl bg-white text-black text-[12px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer hover:bg-[#E8E8ED] active:scale-[0.98] transition"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Kullanıcı ekle
          </button>
        </div>
      </div>

      {counts ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5 mb-6">
          {[
            { label: 'Toplam', value: counts.total },
            { label: 'Danışman', value: counts.byRole.danisman || 0 },
            { label: 'Pilot', value: counts.pilots },
            { label: 'Broker', value: counts.byRole.broker || 0 },
            { label: 'Personel', value: counts.byRole.personel || 0 },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/[0.06] bg-[#141414]/90 px-4 py-3.5"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#636366]">
                {s.label}
              </p>
              <p className="mt-1.5 text-[23px] font-medium text-white tabular-nums tracking-tight">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/[0.07] bg-[#121212]/80 p-2.5 sm:p-3 mb-3">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#636366]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İsim, unvan, ekip veya telefon ara"
              className="w-full h-11 rounded-xl bg-[#0A0A0A] border border-white/[0.07] text-white placeholder:text-[#48484A] pl-10 pr-4 outline-none focus:border-white/20 text-[13px]"
            />
          </div>
          <button
            type="button"
            onClick={openFilters}
            className={`h-11 px-4 rounded-xl border text-[12px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              activeFilterCount
                ? 'border-white/25 bg-white/10 text-white'
                : 'border-white/[0.07] bg-[#0A0A0A] text-[#AEAEB2] hover:text-white hover:border-white/15'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Gelişmiş filtre
            {activeFilterCount ? (
              <span className="min-w-5 h-5 px-1.5 rounded-md bg-white text-black text-[10px] font-semibold tabular-nums inline-flex items-center justify-center">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="inline-grid grid-cols-3 rounded-xl bg-[#0A0A0A] border border-white/[0.07] p-1 self-start w-full sm:w-auto">
            {(
              [
                ['all', 'Tümü', users.length],
                [
                  'consultants',
                  'Danışman',
                  users.filter((user) =>
                    userMatchesQuickFilter(user, 'consultants')
                  ).length,
                ],
                [
                  'personnel',
                  'Personel',
                  users.filter((user) =>
                    userMatchesQuickFilter(user, 'personnel')
                  ).length,
                ],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setQuickFilter(id)}
                className={`h-8 px-3 rounded-lg text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  quickFilter === id
                    ? 'bg-[#2C2C2E] text-white shadow-sm'
                    : 'text-[#636366] hover:text-[#AEAEB2]'
                }`}
              >
                {label}
                <span className="text-[10px] tabular-nums opacity-55">
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div
            className="inline-grid grid-cols-2 rounded-xl bg-[#0A0A0A] border border-white/[0.07] p-1 self-start sm:self-auto"
            aria-label="Görünüm seçimi"
          >
            <button
              type="button"
              onClick={() => setDetailedView(false)}
              className={`h-8 px-3 rounded-lg text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                !detailedView
                  ? 'bg-[#2C2C2E] text-white shadow-sm'
                  : 'text-[#636366] hover:text-[#AEAEB2]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Kartlar
            </button>
            <button
              type="button"
              onClick={() => setDetailedView(true)}
              className={`h-8 px-3 rounded-lg text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                detailedView
                  ? 'bg-[#2C2C2E] text-white shadow-sm'
                  : 'text-[#636366] hover:text-[#AEAEB2]'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Liste
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 min-h-8">
        <p className="text-[12px] text-[#636366]">
          Gösterilen{' '}
          <span className="text-[#AEAEB2] tabular-nums">{filtered.length}</span>
          {users.length !== filtered.length ? (
            <>
              {' '}
              / <span className="tabular-nums">{users.length}</span>
            </>
          ) : null}
        </p>
        {activeFilterCount ? (
          <>
            <span className="text-[#3A3A3C]">·</span>
            {filters.roles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    roles: current.roles.filter((item) => item !== role),
                  }))
                }
                className="h-7 px-2.5 rounded-full border border-white/10 text-[11px] text-[#AEAEB2] hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                {roleLabel(role)}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="h-7 px-2.5 rounded-full text-[11px] text-[#86868B] hover:text-white cursor-pointer"
            >
              Filtreleri temizle
            </button>
          </>
        ) : null}
      </div>

      {importError ? (
        <p className="text-[13px] text-[#FF3B30] mb-4">{importError}</p>
      ) : null}

      {importResult ? (
        <div
          className={`mb-4 rounded-2xl border px-4 py-3 text-[13px] ${
            importResult.errors.length ||
            importResult.unmatched.length ||
            importResult.ambiguous.length
              ? 'border-amber-500/20 bg-amber-500/10'
              : 'border-emerald-500/20 bg-emerald-500/10'
          }`}
        >
          <p className="font-medium text-white">
            {importResult.updated} / {importResult.excelRows} profil güncellendi
          </p>
          {importResult.unmatched.length ? (
            <p className="mt-1 text-amber-200">
              Eşleşmeyen ({importResult.unmatched.length}):{' '}
              {importResult.unmatched.slice(0, 12).join(', ')}
              {importResult.unmatched.length > 12 ? '…' : ''}
            </p>
          ) : null}
          {importResult.ambiguous.length ? (
            <p className="mt-1 text-amber-200">
              Birden fazla profil eşleşen: {importResult.ambiguous.join(', ')}
            </p>
          ) : null}
          {importResult.errors.length ? (
            <p className="mt-1 text-[#FF9F9A]">
              Hatalar: {importResult.errors.slice(0, 8).join(' · ')}
              {importResult.errors.length > 8 ? '…' : ''}
            </p>
          ) : null}
          {importResult.authWarnings.length ? (
            <p className="mt-1 text-amber-200">
              Auth uyarıları: {importResult.authWarnings.join(', ')}
            </p>
          ) : null}
          {importResult.roleNote ? (
            <p className="mt-1 text-[#86868B]">{importResult.roleNote}</p>
          ) : null}
        </div>
      ) : null}

      {listError ? (
        <p className="text-[13px] text-[#FF3B30] mb-4">{listError}</p>
      ) : null}

      {detailedView ? (
        <DetailedUsersTable
          users={filtered}
          loading={loading}
          onSaved={loadUsers}
        />
      ) : (
      <div className="rounded-2xl border border-white/5 bg-[#141414]/95 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#86868B] text-[14px]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-[#86868B]">
            Kullanıcı bulunamadı
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-white/[0.02]"
              >
                <div className="w-11 h-11 rounded-full bg-[#1C1C1E] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {u.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.photoUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Users className="w-4 h-4 text-[#636366]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-white font-medium truncate">
                    {toTitleCaseName(u.tam_isim)}
                    {isNamedUserAdmin(u.tam_isim) ? (
                      <span className="ml-2 text-[11px] text-[#AEAEB2]">
                        (yetkili)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-[#86868B] truncate mt-0.5">
                    {roleLabel(normalizeAppRole(u.role))}
                    {u.unvan ? ` · ${u.unvan}` : ''}
                    {u.whatsapp_number ? ` · ${u.whatsapp_number}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewUser(u)}
                    className="h-9 px-2.5 sm:px-3 rounded-full border border-white/10 text-[12px] text-[#AEAEB2] hover:text-white hover:border-white/25 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Görüntüle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditUser(u)}
                    className="h-9 px-2.5 sm:px-3 rounded-full border border-white/10 text-[12px] text-[#AEAEB2] hover:text-white hover:border-white/25 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Düzenle</span>
                  </button>
                  {!isNamedUserAdmin(u.tam_isim) ? (
                    <button
                      type="button"
                      onClick={() => setDeleteUser(u)}
                      className="h-9 w-9 rounded-full border border-white/10 text-[#86868B] hover:text-[#FF3B30] hover:border-[#FF3B30]/40 inline-flex items-center justify-center cursor-pointer"
                      aria-label="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {viewUser ? (
        <ViewUserModal user={viewUser} onClose={() => setViewUser(null)} />
      ) : null}

      <UserFilterPanel
        open={filterOpen}
        draft={draftFilters}
        setDraft={setDraftFilters}
        users={users}
        matchCount={draftMatchCount}
        onClose={() => setFilterOpen(false)}
        onApply={applyFilters}
        onReset={resetDraftFilters}
      />

      {editUser ? (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={async () => {
            await loadUsers();
            setEditUser(null);
          }}
        />
      ) : null}

      {deleteUser ? (
        <DeleteUserModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={async () => {
            await loadUsers();
            setDeleteUser(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ViewUserModal({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Kullanıcı bilgisi" onClose={onClose} wide>
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full bg-[#1C1C1E] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
          {user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <Users className="w-5 h-5 text-[#636366]" />
          )}
        </div>
        <div>
          <p className="text-[17px] text-white font-medium">
            {toTitleCaseName(user.tam_isim)}
          </p>
          <p className="text-[13px] text-[#86868B] mt-0.5">
            {roleLabel(normalizeAppRole(user.role))}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
        {[
          { k: 'Unvan', v: user.unvan || '—' },
          { k: 'Telefon numarası', v: user.whatsapp_number || '—' },
          ...PROFILE_DETAIL_FIELDS.map((field) => ({
            k: field.label,
            v:
              field.type === 'date'
                ? formatProfileDate(user[field.key])
                : user[field.key] || '—',
          })),
        ].map((row) => (
          <div
            key={row.k}
            className="flex justify-between gap-4 border-b border-white/5 pb-2"
          >
            <dt className="text-[#636366]">{row.k}</dt>
            <dd className="text-white text-right break-all">{row.v}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer"
      >
        Kapat
      </button>
    </ModalShell>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [tamIsim, setTamIsim] = useState(user.tam_isim || '');
  const [whatsapp, setWhatsapp] = useState(user.whatsapp_number || '');
  const [role, setRole] = useState<AppRole>(
    (ROLE_OPTIONS.includes(normalizeAppRole(user.role) as AppRole)
      ? normalizeAppRole(user.role)
      : 'danisman') as AppRole
  );
  const [unvan, setUnvan] = useState(user.unvan || '');
  const [profileDetails, setProfileDetails] = useState<ProfileDetailValues>(
    () => detailsFromUser(user)
  );
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    user.photoUrl ? `${user.photoUrl}?t=${Date.now()}` : null
  );
  const [cropFile, setCropFile] = useState<File | null>(null);
  const isLockedPilot =
    isKnownPilotPerson(tamIsim) || isKnownPilotPerson(user.tam_isim);

  useEffect(() => {
    if (isLockedPilot && role !== 'pilot') setRole('pilot');
  }, [isLockedPilot, role]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        tam_isim: tamIsim,
        role: isLockedPilot ? 'pilot' : role,
        unvan: unvan.trim() || null,
        ...profileDetails,
      };
      const currentWa = normalizeWhatsappPassword(user.whatsapp_number || '');
      const nextWa = normalizeWhatsappPassword(whatsapp);
      if (whatsapp.trim() && nextWa !== currentWa) {
        body.whatsapp_number = whatsapp;
      }

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Güncellenemedi');
      setSuccess('Kaydedildi');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const onPhotoCropped = async (blob: Blob) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append(
        'photo',
        new File([blob], 'consultant.png', { type: 'image/png' })
      );
      const res = await fetch(`/api/admin/users/${user.id}/photo`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Fotoğraf yüklenemedi');
      setPhotoPreview(data.photoUrl || null);
      setSuccess('Fotoğraf güncellendi');
      setCropFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <ModalShell title="Kullanıcıyı düzenle" onClose={onClose} wide>
        <form onSubmit={onSave} className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#1C1C1E] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Users className="w-5 h-5 text-[#636366]" />
              )}
            </div>
            <div className="space-y-1">
              <label className="h-10 px-4 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white hover:border-white/25 inline-flex items-center gap-2 cursor-pointer">
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Fotoğraf seç ve hizala
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f) setCropFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          <label className="block space-y-2">
            <span className={labelClass}>Tam isim</span>
            <input
              value={tamIsim}
              onChange={(e) => setTamIsim(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          <label className="block space-y-2">
            <span className={labelClass}>
              Telefon numarası / şifre (değiştirmek için yeni numara yaz)
            </span>
            <div className="relative">
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="off"
                className={`${inputClass} pr-12 tabular-nums`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 text-[#86868B] hover:text-white inline-flex items-center justify-center cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-2">
              <span className={labelClass}>Rol</span>
              <select
                value={isLockedPilot ? 'pilot' : role}
                onChange={(e) => setRole(e.target.value as AppRole)}
                disabled={isLockedPilot}
                className={inputClass}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              {isLockedPilot ? (
                <span className="text-[11px] text-[#86868B]">
                  Fatima ve Selim sabit pilotlardır; rol değiştirilemez.
                </span>
              ) : null}
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>Unvan</span>
              <input
                value={unvan}
                onChange={(e) => setUnvan(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <ProfileDetailsFields
            values={profileDetails}
            onChange={(key, value) =>
              setProfileDetails((current) => ({ ...current, [key]: value }))
            }
          />

          {error ? (
            <p className="text-[13px] text-[#FF3B30]">{error}</p>
          ) : null}
          {success ? (
            <p className="text-[13px] text-emerald-300">{success}</p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Kaydet
            </button>
          </div>
        </form>
      </ModalShell>

      {cropFile ? (
        <PhotoCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={onPhotoCropped}
        />
      ) : null}
    </>
  );
}

function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [confirmName, setConfirmName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    const expected = String(user.tam_isim || '')
      .trim()
      .toLocaleLowerCase('tr-TR');
    if (confirmName.trim().toLocaleLowerCase('tr-TR') !== expected) {
      setError('Onay için kullanıcının tam adını yazın');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Silinemedi');
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Kullanıcıyı sil" onClose={onClose}>
      <form onSubmit={onDelete} className="space-y-5">
        <div className="rounded-xl border border-[#FF3B30]/20 bg-[#FF3B30]/5 px-4 py-3 space-y-3">
          <p className="text-[13px] text-[#FFABA5] leading-relaxed">
            Auth hesabı, profil ve stüdyo fotoğrafı kalıcı silinir.
            <br />
            Silinecek:{' '}
            <span className="text-white font-medium">
              {toTitleCaseName(user.tam_isim)}
            </span>{' '}
            ({roleLabel(normalizeAppRole(user.role))})
          </p>
          <label className="block space-y-2">
            <span className={labelClass}>
              Onay için tam adı yazın: {user.tam_isim}
            </span>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className={inputClass}
              placeholder={user.tam_isim}
              required
            />
          </label>
        </div>

        {error ? (
          <p className="text-[13px] text-[#FF3B30]">{error}</p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-11 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white cursor-pointer disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 rounded-full bg-[#FF3B30] text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Kalıcı sil
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function UserAddForm({ onCreated }: { onCreated: () => void }) {
  const [tamIsim, setTamIsim] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [role, setRole] = useState<AppRole>('danisman');
  const [unvan, setUnvan] = useState('Gayrimenkul Danışmanı');
  const [profileDetails, setProfileDetails] = useState<ProfileDetailValues>(
    () => emptyProfileDetails()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    loginName: string;
    loginPasswordHint: string;
    role: string;
    photoUploaded?: boolean;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photoBlob) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoBlob);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoBlob]);

  const previewPassword = useMemo(
    () => normalizeWhatsappPassword(whatsapp) || '—',
    [whatsapp]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tam_isim: tamIsim,
          whatsapp_number: whatsapp,
          role: isKnownPilotPerson(tamIsim) ? 'pilot' : role,
          unvan: unvan.trim() || undefined,
          ...profileDetails,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Kullanıcı oluşturulamadı');

      let photoUploaded = false;
      if (photoBlob && data.userId) {
        const form = new FormData();
        form.append(
          'photo',
          new File([photoBlob], 'consultant.png', { type: 'image/png' })
        );
        const photoRes = await fetch(`/api/admin/users/${data.userId}/photo`, {
          method: 'POST',
          body: form,
        });
        const photoData = await photoRes.json();
        if (!photoRes.ok) {
          throw new Error(
            photoData?.error ||
              'Kullanıcı oluştu ama fotoğraf yüklenemedi — Düzenle’den tekrar deneyin'
          );
        }
        photoUploaded = true;
      }

      setCreated({
        loginName: data.loginName,
        loginPasswordHint: data.loginPasswordHint,
        role: data.role,
        photoUploaded,
      });
      setTamIsim('');
      setWhatsapp('');
      setRole('danisman');
      setUnvan('Gayrimenkul Danışmanı');
      setProfileDetails(emptyProfileDetails());
      setPhotoBlob(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-enter w-full">
      <ModeHeader
        eyebrow="Kullanıcı Yönetimi"
        title="Kullanıcı Ekle"
        description="Auth hesabı, profil ve isteğe bağlı stüdyo fotoğrafı aynı anda oluşur."
      />

      {created ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[14px] font-medium">Kullanıcı oluşturuldu</span>
          </div>
          <p className="text-[13px] text-[#AEAEB2]">
            Giriş ismi: <span className="text-white">{created.loginName}</span>
          </p>
          <p className="text-[13px] text-[#AEAEB2]">
            Şifre (telefon numarası):{' '}
            <span className="text-white tabular-nums">
              {created.loginPasswordHint}
            </span>
          </p>
          <p className="text-[13px] text-[#AEAEB2]">
            Rol: <span className="text-white">{roleLabel(created.role)}</span>
          </p>
          {created.photoUploaded ? (
            <p className="text-[13px] text-[#AEAEB2]">Fotoğraf yüklendi</p>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-white/5 bg-[#141414]/95 p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#1C1C1E] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Users className="w-5 h-5 text-[#636366]" />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <label className="h-10 px-4 rounded-full border border-white/10 text-[13px] text-[#AEAEB2] hover:text-white hover:border-white/25 inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              {photoBlob ? 'Fotoğrafı değiştir' : 'Fotoğraf seç ve hizala'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f) setCropFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            {photoBlob ? (
              <button
                type="button"
                onClick={() => setPhotoBlob(null)}
                className="text-[12px] text-[#86868B] hover:text-white cursor-pointer"
              >
                Fotoğrafı kaldır
              </button>
            ) : null}
          </div>
        </div>

        <label className="block space-y-2">
          <span className={labelClass}>Tam isim</span>
          <input
            value={tamIsim}
            onChange={(e) => setTamIsim(e.target.value)}
            placeholder="Örn. Ayşe Yılmaz"
            required
            className={inputClass}
          />
        </label>

        <label className="block space-y-2">
          <span className={labelClass}>Telefon numarası (giriş şifresi)</span>
          <div className="relative">
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="0532 765 07 88"
              required
              type={showPassword ? 'text' : 'password'}
              autoComplete="off"
              className={`${inputClass} pr-12 tabular-nums`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 text-[#86868B] hover:text-white inline-flex items-center justify-center cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-2">
            <span className={labelClass}>Rol</span>
            <select
              value={isKnownPilotPerson(tamIsim) ? 'pilot' : role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              disabled={isKnownPilotPerson(tamIsim)}
              className={inputClass}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            {isKnownPilotPerson(tamIsim) ? (
              <span className="text-[11px] text-[#86868B]">
                Fatima ve Selim sabit pilotlardır.
              </span>
            ) : null}
          </label>
          <label className="block space-y-2">
            <span className={labelClass}>Unvan</span>
            <input
              value={unvan}
              onChange={(e) => setUnvan(e.target.value)}
              placeholder="Gayrimenkul Danışmanı"
              className={inputClass}
            />
          </label>
        </div>

        <ProfileDetailsFields
          values={profileDetails}
          onChange={(key, value) =>
            setProfileDetails((current) => ({ ...current, [key]: value }))
          }
        />

        <div className="rounded-xl border border-white/5 bg-black/25 px-4 py-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-[#636366]">
            Giriş şifresi önizleme
          </p>
          <p className="text-[13px] text-[#AEAEB2]">
            Telefon numarası:{' '}
            <span className="text-white font-medium tabular-nums">
              {previewPassword}
            </span>
          </p>
        </div>

        {error ? (
          <p className="text-[13px] text-[#FF3B30] leading-relaxed">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-full bg-white text-black text-[14px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:bg-neutral-100 active:scale-[0.99] transition-all"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          Kullanıcıyı oluştur
        </button>
      </form>

      {cropFile ? (
        <PhotoCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={async (blob) => {
            setPhotoBlob(blob);
            setCropFile(null);
          }}
        />
      ) : null}
    </div>
  );
}
