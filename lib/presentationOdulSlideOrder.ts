/**
 * SUNUM II-III ÇEYREK SIRALAMALAR PDF slayt sırası (1–70).
 * Sunum görselleri 2 ZIP / indirme dosya adları bu sırayı izler.
 */

import { normalizeRankKey } from './rankingVisuals';
import type { PresentationJob, PresentationQuarterId } from './rankingPresentation';

export type OdulSlideSpec = {
  slide: number;
  /** PDF’deki görünen ad (büyük harf) */
  name: string;
  quarterId: PresentationQuarterId;
  /** Dosya adı için: "II. ÇEYREK" */
  quarterFileLabel: string;
};

export const PRESENTATION_ODUL_SLIDE_ORDER: OdulSlideSpec[] = [
  // I. BÖLÜM — II. ÇEYREK
  { slide: 1, name: 'NURGÜN ALPDOĞAN', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 2, name: 'ÇAĞDAŞ YALÇINKAYA', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 3, name: 'BAŞAK ATABEK', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 4, name: 'MUSTAFA KARABOĞA', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 5, name: 'ŞENOL PEHLİVAN', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 6, name: 'AYNUR ÖZDEN', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 7, name: 'FIRAT ALPEREN ÜSKÜP', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 8, name: 'SELMA ÇELİK AVCIK', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 9, name: 'TURGAY KOCA', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 10, name: 'SERKAN ESKİT & SELİN ESKİT', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 11, name: 'SUAT ERİŞEN', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 12, name: 'HASAN KORKMAZ', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 13, name: 'ALPER TOPBAŞOĞLU', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 14, name: 'ESRA USLU', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 15, name: 'SEMİH NİHAT UYSAL', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 16, name: 'ÖZNUR KARA', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 17, name: 'HASAN VACİP TEKERBAŞ', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 18, name: 'GÖNÜL HANEGE', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 19, name: 'NERMİN KARAÇOCUK', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 20, name: 'AYŞE PULLU', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 21, name: 'MESUT KAYA', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 22, name: 'HÜLYA KURT', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 23, name: 'FAHRİYE TÜRKOĞLU', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 24, name: 'MELTEM ÇÜMEN', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 25, name: 'YUNUS ÖRÜK', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 26, name: 'YAVUZ DEMİRULUS', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 27, name: 'SERPİL GÜZELCE', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 28, name: 'CENGİZ ŞENGÜL', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 29, name: 'CAHİT EREZ', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 30, name: 'KAĞAN KAYMAZ', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 31, name: 'ZEYNEP ERYILMAZ', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 32, name: 'CORE TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 33, name: 'TRUST LINE TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 34, name: 'SIRIUS TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 35, name: 'FIRST TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 36, name: 'WEST TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 37, name: 'BEST SELLERS TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  { slide: 38, name: 'EXPERTİZ TEAM', quarterId: '2026-q2', quarterFileLabel: 'II. ÇEYREK' },
  // II. BÖLÜM — III. ÇEYREK
  { slide: 39, name: 'TURGAY KOCA', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 40, name: 'NURCAN GÜLER', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 41, name: 'EBRU BİÇER', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 42, name: 'CEYDA BİRDAL DEMİRULUS', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 43, name: 'İHSAN SUBAYOĞULLARI', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 44, name: 'GÖNÜL HANEGE', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 45, name: 'HÜLYA YETEK', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 46, name: 'SELMA ÇELİK AVCIK', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 47, name: 'SEVİL ÇALIŞKAN POLAT', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 48, name: 'MUSTAFA KARABOĞA', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 49, name: 'SERHAT PAKİŞ', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 50, name: 'ARZU ERGÜVEN', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 51, name: 'ÖZKAN AYDIN & ECEHAN KILIÇ', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 52, name: 'ÖZGE METE', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 53, name: 'UMUR KONUK', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 54, name: 'CENGİZ ŞENGÜL', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 55, name: 'ŞENOL PEHLİVAN', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 56, name: 'MELEK BİNOĞLU', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 57, name: 'CAHİT EREZ', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 58, name: 'HÜLYA KURT', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 59, name: 'EZGİ SEZER', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 60, name: 'YAVUZ DEMİRULUS', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 61, name: 'FİLİZ ŞENOL', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 62, name: 'FAHRİYE TÜRKOĞLU', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 63, name: 'RED BLUE TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 64, name: 'TRUST LINE TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 65, name: 'BEST SELLERS TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 66, name: 'PRIME TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 67, name: 'ÖZ TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 68, name: 'EXPERTİZ TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 69, name: 'FIRST TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
  { slide: 70, name: 'WEST TEAM', quarterId: '2026-q3', quarterFileLabel: 'III. ÇEYREK' },
];

function isTeamSlideName(name: string): boolean {
  return /\bteam\b/i.test(name);
}

function stripTeamSuffix(key: string): string {
  return key.replace(/\s+team$/, '').trim();
}

/**
 * Slayt ↔ job skoru. includes() yok — kısa takım id (oz/first) kişi adlarını çalmasın.
 * 0 = eşleşme yok.
 */
function scoreJobAgainstSlide(job: PresentationJob, slide: OdulSlideSpec): number {
  if (job.quarterId !== slide.quarterId) return 0;

  const slideIsTeam = isTeamSlideName(slide.name);
  const jobIsTeam = job.kind === 'team';
  // Kişi slaytı ↔ takım job (veya tersi) asla eşleşmesin
  if (slideIsTeam !== jobIsTeam) return 0;

  const slideWhole = normalizeRankKey(slide.name);
  const jobName = normalizeRankKey(job.displayName);
  const jobKey = normalizeRankKey(job.personKey); // id: "oz" | "best-sellers" → "best sellers"

  if (jobIsTeam) {
    const slideBase = stripTeamSuffix(slideWhole);
    const jobBase = stripTeamSuffix(jobName);
    if (jobName === slideWhole) return 100;
    if (jobBase && jobBase === slideBase) return 95;
    if (normalizeRankKey(`${jobBase} team`) === slideWhole) return 95;
    // Takım id tam eşleşmesi (oz ↔ "oz", best sellers ↔ "best sellers")
    if (jobKey && (jobKey === slideBase || jobKey === slideWhole)) return 90;
    return 0;
  }

  // Danışman — yalnızca tam ad / slug (ortaklar: "a & b" ↔ job.displayName)
  if (jobName === slideWhole) return 100;
  const slideAsSlug = slideWhole.replace(/\s+/g, '-');
  const jobKeyAsName = normalizeRankKey(
    String(job.personKey || '').replace(/\+/g, ' ').replace(/-/g, ' ')
  );
  if (jobKey && (jobKey === slideAsSlug || jobKeyAsName === slideWhole)) return 85;
  // Ortak: personKey "a+b" ↔ slayt adındaki her iki isim
  if (job.people && job.people.length > 1) {
    const parts = job.people.map((p) => normalizeRankKey(p.displayName)).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => slideWhole.includes(p))) return 80;
  }
  return 0;
}

function findBestJobIndex(remaining: PresentationJob[], slide: OdulSlideSpec): number {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < remaining.length; i += 1) {
    const score = scoreJobAgainstSlide(remaining[i]!, slide);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore > 0 ? bestIdx : -1;
}

export function presentationOdulDownloadName(
  slide: number,
  displayName: string,
  quarterFileLabel: string
): string {
  // PDF adları zaten doğru casing; tekrar tr-TR upper yapma (FIRST→FİRST olmasın)
  const name = displayName.normalize('NFC').trim();
  return `${slide} - ${name} - ${quarterFileLabel}.png`;
}

/**
 * V2 işlerini PDF slayt sırasına dizer; dosya adlarını numaralandırır.
 * Eşleşmeyen işler sona eklenir (güvenlik ağı).
 */
export function orderPresentationJobsByOdulSlides(jobs: PresentationJob[]): PresentationJob[] {
  const remaining = [...jobs];
  const ordered: PresentationJob[] = [];

  for (const slide of PRESENTATION_ODUL_SLIDE_ORDER) {
    const idx = findBestJobIndex(remaining, slide);
    if (idx < 0) continue;
    const [job] = remaining.splice(idx, 1);
    if (!job) continue;
    const downloadName = presentationOdulDownloadName(
      slide.slide,
      // PDF’deki ad (FIRST/WEST ASCII I korunur; ortaklı isimler de buradan)
      slide.name,
      slide.quarterFileLabel
    );
    ordered.push({
      ...job,
      downloadName,
      zipPath: downloadName,
      label: `${slide.slide}. ${job.displayName}`,
      detail: `Slayt ${slide.slide} · ${job.detail}`,
    });
  }

  // Eşleşmeyenler — yine de export’ta kaybolmasın
  for (const job of remaining) {
    ordered.push(job);
  }
  return ordered;
}
