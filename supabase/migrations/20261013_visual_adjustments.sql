-- =============================================================================
-- visual_adjustments — Zebra Studio görsellerinde kayıtlı konum / boyut ayarları
-- studio: 'dogum-gunu' | 'yil-donumu' | 'giris' | 'siralama' | 'yaka-karti' | 'toplu'
-- item_key: danışman foto slug'ı (Toplu Üretim'de format adı)
-- Okuma: tüm oturum açmış kullanıcılar. Yazma: personel + Nima Tabrizi.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.visual_adjustments (
  studio text NOT NULL,
  item_key text NOT NULL,
  adjust jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio, item_key)
);

CREATE OR REPLACE FUNCTION public.can_edit_visual_adjustments()
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
        p.role::text IN ('personel', 'yonetici')
        OR lower(trim(p.tam_isim)) = 'nima tabrizi'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_visual_adjustments() TO authenticated;

ALTER TABLE public.visual_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visual_adjustments_select" ON public.visual_adjustments;
DROP POLICY IF EXISTS "visual_adjustments_insert" ON public.visual_adjustments;
DROP POLICY IF EXISTS "visual_adjustments_update" ON public.visual_adjustments;
DROP POLICY IF EXISTS "visual_adjustments_delete" ON public.visual_adjustments;

CREATE POLICY "visual_adjustments_select"
  ON public.visual_adjustments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "visual_adjustments_insert"
  ON public.visual_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_visual_adjustments());

CREATE POLICY "visual_adjustments_update"
  ON public.visual_adjustments
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_visual_adjustments())
  WITH CHECK (public.can_edit_visual_adjustments());

CREATE POLICY "visual_adjustments_delete"
  ON public.visual_adjustments
  FOR DELETE
  TO authenticated
  USING (public.can_edit_visual_adjustments());
