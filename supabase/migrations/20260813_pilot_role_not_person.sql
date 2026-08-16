-- =============================================================================
-- App roles: Fatima / Selim kişi adıdır; login rolü `pilot`.
-- appointments.owner_role fatima/selim kişi anahtarı olarak KALIR (AppRole değil).
-- =============================================================================

BEGIN;

-- 1) Enum'a pilot ekle (owner_role için fatima/selim değerleri korunur)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'pilot'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'pilot';
  END IF;
END
$$;

COMMIT;

-- ADD VALUE sonrası aynı transaction'da kullanılamaz; ayrı BEGIN
BEGIN;

-- 2) Profilleri güncelle: fatima/selim → pilot
UPDATE public.profiles
SET
  role = 'pilot'::public.app_role,
  is_pilot = true
WHERE role::text IN ('fatima', 'selim');

-- 3) Giriş yapan pilotun takvim anahtarı (isimden)
CREATE OR REPLACE FUNCTION public.current_pilot_owner_key()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN upper(translate(coalesce(p.tam_isim, ''), 'İı', 'Ii')) LIKE '%FATIMA%'
      THEN 'fatima'::public.app_role
    WHEN upper(translate(coalesce(p.tam_isim, ''), 'İı', 'Ii')) LIKE '%SELIM%'
      THEN 'selim'::public.app_role
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

-- 4) Takvim sahibi: role=pilot (veya eski fatima/selim) ya da is_pilot
CREATE OR REPLACE FUNCTION public.is_calendar_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role::text IN ('pilot', 'fatima', 'selim')
        OR p.is_pilot IS TRUE
      )
  );
$$;

-- Insert yetkisi: danışman + broker + pilot
CREATE OR REPLACE FUNCTION public.can_insert_appointments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role::text IN ('broker', 'pilot', 'danisman', 'fatima', 'selim')
        OR p.is_pilot IS TRUE
      )
  );
$$;

-- 5) SELECT policy
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;

CREATE POLICY "appointments_select"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    public.is_broker()
    OR (
      public.is_calendar_owner()
      AND (
        owner_role = public.current_pilot_owner_key()
        OR pilot_id = auth.uid()
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

-- 6) UPDATE policy — ownership by pilot key / pilot_id, not login role
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;

CREATE POLICY "appointments_update"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    public.is_broker()
    OR (
      public.is_calendar_owner()
      AND (
        owner_role = public.current_pilot_owner_key()
        OR pilot_id = auth.uid()
      )
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
      AND (
        owner_role = public.current_pilot_owner_key()
        OR pilot_id = auth.uid()
      )
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

-- 7) DELETE policy
DROP POLICY IF EXISTS "appointments_delete" ON public.appointments;

CREATE POLICY "appointments_delete"
  ON public.appointments
  FOR DELETE
  TO authenticated
  USING (
    public.is_broker()
    OR (
      public.is_calendar_owner()
      AND (
        owner_role = public.current_pilot_owner_key()
        OR pilot_id = auth.uid()
      )
    )
  );

COMMIT;
