-- =============================================================================
-- Danışman UPDATE: yalnızca kendi + pilot_bekleniyor iken düzenleme;
-- kesinleştirme / iptal de açık kalsın.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "appointments_update" ON public.appointments;

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

COMMIT;
