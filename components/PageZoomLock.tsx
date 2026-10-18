'use client';

import { usePageZoomLock } from '../lib/usePageZoomLock';

/** Uygulama genelinde sayfa pinch / ctrl+wheel yakınlaştırmasını kapatır. */
export default function PageZoomLock() {
  usePageZoomLock(true);
  return null;
}
