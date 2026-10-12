'use client';

import { useEffect } from 'react';
import { toSquareMeters } from '../lib/squareMeters';

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search']);

const inputValueSetter = () =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
const textareaValueSetter = () =>
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

/**
 * Rewrites "m2" to "m²" in every text field while typing. Runs in the capture
 * phase before React's root listener; the native prototype setter bypasses
 * React's value tracker so the same input event reaches onChange with the new value.
 */
export default function SquareMeterInputs() {
  useEffect(() => {
    const onInput = (event: Event) => {
      const el = event.target;
      let setter: ((this: unknown, value: string) => void) | undefined;
      if (el instanceof HTMLTextAreaElement) {
        setter = textareaValueSetter();
      } else if (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.getAttribute('type') ?? '')) {
        setter = inputValueSetter();
      } else {
        return;
      }
      if (!setter || el.hasAttribute('data-keep-m2')) return;

      const value = el.value;
      const next = toSquareMeters(value);
      if (next === value) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      setter.call(el, next);
      if (start !== null && end !== null && document.activeElement === el) {
        const shift = value.length - next.length;
        el.setSelectionRange(Math.max(0, start - shift), Math.max(0, end - shift));
      }
    };
    document.addEventListener('input', onInput, true);
    return () => document.removeEventListener('input', onInput, true);
  }, []);

  return null;
}
