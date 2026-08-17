export type GeneratedImageFile = {
  blob: Blob;
  fileName: string;
};

function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function asFiles(images: GeneratedImageFile[]): File[] {
  return images.map(
    ({ blob, fileName }) =>
      new File([blob], fileName, { type: blob.type || 'image/png' })
  );
}

/** iOS/iPadOS'ta Files önizlemesi yerine Apple paylaşım sayfasını kullan. */
export function supportsNativeImageDelivery(
  images: GeneratedImageFile[]
): boolean {
  if (!isAppleMobileDevice() || images.length === 0) return false;
  if (typeof navigator.share !== 'function') return false;
  const files = asFiles(images);
  return (
    typeof navigator.canShare !== 'function' ||
    navigator.canShare({ files })
  );
}

export async function shareGeneratedImages(
  images: GeneratedImageFile[]
): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({
      files: asFiles(images),
      title: images.length > 1 ? 'Zebra 360 görselleri' : 'Zebra 360 görseli',
    });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled';
    }
    throw error;
  }
}

export async function downloadGeneratedImages(
  images: GeneratedImageFile[]
): Promise<void> {
  for (const [index, { blob, fileName }] of images.entries()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (index < images.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }
}
