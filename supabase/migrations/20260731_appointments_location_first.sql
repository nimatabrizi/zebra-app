-- =============================================================================
-- appointments → location-first + 3 aşamalı onay
-- Tek seferlik, production-safe migration
--
-- Dünün dersleri:
--   1) status kolon tipi değiştirilmeden ÖNCE tüm RLS policy'ler düşürülür
--   2) Eski değerler ('Bekliyor' vb.) ASLA doğrudan yeni ENUM'a cast edilmez;
--      önce ::text, sonra CASE map, sonra yeni ENUM
--   3) ALTER COLUMN ... TYPE yerine kolon takası (status_new) kullanılır
--   4) Policy'ler yeni literal'larla + açık ::appointment_status cast ile kurulur
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) appointments üzerindeki TÜM RLS policy'lerini düşür
--    (status kolonuna bağımlı policy ALTER/DROP COLUMN'u engeller)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointments'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.appointments',
      r.policyname
    );
    RAISE NOTICE 'dropped policy: %', r.policyname;
  END LOOP;
END $$;

-- status ile ilgili CHECK constraint'leri temizle
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.appointments'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
    RAISE NOTICE 'dropped constraint: %', r.conname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Yeni location / not sütunları
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS il text,
  ADD COLUMN IF NOT EXISTS ilce text,
  ADD COLUMN IF NOT EXISTS semt text,
  ADD COLUMN IF NOT EXISTS pilot_id text,
  ADD COLUMN IF NOT EXISTS danisman_notu text;

-- Mevcut satırlar: NOT NULL öncesi güvenli backfill
UPDATE public.appointments a
SET
  il = COALESCE(NULLIF(TRIM(a.il), ''), 'İzmir'),
  ilce = COALESCE(NULLIF(TRIM(a.ilce), ''), 'Belirsiz'),
  pilot_id = COALESCE(
    NULLIF(TRIM(a.pilot_id), ''),
    (
      SELECT p.id::text
      FROM public.profiles p
      WHERE p.role::text = a.owner_role::text
      LIMIT 1
    ),
    CASE
      WHEN a.owner_role::text = 'fatima' THEN 'fatima'
      WHEN a.owner_role::text = 'selim' THEN 'selim'
      ELSE 'unknown'
    END
  );

ALTER TABLE public.appointments
  ALTER COLUMN il SET NOT NULL,
  ALTER COLUMN ilce SET NOT NULL,
  ALTER COLUMN pilot_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) tarih / saat_blok opsiyonel (talep aşamasında boş kalır)
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments
  ALTER COLUMN tarih DROP NOT NULL;

ALTER TABLE public.appointments
  ALTER COLUMN saat_blok DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) status: ENUM → text map → yeni ENUM  (kolon takası; ALTER TYPE YOK)
-- -----------------------------------------------------------------------------

-- 3a) Geçici text kolon
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS status_new text;

-- 3b) Eski → yeni mapping (HER ZAMAN ::text üzerinden)
UPDATE public.appointments
SET status_new = CASE
  WHEN status::text IN (
    'pending', 'Bekliyor', 'bekliyor', 'pilot_bekleniyor'
  ) THEN 'pilot_bekleniyor'
  WHEN status::text IN (
    'confirmed', 'Onaylandı', 'onaylandı', 'approved', 'kesinlesti'
  ) THEN 'kesinlesti'
  WHEN status::text IN (
    'rejected', 'Reddedildi', 'reddedildi', 'iptal'
  ) THEN 'iptal'
  WHEN status::text = 'danisman_onayi_bekliyor' THEN 'danisman_onayi_bekliyor'
  ELSE 'pilot_bekleniyor'
END;

-- 3c) Eski status kolonunu kaldır (policy'ler zaten yok)
ALTER TABLE public.appointments
  DROP COLUMN status;

-- 3d) Eski ENUM tipini kaldır (artık hiçbir kolon kullanmıyor)
DROP TYPE IF EXISTS public.appointment_status;

-- 3e) Yeni ENUM
CREATE TYPE public.appointment_status AS ENUM (
  'pilot_bekleniyor',
  'danisman_onayi_bekliyor',
  'kesinlesti',
  'iptal'
);

-- 3f) text → yeni ENUM (değerler zaten geçerli literal)
ALTER TABLE public.appointments
  ALTER COLUMN status_new TYPE public.appointment_status
  USING status_new::public.appointment_status;

ALTER TABLE public.appointments
  RENAME COLUMN status_new TO status;

ALTER TABLE public.appointments
  ALTER COLUMN status SET DEFAULT 'pilot_bekleniyor'::public.appointment_status;

ALTER TABLE public.appointments
  ALTER COLUMN status SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) Index'ler (Soruştur / pilot ilçe gruplama)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_pilot_id
  ON public.appointments (pilot_id);

CREATE INDEX IF NOT EXISTS idx_appointments_il_ilce
  ON public.appointments (il, ilce);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON public.appointments (status);

CREATE INDEX IF NOT EXISTS idx_appointments_ilce_status
  ON public.appointments (ilce, status);

-- -----------------------------------------------------------------------------
-- 5) RLS'i açık tut + policy'leri YENİ status literal'larıyla kur
--    Açık cast: '…'::public.appointment_status  (text/enum karışması olmasın)
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- SELECT
--   broker            → hepsi
--   selim / fatima    → kendi owner_role + tüm aktif (ilçe planlama)
--   yonetici          → yalnızca kesinlesti
--   danisman          → kendi talepleri + tüm aktif (bölgesel Soruştur)
CREATE POLICY "appointments_select"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    public.is_broker()
    OR (
      public.current_app_role() IN (
        'selim'::public.app_role,
        'fatima'::public.app_role
      )
      AND (
        owner_role = public.current_app_role()
        OR status IN (
          'pilot_bekleniyor'::public.appointment_status,
          'danisman_onayi_bekliyor'::public.appointment_status,
          'kesinlesti'::public.appointment_status
        )
      )
    )
    OR (
      public.current_app_role() = 'yonetici'::public.app_role
      AND status = 'kesinlesti'::public.appointment_status
    )
    OR (
      public.current_app_role() = 'danisman'::public.app_role
      AND (
        created_by = auth.uid()
        OR status IN (
          'pilot_bekleniyor'::public.appointment_status,
          'danisman_onayi_bekliyor'::public.appointment_status,
          'kesinlesti'::public.appointment_status
        )
      )
    )
  );

-- INSERT
--   app   → danışman talebi: pilot_bekleniyor (veya ileride diğer aşamalar)
--   phone / in_person / other → manuel kesin kayıt: kesinlesti
CREATE POLICY "appointments_insert"
  ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_insert_appointments()
    AND created_by = auth.uid()
    AND owner_role IN (
      'selim'::public.app_role,
      'fatima'::public.app_role
    )
    AND (
      (
        source IN ('phone', 'in_person', 'other')
        AND status = 'kesinlesti'::public.appointment_status
      )
      OR (
        source = 'app'
        AND status IN (
          'pilot_bekleniyor'::public.appointment_status,
          'danisman_onayi_bekliyor'::public.appointment_status,
          'kesinlesti'::public.appointment_status
        )
      )
    )
  );

-- UPDATE
--   broker → herkes
--   pilot (calendar owner) → kendi owner_role
--   danisman → kendi + pilot_bekleniyor (düzenleme) / teklif kesinleştirme / iptal
CREATE POLICY "appointments_update"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    public.is_broker()
    OR (
      public.is_calendar_owner()
      AND owner_role = public.current_app_role()
    )
    OR (
      public.current_app_role() = 'danisman'::public.app_role
      AND created_by = auth.uid()
      AND status IN (
        'pilot_bekleniyor'::public.appointment_status,
        'danisman_onayi_bekliyor'::public.appointment_status
      )
    )
  )
  WITH CHECK (
    public.is_broker()
    OR (
      public.is_calendar_owner()
      AND owner_role = public.current_app_role()
    )
    OR (
      public.current_app_role() = 'danisman'::public.app_role
      AND created_by = auth.uid()
      AND status IN (
        'pilot_bekleniyor'::public.appointment_status,
        'danisman_onayi_bekliyor'::public.appointment_status,
        'kesinlesti'::public.appointment_status,
        'iptal'::public.appointment_status
      )
    )
  );

-- DELETE
CREATE POLICY "appointments_delete"
  ON public.appointments
  FOR DELETE
  TO authenticated
  USING (
    public.is_broker()
    OR (
      public.is_calendar_owner()
      AND owner_role = public.current_app_role()
    )
  );

COMMIT;

-- =============================================================================
-- Doğrulama (COMMIT sonrası — isteğe bağlı, ayrı çalıştırılabilir)
-- =============================================================================
-- SELECT status::text, count(*) FROM public.appointments GROUP BY 1 ORDER BY 1;
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'appointments'
--   AND column_name IN ('status','il','ilce','semt','pilot_id','danisman_notu','tarih','saat_blok')
-- ORDER BY 1;
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'appointments'
-- ORDER BY 1;
