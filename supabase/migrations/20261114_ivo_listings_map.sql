-- =============================================================================
-- IVO listings: harita koordinatları + feed etiketleri + snapshot / sync cursor
-- =============================================================================

ALTER TABLE public.ivo_listings
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS feeds text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ivo_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS ivo_listings_geo_idx
  ON public.ivo_listings (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS ivo_listings_feeds_gin
  ON public.ivo_listings USING gin (feeds);

-- Ofis meta, my-zone, competitor-fsbo grupları, market-heat vb.
CREATE TABLE IF NOT EXISTS public.ivo_snapshots (
  key text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ivo_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ivo_snapshots_select" ON public.ivo_snapshots;
CREATE POLICY "ivo_snapshots_select"
  ON public.ivo_snapshots FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.ivo_snapshots TO authenticated;

-- Büyük feed sayfalama (office-properties vb.)
CREATE TABLE IF NOT EXISTS public.ivo_sync_cursors (
  feed text PRIMARY KEY,
  next_offset integer NOT NULL DEFAULT 0,
  total_hint integer,
  last_fetched integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Service role yazar; authenticated okumaz (ops).
ALTER TABLE public.ivo_sync_cursors ENABLE ROW LEVEL SECURITY;
