'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Download,
  FlipHorizontal2,
  Loader2,
  Presentation,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW,
  DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW,
  DEFAULT_PRESENTATION_TITLE_ADJUST,
  PRESENTATION_EXPORT_SCALE,
  PRESENTATION_QUARTERS,
  PRESENTATION_SUNUM2_LOGO_BLUR_MAX,
  PRESENTATION_SUNUM2_LOGO_GLOW_KEY,
  PRESENTATION_SUNUM2_LOGO_SHADOW_KEY,
  PRESENTATION_TITLE_ADJUST_KEY,
  buildPresentationJobs,
  buildPresentationJobsV2,
  buildPresentationJobsV3,
  canvasToPresentationJpegBlob,
  normalizePresentationAdjust,
  normalizePresentationLogoFx,
  normalizePresentationTitleAdjust,
  presentationCanvasToPdfBlob,
  presentationCanvasToPptxBlob,
  presentationCanvasesToPdfBlob,
  presentationCanvasesToPptxBlob,
  presentationExportFileName,
  presentationJobPeople,
  renderPresentation,
  type PresentationExportFormat,
  type PresentationJob,
  type PresentationLogoFxAdjust,
  type PresentationQuarterId,
  type PresentationTeamResolve,
  type PresentationTitleAdjust,
} from '../lib/rankingPresentation';
import { orderPresentationJobsByOdulSlides } from '../lib/presentationOdulSlideOrder';
import {
  DEFAULT_PRESENTATION_FREE_GRID,
  PRESENTATION_FREE_GRID_KEY,
  moveFreeGridLine,
  normalizePresentationFreeGrid,
  samePresentationFreeGrid,
  type FreeGridAxis,
  type PresentationFreeGrid,
} from '../lib/presentationFreeGrid';
import {
  DEFAULT_PHOTO_ADJUST,
  defaultRankAdjust,
  loadRankImage,
  measureOpaqueBox,
  normalizeRankAdjust,
  type PhotoAdjust,
  type RankAdjust,
  type RankEntry,
  type RankPeriodId,
  type RenderPerson,
} from '../lib/rankingVisuals';
import { measureFace } from '../lib/girisVisuals';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import {
  DEFAULT_TEAM_STRIP_ADJUST,
  TEAM_DEFS,
  normalizeTeamStripAdjust,
  TEAM_STRIP_EXPORT_SCALE,
  renderTeamStrip,
  teamAdjustKey,
  teamSettingsFromSaved,
  type TeamDef,
  type TeamStripAdjust,
} from '../lib/rankingTeamVisuals';
import { AdjustSaveActions } from './AdjustSaveControls';
import {
  PresentationFreeGridControls,
  PresentationFreeGridOverlay,
  type FreeGridSelection,
} from './PresentationFreeGrid';

type ResolvedPerson = {
  key: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
};

function resolveJobTeamDef(job: PresentationJob): TeamDef | undefined {
  return (
    TEAM_DEFS.find((t) => t.id === job.personKey) ||
    TEAM_DEFS.find(
      (t) =>
        t.displayName.toLocaleLowerCase('tr-TR') ===
        job.displayName.toLocaleLowerCase('tr-TR')
    )
  );
}

function sameTeamLogoPlacement(a: TeamStripAdjust, b: TeamStripAdjust) {
  return (
    Math.abs(a.logoScale - b.logoScale) < 1e-6 &&
    Math.abs(a.logoDx - b.logoDx) < 1e-6 &&
    Math.abs(a.logoDy - b.logoDy) < 1e-6
  );
}

function sameTeamPeopleOffset(a: TeamStripAdjust, b: TeamStripAdjust) {
  return a.peopleOffsetY === b.peopleOffsetY;
}

type Props = {
  entries: RankEntry[];
  resolvePerson: (name: string, key: string) => ResolvedPerson;
  /** V2/V3: takım logosu çözümleyici */
  resolveTeam?: (name: string, key: string) => PresentationTeamResolve;
  /** V3: Ödülünüz var takım şeridi üyeleri */
  teamRosterById?: Map<string, ResolvedPerson[]>;
  /** v1 = mevcut sunum; v2 = ödül birleşik + logo; v3 = yeni template + takım şeridi */
  variant?: 'v1' | 'v2' | 'v3';
  canSave?: boolean;
  /** ZIP / başlık etiketi */
  exportLabel?: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function clampScale(value: number) {
  return Math.min(1.85, Math.max(0.55, value));
}

function clampOffset(value: number) {
  return Math.min(420, Math.max(-420, value));
}

/** Rozet adedi filtresi etiketi */
function badgeCountLabel(n: number): string {
  const named: Record<number, string> = {
    1: 'Tekli',
    2: 'İkili',
    3: 'Üçlü',
    4: 'Dörtlü',
    5: 'Beşli',
    6: 'Altılı',
    7: 'Yedili',
    8: 'Sekizli',
    9: 'Dokuzlu',
    10: 'Onlu',
    11: 'On birli',
    12: 'On ikili',
  };
  return named[n] || `${n}'li`;
}

async function toRenderPerson(person: ResolvedPerson): Promise<RenderPerson> {
  const photo = await loadRankImage(person.photoUrl);
  if (!photo) {
    return {
      displayName: person.displayName,
      title: person.title,
      photo: null,
      bounds: null,
      face: null,
    };
  }
  const [bounds, face] = await Promise.all([
    Promise.resolve(measureOpaqueBox(photo)),
    measureFace(photo),
  ]);
  return {
    displayName: person.displayName,
    title: person.title,
    photo,
    bounds,
    face,
  };
}

export default function RankingPresentationStudio({
  entries,
  resolvePerson,
  resolveTeam,
  teamRosterById,
  variant = 'v1',
  canSave = false,
  exportLabel = 'sunum-gorselleri',
}: Props) {
  const [quarterFilter, setQuarterFilter] = useState<PresentationQuarterId | 'all'>('all');
  const [badgeCountFilter, setBadgeCountFilter] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [exportFormat, setExportFormat] = useState<PresentationExportFormat>('jpeg');
  const [exporting, setExporting] = useState<{ current: number; total: number } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [draft, setDraft] = useState<RankAdjust>(() => defaultRankAdjust(1));
  const [editPersonIndex, setEditPersonIndex] = useState(0);
  const [titleDraft, setTitleDraft] = useState<PresentationTitleAdjust>({
    ...DEFAULT_PRESENTATION_TITLE_ADJUST,
  });
  const [logoGlowDraft, setLogoGlowDraft] = useState<PresentationLogoFxAdjust>({
    ...DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW,
  });
  const [logoShadowDraft, setLogoShadowDraft] = useState<PresentationLogoFxAdjust>({
    ...DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW,
  });
  const [gridDraft, setGridDraft] = useState<PresentationFreeGrid>({
    ...DEFAULT_PRESENTATION_FREE_GRID,
    vertical: [],
    horizontal: [],
  });
  const [gridVisible, setGridVisible] = useState(true);
  const [gridSelected, setGridSelected] = useState<FreeGridSelection>(null);
  const [teamStripDraft, setTeamStripDraft] = useState<TeamStripAdjust>({
    ...DEFAULT_TEAM_STRIP_ADJUST,
  });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const teamStripDraftRef = useRef(teamStripDraft);
  teamStripDraftRef.current = teamStripDraft;
  const editPersonIndexRef = useRef(editPersonIndex);
  editPersonIndexRef.current = editPersonIndex;
  const titleDraftRef = useRef(titleDraft);
  titleDraftRef.current = titleDraft;
  const logoGlowDraftRef = useRef(logoGlowDraft);
  logoGlowDraftRef.current = logoGlowDraft;
  const logoShadowDraftRef = useRef(logoShadowDraft);
  logoShadowDraftRef.current = logoShadowDraft;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: RankAdjust;
    personIndex: number;
  } | null>(null);
  const previewBusy = useRef({ busy: false, pending: false });

  const {
    saved: adjustments,
    ready: adjustmentsReady,
    save: saveAdjust,
    remove: removeAdjust,
  } = useSavedAdjustments<
    | PhotoAdjust
    | RankAdjust
    | PresentationTitleAdjust
    | PresentationFreeGrid
    | PresentationLogoFxAdjust
    | TeamStripAdjust
  >('siralama', {
    legacyStorageKey: 'zebra-siralama-adjust-v1',
    canSave,
  });

  const jobs = useMemo(() => {
    const teamFn =
      resolveTeam ||
      ((name: string, key: string): PresentationTeamResolve => ({
        key,
        displayName: name,
        logoUrl: null,
      }));
    if (variant === 'v3') {
      return orderPresentationJobsByOdulSlides(
        buildPresentationJobsV3(entries, resolvePerson, teamFn)
      );
    }
    if (variant === 'v2') {
      return orderPresentationJobsByOdulSlides(
        buildPresentationJobsV2(entries, resolvePerson, teamFn)
      );
    }
    return buildPresentationJobs(entries, resolvePerson);
  }, [entries, resolvePerson, resolveTeam, variant]);

  const needle = query.trim().toLocaleLowerCase('tr-TR');

  const badgeCountOptions = useMemo(() => {
    const map = new Map<number, number>();
    for (const job of jobs) {
      if (quarterFilter !== 'all' && job.quarterId !== quarterFilter) continue;
      if (needle && !job.displayName.toLocaleLowerCase('tr-TR').includes(needle)) continue;
      const n = job.badges.length;
      if (n < 1) continue;
      map.set(n, (map.get(n) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [jobs, quarterFilter, needle]);

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (quarterFilter !== 'all' && job.quarterId !== quarterFilter) return false;
      if (badgeCountFilter !== 'all' && job.badges.length !== badgeCountFilter) return false;
      if (!needle) return true;
      return job.displayName.toLocaleLowerCase('tr-TR').includes(needle);
    });
  }, [jobs, quarterFilter, badgeCountFilter, needle]);

  useEffect(() => {
    if (badgeCountFilter === 'all') return;
    if (!badgeCountOptions.some(([n]) => n === badgeCountFilter)) {
      setBadgeCountFilter('all');
    }
  }, [badgeCountFilter, badgeCountOptions]);

  const previewJob = useMemo(
    () => filtered.find((j) => j.key === previewKey) || filtered[0] || null,
    [filtered, previewKey]
  );

  const previewPeople = useMemo(
    () => (previewJob ? presentationJobPeople(previewJob) : []),
    [previewJob]
  );
  const previewPersonCount = Math.max(1, previewPeople.length);
  const previewTeamDef =
    variant === 'v3' && previewJob?.kind === 'team'
      ? resolveJobTeamDef(previewJob)
      : undefined;
  const previewTeamAdjustKey = previewTeamDef
    ? teamAdjustKey(previewTeamDef.id)
    : null;

  const savedForPreview = previewJob
    ? normalizeRankAdjust(adjustments[previewJob.adjustKey], previewPersonCount)
    : defaultRankAdjust(1);
  const savedTeamStrip = previewTeamAdjustKey
    ? normalizeTeamStripAdjust(adjustments[previewTeamAdjustKey])
    : { ...DEFAULT_TEAM_STRIP_ADJUST };

  const savedTitle = normalizePresentationTitleAdjust(
    adjustments[PRESENTATION_TITLE_ADJUST_KEY]
  );
  const savedGrid = normalizePresentationFreeGrid(adjustments[PRESENTATION_FREE_GRID_KEY]);
  const savedLogoGlow = normalizePresentationLogoFx(
    adjustments[PRESENTATION_SUNUM2_LOGO_GLOW_KEY],
    DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW
  );
  const savedLogoShadow = normalizePresentationLogoFx(
    adjustments[PRESENTATION_SUNUM2_LOGO_SHADOW_KEY],
    DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW
  );

  const activePersonAdjust =
    draft.people[editPersonIndex] || draft.people[0] || DEFAULT_PHOTO_ADJUST;

  const dirty = Boolean(
    canSave && previewJob && !sameAdjust(draft, savedForPreview)
  );
  const teamLogoDirty = Boolean(
    canSave &&
      previewTeamDef &&
      !sameTeamLogoPlacement(teamStripDraft, savedTeamStrip)
  );
  const teamPeopleOffsetDirty = Boolean(
    canSave &&
      previewTeamDef &&
      !sameTeamPeopleOffset(teamStripDraft, savedTeamStrip)
  );
  const titleDirty = Boolean(canSave && !sameAdjust(titleDraft, savedTitle));
  const gridDirty = Boolean(canSave && !samePresentationFreeGrid(gridDraft, savedGrid));
  const logoGlowDirty = Boolean(
    canSave && variant === 'v2' && !sameAdjust(logoGlowDraft, savedLogoGlow)
  );
  const logoShadowDirty = Boolean(
    canSave && variant === 'v2' && !sameAdjust(logoShadowDraft, savedLogoShadow)
  );

  useEffect(() => {
    if (previewJob && previewKey !== previewJob.key) setPreviewKey(previewJob.key);
    if (!previewJob) setPreviewKey(null);
  }, [previewJob, previewKey]);

  useEffect(() => {
    setEditPersonIndex(0);
  }, [previewJob?.key]);

  /** Son uygulanan kayıt — adjustments referansı değişince dirty draft ezilmesin */
  const appliedPhotoKeyRef = useRef<string | null>(null);
  const appliedPhotoRef = useRef<RankAdjust | null>(null);
  const appliedTitleRef = useRef<PresentationTitleAdjust | null>(null);
  const appliedGridRef = useRef<PresentationFreeGrid | null>(null);
  const appliedLogoGlowRef = useRef<PresentationLogoFxAdjust | null>(null);
  const appliedLogoShadowRef = useRef<PresentationLogoFxAdjust | null>(null);
  const appliedTeamStripKeyRef = useRef<string | null>(null);
  const appliedTeamStripRef = useRef<TeamStripAdjust | null>(null);

  useEffect(() => {
    if (!previewJob || !adjustmentsReady) return;
    const key = previewJob.adjustKey;
    const next = normalizeRankAdjust(
      adjustments[key],
      Math.max(1, presentationJobPeople(previewJob).length)
    );
    const prevApplied = appliedPhotoRef.current;
    const keyChanged = appliedPhotoKeyRef.current !== key;
    if (!keyChanged && prevApplied && sameAdjust(prevApplied, next)) return;
    appliedPhotoKeyRef.current = key;
    appliedPhotoRef.current = next;
    setDraft((prev) => {
      if (!keyChanged && prevApplied && !sameAdjust(prev, prevApplied)) return prev;
      return next;
    });
  }, [previewJob?.adjustKey, adjustmentsReady, adjustments, previewJob]);

  useEffect(() => {
    if (!adjustmentsReady) return;
    const next = normalizePresentationTitleAdjust(adjustments[PRESENTATION_TITLE_ADJUST_KEY]);
    const prevApplied = appliedTitleRef.current;
    if (prevApplied && sameAdjust(prevApplied, next)) return;
    appliedTitleRef.current = next;
    setTitleDraft((prev) => {
      if (prevApplied && !sameAdjust(prev, prevApplied)) return prev;
      return next;
    });
  }, [adjustmentsReady, adjustments]);

  useEffect(() => {
    if (!adjustmentsReady) return;
    const next = normalizePresentationFreeGrid(adjustments[PRESENTATION_FREE_GRID_KEY]);
    const prevApplied = appliedGridRef.current;
    if (prevApplied && samePresentationFreeGrid(prevApplied, next)) return;
    appliedGridRef.current = next;
    setGridDraft((prev) => {
      // Kayıtlı grid aynı kaldıysa / kullanıcı dirty iken — yerel çizgileri koru
      if (prevApplied && !samePresentationFreeGrid(prev, prevApplied)) return prev;
      return next;
    });
  }, [adjustmentsReady, adjustments]);

  useEffect(() => {
    if (!adjustmentsReady || variant !== 'v2') return;
    const next = normalizePresentationLogoFx(
      adjustments[PRESENTATION_SUNUM2_LOGO_GLOW_KEY],
      DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW
    );
    const prevApplied = appliedLogoGlowRef.current;
    if (prevApplied && sameAdjust(prevApplied, next)) return;
    appliedLogoGlowRef.current = next;
    setLogoGlowDraft((prev) => {
      if (prevApplied && !sameAdjust(prev, prevApplied)) return prev;
      return next;
    });
  }, [adjustmentsReady, adjustments, variant]);

  useEffect(() => {
    if (!adjustmentsReady || variant !== 'v2') return;
    const next = normalizePresentationLogoFx(
      adjustments[PRESENTATION_SUNUM2_LOGO_SHADOW_KEY],
      DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW
    );
    const prevApplied = appliedLogoShadowRef.current;
    if (prevApplied && sameAdjust(prevApplied, next)) return;
    appliedLogoShadowRef.current = next;
    setLogoShadowDraft((prev) => {
      if (prevApplied && !sameAdjust(prev, prevApplied)) return prev;
      return next;
    });
  }, [adjustmentsReady, adjustments, variant]);

  useEffect(() => {
    if (!adjustmentsReady || !previewTeamAdjustKey) return;
    const next = normalizeTeamStripAdjust(adjustments[previewTeamAdjustKey]);
    const prevApplied = appliedTeamStripRef.current;
    const keyChanged = appliedTeamStripKeyRef.current !== previewTeamAdjustKey;
    if (
      !keyChanged &&
      prevApplied &&
      sameTeamLogoPlacement(prevApplied, next) &&
      sameTeamPeopleOffset(prevApplied, next)
    ) {
      return;
    }
    appliedTeamStripKeyRef.current = previewTeamAdjustKey;
    appliedTeamStripRef.current = next;
    setTeamStripDraft((prev) => {
      if (
        !keyChanged &&
        prevApplied &&
        (!sameTeamLogoPlacement(prev, prevApplied) ||
          !sameTeamPeopleOffset(prev, prevApplied))
      ) {
        return prev;
      }
      return next;
    });
  }, [adjustmentsReady, adjustments, previewTeamAdjustKey]);

  const onMoveGridLine = useCallback((axis: FreeGridAxis, index: number, position: number) => {
    setGridDraft((g) => moveFreeGridLine(g, axis, index, position));
  }, []);

  const updateActivePerson = useCallback((patch: Partial<PhotoAdjust>) => {
    const idx = editPersonIndexRef.current;
    setDraft((current) => ({
      people: current.people.map((entry, i) =>
        i === idx ? { ...entry, ...patch } : entry
      ),
    }));
  }, []);

  const renderJob = useCallback(
    async (
      job: PresentationJob,
      overrides?: {
        photo?: RankAdjust;
        title?: PresentationTitleAdjust;
        logoGlow?: PresentationLogoFxAdjust;
        logoShadow?: PresentationLogoFxAdjust;
        teamStrip?: TeamStripAdjust;
        /** false → 1× önizleme; varsayılan export ölçeği */
        hiRes?: boolean;
      }
    ) => {
      const jobPeople = presentationJobPeople(job);
      const people = await Promise.all(
        jobPeople.map((p) =>
          toRenderPerson({
            key: p.key,
            displayName: p.displayName,
            title: p.title,
            photoUrl: p.photoUrl,
          })
        )
      );
      const adjust =
        overrides?.photo ||
        normalizeRankAdjust(adjustments[job.adjustKey], Math.max(1, jobPeople.length));
      const titleAdjust =
        overrides?.title ||
        normalizePresentationTitleAdjust(adjustments[PRESENTATION_TITLE_ADJUST_KEY]);
      const logoGlow =
        overrides?.logoGlow ||
        normalizePresentationLogoFx(
          adjustments[PRESENTATION_SUNUM2_LOGO_GLOW_KEY],
          DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW
        );
      const logoShadow =
        overrides?.logoShadow ||
        normalizePresentationLogoFx(
          adjustments[PRESENTATION_SUNUM2_LOGO_SHADOW_KEY],
          DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW
        );

      let teamStripCanvas: HTMLCanvasElement | null = null;
      let teamStripAdjust: PhotoAdjust | undefined;
      if (variant === 'v3' && job.kind === 'team') {
        const def = resolveJobTeamDef(job);
        const roster = def ? teamRosterById?.get(def.id) : undefined;
        if (def && roster?.length) {
          const stripPeople = await Promise.all(
            roster.map((p) =>
              toRenderPerson({
                key: p.key,
                displayName: p.displayName,
                title: p.title,
                photoUrl: p.photoUrl,
              })
            )
          );
          const settings = teamSettingsFromSaved(def, roster, adjustments);
          const stripOverride = overrides?.teamStrip;
          if (stripOverride) {
            settings.teamAdjust = normalizeTeamStripAdjust({
              ...settings.teamAdjust,
              logoScale: stripOverride.logoScale,
              logoDx: stripOverride.logoDx,
              logoDy: stripOverride.logoDy,
              peopleOffsetY: stripOverride.peopleOffsetY,
            });
          }
          const periodId = (job.badges[0]?.periodId || job.quarterId) as RankPeriodId;
          teamStripCanvas = await renderTeamStrip({
            periodId,
            people: stripPeople,
            logoUrl: job.logoUrl ?? def.logoUrl,
            skipBackground: true,
            renderScale: TEAM_STRIP_EXPORT_SCALE,
            ...settings,
          });
          // RankAdjust { people: [...] } — kök PhotoAdjust değil; people[0] kullanılmalı
          const stripPhoto = normalizeRankAdjust(
            overrides?.photo ?? adjustments[job.adjustKey],
            1
          );
          teamStripAdjust = normalizePresentationAdjust(stripPhoto.people[0]);
        }
      }

      const hiRes = overrides?.hiRes !== false;
      return renderPresentation({
        templateUrl: job.templateUrl,
        displayName: job.displayName,
        title: job.title,
        people,
        badges: job.badges,
        adjust,
        titleAdjust,
        kind: job.kind || 'person',
        logoUrl: job.logoUrl ?? null,
        logoGlow,
        logoShadow,
        assetSet: variant === 'v3' ? 'v3' : 'v2',
        teamStripCanvas,
        teamStripAdjust,
        outputScale: hiRes ? PRESENTATION_EXPORT_SCALE : 1,
      });
    },
    [adjustments, variant, teamRosterById]
  );

  const paintPreview = useCallback(async () => {
    const state = previewBusy.current;
    if (state.busy) {
      state.pending = true;
      return;
    }
    const job = previewJob;
    if (!job) return;
    state.busy = true;
    try {
      const canvas = await renderJob(job, {
        photo: draftRef.current,
        title: titleDraftRef.current,
        logoGlow: logoGlowDraftRef.current,
        logoShadow: logoShadowDraftRef.current,
        teamStrip: teamStripDraftRef.current,
        // Önizleme 1× (hız); indirme 2× / şerit 3×
        hiRes: false,
      });
      const target = previewCanvasRef.current;
      if (target && previewJob?.key === job.key) {
        const ctx = target.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(canvas, 0, 0, target.width, target.height);
          setPreviewReady(true);
        }
      }
    } catch (error) {
      console.warn('[sunum] önizleme', error);
    } finally {
      state.busy = false;
      if (state.pending) {
        state.pending = false;
        void paintPreview();
      }
    }
  }, [previewJob, renderJob]);

  useEffect(() => {
    setPreviewReady(false);
    if (previewJob) void paintPreview();
  }, [
    previewJob,
    draft,
    titleDraft,
    logoGlowDraft,
    logoShadowDraft,
    teamStripDraft,
    paintPreview,
  ]);

  /** Önizlenen slayt indirmede de aynı draft’ı kullansın */
  const previewOverridesFor = useCallback(
    (job: PresentationJob) => {
      if (previewJob?.key !== job.key) return undefined;
      return {
        photo: draftRef.current,
        title: titleDraftRef.current,
        logoGlow: logoGlowDraftRef.current,
        logoShadow: logoShadowDraftRef.current,
        teamStrip: teamStripDraftRef.current,
      };
    },
    [previewJob?.key]
  );

  const downloadOne = useCallback(
    async (job: PresentationJob) => {
      setDownloadingKey(job.key);
      try {
        const canvas = await renderJob(job, previewOverridesFor(job));
        const name = presentationExportFileName(job.downloadName, exportFormat);
        if (exportFormat === 'pdf') {
          downloadBlob(await presentationCanvasToPdfBlob(canvas), name);
        } else if (exportFormat === 'pptx') {
          downloadBlob(await presentationCanvasToPptxBlob(canvas), name);
        } else {
          downloadBlob(await canvasToPresentationJpegBlob(canvas), name);
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Sunum görseli oluşturulamadı');
      } finally {
        setDownloadingKey('');
      }
    },
    [renderJob, exportFormat, previewOverridesFor]
  );

  const downloadAll = useCallback(async () => {
    if (!filtered.length) return;
    setExporting({ current: 0, total: filtered.length });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (exportFormat === 'pdf' || exportFormat === 'pptx') {
        const canvases: HTMLCanvasElement[] = [];
        for (let i = 0; i < filtered.length; i += 1) {
          setExporting({ current: i + 1, total: filtered.length });
          const job = filtered[i]!;
          canvases.push(await renderJob(job, previewOverridesFor(job)));
        }
        if (exportFormat === 'pptx') {
          downloadBlob(
            await presentationCanvasesToPptxBlob(canvases),
            `${exportLabel}-${stamp}.pptx`
          );
        } else {
          downloadBlob(
            await presentationCanvasesToPdfBlob(canvases),
            `${exportLabel}-${stamp}.pdf`
          );
        }
        return;
      }
      const zip = new JSZip();
      // V2/V3: düz ZIP, PDF slayt sırası + numaralı dosya adları
      const flatZip = variant === 'v2' || variant === 'v3';
      const root = flatZip ? zip : zip.folder('Siralama-Sunum')!;
      for (let i = 0; i < filtered.length; i += 1) {
        const job = filtered[i]!;
        setExporting({ current: i + 1, total: filtered.length });
        const canvas = await renderJob(job, previewOverridesFor(job));
        const fileName = presentationExportFileName(job.downloadName, 'jpeg');
        const path = flatZip
          ? fileName
          : `${job.zipPath.replace(/\.png$/i, '')}.jpg`;
        root.file(path, await canvasToPresentationJpegBlob(canvas));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${exportLabel}-${stamp}.zip`);
    } catch (error) {
      const fallback =
        exportFormat === 'pdf'
          ? 'Sunum PDF oluşturulamadı'
          : exportFormat === 'pptx'
            ? 'Sunum PPTX oluşturulamadı'
            : 'Sunum ZIP oluşturulamadı';
      alert(error instanceof Error ? error.message : fallback);
    } finally {
      setExporting(null);
    }
  }, [filtered, renderJob, variant, exportLabel, exportFormat, previewOverridesFor]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: jobs.length };
    for (const q of PRESENTATION_QUARTERS) {
      map[q.periodId] = jobs.filter((j) => j.quarterId === q.periodId).length;
    }
    return map;
  }, [jobs]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!previewJob) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: {
        people: draft.people.map((p) => ({ ...p })),
      },
      personIndex: editPersonIndexRef.current,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratioX = canvas.width / Math.max(1, rect.width);
    const ratioY = canvas.height / Math.max(1, rect.height);
    const originPerson =
      drag.origin.people[drag.personIndex] || DEFAULT_PHOTO_ADJUST;
    setDraft({
      people: drag.origin.people.map((entry, i) =>
        i === drag.personIndex
          ? {
              ...originPerson,
              dx: clampOffset(
                originPerson.dx + (event.clientX - drag.startX) * ratioX
              ),
              dy: clampOffset(
                originPerson.dy + (event.clientY - drag.startY) * ratioY
              ),
            }
          : entry
      ),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] p-4 shadow-[var(--z-shadow-soft)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--z-muted)]">
              Çeyrek sunum
              {variant === 'v2' ? ' · 2' : variant === 'v3' ? ' · 3' : ''}
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-[var(--z-fg)]">
              {variant === 'v3'
                ? 'Sunum görselleri 3'
                : variant === 'v2'
                  ? 'Sunum görselleri 2'
                  : 'Sunum görselleri'}
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-[var(--z-muted)]">
              {variant === 'v3'
                ? 'Yeni template + rozet. Takımlar: Ödülünüz var şeridi (kayıtlı ayarlar). PDF slayt sırası.'
                : variant === 'v2'
                  ? 'Birleşik ödül sıralamaları: danışman + takım (logo). Dereceler Excel’deki gibi.'
                  : 'Danışman başına, çeyrek + aylık ödüller tek yatay görselde.'}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex rounded-full bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] p-0.5">
              {(
                [
                  ['jpeg', 'JPEG'],
                  ['pdf', 'PDF'],
                  ['pptx', 'PPTX'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setExportFormat(id)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    exportFormat === id
                      ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                      : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void downloadAll()}
              disabled={!filtered.length || Boolean(exporting)}
              className="z-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {exportFormat === 'pdf'
                    ? 'PDF'
                    : exportFormat === 'pptx'
                      ? 'PPTX'
                      : 'ZIP'}{' '}
                  {exporting.current}/{exporting.total}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" strokeWidth={1.8} />
                  {exportFormat === 'pdf'
                    ? `Tümünü PDF indir (${filtered.length})`
                    : exportFormat === 'pptx'
                      ? `Tümünü PPTX indir (${filtered.length})`
                      : `Tümünü ZIP indir (${filtered.length})`}
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQuarterFilter('all')}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
              quarterFilter === 'all'
                ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                : 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
            }`}
          >
            Tümü · {counts.all}
          </button>
          {PRESENTATION_QUARTERS.map((q) => (
            <button
              key={q.periodId}
              type="button"
              onClick={() => setQuarterFilter(q.periodId)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                quarterFilter === q.periodId
                  ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                  : 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
              }`}
            >
              {q.label} · {counts[q.periodId] || 0}
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--z-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Danışman ara…"
            className="z-field w-full pl-11 pr-4 text-[15px]"
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <section className="overflow-hidden rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] shadow-[var(--z-shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--z-border)] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-[var(--z-muted)]">
              <Presentation className="h-4 w-4" strokeWidth={1.8} />
              {previewJob ? previewJob.detail : 'Önizleme'}
            </div>
            {previewJob ? (
              <button
                type="button"
                onClick={() => void downloadOne(previewJob)}
                disabled={downloadingKey === previewJob.key}
                className="z-btn-ghost inline-flex items-center gap-2 px-3 py-1.5 text-[12px] disabled:opacity-50"
              >
                {downloadingKey === previewJob.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                )}
                {exportFormat === 'pdf'
                  ? 'PDF indir'
                  : exportFormat === 'pptx'
                    ? 'PPTX indir'
                    : 'JPEG indir'}
              </button>
            ) : null}
          </div>
          <div className="relative aspect-video touch-none bg-[color-mix(in_srgb,var(--z-elevated)_55%,#0a0a0a)]">
            {!previewReady ? (
              <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center gap-2 text-[13px] text-[var(--z-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Hazırlanıyor…
              </div>
            ) : null}
            <canvas
              ref={previewCanvasRef}
              width={1920}
              height={1080}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`h-full w-full cursor-grab object-contain active:cursor-grabbing ${
                previewReady ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {/* Overlay only — never drawn into renderPresentation / PNG */}
            <PresentationFreeGridOverlay
              grid={gridDraft}
              visible={gridVisible}
              selected={gridSelected}
              onSelect={setGridSelected}
              onMove={onMoveGridLine}
            />
          </div>

          {previewJob ? (
            <div className="space-y-3 border-t border-[var(--z-border)] px-4 py-3">
              <div>
                <p className="text-[15px] font-semibold text-[var(--z-fg)]">{previewJob.label}</p>
                <p className="mt-1 text-[12px] text-[var(--z-muted)]">
                  {previewJob.badges.map((b) => b.label).join(' · ')}
                </p>
              </div>

              {variant === 'v3' && previewJob.kind === 'team' && previewTeamDef ? (
                <>
                  <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                      Takım logosu (boyut / yer)
                      <span className="font-normal text-[var(--z-muted)]">
                        · {previewTeamDef.displayName}
                      </span>
                    </div>
                    <label className="block text-[11px] text-[var(--z-muted)]">
                      Ölçek · {teamStripDraft.logoScale.toFixed(2)}
                      <input
                        type="range"
                        min={0.4}
                        max={2.2}
                        step={0.01}
                        value={teamStripDraft.logoScale}
                        onChange={(e) =>
                          setTeamStripDraft((d) => ({
                            ...d,
                            logoScale: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      X · {teamStripDraft.logoDx.toFixed(0)}
                      <input
                        type="range"
                        min={-220}
                        max={220}
                        step={1}
                        value={teamStripDraft.logoDx}
                        onChange={(e) =>
                          setTeamStripDraft((d) => ({
                            ...d,
                            logoDx: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Y · {teamStripDraft.logoDy.toFixed(0)}
                      <input
                        type="range"
                        min={-220}
                        max={220}
                        step={1}
                        value={teamStripDraft.logoDy}
                        onChange={(e) =>
                          setTeamStripDraft((d) => ({
                            ...d,
                            logoDy: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <p className="mt-2 text-[11px] text-[var(--z-muted)]">
                      Kayıt bu takımın tüm Sunum 3 slaytlarında geçerli (Ödülünüz var ile ortak).
                    </p>
                    <div className="mt-3">
                      <AdjustSaveActions
                        canSave={canSave}
                        dirty={teamLogoDirty}
                        hasSaved={Boolean(
                          previewTeamAdjustKey && adjustments[previewTeamAdjustKey]
                        )}
                        onSave={async () => {
                          if (!previewTeamAdjustKey) return;
                          await saveAdjust(previewTeamAdjustKey, teamStripDraft);
                        }}
                        onResetScreen={() =>
                          setTeamStripDraft((d) => ({
                            ...d,
                            logoScale: DEFAULT_TEAM_STRIP_ADJUST.logoScale,
                            logoDx: DEFAULT_TEAM_STRIP_ADJUST.logoDx,
                            logoDy: DEFAULT_TEAM_STRIP_ADJUST.logoDy,
                          }))
                        }
                        onDeleteSaved={async () => {
                          if (!previewTeamAdjustKey) return;
                          const cleared = {
                            ...savedTeamStrip,
                            logoScale: DEFAULT_TEAM_STRIP_ADJUST.logoScale,
                            logoDx: DEFAULT_TEAM_STRIP_ADJUST.logoDx,
                            logoDy: DEFAULT_TEAM_STRIP_ADJUST.logoDy,
                          };
                          await saveAdjust(previewTeamAdjustKey, cleared);
                          setTeamStripDraft(cleared);
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                      Danışman şeridi (mavi banda yapışık)
                      <span className="font-normal text-[var(--z-muted)]">
                        · {previewTeamDef.displayName}
                      </span>
                    </div>
                    <label className="block text-[11px] text-[var(--z-muted)]">
                      Boyut · {activePersonAdjust.scale.toFixed(2)}
                      <input
                        type="range"
                        min={0.55}
                        max={1.85}
                        step={0.01}
                        value={activePersonAdjust.scale}
                        onChange={(e) =>
                          updateActivePerson({
                            scale: clampScale(Number(e.target.value)),
                          })
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Dikey ince ayar · {activePersonAdjust.dy.toFixed(0)}
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        step={1}
                        value={activePersonAdjust.dy}
                        onChange={(e) =>
                          updateActivePerson({ dy: Number(e.target.value) })
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Yatay · {activePersonAdjust.dx.toFixed(0)}
                      <input
                        type="range"
                        min={-200}
                        max={200}
                        step={1}
                        value={activePersonAdjust.dx}
                        onChange={(e) =>
                          updateActivePerson({ dx: Number(e.target.value) })
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Şerit içi kaydırma · {teamStripDraft.peopleOffsetY}
                      <input
                        type="range"
                        min={-200}
                        max={220}
                        step={1}
                        value={teamStripDraft.peopleOffsetY}
                        onChange={(e) =>
                          setTeamStripDraft((d) => ({
                            ...d,
                            peopleOffsetY: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <p className="mt-2 text-[11px] text-[var(--z-muted)]">
                      Ayaklar açık mavi şeride hizalı · sürükleyerek de kaydırabilirsiniz
                    </p>
                    <div className="mt-3">
                      <AdjustSaveActions
                        canSave={canSave}
                        dirty={dirty || teamPeopleOffsetDirty}
                        hasSaved={Boolean(
                          adjustments[previewJob.adjustKey] ||
                            (previewTeamAdjustKey && adjustments[previewTeamAdjustKey])
                        )}
                        onSave={async () => {
                          await saveAdjust(previewJob.adjustKey, draft);
                          if (previewTeamAdjustKey) {
                            await saveAdjust(previewTeamAdjustKey, teamStripDraft);
                          }
                        }}
                        onResetScreen={() => {
                          setDraft(defaultRankAdjust(previewPersonCount));
                          setTeamStripDraft((d) => ({
                            ...d,
                            peopleOffsetY: DEFAULT_TEAM_STRIP_ADJUST.peopleOffsetY,
                          }));
                        }}
                        onDeleteSaved={async () => {
                          await removeAdjust(previewJob.adjustKey);
                          setDraft(defaultRankAdjust(previewPersonCount));
                          if (previewTeamAdjustKey) {
                            const cleared = {
                              ...teamStripDraft,
                              peopleOffsetY: DEFAULT_TEAM_STRIP_ADJUST.peopleOffsetY,
                            };
                            await saveAdjust(previewTeamAdjustKey, cleared);
                            setTeamStripDraft(cleared);
                          }
                        }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
                  <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {previewJob.kind === 'team'
                      ? 'Bu takım logosunun boyutu / yeri'
                      : previewPeople.length > 1
                        ? 'Ortak foto boyutu / yeri'
                        : 'Bu danışmanın foto boyutu / yeri'}
                    <span className="font-normal text-[var(--z-muted)]">
                      ·{' '}
                      {previewJob.kind === 'team'
                        ? previewJob.label
                        : previewPeople[editPersonIndex]?.displayName ||
                          previewJob.label}
                    </span>
                  </div>
                  {previewJob.kind !== 'team' && previewPeople.length > 1 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {previewPeople.map((person, index) => (
                        <button
                          key={person.key}
                          type="button"
                          onClick={() => setEditPersonIndex(index)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                            editPersonIndex === index
                              ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                              : 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                          }`}
                        >
                          {person.displayName.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="block text-[11px] text-[var(--z-muted)]">
                    Ölçek · {activePersonAdjust.scale.toFixed(2)}
                    <input
                      type="range"
                      min={0.55}
                      max={1.85}
                      step={0.01}
                      value={activePersonAdjust.scale}
                      onChange={(e) =>
                        updateActivePerson({ scale: clampScale(Number(e.target.value)) })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  {previewJob.kind !== 'team' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateActivePerson({ flipH: !activePersonAdjust.flipH })
                        }
                        className={`z-btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] ${
                          activePersonAdjust.flipH ? 'text-[var(--z-fg)]' : ''
                        }`}
                      >
                        <FlipHorizontal2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                        Ayna
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-[var(--z-muted)]">
                      Sürükleyerek kaydır · isim yazılmaz, logo isim kutusunda
                    </p>
                  )}
                  <div className="mt-3">
                    <AdjustSaveActions
                      canSave={canSave}
                      dirty={dirty}
                      hasSaved={Boolean(adjustments[previewJob.adjustKey])}
                      onSave={async () => {
                        await saveAdjust(previewJob.adjustKey, draft);
                      }}
                      onResetScreen={() =>
                        setDraft(defaultRankAdjust(previewPersonCount))
                      }
                      onDeleteSaved={async () => {
                        await removeAdjust(previewJob.adjustKey);
                        setDraft(defaultRankAdjust(previewPersonCount));
                      }}
                    />
                  </div>
                </div>
              )}

              {variant === 'v2' ? (
                <>
                  <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                      Logo outer glow (global)
                      <span className="font-normal text-[var(--z-muted)]">
                        · tüm takım logoları
                      </span>
                    </div>
                    <label className="block text-[11px] text-[var(--z-muted)]">
                      Blur · {logoGlowDraft.blur.toFixed(0)}
                      <input
                        type="range"
                        min={0}
                        max={PRESENTATION_SUNUM2_LOGO_BLUR_MAX}
                        step={1}
                        value={logoGlowDraft.blur}
                        onChange={(e) =>
                          setLogoGlowDraft((d) => ({
                            ...d,
                            blur: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Opaklık · {logoGlowDraft.opacity.toFixed(2)}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={logoGlowDraft.opacity}
                        onChange={(e) =>
                          setLogoGlowDraft((d) => ({
                            ...d,
                            opacity: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <div className="mt-3">
                      <AdjustSaveActions
                        canSave={canSave}
                        dirty={logoGlowDirty}
                        hasSaved={Boolean(adjustments[PRESENTATION_SUNUM2_LOGO_GLOW_KEY])}
                        onSave={async () => {
                          await saveAdjust(PRESENTATION_SUNUM2_LOGO_GLOW_KEY, logoGlowDraft);
                        }}
                        onResetScreen={() =>
                          setLogoGlowDraft({ ...DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW })
                        }
                        onDeleteSaved={async () => {
                          await removeAdjust(PRESENTATION_SUNUM2_LOGO_GLOW_KEY);
                          setLogoGlowDraft({ ...DEFAULT_PRESENTATION_SUNUM2_LOGO_GLOW });
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                      Logo drop shadow (global)
                      <span className="font-normal text-[var(--z-muted)]">
                        · tüm takım logoları
                      </span>
                    </div>
                    <label className="block text-[11px] text-[var(--z-muted)]">
                      Blur · {logoShadowDraft.blur.toFixed(0)}
                      <input
                        type="range"
                        min={0}
                        max={PRESENTATION_SUNUM2_LOGO_BLUR_MAX}
                        step={1}
                        value={logoShadowDraft.blur}
                        onChange={(e) =>
                          setLogoShadowDraft((d) => ({
                            ...d,
                            blur: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Opaklık · {logoShadowDraft.opacity.toFixed(2)}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={logoShadowDraft.opacity}
                        onChange={(e) =>
                          setLogoShadowDraft((d) => ({
                            ...d,
                            opacity: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Offset X · {logoShadowDraft.offsetX.toFixed(0)}
                      <input
                        type="range"
                        min={-80}
                        max={80}
                        step={1}
                        value={logoShadowDraft.offsetX}
                        onChange={(e) =>
                          setLogoShadowDraft((d) => ({
                            ...d,
                            offsetX: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      Offset Y · {logoShadowDraft.offsetY.toFixed(0)}
                      <input
                        type="range"
                        min={-80}
                        max={80}
                        step={1}
                        value={logoShadowDraft.offsetY}
                        onChange={(e) =>
                          setLogoShadowDraft((d) => ({
                            ...d,
                            offsetY: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                    <div className="mt-3">
                      <AdjustSaveActions
                        canSave={canSave}
                        dirty={logoShadowDirty}
                        hasSaved={Boolean(
                          adjustments[PRESENTATION_SUNUM2_LOGO_SHADOW_KEY]
                        )}
                        onSave={async () => {
                          await saveAdjust(
                            PRESENTATION_SUNUM2_LOGO_SHADOW_KEY,
                            logoShadowDraft
                          );
                        }}
                        onResetScreen={() =>
                          setLogoShadowDraft({
                            ...DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW,
                          })
                        }
                        onDeleteSaved={async () => {
                          await removeAdjust(PRESENTATION_SUNUM2_LOGO_SHADOW_KEY);
                          setLogoShadowDraft({
                            ...DEFAULT_PRESENTATION_SUNUM2_LOGO_SHADOW,
                          });
                        }}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              <div className="rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--z-fg)]">
                  <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Ünvan yazısı (global)
                  <span className="font-normal text-[var(--z-muted)]">
                    · tüm sunumlar
                  </span>
                </div>
                <label className="block text-[11px] text-[var(--z-muted)]">
                  Punto · {titleDraft.size.toFixed(0)}
                  <input
                    type="range"
                    min={10}
                    max={36}
                    step={1}
                    value={titleDraft.size}
                    onChange={(e) =>
                      setTitleDraft((d) => ({ ...d, size: Number(e.target.value) }))
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                  İsimden uzaklık · {titleDraft.offset.toFixed(0)}
                  <input
                    type="range"
                    min={16}
                    max={120}
                    step={1}
                    value={titleDraft.offset}
                    onChange={(e) =>
                      setTitleDraft((d) => ({ ...d, offset: Number(e.target.value) }))
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                  Expanded (tracking) · {titleDraft.trackingRatio.toFixed(2)}
                  <input
                    type="range"
                    min={0.05}
                    max={0.55}
                    step={0.01}
                    value={titleDraft.trackingRatio}
                    onChange={(e) =>
                      setTitleDraft((d) => ({
                        ...d,
                        trackingRatio: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                  Yatay · {titleDraft.dx.toFixed(0)}
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    step={1}
                    value={titleDraft.dx}
                    onChange={(e) =>
                      setTitleDraft((d) => ({ ...d, dx: Number(e.target.value) }))
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <div className="mt-3">
                  <AdjustSaveActions
                    canSave={canSave}
                    dirty={titleDirty}
                    hasSaved={Boolean(adjustments[PRESENTATION_TITLE_ADJUST_KEY])}
                    onSave={async () => {
                      await saveAdjust(PRESENTATION_TITLE_ADJUST_KEY, titleDraft);
                    }}
                    onResetScreen={() =>
                      setTitleDraft({ ...DEFAULT_PRESENTATION_TITLE_ADJUST })
                    }
                    onDeleteSaved={async () => {
                      await removeAdjust(PRESENTATION_TITLE_ADJUST_KEY);
                      setTitleDraft({ ...DEFAULT_PRESENTATION_TITLE_ADJUST });
                    }}
                  />
                </div>
              </div>

              <PresentationFreeGridControls
                grid={gridDraft}
                visible={gridVisible}
                selected={gridSelected}
                canSave={canSave}
                dirty={gridDirty}
                hasSaved={Boolean(adjustments[PRESENTATION_FREE_GRID_KEY])}
                onVisibleChange={setGridVisible}
                onChange={setGridDraft}
                onSelect={setGridSelected}
                onSave={async () => {
                  await saveAdjust(PRESENTATION_FREE_GRID_KEY, gridDraft);
                }}
                onResetScreen={() => {
                  setGridDraft({
                    ...DEFAULT_PRESENTATION_FREE_GRID,
                    vertical: [],
                    horizontal: [],
                  });
                  setGridSelected(null);
                }}
                onDeleteSaved={async () => {
                  await removeAdjust(PRESENTATION_FREE_GRID_KEY);
                  setGridDraft({
                    ...DEFAULT_PRESENTATION_FREE_GRID,
                    vertical: [],
                    horizontal: [],
                  });
                  setGridSelected(null);
                }}
              />
            </div>
          ) : null}
        </section>

        <section className="rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] p-3 shadow-[var(--z-shadow-soft)] sm:p-4">
          <div className="space-y-2 px-1">
            <p className="text-[12px] text-[var(--z-muted)]">
              {filtered.length} görsel
              {badgeCountFilter !== 'all' ? ` · ${badgeCountLabel(badgeCountFilter)}` : ''}
              {needle ? ' · arama sonucu' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setBadgeCountFilter('all')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  badgeCountFilter === 'all'
                    ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                    : 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                }`}
              >
                Tümü
              </button>
              {badgeCountOptions.map(([count, total]) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setBadgeCountFilter(count)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    badgeCountFilter === count
                      ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                      : 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                  }`}
                >
                  {badgeCountLabel(count)} · {total}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {filtered.map((job) => {
              const active = previewJob?.key === job.key;
              return (
                <li key={job.key}>
                  <div
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
                      active
                        ? 'bg-[color-mix(in_srgb,var(--z-fg)_8%,transparent)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--z-elevated)_70%,transparent)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewKey(job.key)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[13px] font-medium text-[var(--z-fg)]">
                        {job.label}
                      </p>
                      <p className="truncate text-[11px] text-[var(--z-muted)]">{job.detail}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadOne(job)}
                      disabled={downloadingKey === job.key}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--z-muted)] hover:bg-[var(--z-elevated)] hover:text-[var(--z-fg)] disabled:opacity-40"
                      aria-label={`${job.label} indir`}
                    >
                      {downloadingKey === job.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
            {!filtered.length ? (
              <li className="px-2 py-8 text-center text-[13px] text-[var(--z-muted)]">
                Eşleşen sunum yok.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
