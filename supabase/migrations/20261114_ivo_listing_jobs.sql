-- =============================================================================
-- IVO mimarisi: Güncelleme kuyruğu (organizer karşılığı — app enqueue, worker çeker)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ivo_listing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_no text NOT NULL,
  kaynak text NOT NULL DEFAULT 'detay'
    CHECK (kaynak IN ('detay', 'liste')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  priority int NOT NULL DEFAULT 100,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  requested_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  track_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  error text,
  error_kind text,
  result_listing_id uuid REFERENCES public.ivo_listings (id) ON DELETE SET NULL,
  worker_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ivo_listing_jobs_claim_idx
  ON public.ivo_listing_jobs (status, next_attempt_at, priority, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS ivo_listing_jobs_listing_idx
  ON public.ivo_listing_jobs (listing_no, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ivo_listing_jobs_open_uniq
  ON public.ivo_listing_jobs (listing_no, kaynak)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.ivo_listing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ivo_jobs_select_own" ON public.ivo_listing_jobs;
CREATE POLICY "ivo_jobs_select_own"
  ON public.ivo_listing_jobs FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR track_user_id = auth.uid()
  );

GRANT SELECT ON public.ivo_listing_jobs TO authenticated;

-- Atomik claim (IVO organizer kuyruk karşılığı)
CREATE OR REPLACE FUNCTION public.claim_ivo_listing_jobs(
  p_limit int DEFAULT 5,
  p_worker_id text DEFAULT 'worker'
)
RETURNS SETOF public.ivo_listing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT j.id
    FROM public.ivo_listing_jobs j
    WHERE (
        j.status = 'pending'
        OR (
          j.status = 'failed'
          AND j.attempts < j.max_attempts
          AND j.next_attempt_at <= now()
        )
      )
      AND j.next_attempt_at <= now()
    ORDER BY j.priority ASC, j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 50))
  )
  UPDATE public.ivo_listing_jobs j
  SET
    status = 'running',
    worker_id = p_worker_id,
    started_at = now(),
    attempts = j.attempts + 1,
    error = NULL,
    error_kind = NULL
  FROM cte
  WHERE j.id = cte.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ivo_listing_jobs(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ivo_listing_jobs(int, text) TO service_role;
