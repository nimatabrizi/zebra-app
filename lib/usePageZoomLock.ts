import { useEffect } from 'react';

const ZOOM_KEYS = new Set(['+', '-', '=', '_', '0']);

/**
 * Sayfanın kendisi yakınlaşmasın (pinch, ctrl+tekerlek, cmd±).
 * Stüdyo tuvalindeki görsel zoom’u ayrı gesture handler’larla çalışmaya devam eder.
 * iOS Safari sayfa pinch’ini `touch-action` ile değil `gesture*` olaylarıyla yönetir.
 */
export function usePageZoomLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const preventDefault = (event: Event) => event.preventDefault();
    const preventPinchWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const preventZoomKeys = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (ZOOM_KEYS.has(event.key)) event.preventDefault();
    };

    const options = { passive: false } as const;
    document.addEventListener('gesturestart', preventDefault, options);
    document.addEventListener('gesturechange', preventDefault, options);
    document.addEventListener('gestureend', preventDefault, options);
    document.addEventListener('wheel', preventPinchWheel, options);
    document.addEventListener('touchmove', preventMultiTouch, options);
    window.addEventListener('keydown', preventZoomKeys);

    return () => {
      document.removeEventListener('gesturestart', preventDefault);
      document.removeEventListener('gesturechange', preventDefault);
      document.removeEventListener('gestureend', preventDefault);
      document.removeEventListener('wheel', preventPinchWheel);
      document.removeEventListener('touchmove', preventMultiTouch);
      window.removeEventListener('keydown', preventZoomKeys);
    };
  }, [active]);
}
