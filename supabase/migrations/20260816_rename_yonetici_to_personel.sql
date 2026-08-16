-- app_role: yonetici → personel (görünen ad ve kanonik değer)
-- Geçmiş migration'lardaki yonetici referansları bu rename sonrası personel olur.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'yonetici'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'personel'
  ) THEN
    ALTER TYPE public.app_role RENAME VALUE 'yonetici' TO 'personel';
  END IF;
END $$;

-- RLS: appointments_select — personel yalnızca kesinleşmişleri görür
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;

CREATE POLICY "appointments_select"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_role() = 'broker'::public.app_role
    OR (
      public.current_app_role() = 'pilot'::public.app_role
      AND (
        owner_role IN ('fatima', 'selim')
        OR status IN (
          'pilot_bekleniyor'::public.appointment_status,
          'danisman_onayi_bekliyor'::public.appointment_status,
          'kesinlesti'::public.appointment_status
        )
      )
    )
    OR (
      public.current_app_role() = 'personel'::public.app_role
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
