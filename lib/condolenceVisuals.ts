/**
 * Vefat görseli — 1080×1920 canvas çizimi.
 * Ölçüler "vefat örnek" tasarımından piksel bazında alındı (Bebas Neue Pro Regular 52px,
 * satır aralığı 66px, paragraf arası +46px, metin rengi rgb(198,198,198), isim Bold beyaz).
 */

import { loadRankImage } from './rankingVisuals';

export const CONDOLENCE_CANVAS = { width: 1080, height: 1920 } as const;

export const CONDOLENCE_ASSETS = { background: '/templates/vefat/back.jpg' } as const;

export const CONDOLENCE_FONTS = {
  regular: { family: 'Zebra Vefat', url: '/fonts/vefat/bebas-neue-pro-regular.ttf', weight: '400' },
  bold: { family: 'Zebra Vefat Bold', url: '/fonts/vefat/bebas-neue-pro-bold.ttf', weight: '700' },
} as const;

export const CONDOLENCE_LAYOUT = {
  centerX: 540,
  /** Kurdele ile logolar arasındaki metin alanı; blok bu alanın dikey ortasına oturur. */
  areaTop: 800,
  areaBottom: 1600,
  maxWidth: 800,
  fontSize: 52,
  minFontSize: 30,
  lineRatio: 66 / 52,
  paragraphRatio: 46 / 52,
  color: 'rgb(198,198,198)',
  boldColor: 'rgb(255,255,255)',
} as const;

/* ------------------------------------------------------------------ */
/* Türkçe ekler                                                        */
/* ------------------------------------------------------------------ */

const APOSTROPHE = '’';
const VOWELS = 'aeıioöuü';
const VOWEL_FOLD: Record<string, string> = { â: 'a', î: 'i', û: 'u' };
/** Son hecesi ince "l" ile okunan, kalın ünlüsüne rağmen ince ek alan isimler. */
const FRONT_L_NAMES = new Set([
  'kemal', 'celal', 'cemal', 'hilal', 'bilal', 'nihal', 'meral', 'ikbal', 'iclal',
  'neval', 'visal', 'lal', 'hayal', 'kemalettin', 'celalettin', 'cemalettin',
]);

function lastWord(text: string): string {
  const words = text.trim().split(/\s+/);
  const word = (words[words.length - 1] || '').replace(/[^\p{L}]/gu, '');
  return word
    .toLocaleLowerCase('tr-TR')
    .split('')
    .map((ch) => VOWEL_FOLD[ch] || ch)
    .join('');
}

function lastVowel(word: string): string | null {
  for (let i = word.length - 1; i >= 0; i -= 1) {
    if (VOWELS.includes(word[i]!)) return word[i]!;
  }
  return null;
}

function isFrontException(word: string) {
  return FRONT_L_NAMES.has(word);
}

/** a/e uyumu */
function harmony2(word: string): 'a' | 'e' {
  if (isFrontException(word)) return 'e';
  const v = lastVowel(word);
  return v && 'aıou'.includes(v) ? 'a' : 'e';
}

/** ı/i/u/ü uyumu */
function harmony4(word: string): 'ı' | 'i' | 'u' | 'ü' {
  if (isFrontException(word)) return 'i';
  const v = lastVowel(word);
  if (!v) return 'i';
  if (v === 'a' || v === 'ı') return 'ı';
  if (v === 'e' || v === 'i') return 'i';
  if (v === 'o' || v === 'u') return 'u';
  return 'ü';
}

function endsWithVowel(word: string) {
  return word.length > 0 && VOWELS.includes(word[word.length - 1]!);
}

/** Özel isim tamlayan eki: Özdemir → ’in, Koç → ’un, Kaya → ’nın */
export function genitiveSuffix(name: string): string {
  const word = lastWord(name);
  if (!word) return '';
  const v = harmony4(word);
  return `${APOSTROPHE}${endsWithVowel(word) ? 'n' : ''}${v}n`;
}

/** Cins isim tamlayan eki (kesmesiz): babası → babasının, arkadaşımız → arkadaşımızın */
export function withGenitive(noun: string): string {
  const word = lastWord(noun);
  if (!word) return noun;
  const v = harmony4(word);
  return `${noun}${endsWithVowel(word) ? 'n' : ''}${v}n`;
}

/** Cins isim yönelme eki (kesmesiz): arkadaşımız → arkadaşımıza, danışmanımız → danışmanımıza */
export function withDative(noun: string): string {
  const word = lastWord(noun);
  if (!word) return noun;
  return `${noun}${endsWithVowel(word) ? 'y' : ''}${harmony2(word)}`;
}

/* ------------------------------------------------------------------ */
/* Metin kurgusu                                                       */
/* ------------------------------------------------------------------ */

export const CONDOLENCE_TITLES = ['arkadaşımız', 'danışmanımız', 'yöneticimiz', 'çalışma arkadaşımız'] as const;

/** Yakınlık → son paragrafın açılışı */
export const CONDOLENCE_RELATIONS: { id: string; label: string; opening: string }[] = [
  { id: 'babası', label: 'Babası', opening: 'Babamıza' },
  { id: 'annesi', label: 'Annesi', opening: 'Annemize' },
  { id: 'eşi', label: 'Eşi', opening: 'Kendisine' },
  { id: 'kardeşi', label: 'Kardeşi', opening: 'Kardeşimize' },
  { id: 'oğlu', label: 'Oğlu', opening: 'Evladımıza' },
  { id: 'kızı', label: 'Kızı', opening: 'Evladımıza' },
  { id: 'dedesi', label: 'Dedesi', opening: 'Dedemize' },
  { id: 'babaannesi', label: 'Babaannesi', opening: 'Babaannemize' },
  { id: 'anneannesi', label: 'Anneannesi', opening: 'Anneannemize' },
  { id: 'kendisi', label: 'Kendisi (çalışanın vefatı)', opening: '' },
];

export const CONDOLENCE_PRAYERS = ['Sabah', 'Öğle', 'İkindi', 'Akşam', 'Yatsı', 'Cuma'] as const;

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const TR_WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export type CondolenceForm = {
  /** Çalışanın sıfatı: "arkadaşımız" */
  colleagueTitle: string;
  colleagueName: string;
  /** Boşsa otomatik: "’in" */
  colleagueSuffix: string;
  /** Yakınlık: "babası" | "kendisi" | serbest */
  relation: string;
  deceasedName: string;
  deceasedSuffix: string;
  /** YYYY-MM-DD */
  funeralDate: string;
  prayer: string;
  /** "Manisa Demirci Beyazıt" — sonuna "Camii’nde" eklenir */
  mosque: string;
  /** Boşsa yakınlıktan: "Babamıza" */
  opening: string;
};

export const EMPTY_CONDOLENCE_FORM: CondolenceForm = {
  colleagueTitle: 'arkadaşımız',
  colleagueName: '',
  colleagueSuffix: '',
  relation: 'babası',
  deceasedName: '',
  deceasedSuffix: '',
  funeralDate: '',
  prayer: 'İkindi',
  mosque: '',
  opening: '',
};

export function formatFuneralDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return '';
  return `${d} ${TR_MONTHS[m - 1]} ${y} ${TR_WEEKDAYS[date.getDay()]}`;
}

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/** İsim ve tarih satır sonunda bölünmesin. */
function keepTogether(value: string) {
  return value.replace(/ /g, '\u00A0');
}

function mosqueName(value: string) {
  return clean(value).replace(/\s+cami(i)?$/iu, '');
}

export function isSelfRelation(relation: string) {
  return clean(relation).toLocaleLowerCase('tr-TR') === 'kendisi';
}

export function defaultOpening(form: CondolenceForm): string {
  const relation = clean(form.relation).toLocaleLowerCase('tr-TR');
  if (relation === 'kendisi') {
    const title = clean(form.colleagueTitle);
    return title ? `Değerli ${withDative(title)}` : 'Kendisine';
  }
  return CONDOLENCE_RELATIONS.find((r) => r.id === relation)?.opening || 'Kendisine';
}

export function autoColleagueSuffix(form: CondolenceForm) {
  return genitiveSuffix(form.colleagueName);
}

export function autoDeceasedSuffix(form: CondolenceForm) {
  return genitiveSuffix(form.deceasedName);
}

/**
 * Formdan kurumsal metin: paragraflar boş satırla, zorunlu satır sonları "\n" ile,
 * kalın kısımlar **…** ile işaretlenir. Bilgisi olmayan cümle/paragraf metne girmez.
 */
export function buildCondolenceText(form: CondolenceForm): string {
  const title = clean(form.colleagueTitle);
  const colleague = keepTogether(clean(form.colleagueName));
  const deceased = keepTogether(clean(form.deceasedName));
  const relation = clean(form.relation);
  const self = isSelfRelation(relation);
  const colleagueSuffix = clean(form.colleagueSuffix) || genitiveSuffix(form.colleagueName);
  const deceasedSuffix = clean(form.deceasedSuffix) || genitiveSuffix(form.deceasedName);
  const paragraphs: string[] = [];

  if (self) {
    const subject = colleague
      ? `Değerli ${title ? `${title} ` : ''}**${colleague}**${colleagueSuffix}`
      : title
        ? `Değerli ${withGenitive(title)}`
        : '';
    if (subject) paragraphs.push(`${subject}\nvefatını derin bir üzüntüyle öğrenmiş bulunuyoruz.`);
  } else {
    const owner = colleague
      ? `Değerli ${title ? `${title} ` : ''}${colleague}${colleagueSuffix}`
      : title
        ? `Değerli ${withGenitive(title)}`
        : '';
    const kin = relation || 'yakını';
    const lost = deceased ? `kıymetli ${kin} **${deceased}**${deceasedSuffix}` : `kıymetli ${withGenitive(kin)}`;
    if (owner || deceased) {
      paragraphs.push(`${owner ? `${owner}\n` : ''}${lost} vefatını derin bir üzüntüyle öğrenmiş bulunuyoruz.`);
    }
  }

  const mosque = mosqueName(form.mosque);
  if (mosque) {
    const date = keepTogether(formatFuneralDate(form.funeralDate));
    const prayer = clean(form.prayer);
    const parts = [
      date ? `Cenazesi, ${date} günü` : 'Cenazesi,',
      `${prayer ? `${prayer} namazına müteakip ` : ''}${mosque} Camii${APOSTROPHE}nde kaldırılacaktır.`,
    ];
    paragraphs.push(date ? parts.join('\n') : parts.join(' '));
  }

  const opening = clean(form.opening) || defaultOpening(form);
  const wishTo =
    !self && title ? `${withDative(title)}, ailesine ve tüm sevenlerine` : 'ailesine ve tüm sevenlerine';
  paragraphs.push(`${opening} Allah${APOSTROPHE}tan rahmet;\n${wishTo}\nsabır ve başsağlığı diliyoruz.`);

  return paragraphs.join('\n\n');
}

export const CONDOLENCE_EXAMPLE_TEXT = [
  'Değerli arkadaşımız Aysun Özdemir’in\nkıymetli babası **Bekir Özdemir**’in vefatını derin bir üzüntüyle öğrenmiş bulunuyoruz.',
  'Cenazesi, 18 Temmuz 2026 Cumartesi günü\nİkindi namazına müteakip Manisa Demirci Beyazıt Camii’nde kaldırılacaktır.',
  'Babamıza Allah’tan rahmet;\narkadaşımıza, ailesine ve tüm sevenlerine\nsabır ve başsağlığı diliyoruz.',
].join('\n\n');

/* ------------------------------------------------------------------ */
/* Çizim                                                               */
/* ------------------------------------------------------------------ */

type Run = { text: string; bold: boolean };
type Token = Run & { width: number; space: boolean };
type Line = { tokens: Token[]; width: number };

/** "**kalın**" işaretlerini parçalara ayırır. */
export function parseRuns(line: string): Run[] {
  const runs: Run[] = [];
  const parts = line.split('**');
  parts.forEach((text, i) => {
    if (text) runs.push({ text, bold: i % 2 === 1 });
  });
  return runs;
}

/** Görselde görünen düz metin (işaretsiz). */
export function plainCondolenceText(text: string) {
  return text.replace(/\*\*/g, '').replace(/\u00A0/g, ' ');
}

let fontsPromise: Promise<void> | null = null;

function loadCondolenceFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    await Promise.all(
      Object.values(CONDOLENCE_FONTS).map(async ({ family, url, weight }) => {
        const face = new FontFace(family, `url(${url}) format("truetype")`, { weight });
        await face.load();
        document.fonts.add(face);
      })
    );
  })().catch((error) => {
    fontsPromise = null;
    throw error;
  });
  return fontsPromise;
}

function fontFor(bold: boolean, size: number) {
  const f = bold ? CONDOLENCE_FONTS.bold : CONDOLENCE_FONTS.regular;
  return `${f.weight} ${size}px "${f.family}"`;
}

function tokenize(ctx: CanvasRenderingContext2D, runs: Run[], size: number): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const piece of run.text.split(/([ \t]+)/)) {
      if (!piece) continue;
      const space = /^[ \t]+$/.test(piece);
      const text = space ? ' ' : piece;
      ctx.font = fontFor(run.bold && !space, size);
      tokens.push({ text, bold: run.bold, width: ctx.measureText(text).width, space });
    }
  }
  return tokens;
}

/** Kelimeleri gruplar; kalın isim + ’in gibi boşluksuz bitişik parçalar tek kelime sayılır. */
function words(tokens: Token[]): { parts: Token[]; width: number; spaceBefore: number }[] {
  const out: { parts: Token[]; width: number; spaceBefore: number }[] = [];
  let pendingSpace = 0;
  for (const token of tokens) {
    if (token.space) {
      pendingSpace = token.width;
      continue;
    }
    const last = out[out.length - 1];
    if (last && pendingSpace === 0) {
      last.parts.push(token);
      last.width += token.width;
    } else {
      out.push({ parts: [token], width: token.width, spaceBefore: out.length ? pendingSpace : 0 });
    }
    pendingSpace = 0;
  }
  return out;
}

function greedy(list: ReturnType<typeof words>, limit: number): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const word of list) {
    if (current && current.width + word.spaceBefore + word.width <= limit) {
      current.tokens.push({ text: ' ', bold: false, width: word.spaceBefore, space: true }, ...word.parts);
      current.width += word.spaceBefore + word.width;
    } else {
      current = { tokens: [...word.parts], width: word.width };
      lines.push(current);
    }
  }
  return lines;
}

/** Satırı doldurarak kırar (örnek tasarımdaki gibi); son satırda tek kelime kalmasın diye daraltır. */
function wrapLine(list: ReturnType<typeof words>, maxWidth: number): Line[] {
  const lines = greedy(list, maxWidth);
  const lonely = (result: Line[]) =>
    result.length > 1 && result[result.length - 1]!.tokens.every((t) => !t.space);
  if (!lonely(lines)) return lines;
  for (let limit = maxWidth - 10; limit > maxWidth * 0.6; limit -= 10) {
    const next = greedy(list, limit);
    if (next.length > lines.length) break;
    if (!lonely(next)) return next;
  }
  return lines;
}

type Layout = { size: number; paragraphs: Line[][]; height: number; widest: number };

function layoutText(ctx: CanvasRenderingContext2D, text: string, size: number): Layout {
  const { maxWidth, lineRatio, paragraphRatio } = CONDOLENCE_LAYOUT;
  const paragraphs = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .split('\n')
        .map((hard) => hard.trim())
        .filter(Boolean)
        .flatMap((hard) => wrapLine(words(tokenize(ctx, parseRuns(hard), size)), maxWidth))
    )
    .filter((lines) => lines.length);
  ctx.font = fontFor(false, size);
  const cap = ctx.measureText('H').actualBoundingBoxAscent || size * 0.7;
  const lineCount = paragraphs.reduce((sum, p) => sum + p.length, 0);
  const height = lineCount
    ? cap + (lineCount - 1) * size * lineRatio + (paragraphs.length - 1) * size * paragraphRatio
    : 0;
  const widest = Math.max(0, ...paragraphs.flat().map((line) => line.width));
  return { size, paragraphs, height, widest };
}

function fitLayout(ctx: CanvasRenderingContext2D, text: string): Layout {
  const { fontSize, minFontSize, areaTop, areaBottom, maxWidth } = CONDOLENCE_LAYOUT;
  let layout = layoutText(ctx, text, fontSize);
  for (let size = fontSize - 1; size >= minFontSize; size -= 1) {
    if (layout.height <= areaBottom - areaTop && layout.widest <= maxWidth) break;
    layout = layoutText(ctx, text, size);
  }
  return layout;
}

let backgroundPromise: Promise<HTMLImageElement> | null = null;

function loadBackground() {
  if (!backgroundPromise) {
    backgroundPromise = loadRankImage(CONDOLENCE_ASSETS.background)
      .then((image) => {
        if (!image) throw new Error('Vefat şablonu yüklenemedi');
        return image;
      })
      .catch((error) => {
        backgroundPromise = null;
        throw error;
      });
  }
  return backgroundPromise;
}

export async function renderCondolenceVisual(text: string): Promise<HTMLCanvasElement> {
  const [background] = await Promise.all([loadBackground(), loadCondolenceFonts()]);
  const { width: W, height: H } = CONDOLENCE_CANVAS;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tuval oluşturulamadı');

  ctx.drawImage(background, 0, 0, W, H);

  const { centerX, areaTop, areaBottom, lineRatio, paragraphRatio, color, boldColor } = CONDOLENCE_LAYOUT;
  const layout = fitLayout(ctx, text);
  if (!layout.paragraphs.length) return canvas;

  ctx.font = fontFor(false, layout.size);
  const cap = ctx.measureText('H').actualBoundingBoxAscent || layout.size * 0.7;
  let baseline = (areaTop + areaBottom) / 2 - layout.height / 2 + cap;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  let first = true;
  layout.paragraphs.forEach((lines) => {
    lines.forEach((line, i) => {
      if (!first) baseline += layout.size * (lineRatio + (i === 0 ? paragraphRatio : 0));
      first = false;
      let x = centerX - line.width / 2;
      for (const token of line.tokens) {
        if (!token.space) {
          ctx.font = fontFor(token.bold, layout.size);
          ctx.fillStyle = token.bold ? boldColor : color;
          ctx.fillText(token.text, x, baseline);
        }
        x += token.width;
      }
    });
  });

  return canvas;
}
