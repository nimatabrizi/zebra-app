'use client';

import React from 'react';

/** Henüz yayında olmayan sayfalar için minimal boş durum */
export default function ComingSoonPlaceholder() {
  return (
    <div className="panel-enter flex w-full min-h-[60vh] items-center justify-center">
      <p className="text-[13px] font-medium tracking-[0.14em] text-[#636366]">
        Yakında
      </p>
    </div>
  );
}
