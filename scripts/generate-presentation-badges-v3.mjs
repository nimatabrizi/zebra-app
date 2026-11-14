#!/usr/bin/env node
/**
 * Sunum görselleri 3 — rozet üretimi.
 * Kaynak: Desktop/SUNUM/ZEBRA (çeyrek=sarı kurdele, ay=beyaz kurdele).
 * Template’te yıldızlar var; yalnızca üst yay + derece çizilir (beyaz).
 *
 *   node scripts/generate-presentation-badges-v3.mjs --sample
 *   node scripts/generate-presentation-badges-v3.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSET = path.join(ROOT, 'public/templates/siralama/sunum3/rozet');
const FONT_PATH = path.join(ROOT, 'public/fonts/siralama/Anton-Regular.ttf');
const OUT = ASSET;

const TEMPLATE_AY = path.join(ASSET, '_template_ay.png');
const TEMPLATE_CEYREK = path.join(ASSET, '_template_ceyrek.png');

/** Çalışma çözünürlüğü — native 208×289 × SCALE */
const SCALE = 4;
const NATIVE_W = 208;
const NATIVE_H = 289;
const W = NATIVE_W * SCALE;
const H = NATIVE_H * SCALE;
const FINAL_W = NATIVE_W;
const FINAL_H = NATIVE_H;

const MONTHS = {
  '2026-05': 'MAYIS',
  '2026-06': 'HAZİRAN',
  '2026-07': 'TEMMUZ',
  '2026-08': 'AĞUSTOS',
  '2026-09': 'EYLÜL',
};
const QUARTERS = { '2026-q2': 'II. ÇEYREK', '2026-q3': 'III. ÇEYREK' };
const CAT_TEXT = {
  islem: 'İŞLEM',
  portfoy: 'PORTFÖY ALMA',
  ciro: 'CİRO',
  takim: 'TAKIM VERİMLİLİĞİ',
};
const CAT_MAX_RANK = { islem: 5, portfoy: 5, ciro: 10, takim: 5 };

const font = fontkit.openSync(FONT_PATH);
GlobalFonts.registerFromPath(FONT_PATH, 'AntonBadge');

function measureDisc(buf, width, height) {
  const on = (x, y) => {
    const o = (y * width + x) * 4;
    return buf[o + 3] > 40 && Math.max(buf[o], buf[o + 1], buf[o + 2]) > 30;
  };

  let peakHalf = 0;
  let peakY = 0;
  let peakCx = width / 2;
  const yMax = Math.floor(height * 0.55);
  for (let y = 0; y < yMax; y++) {
    let L = null;
    let R = null;
    for (let x = 0; x < width; x++) {
      if (on(x, y)) {
        if (L === null) L = x;
        R = x;
      }
    }
    if (L === null) continue;
    const half = (R - L) / 2;
    if (half > peakHalf) {
      peakHalf = half;
      peakY = y;
      peakCx = (L + R) / 2;
    }
  }

  const CX = peakCx;
  // Medalyon merkezi: en geniş satır biraz aşağısı (örnek 208px → ~100)
  const CY = peakY + height * 0.01;
  const outerR = peakHalf;

  // Örnek: yay üst halkada; 5. ortada yıldızların üstünde — çakışmasın
  const topTextR = Math.round(outerR * 0.50);
  const rankSize = Math.round(outerR * 0.72);

  return {
    CX,
    CY,
    rankCX: CX - outerR * 0.01,
    rankCY: CY + outerR * 0.16,
    arcCX: CX,
    arcCY: CY - outerR * 0.02,
    outerR,
    topTextR,
    rankSize,
  };
}

function glyphUnits(label) {
  const run = font.layout(label);
  const chars = [...label];
  return run.glyphs.map((g, i) => {
    const ch = chars[i];
    if (ch === ' ') return { ch, ink: font.unitsPerEm * 0.28 };
    const bb = g.cbox || g.bbox;
    return { ch, ink: Math.max(bb.maxX - bb.minX, g.advanceWidth * 0.7) };
  });
}

function fitAndPlace(label, radius, maxSpan, maxSize, minSize = 18) {
  const units = glyphUnits(label);
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    const pad = size * 0.08;
    const scale = size / font.unitsPerEm;
    const widths = units.map((u) => (u.ch === ' ' ? size * 0.28 : u.ink * scale + pad));
    const total = widths.reduce((a, b) => a + b, 0);
    if (total / radius <= maxSpan) {
      return { size, widths, units, span: total / radius };
    }
  }
  const size = minSize;
  const scale = size / font.unitsPerEm;
  const pad = size * 0.06;
  const widths = units.map((u) => (u.ch === ' ' ? size * 0.26 : u.ink * scale + pad));
  const total = widths.reduce((a, b) => a + b, 0);
  return { size, widths, units, span: Math.min(maxSpan, total / radius) };
}

function drawTopArc(ctx, geom, label) {
  const CX = geom.arcCX ?? geom.CX;
  const CY = geom.arcCY ?? geom.CY;
  const radius = geom.topTextR;
  const len = [...label].length;
  const maxSize =
    len >= 24
      ? 14 * SCALE
      : len >= 20
        ? 16 * SCALE
        : len >= 16
          ? 17 * SCALE
          : len >= 13
            ? 19 * SCALE
            : 20 * SCALE;
  const { size, widths, units, span } = fitAndPlace(
    label,
    radius,
    Math.PI * 0.98,
    maxSize,
    13 * SCALE
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${size}px AntonBadge`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let angle = -Math.PI / 2 - span / 2;
  for (let i = 0; i < units.length; i++) {
    const w = widths[i];
    const mid = angle + w / (2 * radius);
    if (units[i].ch !== ' ') {
      const x = CX + radius * Math.cos(mid);
      const y = CY + radius * Math.sin(mid);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillText(units[i].ch, 0, size * 0.32);
      ctx.restore();
    }
    angle += w / radius;
  }
}

function drawRank(ctx, geom, rank) {
  const size = geom.rankSize;
  const x = geom.rankCX ?? geom.CX;
  const y = geom.rankCY;
  const label = `${rank}.`;

  ctx.font = `400 ${size}px AntonBadge`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Hafif gölge — koyu zeminde okunaklılık
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillText(label, x + SCALE * 0.6, y + SCALE * 0.8);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x, y);
}

async function prepBase(srcPath) {
  const { data, info } = await sharp(srcPath)
    .resize(W, H, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(data);
  const geom = measureDisc(buf, info.width, info.height);
  const png = await sharp(buf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { png, geom };
}

function topLabel(period, cat) {
  const periodText = MONTHS[period] ? `${MONTHS[period]} AYI` : QUARTERS[period];
  return `${periodText} ${CAT_TEXT[cat]}`;
}

function drawBadge(baseImg, geom, label, rank) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(baseImg, 0, 0, W, H);
  drawTopArc(ctx, geom, label);
  drawRank(ctx, geom, rank);
  // Yıldızlar template’te — çizilmez
  return canvas.toBuffer('image/png');
}

async function writeFinal(hiPng, dest) {
  const out = await sharp(hiPng)
    .resize(FINAL_W, FINAL_H, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  fs.writeFileSync(dest, out);
  return out;
}

async function main() {
  if (!fs.existsSync(TEMPLATE_AY) || !fs.existsSync(TEMPLATE_CEYREK)) {
    console.error('Eksik template:', TEMPLATE_AY, TEMPLATE_CEYREK);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const sampleOnly = process.argv.includes('--sample');

  const ay = await prepBase(TEMPLATE_AY);
  const ceyrek = await prepBase(TEMPLATE_CEYREK);
  console.log('ay geom', ay.geom);
  console.log('ceyrek geom', ceyrek.geom);

  const ayImg = await loadImage(ay.png);
  const ceyrekImg = await loadImage(ceyrek.png);

  if (sampleOnly) {
    // Onay: III. ÇEYREK CİRO 5. (klasördeki örnekle aynı)
    const label = topLabel('2026-q3', 'ciro');
    const hi = drawBadge(ceyrekImg, ceyrek.geom, label, 5);
    const dest = path.join(OUT, '_ornek_onay.png');
    const destHi = path.join(OUT, '_ornek_onay_hi.png');
    fs.writeFileSync(destHi, hi);
    await writeFinal(hi, dest);
    // Ay örneği de (HAZİRAN AYI CİRO 5.)
    const ayLabel = topLabel('2026-06', 'ciro');
    const ayHi = drawBadge(ayImg, ay.geom, ayLabel, 5);
    await writeFinal(ayHi, path.join(OUT, '_ornek_onay_ay.png'));
    const t = Date.now();
    console.log(`Çeyrek onay: http://localhost:3000/templates/siralama/sunum3/rozet/_ornek_onay.png?t=${t}`);
    console.log(`Ay onay:     http://localhost:3000/templates/siralama/sunum3/rozet/_ornek_onay_ay.png?t=${t}`);
    console.log(`Referans:    http://localhost:3000/templates/siralama/sunum3/rozet/_ornek_ref_ceyrek.png`);
    return;
  }

  for (const f of fs.readdirSync(OUT)) {
    if (/^\d{4}/.test(f) || f.startsWith('_gen_')) {
      /* keep templates/refs/layouts */
    }
  }

  const periods = [
    ...Object.keys(MONTHS).map((p) => ({ period: p, ceyrek: false })),
    ...Object.keys(QUARTERS).map((p) => ({ period: p, ceyrek: true })),
  ];

  let n = 0;
  for (const { period, ceyrek: isCeyrek } of periods) {
    const base = isCeyrek ? ceyrekImg : ayImg;
    const geom = isCeyrek ? ceyrek.geom : ay.geom;
    for (const cat of ['islem', 'portfoy', 'ciro', 'takim']) {
      const label = topLabel(period, cat);
      const maxRank = CAT_MAX_RANK[cat] || 5;
      for (let rank = 1; rank <= maxRank; rank++) {
        const hi = drawBadge(base, geom, label, rank);
        await writeFinal(hi, path.join(OUT, `${period}_${cat}_${rank}.png`));
        n++;
      }
    }
    console.log('done', period);
  }
  console.log('generated', n, '→', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
