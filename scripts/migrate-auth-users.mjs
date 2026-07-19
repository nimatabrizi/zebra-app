#!/usr/bin/env node
/**
 * ZEBRA — Profiles → Supabase Auth toplu migration
 *
 * Her profiles satırı için:
 *   email    = generateEmailFromName(tam_isim)   ← login ile BİREBİR aynı
 *   password = normalizeWhatsappPassword(whatsapp_number)
 *   Auth user id = mevcut profiles.id (mümkünse) → RLS ile auth.uid() eşleşir
 *
 * Kullanım:
 *   1) .env.local içine ekleyin:
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...   (anon key DEĞİL — service_role)
 *   2) npm run migrate:auth
 *
 * generateEmailFromName / normalizeWhatsappPassword → lib/authIdentity.ts ile senkron tutun.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// --- env (.env.local) ---
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

// --- lib/authIdentity.ts ile BİREBİR aynı ---
function generateEmailFromName(name) {
  if (!name || typeof name !== 'string') return '';

  let normalized = name.trim().toLocaleLowerCase('tr-TR');

  normalized = normalized
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

  normalized = normalized
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  return `${normalized}@zebra.local`;
}

function normalizeWhatsappPassword(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let clean = raw.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('90')) clean = clean.substring(2);
  if (clean.startsWith('0')) clean = clean.substring(1);
  return clean;
}
// --- /aynı ---

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`
Eksik ortam değişkeni.
Gerekli:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY   ← Dashboard → Settings → API → service_role
`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUserByEmail(email) {
  // listUsers sayfalı; küçük ekipler için yeterli
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find(
      (u) => (u.email || '').toLowerCase() === email.toLowerCase()
    );
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function linkProfileToAuthUser(profile, authUserId, email) {
  if (profile.id === authUserId) {
    console.log(`  ✓ Zaten bağlı: ${profile.tam_isim} → ${authUserId}`);
    return { linked: true, updated: false };
  }

  // PK değişimi: eski satırı yeni id ile yeniden yaz (service_role)
  const { id: oldId, ...rest } = profile;
  const row = {
    ...rest,
    id: authUserId,
  };

  const { error: insertErr } = await admin.from('profiles').insert(row);
  if (insertErr) {
    // Belki yeni id zaten var — sadece metadata
    console.warn(`  ! profiles insert uyarısı (${profile.tam_isim}):`, insertErr.message);
  } else {
    const { error: delErr } = await admin.from('profiles').delete().eq('id', oldId);
    if (delErr) {
      console.warn(`  ! Eski profil silinemedi (${oldId}):`, delErr.message);
    }
  }

  console.log(`  ✓ Profil bağlandı: ${profile.tam_isim} ${oldId} → ${authUserId} (${email})`);
  return { linked: true, updated: true };
}

async function migrateOne(profile) {
  const tamIsim = (profile.tam_isim || '').trim();
  const email = generateEmailFromName(tamIsim);
  const password = normalizeWhatsappPassword(profile.whatsapp_number || '');

  if (!tamIsim || !email || email === '@zebra.local') {
    return { ok: false, skip: true, reason: 'geçersiz tam_isim' };
  }
  if (!password || password.length < 6) {
    return {
      ok: false,
      skip: true,
      reason: `whatsapp_number Auth şifresi için yetersiz (≥6): "${profile.whatsapp_number}"`,
    };
  }

  console.log(`\n→ ${tamIsim}`);
  console.log(`  email: ${email}`);
  console.log(`  role:  ${profile.role}`);

  // 1) Aynı email ile Auth kullanıcısı var mı?
  let existing = await findAuthUserByEmail(email);

  if (existing) {
    // Şifreyi mevcut whatsapp ile senkronla (login tutarlı kalsın)
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        tam_isim: tamIsim,
        role: profile.role,
      },
    });
    if (updErr) {
      console.warn(`  ! Şifre güncellenemedi:`, updErr.message);
    }
    await linkProfileToAuthUser(profile, existing.id, email);
    return { ok: true, created: false, userId: existing.id, email };
  }

  // 2) Mümkünse profiles.id ile Auth kullanıcısı oluştur (en temiz bağ)
  const createPayload = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      tam_isim: tamIsim,
      role: profile.role,
    },
  };

  // profile.id geçerli UUID ise Auth id olarak kullan
  if (
    typeof profile.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      profile.id
    )
  ) {
    createPayload.id = profile.id;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    createPayload
  );

  if (createErr) {
    // id çakışması → id vermeden tekrar dene
    if (createPayload.id) {
      console.warn(`  ! id ile oluşturma başarısız (${createErr.message}), yeniden deneniyor…`);
      delete createPayload.id;
      const retry = await admin.auth.admin.createUser(createPayload);
      if (retry.error) {
        return { ok: false, reason: retry.error.message };
      }
      await linkProfileToAuthUser(profile, retry.data.user.id, email);
      return { ok: true, created: true, userId: retry.data.user.id, email };
    }
    return { ok: false, reason: createErr.message };
  }

  const userId = created.user.id;
  if (userId !== profile.id) {
    await linkProfileToAuthUser(profile, userId, email);
  } else {
    console.log(`  ✓ Auth oluşturuldu (aynı id): ${userId}`);
  }

  return { ok: true, created: true, userId, email };
}

async function main() {
  console.log('ZEBRA Auth migration başlıyor…');
  console.log('URL:', SUPABASE_URL);

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('*')
    .order('tam_isim', { ascending: true });

  if (error) {
    console.error('profiles okunamadı:', error.message);
    process.exit(1);
  }

  if (!profiles?.length) {
    console.log('profiles tablosu boş.');
    return;
  }

  console.log(`${profiles.length} profil işlenecek.\n`);

  const summary = { ok: 0, fail: 0, skip: 0 };

  for (const profile of profiles) {
    try {
      const result = await migrateOne(profile);
      if (result.skip) {
        summary.skip += 1;
        console.log(`  ⊘ Atlandı: ${result.reason}`);
      } else if (result.ok) {
        summary.ok += 1;
      } else {
        summary.fail += 1;
        console.error(`  ✗ Hata: ${result.reason}`);
      }
    } catch (err) {
      summary.fail += 1;
      console.error(`  ✗ İstisna (${profile.tam_isim}):`, err.message || err);
    }
  }

  console.log('\n—— Özet ——');
  console.log(`Başarılı : ${summary.ok}`);
  console.log(`Atlanan  : ${summary.skip}`);
  console.log(`Hatalı   : ${summary.fail}`);
  console.log('\nLogin testi: Tam İsim + WhatsApp numarası (generateEmailFromName ile).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
