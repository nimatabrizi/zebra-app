'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { measureFace } from '../lib/girisVisuals';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import { AdjustSaveActions } from './AdjustSaveControls';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import {
  RANK_CANVAS,
  loadRankImage,
  measureOpaqueBox,
  type RenderPerson,
} from '../lib/rankingVisuals';
import {
  DEFAULT_PERSON_EDGE_CLEAN,
  DEFAULT_PERSON_GLOW,
  DEFAULT_PERSON_INNER_GLOW,
  DEFAULT_PERSON_PERIOD_TINT,
  DEFAULT_TEAM_PERSON_ADJUST,
  DEFAULT_TEAM_STRIP_ADJUST,
  DEFAULT_TEAM_VISUALS_NAMES,
  EDGE_CLEAN_PREVIEW_MAX_SIDE,
  PERSON_GLOW_BLUR_MAX,
  PERSON_INNER_GLOW_BLUR_MAX,
  TEAM_DEFS,
  TEAM_GLOBAL_SHADOW_KEY,
  TEAM_PERSON_EDGE_CLEAN_KEY,
  TEAM_PERSON_GLOW_KEY,
  TEAM_PERSON_INNER_GLOW_KEY,
  TEAM_PERSON_PERIOD_TINT_KEY,
  TEAM_PERSON_SHADOW_KEY,
  TEAM_STRIP_EXPORT_SCALE,
  TEAM_VISUALS_NAMES_KEY,
  canvasToBlob,
  matchTeamDef,
  normalizeOuterGlow,
  normalizePersonEdgeClean,
  normalizePersonPeriodTint,
  normalizeTeamPersonAdjust,
  normalizeTeamRoster,
  normalizeTeamStripAdjust,
  normalizeTeamVisualsNames,
  orderTeamMembers,
  personAdjustKey,
  renderTeamStrip,
  teamAdjustKey,
  teamFileSlug,
  teamRosterKey,
  type OuterGlowAdjust,
  type PersonEdgeCleanAdjust,
  type PersonPeriodTintAdjust,
  type TeamDef,
  type TeamMemberInput,
  type TeamPersonAdjust,
  type TeamStripAdjust,
  type TeamVisualsNamesAdjust,
} from '../lib/rankingTeamVisuals';

type CatalogPerson = TeamMemberInput & { takim: string };

type TeamRow = {
  def: TeamDef;
  members: TeamMemberInput[];
};

type DraftState = {
  team: TeamStripAdjust;
  people: TeamPersonAdjust[];
  personGlow: OuterGlowAdjust;
  personInnerGlow: OuterGlowAdjust;
  personEdgeClean: PersonEdgeCleanAdjust;
  personPeriodTint: PersonPeriodTintAdjust;
};

const ADJUST_STORAGE_KEY = 'zebra-siralama-photo-adjust-v2';
const OFFSET_LIMIT = 400;
/** Şeffaf team strip için sabit dönem (tint kapalı kalır) */
const STRIP_PERIOD = '2026-q3' as const;

function clampOffset(v: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(v)));
}

function clampScale(v: number) {
  return Math.min(1.85, Math.max(0.55, v));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function buildDraft(
  members: TeamMemberInput[],
  saved: Record<string, unknown>,
  teamId: string
): DraftState {
  const legacyGlobal = saved[TEAM_GLOBAL_SHADOW_KEY];
  return {
    team: normalizeTeamStripAdjust(saved[teamAdjustKey(teamId)]),
    people: members.map((m) => normalizeTeamPersonAdjust(saved[personAdjustKey(m.key)])),
    personGlow: {
      ...normalizeOuterGlow(
        saved[TEAM_PERSON_GLOW_KEY] ?? saved[TEAM_PERSON_SHADOW_KEY] ?? legacyGlobal,
        DEFAULT_PERSON_GLOW,
        PERSON_GLOW_BLUR_MAX
      ),
      color: '#000000',
    },
    personInnerGlow: {
      ...normalizeOuterGlow(
        saved[TEAM_PERSON_INNER_GLOW_KEY],
        DEFAULT_PERSON_INNER_GLOW,
        PERSON_INNER_GLOW_BLUR_MAX
      ),
      color: '#000000',
    },
    personEdgeClean: normalizePersonEdgeClean(saved[TEAM_PERSON_EDGE_CLEAN_KEY]),
    personPeriodTint: {
      ...normalizePersonPeriodTint(saved[TEAM_PERSON_PERIOD_TINT_KEY]),
      enabled: false,
    },
  };
}

async function toRenderPeople(people: TeamMemberInput[]): Promise<RenderPerson[]> {
  return Promise.all(
    people.map(async (person) => {
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
    })
  );
}

function applyRoster(
  def: TeamDef,
  catalog: CatalogPerson[],
  savedRoster: string[] | null
): TeamMemberInput[] {
  const byKey = new Map(catalog.map((p) => [p.key, p]));
  if (savedRoster?.length) {
    const out: TeamMemberInput[] = [];
    for (const key of savedRoster) {
      const hit = byKey.get(key);
      if (!hit) continue;
      out.push({
        key: hit.key,
        displayName: hit.displayName,
        title: hit.title,
        photoUrl: hit.photoUrl,
      });
    }
    return out;
  }
  const teamMembers = catalog.filter((p) => matchTeamDef(p.takim)?.id === def.id);
  return orderTeamMembers(
    teamMembers.map((m) => ({
      key: m.key,
      displayName: m.displayName,
      title: m.title,
      photoUrl: m.photoUrl,
    })),
    def
  );
}

export default function TeamVisualsStudio({
  isActive = true,
  canSave = false,
}: {
  isActive?: boolean;
  canSave?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogPerson[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    team: { ...DEFAULT_TEAM_STRIP_ADJUST },
    people: [],
    personGlow: { ...DEFAULT_PERSON_GLOW },
    personInnerGlow: { ...DEFAULT_PERSON_INNER_GLOW },
    personEdgeClean: { ...DEFAULT_PERSON_EDGE_CLEAN },
    personPeriodTint: { ...DEFAULT_PERSON_PERIOD_TINT, enabled: false },
  });
  const [editPersonIndex, setEditPersonIndex] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingLogo, setDownloadingLogo] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [rosterDirty, setRosterDirty] = useState(false);
  const [namesDraft, setNamesDraft] = useState<TeamVisualsNamesAdjust>({
    ...DEFAULT_TEAM_VISUALS_NAMES,
  });

  const {
    saved: adjustments,
    ready: adjustmentsReady,
    save: saveAdjust,
    remove: removeAdjust,
  } = useSavedAdjustments<
    | TeamPersonAdjust
    | TeamStripAdjust
    | OuterGlowAdjust
    | PersonEdgeCleanAdjust
    | PersonPeriodTintAdjust
    | TeamVisualsNamesAdjust
    | string[]
  >('siralama', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(draft);
  const namesDraftRef = useRef(namesDraft);
  const selectedRef = useRef<TeamRow | null>(null);
  const editPersonIndexRef = useRef(editPersonIndex);
  const paintState = useRef({ busy: false, pending: false });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    personIndex: number;
    origin: TeamPersonAdjust;
  } | null>(null);

  draftRef.current = draft;
  namesDraftRef.current = namesDraft;
  editPersonIndexRef.current = editPersonIndex;

  const selected = useMemo(
    () => teams.find((t) => t.def.id === selectedId) || null,
    [teams, selectedId]
  );
  selectedRef.current = selected;

  const rebuildTeams = useCallback(
    (cat: CatalogPerson[], saved: Record<string, unknown>) => {
      const built: TeamRow[] = [];
      for (const def of TEAM_DEFS) {
        const roster = normalizeTeamRoster(saved[teamRosterKey(def.id)]);
        const members = applyRoster(def, cat, roster.length ? roster : null);
        built.push({ def, members });
      }
      setTeams(built);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: profiles }, { data: files }] = await Promise.all([
        supabase.from('profiles').select('tam_isim, unvan, takim_ekip'),
        supabase.storage.from('consultant-photos').list('', { limit: 1000 }),
      ]);
      if (cancelled) return;
      const slugs = (files || [])
        .map((f) => f.name.replace(/\.png$/i, ''))
        .filter(Boolean);
      const rows: CatalogPerson[] = (profiles || [])
        .map((p) => {
          const name = String(p.tam_isim || '').normalize('NFC').trim();
          if (!name) return null;
          const key = toConsultantPhotoSlug(name);
          if (!key) return null;
          return {
            key,
            displayName: toStudioDisplayName(name),
            title: resolveConsultantTitle(name, p.unvan),
            photoUrl: resolveConsultantPhotoUrl(toStudioDisplayName(name), slugs),
            takim: String(p.takim_ekip || '').normalize('NFC').trim(),
          };
        })
        .filter(Boolean) as CatalogPerson[];
      setCatalog(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !adjustmentsReady) return;
    rebuildTeams(catalog, adjustments as Record<string, unknown>);
  }, [loading, adjustmentsReady, catalog, adjustments, rebuildTeams]);

  useEffect(() => {
    if (!selectedId && teams.length) {
      const expertiz = teams.find((t) => t.def.id === 'expertiz');
      setSelectedId(expertiz?.def.id || teams[0]!.def.id);
    }
  }, [teams, selectedId]);

  useEffect(() => {
    if (!selected || !adjustmentsReady) return;
    setPreviewReady(false);
    setEditPersonIndex(0);
    setRosterDirty(false);
    setDraft(buildDraft(selected.members, adjustments as Record<string, unknown>, selected.def.id));
  }, [selected?.def.id, selected?.members.map((m) => m.key).join(','), adjustmentsReady]);

  useEffect(() => {
    if (!adjustmentsReady) return;
    setNamesDraft(
      normalizeTeamVisualsNames(
        (adjustments as Record<string, unknown>)[TEAM_VISUALS_NAMES_KEY]
      )
    );
  }, [adjustmentsReady, adjustments]);

  const savedDraft = selected
    ? buildDraft(selected.members, adjustments as Record<string, unknown>, selected.def.id)
    : null;
  const savedNames = normalizeTeamVisualsNames(
    (adjustments as Record<string, unknown>)[TEAM_VISUALS_NAMES_KEY]
  );
  const namesDirty =
    namesDraft.showNames !== savedNames.showNames ||
    namesDraft.nameLineGap !== savedNames.nameLineGap ||
    namesDraft.showPeople !== savedNames.showPeople ||
    namesDraft.showGradient !== savedNames.showGradient ||
    namesDraft.gradientHeight !== savedNames.gradientHeight ||
    namesDraft.gradientOpacity !== savedNames.gradientOpacity;

  const dirty = Boolean(
    canSave &&
      selected &&
      savedDraft &&
      (!sameAdjust(draft.team, savedDraft.team) ||
        draft.people.some((p, i) => !sameAdjust(p, savedDraft.people[i] || DEFAULT_TEAM_PERSON_ADJUST)) ||
        !sameAdjust(draft.personGlow, savedDraft.personGlow) ||
        !sameAdjust(draft.personInnerGlow, savedDraft.personInnerGlow) ||
        rosterDirty ||
        namesDirty)
  );

  const paintPreview = useCallback(async () => {
    const row = selectedRef.current;
    if (!row?.members.length) return;
    const state = paintState.current;
    if (state.busy) {
      state.pending = true;
      return;
    }
    state.busy = true;
    try {
      const names = namesDraftRef.current;
      const canvas = await renderTeamStrip({
        periodId: STRIP_PERIOD,
        people: await toRenderPeople(row.members),
        personAdjusts: draftRef.current.people,
        teamAdjust: {
          ...draftRef.current.team,
          nameLineGap: names.nameLineGap,
          bottomGradientHeight: names.gradientHeight,
          bottomGradientOpacity: names.gradientOpacity,
        },
        personGlow: draftRef.current.personGlow,
        personInnerGlow: draftRef.current.personInnerGlow,
        personEdgeClean: draftRef.current.personEdgeClean,
        personPeriodTint: draftRef.current.personPeriodTint,
        logoGlow: { ...DEFAULT_PERSON_GLOW, blur: 0, opacity: 0 },
        logoUrl: null,
        grayscale: true,
        skipBackground: true,
        skipLogo: true,
        skipNames: !names.showNames,
        skipPeople: !names.showPeople,
        skipBottomGradient: !names.showGradient,
        edgeCleanMaxSide: EDGE_CLEAN_PREVIEW_MAX_SIDE,
        renderScale: 1,
      });
      const target = previewCanvasRef.current;
      if (target && selectedRef.current?.def.id === row.def.id) {
        const ctx = target.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(canvas, 0, 0, target.width, target.height);
          setPreviewReady(true);
        }
      }
    } catch {
      /* önizleme */
    } finally {
      state.busy = false;
      if (state.pending) {
        state.pending = false;
        void paintPreview();
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive || !selected) return;
    void paintPreview();
  }, [isActive, selected, draft, namesDraft, paintPreview]);

  const activePerson =
    draft.people[editPersonIndex] || draft.people[0] || DEFAULT_TEAM_PERSON_ADJUST;

  const updateActivePerson = useCallback((patch: Partial<TeamPersonAdjust>) => {
    const idx = editPersonIndexRef.current;
    setDraft((current) => ({
      ...current,
      people: current.people.map((entry, i) =>
        i === idx ? { ...entry, ...patch } : entry
      ),
    }));
  }, []);

  const updateMembers = useCallback(
    (nextMembers: TeamMemberInput[]) => {
      if (!selected) return;
      setTeams((rows) =>
        rows.map((r) =>
          r.def.id === selected.def.id ? { ...r, members: nextMembers } : r
        )
      );
      setDraft((d) => ({
        ...d,
        people: nextMembers.map((m, i) => {
          const prevIdx = selected.members.findIndex((x) => x.key === m.key);
          if (prevIdx >= 0 && d.people[prevIdx]) return d.people[prevIdx]!;
          return (
            normalizeTeamPersonAdjust(
              (adjustments as Record<string, unknown>)[personAdjustKey(m.key)]
            ) || { ...DEFAULT_TEAM_PERSON_ADJUST }
          );
        }),
      }));
      setEditPersonIndex(0);
      setRosterDirty(true);
      setPreviewReady(false);
    },
    [selected, adjustments]
  );

  const moveMember = (index: number, dir: -1 | 1) => {
    if (!selected) return;
    const next = [...selected.members];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    updateMembers(next);
  };

  const removeMember = (index: number) => {
    if (!selected) return;
    updateMembers(selected.members.filter((_, i) => i !== index));
  };

  const addMember = (person: CatalogPerson) => {
    if (!selected) return;
    if (selected.members.some((m) => m.key === person.key)) return;
    updateMembers([
      ...selected.members,
      {
        key: person.key,
        displayName: person.displayName,
        title: person.title,
        photoUrl: person.photoUrl,
      },
    ]);
    setAddQuery('');
  };

  const addCandidates = useMemo(() => {
    if (!selected) return [];
    const taken = new Set(selected.members.map((m) => m.key));
    const needle = addQuery.trim().toLocaleLowerCase('tr-TR');
    return catalog
      .filter((p) => !taken.has(p.key))
      .filter((p) =>
        !needle
          ? true
          : p.displayName.toLocaleLowerCase('tr-TR').includes(needle) ||
            p.takim.toLocaleLowerCase('tr-TR').includes(needle)
      )
      .slice(0, 12);
  }, [catalog, selected, addQuery]);

  const saveAll = async () => {
    if (!selected || !canSave) return;
    await saveAdjust(teamAdjustKey(selected.def.id), draft.team);
    await saveAdjust(TEAM_PERSON_GLOW_KEY, { ...draft.personGlow, color: '#000000' });
    await saveAdjust(TEAM_PERSON_INNER_GLOW_KEY, {
      ...draft.personInnerGlow,
      color: '#000000',
    });
    await saveAdjust(TEAM_PERSON_EDGE_CLEAN_KEY, draft.personEdgeClean);
    for (let i = 0; i < selected.members.length; i += 1) {
      const m = selected.members[i]!;
      await saveAdjust(personAdjustKey(m.key), draft.people[i] || DEFAULT_TEAM_PERSON_ADJUST);
    }
    await saveAdjust(
      teamRosterKey(selected.def.id),
      selected.members.map((m) => m.key)
    );
    await saveAdjust(TEAM_VISUALS_NAMES_KEY, namesDraft);
    setRosterDirty(false);
  };

  const downloadPng = async () => {
    if (!selected?.members.length) return;
    setDownloading(true);
    try {
      const canvas = await renderTeamStrip({
        periodId: STRIP_PERIOD,
        people: await toRenderPeople(selected.members),
        personAdjusts: draft.people,
        teamAdjust: {
          ...draft.team,
          nameLineGap: namesDraft.nameLineGap,
          bottomGradientHeight: namesDraft.gradientHeight,
          bottomGradientOpacity: namesDraft.gradientOpacity,
        },
        personGlow: draft.personGlow,
        personInnerGlow: draft.personInnerGlow,
        personEdgeClean: draft.personEdgeClean,
        personPeriodTint: draft.personPeriodTint,
        logoGlow: { ...DEFAULT_PERSON_GLOW, blur: 0, opacity: 0 },
        logoUrl: null,
        grayscale: true,
        skipBackground: true,
        skipLogo: true,
        skipNames: !namesDraft.showNames,
        skipPeople: !namesDraft.showPeople,
        skipBottomGradient: !namesDraft.showGradient,
        renderScale: TEAM_STRIP_EXPORT_SCALE,
      });
      downloadBlob(
        await canvasToBlob(canvas),
        `team-${teamFileSlug(selected.def.displayName)}.png`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'PNG oluşturulamadı');
    } finally {
      setDownloading(false);
    }
  };

  const downloadLogo = async () => {
    if (!selected?.def.logoUrl) return;
    setDownloadingLogo(true);
    try {
      const res = await fetch(selected.def.logoUrl);
      if (!res.ok) throw new Error('Logo yüklenemedi');
      const blob = await res.blob();
      downloadBlob(blob, `team-logo-${teamFileSlug(selected.def.displayName)}.png`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Logo indirilemedi');
    } finally {
      setDownloadingLogo(false);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selected?.members.length) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const idx = Math.min(editPersonIndex, selected.members.length - 1);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      personIndex: idx,
      origin: { ...(draft.people[idx] || DEFAULT_TEAM_PERSON_ADJUST) },
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = previewCanvasRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    const scaleX = RANK_CANVAS.width / canvas.clientWidth;
    const scaleY = RANK_CANVAS.height / canvas.clientHeight;
    const dx = clampOffset(drag.origin.dx + (event.clientX - drag.startX) * scaleX);
    const dy = clampOffset(drag.origin.dy + (event.clientY - drag.startY) * scaleY);
    setDraft((current) => ({
      ...current,
      people: current.people.map((entry, i) =>
        i === drag.personIndex ? { ...entry, dx, dy } : entry
      ),
    }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  if (!isActive) return null;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--z-muted)]">
          Zebra Studio · Kurumsal
        </p>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
          Team Görselleri
        </h1>
        <p className="max-w-2xl text-[13px] text-[var(--z-muted)]">
          Takım üyelerini düzenle, yüz hizasını kaydet. Çıktı: şeffaf PNG (yan yana
          danışmanlar + ayırıcı çizgiler).
        </p>
      </header>

      {loading || !adjustmentsReady ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--z-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Takımlar yükleniyor…
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-1 rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] p-3 shadow-[var(--z-shadow-soft)]">
            {teams.map((row) => (
              <button
                key={row.def.id}
                type="button"
                onClick={() => setSelectedId(row.def.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${
                  selectedId === row.def.id
                    ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                    : 'text-[var(--z-muted)] hover:bg-[color-mix(in_srgb,var(--z-elevated)_70%,transparent)] hover:text-[var(--z-fg)]'
                }`}
              >
                <span className="truncate font-medium">{row.def.displayName}</span>
                <span className="tabular-nums opacity-70">{row.members.length}</span>
              </button>
            ))}
          </aside>

          {!selected ? (
            <div className="rounded-[22px] border border-dashed border-[var(--z-border-strong)] px-6 py-16 text-center text-[13px] text-[var(--z-muted)]">
              <Users className="mx-auto h-8 w-8 opacity-50" strokeWidth={1.5} />
              <p className="mt-3">Takım seçin</p>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="overflow-hidden rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] shadow-[var(--z-shadow-soft)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--z-border)] px-4 py-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--z-fg)]">
                      {selected.def.displayName}
                    </p>
                    <p className="text-[12px] text-[var(--z-muted)]">
                      {selected.members.length} danışman · şeffaf zemin
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!selected.def.logoUrl || downloadingLogo}
                      onClick={() => void downloadLogo()}
                      className="z-btn-ghost inline-flex items-center gap-2 px-3.5 py-2 text-[12px] disabled:opacity-40"
                    >
                      {downloadingLogo ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                      )}
                      Logo indir
                    </button>
                    <button
                      type="button"
                      disabled={!selected.members.length || downloading}
                      onClick={() => void downloadPng()}
                      className="z-btn-primary inline-flex items-center gap-2 px-3.5 py-2 text-[12px] disabled:opacity-40"
                    >
                      {downloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                      )}
                      PNG indir (3×)
                    </button>
                  </div>
                </div>
                <div className="relative aspect-[1080/1350] max-h-[70vh] w-full bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1a1a1a_0%_50%)] bg-[length:16px_16px]">
                  {!previewReady ? (
                    <div className="absolute inset-0 z-[1] flex items-center justify-center gap-2 text-[13px] text-white/60">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Hazırlanıyor…
                    </div>
                  ) : null}
                  <canvas
                    ref={previewCanvasRef}
                    width={RANK_CANVAS.width}
                    height={RANK_CANVAS.height}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    className={`h-full w-full cursor-grab object-contain active:cursor-grabbing ${
                      previewReady ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] p-4 shadow-[var(--z-shadow-soft)]">
                  <p className="text-[12px] font-medium text-[var(--z-fg)]">Üyeler</p>
                  <ul className="mt-3 space-y-1.5">
                    {selected.members.map((m, index) => (
                      <li
                        key={m.key}
                        className={`flex items-center gap-1 rounded-xl px-2 py-1.5 ${
                          editPersonIndex === index
                            ? 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)]'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setEditPersonIndex(index)}
                          className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--z-fg)]"
                        >
                          {m.displayName}
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--z-muted)] hover:text-[var(--z-fg)]"
                          onClick={() => moveMember(index, -1)}
                          aria-label="Yukarı"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--z-muted)] hover:text-[var(--z-fg)]"
                          onClick={() => moveMember(index, 1)}
                          aria-label="Aşağı"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--z-muted)] hover:text-rose-400"
                          onClick={() => removeMember(index)}
                          aria-label="Çıkar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 border-t border-[var(--z-border)] pt-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--z-muted)]" />
                      <input
                        value={addQuery}
                        onChange={(e) => setAddQuery(e.target.value)}
                        placeholder="Danışman ekle…"
                        className="w-full rounded-xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)] py-2 pl-9 pr-3 text-[12px] text-[var(--z-fg)] outline-none"
                      />
                    </div>
                    {addQuery.trim() ? (
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                        {addCandidates.map((p) => (
                          <li key={p.key}>
                            <button
                              type="button"
                              onClick={() => addMember(p)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-[var(--z-muted)] hover:bg-[color-mix(in_srgb,var(--z-elevated)_70%,transparent)] hover:text-[var(--z-fg)]"
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{p.displayName}</span>
                            </button>
                          </li>
                        ))}
                        {!addCandidates.length ? (
                          <li className="px-2 py-1 text-[11px] text-[var(--z-muted)]">
                            Sonuç yok
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] p-4 shadow-[var(--z-shadow-soft)]">
                  <p className="text-[12px] font-medium text-[var(--z-fg)]">
                    Yüz / konum
                    {selected.members[editPersonIndex] ? (
                      <span className="font-normal text-[var(--z-muted)]">
                        {' '}
                        · {selected.members[editPersonIndex]!.displayName}
                      </span>
                    ) : null}
                  </p>
                  {selected.members.length > 1 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.members.map((m, index) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setEditPersonIndex(index)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            editPersonIndex === index
                              ? 'bg-[var(--z-fg)] text-[var(--z-bg)]'
                              : 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-muted)]'
                          }`}
                        >
                          {m.displayName.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="mt-3 block text-[11px] text-[var(--z-muted)]">
                    Ölçek · {activePerson.scale.toFixed(2)}
                    <input
                      type="range"
                      min={0.55}
                      max={1.85}
                      step={0.01}
                      value={activePerson.scale}
                      onChange={(e) =>
                        updateActivePerson({ scale: clampScale(Number(e.target.value)) })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                    X · {activePerson.dx}
                    <input
                      type="range"
                      min={-OFFSET_LIMIT}
                      max={OFFSET_LIMIT}
                      step={1}
                      value={activePerson.dx}
                      onChange={(e) =>
                        updateActivePerson({ dx: clampOffset(Number(e.target.value)) })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                    Y · {activePerson.dy}
                    <input
                      type="range"
                      min={-OFFSET_LIMIT}
                      max={OFFSET_LIMIT}
                      step={1}
                      value={activePerson.dy}
                      onChange={(e) =>
                        updateActivePerson({ dy: clampOffset(Number(e.target.value)) })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateActivePerson({ flipH: !activePerson.flipH })}
                    className={`z-btn-ghost mt-2 px-2.5 py-1.5 text-[11px] ${
                      activePerson.flipH ? 'text-[var(--z-fg)]' : ''
                    }`}
                  >
                    Ayna
                  </button>

                  <p className="mt-5 text-[12px] font-medium text-[var(--z-fg)]">
                    Görüntü
                    <span className="font-normal text-[var(--z-muted)]">
                      {' '}
                      · tüm takımlar
                    </span>
                  </p>
                  <label className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[var(--z-fg)]">
                    <span>Görselleri göster</span>
                    <input
                      type="checkbox"
                      checked={namesDraft.showPeople}
                      onChange={(e) =>
                        setNamesDraft((d) => ({
                          ...d,
                          showPeople: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[var(--z-fg)]"
                    />
                  </label>
                  <label className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[var(--z-fg)]">
                    <span>İsimleri göster</span>
                    <input
                      type="checkbox"
                      checked={namesDraft.showNames}
                      onChange={(e) =>
                        setNamesDraft((d) => ({
                          ...d,
                          showNames: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[var(--z-fg)]"
                    />
                  </label>
                  {namesDraft.showNames ? (
                    <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                      İsim–soyisim aralığı · {namesDraft.nameLineGap}px
                      <input
                        type="range"
                        min={10}
                        max={56}
                        step={1}
                        value={namesDraft.nameLineGap}
                        onChange={(e) =>
                          setNamesDraft((d) => ({
                            ...d,
                            nameLineGap: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full"
                      />
                    </label>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[var(--z-muted)]">
                    İsim üstte, soyisim altta · çizgiler arası ortalı
                  </p>
                  <label className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[var(--z-fg)]">
                    <span>Alt gradient</span>
                    <input
                      type="checkbox"
                      checked={namesDraft.showGradient}
                      onChange={(e) =>
                        setNamesDraft((d) => ({
                          ...d,
                          showGradient: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[var(--z-fg)]"
                    />
                  </label>
                  {namesDraft.showGradient ? (
                    <>
                      <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                        Yükseklik · {namesDraft.gradientHeight}px
                        <input
                          type="range"
                          min={20}
                          max={500}
                          step={4}
                          value={namesDraft.gradientHeight}
                          onChange={(e) =>
                            setNamesDraft((d) => ({
                              ...d,
                              gradientHeight: Number(e.target.value),
                            }))
                          }
                          className="mt-1 w-full"
                        />
                      </label>
                      <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                        Şiddet · {Math.round(namesDraft.gradientOpacity * 100)}%
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(namesDraft.gradientOpacity * 100)}
                          onChange={(e) =>
                            setNamesDraft((d) => ({
                              ...d,
                              gradientOpacity: Number(e.target.value) / 100,
                            }))
                          }
                          className="mt-1 w-full"
                        />
                      </label>
                    </>
                  ) : null}

                  <p className="mt-5 text-[12px] font-medium text-[var(--z-fg)]">
                    Ayırıcı çizgi
                  </p>
                  <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                    Kalınlık · {draft.team.strokeWidth.toFixed(1)}
                    <input
                      type="range"
                      min={0.5}
                      max={8}
                      step={0.1}
                      value={draft.team.strokeWidth}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          team: { ...d.team, strokeWidth: Number(e.target.value) },
                        }))
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                    Yükseklik · {draft.team.lineHeight}
                    <input
                      type="range"
                      min={80}
                      max={700}
                      step={4}
                      value={draft.team.lineHeight}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          team: { ...d.team, lineHeight: Number(e.target.value) },
                        }))
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="mt-2 block text-[11px] text-[var(--z-muted)]">
                    Tüm danışmanlar Y · {draft.team.peopleOffsetY}
                    <input
                      type="range"
                      min={-200}
                      max={220}
                      step={1}
                      value={draft.team.peopleOffsetY}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          team: { ...d.team, peopleOffsetY: Number(e.target.value) },
                        }))
                      }
                      className="mt-1 w-full"
                    />
                  </label>

                  <div className="mt-4">
                    <AdjustSaveActions
                      canSave={canSave}
                      dirty={dirty}
                      hasSaved={Boolean(
                        adjustments[teamAdjustKey(selected.def.id)] ||
                          adjustments[teamRosterKey(selected.def.id)] ||
                          adjustments[TEAM_VISUALS_NAMES_KEY]
                      )}
                      onSave={async () => {
                        await saveAll();
                      }}
                      onResetScreen={() => {
                        if (!selected) return;
                        setDraft(
                          buildDraft(
                            selected.members,
                            adjustments as Record<string, unknown>,
                            selected.def.id
                          )
                        );
                        setNamesDraft(savedNames);
                        setRosterDirty(false);
                      }}
                      onDeleteSaved={async () => {
                        if (!selected) return;
                        await removeAdjust(teamAdjustKey(selected.def.id));
                        await removeAdjust(teamRosterKey(selected.def.id));
                        await removeAdjust(TEAM_VISUALS_NAMES_KEY);
                        setDraft(
                          buildDraft(selected.members, {}, selected.def.id)
                        );
                        setNamesDraft({ ...DEFAULT_TEAM_VISUALS_NAMES });
                        setRosterDirty(false);
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--z-muted)]">
                    Sürükleyerek kaydır · kayıt Sıralama / Sunum 3 ile ortak
                  </p>
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
