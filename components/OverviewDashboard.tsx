'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Aperture,
  ArrowUpRight,
  Briefcase,
  CalendarCheck,
  Camera,
  IdCard,
  LineChart,
  Megaphone,
  QrCode,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  appointmentNamesMatch,
  isConfirmedStatus,
  parseDisplayDate,
  pilotOwnsAppointment,
} from '../lib/appointmentUtils';
import { isPilotRole, isPersonelRole, isUserAdmin, usesManagerShell } from '../lib/authIdentity';
import { toTitleCaseName } from '../lib/formatName';
import { canSeePersonelStudios } from '../lib/sidebarNav';
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
  currentUserId?: string | null;
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
  isPilot: boolean,
  currentUserId?: string | null
): Appointment | null {
  const today = startOfToday();
  const seesAll = role === 'broker' || isPersonelRole(role);

  let pool = appointments.filter(
    (app) => isConfirmedStatus(app.status) && app.tarih
  );

  if (!seesAll) {
    if (isPilotRole(role) || isPilot) {
      pool = pool.filter((app) =>
        pilotOwnsAppointment(app, { fullName, userId: currentUserId })
      );
    } else {
      pool = pool.filter((app) =>
        appointmentNamesMatch(app.danismanIsmi, fullName)
      );
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

export default function OverviewDashboard({
  greeting,
  fullName,
  role,
  isPilot = false,
  currentUserId = null,
  appointments,
  pendingCount = 0,
  confirmCount = 0,
  onNavigate,
}: OverviewDashboardProps) {
  const displayName = toTitleCaseName(fullName);
  const firstName = displayName.split(/\s+/)[0] || '';
  const isManager = usesManagerShell(role);

  const studioLinks = [
    { id: 'studio-yeni-portfoy', label: 'Yeni Portföy', icon: Camera },
    { id: 'studio-satildi-kiralandi', label: 'Satıldı/Kiralandı', icon: Briefcase },
    ...(canSeePersonelStudios(role, fullName)
      ? [{ id: 'studio-yaka-karti', label: 'Yaka Kartı', icon: IdCard }]
      : []),
    { id: 'studio-qr', label: 'QR Kod', icon: QrCode },
  ];

  const upcoming = useMemo(
    () =>
      findUpcomingConfirmed(
        appointments,
        role,
        fullName,
        isPilot,
        currentUserId
      ),
    [appointments, role, fullName, isPilot, currentUserId]
  );
  const until = upcoming ? daysUntil(upcoming.tarih) : null;

  const pathways: Pathway[] = useMemo(() => {
    const canApprove = role === 'broker' || isPilotRole(role) || isPilot;
    const randevuTab =
      isPersonelRole(role)
        ? 'takvim'
        : isManager
          ? pendingCount > 0 && canApprove
            ? 'cekim'
            : 'takvim'
          : confirmCount > 0
            ? 'randevu'
            : 'randevularim';
    const randevuBadge =
      isPersonelRole(role) ? 0 : isManager ? pendingCount : confirmCount;
    const analizTab = role === 'broker' ? 'cekim-raporu' : 'pazar';

    const items: Pathway[] = [];

    if (!isManager) {
      items.push({
        id: 'musteri',
        title: 'Müşteri Yönetimi',
        hint: 'İlişkiler ve takip',
        icon: Users,
        tab: 'musteri',
        className: 'md:col-span-3 lg:col-span-4',
        tone: 'mesh-a',
        delay: 280,
      });
    }

    items.push({
      id: 'portfoy',
      title: 'Portföy Yönetimi',
      hint: 'Portföylerim & havuz',
      icon: Briefcase,
      tab: 'portfoylerim',
      className: isManager
        ? 'md:col-span-3 lg:col-span-6'
        : 'md:col-span-3 lg:col-span-4',
      tone: 'mesh-b',
      delay: isManager ? 280 : 340,
    });

    items.push({
      id: 'randevu',
      title: 'Randevu Sistemi',
      hint:
        isPersonelRole(role)
          ? 'Pilot çekim programları'
          : isManager
            ? 'Takvim & randevu talepleri'
            : 'Randevularım & talep',
      icon: CalendarCheck,
      tab: randevuTab,
      className: isManager
        ? 'md:col-span-3 lg:col-span-6'
        : 'md:col-span-2 lg:col-span-4',
      tone: 'mesh-c',
      delay: isManager ? 340 : 400,
      badge: randevuBadge > 0 ? randevuBadge : undefined,
    });

    if (!isManager) {
      items.push(
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
        }
      );
    }

    if (isUserAdmin(fullName, role)) {
      items.push({
        id: 'users',
        title: 'Kullanıcı Yönetimi',
        hint: 'Hesaplar, ekleme & Excel',
        icon: Users,
        tab: 'users-overview',
        className: isManager
          ? 'md:col-span-6 lg:col-span-12'
          : 'md:col-span-2 lg:col-span-4',
        tone: 'mesh-a',
        delay: isManager ? 400 : 580,
      });
    }

    return items;
  }, [isManager, pendingCount, confirmCount, role, isPilot, fullName]);

  return (
    <div className="overview-root relative w-full">
      <div className="z-hero-glow" aria-hidden />

      <header
        className="bento-enter relative mb-14 sm:mb-20 lg:mb-24"
        style={{ animationDelay: '40ms' }}
      >
        <p className="z-page-kicker mb-5">Zebra 360</p>
        <h1 className="max-w-[14ch] text-[clamp(2.6rem,7vw,4.75rem)] font-medium tracking-[-0.045em] leading-[0.95] text-[var(--z-fg)]">
          {greeting}
          {firstName ? (
            <>
              <br />
              <span className="text-[var(--z-fg)]/55">{firstName}</span>
            </>
          ) : null}
        </h1>
      </header>

      <article
        style={{ animationDelay: '90ms' }}
        className="bento-enter group relative mb-10 overflow-hidden rounded-[2rem] border border-[var(--z-border)] bg-[var(--z-surface-glass)] shadow-[var(--z-shadow-float)] backdrop-blur-2xl sm:mb-14 lg:min-h-[280px]"
      >
        <AmbientLayer tone="mesh-studio" />
        <div className="relative grid gap-10 p-8 sm:p-10 lg:grid-cols-[1.35fr_1fr] lg:items-end lg:gap-16 lg:p-12">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[var(--z-border)] bg-[var(--z-hover-strong)] shadow-[var(--z-shadow-soft)]">
                <Aperture className="h-5 w-5 text-[var(--z-fg)]" strokeWidth={1.6} />
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#34C759]/30 bg-[#34C759]/12 px-3 py-1.5 text-[10px] font-medium tracking-[0.14em] text-[#34C759]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34C759]" />
                Canlı stüdyo
              </span>
            </div>
            <h2 className="text-[clamp(1.85rem,3.5vw,2.75rem)] font-medium tracking-[-0.035em] leading-[1.05] text-[var(--z-fg)]">
              Zebra Studio
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--z-muted)]">
              Portföy görsellerinden durum videosuna — yaratım araçlarınız tek,
              sakin bir yüzeyde.
            </p>
          </div>
          <div className="flex flex-wrap content-end gap-2.5 lg:justify-end">
            {studioLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => onNavigate(link.id)}
                  className="z-btn-ghost inline-flex h-11 items-center gap-2.5 px-4 text-[13px] cursor-pointer"
                >
                  <Icon className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
                  {link.label}
                </button>
              );
            })}
          </div>
        </div>
      </article>

      <section
        className="bento-enter mb-10 grid grid-cols-1 gap-5 sm:mb-14 lg:grid-cols-12 lg:gap-6"
        style={{ animationDelay: '150ms' }}
      >
        {upcoming ? (
          <button
            type="button"
            onClick={() => onNavigate('takvim')}
            className="group relative min-h-[220px] overflow-hidden rounded-[2rem] border border-[var(--z-border)] bg-[var(--z-surface-glass)] p-8 text-left shadow-[var(--z-shadow-soft)] backdrop-blur-2xl transition-all duration-500 ease-zebra hover:-translate-y-1 hover:shadow-[var(--z-shadow-float)] cursor-pointer lg:col-span-7"
          >
            <AmbientLayer tone="mesh-c" />
            <div className="relative flex h-full min-h-[180px] flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[var(--z-border)] bg-[var(--z-hover)]">
                  <CalendarCheck className="h-5 w-5 text-[var(--z-fg)]/85" strokeWidth={1.6} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34C759]/28 bg-[#34C759]/12 px-3 py-1.5 text-[11px] font-medium text-[#34C759]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#34C759]" />
                    {until === 0 ? 'Bugün' : until === 1 ? 'Yarın' : `${until} gün`}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-[var(--z-muted-2)] transition-transform duration-500 ease-zebra group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--z-fg)]" />
                </div>
              </div>
              <div className="mt-12">
                <p className="z-page-kicker">Yaklaşan çekim</p>
                <p className="mt-3 text-[clamp(1.4rem,2.5vw,1.85rem)] font-medium tracking-tight text-[var(--z-fg)] leading-snug">
                  {upcoming.ilce}
                  {upcoming.semt ? ` · ${upcoming.semt}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-[var(--z-muted)]">
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
          <div className="relative min-h-[220px] overflow-hidden rounded-[2rem] border border-dashed border-[var(--z-border-strong)] bg-[var(--z-surface-glass)] p-8 backdrop-blur-xl lg:col-span-7">
            <AmbientLayer tone="mesh-c" />
            <div className="relative flex h-full min-h-[180px] flex-col justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[var(--z-border)] bg-[var(--z-hover)]">
                <CalendarCheck className="h-5 w-5 text-[var(--z-muted-2)]" strokeWidth={1.6} />
              </div>
              <div className="mt-12">
                <p className="z-page-kicker">Yaklaşan çekim</p>
                <p className="mt-3 text-[clamp(1.4rem,2.5vw,1.85rem)] font-medium tracking-tight text-[var(--z-fg)]/55 leading-snug">
                  Planlanmış çekim yok
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="relative min-h-[220px] overflow-hidden rounded-[2rem] border border-[var(--z-border)] bg-[var(--z-surface-glass)] p-8 shadow-[var(--z-shadow-soft)] backdrop-blur-2xl lg:col-span-5">
          <AmbientLayer tone="mesh-b" />
          <div className="relative flex h-full min-h-[180px] flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-[var(--z-border)] bg-[var(--z-hover)]">
                <Sparkles className="h-5 w-5 text-[var(--z-accent)]" strokeWidth={1.6} />
              </div>
              <span className="z-chip">Öne çıkan</span>
            </div>
            <div className="mt-12">
              <p className="z-page-kicker">Günün seçkisi</p>
              <p className="mt-3 text-[clamp(1.4rem,2.5vw,1.85rem)] font-medium tracking-tight text-[var(--z-fg)] leading-snug">
                Günün Portföyü
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="z-page-kicker">Modüller</p>
          <h2 className="mt-2 text-[1.35rem] font-medium tracking-tight text-[var(--z-fg)] sm:text-[1.5rem]">
            Hızlı geçiş
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 sm:gap-5">
        {pathways.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.tab)}
              style={{ animationDelay: `${item.delay}ms` }}
              className="bento-enter group relative min-h-[168px] overflow-hidden rounded-[1.75rem] border border-[var(--z-border)] bg-[var(--z-surface-glass)] p-6 text-left shadow-[var(--z-shadow-soft)] backdrop-blur-2xl transition-all duration-500 ease-zebra hover:-translate-y-1.5 hover:border-[var(--z-border-strong)] hover:shadow-[var(--z-shadow-float)] cursor-pointer"
            >
              <AmbientLayer tone={item.tone} />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] border border-[var(--z-border)] bg-[var(--z-hover)] transition-transform duration-500 ease-zebra group-hover:scale-105">
                    <Icon className="h-[18px] w-[18px] text-[var(--z-fg)]/85" strokeWidth={1.7} />
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--z-accent-soft)] text-[var(--z-accent)] text-[11px] font-medium tabular-nums flex items-center justify-center">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-[var(--z-muted-2)] transition-all duration-500 ease-zebra group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--z-fg)]" />
                  </div>
                </div>
                <div className="mt-8">
                  <h3 className="text-[16px] font-medium tracking-tight text-[var(--z-fg)]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--z-muted)]">
                    {item.hint}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
