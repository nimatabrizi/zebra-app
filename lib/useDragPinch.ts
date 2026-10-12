import { useEffect, useRef, type PointerEvent } from 'react';

export type DragPinchDelta = {
  /** Ekran pikseli cinsinden başlangıçtan bu yana kayma. */
  dx: number;
  dy: number;
  /** İki parmak mesafesinin başlangıca oranı (tek parmakta 1). */
  ratio: number;
};

type Start = { centerX: number; centerY: number; distance: number };

/**
 * Serbest sürükleme + iki parmak ölçekleme. Parmak sayısı değiştikçe
 * `onStart` yeniden çağrılır; çağıran o anki değeri temel alır.
 */
export function useDragPinch({
  enabled,
  onStart,
  onMove,
  onEnd,
}: {
  enabled: boolean;
  onStart: (element: HTMLElement) => void;
  onMove: (delta: DragPinchDelta) => void;
  onEnd?: () => void;
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<Start | null>(null);
  const callbacks = useRef({ onStart, onMove, onEnd });

  useEffect(() => {
    callbacks.current = { onStart, onMove, onEnd };
  }, [onStart, onMove, onEnd]);

  const measure = (): Start | null => {
    const points = [...pointers.current.values()];
    const first = points[0];
    if (!first) return null;
    const second = points[1];
    return {
      centerX: second ? (first.x + second.x) / 2 : first.x,
      centerY: second ? (first.y + second.y) / 2 : first.y,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    };
  };

  const rebase = (element: HTMLElement) => {
    start.current = measure();
    if (start.current) callbacks.current.onStart(element);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    rebase(event.currentTarget);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || !pointers.current.has(event.pointerId) || !start.current) return;
    event.stopPropagation();
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = measure();
    if (!now) return;
    const initial = start.current;
    callbacks.current.onMove({
      dx: now.centerX - initial.centerX,
      dy: now.centerY - initial.centerY,
      ratio: initial.distance > 0 && now.distance > 0 ? now.distance / initial.distance : 1,
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    event.stopPropagation();
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      start.current = null;
      callbacks.current.onEnd?.();
      return;
    }
    rebase(event.currentTarget);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
