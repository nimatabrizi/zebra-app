/**
 * Çekim randevusu — location-first, 3 aşamalı onay.
 * DB: public.appointments, ENUM public.appointment_status
 *
 * Akış:
 *   1) Talep   → pilot_bekleniyor        (danışman: il/ilçe/semt/not + pilot; tarih/saat yok)
 *   2) Teklif  → danisman_onayi_bekliyor (pilot: tarih + saat_blok)
 *   3) Kesin   → kesinlesti              (danışman onayı)
 *   İptal/red  → iptal
 */

export type AppointmentStatus =
  | 'pilot_bekleniyor'
  | 'danisman_onayi_bekliyor'
  | 'kesinlesti'
  | 'iptal';

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'pilot_bekleniyor',
  'danisman_onayi_bekliyor',
  'kesinlesti',
  'iptal',
] as const;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pilot_bekleniyor: 'Pilot Bekliyor',
  danisman_onayi_bekliyor: 'Onay Bekliyor',
  kesinlesti: 'Kesinleşti',
  iptal: 'İptal',
};

/** Supabase `appointments` satırı (snake_case) */
export type AppointmentRow = {
  id: string;
  created_by?: string | null;
  created_by_role?: string | null;
  owner_role?: 'selim' | 'fatima' | string | null;
  danisman_ismi: string;
  /** Pilot görünen adı (geri uyumluluk) */
  pilot?: string | null;
  /** Atanan pilot — profiles.id (UUID) */
  pilot_id: string;
  /** Aşama 1'de null; aşama 2'de pilot doldurur */
  tarih?: string | null;
  /** Aşama 1'de null; aşama 2'de pilot doldurur */
  saat_blok?: string | null;
  il: string;
  ilce: string;
  semt?: string | null;
  konum?: string | null;
  /** Portföy bilgileri (danışman talep formu — zorunlu) */
  portfoy_turu?: string | null;
  aciklama?: string | null;
  danisman_notu?: string | null;
  status: AppointmentStatus;
  source?: 'app' | 'phone' | 'in_person' | 'other' | string | null;
  is_manual?: boolean | null;
  reddedilme_sebebi?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** UI katmanı (camelCase) */
export type Appointment = {
  id: string;
  danismanIsmi: string;
  tarih?: string | null;
  saatBlok?: string | null;
  il: string;
  ilce: string;
  semt?: string | null;
  konum?: string | null;
  portfoyTuru?: string | null;
  aciklama?: string | null;
  danismanNotu?: string | null;
  pilot?: string | null;
  pilotId: string;
  ownerRole?: string | null;
  owner?: string | null;
  status: AppointmentStatus;
  reddedilmeSebebi?: string | null;
  isManual?: boolean;
  createdByRole?: string | null;
  createdBy?: string | null;
};

/** Aşama 1 — danışman talep oluşturur (tarih/saat YOK) */
export type CreateAppointmentRequest = {
  il: string;
  ilce: string;
  semt?: string | null;
  pilot_id: string;
  danisman_notu?: string | null;
  konum?: string | null;
  /** Portföy bilgileri — zorunlu */
  portfoy_turu: string;
  aciklama?: string | null;
  /** Her zaman pilot_bekleniyor */
  status?: Extract<AppointmentStatus, 'pilot_bekleniyor'>;
};

/** Aşama 2 — pilot tarih/saat teklif eder */
export type PilotOfferUpdate = {
  tarih: string;
  saat_blok: string;
  status: Extract<AppointmentStatus, 'danisman_onayi_bekliyor'>;
};

/** Aşama 3 — danışman teklifi kesinleştirir */
export type DanismanConfirmUpdate = {
  status: Extract<AppointmentStatus, 'kesinlesti'>;
};

/** İptal / red */
export type CancelAppointmentUpdate = {
  status: Extract<AppointmentStatus, 'iptal'>;
  reddedilme_sebebi?: string | null;
};

/** Soruştur — bölgedeki kesinleşmiş randevular */
export type RegionInquiryFilter = {
  il: string;
  ilce: string;
  semt?: string | null;
  status: Extract<AppointmentStatus, 'kesinlesti'>;
};
