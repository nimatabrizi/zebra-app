'use client';

import React, { useEffect, useState } from 'react';
import {
  fetchLocationForecast,
  getDayFromForecast,
  type DayWeather,
} from '../lib/weather';

type Variant = 'icon' | 'compact' | 'detail';

type WeatherBadgeProps = {
  il?: string | null;
  ilce?: string | null;
  /** DD.MM.YYYY veya YYYY-MM-DD */
  tarih?: string | null;
  variant?: Variant;
  className?: string;
};

/**
 * Minimal hava rozeti — kartları yormaz.
 * icon: sadece emoji | compact: emoji + rüzgar | detail: etiket + rüzgar
 */
export default function WeatherBadge({
  il,
  ilce,
  tarih,
  variant = 'compact',
  className = '',
}: WeatherBadgeProps) {
  const [day, setDay] = useState<DayWeather | null>(null);
  const [loading, setLoading] = useState(Boolean(tarih && il));

  useEffect(() => {
    let cancelled = false;
    if (!tarih || !il) {
      setDay(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const forecast = await fetchLocationForecast(il, ilce);
        if (cancelled) return;
        setDay(getDayFromForecast(forecast, tarih));
      } catch {
        if (!cancelled) setDay(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [il, ilce, tarih]);

  if (loading) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-white/[0.06] ${className}`}
        aria-busy="true"
        aria-label="Hava durumu yükleniyor"
      >
        <span className="overview-skeleton h-3 w-3 rounded-sm" />
        {variant !== 'icon' && (
          <span className="overview-skeleton h-2.5 w-8 rounded-full" />
        )}
      </span>
    );
  }

  if (!day) return null;

  try {
    const wind = Math.round(Number(day.windMaxKmh) || 0);
    const title = `${day.label} · Maks. rüzgar ${wind} km/s`;

    if (variant === 'icon') {
      return (
        <span
          title={title}
          className={`inline-flex items-center leading-none text-[12px] opacity-55 select-none ${className}`}
          aria-label={title}
        >
          {day.emoji}
        </span>
      );
    }

    if (variant === 'detail') {
      return (
        <span
          title={title}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/5 text-[11px] text-[#86868B] ${className}`}
        >
          <span className="opacity-80 text-[13px] leading-none">{day.emoji}</span>
          <span className="text-white/70">{day.label}</span>
          <span className="text-[#666666]">·</span>
          <span className="tabular-nums text-white/60">{wind} km/s</span>
        </span>
      );
    }

    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-[#86868B] tabular-nums select-none ${className}`}
        aria-label={title}
      >
        <span className="opacity-70 text-[11px] leading-none">{day.emoji}</span>
        <span className="text-white/50">{wind}</span>
      </span>
    );
  } catch {
    return null;
  }
}
