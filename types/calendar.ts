/**
 * Global Calendar — event shape aligned with future Supabase / Randevu Sistemi fetch.
 */

export type CalendarEventKind = 'randevu' | 'note';

/** Visual / filter status for day dots and badges */
export type CalendarEventStatus = 'pending' | 'confirmed' | 'cancelled' | 'note';

export type CalendarEvent = {
  id: string;
  title: string;
  /** Display date DD.MM.YYYY (same as appointments.tarih) */
  date: string;
  type: CalendarEventKind;
  status: CalendarEventStatus;
  time?: string | null;
  subtitle?: string | null;
  /** Source appointment id when type === 'randevu' */
  sourceId?: string | null;
  /** Free-form body (notes) */
  body?: string | null;
  /** Diğer danışman çekimi — gün kutusunda nokta üretmez, yalnızca bilgi */
  isTeamInfo?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CalendarDayMarkers = {
  hasPending: boolean;
  hasConfirmed: boolean;
  hasCancelled: boolean;
  hasNote: boolean;
};
