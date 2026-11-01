-- =============================================================================
-- ranking_workbook — Sıralama Excel’inin sistem kaydı (tek güncel snapshot)
-- Okuma: tüm oturum açmış kullanıcılar. Yazma: personel + Nima Tabrizi
--   (visual_adjustments ile aynı can_edit_visual_adjustments()).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ranking_workbook (
  id text PRIMARY KEY DEFAULT 'current',
  file_name text NOT NULL DEFAULT '',
  parsed jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ranking_workbook_single_row CHECK (id = 'current')
);

ALTER TABLE public.ranking_workbook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_workbook_select" ON public.ranking_workbook;
DROP POLICY IF EXISTS "ranking_workbook_insert" ON public.ranking_workbook;
DROP POLICY IF EXISTS "ranking_workbook_update" ON public.ranking_workbook;
DROP POLICY IF EXISTS "ranking_workbook_delete" ON public.ranking_workbook;

CREATE POLICY "ranking_workbook_select"
  ON public.ranking_workbook
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ranking_workbook_insert"
  ON public.ranking_workbook
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_visual_adjustments());

CREATE POLICY "ranking_workbook_update"
  ON public.ranking_workbook
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_visual_adjustments())
  WITH CHECK (public.can_edit_visual_adjustments());

CREATE POLICY "ranking_workbook_delete"
  ON public.ranking_workbook
  FOR DELETE
  TO authenticated
  USING (public.can_edit_visual_adjustments());
