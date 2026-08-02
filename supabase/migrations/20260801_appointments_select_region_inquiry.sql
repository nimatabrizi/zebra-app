-- =============================================================================
-- Fix: Danışman SELECT — bölgesel Soruştur için tüm aktif talepler
-- Önceki policy yalnızca created_by = self VEYA kesinlesti görüyordu;
-- diğer danışmanların pilot_bekleniyor / danisman_onayi_bekliyor kayıtları
-- RLS yüzünden gizleniyordu.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "appointments_select" ON public.appointments;

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
        -- Kendi kayıtları (iptal arşivi dahil)
        created_by = auth.uid()
        -- Bölgesel çakışma kontrolü: tüm danışmanların aktif talepleri
        OR status IN (
          'pilot_bekleniyor'::public.appointment_status,
          'danisman_onayi_bekliyor'::public.appointment_status,
          'kesinlesti'::public.appointment_status
        )
      )
    )
  );

COMMIT;
