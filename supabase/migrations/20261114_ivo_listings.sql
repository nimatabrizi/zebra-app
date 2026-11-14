-- =============================================================================
-- IVO / İlanlar — Sahibinden canlı ilan önbelleği + kullanıcı takibi
-- IVO referansı: /search, /expertise/fsbo*, /takip/ilanlar, /properties/guncelle-oto
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ivo_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'sahibinden',
  listing_no text NOT NULL,
  url text NOT NULL,
  title text,
  price_tl bigint,
  price_m2 integer,
  area_m2 numeric,
  rooms text,
  city text,
  district text,
  neighborhood text,
  whom text,
  kind text,
  listing_type text,
  is_fsbo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_price_tl bigint,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, listing_no)
);

CREATE INDEX IF NOT EXISTS ivo_listings_last_seen_idx
  ON public.ivo_listings (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS ivo_listings_fsbo_idx
  ON public.ivo_listings (is_fsbo, last_seen_at DESC)
  WHERE is_fsbo = true;
CREATE INDEX IF NOT EXISTS ivo_listings_city_district_idx
  ON public.ivo_listings (city, district);

CREATE TABLE IF NOT EXISTS public.ivo_listing_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.ivo_listings (id) ON DELETE CASCADE,
  price_tl bigint NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ivo_listing_price_history_listing_idx
  ON public.ivo_listing_price_history (listing_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.ivo_listing_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.ivo_listings (id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS ivo_listing_tracks_user_idx
  ON public.ivo_listing_tracks (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_ivo_listings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ivo_listings_updated_at ON public.ivo_listings;
CREATE TRIGGER ivo_listings_updated_at
  BEFORE UPDATE ON public.ivo_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ivo_listings_updated_at();

ALTER TABLE public.ivo_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivo_listing_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivo_listing_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ivo_listings_select" ON public.ivo_listings;
DROP POLICY IF EXISTS "ivo_listings_write" ON public.ivo_listings;
DROP POLICY IF EXISTS "ivo_price_history_select" ON public.ivo_listing_price_history;
DROP POLICY IF EXISTS "ivo_tracks_select" ON public.ivo_listing_tracks;
DROP POLICY IF EXISTS "ivo_tracks_insert" ON public.ivo_listing_tracks;
DROP POLICY IF EXISTS "ivo_tracks_delete" ON public.ivo_listing_tracks;

-- Oturum açmış herkes ilan önbelleğini okuyabilir; yazma service role / API üzerinden.
CREATE POLICY "ivo_listings_select"
  ON public.ivo_listings FOR SELECT TO authenticated USING (true);

CREATE POLICY "ivo_price_history_select"
  ON public.ivo_listing_price_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "ivo_tracks_select"
  ON public.ivo_listing_tracks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ivo_tracks_insert"
  ON public.ivo_listing_tracks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ivo_tracks_delete"
  ON public.ivo_listing_tracks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.ivo_listings TO authenticated;
GRANT SELECT ON public.ivo_listing_price_history TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ivo_listing_tracks TO authenticated;
