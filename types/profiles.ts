import type { AppRole } from '../lib/authIdentity';

/** public.profiles satırı */
export interface Profile {
  id: string;
  tam_isim: string;
  is_pilot: boolean;
  role: AppRole;
  whatsapp_number: string | null;
  unvan: string | null;
  takim_ekip: string | null;
  kulup_uyelikleri: string | null;
  dogum_gunu: string | null;
  beden: string | null;
  ise_giris_tarihi: string | null;
  blue_start: string | null;
  kartvizit: string | null;
  branda: string | null;
  giris_gorseli: string | null;
  yaka_karti: string | null;
  folkart_karti: string | null;
  cbx: string | null;
  cbx_kayit: string | null;
  ofis: string | null;
  sube: string | null;
}

export type ProfileInsert = {
  id: string;
  tam_isim: string;
  role: AppRole;
  is_pilot?: boolean;
  whatsapp_number?: string | null;
  unvan?: string | null;
  takim_ekip?: string | null;
  kulup_uyelikleri?: string | null;
  dogum_gunu?: string | null;
  beden?: string | null;
  ise_giris_tarihi?: string | null;
  blue_start?: string | null;
  kartvizit?: string | null;
  branda?: string | null;
  giris_gorseli?: string | null;
  yaka_karti?: string | null;
  folkart_karti?: string | null;
  cbx?: string | null;
  cbx_kayit?: string | null;
  ofis?: string | null;
  sube?: string | null;
};

export type ProfileUpdate = Partial<Omit<Profile, 'id'>>;

/** Supabase istemcilerinde kullanılabilecek minimum Database tanımı. */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
