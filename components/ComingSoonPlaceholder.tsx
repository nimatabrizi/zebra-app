'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

/** Henüz yayında olmayan sayfalar için premium boş durum */
export default function ComingSoonPlaceholder() {
  return (
    <div className="panel-enter flex w-full min-h-[62vh] items-center justify-center px-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-[var(--z-border)] bg-[var(--z-surface-glass)] px-10 py-16 text-center shadow-[var(--z-shadow-float)] backdrop-blur-2xl">
        <div className="z-hero-glow opacity-70" aria-hidden />
        <div className="relative mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-[var(--z-border)] bg-[var(--z-hover)]">
          <Sparkles className="h-5 w-5 text-[var(--z-accent)]" strokeWidth={1.6} />
        </div>
        <p className="z-page-kicker mb-3">Zebra 360</p>
        <h2 className="text-[1.75rem] font-medium tracking-tight text-[var(--z-fg)]">
          Yakında
        </h2>
        <p className="mx-auto mt-3 max-w-xs text-[14px] leading-relaxed text-[var(--z-muted)]">
          Bu alan için yeni deneyim hazırlanıyor. Kısa süre içinde burada olacak.
        </p>
      </div>
    </div>
  );
}
