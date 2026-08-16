import type { SupabaseClient } from '@supabase/supabase-js';

/** profiles satırına yaz — unvan kolonu yoksa otomatik düşür */
export async function upsertProfileRow(
  admin: SupabaseClient,
  row: Record<string, unknown>
) {
  let { error } = await admin.from('profiles').upsert(row, { onConflict: 'id' });
  if (error && /unvan/i.test(error.message) && 'unvan' in row) {
    const { unvan: _drop, ...rest } = row;
    ({ error } = await admin.from('profiles').upsert(rest, { onConflict: 'id' }));
  }
  return { error };
}

export async function updateProfileRow(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
) {
  let { error } = await admin.from('profiles').update(patch).eq('id', id);
  if (error && /unvan/i.test(error.message) && 'unvan' in patch) {
    const { unvan: _drop, ...rest } = patch;
    ({ error } = await admin.from('profiles').update(rest).eq('id', id));
  }
  return { error };
}
