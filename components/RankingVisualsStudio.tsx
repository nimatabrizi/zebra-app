'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import {
  Award,
  Download,
  FileSpreadsheet,
  FileText,
  FlipHorizontal2,
  ImageOff,
  LayoutList,
  Loader2,
  Presentation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import RankingTeamStripStudio from './RankingTeamStripStudio';
import RankingRankingsBoard from './RankingRankingsBoard';
import RankingPresentationStudio from './RankingPresentationStudio';
import { AlignGridControls, AlignGridOverlay } from './RankingAlignGrid';
import { supabase } from '../supabaseClient';
import { resolveConsultantTitle } from '../lib/consultantTitles';
import { measureFace } from '../lib/girisVisuals';
import { resolveConsultantPhotoUrl, toStudioDisplayName } from '../lib/studioAssets';
import { toConsultantPhotoSlug, toTitleCaseName } from '../lib/formatName';
import {
  PRESENTATION_ODUL_XLSX_URL,
  parseOdulWorkbook,
  resolveTeamDef,
} from '../lib/presentationOdulWorkbook';
import type { PresentationTeamResolve } from '../lib/rankingPresentation';
import { AdjustSaveActions, useUnsavedChangesGuard } from './AdjustSaveControls';
import { loadRankingWorkbook, saveRankingWorkbook } from '../lib/rankingWorkbook';
import { sameAdjust, useSavedAdjustments } from '../lib/visualAdjustments';
import {
  DEFAULT_ALIGN_GRID,
  alignGridKey,
  normalizeAlignGrid,
  resolveAlignGridKind,
  sameAlignGrid,
  type AlignGrid,
  type AlignGridKind,
} from '../lib/rankingAlignGrid';
import {
  certificateTemplateFor,
  certificateToPdfBlob,
  isCertificatePeriod,
  loadCertificateReport,
  renderCertificate,
  sortAchievements,
  type CertificateReportEntry,
} from '../lib/rankingCertificate';
import {
  DEFAULT_PHOTO_ADJUST,
  DEFAULT_QUARTER_AWARD_NAME_GLOW,
  QUARTER_AWARD_NAME_GLOW_BLUR_MAX,
  QUARTER_AWARD_NAME_GLOW_KEY,
  RANK_CANVAS,
  RANK_CATEGORIES,
  RANK_PERIODS,
  RANK_TEMPLATES,
  buildRankingExportSheets,
  canvasToBlob,
  defaultRankAdjust,
  loadRankImage,
  measureOpaqueBox,
  mergeParsedRankings,
  normalizeNameGlow,
  normalizeRankAdjust,
  parseRankingWorkbook,
  rankFileSlug,
  renderRankVisual,
  templateFor,
  turkishRankSuffix,
  type NameGlowAdjust,
  type ParsedRankings,
  type PhotoAdjust,
  type RankAdjust,
  type RankCategoryId,
  type RankEntry,
  type RankOutputKind,
  type RankPeriodId,
  type RenderPerson,
} from '../lib/rankingVisuals';
import {
  TEAM_DEFS,
  matchTeamDef,
  orderTeamMembers,
  TEAM_STRIP_EXPORT_SCALE,
  renderTeamStrip,
  resolveTeamAwareTitle,
  teamFileSlug,
  teamSettingsFromSaved,
  visualPeopleFileSlug,
  type TeamDef,
  type TeamMemberInput,
} from '../lib/rankingTeamVisuals';

type ProfileLite = {
  name: string;
  title: string;
  slug: string;
  tokens: string[];
  takim: string | null;
};

type ResolvedPerson = {
  key: string;
  displayName: string;
  title: string;
  photoUrl: string | null;
};

type OutputItem = {
  key: string;
  kind: RankOutputKind;
  periodId: RankPeriodId;
  category: RankCategoryId;
  rank: number;
  people: ResolvedPerson[];
  templateUrl: string | null;
  adjustKey: string;
  label: string;
  detail: string;
  zipPath: string;
  /** Ödülünüz var · takım şeridi */
  teamId?: string;
  teamDef?: TeamDef;
};

type CertItem = {
  key: string;
  periodId: RankPeriodId;
  displayName: string;
  achievements: string[];
  templateUrl: string;
  label: string;
  detail: string;
  pdfPath: string;
  kind?: 'person' | 'team';
  logoUrl?: string | null;
};

const ADJUST_STORAGE_KEY = 'zebra-siralama-photo-adjust-v2';
const OFFSET_LIMIT = 500;

function clampOffset(value: number) {
  return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(value)));
}

function significantTokens(slug: string): string[] {
  return slug.split('-').filter((t) => t && t !== 'dr' && t.length >= 2);
}

function matchProfile(name: string, profiles: ProfileLite[]): ProfileLite | null {
  const slug = toConsultantPhotoSlug(name);
  if (!slug) return null;
  const exact = profiles.find((p) => p.slug === slug);
  if (exact) return exact;
  const want = significantTokens(slug);
  if (want.length < 2) return null;
  const first = want[0]!;
  const last = want[want.length - 1]!;
  return (
    profiles.find((p) => p.tokens.includes(first) && p.tokens.includes(last)) || null
  );
}

function rankText(rank: number) {
  return `${rank}.${turkishRankSuffix(rank)}`;
}

function periodLabel(id: RankPeriodId) {
  return RANK_PERIODS.find((p) => p.id === id)?.label || id;
}

function categoryShort(id: RankCategoryId) {
  return RANK_CATEGORIES.find((c) => c.id === id)?.short || id;
}

async function toRenderPeople(people: ResolvedPerson[]): Promise<RenderPerson[]> {
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

async function renderItem(
  item: OutputItem,
  adjust: RankAdjust,
  nameGlow?: NameGlowAdjust
) {
  if (!item.templateUrl) throw new Error('Template bekleniyor');
  const period = RANK_PERIODS.find((p) => p.id === item.periodId);
  return renderRankVisual({
    kind: item.kind,
    templateUrl: item.templateUrl,
    rank: item.rank,
    periodId: item.periodId,
    people: await toRenderPeople(item.people),
    adjust,
    nameGlow:
      item.kind === 'award' && period?.kind === 'quarter'
        ? normalizeNameGlow(nameGlow)
        : undefined,
  });
}

function personShortLabel(person: ResolvedPerson) {
  return person.displayName.split(/\s+/)[0] || person.displayName;
}

/** Tüm aylarda ortak kişi foto ayarı (ödül / sıralama ayrı; takım person| ile çakışmaz) */
function sharedPeopleAdjustKey(kind: 'award' | 'rank', peopleKeys: string[]) {
  return `shared|${kind}|${peopleKeys.join('+')}`;
}

/** Yeni anahtar yoksa eski period|ay|kişiler kaydına düş */
function lookupPeopleAdjust(
  saved: Record<string, unknown>,
  adjustKey: string,
  peopleKeys: string[]
): unknown {
  if (saved[adjustKey] != null) return saved[adjustKey];
  const suffix = `|${peopleKeys.join('+')}`;
  for (const [key, value] of Object.entries(saved)) {
    if (key.startsWith('period|') && key.endsWith(suffix)) return value;
  }
  return undefined;
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

export default function RankingVisualsStudio({
  isActive = true,
  canSave = false,
}: {
  isActive?: boolean;
  canSave?: boolean;
}) {
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [photoSlugs, setPhotoSlugs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRankings | null>(null);
  const [excelHydrated, setExcelHydrated] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const persistSkipRef = useRef(true);

  const [activePeriod, setActivePeriod] = useState<RankPeriodId | null>(null);
  /** Sıralama tabelası | görsel üretim | sunum | sunum 2 | sunum 3 */
  const [studioMode, setStudioMode] = useState<
    | 'rankings'
    | 'visuals'
    | 'presentation'
    | 'presentation2'
    | 'presentation3'
  >('rankings');
  const [odulParsed, setOdulParsed] = useState<ParsedRankings | null>(null);
  const [odulLoading, setOdulLoading] = useState(false);
  const [odulError, setOdulError] = useState('');
  /** Dönem içinden Takım Verimliliği şerit editörü */
  const [teamStripEdit, setTeamStripEdit] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState('');

  const {
    saved: adjustments,
    ready: adjustmentsReady,
    save: saveAdjust,
    remove: removeAdjust,
  } = useSavedAdjustments<
    RankAdjust | PhotoAdjust | NameGlowAdjust | Record<string, unknown>
  >('siralama', {
    legacyStorageKey: ADJUST_STORAGE_KEY,
    canSave,
  });
  const [editing, setEditing] = useState<OutputItem | null>(null);
  const [draft, setDraft] = useState<RankAdjust>(defaultRankAdjust(1));
  const [editPersonIndex, setEditPersonIndex] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [gridKind, setGridKind] = useState<AlignGridKind | null>(null);
  const [gridDraft, setGridDraft] = useState<AlignGrid>({ ...DEFAULT_ALIGN_GRID });
  const [nameGlowDraft, setNameGlowDraft] = useState<NameGlowAdjust>({
    ...DEFAULT_QUARTER_AWARD_NAME_GLOW,
  });
  const editorHydratedKey = useRef<string | null>(null);
  const nameGlowRef = useRef(nameGlowDraft);
  nameGlowRef.current = nameGlowDraft;
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    personIndex: number;
    origin: PhotoAdjust;
  } | null>(null);
  const [exporting, setExporting] = useState<{ current: number; total: number } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState('');
  const [certReport, setCertReport] = useState<CertificateReportEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: files }, { data: rows }] = await Promise.all([
        supabase.storage
          .from('consultant-photos')
          .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
        supabase.from('profiles').select('tam_isim, unvan, takim_ekip'),
      ]);
      if (cancelled) return;
      setPhotoSlugs(
        (files || [])
          .map((file) => String(file.name || '').replace(/\.png$/i, ''))
          .filter(Boolean)
      );
      setProfiles(
        (rows || [])
          .map((row) => {
            const record = row as Record<string, unknown>;
            const name = String(record.tam_isim || '').normalize('NFC').trim();
            if (!name) return null;
            const slug = toConsultantPhotoSlug(name);
            const takimRaw = String(record.takim_ekip || '').normalize('NFC').trim();
            return {
              name,
              title: resolveConsultantTitle(name, String(record.unvan || '')),
              slug,
              tokens: significantTokens(slug),
              takim: takimRaw || null,
            };
          })
          .filter(Boolean) as ProfileLite[]
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadRankingWorkbook();
      if (cancelled) return;
      if (stored?.parsed.entries.length) {
        setParsed(stored.parsed);
        setFileName(stored.fileName || 'Kayıtlı Excel');
        const firstWithData = RANK_PERIODS.find((p) =>
          stored.parsed.entries.some((e) => e.periodId === p.id)
        );
        if (firstWithData) setActivePeriod(firstWithData.id);
      }
      setExcelHydrated(true);
      persistSkipRef.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Sunum görselleri 2 — birleşik ödül Excel’i (ayrı kaynak) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOdulLoading(true);
      setOdulError('');
      try {
        const res = await fetch(PRESENTATION_ODUL_XLSX_URL);
        if (!res.ok) throw new Error(`Excel yüklenemedi (${res.status})`);
        const buf = await res.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buf, { type: 'array' });
        const result = parseOdulWorkbook(workbook, (sheetName) =>
          XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
            header: 1,
            defval: '',
            raw: true,
          })
        );
        if (cancelled) return;
        setOdulParsed(result);
        if (result.warnings.length) {
          console.warn('[sunum2]', result.warnings.join('; '));
        }
      } catch (error) {
        console.warn('[sunum2] excel', error);
        if (!cancelled) {
          setOdulError(
            error instanceof Error ? error.message : 'Birleşik ödül Excel’i okunamadı'
          );
          setOdulParsed(null);
        }
      } finally {
        if (!cancelled) setOdulLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveTeam = useCallback((name: string, key: string): PresentationTeamResolve => {
    const def = resolveTeamDef(name) || TEAM_DEFS.find((t) => t.id === key) || null;
    return {
      key: def?.id || key,
      displayName: def?.displayName || toTitleCaseName(name),
      logoUrl: def?.logoUrl || null,
    };
  }, []);

  useEffect(() => {
    if (!parsed?.entries.length || activePeriod) return;
    const first = RANK_PERIODS.find((p) =>
      parsed.entries.some((e) => e.periodId === p.id)
    );
    if (first) setActivePeriod(first.id);
  }, [parsed, activePeriod]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const report = await loadCertificateReport();
        if (!cancelled) setCertReport(report.certificates);
      } catch (error) {
        console.warn('[sertifika] rapor yüklenemedi', error);
        if (!cancelled) setCertReport([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!excelHydrated || persistSkipRef.current) return;
    if (!parsed?.entries.length || !fileName) return;
    let cancelled = false;
    (async () => {
      await saveRankingWorkbook(fileName, parsed);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [excelHydrated, parsed, fileName]);

  const resolvePerson = useCallback(
    (name: string, key: string): ResolvedPerson => {
      const profile = matchProfile(name, profiles);
      const baseName = profile?.name || name;
      const slug = profile?.slug || key;
      return {
        key: slug,
        displayName: toStudioDisplayName(baseName),
        title: resolveTeamAwareTitle(
          slug,
          profile?.title || resolveConsultantTitle(baseName, null)
        ),
        photoUrl: resolveConsultantPhotoUrl(baseName, photoSlugs),
      };
    },
    [profiles, photoSlugs]
  );

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseError('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const result = parseRankingWorkbook(workbook, (sheetName) =>
        XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
          header: 1,
          defval: '',
          blankrows: false,
        })
      );
      const merged = mergeParsedRankings(parsed, result);
      setParsed(merged);
      setFileName(file.name);
      setActivePeriod(null);
      setPersonQuery('');
      if (!merged.entries.length) {
        setParseError('Dosyada okunabilir sıralama bulunamadı. "Excel nasıl hazırlanır?" bölümüne göz atın.');
      }
    } catch (error) {
      console.error('Sıralama Excel okunamadı:', error);
      setParseError('Excel dosyası okunamadı. .xlsx biçiminde kaydedip tekrar deneyin.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadRankingsExcel = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheets = buildRankingExportSheets(parsed?.entries || []);
    for (const { name, rows, cols } of sheets) {
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = cols;
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const outName = parsed?.entries.length
      ? `Siralamalar_2026_${stamp}.xlsx`
      : 'Siralamalar_Sablon.xlsx';
    XLSX.writeFile(workbook, outName);
  };

  const entries = useMemo(() => parsed?.entries || [], [parsed]);

  const periodCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) counts[entry.periodId] = (counts[entry.periodId] || 0) + 1;
    return counts;
  }, [entries]);

  const periodEntries = useMemo(
    () => (activePeriod ? entries.filter((e) => e.periodId === activePeriod) : []),
    [entries, activePeriod]
  );

  const needle = personQuery.trim().toLocaleLowerCase('tr-TR');

  const matchesPersonQuery = useCallback(
    (entry: RankEntry) => {
      if (!needle) return true;
      return entry.people.some((p) => {
        const display = resolvePerson(p.name, p.key).displayName.toLocaleLowerCase('tr-TR');
        return display.includes(needle) || p.name.toLocaleLowerCase('tr-TR').includes(needle);
      });
    },
    [needle, resolvePerson]
  );

  const filteredPeriodEntries = useMemo(
    () => periodEntries.filter(matchesPersonQuery),
    [periodEntries, matchesPersonQuery]
  );

  /** Takım id → sıralı üye listesi (şerit render için) */
  const teamRosterById = useMemo(() => {
    const map = new Map<string, ResolvedPerson[]>();
    for (const def of TEAM_DEFS) {
      const raw = profiles
        .filter((p) => matchTeamDef(p.takim)?.id === def.id)
        .map((p) => ({
          key: p.slug,
          displayName: toStudioDisplayName(p.name),
          title: resolveTeamAwareTitle(p.slug, p.title),
          photoUrl: resolveConsultantPhotoUrl(p.name, photoSlugs),
        }));
      if (!raw.length) continue;
      map.set(def.id, orderTeamMembers(raw, def));
    }
    return map;
  }, [profiles, photoSlugs]);

  const buildItems = useCallback(
    (source: RankEntry[], kinds: RankOutputKind[]): OutputItem[] => {
      const out: OutputItem[] = [];
      const resolveAll = (entry: RankEntry) =>
        entry.people.map((person) => resolvePerson(person.name, person.key));

      if (kinds.includes('rank')) {
        for (const entry of source) {
          /** Takım Verimliliği sıralama görseli henüz yok — indirme listesine alma */
          if (entry.category === 'takim') continue;
          const people = resolveAll(entry);
          const period = RANK_PERIODS.find((p) => p.id === entry.periodId)!;
          const names = people.map((p) => p.displayName).join(' & ');
          out.push({
            key: `rank|${entry.id}`,
            kind: 'rank',
            periodId: entry.periodId,
            category: entry.category,
            rank: entry.rank,
            people,
            templateUrl: templateFor(entry.periodId, 'rank', entry.category),
            adjustKey: sharedPeopleAdjustKey(
              'rank',
              entry.people.map((p) => p.key)
            ),
            label: names,
            detail: `${period.label} · ${categoryShort(entry.category)} · ${rankText(entry.rank)}`,
            zipPath: `${period.fileSlug}/${entry.category}/${String(entry.rank).padStart(2, '0')}-${visualPeopleFileSlug(people)}.png`,
          });
        }
      }

      if (kinds.includes('award')) {
        const groups = new Map<string, RankEntry[]>();
        for (const entry of source) {
          if (entry.category === 'takim') continue;
          const groupKey = `${entry.periodId}|${entry.people.map((p) => p.key).join('+')}`;
          groups.set(groupKey, [...(groups.get(groupKey) || []), entry]);
        }
        for (const [groupKey, group] of groups) {
          const first = group[0]!;
          const people = resolveAll(first);
          const period = RANK_PERIODS.find((p) => p.id === first.periodId)!;
          const names = people.map((p) => p.displayName).join(' & ');
          out.push({
            key: `award|${groupKey}`,
            kind: 'award',
            periodId: first.periodId,
            category: first.category,
            rank: first.rank,
            people,
            templateUrl: templateFor(first.periodId, 'award', first.category),
            adjustKey: sharedPeopleAdjustKey(
              'award',
              first.people.map((p) => p.key)
            ),
            label: names,
            detail: `${period.label} · Ödülünüz var · ${group
              .map((e) => `${categoryShort(e.category)} ${rankText(e.rank)}`)
              .join(', ')}`,
            zipPath: `${period.fileSlug}/odulunuz-var/${visualPeopleFileSlug(people)}.png`,
          });
        }

        /** Takım Verimliliği sıralamasındaki takımlar → Ödülünüz var şeridi */
        const seenTeams = new Set<string>();
        for (const entry of source) {
          if (entry.category !== 'takim') continue;
          let def = matchTeamDef(entry.rawName);
          if (!def) {
            const first = entry.people[0];
            if (first) {
              const resolved = resolvePerson(first.name, first.key);
              const prof = profiles.find((p) => p.slug === resolved.key);
              def = matchTeamDef(prof?.takim) || null;
            }
          }
          if (!def || seenTeams.has(`${entry.periodId}|${def.id}`)) continue;
          const roster = teamRosterById.get(def.id);
          if (!roster?.length) continue;
          seenTeams.add(`${entry.periodId}|${def.id}`);
          const period = RANK_PERIODS.find((p) => p.id === entry.periodId)!;
          out.push({
            key: `award-team|${entry.periodId}|${def.id}`,
            kind: 'award',
            periodId: entry.periodId,
            category: 'takim',
            rank: entry.rank,
            people: roster,
            templateUrl: RANK_TEMPLATES[entry.periodId].award,
            adjustKey: `team|${def.id}`,
            label: def.displayName,
            detail: `${period.label} · Ödülünüz var · Takım · ${rankText(entry.rank)}`,
            zipPath: `${period.fileSlug}/odulunuz-var/takim-${teamFileSlug(def.displayName)}.png`,
            teamId: def.id,
            teamDef: def,
          });
        }
      }
      return out;
    },
    [resolvePerson, teamRosterById, profiles]
  );

  const rankItems = useMemo(
    () => buildItems(filteredPeriodEntries, ['rank']),
    [buildItems, filteredPeriodEntries]
  );
  const awardItems = useMemo(
    () => buildItems(filteredPeriodEntries, ['award']),
    [buildItems, filteredPeriodEntries]
  );
  const certItems = useMemo((): CertItem[] => {
    if (!activePeriod || !isCertificatePeriod(activePeriod)) return [];
    const templateUrl = certificateTemplateFor(activePeriod);
    if (!templateUrl) return [];
    const period = RANK_PERIODS.find((p) => p.id === activePeriod)!;
    const out: CertItem[] = [];
    for (const entry of certReport) {
      if (entry.periodId !== activePeriod) continue;
      if (needle && !entry.displayName.toLocaleLowerCase('tr-TR').includes(needle)) continue;
      const achievements = sortAchievements(entry.achievements);
      const kind = entry.kind === 'team' ? 'team' : 'person';
      const slug = rankFileSlug(entry.displayName);
      out.push({
        key: `cert|${entry.periodId}|${kind}|${entry.teamId || entry.displayName}`,
        periodId: entry.periodId,
        displayName: entry.displayName,
        achievements,
        templateUrl,
        label: entry.displayName,
        detail:
          kind === 'team'
            ? `${period.label} · takım · sertifika`
            : `${period.label} · ${achievements.length} başarı · sertifika`,
        pdfPath:
          kind === 'team'
            ? `${period.fileSlug}/sertifika/takim/${slug}.pdf`
            : `${period.fileSlug}/sertifika/${slug}.pdf`,
        kind,
        logoUrl: entry.logoUrl ?? null,
      });
    }
    return out.sort(
      (a, b) =>
        (a.kind === 'team' ? 1 : 0) - (b.kind === 'team' ? 1 : 0) ||
        a.label.localeCompare(b.label, 'tr')
    );
  }, [activePeriod, certReport, needle]);
  const items = useMemo(() => [...rankItems, ...awardItems], [rankItems, awardItems]);
  const readyItems = useMemo(() => items.filter((item) => item.templateUrl), [items]);
  const readyRankItems = useMemo(() => rankItems.filter((i) => i.templateUrl), [rankItems]);
  const readyAwardItems = useMemo(() => awardItems.filter((i) => i.templateUrl), [awardItems]);

  const activePeriodMeta = activePeriod
    ? RANK_PERIODS.find((p) => p.id === activePeriod) || null
    : null;

  const adjustFor = useCallback(
    (item: OutputItem) => {
      if (item.teamId) {
        return normalizeRankAdjust(adjustments[item.adjustKey], item.people.length);
      }
      const peopleKeys = item.people.map((p) => p.key);
      const raw = lookupPeopleAdjust(
        adjustments as Record<string, unknown>,
        item.adjustKey,
        peopleKeys
      );
      return normalizeRankAdjust(raw, item.people.length);
    },
    [adjustments]
  );

  const renderOutputCanvas = useCallback(
    async (item: OutputItem, adjustOverride?: RankAdjust) => {
      if (item.teamId && item.teamDef) {
        if (!item.templateUrl) throw new Error('Template bekleniyor');
        const members: TeamMemberInput[] = item.people.map((p) => ({
          key: p.key,
          displayName: p.displayName,
          title: p.title,
          photoUrl: p.photoUrl,
        }));
        const settings = teamSettingsFromSaved(
          item.teamDef,
          members,
          adjustments as Record<string, unknown>
        );
        return renderTeamStrip({
          periodId: item.periodId,
          people: await toRenderPeople(item.people),
          personAdjusts: settings.personAdjusts,
          teamAdjust: settings.teamAdjust,
          personGlow: settings.personGlow,
          personInnerGlow: settings.personInnerGlow,
          personEdgeClean: settings.personEdgeClean,
          personPeriodTint: settings.personPeriodTint,
          logoGlow: settings.logoGlow,
          logoUrl: item.teamDef.logoUrl,
          grayscale: true,
          renderScale: TEAM_STRIP_EXPORT_SCALE,
        });
      }
      return renderItem(
        item,
        adjustOverride || adjustFor(item),
        nameGlowRef.current
      );
    },
    [adjustments, adjustFor]
  );

  useEffect(() => {
    setNameGlowDraft(
      normalizeNameGlow(adjustments[QUARTER_AWARD_NAME_GLOW_KEY], DEFAULT_QUARTER_AWARD_NAME_GLOW)
    );
  }, [adjustments]);

  // Sürükleme sırasında kare kaçırmamak için: çizim sürerken gelen istek
  // biriktirilir, çizim bitince en güncel ayarla bir kez daha çizilir.
  const editingRef = useRef<OutputItem | null>(null);
  const draftRef = useRef<RankAdjust>(defaultRankAdjust(1));
  const editPersonIndexRef = useRef(0);
  const previewRenderRef = useRef({ busy: false, pending: false });
  useEffect(() => {
    editingRef.current = editing;
    draftRef.current = draft;
    editPersonIndexRef.current = editPersonIndex;
  }, [editing, draft, editPersonIndex]);

  const activePersonAdjust =
    draft.people[editPersonIndex] || DEFAULT_PHOTO_ADJUST;

  const updateActivePerson = (patch: Partial<PhotoAdjust>) => {
    setDraft((current) => {
      const people = current.people.map((entry, index) =>
        index === editPersonIndexRef.current ? { ...entry, ...patch } : entry
      );
      return { people };
    });
  };

  const paintPreview = useCallback(async () => {
    const state = previewRenderRef.current;
    if (state.busy) {
      state.pending = true;
      return;
    }
    const item = editingRef.current;
    if (!item) return;
    state.busy = true;
    try {
      const canvas = await renderItem(item, draftRef.current, nameGlowRef.current);
      const target = previewCanvasRef.current;
      if (target && editingRef.current === item) {
        target.getContext('2d')?.drawImage(canvas, 0, 0, target.width, target.height);
        setPreviewReady(true);
      }
    } catch {
      /* önizleme hatası indirmede tekrar denenir */
    } finally {
      state.busy = false;
      if (state.pending) {
        state.pending = false;
        void paintPreview();
      }
    }
  }, []);

  useEffect(() => {
    if (editing) void paintPreview();
  }, [editing, draft, nameGlowDraft, paintPreview]);

  const savedNameGlow = normalizeNameGlow(
    adjustments[QUARTER_AWARD_NAME_GLOW_KEY],
    DEFAULT_QUARTER_AWARD_NAME_GLOW
  );
  const nameGlowDirty = !sameAdjust(nameGlowDraft, savedNameGlow);
  const saveNameGlow = async () => {
    await saveAdjust(QUARTER_AWARD_NAME_GLOW_KEY, {
      ...nameGlowDraft,
      color: '#000000',
    });
  };

  const openEditor = (item: OutputItem) => {
    if (item.teamId) {
      setTeamStripEdit(item.teamId);
      return;
    }
    editorHydratedKey.current = null;
    setPreviewReady(false);
    setEditPersonIndex(0);
    setDraft(adjustFor(item));
    const periodKind = RANK_PERIODS.find((p) => p.id === item.periodId)?.kind;
    const kind = resolveAlignGridKind({
      periodKind,
      outputKind: item.kind,
      isTeam: false,
      peopleCount: item.people.length,
    });
    setGridKind(kind);
    setGridDraft(
      kind
        ? normalizeAlignGrid(adjustments[alignGridKey(kind)])
        : { ...DEFAULT_ALIGN_GRID }
    );
    setEditing(item);
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewReady(false);
    setGridKind(null);
    editorHydratedKey.current = null;
  };

  /** Ayarlar geç gelirse editör draft’ını bir kez senkronla (boş/default kalmasın) */
  useEffect(() => {
    if (!editing || !adjustmentsReady) return;
    if (editorHydratedKey.current === editing.key) return;
    editorHydratedKey.current = editing.key;
    setDraft(adjustFor(editing));
    if (gridKind) {
      setGridDraft(normalizeAlignGrid(adjustments[alignGridKey(gridKind)]));
    }
  }, [editing, adjustmentsReady, adjustFor, gridKind, adjustments]);

  const savedGrid = gridKind
    ? normalizeAlignGrid(adjustments[alignGridKey(gridKind)])
    : DEFAULT_ALIGN_GRID;
  const gridDirty = Boolean(gridKind && !sameAlignGrid(gridDraft, savedGrid));
  const saveGridDraft = async () => {
    if (!gridKind) return;
    await saveAdjust(alignGridKey(gridKind), gridDraft);
  };

  const dirty = Boolean(canSave && editing && !sameAdjust(draft, adjustFor(editing)));
  const saveDraft = async () => {
    if (editing) await saveAdjust(editing.adjustKey, draft);
  };
  const { requestClose, dialog: unsavedDialog } = useUnsavedChangesGuard({
    dirty,
    onSave: saveDraft,
    onClose: closeEditor,
  });

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const personIndex = editPersonIndexRef.current;
    const origin = draftRef.current.people[personIndex] || DEFAULT_PHOTO_ADJUST;
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
    const next: PhotoAdjust = {
      ...drag.origin,
      dx: clampOffset(drag.origin.dx + (event.clientX - drag.startX) * ratio),
      dy: clampOffset(drag.origin.dy + (event.clientY - drag.startY) * ratio),
    };
    setDraft((current) => ({
      people: current.people.map((entry, index) =>
        index === drag.personIndex ? next : entry
      ),
    }));
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const downloadOne = async (item: OutputItem, adjustOverride?: RankAdjust) => {
    setDownloadingKey(item.key);
    try {
      const canvas = await renderOutputCanvas(item, adjustOverride);
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, item.zipPath.split('/').join('_'));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Görsel oluşturulamadı');
    } finally {
      setDownloadingKey('');
    }
  };

  const downloadZipOf = async (list: OutputItem[], fileNameZip: string) => {
    const ready = list.filter((item) => item.templateUrl);
    if (!ready.length) {
      window.alert('İndirilecek hazır görsel yok (template eksik olabilir).');
      return;
    }
    const zip = new JSZip();
    const root = zip.folder('Siralama-Gorselleri')!;
    setExporting({ current: 0, total: ready.length });
    try {
      for (let i = 0; i < ready.length; i += 1) {
        const item = ready[i]!;
        const canvas = await renderOutputCanvas(item);
        root.file(item.zipPath, await canvasToBlob(canvas));
        setExporting({ current: i + 1, total: ready.length });
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), fileNameZip);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const downloadCertPdf = async (item: CertItem) => {
    setDownloadingKey(item.key);
    try {
      const canvas = await renderCertificate({
        periodId: item.periodId,
        displayName: item.displayName,
        achievements: item.achievements,
        templateUrl: item.templateUrl,
        logoUrl: item.logoUrl,
      });
      downloadBlob(await certificateToPdfBlob(canvas), item.pdfPath.split('/').join('_'));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Sertifika PDF oluşturulamadı');
    } finally {
      setDownloadingKey('');
    }
  };

  const downloadCertZip = async () => {
    if (!certItems.length || !activePeriodMeta) return;
    const zip = new JSZip();
    const root = zip.folder('Siralama-Sertifikalari')!;
    setExporting({ current: 0, total: certItems.length });
    try {
      for (let i = 0; i < certItems.length; i += 1) {
        const item = certItems[i]!;
        const canvas = await renderCertificate({
          periodId: item.periodId,
          displayName: item.displayName,
          achievements: item.achievements,
          templateUrl: item.templateUrl,
          logoUrl: item.logoUrl,
        });
        root.file(item.pdfPath, await certificateToPdfBlob(canvas));
        setExporting({ current: i + 1, total: certItems.length });
      }
      downloadBlob(
        await zip.generateAsync({ type: 'blob' }),
        `sertifika-${activePeriodMeta.fileSlug}.zip`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Sertifika ZIP oluşturulamadı');
    } finally {
      setExporting(null);
    }
  };

  const rankItemForEntry = useCallback(
    (entry: RankEntry) => rankItems.find((item) => item.key === `rank|${entry.id}`) || null,
    [rankItems]
  );

  const periodScroller = parsed?.entries.length ? (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex w-max gap-1.5 sm:gap-2">
        {RANK_PERIODS.map((period) => {
          const count = periodCounts[period.id] || 0;
          const selected = activePeriod === period.id;
          return (
            <button
              key={period.id}
              type="button"
              disabled={!count}
              onClick={() => {
                setActivePeriod(period.id);
                setPersonQuery('');
              }}
              className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200 sm:px-4 ${
                selected
                  ? 'bg-[var(--z-inverse)] text-[var(--z-inverse-fg)] shadow-[var(--z-shadow-soft)]'
                  : count
                    ? 'bg-[color-mix(in_srgb,var(--z-elevated)_80%,transparent)] text-[var(--z-fg)] hover:bg-[var(--z-hover-strong)]'
                    : 'cursor-not-allowed bg-transparent text-[var(--z-muted-2)] opacity-45'
              }`}
            >
              <span>{period.kind === 'quarter' ? period.label.replace(/^2026\s+/, '') : period.label}</span>
              {count ? (
                <span className={`ml-1.5 tabular-nums ${selected ? 'opacity-70' : 'text-[var(--z-muted)]'}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="panel-enter space-y-7 sm:space-y-9">
      <header className="space-y-4">
        <div>
          <p className="z-page-kicker">Zebra Studio · Ödül ve sıralama</p>
          <h1 className="z-page-title mt-3">Sıralama Görselleri</h1>
          <p className="z-page-sub max-w-2xl">
            Tabelayı incele ve düzenle; ardından görselleri hazırla ve indir.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="inline-flex w-full rounded-2xl border border-[var(--z-border)] bg-[color-mix(in_srgb,var(--z-elevated)_70%,transparent)] p-1 sm:w-auto"
            role="tablist"
            aria-label="Sıralama görünümü"
          >
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'rankings'}
              onClick={() => setStudioMode('rankings')}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all sm:flex-none ${
                studioMode === 'rankings'
                  ? 'bg-[var(--z-surface)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                  : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
              }`}
            >
              <LayoutList className="h-4 w-4" strokeWidth={1.8} />
              Sıralamaları görüntüle
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'visuals'}
              onClick={() => setStudioMode('visuals')}
              disabled={!parsed?.entries.length}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all disabled:opacity-40 sm:flex-none ${
                studioMode === 'visuals'
                  ? 'bg-[var(--z-surface)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                  : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
              }`}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.8} />
              Görsel hazırla
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'presentation'}
              onClick={() => setStudioMode('presentation')}
              disabled={!parsed?.entries.length}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all disabled:opacity-40 sm:flex-none ${
                studioMode === 'presentation'
                  ? 'bg-[var(--z-surface)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                  : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
              }`}
            >
              <Presentation className="h-4 w-4" strokeWidth={1.8} />
              Sunum görselleri
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'presentation2'}
              onClick={() => setStudioMode('presentation2')}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all sm:flex-none ${
                studioMode === 'presentation2'
                  ? 'bg-[var(--z-surface)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                  : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
              }`}
            >
              <Trophy className="h-4 w-4" strokeWidth={1.8} />
              Sunum görselleri 2
              {odulLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
              ) : odulParsed?.entries.length ? (
                <span className="tabular-nums text-[11px] opacity-70">
                  {odulParsed.entries.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'presentation3'}
              onClick={() => setStudioMode('presentation3')}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all sm:flex-none ${
                studioMode === 'presentation3'
                  ? 'bg-[var(--z-surface)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                  : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
              }`}
            >
              <Presentation className="h-4 w-4" strokeWidth={1.8} />
              Sunum görselleri 3
              {odulLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
              ) : odulParsed?.entries.length ? (
                <span className="tabular-nums text-[11px] opacity-70">
                  {odulParsed.entries.length}
                </span>
              ) : null}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void downloadRankingsExcel()}
              className="z-btn-ghost inline-flex items-center gap-2 px-3.5 py-2 text-[12px]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.8} />
              {parsed?.entries.length ? 'Sıralamaları Excel indir' : 'Boş şablon indir'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="z-btn-ghost inline-flex items-center gap-2 px-3.5 py-2 text-[12px] disabled:opacity-50"
            >
              {parsing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
              {fileName ? 'Excel güncelle' : 'Excel yükle'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        </div>

        {fileName ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--z-muted)]">
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
            <span className="truncate">{fileName}</span>
            <span className="tabular-nums">· {entries.length} satır</span>
          </div>
        ) : null}

        {parseError ? (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
            {parseError}
          </p>
        ) : null}
      </header>

      {!excelHydrated ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--z-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Sıralamalar yükleniyor…
        </div>
      ) : studioMode === 'presentation2' || studioMode === 'presentation3' ? (
        <div className="space-y-5">
          {odulError ? (
            <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
              {odulError}
            </p>
          ) : odulLoading || !odulParsed?.entries.length ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--z-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Birleşik ödül sıralamaları yükleniyor…
            </div>
          ) : studioMode === 'presentation3' ? (
            <RankingPresentationStudio
              entries={odulParsed.entries}
              resolvePerson={resolvePerson}
              resolveTeam={resolveTeam}
              teamRosterById={teamRosterById}
              variant="v3"
              exportLabel="sunum-gorselleri-3"
              canSave={canSave}
            />
          ) : (
            <RankingPresentationStudio
              entries={odulParsed.entries}
              resolvePerson={resolvePerson}
              resolveTeam={resolveTeam}
              variant="v2"
              exportLabel="sunum-gorselleri-2"
              canSave={canSave}
            />
          )}
        </div>
      ) : !parsed || !entries.length ? (
        <section className="rounded-[24px] border border-dashed border-[var(--z-border-strong)] px-6 py-16 text-center">
          <FileSpreadsheet className="mx-auto h-8 w-8 text-[var(--z-muted)]" strokeWidth={1.5} />
          <p className="mt-4 text-[16px] font-medium text-[var(--z-fg)]">Henüz sıralama yok</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[var(--z-muted)]">
            Excel yükleyin veya paketlenmiş 2026 dosyasının yüklenmesini bekleyin.
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {studioMode !== 'presentation' ? periodScroller : null}

          {studioMode === 'presentation' ? (
            <RankingPresentationStudio
              entries={entries}
              resolvePerson={resolvePerson}
              canSave={canSave}
            />
          ) : null}

          {studioMode === 'rankings' && activePeriod ? (
            <RankingRankingsBoard
              parsed={parsed}
              periodId={activePeriod}
              canEdit
              onChange={(next) => {
                setParsed(next);
              }}
            />
          ) : null}

          {studioMode === 'visuals' && activePeriod && activePeriodMeta ? (
            <>
              <section className="rounded-[22px] border border-[var(--z-border)] bg-[var(--z-surface)] p-4 shadow-[var(--z-shadow-soft)] sm:p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--z-muted)]" />
                  <input
                    value={personQuery}
                    onChange={(e) => setPersonQuery(e.target.value)}
                    placeholder="Görsellerde kişi ara…"
                    className="z-field w-full pl-11 pr-4 text-[15px]"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!readyRankItems.length || Boolean(exporting)}
                    onClick={() =>
                      void downloadZipOf(
                        readyRankItems,
                        `siralama-${activePeriodMeta.fileSlug}.zip`
                      )
                    }
                    className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
                  >
                    <Trophy className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Sıralama ZIP ({readyRankItems.length})
                  </button>
                  <button
                    type="button"
                    disabled={!readyAwardItems.length || Boolean(exporting)}
                    onClick={() =>
                      void downloadZipOf(
                        readyAwardItems,
                        `odulunuz-var-${activePeriodMeta.fileSlug}.zip`
                      )
                    }
                    className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
                  >
                    <Award className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Ödülünüz var ZIP ({readyAwardItems.length})
                  </button>
                  {activePeriod && isCertificatePeriod(activePeriod) ? (
                    <button
                      type="button"
                      disabled={!certItems.length || Boolean(exporting)}
                      onClick={() => void downloadCertZip()}
                      className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
                    >
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                      Sertifika PDF ZIP ({certItems.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!readyItems.length || Boolean(exporting)}
                    onClick={() =>
                      void downloadZipOf(
                        readyItems,
                        `siralama-hepsi-${activePeriodMeta.fileSlug}.zip`
                      )
                    }
                    className="z-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[13px] disabled:opacity-40"
                  >
                    {exporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {exporting.current}/{exporting.total}
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" strokeWidth={1.8} />
                        Hepsi ({readyItems.length})
                      </>
                    )}
                  </button>
                </div>
              </section>

          {RANK_CATEGORIES.map((category) => {
            const rows = filteredPeriodEntries
              .filter((e) => e.category === category.id)
              .sort((a, b) => a.rank - b.rank || a.rawName.localeCompare(b.rawName, 'tr'));
            const isTeamCat = category.id === 'takim';
            const tpl = templateFor(activePeriod, 'rank', category.id);
            const catReady = rankItems.filter((i) => i.category === category.id && i.templateUrl);

            /** Takım Verimliliği: şimdilik sadece Excel tablosu; sıralama görseli sonra */
            if (isTeamCat) {
              return (
                <section key={category.id} className="z-card overflow-hidden p-0 opacity-80">
                  <div className="border-b border-[var(--z-border)] px-5 py-4 sm:px-6">
                    <p className="text-[16px] font-semibold text-[var(--z-fg)]">{category.label}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                      Sıralama görseli henüz yok · {rows.length} satır (ödül şeridi altta Ödülünüz var’da)
                    </p>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                      {personQuery ? 'Aramayla eşleşen satır yok.' : 'Bu kategoride satır yok.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-[14px]">
                        <thead>
                          <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                            <th className="px-5 py-3 font-medium sm:px-6">Sıra</th>
                            <th className="px-3 py-3 font-medium">Takım</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((entry) => {
                            const def =
                              matchTeamDef(entry.rawName) ||
                              (() => {
                                const first = entry.people[0];
                                if (!first) return null;
                                const resolved = resolvePerson(first.name, first.key);
                                const prof = profiles.find((p) => p.slug === resolved.key);
                                return matchTeamDef(prof?.takim);
                              })();
                            const label =
                              def?.displayName ||
                              entry.people
                                .map((p) => resolvePerson(p.name, p.key).displayName)
                                .join(' & ');
                            return (
                              <tr
                                key={entry.id}
                                className="border-b border-[var(--z-border)] last:border-0"
                              >
                                <td className="px-5 py-3 tabular-nums text-[var(--z-fg)] sm:px-6">
                                  {rankText(entry.rank)}
                                </td>
                                <td className="px-3 py-3 font-medium text-[var(--z-fg)]">{label}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            }

            return (
              <section key={category.id} className="z-card overflow-hidden p-0">
                <div className="flex flex-col gap-3 border-b border-[var(--z-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[16px] font-semibold text-[var(--z-fg)]">{category.label}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                      {rows.length} satır
                      {!tpl ? ' · template bekleniyor (indirme kapalı)' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!catReady.length || Boolean(exporting)}
                    onClick={() =>
                      void downloadZipOf(catReady, `${activePeriodMeta.fileSlug}-${category.id}.zip`)
                    }
                    className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[12px] disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Bu dalı ZIP indir ({catReady.length})
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                    {personQuery ? 'Aramayla eşleşen satır yok.' : 'Bu kategoride satır yok.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-[14px]">
                      <thead>
                        <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                          <th className="px-5 py-3 font-medium sm:px-6">Sıra</th>
                          <th className="px-3 py-3 font-medium">İsim / Takım</th>
                          <th className="px-3 py-3 font-medium">Foto</th>
                          <th className="px-5 py-3 text-right font-medium sm:px-6">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((entry) => {
                          const item = rankItemForEntry(entry);
                          const people = entry.people.map((p) => resolvePerson(p.name, p.key));
                          const names = people.map((p) => p.displayName).join(' & ');
                          const missingPhoto = people.some((p) => !p.photoUrl);
                          const canDownload = Boolean(item?.templateUrl);
                          return (
                            <tr
                              key={entry.id}
                              className="border-b border-[var(--z-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)]"
                            >
                              <td className="px-5 py-3 tabular-nums text-[var(--z-fg)] sm:px-6">
                                {rankText(entry.rank)}
                              </td>
                              <td className="px-3 py-3 font-medium text-[var(--z-fg)]">{names}</td>
                              <td className="px-3 py-3 text-[12px] text-[var(--z-muted)]">
                                {missingPhoto ? (
                                  <span className="inline-flex items-center gap-1 text-amber-500">
                                    <ImageOff className="h-3.5 w-3.5" /> Eksik
                                  </span>
                                ) : (
                                  'Tamam'
                                )}
                              </td>
                              <td className="px-5 py-3 sm:px-6">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={!canDownload || !item || downloadingKey === item.key}
                                    onClick={() => item && void downloadOne(item)}
                                    className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-40"
                                  >
                                    {item && downloadingKey === item.key ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Download className="h-3.5 w-3.5" />
                                    )}
                                    PNG
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canDownload || !item}
                                    onClick={() => item && openEditor(item)}
                                    className="z-btn-icon h-9 w-9 disabled:opacity-40"
                                    aria-label="Fotoğrafı ayarla"
                                  >
                                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}

          {activePeriod && isCertificatePeriod(activePeriod) ? (
            <section className="z-card overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-[var(--z-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <p className="text-[16px] font-semibold text-[var(--z-fg)]">Sertifika</p>
                  <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                    Danışman × çeyrek · tüm başarılar tek PDF · A4 yatay 300 DPI
                    {` · ${certItems.length} adet`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!certItems.length || Boolean(exporting)}
                  onClick={() => void downloadCertZip()}
                  className="z-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[12px] disabled:opacity-40"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Tüm sertifikalar PDF ZIP ({certItems.length})
                </button>
              </div>
              {!certItems.length ? (
                <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                  {personQuery
                    ? 'Aramayla eşleşen sertifika yok.'
                    : 'Bu çeyrekte sertifika satırı yok.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                        <th className="px-5 py-3 font-medium sm:px-6">İsim</th>
                        <th className="px-3 py-3 font-medium">Başarılar</th>
                        <th className="px-5 py-3 text-right font-medium sm:px-6">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certItems.map((item) => (
                        <tr
                          key={item.key}
                          className="border-b border-[var(--z-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)]"
                        >
                          <td className="px-5 py-3 font-medium text-[var(--z-fg)] sm:px-6">
                            {item.label}
                          </td>
                          <td className="px-3 py-3 text-[13px] text-[var(--z-muted)]">
                            {item.achievements.join(' · ')}
                          </td>
                          <td className="px-5 py-3 sm:px-6">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={downloadingKey === item.key || Boolean(exporting)}
                                onClick={() => void downloadCertPdf(item)}
                                className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-40"
                              >
                                {downloadingKey === item.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" />
                                )}
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          <section className="z-card overflow-hidden p-0">
            <div className="border-b border-[var(--z-border)] px-5 py-4 sm:px-6">
              <p className="text-[16px] font-semibold text-[var(--z-fg)]">Ödülünüz var</p>
              <p className="mt-0.5 text-[12px] text-[var(--z-muted)]">
                Kişi görselleri + Takım Verimliliği’ndeki takımların şeritleri
                {!RANK_TEMPLATES[activePeriod].award
                  ? ' · template bekleniyor (indirme kapalı)'
                  : ` · ${awardItems.length} görsel`}
              </p>
            </div>
            {!awardItems.length ? (
              <p className="px-5 py-8 text-center text-[13px] text-[var(--z-muted)] sm:px-6">
                {personQuery ? 'Aramayla eşleşen ödül yok.' : 'Bu dönemde ödül satırı yok.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-[var(--z-border)] text-[12px] uppercase tracking-wide text-[var(--z-muted)]">
                      <th className="px-5 py-3 font-medium sm:px-6">Kişi / Takım</th>
                      <th className="px-3 py-3 font-medium">Dallar</th>
                      <th className="px-5 py-3 text-right font-medium sm:px-6">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awardItems.map((item) => {
                      const missingPhoto = item.people.some((p) => !p.photoUrl);
                      const canDownload = Boolean(item.templateUrl);
                      const isTeam = Boolean(item.teamId);
                      return (
                        <tr
                          key={item.key}
                          className="border-b border-[var(--z-border)] last:border-0 hover:bg-[color-mix(in_srgb,var(--z-elevated)_55%,transparent)]"
                        >
                          <td className="px-5 py-3 font-medium text-[var(--z-fg)] sm:px-6">
                            {item.label}
                            {isTeam ? (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--z-border)] px-2 py-0.5 text-[10px] font-normal text-[var(--z-muted)]">
                                <Users className="h-3 w-3" /> Takım şeridi
                              </span>
                            ) : null}
                            {missingPhoto ? (
                              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-500">
                                <ImageOff className="h-3 w-3" /> Foto eksik
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-[13px] text-[var(--z-muted)]">
                            {item.detail.replace(/^.*?· Ödülünüz var · /, '')}
                          </td>
                          <td className="px-5 py-3 sm:px-6">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={!canDownload || downloadingKey === item.key}
                                onClick={() => void downloadOne(item)}
                                className="z-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-40"
                              >
                                {downloadingKey === item.key ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                PNG
                              </button>
                              <button
                                type="button"
                                disabled={!canDownload}
                                onClick={() => openEditor(item)}
                                className="z-btn-icon h-9 w-9 disabled:opacity-40"
                                aria-label={
                                  isTeam ? 'Takım şeridini ayarla' : 'Fotoğrafı ayarla'
                                }
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
            </>
          ) : null}
        </div>
      )}

      {teamStripEdit && activePeriod ? (
        <RankingTeamStripStudio
          canSave={canSave}
          embed={{
            periodId: activePeriod,
            teamId: teamStripEdit,
            onClose: () => setTeamStripEdit(null),
          }}
        />
      ) : null}

      {editing && typeof document !== 'undefined' ? createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--z-scrim)] p-4 backdrop-blur-md"
          onClick={requestClose}
        >
          <div
            className="z-modal zebra-sheet-enter flex max-h-[92vh] w-full max-w-4xl flex-col gap-6 overflow-y-auto p-5 sm:p-7 md:grid md:grid-cols-[minmax(0,1fr)_280px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="relative mx-auto aspect-[4/5] w-full max-w-[calc(80vh*0.8)] shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[var(--z-elevated)] active:cursor-grabbing"
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
                aria-label={editing.label}
              />
              {gridKind ? <AlignGridOverlay grid={gridDraft} /> : null}
              {!previewReady ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--z-muted)]" />
                </div>
              ) : null}
            </div>
            <div className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="z-page-kicker">{editing.kind === 'award' ? 'Ödülünüz var' : 'Sıralama'}</p>
                  <p className="mt-2 text-[17px] font-medium text-[var(--z-fg)]">{editing.label}</p>
                  <p className="mt-1 text-[12px] text-[var(--z-muted)]">{editing.detail}</p>
                </div>
                <button type="button" onClick={requestClose} className="z-btn-icon h-9 w-9" aria-label="Kapat">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-6 text-[12px] leading-relaxed text-[var(--z-muted)]">
                {editing.people.length > 1
                  ? 'Kişi seçip önizlemede sürükleyin. Kayıt tüm aylarda bu ikili/grup için geçerli (ödül ve sıralama ayrı).'
                  : 'Fotoğrafı önizlemede sürükleyerek kaydırın. Kayıt tüm aylarda bu kişi için geçerli (ödül ve sıralama ayrı).'}
              </p>

              {editing.people.length > 1 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {editing.people.map((person, index) => (
                    <button
                      key={person.key}
                      type="button"
                      onClick={() => setEditPersonIndex(index)}
                      className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                        editPersonIndex === index
                          ? 'border-[var(--z-fg)] bg-[var(--z-fg)] text-[var(--z-bg)]'
                          : 'border-[var(--z-border)] text-[var(--z-muted)] hover:border-[var(--z-fg)]/40 hover:text-[var(--z-fg)]'
                      }`}
                    >
                      {personShortLabel(person)}
                    </button>
                  ))}
                </div>
              ) : null}

              {(
                [
                  { id: 'scale', label: 'Boyut', min: 0.6, max: 1.6, step: 0.01, format: (v: number) => `%${Math.round(v * 100)}` },
                  { id: 'dx', label: 'Yatay', min: -OFFSET_LIMIT, max: OFFSET_LIMIT, step: 1, format: (v: number) => `${v}px` },
                  { id: 'dy', label: 'Dikey', min: -OFFSET_LIMIT, max: OFFSET_LIMIT, step: 1, format: (v: number) => `${v}px` },
                ] as const
              ).map((control) => (
                <label key={control.id} className="mt-5 block">
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

              {RANK_PERIODS.find((p) => p.id === editing.periodId)?.kind === 'quarter' ? (
                <button
                  type="button"
                  onClick={() =>
                    updateActivePerson({ flipH: !activePersonAdjust.flipH })
                  }
                  className={`mt-5 inline-flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left text-[13px] transition-colors ${
                    activePersonAdjust.flipH
                      ? 'border-[var(--z-fg)] bg-[var(--z-fg)]/5 text-[var(--z-fg)]'
                      : 'border-[var(--z-border)] text-[var(--z-muted)] hover:border-[var(--z-fg)]/40 hover:text-[var(--z-fg)]'
                  }`}
                  aria-pressed={Boolean(activePersonAdjust.flipH)}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <FlipHorizontal2 className="h-4 w-4 shrink-0" />
                    Yatay çevir
                    {editing.people.length > 1
                      ? ` (${personShortLabel(editing.people[editPersonIndex]!)})`
                      : ''}
                  </span>
                  <span className="text-[12px] tabular-nums">
                    {activePersonAdjust.flipH ? 'Açık' : 'Kapalı'}
                  </span>
                </button>
              ) : null}

              {editing.kind === 'award' &&
              RANK_PERIODS.find((p) => p.id === editing.periodId)?.kind === 'quarter' ? (
                <div className="mt-6 rounded-xl border border-[var(--z-border)] bg-[var(--z-elevated)]/40 p-3">
                  <p className="text-[12px] font-medium text-[var(--z-fg)]">
                    İsim outer glow (çeyrek ödül · global)
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--z-muted)]">
                    Siyah · II ve III çeyrek Ödülünüz var isimlerine ortak
                  </p>
                  <label className="mt-3 block">
                    <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                      <span>Blur</span>
                      <span className="tabular-nums text-[var(--z-fg)]">
                        {nameGlowDraft.blur}px
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={QUARTER_AWARD_NAME_GLOW_BLUR_MAX}
                      step={1}
                      value={Math.min(nameGlowDraft.blur, QUARTER_AWARD_NAME_GLOW_BLUR_MAX)}
                      onChange={(e) =>
                        setNameGlowDraft((g) =>
                          normalizeNameGlow({
                            ...g,
                            blur: Number(e.target.value),
                            color: '#000000',
                          })
                        )
                      }
                      className="mt-2 w-full accent-[var(--z-fg)]"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="flex justify-between text-[12px] text-[var(--z-muted)]">
                      <span>Opaklık</span>
                      <span className="tabular-nums text-[var(--z-fg)]">
                        %{Math.round(nameGlowDraft.opacity * 100)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={nameGlowDraft.opacity}
                      onChange={(e) =>
                        setNameGlowDraft((g) =>
                          normalizeNameGlow({
                            ...g,
                            opacity: Number(e.target.value),
                            color: '#000000',
                          })
                        )
                      }
                      className="mt-2 w-full accent-[var(--z-fg)]"
                    />
                  </label>
                  {canSave ? (
                    <button
                      type="button"
                      disabled={!nameGlowDirty}
                      onClick={() => void saveNameGlow()}
                      className="z-btn-ghost mt-3 w-full px-3 py-2 text-[12px] disabled:opacity-40"
                    >
                      {nameGlowDirty ? 'Glow ayarını kaydet' : 'Glow kaydedildi'}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {gridKind ? (
                <AlignGridControls
                  kind={gridKind}
                  grid={gridDraft}
                  canSave={canSave}
                  dirty={gridDirty}
                  hasSaved={Boolean(adjustments[alignGridKey(gridKind)])}
                  onChange={(patch) =>
                    setGridDraft((g) => normalizeAlignGrid({ ...g, ...patch }))
                  }
                  onSave={() => void saveGridDraft()}
                  onReset={() => setGridDraft({ ...DEFAULT_ALIGN_GRID })}
                />
              ) : null}

              <div className="mt-auto flex flex-col gap-2 pt-8">
                <AdjustSaveActions
                  canSave={canSave}
                  dirty={dirty}
                  hasSaved={Boolean(
                    lookupPeopleAdjust(
                      adjustments as Record<string, unknown>,
                      editing.adjustKey,
                      editing.people.map((p) => p.key)
                    )
                  )}
                  onSave={saveDraft}
                  onResetScreen={() => setDraft(defaultRankAdjust(editing.people.length))}
                  onDeleteSaved={async () => {
                    await removeAdjust(editing.adjustKey);
                    const peopleKeys = editing.people.map((p) => p.key);
                    const suffix = `|${peopleKeys.join('+')}`;
                    for (const key of Object.keys(adjustments)) {
                      if (key.startsWith('period|') && key.endsWith(suffix)) {
                        await removeAdjust(key);
                      }
                    }
                    setDraft(defaultRankAdjust(editing.people.length));
                  }}
                />
                <button
                  type="button"
                  onClick={() => void downloadOne(editing, draft)}
                  className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
                >
                  <Download className="h-3.5 w-3.5" /> PNG indir
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {unsavedDialog}
    </div>
  );
}
