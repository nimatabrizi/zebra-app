-- =============================================================================
-- CB360 competitor monitoring — faz 1 metadata + private storage bucket
-- Uygulama: henüz production'da çalıştırma; review sonrası manuel apply.
-- People/offices migration YOK. Yalnız run/version/bundle metadata.
-- =============================================================================

-- Storage bucket (private). Supabase storage şeması yoksa bu blok atlanabilir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('cb360-private', 'cb360-private', false, 104857600)
    ON CONFLICT (id) DO UPDATE
      SET public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit;
  END IF;
END $$;

-- Storage object policies: yalnız cb360-private bucket; diğer bucket'lara dokunmaz.
-- anon + authenticated explicit deny; service_role storage RLS bypass.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    DROP POLICY IF EXISTS "cb360_private_no_select" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_no_insert" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_no_update" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_no_delete" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_anon_no_select" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_anon_no_insert" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_anon_no_update" ON storage.objects;
    DROP POLICY IF EXISTS "cb360_private_anon_no_delete" ON storage.objects;

    CREATE POLICY "cb360_private_no_select"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_no_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_no_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_no_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_anon_no_select"
      ON storage.objects FOR SELECT TO anon
      USING (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_anon_no_insert"
      ON storage.objects FOR INSERT TO anon
      WITH CHECK (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_anon_no_update"
      ON storage.objects FOR UPDATE TO anon
      USING (bucket_id = 'cb360-private' AND false);

    CREATE POLICY "cb360_private_anon_no_delete"
      ON storage.objects FOR DELETE TO anon
      USING (bucket_id = 'cb360-private' AND false);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cb360_source_versions (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('baseline', 'snapshot', 'backup', 'state')),
  artifact text NOT NULL CHECK (
    artifact IN ('source_xlsx', 'identity_maps', 'user_decisions', 'manifest')
  ),
  object_path text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  bundle_id text NOT NULL,
  created_by_run_id text,
  immutable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cb360_source_versions_bundle_idx
  ON public.cb360_source_versions (bundle_id);

CREATE TABLE IF NOT EXISTS public.cb360_scan_runs (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (
    status IN (
      'started',
      'running',
      'uploading',
      'verifying',
      'completed',
      'partial',
      'failed',
      'rejected_integrity',
      'rejected_policy',
      'aborted_lease',
      'aborted'
    )
  ),
  mode text NOT NULL CHECK (mode IN ('synthetic', 'production')),
  config_version text,
  planned_brand_count integer,
  brand_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand_ok integer,
  brand_failed integer,
  brand_skipped integer,
  requested_by text,
  lease_token_hash text NOT NULL,
  lease_generation integer NOT NULL DEFAULT 1,
  lease_expires_at timestamptz NOT NULL,
  base_version_id text REFERENCES public.cb360_source_versions (id),
  base_sha256 text,
  output_version_id text REFERENCES public.cb360_source_versions (id),
  output_sha256 text,
  output_object_path text,
  logical_bundle_id text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  became_current boolean NOT NULL DEFAULT false,
  client_sha256 text,
  server_sha256 text,
  byte_size bigint,
  error_code text,
  notes text,
  complete_payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS cb360_scan_runs_status_lease_idx
  ON public.cb360_scan_runs (status, lease_expires_at);

CREATE INDEX IF NOT EXISTS cb360_scan_runs_bundle_idx
  ON public.cb360_scan_runs (logical_bundle_id);

-- Tek satırlık fencing lock (volatile now() unique index yerine)
CREATE TABLE IF NOT EXISTS public.cb360_lease_lock (
  id integer PRIMARY KEY CHECK (id = 1),
  run_id text,
  lease_generation integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cb360_lease_lock (id, run_id, lease_generation, lease_expires_at)
VALUES (1, NULL, 0, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cb360_current_bundle (
  id integer PRIMARY KEY CHECK (id = 1),
  bundle_id text NOT NULL,
  source_version_id text NOT NULL REFERENCES public.cb360_source_versions (id),
  identity_maps_version_id text REFERENCES public.cb360_source_versions (id),
  user_decisions_version_id text REFERENCES public.cb360_source_versions (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_run_id text
);

CREATE OR REPLACE FUNCTION public.set_cb360_scan_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cb360_scan_runs_updated_at ON public.cb360_scan_runs;
CREATE TRIGGER cb360_scan_runs_updated_at
  BEFORE UPDATE ON public.cb360_scan_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cb360_scan_runs_updated_at();

ALTER TABLE public.cb360_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb360_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb360_current_bundle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb360_lease_lock ENABLE ROW LEVEL SECURITY;

-- Tablo yetkileri: anon/authenticated yok; yalnız service_role (Zebra sunucu).
-- Default privileges / PUBLIC grant'lerini kapatır; diğer Zebra tablolarına dokunmaz.
REVOKE ALL ON TABLE public.cb360_source_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.cb360_scan_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.cb360_current_bundle FROM PUBLIC;
REVOKE ALL ON TABLE public.cb360_lease_lock FROM PUBLIC;

REVOKE ALL ON TABLE public.cb360_source_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.cb360_scan_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.cb360_current_bundle FROM anon, authenticated;
REVOKE ALL ON TABLE public.cb360_lease_lock FROM anon, authenticated;

GRANT ALL ON TABLE public.cb360_source_versions TO service_role;
GRANT ALL ON TABLE public.cb360_scan_runs TO service_role;
GRANT ALL ON TABLE public.cb360_current_bundle TO service_role;
GRANT ALL ON TABLE public.cb360_lease_lock TO service_role;

-- Faz 1: authenticated + anon deny policies (RLS defense in depth).
-- service_role RLS bypass eder.
DROP POLICY IF EXISTS "cb360_versions_deny" ON public.cb360_source_versions;
DROP POLICY IF EXISTS "cb360_versions_anon_deny" ON public.cb360_source_versions;
DROP POLICY IF EXISTS "cb360_runs_deny" ON public.cb360_scan_runs;
DROP POLICY IF EXISTS "cb360_runs_anon_deny" ON public.cb360_scan_runs;
DROP POLICY IF EXISTS "cb360_current_deny" ON public.cb360_current_bundle;
DROP POLICY IF EXISTS "cb360_current_anon_deny" ON public.cb360_current_bundle;
DROP POLICY IF EXISTS "cb360_lease_deny" ON public.cb360_lease_lock;
DROP POLICY IF EXISTS "cb360_lease_anon_deny" ON public.cb360_lease_lock;

CREATE POLICY "cb360_versions_deny"
  ON public.cb360_source_versions FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "cb360_versions_anon_deny"
  ON public.cb360_source_versions FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "cb360_runs_deny"
  ON public.cb360_scan_runs FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "cb360_runs_anon_deny"
  ON public.cb360_scan_runs FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "cb360_current_deny"
  ON public.cb360_current_bundle FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "cb360_current_anon_deny"
  ON public.cb360_current_bundle FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "cb360_lease_deny"
  ON public.cb360_lease_lock FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "cb360_lease_anon_deny"
  ON public.cb360_lease_lock FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Atomik start: FOR UPDATE lease_lock + abort expired holder + insert run
-- Kısa transaction; Browser taraması boyunca kilit tutmaz.
CREATE OR REPLACE FUNCTION public.cb360_try_start_run(
  p_run_id text,
  p_lease_token_hash text,
  p_lease_expires_at timestamptz,
  p_mode text,
  p_config_version text,
  p_planned_brand_count integer,
  p_requested_by text,
  p_logical_bundle_id text,
  p_base_version_id text,
  p_base_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock public.cb360_lease_lock%ROWTYPE;
  v_gen integer;
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.cb360_lease_lock (id, run_id, lease_generation, lease_expires_at)
  VALUES (1, NULL, 0, NULL)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_lock FROM public.cb360_lease_lock WHERE id = 1 FOR UPDATE;

  IF v_lock.run_id IS NOT NULL
     AND v_lock.lease_expires_at IS NOT NULL
     AND v_lock.lease_expires_at > v_now THEN
    RAISE EXCEPTION 'cb360_active_run_exists:%', v_lock.run_id;
  END IF;

  -- Süresi dolmuş eski run'ı terminal yap (yeni run verisini değiştiremesin)
  IF v_lock.run_id IS NOT NULL THEN
    UPDATE public.cb360_scan_runs
    SET
      status = 'aborted_lease',
      error_code = 'lease_expired',
      finished_at = COALESCE(finished_at, v_now)
    WHERE id = v_lock.run_id
      AND status IN ('started', 'running', 'uploading', 'verifying');
  END IF;

  v_gen := v_lock.lease_generation + 1;

  UPDATE public.cb360_lease_lock
  SET
    run_id = p_run_id,
    lease_generation = v_gen,
    lease_expires_at = p_lease_expires_at,
    updated_at = v_now
  WHERE id = 1;

  INSERT INTO public.cb360_scan_runs (
    id, status, mode, config_version, planned_brand_count, brand_results,
    requested_by, lease_token_hash, lease_generation, lease_expires_at,
    base_version_id, base_sha256, logical_bundle_id,
    published, became_current, created_at, updated_at
  ) VALUES (
    p_run_id, 'started', p_mode, p_config_version, p_planned_brand_count, '[]'::jsonb,
    p_requested_by, p_lease_token_hash, v_gen, p_lease_expires_at,
    p_base_version_id, p_base_sha256, p_logical_bundle_id,
    false, false, v_now, v_now
  );

  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'lease_generation', v_gen,
    'lease_expires_at', p_lease_expires_at,
    'aborted_previous_run_id', v_lock.run_id
  );
END;
$$;

-- PUBLIC revoke yetmez: service_role için explicit EXECUTE şart (IVO claim_* ile aynı model).
REVOKE ALL ON FUNCTION public.cb360_try_start_run(
  text, text, timestamptz, text, text, integer, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cb360_try_start_run(
  text, text, timestamptz, text, text, integer, text, text, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cb360_try_start_run(
  text, text, timestamptz, text, text, integer, text, text, text, text
) TO service_role;

-- Atomik heartbeat: kilit sırası lease_lock → run (try_start/publish ile aynı; deadlock önlemi)
-- Süresi dolmuş lease ASLA yenilenmez. Token hash + generation + sahiplik tek TX'de doğrulanır.
CREATE OR REPLACE FUNCTION public.cb360_heartbeat_run(
  p_run_id text,
  p_lease_token_hash text,
  p_lease_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock public.cb360_lease_lock%ROWTYPE;
  v_run public.cb360_scan_runs%ROWTYPE;
  v_now timestamptz := now();
  v_status text;
BEGIN
  IF p_lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'cb360_invalid_payload:lease_expires_at_must_be_future';
  END IF;

  -- 1) Global lease row first (consistent with try_start_run / publish_bundle)
  SELECT * INTO v_lock FROM public.cb360_lease_lock WHERE id = 1 FOR UPDATE;

  -- 2) Then the run row
  SELECT * INTO v_run FROM public.cb360_scan_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cb360_not_found:run';
  END IF;

  IF v_run.lease_token_hash IS DISTINCT FROM p_lease_token_hash THEN
    RAISE EXCEPTION 'cb360_forbidden_lease';
  END IF;

  IF v_lock.run_id IS DISTINCT FROM p_run_id
     OR v_lock.lease_generation IS DISTINCT FROM v_run.lease_generation THEN
    RAISE EXCEPTION 'cb360_forbidden_lease';
  END IF;

  IF v_run.status NOT IN ('started', 'running', 'uploading', 'verifying') THEN
    RAISE EXCEPTION 'cb360_already_terminal:%', v_run.status;
  END IF;

  -- Expired lease must never be renewed
  IF v_lock.lease_expires_at IS NULL
     OR v_lock.lease_expires_at <= v_now
     OR v_run.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'cb360_lease_expired';
  END IF;

  v_status := CASE WHEN v_run.status = 'started' THEN 'running' ELSE v_run.status END;

  UPDATE public.cb360_lease_lock
  SET
    lease_expires_at = p_lease_expires_at,
    updated_at = v_now
  WHERE id = 1
    AND run_id = p_run_id
    AND lease_generation = v_run.lease_generation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cb360_forbidden_lease';
  END IF;

  UPDATE public.cb360_scan_runs
  SET
    lease_expires_at = p_lease_expires_at,
    status = v_status
  WHERE id = p_run_id
    AND lease_generation = v_run.lease_generation
    AND status IN ('started', 'running', 'uploading', 'verifying');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cb360_forbidden_lease';
  END IF;

  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'status', v_status,
    'lease_expires_at', p_lease_expires_at,
    'lease_generation', v_run.lease_generation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cb360_heartbeat_run(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cb360_heartbeat_run(text, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cb360_heartbeat_run(text, text, timestamptz) TO service_role;

-- Atomik publish: version insert + current upsert + run finalize + lease release
-- Kilit sırası: lease_lock → run → current_bundle (heartbeat/try_start ile uyumlu)
CREATE OR REPLACE FUNCTION public.cb360_publish_bundle(
  p_run_id text,
  p_lease_generation integer,
  p_expected_base_version_id text,
  p_version_id text,
  p_version_kind text,
  p_artifact text,
  p_object_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_bundle_id text,
  p_complete_payload_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.cb360_current_bundle%ROWTYPE;
  v_run public.cb360_scan_runs%ROWTYPE;
  v_lock public.cb360_lease_lock%ROWTYPE;
BEGIN
  SELECT * INTO v_lock FROM public.cb360_lease_lock WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_run FROM public.cb360_scan_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cb360_not_found:run';
  END IF;

  -- Idempotent: already published this run — no second version/current write
  IF v_run.became_current IS TRUE AND v_run.output_version_id IS NOT NULL THEN
    IF p_complete_payload_hash IS NOT NULL
       AND v_run.complete_payload_hash IS NOT NULL
       AND v_run.complete_payload_hash IS DISTINCT FROM p_complete_payload_hash THEN
      RAISE EXCEPTION 'cb360_idempotent_replay';
    END IF;
    RETURN jsonb_build_object(
      'idempotent', true,
      'run_id', v_run.id,
      'output_version_id', v_run.output_version_id,
      'source_version_id', v_run.output_version_id
    );
  END IF;

  IF v_run.status IN (
    'completed', 'partial', 'failed', 'rejected_integrity', 'rejected_policy',
    'aborted_lease', 'aborted'
  ) THEN
    RAISE EXCEPTION 'cb360_already_terminal:%', v_run.status;
  END IF;

  IF v_lock.run_id IS DISTINCT FROM p_run_id
     OR v_lock.lease_generation IS DISTINCT FROM p_lease_generation THEN
    RAISE EXCEPTION 'cb360_forbidden_lease';
  END IF;
  IF v_run.lease_expires_at <= now() OR v_lock.lease_expires_at IS NULL
     OR v_lock.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'cb360_lease_expired';
  END IF;

  SELECT * INTO v_current FROM public.cb360_current_bundle WHERE id = 1 FOR UPDATE;
  IF FOUND THEN
    IF v_current.source_version_id IS DISTINCT FROM p_expected_base_version_id THEN
      RAISE EXCEPTION 'cb360_stale_base';
    END IF;
  ELSIF p_expected_base_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'cb360_stale_base';
  END IF;

  INSERT INTO public.cb360_source_versions (
    id, kind, artifact, object_path, sha256, byte_size, bundle_id, created_by_run_id, immutable
  ) VALUES (
    p_version_id, p_version_kind, p_artifact, p_object_path, p_sha256, p_byte_size,
    p_bundle_id, p_run_id, true
  );

  INSERT INTO public.cb360_current_bundle (
    id, bundle_id, source_version_id, updated_at, updated_by_run_id
  ) VALUES (
    1, p_bundle_id, p_version_id, now(), p_run_id
  )
  ON CONFLICT (id) DO UPDATE SET
    bundle_id = EXCLUDED.bundle_id,
    source_version_id = EXCLUDED.source_version_id,
    updated_at = now(),
    updated_by_run_id = EXCLUDED.updated_by_run_id;

  UPDATE public.cb360_scan_runs SET
    status = 'completed',
    published = true,
    became_current = true,
    output_version_id = p_version_id,
    output_sha256 = p_sha256,
    output_object_path = p_object_path,
    server_sha256 = COALESCE(server_sha256, p_sha256),
    complete_payload_hash = COALESCE(p_complete_payload_hash, complete_payload_hash),
    finished_at = now()
  WHERE id = p_run_id;

  UPDATE public.cb360_lease_lock SET
    run_id = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = 1 AND run_id = p_run_id AND lease_generation = p_lease_generation;

  RETURN jsonb_build_object(
    'idempotent', false,
    'run_id', p_run_id,
    'output_version_id', p_version_id,
    'source_version_id', p_version_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cb360_publish_bundle(
  text, integer, text, text, text, text, text, text, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cb360_publish_bundle(
  text, integer, text, text, text, text, text, text, bigint, text, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cb360_publish_bundle(
  text, integer, text, text, text, text, text, text, bigint, text, text
) TO service_role;

-- Not: Trigger fonksiyonu set_cb360_scan_runs_updated_at SECURITY INVOKER kalır (yetki yükseltmez).
-- Staging önkoşulları: anon/authenticated/service_role rolleri (Supabase varsayılanı),
-- storage.buckets / storage.objects (yoksa bucket blokları no-op).
-- Bu migration IVO/Radar/Portföy tablolarına GRANT/POLICY eklemez.
