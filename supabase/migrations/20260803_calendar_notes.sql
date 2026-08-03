-- =============================================================================
-- calendar_notes — Takvim kişisel notları (Supabase)
-- SQL ile sıfırlanabilir; RLS: kullanıcı yalnızca kendi notlarını görür/yazar
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  /** DD.MM.YYYY — appointments.tarih ile aynı format */
  tarih text NOT NULL,
  title text NOT NULL DEFAULT 'Not',
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_user_id
  ON public.calendar_notes (user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_user_tarih
  ON public.calendar_notes (user_id, tarih);

ALTER TABLE public.calendar_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_notes_select" ON public.calendar_notes;
DROP POLICY IF EXISTS "calendar_notes_insert" ON public.calendar_notes;
DROP POLICY IF EXISTS "calendar_notes_update" ON public.calendar_notes;
DROP POLICY IF EXISTS "calendar_notes_delete" ON public.calendar_notes;

CREATE POLICY "calendar_notes_select"
  ON public.calendar_notes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "calendar_notes_insert"
  ON public.calendar_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "calendar_notes_update"
  ON public.calendar_notes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "calendar_notes_delete"
  ON public.calendar_notes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Realtime (opsiyonel — panel anlık güncelleme)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_notes;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.calendar_notes REPLICA IDENTITY FULL;
