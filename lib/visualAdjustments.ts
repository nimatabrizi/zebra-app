'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { isNimaTabrizi, isPersonelRole } from './authIdentity';

/** visual_adjustments.studio değerleri */
export type VisualStudioId =
  | 'dogum-gunu'
  | 'yil-donumu'
  | 'giris'
  | 'siralama'
  | 'yaka-karti'
  | 'toplu'
  | 'hos-geldin';

const TABLE = 'visual_adjustments';

/** Kayıtlı ayarları yazma yetkisi: personel + Nima Tabrizi (broker yalnızca görüntüler). */
export function canSaveVisualAdjustments(role?: string | null, fullName?: string | null): boolean {
  return isPersonelRole(role) || isNimaTabrizi(fullName);
}

export function sameAdjust(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readLegacy<T>(storageKey?: string): Record<string, T> {
  if (!storageKey || typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLegacy(storageKey: string | undefined, value: Record<string, unknown>) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* kota dolu olabilir */
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

type StudioBucket = {
  saved: Record<string, unknown>;
  ready: boolean;
  localOnly: boolean;
  /** Fetch bitene kadar / eski cevap gelince ezilmesin diye yerel yazmalar */
  overlaySet: Record<string, unknown>;
  overlayDel: Set<string>;
  listeners: Set<() => void>;
  loadGen: number;
  loading: boolean;
};

const buckets = new Map<string, StudioBucket>();

function getBucket(studio: VisualStudioId): StudioBucket {
  let bucket = buckets.get(studio);
  if (!bucket) {
    bucket = {
      saved: {},
      ready: false,
      localOnly: false,
      overlaySet: {},
      overlayDel: new Set(),
      listeners: new Set(),
      loadGen: 0,
      loading: false,
    };
    buckets.set(studio, bucket);
  }
  return bucket;
}

function notifyBucket(bucket: StudioBucket) {
  for (const listener of bucket.listeners) listener();
}

function mergeRemoteWithOverlays(
  remote: Record<string, unknown>,
  bucket: StudioBucket
): Record<string, unknown> {
  const next = { ...remote };
  for (const key of bucket.overlayDel) delete next[key];
  Object.assign(next, bucket.overlaySet);
  return next;
}

async function loadStudio(
  studio: VisualStudioId,
  legacyStorageKey: string | undefined,
  canSave: boolean
) {
  const bucket = getBucket(studio);
  const gen = ++bucket.loadGen;
  bucket.loading = true;
  const legacy = readLegacy<unknown>(legacyStorageKey);

  const { data, error } = await supabase.from(TABLE).select('item_key, adjust').eq('studio', studio);
  if (gen !== bucket.loadGen) return;

  if (error) {
    bucket.localOnly = true;
    bucket.saved = mergeRemoteWithOverlays(legacy, bucket);
    bucket.ready = true;
    bucket.loading = false;
    notifyBucket(bucket);
    return;
  }

  bucket.localOnly = false;
  const remote: Record<string, unknown> = {};
  for (const row of data || []) remote[String(row.item_key)] = row.adjust;

  const pending = Object.entries(legacy).filter(([key]) => !(key in remote));
  if (canSave && legacyStorageKey) {
    let migrated = true;
    if (pending.length) {
      const userId = await currentUserId();
      if (gen !== bucket.loadGen) return;
      const { error: upsertError } = await supabase.from(TABLE).upsert(
        pending.map(([item_key, adjust]) => ({ studio, item_key, adjust, updated_by: userId })),
        { onConflict: 'studio,item_key', ignoreDuplicates: true }
      );
      migrated = !upsertError;
      if (migrated) for (const [key, value] of pending) remote[key] = value;
    }
    if (migrated) {
      try {
        localStorage.removeItem(legacyStorageKey);
      } catch {
        /* yok sayılır */
      }
    }
  }

  if (gen !== bucket.loadGen) return;
  bucket.saved = mergeRemoteWithOverlays(remote, bucket);
  bucket.ready = true;
  bucket.loading = false;
  notifyBucket(bucket);
}

/**
 * Stüdyo bazında kayıtlı konum/boyut ayarları (Supabase `visual_adjustments`).
 * Aynı studio için tüm hook örnekleri ortak state paylaşır (ör. sıralama + takım şeridi).
 * Yerel kayıtlar, gecikmeli fetch cevabıyla ezilmez (overlay).
 */
export function useSavedAdjustments<T>(
  studio: VisualStudioId,
  options: { legacyStorageKey?: string; canSave: boolean }
) {
  const { legacyStorageKey, canSave } = options;
  const bucket = getBucket(studio);
  const [saved, setSaved] = useState<Record<string, T>>(() => bucket.saved as Record<string, T>);
  const [ready, setReady] = useState(bucket.ready);

  useEffect(() => {
    const sync = () => {
      setSaved(bucket.saved as Record<string, T>);
      setReady(bucket.ready);
    };
    bucket.listeners.add(sync);
    sync();
    void loadStudio(studio, legacyStorageKey, canSave);
    return () => {
      bucket.listeners.delete(sync);
    };
  }, [studio, legacyStorageKey, canSave, bucket]);

  const save = useCallback(
    async (key: string, value: T) => {
      const b = getBucket(studio);
      if (!b.localOnly) {
        const { error } = await supabase.from(TABLE).upsert(
          {
            studio,
            item_key: key,
            adjust: value,
            updated_by: await currentUserId(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'studio,item_key' }
        );
        if (error) throw new Error(`Kaydedilemedi: ${error.message}`);
      }
      b.overlayDel.delete(key);
      b.overlaySet[key] = value;
      b.saved = { ...b.saved, [key]: value };
      if (b.localOnly) writeLegacy(legacyStorageKey, b.saved);
      notifyBucket(b);
    },
    [studio, legacyStorageKey]
  );

  const remove = useCallback(
    async (key: string) => {
      const b = getBucket(studio);
      if (!b.localOnly) {
        const { error } = await supabase.from(TABLE).delete().eq('studio', studio).eq('item_key', key);
        if (error) throw new Error(`Silinemedi: ${error.message}`);
      }
      delete b.overlaySet[key];
      b.overlayDel.add(key);
      const next = { ...b.saved };
      delete next[key];
      b.saved = next;
      if (b.localOnly) writeLegacy(legacyStorageKey, b.saved);
      notifyBucket(b);
    },
    [studio, legacyStorageKey]
  );

  return { saved, ready, save, remove };
}
