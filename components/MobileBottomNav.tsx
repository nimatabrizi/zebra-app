'use client';

import React, { useMemo } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  LayoutGrid,
  Menu,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { usesManagerShell } from '../lib/authIdentity';

type BottomItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  tab?: string;
  action?: 'more';
  match?: (tab: string) => boolean;
};

type MobileBottomNavProps = {
  role: string;
  activeTab: string;
  badgeCounts?: Record<string, number>;
  onNavigate: (tabId: string) => void;
  onOpenMore: () => void;
};

function buildItems(role: string): BottomItem[] {
  const manager = usesManagerShell(role);
  return [
    {
      id: 'genel',
      label: 'Ana Sayfa',
      icon: LayoutGrid,
      tab: 'genel',
    },
    {
      id: 'takvim',
      label: 'Takvim',
      icon: CalendarDays,
      tab: 'takvim',
    },
    {
      id: 'randevu',
      label: manager ? 'Çekim' : 'Randevu',
      icon: CalendarCheck,
      tab: manager ? 'cekim' : 'randevularim',
      match: (tab) =>
        manager
          ? tab === 'cekim' || tab === 'cekim-raporu'
          : tab === 'randevularim' || tab === 'randevu',
    },
    {
      id: 'studio',
      label: 'Studio',
      icon: Sparkles,
      tab: 'studio-yeni-portfoy',
      match: (tab) => tab.startsWith('studio-'),
    },
    {
      id: 'more',
      label: 'Menü',
      icon: Menu,
      action: 'more',
    },
  ];
}

export default function MobileBottomNav({
  role,
  activeTab,
  badgeCounts = {},
  onNavigate,
  onOpenMore,
}: MobileBottomNavProps) {
  const items = useMemo(() => buildItems(role), [role]);

  return (
    <nav
      aria-label="Alt navigasyon"
      className="fixed inset-x-0 bottom-0 z-[55] lg:hidden pointer-events-none"
    >
      <div className="mx-auto max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-auto">
        <div className="relative flex items-stretch gap-1.5 rounded-[26px] border border-[var(--z-border-strong)] bg-[var(--z-surface-glass)] px-1.5 py-1.5 shadow-[var(--z-shadow-float)] backdrop-blur-2xl">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.action === 'more'
                ? false
                : item.match
                  ? item.match(activeTab)
                  : activeTab === item.tab;
            const badge =
              item.id === 'randevu'
                ? (badgeCounts.randevularim || 0) +
                  (badgeCounts.cekim || 0) +
                  (badgeCounts['cekim-raporu'] || 0)
                : item.tab
                  ? badgeCounts[item.tab] || 0
                  : 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.action === 'more') {
                    onOpenMore();
                    return;
                  }
                  if (item.tab) onNavigate(item.tab);
                }}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-2 transition-all duration-300 ease-zebra active:scale-[0.96] cursor-pointer ${
                  isActive
                    ? 'bg-[var(--z-nav-active)] text-[var(--z-fg)] shadow-[var(--z-shadow-soft)]'
                    : 'text-[var(--z-muted)] hover:text-[var(--z-fg)]'
                }`}
              >
                <span className="relative">
                  <Icon
                    className={`h-[18px] w-[18px] transition-transform duration-300 ease-zebra ${
                      isActive ? 'scale-105' : 'scale-100'
                    }`}
                    strokeWidth={isActive ? 2.35 : 2}
                  />
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#FF3B30] text-white text-[9px] font-semibold tabular-nums flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] font-medium tracking-tight truncate max-w-full ${
                    isActive ? 'opacity-100' : 'opacity-80'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
