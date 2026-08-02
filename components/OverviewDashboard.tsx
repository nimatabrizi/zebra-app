'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Aperture,
  ArrowUpRight,
  Briefcase,
  CalendarCheck,
  Camera,
  LineChart,
  Megaphone,
  QrCode,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  isConfirmedStatus,
  parseDisplayDate,
} from '../lib/appointmentUtils';
import { usesManagerShell } from '../lib/authIdentity';
import { toTitleCaseName } from '../lib/formatName';
import {
  fetchLocationForecast,
  getDayFromForecast,
  type DayWeather,
} from '../lib/weather';
import type { Appointment } from '../types/appointments';

type OverviewDashboardProps = {
  greeting: string;
  fullName: string;
  role: string;
  isPilot?: boolean;
  appointments: Appointment[];
  pendingCount?: number;
  confirmCount?: number;
  onNavigate: (tabId: string) => void;
  onOpenManual?: () => void;
};

type BentoTone = 'mesh-a' | 'mesh-b' | 'mesh-c' | 'mesh-d' | 'mesh-e' | 'mesh-studio';

type Pathway = {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  tab: string;
  className: string;
  tone: BentoTone;
  delay: number;
  badge?: number;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function findUpcomingConfirmed(
  appointments: Appointment[],
  role: string,
  fullName: string,
  isPilot: boolean
): Appointment | null {
  const today = startOfToday();
  const seesAll = role === 'broker' || role === 'yonetici';

  let pool = appointments.filter(
    (app) => isConfirmedStatus(app.status) && app.tarih
  );

  if (!seesAll) {
    if (role === 'selim' || role === 'fatima' || isPilot) {
      pool = pool.filter(
        (app) => app.ownerRole === role || app.pilot === fullName
      );
    } else {
      pool = pool.filter((app) => app.danismanIsmi === fullName);
    }
  }

  const ranked = pool
    .map((app) => ({ app, date: parseDisplayDate(app.tarih) }))
    .filter((x): x is { app: Appointment; date: Date } => !!x.date && x.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return ranked[0]?.app ?? null;
}

function formatFriendlyDate(tarih: string | null | undefined): string {
  const d = parseDisplayDate(tarih);
  if (!d) return tarih || '—';
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function daysUntil(tarih: string | null | undefined): number | null {
  const d = parseDisplayDate(tarih);
  if (!d) return null;
  const today = startOfToday();
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function AmbientLayer({ tone }: { tone: BentoTone }) {
  return (
    <div className={`bento-ambient bento-ambient--${tone}`} aria-hidden>
      <span className="bento-ambient__orb bento-ambient__orb--1" />
      <span className="bento-ambient__orb bento-ambient__orb--2" />
      <span className="bento-ambient__grain" />
    </div>
  );
}

function WeatherChip({
  il,
  ilce,
  tarih,
}: {
  il?: string | null;
  ilce?: string | null;
  tarih?: string | null;
}) {
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
    return <span className="overview-skeleton h-5 w-16 rounded-full inline-block" />;
  }
  if (!day) return null;
  const wind = Math.round(Number(day.windMaxKmh) || 0);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#AEAEB2] tabular-nums">
      <span className="text-[13px] leading-none">{day.emoji}</span>
      {day.label}
      <span className="text-[#636366]">·</span>
      {wind} km/s
    </span>
  );
}

const STUDIO_LINKS = [
  { id: 'studio-sosyal', label: 'Sosyal Medya', icon: Camera },
  { id: 'studio-branda', label: 'Branda', icon: Briefcase },
  { id: 'studio-qr', label: 'QR Kod', icon: QrCode },
] as const;

export default function OverviewDashboard({
  greeting,
  fullName,
  role,
  isPilot = false,
  appointments,
  pendingCount = 0,
  confirmCount = 0,
  onNavigate,
}: OverviewDashboardProps) {
  const displayName = toTitleCaseName(fullName);
  const firstName = displayName.split(/\s+/)[0] || '';
  const isManager = usesManagerShell(role);

  const upcoming = useMemo(
    () => findUpcomingConfirmed(appointments, role, fullName, isPilot),
    [appointments, role, fullName, isPilot]
  );
  const until = upcoming ? daysUntil(upcoming.tarih) : null;

  const pathways: Pathway[] = useMemo(() => {
    const randevuTab = isManager ? 'takvim' : 'randevu';
    const randevuBadge = isManager ? pendingCount : confirmCount;
    const analizTab = role === 'broker' ? 'cekim-raporu' : 'pazar';

    return [
      {
        id: 'musteri',
        title: 'Müşteri Yönetimi',
        hint: 'İlişkiler ve takip',
        icon: Users,
        tab: 'musteri',
        className: 'md:col-span-3 lg:col-span-4',
        tone: 'mesh-a',
        delay: 280,
      },
      {
        id: 'portfoy',
        title: 'Portföy Yönetimi',
        hint: 'Portföylerim & havuz',
        icon: Briefcase,
        tab: 'portfoylerim',
        className: 'md:col-span-3 lg:col-span-4',
        tone: 'mesh-b',
        delay: 340,
      },
      {
        id: 'randevu',
        title: 'Randevu Sistemi',
        hint: isManager ? 'Takvim & talepler' : 'Talep & kesinleştirme',
        icon: CalendarCheck,
        tab: randevuTab,
        className: 'md:col-span-2 lg:col-span-4',
        tone: 'mesh-c',
        delay: 400,
        badge: randevuBadge > 0 ? randevuBadge : undefined,
      },
      {
        id: 'reklam',
        title: 'Reklam Yönetimi',
        hint: 'Kampanyalar',
        icon: Megaphone,
        tab: 'kampanya-aktif',
        className: 'md:col-span-3 lg:col-span-4',
        tone: 'mesh-d',
        delay: 460,
      },
      {
        id: 'analiz',
        title: 'Analiz & Raporlar',
        hint: role === 'broker' ? 'Çekim raporu & pazar' : 'Pazar & bölge',
        icon: LineChart,
        tab: analizTab,
        className: 'md:col-span-3 lg:col-span-4',
        tone: 'mesh-e',
        delay: 520,
      },
    ];
  }, [isManager, pendingCount, confirmCount, role]);

  return (
    <div className="overview-root w-full">
      {/* Selamlama + altında sadece boşluk */}
      <header
        className="bento-enter relative mb-10 sm:mb-14 lg:mb-16"
        style={{ animationDelay: '40ms' }}
      >
        <h1 className="text-[34px] sm:text-[42px] lg:text-[46px] font-medium tracking-tight text-white leading-[1.05]">
          {greeting}
          {firstName ? (
            <>
              {' '}
              <span className="text-white/90">{firstName}</span>
            </>
          ) : null}
        </h1>
      </header>

      {/* Zebra Studio — full width */}
      <article
        style={{ animationDelay: '100ms' }}
        className="bento-enter group relative w-full min-h-[220px] sm:min-h-[240px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#121212]/75 backdrop-blur-2xl transition-colors duration-500 ease-zebra hover:border-white/14 mb-8 sm:mb-10"
      >
        <AmbientLayer tone="mesh-studio" />
        <div className="relative flex h-full flex-col justify-between gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:p-9">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                <Aperture className="h-5 w-5 text-white/85" strokeWidth={1.75} />
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] text-[#86868B]">
                Yakında
              </span>
            </div>
            <h2 className="mt-6 text-[28px] sm:text-[32px] font-medium tracking-tight text-white leading-tight">
              Zebra Studio
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#86868B]">
              Portföy görsellerinden QR’a — stüdyo araçlarınız tek yüzeyde.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {STUDIO_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => onNavigate(link.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-[#AEAEB2] transition-all duration-500 ease-zebra hover:border-white/20 hover:text-white cursor-pointer"
                >
                  <Icon className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
                  {link.label}
                </button>
              );
            })}
          </div>
        </div>
      </article>

      {/* Yaklaşan Çekim + Günün Portföyü */}
      <section
        className="bento-enter grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-8 sm:mb-10"
        style={{ animationDelay: '160ms' }}
      >
        {upcoming ? (
          <button
            type="button"
            onClick={() => onNavigate('takvim')}
            className="group relative min-h-[160px] overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#141414]/75 backdrop-blur-2xl p-6 sm:p-7 text-left transition-colors duration-500 ease-zebra hover:border-white/14 cursor-pointer"
          >
            <AmbientLayer tone="mesh-c" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]">
                  <CalendarCheck className="h-[18px] w-[18px] text-white/80" strokeWidth={1.75} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34C759]/25 bg-[#34C759]/10 px-2.5 py-1 text-[10px] font-medium text-[#34C759]">
                    <span className="h-1 w-1 rounded-full bg-[#34C759]" />
                    {until === 0 ? 'Bugün' : until === 1 ? 'Yarın' : `${until} gün`}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-[#4A4A4C] transition-colors duration-500 ease-zebra group-hover:text-white/70" />
                </div>
              </div>
              <div className="mt-8">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#86868B]">
                  Yaklaşan Çekim
                </p>
                <p className="mt-2 text-[18px] sm:text-[20px] font-medium tracking-tight text-white leading-snug">
                  {upcoming.ilce}
                  {upcoming.semt ? ` · ${upcoming.semt}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#86868B]">
                  <span>
                    {formatFriendlyDate(upcoming.tarih)}
                    {upcoming.saatBlok ? ` · ${upcoming.saatBlok}` : ''}
                  </span>
                  <WeatherChip
                    il={upcoming.il}
                    ilce={upcoming.ilce}
                    tarih={upcoming.tarih}
                  />
                </div>
              </div>
            </div>
          </button>
        ) : (
          <div className="relative min-h-[160px] overflow-hidden rounded-[24px] border border-dashed border-white/[0.08] bg-[#121212]/45 backdrop-blur-xl p-6 sm:p-7">
            <AmbientLayer tone="mesh-c" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                <CalendarCheck className="h-[18px] w-[18px] text-[#636366]" strokeWidth={1.75} />
              </div>
              <div className="mt-8">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#86868B]">
                  Yaklaşan Çekim
                </p>
                <p className="mt-2 text-[18px] sm:text-[20px] font-medium tracking-tight text-white/70 leading-snug">
                  Planlanmış çekim yok
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="relative min-h-[160px] overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#141414]/75 backdrop-blur-2xl p-6 sm:p-7 transition-colors duration-500 ease-zebra hover:border-white/14">
          <AmbientLayer tone="mesh-b" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]">
                <Sparkles className="h-[18px] w-[18px] text-white/80" strokeWidth={1.75} />
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] text-[#86868B]">
                Öne çıkan
              </span>
            </div>
            <div className="mt-8">
              <p className="text-[18px] sm:text-[20px] font-medium tracking-tight text-white/90 leading-snug">
                Günün Portföyü
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Diğer modül kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {pathways.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.tab)}
              style={{ animationDelay: `${item.delay}ms` }}
              className="bento-enter group relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#141414]/70 backdrop-blur-2xl text-left p-5 sm:p-6 transition-colors duration-500 ease-zebra hover:border-white/14 cursor-pointer"
            >
              <AmbientLayer tone={item.tone} />
              <div className="relative flex h-full min-h-[120px] flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]">
                    <Icon className="h-[18px] w-[18px] text-white/80" strokeWidth={1.75} />
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#E5B540]/15 text-[#E5B540] text-[11px] font-medium tabular-nums flex items-center justify-center">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-[#4A4A4C] transition-colors duration-500 ease-zebra group-hover:text-white/70" />
                  </div>
                </div>
                <div className="mt-5">
                  <h3 className="text-[15px] sm:text-[16px] font-medium tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[12px] text-[#86868B]">{item.hint}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
