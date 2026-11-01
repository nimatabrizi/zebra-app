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
export async function loadRankingWorkbook(): Promise<RankingWorkbookSnapshot | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('file_name, parsed, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();

  if (!error && data?.parsed) {
    const parsed = data.parsed as ParsedRankings;
    if (parsed?.entries && Array.isArray(parsed.entries) && parsed.entries.length) {
      const snapshot: RankingWorkbookSnapshot = {
        fileName: String(data.file_name || 'Kayıtlı Excel'),
        parsed,
        savedAt: String(data.updated_at || new Date().toISOString()),
      };
      writeLegacy(null);
      return snapshot;
    }
  }

  return readLegacy();
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
    writeLegacy(snapshot);
    return { ok: true, system: false };
  }
  writeLegacy(null);
  return { ok: true, system: true };
}

export async function clearRankingWorkbook(): Promise<{ system: boolean }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', ROW_ID);
  writeLegacy(null);
  return { system: !error };
}
