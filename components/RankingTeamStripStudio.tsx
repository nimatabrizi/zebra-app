'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Users, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { measureFace } from '../lib/girisVisuals';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug } from '../lib/formatName';
import { AdjustSaveActions, useUnsavedChangesGuard } from './AdjustSaveControls';
import { AlignGridControls, AlignGridOverlay } from './RankingAlignGrid';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import {
  DEFAULT_ALIGN_GRID,
  alignGridKey,
  normalizeAlignGrid,
  sameAlignGrid,
  type AlignGrid,
} from '../lib/rankingAlignGrid';
import {
  RANK_CANVAS,
  RANK_PERIODS,
  RANK_PERIOD_DOT_COLOR,
  loadRankImage,
  measureOpaqueBox,
  type RankPeriodId,
  type RenderPerson,
} from '../lib/rankingVisuals';
import {
  DEFAULT_LOGO_GLOW,
  DEFAULT_PERSON_EDGE_CLEAN,
  DEFAULT_PERSON_GLOW,
  DEFAULT_PERSON_INNER_GLOW,
  DEFAULT_PERSON_PERIOD_TINT,
  DEFAULT_TEAM_PERSON_ADJUST,
  DEFAULT_TEAM_STRIP_ADJUST,
  EDGE_CLEAN_PREVIEW_MAX_SIDE,
  LOGO_GLOW_BLUR_MAX,
  PERSON_EDGE_CHOKE_MAX,
  TEAM_STRIP_EXPORT_SCALE,
  PERSON_GLOW_BLUR_MAX,
  PERSON_INNER_GLOW_BLUR_MAX,
  TEAM_DEFS,
  TEAM_GLOBAL_SHADOW_KEY,
  TEAM_LOGO_GLOW_KEY,
  TEAM_LOGO_SHADOW_KEY,
  TEAM_PERSON_EDGE_CLEAN_KEY,
  TEAM_PERSON_GLOW_KEY,
  TEAM_PERSON_INNER_GLOW_KEY,
  TEAM_PERSON_PERIOD_TINT_KEY,
  TEAM_PERSON_SHADOW_KEY,
  awardPeriodsWithTemplate,
  canvasToBlob,
  matchTeamDef,
  normalizeOuterGlow,
  normalizePersonEdgeClean,
  normalizePersonPeriodTint,
  normalizeTeamPersonAdjust,
  normalizeTeamStripAdjust,
  orderTeamMembers,
  personAdjustKey,
  renderTeamStrip,
  teamAdjustKey,
  teamFileSlug,
  type OuterGlowAdjust,
  type PersonEdgeCleanAdjust,
  type PersonPeriodTintAdjust,
  type TeamDef,
  type TeamMemberInput,
  type TeamPersonAdjust,
  type TeamStripAdjust,
} from '../lib/rankingTeamVisuals';

type ProfileRow = {
  key: string;
  displayName: string;
  title: string;
  takim: string;
};

type TeamRow = {
  def: TeamDef;
  members: TeamMemberInput[];
};

const ADJUST_STORAGE_KEY = 'zebra-siralama-photo-adjust-v2';
const OFFSET_LIMIT = 400;

function clampOffset(v: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(v)));
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

function personShort(name: string) {
  return name.split(/\s+/)[0] || name;
}

type DraftState = {
  team: TeamStripAdjust;
  people: TeamPersonAdjust[];
  personGlow: OuterGlowAdjust;
  personInnerGlow: OuterGlowAdjust;
  personEdgeClean: PersonEdgeCleanAdjust;
  personPeriodTint: PersonPeriodTintAdjust;
  logoGlow: OuterGlowAdjust;
};

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
    personPeriodTint: normalizePersonPeriodTint(saved[TEAM_PERSON_PERIOD_TINT_KEY]),
    logoGlow: normalizeOuterGlow(
      saved[TEAM_LOGO_GLOW_KEY] ?? saved[TEAM_LOGO_SHADOW_KEY] ?? legacyGlobal,
      DEFAULT_LOGO_GLOW,
      LOGO_GLOW_BLUR_MAX
    ),
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

function GlowControls({
  title,
  value,
  onChange,
  blurMax = 100,
  lockBlack = false,
}: {
  title: string;
  value: OuterGlowAdjust;
  onChange: (patch: Partial<OuterGlowAdjust>) => void;
  blurMax?: number;
  /** Danışman glow: renk sabit siyah */
  lockBlack?: boolean;
}) {
  return (
    <div className="mt-6 border-t border-[var(--z-border)] pt-5">
      <p className="text-[12px] font-medium text-[var(--z-fg)]">{title}</p>
      {lockBlack ? (
        <p className="mt-1 text-[11px] text-[var(--z-muted)]">
          Siyah · tüm takım görsellerindeki tüm danışmanlara ortak
        </p>
      ) : null}
      <label className="mt-3 block">
        <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
          <span>Blur</span>
          <span className="tabular-nums text-[var(--z-fg)]">{value.blur}px</span>
        </span>
        <input
          type="range"
          min={0}
          max={blurMax}
          step={1}
          value={Math.min(value.blur, blurMax)}
          onChange={(e) => onChange({ blur: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--z-fg)]"
        />
      </label>
      <label className="mt-4 block">
        <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
          <span>Opaklık</span>
          <span className="tabular-nums text-[var(--z-fg)]">
            %{Math.round(value.opacity * 100)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--z-fg)]"
        />
      </label>
      {lockBlack ? null : (
        <label className="mt-4 block">
          <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
            <span>Renk</span>
            <span className="tabular-nums text-[var(--z-fg)]">{value.color}</span>
          </span>
          <input
            type="color"
            value={value.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="mt-2 h-9 w-full cursor-pointer rounded border border-[var(--z-border)] bg-transparent"
          />
        </label>
      )}
    </div>
  );
}

export type TeamStripEmbed = {
  periodId: RankPeriodId;
  teamId: string;
  onClose: () => void;
};

export default function RankingTeamStripStudio({
  canSave = false,
  embed = null,
}: {
  canSave?: boolean;
  /** Dönem içinden: liste yok, dönem sabit, bu takımın editörü açılır */
  embed?: TeamStripEmbed | null;
}) {
  const awardPeriods = useMemo(() => awardPeriodsWithTemplate(), []);
  const [periodId, setPeriodId] = useState<RankPeriodId>(
    embed?.periodId || awardPeriods[0] || '2026-05'
  );
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const { saved: adjustments, save: saveAdjust, remove: removeAdjust } = useSavedAdjustments<
    | TeamPersonAdjust
    | TeamStripAdjust
    | OuterGlowAdjust
    | PersonEdgeCleanAdjust
    | PersonPeriodTintAdjust
    | AlignGrid
  >('siralama', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });

  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    team: { ...DEFAULT_TEAM_STRIP_ADJUST },
    people: [],
    personGlow: { ...DEFAULT_PERSON_GLOW },
    personInnerGlow: { ...DEFAULT_PERSON_INNER_GLOW },
    personEdgeClean: { ...DEFAULT_PERSON_EDGE_CLEAN },
    personPeriodTint: { ...DEFAULT_PERSON_PERIOD_TINT },
    logoGlow: { ...DEFAULT_LOGO_GLOW },
  });
  const [editPersonIndex, setEditPersonIndex] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const TEAM_GRID_KIND = 'award-team' as const;
  const teamGridKey = alignGridKey(TEAM_GRID_KIND);
  const [gridDraft, setGridDraft] = useState<AlignGrid>({ ...DEFAULT_ALIGN_GRID });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(draft);
  const editingRef = useRef(editing);
  const periodRef = useRef(periodId);
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
  editingRef.current = editing;
  periodRef.current = periodId;
  editPersonIndexRef.current = editPersonIndex;

  useEffect(() => {
    if (embed?.periodId) setPeriodId(embed.periodId);
  }, [embed?.periodId]);

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

      const rows: ProfileRow[] = (profiles || [])
        .map((p) => {
          const name = String(p.tam_isim || '').normalize('NFC').trim();
          if (!name || !p.takim_ekip) return null;
          const key = toConsultantPhotoSlug(name);
          if (!key) return null;
          return {
            key,
            displayName: toStudioDisplayName(name),
            title: resolveConsultantTitle(name, p.unvan),
            takim: String(p.takim_ekip).normalize('NFC').trim(),
          };
        })
        .filter(Boolean) as ProfileRow[];

      const built: TeamRow[] = [];
      for (const def of TEAM_DEFS) {
        const membersRaw = rows.filter((r) => matchTeamDef(r.takim)?.id === def.id);
        const members: TeamMemberInput[] = orderTeamMembers(
          membersRaw.map((m) => ({
            key: m.key,
            displayName: m.displayName,
            title: m.title,
            photoUrl: resolveConsultantPhotoUrl(m.displayName, slugs),
          })),
          def
        );
        if (members.length) built.push({ def, members });
      }
      setTeams(built);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Dönem içinden açılınca ilgili takım editörünü aç */
  useEffect(() => {
    if (!embed || loading) return;
    const row = teams.find((t) => t.def.id === embed.teamId);
    if (!row) {
      window.alert('Takım bulunamadı (üyeler / etiket eşleşmesi).');
      embed.onClose();
      return;
    }
    setPreviewReady(false);
    setEditPersonIndex(0);
    setDraft(buildDraft(row.members, adjustments as Record<string, unknown>, row.def.id));
    setGridDraft(normalizeAlignGrid(adjustments[teamGridKey]));
    setEditing(row);
    // Yalnızca embed hedefi / yükleme değişince; adjustments draft dirty hesabında
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed?.teamId, embed?.periodId, loading, teams]);

  const savedDraftFor = useCallback(
    (row: TeamRow) => buildDraft(row.members, adjustments as Record<string, unknown>, row.def.id),
    [adjustments]
  );

  const paintPreview = useCallback(async () => {
    const row = editingRef.current;
    if (!row) return;
    const state = paintState.current;
    if (state.busy) {
      state.pending = true;
      return;
    }
    state.busy = true;
    try {
      const canvas = await renderTeamStrip({
        periodId: periodRef.current,
        people: await toRenderPeople(row.members),
        personAdjusts: draftRef.current.people,
        teamAdjust: draftRef.current.team,
        personGlow: draftRef.current.personGlow,
        personInnerGlow: draftRef.current.personInnerGlow,
        personEdgeClean: draftRef.current.personEdgeClean,
        personPeriodTint: draftRef.current.personPeriodTint,
        logoGlow: draftRef.current.logoGlow,
        logoUrl: row.def.logoUrl,
        grayscale: true,
        edgeCleanMaxSide: EDGE_CLEAN_PREVIEW_MAX_SIDE,
      });
      const target = previewCanvasRef.current;
      if (target && editingRef.current === row) {
        target.getContext('2d')?.drawImage(canvas, 0, 0, target.width, target.height);
        setPreviewReady(true);
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
    if (!editing) return;
    const timer = window.setTimeout(() => {
      void paintPreview();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [editing, draft, periodId, paintPreview]);

  const savedTeamGrid = normalizeAlignGrid(adjustments[teamGridKey]);
  const gridDirty = !sameAlignGrid(gridDraft, savedTeamGrid);
  const saveGridDraft = async () => {
    await saveAdjust(teamGridKey, gridDraft);
  };

  const openEditor = (row: TeamRow) => {
    setPreviewReady(false);
    setEditPersonIndex(0);
    setDraft(savedDraftFor(row));
    setGridDraft(normalizeAlignGrid(adjustments[teamGridKey]));
    setEditing(row);
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewReady(false);
    embed?.onClose();
  };

  const baseline = editing ? savedDraftFor(editing) : null;
  const dirty = Boolean(canSave && editing && baseline && !sameAdjust(draft, baseline));

  const saveDraft = async () => {
    if (!editing) return;
    await saveAdjust(TEAM_PERSON_GLOW_KEY, { ...draft.personGlow, color: '#000000' });
    await saveAdjust(TEAM_PERSON_INNER_GLOW_KEY, {
      ...draft.personInnerGlow,
      color: '#000000',
    });
    await saveAdjust(TEAM_PERSON_EDGE_CLEAN_KEY, draft.personEdgeClean);
    await saveAdjust(TEAM_PERSON_PERIOD_TINT_KEY, draft.personPeriodTint);
    await saveAdjust(TEAM_LOGO_GLOW_KEY, draft.logoGlow);
    await saveAdjust(teamAdjustKey(editing.def.id), draft.team);
    for (let i = 0; i < editing.members.length; i += 1) {
      const member = editing.members[i]!;
      await saveAdjust(
        personAdjustKey(member.key),
        draft.people[i] || DEFAULT_TEAM_PERSON_ADJUST
      );
    }
  };

  const resetDraft = () => {
    if (!editing) return;
    setDraft({
      team: { ...DEFAULT_TEAM_STRIP_ADJUST },
      people: editing.members.map(() => ({ ...DEFAULT_TEAM_PERSON_ADJUST })),
      personGlow: { ...DEFAULT_PERSON_GLOW },
      personInnerGlow: { ...DEFAULT_PERSON_INNER_GLOW },
      personEdgeClean: { ...DEFAULT_PERSON_EDGE_CLEAN },
      personPeriodTint: { ...DEFAULT_PERSON_PERIOD_TINT },
      logoGlow: { ...DEFAULT_LOGO_GLOW },
    });
  };

  const deleteSaved = async () => {
    if (!editing) return;
    await removeAdjust(teamAdjustKey(editing.def.id));
    for (const m of editing.members) await removeAdjust(personAdjustKey(m.key));
    setDraft({
      team: { ...DEFAULT_TEAM_STRIP_ADJUST },
      people: editing.members.map(() => ({ ...DEFAULT_TEAM_PERSON_ADJUST })),
      personGlow: {
        ...normalizeOuterGlow(
          adjustments[TEAM_PERSON_GLOW_KEY] ?? adjustments[TEAM_PERSON_SHADOW_KEY],
          DEFAULT_PERSON_GLOW,
          PERSON_GLOW_BLUR_MAX
        ),
        color: '#000000',
      },
      personInnerGlow: {
        ...normalizeOuterGlow(
          adjustments[TEAM_PERSON_INNER_GLOW_KEY],
          DEFAULT_PERSON_INNER_GLOW,
          PERSON_INNER_GLOW_BLUR_MAX
        ),
        color: '#000000',
      },
      personEdgeClean: normalizePersonEdgeClean(adjustments[TEAM_PERSON_EDGE_CLEAN_KEY]),
      personPeriodTint: normalizePersonPeriodTint(adjustments[TEAM_PERSON_PERIOD_TINT_KEY]),
      logoGlow: normalizeOuterGlow(
        adjustments[TEAM_LOGO_GLOW_KEY] ?? adjustments[TEAM_LOGO_SHADOW_KEY],
        DEFAULT_LOGO_GLOW,
        LOGO_GLOW_BLUR_MAX
      ),
    });
  };

  const hasSaved = Boolean(
    editing &&
      (adjustments[teamAdjustKey(editing.def.id)] ||
        adjustments[TEAM_PERSON_GLOW_KEY] ||
        adjustments[TEAM_PERSON_INNER_GLOW_KEY] ||
        adjustments[TEAM_PERSON_EDGE_CLEAN_KEY] ||
        adjustments[TEAM_PERSON_PERIOD_TINT_KEY] ||
        adjustments[TEAM_LOGO_GLOW_KEY] ||
        adjustments[TEAM_PERSON_SHADOW_KEY] ||
        adjustments[TEAM_LOGO_SHADOW_KEY] ||
        editing.members.some((m) => adjustments[personAdjustKey(m.key)]))
  );

  const { requestClose, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    onSave: saveDraft,
    onClose: closeEditor,
  });

  const activePersonAdjust =
    draft.people[editPersonIndex] || DEFAULT_TEAM_PERSON_ADJUST;

  const updateActivePerson = (patch: Partial<TeamPersonAdjust>) => {
    setDraft((current) => ({
      ...current,
      people: current.people.map((entry, index) =>
        index === editPersonIndex ? { ...entry, ...patch } : entry
      ),
    }));
  };

  const updateTeam = (patch: Partial<TeamStripAdjust>) => {
    setDraft((current) => ({
      ...current,
      team: normalizeTeamStripAdjust({ ...current.team, ...patch }),
    }));
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const personIndex = editPersonIndexRef.current;
    const origin = draftRef.current.people[personIndex] || DEFAULT_TEAM_PERSON_ADJUST;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      personIndex,
      origin: { ...origin },
    };
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = RANK_CANVAS.width / Math.max(1, rect.width);
    const next: TeamPersonAdjust = {
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    };
    setDraft((current) => ({
      ...current,
      people: current.people.map((entry, index) =>
        index === drag.personIndex ? next : entry
      ),
    }));
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const downloadPng = async (row: TeamRow, draftOverride?: DraftState) => {
    setDownloading(true);
    try {
      const d = draftOverride || savedDraftFor(row);
      const canvas = await renderTeamStrip({
        periodId,
        people: await toRenderPeople(row.members),
        personAdjusts: d.people,
        teamAdjust: d.team,
        personGlow: d.personGlow,
        personInnerGlow: d.personInnerGlow,
        personEdgeClean: d.personEdgeClean,
        personPeriodTint: d.personPeriodTint,
        logoGlow: d.logoGlow,
        logoUrl: row.def.logoUrl,
        grayscale: true,
        renderScale: TEAM_STRIP_EXPORT_SCALE,
      });
      const periodSlug = RANK_PERIODS.find((p) => p.id === periodId)?.fileSlug || periodId;
      downloadBlob(
        await canvasToBlob(canvas),
        `odul-takim-${periodSlug}-${teamFileSlug(row.def.displayName)}.png`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'PNG oluşturulamadı');
    } finally {
      setDownloading(false);
    }
  };

  const savedCount = useMemo(() => {
    return teams.filter((t) => {
      if (adjustments[teamAdjustKey(t.def.id)]) return true;
      return t.members.some((m) => adjustments[personAdjustKey(m.key)]);
    }).length;
  }, [teams, adjustments]);

  const periodLabel = RANK_PERIODS.find((p) => p.id === periodId)?.label || periodId;
  const editorKicker = embed
    ? `Ödülünüz var · Takım · ${periodLabel}`
    : `Takım ödülü · ${periodLabel}`;

  return (
    <div className={embed ? '' : 'space-y-6'}>
      {!embed ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[15px] font-medium text-[var(--z-fg)]">Takım ödül şeritleri</p>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[var(--z-muted)]">
                Aylık Ödülünüz var şablonu, logo, eşit kutular, isimler (Bebas Neue Pro). Drop shadow
                danışman / logo ayrı; çizgiler slogan şeridinin üstünde biter.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12px] text-[var(--z-muted)]">
                Dönem
                <select
                  value={periodId}
                  onChange={(event) => setPeriodId(event.target.value as RankPeriodId)}
                  className="rounded-lg border border-[var(--z-border)] bg-[var(--z-elevated)] px-2.5 py-1.5 text-[12px] text-[var(--z-fg)]"
                >
                  {awardPeriods.map((id) => {
                    const p = RANK_PERIODS.find((x) => x.id === id);
                    return (
                      <option key={id} value={id}>
                        {p?.label || id}
                      </option>
                    );
                  })}
                </select>
              </label>
              <p className="text-[12px] tabular-nums text-[var(--z-muted)]">
                {loading ? '…' : `${teams.length} takım`}
                {!loading && savedCount ? ` · ${savedCount} kayıtlı` : ''}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--z-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Takımlar yükleniyor…
            </div>
          ) : !teams.length ? (
            <p className="text-[13px] text-[var(--z-muted)]">Takım üyesi bulunan profil yok.</p>
          ) : (
            <ul className="divide-y divide-[var(--z-border)] rounded-2xl border border-[var(--z-border)]">
              {teams.map((row) => {
                const saved =
                  Boolean(adjustments[teamAdjustKey(row.def.id)]) ||
                  row.members.some((m) => adjustments[personAdjustKey(m.key)]);
                return (
                  <li
                    key={row.def.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Users className="h-4 w-4 shrink-0 text-[var(--z-muted)]" />
                        <p className="text-[14px] font-medium text-[var(--z-fg)]">
                          {row.def.displayName}
                        </p>
                        <span className="text-[11px] tabular-nums text-[var(--z-muted)]">
                          {row.members.length} kişi
                        </span>
                        {!row.def.logoUrl ? (
                          <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400/90">
                            Logo yok
                          </span>
                        ) : null}
                        {saved ? (
                          <span className="rounded-full border border-[var(--z-border)] px-2 py-0.5 text-[10px] text-[var(--z-muted)]">
                            Kayıtlı
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-[12px] text-[var(--z-muted)]">
                        {row.members.map((m) => m.displayName).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditor(row)}
                        className="z-btn-ghost px-3.5 py-2 text-[12px]"
                      >
                        Ayarla
                      </button>
                      <button
                        type="button"
                        disabled={downloading}
                        onClick={() => void downloadPng(row)}
                        className="z-btn-ghost inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px]"
                      >
                        <Download className="h-3.5 w-3.5" /> PNG
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}

      {embed && (loading || !editing) ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] backdrop-blur-md">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        </div>
      ) : null}

      {editing && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
              onClick={requestClose}
            >
              <div
                className="z-modal zebra-sheet-enter flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden p-0 md:grid md:grid-cols-[minmax(0,1fr)_320px]"
                onClick={(event) => event.stopPropagation()}
              >
                {/* Sticky preview */}
                <div className="flex shrink-0 items-start justify-center bg-black/40 p-5 md:sticky md:top-0 md:max-h-[92vh] md:self-start md:overflow-hidden md:p-7">
                  <div
                    className="relative aspect-[4/5] w-full max-w-[min(100%,calc(84vh*0.8))] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-black active:cursor-grabbing"
                    onPointerDown={handlePreviewPointerDown}
                    onPointerMove={handlePreviewPointerMove}
                    onPointerUp={handlePreviewPointerUp}
                    onPointerCancel={handlePreviewPointerUp}
                  >
                      <canvas
                        ref={previewCanvasRef}
                        width={540}
                        height={675}
                        className="h-full w-full"
                        aria-label={editing.def.displayName}
                      />
                      <AlignGridOverlay grid={gridDraft} />
                      {!previewReady ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-white/50" />
                        </div>
                      ) : null}
                  </div>
                </div>

                {/* Scrollable settings */}
                <div className="flex max-h-[92vh] flex-col overflow-y-auto border-t border-[var(--z-border)] p-5 md:border-l md:border-t-0 md:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="z-page-kicker">{editorKicker}</p>
                      <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">
                        {editing.def.displayName}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--z-muted)]">
                        {editing.members.length} kutu · isim Bebas · gölgeler ayrı
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={requestClose}
                      className="z-btn-icon h-9 w-9 shrink-0"
                      aria-label="Kapat"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {editing.members.map((person, index) => (
                      <button
                        key={person.key}
                        type="button"
                        onClick={() => setEditPersonIndex(index)}
                        className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                          editPersonIndex === index
                            ? 'border-[var(--z-fg)] bg-[var(--z-fg)] text-[var(--z-bg)]'
                            : 'border-[var(--z-border)] text-[var(--z-muted)] hover:border-[var(--z-fg)]/40 hover:text-[var(--z-fg)]'
                        }`}
                      >
                        {personShort(person.displayName)}
                        {editing.def.leaders[0] === person.key ? ' · L' : ''}
                      </button>
                    ))}
                  </div>

                  {(
                    [
                      {
                        id: 'scale' as const,
                        label: 'Boyut',
                        min: 0.55,
                        max: 1.75,
                        step: 0.01,
                        format: (v: number) => `%${Math.round(v * 100)}`,
                      },
                      {
                        id: 'dx' as const,
                        label: 'Yatay',
                        min: -OFFSET_LIMIT,
                        max: OFFSET_LIMIT,
                        step: 1,
                        format: (v: number) => `${v}px`,
                      },
                      {
                        id: 'dy' as const,
                        label: 'Dikey',
                        min: -OFFSET_LIMIT,
                        max: OFFSET_LIMIT,
                        step: 1,
                        format: (v: number) => `${v}px`,
                      },
                      {
                        id: 'brightness' as const,
                        label: 'Parlaklık',
                        min: -30,
                        max: 30,
                        step: 1,
                        format: (v: number) => (v > 0 ? `+${v}` : `${v}`),
                      },
                    ] as const
                  ).map((control) => (
                    <label key={control.id} className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>{control.label}</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {control.format(activePersonAdjust[control.id])}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={activePersonAdjust[control.id]}
                        onChange={(event) =>
                          updateActivePerson({ [control.id]: Number(event.target.value) })
                        }
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                  ))}

                  <div className="mt-6 border-t border-[var(--z-border)] pt-5">
                    <p className="text-[12px] font-medium text-[var(--z-fg)]">Tüm danışmanlar</p>
                    <label className="mt-3 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Dikey (hepsi)</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.peopleOffsetY}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={-120}
                        max={180}
                        step={1}
                        value={draft.team.peopleOffsetY}
                        onChange={(e) => updateTeam({ peopleOffsetY: Number(e.target.value) })}
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>İsim satır aralığı</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.nameLineGap}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={10}
                        max={48}
                        step={1}
                        value={draft.team.nameLineGap}
                        onChange={(e) => updateTeam({ nameLineGap: Number(e.target.value) })}
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>İsim–soyisim alttan mesafe</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.nameBottomGap}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={4}
                        max={160}
                        step={1}
                        value={draft.team.nameBottomGap}
                        onChange={(e) =>
                          updateTeam({ nameBottomGap: Number(e.target.value) })
                        }
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Alt siyah gradient yüksekliği</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.bottomGradientHeight}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={420}
                        step={1}
                        value={draft.team.bottomGradientHeight}
                        onChange={(e) =>
                          updateTeam({ bottomGradientHeight: Number(e.target.value) })
                        }
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Alt gradient yoğunluğu</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          %{Math.round(draft.team.bottomGradientOpacity * 100)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(draft.team.bottomGradientOpacity * 100)}
                        onChange={(e) =>
                          updateTeam({
                            bottomGradientOpacity: Number(e.target.value) / 100,
                          })
                        }
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                  </div>

                  <div className="mt-6 border-t border-[var(--z-border)] pt-5">
                    <p className="text-[12px] font-medium text-[var(--z-fg)]">Logo</p>
                    <p className="mt-1 text-[11px] text-[var(--z-muted)]">
                      Opak içerik ortalanır (PNG boşluğu yok sayılır). İnce ayar için yatay kaydır.
                    </p>
                    <label className="mt-3 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Renk</span>
                        <span className="tabular-nums text-[var(--z-fg)]">{draft.team.logoColor}</span>
                      </span>
                      <input
                        type="color"
                        value={draft.team.logoColor}
                        onChange={(e) => updateTeam({ logoColor: e.target.value })}
                        className="mt-2 h-9 w-full cursor-pointer rounded border border-[var(--z-border)] bg-transparent"
                      />
                    </label>
                    {(
                      [
                        {
                          id: 'logoScale' as const,
                          label: 'Boyut',
                          min: 0.5,
                          max: 1.8,
                          step: 0.01,
                          format: (v: number) => `%${Math.round(v * 100)}`,
                        },
                        {
                          id: 'logoDx' as const,
                          label: 'Yatay',
                          min: -200,
                          max: 200,
                          step: 1,
                          format: (v: number) => `${v}px`,
                        },
                        {
                          id: 'logoDy' as const,
                          label: 'Dikey',
                          min: -200,
                          max: 200,
                          step: 1,
                          format: (v: number) => `${v}px`,
                        },
                      ] as const
                    ).map((control) => (
                      <label key={control.id} className="mt-3 block">
                        <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                          <span>{control.label}</span>
                          <span className="tabular-nums text-[var(--z-fg)]">
                            {control.format(draft.team[control.id])}
                          </span>
                        </span>
                        <input
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={draft.team[control.id]}
                          onChange={(event) =>
                            updateTeam({ [control.id]: Number(event.target.value) })
                          }
                          className="mt-2 w-full accent-[var(--z-fg)]"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-6 border-t border-[var(--z-border)] pt-5">
                    <p className="text-[12px] font-medium text-[var(--z-fg)]">Ayırıcı çizgiler</p>
                    <p className="mt-1 text-[11px] text-[var(--z-muted)]">
                      Alt uç yeşil şeridin üstünde sabit; yukarı doğru fade-out.
                    </p>
                    <label className="mt-3 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Renk</span>
                        <span className="tabular-nums text-[var(--z-fg)]">{draft.team.strokeColor}</span>
                      </span>
                      <input
                        type="color"
                        value={
                          /^#[0-9a-f]{6}$/i.test(draft.team.strokeColor)
                            ? draft.team.strokeColor
                            : '#c4a35a'
                        }
                        onChange={(event) => updateTeam({ strokeColor: event.target.value })}
                        className="mt-2 h-9 w-full cursor-pointer rounded border border-[var(--z-border)] bg-transparent"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Kalınlık</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.strokeWidth.toFixed(1)}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0.5}
                        max={8}
                        step={0.1}
                        value={draft.team.strokeWidth}
                        onChange={(event) =>
                          updateTeam({ strokeWidth: Number(event.target.value) })
                        }
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Yükseklik</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.lineHeight}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={120}
                        max={700}
                        step={1}
                        value={draft.team.lineHeight}
                        onChange={(event) =>
                          updateTeam({ lineHeight: Number(event.target.value) })
                        }
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-4 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Üst fade</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.team.lineFade}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={400}
                        step={1}
                        value={draft.team.lineFade}
                        onChange={(event) => updateTeam({ lineFade: Number(event.target.value) })}
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                  </div>

                  <GlowControls
                    title="Danışman outer glow (global)"
                    value={{ ...draft.personGlow, color: '#000000' }}
                    blurMax={PERSON_GLOW_BLUR_MAX}
                    lockBlack
                    onChange={(patch) =>
                      setDraft((c) => ({
                        ...c,
                        personGlow: normalizeOuterGlow(
                          { ...c.personGlow, ...patch, color: '#000000' },
                          DEFAULT_PERSON_GLOW,
                          PERSON_GLOW_BLUR_MAX
                        ),
                      }))
                    }
                  />
                  <GlowControls
                    title="Danışman inner glow (global) · beyaz kenar örtüsü"
                    value={{ ...draft.personInnerGlow, color: '#000000' }}
                    blurMax={PERSON_INNER_GLOW_BLUR_MAX}
                    lockBlack
                    onChange={(patch) =>
                      setDraft((c) => ({
                        ...c,
                        personInnerGlow: normalizeOuterGlow(
                          { ...c.personInnerGlow, ...patch, color: '#000000' },
                          DEFAULT_PERSON_INNER_GLOW,
                          PERSON_INNER_GLOW_BLUR_MAX
                        ),
                      }))
                    }
                  />
                  <div className="rounded-xl border border-[var(--z-border)] bg-[var(--z-elevated)]/40 p-3">
                    <p className="text-[12px] font-medium text-[var(--z-fg)]">
                      PNG kenar temizliği (global)
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--z-muted)]">
                      Beyaz cutout halkası: alpha choke + kenar koyulaştırma. Tüm takım
                      danışmanlarına uygulanır.
                    </p>
                    <label className="mt-3 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Choke</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {draft.personEdgeClean.chokePx.toFixed(1)}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={PERSON_EDGE_CHOKE_MAX}
                        step={0.5}
                        value={draft.personEdgeClean.chokePx}
                        onInput={(event) => {
                          const chokePx = Number(
                            (event.target as HTMLInputElement).value
                          );
                          setDraft((c) => ({
                            ...c,
                            personEdgeClean: normalizePersonEdgeClean({
                              ...c.personEdgeClean,
                              chokePx,
                            }),
                          }));
                        }}
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Kenar koyulaştırma</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {Math.round(draft.personEdgeClean.fringeDarken * 100)}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(draft.personEdgeClean.fringeDarken * 100)}
                        onInput={(event) => {
                          const fringeDarken =
                            Number((event.target as HTMLInputElement).value) / 100;
                          setDraft((c) => ({
                            ...c,
                            personEdgeClean: normalizePersonEdgeClean({
                              ...c.personEdgeClean,
                              fringeDarken,
                            }),
                          }));
                        }}
                        className="mt-2 w-full accent-[var(--z-fg)]"
                      />
                    </label>
                  </div>
                  <div className="rounded-xl border border-[var(--z-border)] bg-[var(--z-elevated)]/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-medium text-[var(--z-fg)]">
                          Ay rengi overlay (global)
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--z-muted)]">
                          Alt şerit rengini danışmanlara multiply ile yansıtır. Tüm aylara
                          uygulanır; her ay kendi rengi.
                        </p>
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--z-fg)]">
                        <input
                          type="checkbox"
                          checked={draft.personPeriodTint.enabled}
                          onChange={(event) =>
                            setDraft((c) => ({
                              ...c,
                              personPeriodTint: normalizePersonPeriodTint({
                                ...c.personPeriodTint,
                                enabled: event.target.checked,
                              }),
                            }))
                          }
                          className="accent-[var(--z-fg)]"
                        />
                        Açık
                      </label>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className="h-4 w-4 shrink-0 rounded-sm border border-[var(--z-border)]"
                        style={{
                          backgroundColor: RANK_PERIOD_DOT_COLOR[periodId] || '#888',
                        }}
                        title={RANK_PERIOD_DOT_COLOR[periodId] || ''}
                      />
                      <span className="text-[11px] tabular-nums text-[var(--z-muted)]">
                        {periodLabel}: {RANK_PERIOD_DOT_COLOR[periodId] || '—'}
                      </span>
                    </div>
                    <label className="mt-3 block">
                      <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                        <span>Multiply opacity</span>
                        <span className="tabular-nums text-[var(--z-fg)]">
                          {Math.round(draft.personPeriodTint.opacity * 100)}%
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={!draft.personPeriodTint.enabled}
                        value={Math.round(draft.personPeriodTint.opacity * 100)}
                        onChange={(event) =>
                          setDraft((c) => ({
                            ...c,
                            personPeriodTint: normalizePersonPeriodTint({
                              ...c.personPeriodTint,
                              opacity: Number(event.target.value) / 100,
                            }),
                          }))
                        }
                        className="mt-2 w-full accent-[var(--z-fg)] disabled:opacity-40"
                      />
                    </label>
                  </div>
                  <GlowControls
                    title="Logo outer glow (global)"
                    value={draft.logoGlow}
                    blurMax={LOGO_GLOW_BLUR_MAX}
                    onChange={(patch) =>
                      setDraft((c) => ({
                        ...c,
                        logoGlow: normalizeOuterGlow(
                          { ...c.logoGlow, ...patch },
                          DEFAULT_LOGO_GLOW,
                          LOGO_GLOW_BLUR_MAX
                        ),
                      }))
                    }
                  />

                  <AlignGridControls
                    kind={TEAM_GRID_KIND}
                    grid={gridDraft}
                    canSave={canSave}
                    dirty={gridDirty}
                    hasSaved={Boolean(adjustments[teamGridKey])}
                    onChange={(patch) =>
                      setGridDraft((g) => normalizeAlignGrid({ ...g, ...patch }))
                    }
                    onSave={() => void saveGridDraft()}
                    onReset={() => setGridDraft({ ...DEFAULT_ALIGN_GRID })}
                  />

                  <div className="mt-auto flex flex-col gap-2 pt-8">
                    <AdjustSaveActions
                      canSave={canSave}
                      dirty={dirty}
                      hasSaved={hasSaved}
                      onSave={saveDraft}
                      onResetScreen={resetDraft}
                      onDeleteSaved={deleteSaved}
                    />
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => void downloadPng(editing, draft)}
                      className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
                    >
                      <Download className="h-3.5 w-3.5" /> PNG indir
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {unsavedDialog}
    </div>
  );
}
