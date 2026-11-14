import { createServiceClient } from '../utils/supabase/admin';
import {
  extractSahibindenListingNo,
  SahibindenFetchError,
} from './sahibindenListing';
import {
  syncSahibindenListing,
  syncSahibindenListingFromHtml,
  trackListingForUser,
} from './ivoListingsDb';
import type { IvoListingRow } from './ivoListingTypes';

export type IvoJobKaynak = 'detay' | 'liste';
export type IvoJobStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export type IvoListingJob = {
  id: string;
  listing_no: string;
  kaynak: IvoJobKaynak;
  status: IvoJobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  requested_by: string | null;
  track_user_id: string | null;
  error: string | null;
  error_kind: string | null;
  result_listing_id: string | null;
  worker_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_attempt_at: string;
};

export type EnqueueResult = {
  durum: 'eklendi' | 'listede';
  mesaj: string;
  job: IvoListingJob;
  kalan_dk: number;
};

function admin() {
  return createServiceClient();
}

/** IVO: Güncelleme Listesine Ekle */
export async function enqueueListingRefresh(opts: {
  input: string;
  kaynak?: IvoJobKaynak;
  userId?: string | null;
  track?: boolean;
  priority?: number;
}): Promise<EnqueueResult> {
  const listingNo = extractSahibindenListingNo(opts.input);
  if (!listingNo) {
    throw new Error('Geçerli ilan no veya Sahibinden linki gerekli.');
  }
  const kaynak = opts.kaynak || 'detay';
  const db = admin();

  const { data: open } = await db
    .from('ivo_listing_jobs')
    .select('*')
    .eq('listing_no', listingNo)
    .eq('kaynak', kaynak)
    .in('status', ['pending', 'running'])
    .maybeSingle();

  if (open) {
    return {
      durum: 'listede',
      mesaj: 'Güncelleme Listesinde',
      job: open as IvoListingJob,
      kalan_dk: 0,
    };
  }

  const { data, error } = await db
    .from('ivo_listing_jobs')
    .insert({
      listing_no: listingNo,
      kaynak,
      status: 'pending',
      priority: opts.priority ?? 100,
      requested_by: opts.userId || null,
      track_user_id: opts.track === false ? null : opts.userId || null,
    })
    .select('*')
    .single();

  if (error) {
    // unique race → tekrar oku
    const { data: again } = await db
      .from('ivo_listing_jobs')
      .select('*')
      .eq('listing_no', listingNo)
      .eq('kaynak', kaynak)
      .in('status', ['pending', 'running'])
      .maybeSingle();
    if (again) {
      return {
        durum: 'listede',
        mesaj: 'Güncelleme Listesinde',
        job: again as IvoListingJob,
        kalan_dk: 0,
      };
    }
    throw new Error(error.message);
  }

  return {
    durum: 'eklendi',
    mesaj: 'Güncelleme Listesine Eklendi',
    job: data as IvoListingJob,
    kalan_dk: 0,
  };
}

export async function enqueueMany(
  inputs: string[],
  opts: { userId?: string | null; kaynak?: IvoJobKaynak; track?: boolean }
): Promise<{ eklendi: number; listede: number; jobs: EnqueueResult[] }> {
  const jobs: EnqueueResult[] = [];
  let eklendi = 0;
  let listede = 0;
  for (const input of inputs.slice(0, 50)) {
    const r = await enqueueListingRefresh({
      input,
      userId: opts.userId,
      kaynak: opts.kaynak,
      track: opts.track,
    });
    jobs.push(r);
    if (r.durum === 'eklendi') eklendi += 1;
    else listede += 1;
  }
  return { eklendi, listede, jobs };
}

export async function getJobStatus(listingNo: string): Promise<IvoListingJob | null> {
  const no = extractSahibindenListingNo(listingNo);
  if (!no) return null;
  const { data } = await admin()
    .from('ivo_listing_jobs')
    .select('*')
    .eq('listing_no', no)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as IvoListingJob) || null;
}

export async function listRecentJobs(
  userId: string,
  limit = 20
): Promise<IvoListingJob[]> {
  const { data, error } = await admin()
    .from('ivo_listing_jobs')
    .select('*')
    .or(`requested_by.eq.${userId},track_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as IvoListingJob[];
}

export async function claimJobs(
  limit = 5,
  workerId = 'worker'
): Promise<IvoListingJob[]> {
  const { data, error } = await admin().rpc('claim_ivo_listing_jobs', {
    p_limit: limit,
    p_worker_id: workerId,
  });
  if (error) throw new Error(error.message);
  return (data || []) as IvoListingJob[];
}

async function completeJob(
  jobId: string,
  listing: IvoListingRow,
  trackUserId: string | null
) {
  if (trackUserId) {
    await trackListingForUser(trackUserId, listing.id);
  }
  await admin()
    .from('ivo_listing_jobs')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      result_listing_id: listing.id,
      error: null,
      error_kind: null,
    })
    .eq('id', jobId);
}

async function failJob(job: IvoListingJob, err: unknown) {
  const message = err instanceof Error ? err.message : 'Worker hatası';
  const kind = err instanceof SahibindenFetchError ? err.kind : 'unknown';
  const retryable =
    kind === 'cloudflare' ||
    kind === 'unusual_access' ||
    kind === 'http_error' ||
    kind === 'empty' ||
    kind === 'unknown';
  const canRetry = retryable && job.attempts < job.max_attempts;
  const next = new Date(
    Date.now() + Math.min(30, 2 ** job.attempts) * 60_000
  ).toISOString();

  await admin()
    .from('ivo_listing_jobs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: message,
      error_kind: kind,
      next_attempt_at: canRetry ? next : new Date().toISOString(),
    })
    .eq('id', job.id);
}

/** Tek job işle — fetch provider env ile genişletilebilir */
export async function processJob(job: IvoListingJob): Promise<{
  ok: boolean;
  listing?: IvoListingRow;
  error?: string;
  kind?: string;
}> {
  try {
    const html = process.env.SAHIBINDEN_JOB_HTML_FIXTURE;
    const listing = html
      ? await syncSahibindenListingFromHtml(job.listing_no, html)
      : await syncSahibindenListing(job.listing_no);
    await completeJob(job.id, listing, job.track_user_id);
    return { ok: true, listing };
  } catch (err) {
    await failJob(job, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Worker hatası',
      kind: err instanceof SahibindenFetchError ? err.kind : 'unknown',
    };
  }
}

export type WorkerTickResult = {
  claimed: number;
  done: number;
  failed: number;
  results: Array<{
    listing_no: string;
    ok: boolean;
    error?: string;
    kind?: string;
  }>;
};

/** IVO organizer tick: claim → çek → upsert */
export async function runWorkerTick(opts?: {
  limit?: number;
  workerId?: string;
}): Promise<WorkerTickResult & { provider: string; providerHint: string }> {
  const { describeSahibindenFetchProvider } = await import(
    './sahibindenFetchProvider'
  );
  const info = describeSahibindenFetchProvider();
  const jobs = await claimJobs(opts?.limit ?? 5, opts?.workerId ?? 'worker');
  const results: WorkerTickResult['results'] = [];
  let done = 0;
  let failed = 0;

  for (const job of jobs) {
    const r = await processJob(job);
    results.push({
      listing_no: job.listing_no,
      ok: r.ok,
      error: r.error,
      kind: r.kind,
    });
    if (r.ok) done += 1;
    else failed += 1;
    await new Promise((res) => setTimeout(res, 400));
  }

  return {
    claimed: jobs.length,
    done,
    failed,
    results,
    provider: info.provider,
    providerHint: info.hint,
  };
}

/** Failed job’ı hemen yeniden pending yap (proxy eklendikten sonra). */
export async function requeueFailedJob(listingNo: string): Promise<IvoListingJob | null> {
  const no = extractSahibindenListingNo(listingNo);
  if (!no) return null;
  const db = admin();
  const { data: failed } = await db
    .from('ivo_listing_jobs')
    .select('*')
    .eq('listing_no', no)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!failed) return null;

  const { data, error } = await db
    .from('ivo_listing_jobs')
    .update({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      error: null,
      error_kind: null,
      worker_id: null,
      started_at: null,
      finished_at: null,
    })
    .eq('id', (failed as IvoListingJob).id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as IvoListingJob;
}
