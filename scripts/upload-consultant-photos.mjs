#!/usr/bin/env node
/**
 * Danışman PNG → Supabase Storage (consultant-photos)
 *
 * Kullanım:
 *   npm run upload:consultant-photos
 *   npm run upload:consultant-photos -- "/path/to/folder"
 *
 * Dosyalar ASCII slug olarak yüklenir:
 *   "Cahit Erez.png" → cahit-erez.png
 *   "Ayşe Yılmaz.png" → ayse-yilmaz.png
 *
 * App tarafı: lib/formatName.ts → toConsultantPhotoSlug()
 */

import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import { homedir } from 'node:os';

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

function toTitleCaseName(value) {
  if (value == null) return '';
  const raw = String(value).normalize('NFC').trim();
  if (!raw) return '';
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase('tr-TR');
      if (!lower) return '';
      const first = lower.charAt(0).toLocaleUpperCase('tr-TR');
      return `${first}${lower.slice(1)}`;
    })
    .join(' ');
}

/** lib/formatName.ts → toConsultantPhotoSlug ile BİREBİR aynı */
function toConsultantPhotoSlug(value) {
  const titled = toTitleCaseName(value);
  if (!titled) return '';

  let normalized = titled.toLocaleLowerCase('tr-TR');
  normalized = normalized
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const BUCKET = 'consultant-photos';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`
Eksik ortam değişkeni.
Gerekli: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
`);
  process.exit(1);
}

const defaultDir = join(homedir(), 'Desktop', 'Danışman PNG');
const sourceDir = resolve(process.argv[2] || defaultDir);

if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
  console.error(`Klasör bulunamadı: ${sourceDir}`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureBucket() {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw listErr;
  const exists = (buckets || []).some((b) => b.name === BUCKET);
  if (exists) {
    console.log(`✓ Bucket mevcut: ${BUCKET}`);
    return;
  }
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (error) throw error;
  console.log(`✓ Bucket oluşturuldu (public): ${BUCKET}`);
}

function collectPngs(dir) {
  const bySlug = new Map();

  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    if (extname(name).toLowerCase() !== '.png') continue;

    const nfc = name.normalize('NFC');
    const base = basename(nfc, extname(nfc));
    const slug = toConsultantPhotoSlug(base);
    if (!slug) {
      console.warn(`  ! Atlandı (slug yok): ${name}`);
      continue;
    }
    const objectName = `${slug}.png`;
    const entry = {
      localPath: join(dir, name),
      objectName,
      displayName: toTitleCaseName(base),
      original: name,
    };

    if (bySlug.has(slug)) {
      console.warn(
        `  ! Çakışma: ${bySlug.get(slug).original} ve ${name} → ${objectName} (sonuncusu kullanılır)`
      );
    }
    bySlug.set(slug, entry);
  }

  return [...bySlug.values()].sort((a, b) =>
    a.objectName.localeCompare(b.objectName, 'en')
  );
}

async function uploadOne(file) {
  const body = readFileSync(file.localPath);
  const { error } = await admin.storage.from(BUCKET).upload(file.objectName, body, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw error;
}

async function main() {
  console.log(`Kaynak: ${sourceDir}`);
  console.log(`Hedef:  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/\n`);

  await ensureBucket();

  const files = collectPngs(sourceDir);
  console.log(`${files.length} PNG yüklenecek (ASCII slug).\n`);

  let ok = 0;
  let fail = 0;

  for (const file of files) {
    try {
      await uploadOne(file);
      ok += 1;
      console.log(`  ✓ ${file.objectName}  ← ${file.displayName}`);
    } catch (err) {
      fail += 1;
      console.error(`  ✗ ${file.objectName}: ${err.message || err}`);
    }
  }

  console.log(`\nBitti: ${ok} başarılı, ${fail} hata.`);

  const sample =
    files.find((f) => f.objectName === 'cahit-erez.png') || files[0];
  if (sample) {
    const { data } = admin.storage.from(BUCKET).getPublicUrl(sample.objectName);
    console.log(`\nÖrnek public URL:\n  ${data.publicUrl}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
