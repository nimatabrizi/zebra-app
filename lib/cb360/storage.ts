import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CB360_BUCKET,
  CB360_SIGNED_DOWNLOAD_TTL_SECONDS,
  CB360_SIGNED_UPLOAD_TTL_SECONDS,
} from './paths';
import { Cb360Error } from './types';
import { normalizeSha256, sha256Hex } from './integrity';

export type SignedDownload = {
  signedUrl: string;
  expiresInSeconds: number;
  method: 'GET';
  path: string;
  bucket: string;
};

export type SignedUpload = {
  signedUrl: string;
  token: string;
  path: string;
  bucket: string;
  /** Documented by @supabase/storage-js createSignedUploadUrl — fixed ~2h */
  expiresInSeconds: typeof CB360_SIGNED_UPLOAD_TTL_SECONDS;
  upsert: false;
};

/**
 * Download signed URL via SDK createSignedUrl(path, expiresIn).
 * Method is GET for object/sign URLs (SDK-documented path).
 */
export async function createCb360SignedDownloadUrl(
  client: SupabaseClient,
  objectPath: string,
  expiresInSeconds = CB360_SIGNED_DOWNLOAD_TTL_SECONDS
): Promise<SignedDownload> {
  const { data, error } = await client.storage
    .from(CB360_BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Cb360Error(
      'storage_error',
      `Signed download URL üretilemedi: ${error?.message ?? 'unknown'}`,
      502
    );
  }

  return {
    signedUrl: data.signedUrl,
    expiresInSeconds,
    method: 'GET',
    path: objectPath,
    bucket: CB360_BUCKET,
  };
}

/**
 * Upload signed URL via SDK createSignedUploadUrl.
 * TTL is fixed by Supabase (~2 hours) — do not invent other TTLs.
 * upsert:false keeps immutable paths non-overwriteable via this URL.
 */
export async function createCb360SignedUploadUrl(
  client: SupabaseClient,
  objectPath: string
): Promise<SignedUpload> {
  const { data, error } = await client.storage
    .from(CB360_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (error || !data?.signedUrl || !data.token) {
    throw new Cb360Error(
      'storage_error',
      `Signed upload URL üretilemedi: ${error?.message ?? 'unknown'}`,
      502
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path || objectPath,
    bucket: CB360_BUCKET,
    expiresInSeconds: CB360_SIGNED_UPLOAD_TTL_SECONDS,
    upsert: false,
  };
}

/** Server-side download + SHA-256 of object bytes (service role). */
export async function downloadAndHashObject(
  client: SupabaseClient,
  objectPath: string
): Promise<{ bytes: Buffer; sha256: string; byteSize: number }> {
  const { data, error } = await client.storage.from(CB360_BUCKET).download(objectPath);

  if (error || !data) {
    throw new Cb360Error(
      'storage_error',
      `Object indirilemedi: ${error?.message ?? 'missing'}`,
      502
    );
  }

  const ab = await data.arrayBuffer();
  const bytes = Buffer.from(ab);
  return {
    bytes,
    sha256: sha256Hex(bytes),
    byteSize: bytes.byteLength,
  };
}

export function assertClientHashMatchesServer(
  clientSha256: string,
  serverSha256: string
): void {
  const a = normalizeSha256(clientSha256);
  const b = normalizeSha256(serverSha256);
  if (a !== b) {
    throw new Cb360Error('hash_mismatch', 'Sunucu SHA-256 istemci hash ile uyuşmuyor', 409);
  }
}
