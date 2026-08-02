-- =============================================================================
-- Supabase Realtime: notifications + appointments
-- SQL Editor'da bir kez çalıştırın (hata "already member" ise yok sayın).
-- =============================================================================

BEGIN;

-- Realtime için tabloları publication'a ekle
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      RAISE NOTICE 'supabase_realtime publication bulunamadı';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      RAISE NOTICE 'supabase_realtime publication bulunamadı';
  END;
END $$;

-- UPDATE/DELETE payload'larında satırın tamamı gelsin (filtre & merge için)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

COMMIT;
