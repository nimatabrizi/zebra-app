-- =============================================================================
-- deal_closings — İşlem Kapatma kayıtları
-- Erişim: yalnızca Bektaş Önal ve Çiğdem Yurtman (profiles.tam_isim)
-- Tutarlar kuruş (integer); KDV hariç giriş, KDV/dahil türetilmiş.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deal_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_type text NOT NULL CHECK (deal_type IN ('sale', 'rent')),
  closed_at date NOT NULL,
  consultant_name text NOT NULL,
  address text,
  room_count text,
  area_sqm text,
  listing_no text,
  phone text,
  buyer_invoice_info text,
  seller_invoice_info text,
  buyer_fee_excl bigint,
  seller_fee_excl bigint,
  consultant_fee_excl bigint,
  total_excl bigint NOT NULL DEFAULT 0,
  total_vat bigint NOT NULL DEFAULT 0,
  total_incl bigint NOT NULL DEFAULT 0,
  royalty_excl bigint NOT NULL DEFAULT 0,
  royalty_vat bigint NOT NULL DEFAULT 0,
  royalty_incl bigint NOT NULL DEFAULT 0,
  net_excl bigint NOT NULL DEFAULT 0,
  net_vat bigint NOT NULL DEFAULT 0,
  net_incl bigint NOT NULL DEFAULT 0,
  consultant_share_percent integer NOT NULL DEFAULT 50
    CHECK (consultant_share_percent IN (40, 50, 60, 70)),
  consultant_share_excl bigint NOT NULL DEFAULT 0,
  consultant_share_vat bigint NOT NULL DEFAULT 0,
  consultant_share_incl bigint NOT NULL DEFAULT 0,
  office_share_excl bigint NOT NULL DEFAULT 0,
  office_share_vat bigint NOT NULL DEFAULT 0,
  office_share_incl bigint NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_closings_closed_at_idx
  ON public.deal_closings (closed_at DESC);

CREATE INDEX IF NOT EXISTS deal_closings_created_at_idx
  ON public.deal_closings (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_deal_closings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deal_closings_updated_at ON public.deal_closings;
CREATE TRIGGER deal_closings_updated_at
  BEFORE UPDATE ON public.deal_closings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_deal_closings_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_deal_closings()
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
        lower(trim(p.tam_isim)) IN (
          'bektaş önal',
          'bektas önal',
          'bektas onal',
          'bektaş onal',
          'çiğdem yurtman',
          'cigdem yurtman'
        )
        OR translate(
          lower(trim(p.tam_isim)),
          'çğıöşüâêîôû',
          'cgiosuaeiou'
        ) IN ('bektas onal', 'cigdem yurtman')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_deal_closings() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_closings TO authenticated;

ALTER TABLE public.deal_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_closings_select" ON public.deal_closings;
DROP POLICY IF EXISTS "deal_closings_insert" ON public.deal_closings;
DROP POLICY IF EXISTS "deal_closings_update" ON public.deal_closings;
DROP POLICY IF EXISTS "deal_closings_delete" ON public.deal_closings;

CREATE POLICY "deal_closings_select"
  ON public.deal_closings
  FOR SELECT
  TO authenticated
  USING (public.can_access_deal_closings());

CREATE POLICY "deal_closings_insert"
  ON public.deal_closings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_deal_closings());

CREATE POLICY "deal_closings_update"
  ON public.deal_closings
  FOR UPDATE
  TO authenticated
  USING (public.can_access_deal_closings())
  WITH CHECK (public.can_access_deal_closings());

CREATE POLICY "deal_closings_delete"
  ON public.deal_closings
  FOR DELETE
  TO authenticated
  USING (public.can_access_deal_closings());
