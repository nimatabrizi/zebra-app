import { NextResponse } from 'next/server';
import { getAppointmentCaller } from '../../../../lib/appointmentsAccess';
import {
  listFsboListings,
  listOfficeListings,
  listRecentListings,
  listTrackedListings,
  syncSahibindenListing,
  syncSahibindenListingFromHtml,
  trackListingForUser,
  type OfficeListFilters,
} from '../../../../lib/ivoListingsDb';
import { listComparableListings } from '../../../../lib/ivoComps';
import { listOfficeListingsLive } from '../../../../lib/ivoOfficeLive';
import {
  fetchMapFacets,
  fetchMapRegionSummary,
  listMapListings,
  type IvoMapSearchFilters,
} from '../../../../lib/ivoMapListings';
import {
  enqueueListingRefresh,
  enqueueMany,
  getJobStatus,
  listRecentJobs,
  requeueFailedJob,
} from '../../../../lib/ivoListingJobs';
import {
  extractSahibindenListingNo,
  probeSahibindenAccess,
  SahibindenFetchError,
} from '../../../../lib/sahibindenListing';
import { describeSahibindenFetchProvider } from '../../../../lib/sahibindenFetchProvider';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET ?view=tracked|fsbo|recent|office|comps|probe|jobs|job-status&listingNo= */
export async function GET(request: Request) {
  try {
    const gate = await getAppointmentCaller();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }
    const url = new URL(request.url);
    const view = url.searchParams.get('view') || 'tracked';

    if (
      view === 'map' ||
      view === 'map-summary' ||
      view === 'map-facets'
    ) {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      const radiusM = Number(url.searchParams.get('radiusM') || 1200);
      const preferDb = url.searchParams.get('source') === 'db';
      const modeParam = url.searchParams.get('mode');
      const swLat = Number(url.searchParams.get('swLat'));
      const swLng = Number(url.searchParams.get('swLng'));
      const neLat = Number(url.searchParams.get('neLat'));
      const neLng = Number(url.searchParams.get('neLng'));
      const hasBbox =
        Number.isFinite(swLat) &&
        Number.isFinite(swLng) &&
        Number.isFinite(neLat) &&
        Number.isFinite(neLng);

      let polygon: number[][] | null = null;
      const polyRaw = url.searchParams.get('polygon');
      if (polyRaw) {
        try {
          const parsed = JSON.parse(polyRaw) as unknown;
          if (
            Array.isArray(parsed) &&
            parsed.length >= 3 &&
            parsed.every(
              (c) =>
                Array.isArray(c) &&
                c.length >= 2 &&
                Number.isFinite(Number(c[0])) &&
                Number.isFinite(Number(c[1]))
            )
          ) {
            polygon = parsed.map((c) => [Number(c[0]), Number(c[1])]);
          }
        } catch {
          polygon = null;
        }
      }

      const csv = (key: string) => {
        const v = url.searchParams.get(key);
        if (!v?.trim()) return undefined;
        return v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      };
      const filters: IvoMapSearchFilters = {};
      const status = csv('status');
      const rooms = csv('rooms');
      const kind = csv('kind');
      const type = csv('type');
      const whom = csv('whom');
      if (status?.length) filters.status = status;
      if (rooms?.length) filters.rooms = rooms;
      if (kind?.length) filters.kind = kind;
      if (type?.length) filters.type = type;
      if (whom?.length) filters.whom = whom;

      const mode =
        modeParam === 'polygon' && polygon
          ? ('polygon' as const)
          : modeParam === 'bbox' && hasBbox
            ? ('bbox' as const)
            : ('radius' as const);

      const centerArgs = {
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        radiusM: Number.isFinite(radiusM) ? radiusM : 1200,
        mode,
        bbox: hasBbox ? { swLat, swLng, neLat, neLng } : null,
        polygon,
        filters,
      };

      if (view === 'map-summary') {
        const summary = await fetchMapRegionSummary(centerArgs);
        return NextResponse.json(summary);
      }

      if (view === 'map-facets') {
        const facets = await fetchMapFacets(centerArgs);
        return NextResponse.json(facets);
      }

      const result = await listMapListings({
        ...centerArgs,
        limit: Number(url.searchParams.get('limit') || 120) || 120,
        preferDb,
        enrich: url.searchParams.get('enrich') !== '0',
      });
      return NextResponse.json(result);
    }

    if (view === 'comps') {
      const listingNo =
        url.searchParams.get('listingNo') || url.searchParams.get('no') || '';
      if (!listingNo.trim()) {
        return NextResponse.json(
          { error: 'listingNo gerekli' },
          { status: 400 }
        );
      }
      const activeOnly = url.searchParams.get('activeOnly') !== '0';
      const comps = await listComparableListings({
        listingNo,
        activeOnly,
        limit: Number(url.searchParams.get('limit') || 40) || 40,
      });
      return NextResponse.json(comps);
    }

    if (view === 'provider') {
      return NextResponse.json({ provider: describeSahibindenFetchProvider() });
    }

    if (view === 'probe') {
      const input =
        url.searchParams.get('url') ||
        url.searchParams.get('listingNo') ||
        undefined;
      const probe = await probeSahibindenAccess(input);
      return NextResponse.json({
        probe,
        provider: describeSahibindenFetchProvider(),
      });
    }

    if (view === 'jobs') {
      const jobs = await listRecentJobs(gate.caller.userId, 30);
      return NextResponse.json({ jobs });
    }

    if (view === 'job-status') {
      const input =
        url.searchParams.get('listingNo') || url.searchParams.get('url') || '';
      const job = await getJobStatus(input);
      return NextResponse.json({
        job,
        durum: job
          ? job.status === 'pending' || job.status === 'running'
            ? 'listede'
            : job.status
          : null,
        mesaj: job
          ? job.status === 'pending' || job.status === 'running'
            ? 'Güncelleme Listesinde'
            : job.status === 'done'
              ? 'Tamamlandı'
              : job.error || job.status
          : 'Kayıt yok',
        kalan_dk: 0,
      });
    }

    if (view === 'office') {
      const statusParam = url.searchParams.get('status') || 'active';
      const typeParam = url.searchParams.get('listingType') || 'all';
      const sortParam = url.searchParams.get('sort') || 'seen';
      const preferDb = url.searchParams.get('source') === 'db';
      const officeFilters: OfficeListFilters = {
        status:
          statusParam === 'inactive' || statusParam === 'all'
            ? statusParam
            : 'active',
        listingType:
          typeParam === 'satilik' || typeParam === 'kiralik'
            ? typeParam
            : 'all',
        q: url.searchParams.get('q') || undefined,
        sort:
          sortParam === 'price_asc' || sortParam === 'price_desc'
            ? sortParam
            : 'seen',
        limit: Number(url.searchParams.get('limit') || 48) || 48,
        offset: Number(url.searchParams.get('offset') || 0) || 0,
      };

      let result: Awaited<ReturnType<typeof listOfficeListings>>;
      let source: 'live' | 'db' = 'db';
      let liveError: string | undefined;

      if (!preferDb) {
        try {
          const live = await listOfficeListingsLive(officeFilters);
          result = live;
          source = 'live';
        } catch (e) {
          liveError = e instanceof Error ? e.message : 'Canlı IVO hatası';
          result = await listOfficeListings(officeFilters);
          source = 'db';
        }
      } else {
        result = await listOfficeListings(officeFilters);
      }

      return NextResponse.json({
        listings: result.listings,
        view: 'office',
        total: result.total,
        counts: result.counts,
        source,
        liveError,
        meta: {
          count: result.listings.length,
          total: result.total,
          source,
          withPhoto: result.listings.filter(
            (r) =>
              !!(
                r.image_url ||
                (r.raw as { card?: { image?: string } } | null)?.card?.image
              )
          ).length,
          withPriceStats: result.listings.filter(
            (r) =>
              !!(r.raw as { card?: { price_stats?: unknown } } | null)?.card
                ?.price_stats
          ).length,
        },
      });
    }

    let listings;
    if (view === 'fsbo') listings = await listFsboListings(60);
    else if (view === 'recent') listings = await listRecentListings(60);
    else listings = await listTrackedListings(gate.caller.userId);

    return NextResponse.json({
      listings,
      view,
      meta: {
        count: listings.length,
        withPhoto: listings.filter(
          (r) =>
            !!(r.image_url || (r.raw as { card?: { image?: string } } | null)?.card?.image)
        ).length,
        withPriceStats: listings.filter(
          (r) =>
            !!(r.raw as { card?: { price_stats?: unknown } } | null)?.card
              ?.price_stats
        ).length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — IVO mimarisi:
 * - default / action:enqueue → kuyruğa ekle (anında)
 * - action:refresh → takiptekileri / noları kuyruğa al
 * - action:sync → senkron çek (html veya canlı; CF'de patlar)
 * - action:probe
 */
export async function POST(request: Request) {
  try {
    const gate = await getAppointmentCaller();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      url?: string;
      listingNo?: string;
      track?: boolean;
      html?: string;
      nolar?: string[];
      kaynak?: 'detay' | 'liste';
    };

    if (body.action === 'probe') {
      const probe = await probeSahibindenAccess(body.url || body.listingNo);
      return NextResponse.json({
        probe,
        provider: describeSahibindenFetchProvider(),
      });
    }

    if (body.action === 'requeue') {
      const input = String(body.url || body.listingNo || '').trim();
      if (!input) {
        return NextResponse.json(
          { error: 'url veya listingNo gerekli' },
          { status: 400 }
        );
      }
      const job = await requeueFailedJob(input);
      if (!job) {
        return NextResponse.json(
          { error: 'Failed job bulunamadı' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        mesaj: 'Yeniden kuyruğa alındı',
        job,
        data: { durum: 'eklendi', mesaj: 'Yeniden kuyruğa alındı', no: job.listing_no },
      });
    }

    if (body.action === 'refresh') {
      const nolar = Array.isArray(body.nolar)
        ? body.nolar.map(String).filter(Boolean).slice(0, 50)
        : [];
      const inputs =
        nolar.length > 0
          ? nolar
          : (await listTrackedListings(gate.caller.userId))
              .slice(0, 20)
              .map((r) => r.listing_no);
      const result = await enqueueMany(inputs, {
        userId: gate.caller.userId,
        kaynak: body.kaynak || 'detay',
        track: true,
      });
      return NextResponse.json({
        ...result,
        mesaj: `Kuyruk: ${result.eklendi} eklendi · ${result.listede} zaten listede`,
      });
    }

    if (body.action === 'sync') {
      const input = String(body.url || body.listingNo || '').trim();
      if (!input) {
        return NextResponse.json(
          { error: 'url veya listingNo gerekli' },
          { status: 400 }
        );
      }
      const listing = body.html
        ? await syncSahibindenListingFromHtml(input, body.html)
        : await syncSahibindenListing(input);
      if (body.track !== false) {
        await trackListingForUser(gate.caller.userId, listing.id);
      }
      return NextResponse.json({ listing });
    }

    // default = enqueue (IVO /properties/{no}/guncelle)
    const input = String(body.url || body.listingNo || '').trim();
    if (!input) {
      return NextResponse.json(
        { error: 'url veya listingNo gerekli' },
        { status: 400 }
      );
    }
    if (!extractSahibindenListingNo(input)) {
      return NextResponse.json(
        { error: 'Geçerli ilan no veya Sahibinden linki gerekli' },
        { status: 400 }
      );
    }

    // HTML geldiyse senkron kaydet (worker bypass / kanıt yolu)
    if (body.html) {
      const listing = await syncSahibindenListingFromHtml(input, body.html);
      if (body.track !== false) {
        await trackListingForUser(gate.caller.userId, listing.id);
      }
      return NextResponse.json({ listing, mode: 'html-sync' });
    }

    const result = await enqueueListingRefresh({
      input,
      userId: gate.caller.userId,
      track: body.track !== false,
      kaynak: body.kaynak || 'detay',
    });

    return NextResponse.json({
      ...result,
      // IVO şekli
      data: {
        durum: result.durum,
        mesaj: result.mesaj,
        kalan_dk: result.kalan_dk,
        no: Number(result.job.listing_no) || result.job.listing_no,
      },
    });
  } catch (err) {
    if (err instanceof SahibindenFetchError) {
      return NextResponse.json(
        {
          error: err.message,
          kind: err.kind,
          httpStatus: err.httpStatus,
          hint:
            err.kind === 'cloudflare' || err.kind === 'unusual_access'
              ? 'Doğrudan çekim engelli. Kuyruk + worker (proxy) veya HTML yapıştırma kullanın.'
              : undefined,
        },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
