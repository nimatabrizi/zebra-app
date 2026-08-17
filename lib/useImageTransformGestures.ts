import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react';

export type ImageTransform = {
  x: number;
  y: number;
  zoom: number;
};

type GestureStart = {
  centerX: number;
  centerY: number;
  distance: number;
  translateX: number;
  translateY: number;
  zoom: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Tuval içindeki görsel için sürükleme + yakınlaştırma.
 * Telefonda iki parmak, masaüstünde tekerlek / trackpad pinch.
 */
export function useImageTransformGestures({
  targetRef,
  enabled,
  transform,
  onChange,
  minZoom = 1,
  maxZoom = 1.8,
}: {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  transform: ImageTransform;
  onChange: (next: ImageTransform) => void;
  minZoom?: number;
  maxZoom?: number;
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<GestureStart | null>(null);
  const transformRef = useRef(transform);
  const onChangeRef = useRef(onChange);
  const enabledRef = useRef(enabled);
  const pinchStartZoomRef = useRef(1);

  useEffect(() => {
    transformRef.current = transform;
    onChangeRef.current = onChange;
    enabledRef.current = enabled;
  }, [transform, onChange, enabled]);

  useEffect(() => {
    if (enabled) return;
    pointers.current.clear();
    start.current = null;
  }, [enabled]);

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const current = transformRef.current;
      const zoom = clamp(nextZoom, minZoom, maxZoom);
      const next = {
        zoom,
        x: zoom <= minZoom ? 0 : current.x,
        y: zoom <= minZoom ? 0 : current.y,
      };
      transformRef.current = next;
      onChangeRef.current(next);
    },
    [minZoom, maxZoom]
  );

  /**
   * React `wheel` ve Safari `gesture*` olaylarını pasif bağlıyor; sayfa
   * yakınlaştırmasını bastırıp zoom'u görsele yönlendirmek için yerel
   * non-passive dinleyici gerekiyor.
   */
  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      applyZoom(transformRef.current.zoom * Math.exp(-event.deltaY * 0.002));
    };
    const onGestureStart = (event: Event) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      pinchStartZoomRef.current = transformRef.current.zoom;
    };
    // Dokunmatikte pinch zaten iki pointer ile ölçekleniyor; Safari'nin
    // gesture olayını da uygularsak zoom iki kat hızlanır.
    const onGestureChange = (event: Event) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      if (pointers.current.size >= 2) return;
      const scale = (event as Event & { scale?: number }).scale ?? 1;
      applyZoom(pinchStartZoomRef.current * scale);
    };

    const options = { passive: false } as const;
    element.addEventListener('wheel', onWheel, options);
    element.addEventListener('gesturestart', onGestureStart, options);
    element.addEventListener('gesturechange', onGestureChange, options);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
    };
  }, [targetRef, enabled, applyZoom]);

  const begin = (element: HTMLElement) => {
    const points = [...pointers.current.values()];
    if (points.length === 0) {
      start.current = null;
      return;
    }
    const rect = element.getBoundingClientRect();
    const first = points[0]!;
    const second = points[1];
    const centerX = second ? (first.x + second.x) / 2 : first.x;
    const centerY = second ? (first.y + second.y) / 2 : first.y;
    const current = transformRef.current;
    start.current = {
      centerX,
      centerY,
      distance: second
        ? Math.hypot(second.x - first.x, second.y - first.y)
        : 0,
      translateX: (current.x * (rect.width * (current.zoom - 1))) / 2,
      translateY: (current.y * (rect.height * (current.zoom - 1))) / 2,
      zoom: current.zoom,
      width: rect.width,
      height: rect.height,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    begin(event.currentTarget);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || !pointers.current.has(event.pointerId) || !start.current) {
      return;
    }
    event.preventDefault();
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()];
    const first = points[0]!;
    const second = points[1];
    const centerX = second ? (first.x + second.x) / 2 : first.x;
    const centerY = second ? (first.y + second.y) / 2 : first.y;
    const initial = start.current;
    const distance = second
      ? Math.hypot(second.x - first.x, second.y - first.y)
      : 0;
    const zoom =
      second && initial.distance > 0
        ? clamp(initial.zoom * (distance / initial.distance), minZoom, maxZoom)
        : initial.zoom;
    const maxX = (initial.width * (zoom - 1)) / 2;
    const maxY = (initial.height * (zoom - 1)) / 2;
    const translateX = initial.translateX + centerX - initial.centerX;
    const translateY = initial.translateY + centerY - initial.centerY;
    const next = {
      zoom,
      x: maxX > 0 ? clamp(translateX / maxX, -1, 1) : 0,
      y: maxY > 0 ? clamp(translateY / maxY, -1, 1) : 0,
    };
    transformRef.current = next;
    onChangeRef.current(next);
  };

  const stopPointer = (event: PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    begin(event.currentTarget);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: stopPointer,
    onPointerCancel: stopPointer,
  };
}
