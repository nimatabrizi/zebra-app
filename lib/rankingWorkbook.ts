'use client';

import { supabase } from '../supabaseClient';
import type { ParsedRankings } from './rankingVisuals';

const TABLE = 'ranking_workbook';
const ROW_ID = 'current';
const LEGACY_KEY = 'zebra-siralama-excel-v1';

export type RankingWorkbookSnapshot = {
  fileName: string;
  parsed: ParsedRankings;
  savedAt: string;
};

function readLegacy(): RankingWorkbookSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as RankingWorkbookSnapshot;
    if (!data?.parsed?.entries || !Array.isArray(data.parsed.entries)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeLegacy(snapshot: RankingWorkbookSnapshot | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!snapshot) localStorage.removeItem(LEGACY_KEY);
    else localStorage.setItem(LEGACY_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Sistem kaydı; tablo yoksa / hata olursa localStorage. */
const DEFAULT_SNAPSHOT_URL = '/templates/siralama/Siralamalar_2026.json';
const BUNDLED_SEED_FLAG = 'zebra-siralama-seed-v';
const BUNDLED_SEED_VERSION = '2026-umur-q3-1';

async function loadBundledSnapshot(): Promise<RankingWorkbookSnapshot | null> {
  try {
    const res = await fetch(DEFAULT_SNAPSHOT_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as RankingWorkbookSnapshot;
    if (!data?.parsed?.entries?.length) return null;
    return {
      fileName: data.fileName || 'Siralamalar_2026.xlsx',
      parsed: data.parsed,
      savedAt: data.savedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function readSeedFlag(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(BUNDLED_SEED_FLAG);
  } catch {
    return null;
  }
}

function writeSeedFlag(version: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BUNDLED_SEED_FLAG, version);
  } catch {
    /* ignore */
  }
}

/** III. çeyrek Ciro 10 — Ödülünüz var (toplantı); eski kayıtlara enjekte */
const UMUR_Q3_CIRO_ENTRY = {
  id: '2026-q3|ciro|10|umur-konuk',
  periodId: '2026-q3' as const,
  category: 'ciro' as const,
  rank: 10,
  rawName: 'UMUR KONUK',
  people: [{ name: 'UMUR KONUK', key: 'umur-konuk' }],
};

function ensureUmurQ3AwardEntry(parsed: ParsedRankings): ParsedRankings {
  const has = parsed.entries.some(
    (e) =>
      e.periodId === '2026-q3' &&
      e.category === 'ciro' &&
      e.people.some((p) => p.key === 'umur-konuk')
  );
  if (has) return parsed;
  return { ...parsed, entries: [...parsed.entries, UMUR_Q3_CIRO_ENTRY] };
}

function withEnsuredExtras(snapshot: RankingWorkbookSnapshot): RankingWorkbookSnapshot {
  const parsed = ensureUmurQ3AwardEntry(snapshot.parsed);
  if (parsed === snapshot.parsed) return snapshot;
  return { ...snapshot, parsed };
}

export async function loadRankingWorkbook(): Promise<RankingWorkbookSnapshot | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('file_name, parsed, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (!error && data?.parsed) {
    const parsed = data.parsed as ParsedRankings;
    if (parsed?.entries && Array.isArray(parsed.entries) && parsed.entries.length) {
      const snapshot = withEnsuredExtras({
        fileName: String(data.file_name || 'Kayıtlı Excel'),
        parsed,
        savedAt: String(data.updated_at || new Date().toISOString()),
      });
      // Yerel yedek her zaman dursun — tablo/RLS kopunca Excel kaybolmasın
      writeLegacy(snapshot);
      writeSeedFlag(BUNDLED_SEED_VERSION);
      return snapshot;
    }
  }

  const legacy = readLegacy();
  const seedOk = readSeedFlag() === BUNDLED_SEED_VERSION;

  // Yeni paket (budur→Zebra) bir kez zorunlu yüklenir; sonra kullanıcı düzeni korunur
  if (!seedOk || !legacy?.parsed?.entries?.length) {
    const bundled = await loadBundledSnapshot();
    if (bundled) {
      const snapshot = withEnsuredExtras(bundled);
      writeLegacy(snapshot);
      writeSeedFlag(BUNDLED_SEED_VERSION);
      return snapshot;
    }
  }

  if (legacy?.parsed?.entries?.length) return withEnsuredExtras(legacy);
  return null;
}

export async function saveRankingWorkbook(
  fileName: string,
  parsed: ParsedRankings
): Promise<{ ok: boolean; system: boolean }> {
  const snapshot: RankingWorkbookSnapshot = {
    fileName,
    parsed,
    savedAt: new Date().toISOString(),
  };

  // Önce yerel yedek; sistem kaydı başarısız olsa bile Excel kaybolmaz
  writeLegacy(snapshot);

  const { error } = await supabase.from(TABLE).upsert(
    {
      id: ROW_ID,
      file_name: fileName,
      parsed,
      updated_by: await currentUserId(),
      updated_at: snapshot.savedAt,
    },
    { onConflict: 'id' }
  );

  if (error) {
    return { ok: true, system: false };
  }
  return { ok: true, system: true };
}

export async function clearRankingWorkbook(): Promise<{ system: boolean }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', ROW_ID);
  writeLegacy(null);
  return { system: !error };
}
