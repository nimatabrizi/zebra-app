'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { isNimaTabrizi, isPersonelRole } from './authIdentity';

/** visual_adjustments.studio değerleri */
export type VisualStudioId =
  | 'dogum-gunu'
  | 'yil-donumu'
  | 'giris'
  | 'siralama'
  | 'yaka-karti'
  | 'toplu';

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

/**
 * Stüdyo bazında kayıtlı konum/boyut ayarları (Supabase `visual_adjustments`).
 * Tablo yoksa ya da okunamazsa tarayıcıdaki eski localStorage kaydıyla çalışır.
 * Yetkili kullanıcıda eski localStorage kayıtları ilk açılışta veritabanına taşınır.
 */
export function useSavedAdjustments<T>(
  studio: VisualStudioId,
  options: { legacyStorageKey?: string; canSave: boolean }
) {
  const { legacyStorageKey, canSave } = options;
  const [saved, setSaved] = useState<Record<string, T>>({});
  const [ready, setReady] = useState(false);
  const localOnlyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const legacy = readLegacy<T>(legacyStorageKey);
      const { data, error } = await supabase.from(TABLE).select('item_key, adjust').eq('studio', studio);
      if (cancelled) return;
      if (error) {
        localOnlyRef.current = true;
        setSaved(legacy);
        setReady(true);
        return;
      }
      localOnlyRef.current = false;
      const remote: Record<string, T> = {};
      for (const row of data || []) remote[String(row.item_key)] = row.adjust as T;

      const pending = Object.entries(legacy).filter(([key]) => !(key in remote));
      if (canSave && legacyStorageKey) {
        let migrated = true;
        if (pending.length) {
          const userId = await currentUserId();
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
      if (cancelled) return;
      setSaved(remote);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [studio, legacyStorageKey, canSave]);

  const save = useCallback(
    async (key: string, value: T) => {
      if (!localOnlyRef.current) {
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
      setSaved((current) => {
        const next = { ...current, [key]: value };
        if (localOnlyRef.current) writeLegacy(legacyStorageKey, next);
        return next;
      });
    },
    [studio, legacyStorageKey]
  );

  const remove = useCallback(
    async (key: string) => {
      if (!localOnlyRef.current) {
        const { error } = await supabase.from(TABLE).delete().eq('studio', studio).eq('item_key', key);
        if (error) throw new Error(`Silinemedi: ${error.message}`);
      }
      setSaved((current) => {
        const next = { ...current };
        delete next[key];
        if (localOnlyRef.current) writeLegacy(legacyStorageKey, next);
        return next;
      });
    },
    [studio, legacyStorageKey]
  );

  return { saved, ready, save, remove };
}
