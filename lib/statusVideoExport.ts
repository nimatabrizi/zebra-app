'use client';

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  SOCIAL_STUDIO_CANVAS,
  STATUS_AUDIO_URL,
  STATUS_OVERLAY_DELAY_SEC,
  STATUS_VIDEO_DURATION_SEC,
  STATUS_VIDEO_OPTIONS,
  statusOverlayLayout,
  type StatusVideoKind,
  type StudioFormat,
} from './studioAssets';
import type { ImageTransform } from './useImageTransformGestures';

export type StatusExportProgress = {
  ratio: number;
  label: string;
};

/** public/ffmpeg altındaki varlıklar değişince artır. */
const FFMPEG_ASSET_VERSION = '2';

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let activeProgressHandler:
  | ((progress: StatusExportProgress) => void)
  | undefined;

async function getFFmpeg(
  onProgress?: (progress: StatusExportProgress) => void
): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    onProgress?.({ ratio: 0.02, label: 'Video motoru yükleniyor…' });
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[ffmpeg]', message);
      }
    });
    ffmpeg.on('progress', ({ progress }) => {
      const clamped = Math.max(0, Math.min(0.98, progress || 0));
      activeProgressHandler?.({
        ratio: 0.15 + clamped * 0.8,
        label: 'Video encode ediliyor…',
      });
    });

    // Paket içi worker Turbopack ile paketlenemiyor (core import'u dinamik);
    // worker ve core'u kendi origin'imizden statik dosya olarak veriyoruz.
    // Sürüm sorgusu, varlıklar değiştiğinde tarayıcı önbelleğini kırar.
    const baseURL = `${window.location.origin}/ffmpeg`;
    const v = FFMPEG_ASSET_VERSION;
    await ffmpeg.load({
      classWorkerURL: `${baseURL}/worker.js?v=${v}`,
      coreURL: `${baseURL}/ffmpeg-core.js?v=${v}`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm?v=${v}`,
    });
    ffmpegSingleton = ffmpeg;
    onProgress?.({ ratio: 0.12, label: 'Video motoru hazır' });
    return ffmpeg;
  })().catch((error) => {
    ffmpegLoadPromise = null;
    throw error;
  });

  return ffmpegLoadPromise;
}

function statusMeta(kind: StatusVideoKind) {
  const found = STATUS_VIDEO_OPTIONS.find((o) => o.id === kind);
  if (!found) throw new Error('Geçersiz durum seçimi');
  return found;
}

export function statusExportFileName(
  kind: StatusVideoKind,
  format: StudioFormat
): string {
  const meta = statusMeta(kind);
  return `zebra-${meta.fileSlug}-${format}.mp4`;
}

async function writeUrlToFFmpeg(
  ffmpeg: FFmpeg,
  url: string,
  virtualName: string
): Promise<void> {
  const { fetchFile } = await import('@ffmpeg/util');
  const data = await fetchFile(url);
  await ffmpeg.writeFile(virtualName, data);
}

/**
 * Kaynak görseli ölçekle/crop et, alpha overlay’i ortala, MP3 ekle → 5 sn H.264/AAC MP4.
 * İşlem tamamen istemcide; sunucuya görsel gönderilmez.
 */
export async function encodeStatusMp4(options: {
  sourceFile: File;
  kind: StatusVideoKind;
  format: StudioFormat;
  sourceTransform?: ImageTransform;
  onProgress?: (progress: StatusExportProgress) => void;
}): Promise<Blob> {
  const { sourceFile, kind, format, onProgress } = options;
  const sourceTransform = options.sourceTransform || { x: 0, y: 0, zoom: 1 };
  const sourceZoom = Math.max(1, Math.min(1.8, sourceTransform.zoom));
  const sourceX = Math.max(-1, Math.min(1, sourceTransform.x));
  const sourceY = Math.max(-1, Math.min(1, sourceTransform.y));
  const canvas = SOCIAL_STUDIO_CANVAS[format];
  const meta = statusMeta(kind);
  activeProgressHandler = onProgress;
  const ffmpeg = await getFFmpeg(onProgress);

  const sourceExtension = sourceFile.name
    .split('.')
    .pop()
    ?.toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]/g, '');
  const inName = `in_${format}_${Date.now()}.${
    sourceExtension && ['png', 'jpg', 'jpeg', 'webp'].includes(sourceExtension)
      ? sourceExtension
      : 'png'
  }`;
  const overlayName = `ov_${kind}.webm`;
  const audioName = 'status-audio.mp3';
  const outName = `out_${format}.mp4`;

  onProgress?.({ ratio: 0.14, label: 'Dosyalar hazırlanıyor…' });

  const { fetchFile } = await import('@ffmpeg/util');
  await ffmpeg.writeFile(inName, await fetchFile(sourceFile));
  await writeUrlToFFmpeg(ffmpeg, meta.overlayUrl, overlayName);
  await writeUrlToFFmpeg(ffmpeg, STATUS_AUDIO_URL, audioName);

  const layout = statusOverlayLayout(format);
  const dur = STATUS_VIDEO_DURATION_SEC;
  const rotation = `${layout.rotationDeg}*PI/180`;

  // Kaynak: tek kareyi 5 sn döngüle + cover, ardından önizlemedeki zoom/konum.
  // Overlay: 6. kareden başlar; referans ölçüsünde, eğik, merkezin üstünde ve
  // videonun başından STATUS_OVERLAY_DELAY_SEC kadar sonra girer
  // Ses: 0'dan 5 sn
  const delay = STATUS_OVERLAY_DELAY_SEC;
  const filter = [
    `[0:v]scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=increase,` +
      `crop=${canvas.width}:${canvas.height},` +
      `scale=ceil(${canvas.width}*${sourceZoom}/2)*2:ceil(${canvas.height}*${sourceZoom}/2)*2,` +
      `crop=${canvas.width}:${canvas.height}:` +
      `x=(in_w-out_w)/2-(${sourceX})*(in_w-out_w)/2:` +
      `y=(in_h-out_h)/2-(${sourceY})*(in_h-out_h)/2,` +
      `setsar=1,fps=30,` +
      `trim=duration=${dur},setpts=PTS-STARTPTS[base]`,
    `[1:v]scale=${layout.width}:${layout.height},format=rgba,` +
      `rotate=${rotation}:ow=rotw(${rotation}):oh=roth(${rotation}):c=none,` +
      `fps=30,trim=duration=${dur - delay},setpts=PTS-STARTPTS,` +
      `tpad=start_duration=${delay}:start_mode=add:color=0x00000000[ov]`,
    `[base][ov]overlay=(W-w)/2:${layout.centerY}-h/2:format=auto:eof_action=pass[vout]`,
    `[2:a]atrim=0:${dur},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`,
  ].join(';');

  onProgress?.({ ratio: 0.18, label: `${canvas.label} encode başlıyor…` });

  const args = [
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    inName,
    // Yerleşik VP9 çözücü alpha kanalını düşürüyor; libvpx şart.
    '-c:v',
    'libvpx-vp9',
    '-i',
    overlayName,
    '-i',
    audioName,
    '-filter_complex',
    filter,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-t',
    String(dur),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-shortest',
    outName,
  ];

  try {
    await ffmpeg.exec(args);
    const data = await ffmpeg.readFile(outName);
    onProgress?.({ ratio: 1, label: 'Tamamlandı' });
    const bytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(data as ArrayBuffer);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy], { type: 'video/mp4' });
  } finally {
    activeProgressHandler = undefined;
    for (const name of [inName, overlayName, audioName, outName]) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function terminateStatusFFmpeg(): Promise<void> {
  if (!ffmpegSingleton) return;
  try {
    ffmpegSingleton.terminate();
  } catch {
    /* ignore */
  }
  ffmpegSingleton = null;
  ffmpegLoadPromise = null;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
