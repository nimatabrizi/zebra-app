#!/usr/bin/env node
/**
 * Generate presentation ranking badges from blank silver/gold templates.
 *
 * Layout (matches Desktop "rozet örnek.png"):
 *   - Period + category on the TOP arc only
 *   - Rank number optically centered on the inner disc
 *   - Star + flanking lines below the number
 *
 * Usage:
 *   node scripts/generate-presentation-badges.mjs --sample
 *   node scripts/generate-presentation-badges.mjs
 *
 * Requires: sharp, fontkit, @napi-rs/canvas
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

const SILVER = '/Users/selin360/Desktop/Sunum görselleri/Silver badge.png';
const GOLD = '/Users/selin360/Desktop/Sunum görselleri/golden badge.png';
const FONT_PATH = path.join(ROOT, 'public/fonts/siralama/Anton-Regular.ttf');
const OUT = path.join(ROOT, 'public/templates/siralama/sunum/rozet');

const W = 560;
const H = 696;
const FINAL_W = 280;
const FINAL_H = 348;

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

/** Kategori başına üretilecek derece üst sınırı */
const CAT_MAX_RANK = { islem: 5, portfoy: 5, ciro: 10, takim: 5 };

const font = fontkit.openSync(FONT_PATH);
GlobalFonts.registerFromPath(FONT_PATH, 'AntonBadge');

/**
 * Measure the medallion's inner circular face from a W×H raw RGBA buffer.
 * Ignores the lower ribbon flare when finding the disc center.
 */
function measureDisc(buf, width, height) {
  const on = (x, y) => {
    const o = (y * width + x) * 4;
    return buf[o + 3] > 40 && Math.max(buf[o], buf[o + 1], buf[o + 2]) > 30;
  };
  const bright = (x, y) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const o = (y * width + x) * 4;
    if (buf[o + 3] < 40) return 0;
    return Math.max(buf[o], buf[o + 1], buf[o + 2]);
  };

  // Widest row in upper 55% = horizontal diameter of the medallion (not ribbons)
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
  // Widest row ≈ medallion horizontal diameter; slight downward bias matches the
  // raised inner ring (sides sit farther than the top when centered on peakY).
  const CY = peakY + 12;
  const outerR = peakHalf;

  const radialGrad = (r) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const ang = ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
      if (ang > Math.PI * 0.25 && ang < Math.PI * 0.75) continue;
      const v1 = bright(CX + (r - 2) * Math.cos(a), CY + (r - 2) * Math.sin(a));
      const v2 = bright(CX + (r + 2) * Math.cos(a), CY + (r + 2) * Math.sin(a));
      sum += Math.abs(v2 - v1);
      n++;
    }
    return n ? sum / n : 0;
  };

  const scores = [];
  for (let r = Math.round(outerR * 0.55); r <= Math.round(outerR * 0.95); r++) {
    scores.push({ r, sc: radialGrad(r) });
  }
  scores.sort((a, b) => b.sc - a.sc);
  const ringOuter = scores[0].r;
  const ringInnerCand = scores.find((s) => s.r >= outerR * 0.78 && s.r <= outerR * 0.88);
  const ringInner = ringInnerCand ? ringInnerCand.r : ringOuter - 24;

  // From Desktop "rozet örnek" mapped to outerR≈240.5:
  // top ink peak ≈0.59·outerR, digit mid ≈ CY−6, star band ≈ CY+117
  const topTextR = Math.round(outerR * 0.59);
  const rankSize = Math.round(Math.min(236, outerR * 0.95));

  return {
    CX,
    CY,
    // Optical nudges so ink sits in the true inner-disc center
    rankCX: CX - 14,
    rankCY: CY + 26,
    // Top arc: slightly left + up vs geometric CX/CY
    arcCX: CX - 20,
    arcCY: CY - 14,
    outerR,
    ringOuter,
    ringInner,
    topTextR,
    textR: topTextR,
    rankSize,
    starY: CY + Math.round(outerR * 0.486) + 16,
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

function fitAndPlace(label, radius, maxSpan, maxSize, minSize = 22, minSpan = 0) {
  const units = glyphUnits(label);
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    let pad = size * 0.16;
    const scale = size / font.unitsPerEm;
    let widths = units.map((u) => (u.ch === ' ' ? size * 0.36 : u.ink * scale + pad));
    let total = widths.reduce((a, b) => a + b, 0);
    if (minSpan > 0 && total / radius < minSpan && total / radius <= maxSpan) {
      const target = Math.min(maxSpan, minSpan) * radius;
      const extra = (target - total) / Math.max(1, units.length - 1);
      widths = units.map((u, i) => {
        const base = u.ch === ' ' ? size * 0.36 : u.ink * scale + pad;
        return i < units.length - 1 ? base + extra : base;
      });
      total = widths.reduce((a, b) => a + b, 0);
    }
    if (total / radius <= maxSpan) {
      return { size, widths, units, span: total / radius };
    }
  }
  const size = minSize;
  const scale = size / font.unitsPerEm;
  const pad = size * 0.12;
  const widths = units.map((u) => (u.ch === ' ' ? size * 0.32 : u.ink * scale + pad));
  const total = widths.reduce((a, b) => a + b, 0);
  return { size, widths, units, span: Math.min(maxSpan, total / radius) };
}

function drawTopArc(ctx, geom, label) {
  const CX = geom.arcCX ?? geom.CX;
  const CY = geom.arcCY ?? geom.CY;
  const radius = geom.topTextR;
  const len = [...label].length;
  const maxSize =
    len >= 24 ? 26 : len >= 20 ? 30 : len >= 16 ? 34 : len >= 13 ? 38 : len >= 11 ? 42 : 46;
  const { size, widths, units, span } = fitAndPlace(label, radius, Math.PI * 1.05, maxSize, 20);

  ctx.fillStyle = '#1a1208';
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
  return size;
}

function drawRank(ctx, geom, rank) {
  const size = geom.rankSize;
  const x = geom.rankCX ?? geom.CX;
  const y = geom.rankCY;
  const label = `${rank}.`;
  // Engraved / debossed: light from top-left → dark lip TL, highlight BR
  const depth = Math.max(1.5, size * 0.012);

  ctx.font = `400 ${size}px AntonBadge`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Far wall catch-light (bottom-right inside the cut)
  ctx.fillStyle = 'rgba(255, 230, 170, 0.55)';
  ctx.fillText(label, x + depth, y + depth);

  // Shadow lip (top-left of the cut)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillText(label, x - depth, y - depth);

  // Main recessed fill
  ctx.fillStyle = '#1a1208';
  ctx.fillText(label, x, y);
}

/** Star + flanking hairlines — centered under the rank digit. */
function drawStarOrnament(ctx, geom) {
  const CX = geom.rankCX ?? geom.CX;
  const { starY } = geom;
  const scale = geom.outerR / 240.5;
  const starR = 18 * scale;
  const gap = 22 * scale;
  const lineW = 64 * scale;
  const lineH = Math.max(2.5, 3 * scale);

  ctx.fillStyle = '#1a1208';

  // five-point star
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const x = CX + starR * Math.cos(a);
    const y = starY + starR * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    const a2 = a + Math.PI / 5;
    const ir = starR * 0.4;
    ctx.lineTo(CX + ir * Math.cos(a2), starY + ir * Math.sin(a2));
  }
  ctx.closePath();
  ctx.fill();

  // flanking lines
  const ly = starY - lineH / 2;
  ctx.fillRect(CX - gap - lineW - starR * 0.2, ly, lineW, lineH);
  ctx.fillRect(CX + gap + starR * 0.2, ly, lineW, lineH);
}

async function prepBase(srcPath) {
  const { data, info } = await sharp(srcPath)
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(data);
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4;
    if (Math.max(buf[o], buf[o + 1], buf[o + 2]) < 18) {
      buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0;
    }
  }
  const geom = measureDisc(buf, info.width, info.height);
  const png = await sharp(buf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { png, geom };
}

/** Single top-arc label: "HAZİRAN AYI CİRO" / "II. ÇEYREK İŞLEM" */
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
  drawStarOrnament(ctx, geom);
  return canvas.toBuffer('image/png');
}

async function main() {
  if (!fs.existsSync(SILVER) || !fs.existsSync(GOLD)) {
    console.error('Missing badge templates on Desktop/Sunum görselleri');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const sampleOnly = process.argv.includes('--sample');

  const silver = await prepBase(SILVER);
  const gold = await prepBase(GOLD);
  console.log('silver geom', silver.geom);
  console.log('gold geom', gold.geom);

  const silverImg = await loadImage(silver.png);
  const goldImg = await loadImage(gold.png);

  if (sampleOnly) {
    // Approval samples: 2026-q2 / İŞLEM / ranks 1–10 (gold)
    const label = topLabel('2026-q2', 'islem');
    const t = Date.now();
    for (let rank = 1; rank <= 10; rank++) {
      const hi = drawBadge(goldImg, gold.geom, label, rank);
      const out = await sharp(hi)
        .resize(FINAL_W, FINAL_H, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();
      const dest = path.join(OUT, `_ornek_${rank}.png`);
      fs.writeFileSync(dest, out);
      if (rank === 4) {
        fs.writeFileSync(path.join(OUT, '_ornek_onay.png'), out);
        fs.writeFileSync(path.join(OUT, '_ornek_onay_hi.png'), hi);
      }
      console.log(`http://localhost:3000/templates/siralama/sunum/rozet/_ornek_${rank}.png?t=${t}`);
    }
    return;
  }

  for (const f of fs.readdirSync(OUT)) {
    if (f.startsWith('_')) fs.unlinkSync(path.join(OUT, f));
  }

  const periods = [
    ...Object.keys(MONTHS).map((p) => ({ period: p, gold: false })),
    ...Object.keys(QUARTERS).map((p) => ({ period: p, gold: true })),
  ];

  let n = 0;
  for (const { period, gold: isGold } of periods) {
    const base = isGold ? goldImg : silverImg;
    const geom = isGold ? gold.geom : silver.geom;
    for (const cat of ['islem', 'portfoy', 'ciro', 'takim']) {
      const label = topLabel(period, cat);
      const maxRank = CAT_MAX_RANK[cat] || 5;
      for (let rank = 1; rank <= maxRank; rank++) {
        const hi = drawBadge(base, geom, label, rank);
        const out = await sharp(hi)
          .resize(FINAL_W, FINAL_H, { kernel: sharp.kernel.lanczos3 })
          .png()
          .toBuffer();
        fs.writeFileSync(path.join(OUT, `${period}_${cat}_${rank}.png`), out);
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
