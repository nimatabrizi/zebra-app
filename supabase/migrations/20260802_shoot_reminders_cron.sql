-- =============================================================================
-- Çekim hatırlatıcıları (kesinlesti) + bildirim meta alanları
-- Supabase SQL Editor'da çalıştırın.
--
-- Gereksinim: pg_cron (Supabase Pro / Dashboard → Database → Extensions)
--   CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
-- =============================================================================

BEGIN;

-- Bildirim yönlendirme / ilişki (opsiyonel kolonlar)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS appointment_id text;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link_tab text;

-- Hatırlatıcı dedup bayrakları
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_eve_sent boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_morning_sent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_appointments_kesinlesti_tarih
  ON public.appointments (tarih)
  WHERE status = 'kesinlesti'::public.appointment_status;

-- -----------------------------------------------------------------------------
-- Yardımcı: geçerli UUID mi?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_uuid(val text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- -----------------------------------------------------------------------------
-- Ana hatırlatıcı motoru (Europe/Istanbul)
-- Cron: her saat başı çalıştırın.
--   - Eve: çekim tarihinden 1 gün önce (herhangi bir saatte, bir kez)
--   - Sabah: çekim günü, saat >= 08:00 (bir kez)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_shoot_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ist timestamptz := timezone('Europe/Istanbul', now());
  today_ist date := (now_ist)::date;
  tomorrow_ist date := today_ist + 1;
  hour_ist int := EXTRACT(HOUR FROM now_ist)::int;
  eve_count int := 0;
  morning_count int := 0;
  rec record;
  pilot_uuid uuid;
  danisman_uuid uuid;
  date_label text;
BEGIN
  -- ========== 1 GÜN KALA ==========
  FOR rec IN
    SELECT a.*
    FROM public.appointments a
    WHERE a.status = 'kesinlesti'::public.appointment_status
      AND a.tarih IS NOT NULL
      AND a.tarih::date = tomorrow_ist
      AND COALESCE(a.reminder_eve_sent, false) = false
  LOOP
    pilot_uuid := NULL;
    danisman_uuid := NULL;
    date_label := to_char(rec.tarih::date, 'DD.MM.YYYY');

    IF public.is_uuid(rec.pilot_id::text) THEN
      SELECT p.id INTO pilot_uuid
      FROM public.profiles p
      WHERE p.id = rec.pilot_id::uuid
      LIMIT 1;
    END IF;

    IF pilot_uuid IS NULL AND rec.pilot IS NOT NULL THEN
      SELECT p.id INTO pilot_uuid
      FROM public.profiles p
      WHERE p.tam_isim = rec.pilot
      LIMIT 1;
    END IF;

    IF rec.created_by IS NOT NULL THEN
      danisman_uuid := rec.created_by;
    ELSIF rec.danisman_ismi IS NOT NULL THEN
      SELECT p.id INTO danisman_uuid
      FROM public.profiles p
      WHERE p.tam_isim = rec.danisman_ismi
      LIMIT 1;
    END IF;

    IF danisman_uuid IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, is_read, appointment_id, link_tab)
      VALUES (
        danisman_uuid,
        'Çekim Hatırlatması',
        format(
          'Yarın planlanmış bir çekiminiz bulunmaktadır (%s • %s • %s).',
          COALESCE(rec.ilce, rec.konum, 'Konum'),
          date_label,
          COALESCE(rec.saat_blok, '')
        ),
        false,
        rec.id::text,
        'takvim'
      );
    END IF;

    IF pilot_uuid IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, is_read, appointment_id, link_tab)
      VALUES (
        pilot_uuid,
        'Çekim Hatırlatması',
        format(
          'Yarın planlanmış bir çekiminiz bulunmaktadır (%s • %s • %s — %s).',
          COALESCE(rec.ilce, rec.konum, 'Konum'),
          date_label,
          COALESCE(rec.saat_blok, ''),
          COALESCE(rec.danisman_ismi, 'Danışman')
        ),
        false,
        rec.id::text,
        'takvim'
      );
    END IF;

    UPDATE public.appointments
    SET reminder_eve_sent = true
    WHERE id = rec.id;

    eve_count := eve_count + 1;
  END LOOP;

  -- ========== ÇEKİM SABAHI (08:00+) ==========
  IF hour_ist >= 8 THEN
    FOR rec IN
      SELECT a.*
      FROM public.appointments a
      WHERE a.status = 'kesinlesti'::public.appointment_status
        AND a.tarih IS NOT NULL
        AND a.tarih::date = today_ist
        AND COALESCE(a.reminder_morning_sent, false) = false
    LOOP
      pilot_uuid := NULL;
      danisman_uuid := NULL;
      date_label := to_char(rec.tarih::date, 'DD.MM.YYYY');

      IF public.is_uuid(rec.pilot_id::text) THEN
        SELECT p.id INTO pilot_uuid
        FROM public.profiles p
        WHERE p.id = rec.pilot_id::uuid
        LIMIT 1;
      END IF;

      IF pilot_uuid IS NULL AND rec.pilot IS NOT NULL THEN
        SELECT p.id INTO pilot_uuid
        FROM public.profiles p
        WHERE p.tam_isim = rec.pilot
        LIMIT 1;
      END IF;

      IF rec.created_by IS NOT NULL THEN
        danisman_uuid := rec.created_by;
      ELSIF rec.danisman_ismi IS NOT NULL THEN
        SELECT p.id INTO danisman_uuid
        FROM public.profiles p
        WHERE p.tam_isim = rec.danisman_ismi
        LIMIT 1;
      END IF;

      IF danisman_uuid IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, is_read, appointment_id, link_tab)
        VALUES (
          danisman_uuid,
          'Bugün Çekim Gününüz',
          format(
            'Bugün çekim gününüz! Hazırlıklarınızı tamamlamayı unutmayın. (%s • %s)',
            COALESCE(rec.ilce, rec.konum, 'Konum'),
            COALESCE(rec.saat_blok, date_label)
          ),
          false,
          rec.id::text,
          'takvim'
        );
      END IF;

      IF pilot_uuid IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, is_read, appointment_id, link_tab)
        VALUES (
          pilot_uuid,
          'Bugün Çekim Gününüz',
          format(
            'Bugün çekim gününüz! Hazırlıklarınızı tamamlamayı unutmayın. (%s • %s — %s)',
            COALESCE(rec.ilce, rec.konum, 'Konum'),
            COALESCE(rec.saat_blok, date_label),
            COALESCE(rec.danisman_ismi, 'Danışman')
          ),
          false,
          rec.id::text,
          'takvim'
        );
      END IF;

      UPDATE public.appointments
      SET reminder_morning_sent = true
      WHERE id = rec.id;

      morning_count := morning_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'today', today_ist,
    'hour_ist', hour_ist,
    'eve_sent', eve_count,
    'morning_sent', morning_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_shoot_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_shoot_reminders() TO postgres;
GRANT EXECUTE ON FUNCTION public.send_shoot_reminders() TO service_role;

COMMIT;

-- =============================================================================
-- Cron planı (ayrı çalıştırın — extension açık olmalı)
-- =============================================================================
-- SELECT cron.schedule(
--   'zebra-shoot-reminders',
--   '5 * * * *',  -- her saat :05 (İstanbul saati için cron timezone ayarını kontrol edin)
--   $$SELECT public.send_shoot_reminders();$$
-- );
--
-- Manuel test:
--   SELECT public.send_shoot_reminders();
--
-- Job listesi:
--   SELECT * FROM cron.job;
-- =============================================================================
