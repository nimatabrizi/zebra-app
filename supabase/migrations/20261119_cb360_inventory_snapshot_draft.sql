-- =============================================================================
-- DRAFT ONLY — CB360 Rakip inventory snapshot tables (Staging review)
-- DO NOT apply to Production. Do not run without explicit Staging approval.
-- NOT marked applied/verified: PostgREST schema-cache drift was FAIL on last
-- read-only preflight (table presence ≠ schema match). Re-validate before apply.
-- People/office rows are PII-minimized JSON snapshots; no phone/email columns.
-- Snapshot JSON blobs live in private bucket cb360-private (object_path).
-- This migration does NOT publish current bundles and does NOT touch
-- cb360_current_bundle / scan lease paths.
-- =============================================================================

-- Versioned inventory snapshots (opaque JSON bundle, contacts already stripped).
CREATE TABLE IF NOT EXISTS public.cb360_inventory_snapshots (
  id text PRIMARY KEY,
  schema_version text NOT NULL CHECK (schema_version = 'rakip-inventory-snapshot-v1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id text REFERENCES public.cb360_inventory_snapshots (id),
  source_captured_at text,
  last_observed_at text,
  last_research_at text,
  office_count integer NOT NULL CHECK (office_count >= 0),
  person_count integer NOT NULL CHECK (person_count >= 0),
  research_target_brand_count integer NOT NULL DEFAULT 0,
  archive_only_brand_count integer NOT NULL DEFAULT 0,
  -- Baseline / research inventory must never be marked "current publish".
  labeled_as_current boolean NOT NULL DEFAULT false CHECK (labeled_as_current = false),
  object_path text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  bucket_id text NOT NULL DEFAULT 'cb360-private'
    CHECK (bucket_id = 'cb360-private'),
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  import_attestation text
);

CREATE INDEX IF NOT EXISTS cb360_inventory_snapshots_created_idx
  ON public.cb360_inventory_snapshots (created_at DESC);

-- Pointer to latest recorded snapshot for UI read path (not "current publish").
CREATE TABLE IF NOT EXISTS public.cb360_inventory_latest (
  id integer PRIMARY KEY CHECK (id = 1),
  snapshot_id text NOT NULL REFERENCES public.cb360_inventory_snapshots (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Review queue for unverified cloud event candidates (notifications out of scope).
CREATE TABLE IF NOT EXISTS public.cb360_inventory_review_items (
  id text PRIMARY KEY,
  snapshot_id text REFERENCES public.cb360_inventory_snapshots (id),
  research_run_id text,
  event_type text NOT NULL,
  person_key text,
  brand_slug text,
  office_key text,
  verification_status text NOT NULL,
  prior_record_available boolean NOT NULL DEFAULT false,
  notification_status text NOT NULL DEFAULT 'not_sent' CHECK (notification_status = 'not_sent'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cb360_inventory_review_snapshot_idx
  ON public.cb360_inventory_review_items (snapshot_id);

ALTER TABLE public.cb360_inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb360_inventory_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb360_inventory_review_items ENABLE ROW LEVEL SECURITY;

-- Tablo yetkileri: anon/authenticated yok; yalnız service_role (Zebra sunucu).
REVOKE ALL ON TABLE public.cb360_inventory_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.cb360_inventory_latest FROM PUBLIC;
REVOKE ALL ON TABLE public.cb360_inventory_review_items FROM PUBLIC;

REVOKE ALL ON TABLE public.cb360_inventory_snapshots FROM anon, authenticated;
REVOKE ALL ON TABLE public.cb360_inventory_latest FROM anon, authenticated;
REVOKE ALL ON TABLE public.cb360_inventory_review_items FROM anon, authenticated;

GRANT ALL ON TABLE public.cb360_inventory_snapshots TO service_role;
GRANT ALL ON TABLE public.cb360_inventory_latest TO service_role;
GRANT ALL ON TABLE public.cb360_inventory_review_items TO service_role;

-- Explicit deny policies (defense in depth; service_role bypasses RLS).
DROP POLICY IF EXISTS "cb360_inventory_snapshots_deny" ON public.cb360_inventory_snapshots;
DROP POLICY IF EXISTS "cb360_inventory_snapshots_anon_deny" ON public.cb360_inventory_snapshots;
DROP POLICY IF EXISTS "cb360_inventory_latest_deny" ON public.cb360_inventory_latest;
DROP POLICY IF EXISTS "cb360_inventory_latest_anon_deny" ON public.cb360_inventory_latest;
DROP POLICY IF EXISTS "cb360_inventory_review_deny" ON public.cb360_inventory_review_items;
DROP POLICY IF EXISTS "cb360_inventory_review_anon_deny" ON public.cb360_inventory_review_items;

CREATE POLICY "cb360_inventory_snapshots_deny"
  ON public.cb360_inventory_snapshots FOR ALL TO authenticated
  USING (false);
CREATE POLICY "cb360_inventory_snapshots_anon_deny"
  ON public.cb360_inventory_snapshots FOR ALL TO anon
  USING (false);

CREATE POLICY "cb360_inventory_latest_deny"
  ON public.cb360_inventory_latest FOR ALL TO authenticated
  USING (false);
CREATE POLICY "cb360_inventory_latest_anon_deny"
  ON public.cb360_inventory_latest FOR ALL TO anon
  USING (false);

CREATE POLICY "cb360_inventory_review_deny"
  ON public.cb360_inventory_review_items FOR ALL TO authenticated
  USING (false);
CREATE POLICY "cb360_inventory_review_anon_deny"
  ON public.cb360_inventory_review_items FOR ALL TO anon
  USING (false);

-- Fail-closed: no anon/authenticated GRANT or permissive policies in this draft.
