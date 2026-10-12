'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Layers, LogOut, X, type LucideIcon } from 'lucide-react';
import {
  buildConsultantNav,
  buildManagerNav,
  type SidebarChild,
  type SidebarItem,
} from '../lib/sidebarNav';
import { isUserAdmin, usesManagerShell } from '../lib/authIdentity';
import { SIDEBAR_ICONS } from './SidebarNav';

type MobileMenuSheetProps = {
  role: string;
  fullName: string;
  displayName: string;
  roleText: string;
  initials: string;
  activeTab: string;
  badgeCounts?: Record<string, number>;
  onNavigate: (tabId: string) => void;
  onClose: () => void;
  onLogout: () => void;
};

type Tile = {
  id: string;
  label: string;
  icon: LucideIcon;
  isEnabled: boolean;
  children?: SidebarChild[];
};

function containsTab(node: { id: string; children?: SidebarChild[] | { id: string }[] }, tab: string): boolean {
  if (node.id === tab) return true;
  return (node.children || []).some((child) => containsTab(child as SidebarChild, tab));
}

function badgeTotal(node: { id: string; children?: SidebarChild[] | { id: string }[] }, counts: Record<string, number>): number {
  const own = counts[node.id] || 0;
  if (!node.children?.length) return own;
  return node.children.reduce((sum, child) => sum + badgeTotal(child as SidebarChild, counts), 0);
}

export default function MobileMenuSheet({
  role,
  fullName,
  displayName,
  roleText,
  initials,
  activeTab,
  badgeCounts = {},
  onNavigate,
  onClose,
  onLogout,
}: MobileMenuSheetProps) {
  const [path, setPath] = useState<string[]>([]);

  const adminOpts = { includeUserAdmin: isUserAdmin(fullName, role), fullName };
  const items: SidebarItem[] = usesManagerShell(role)
    ? buildManagerNav(role, adminOpts)
    : buildConsultantNav(adminOpts);

  const level1 = path[0] ? items.find((item) => item.id === path[0]) : undefined;
  const level2 =
    level1 && path[1]
      ? (level1.children || []).find((child) => child.id === path[1] && child.children?.length)
      : undefined;

  const parentIcon = level1 ? SIDEBAR_ICONS[level1.icon] : Layers;
  const tiles: Tile[] = level2
    ? (level2.children || []).map((leaf) => ({ ...leaf, icon: parentIcon }))
    : level1
      ? (level1.children || []).map((child) => ({
          ...child,
          icon: child.children?.length ? Layers : parentIcon,
        }))
      : items.map((item) => ({ ...item, icon: SIDEBAR_ICONS[item.icon] }));

  const title = level2?.label ?? level1?.label ?? 'Menü';
  const backLabel = level2 ? level1?.label ?? 'Geri' : 'Menü';

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-main-scroll]');
    const previous = scroller?.style.overflow ?? '';
    if (scroller) scroller.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (scroller) scroller.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const openTile = (tile: Tile) => {
    if (!tile.isEnabled) return;
    if (tile.children?.length) {
      setPath((current) => [...current, tile.id]);
      return;
    }
    onNavigate(tile.id);
    onClose();
  };

  const sheet = (
    <div className="fixed inset-0 z-[300] flex flex-col justify-end lg:hidden">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-[var(--z-scrim)]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="zebra-sheet-enter relative flex max-h-[85dvh] flex-col rounded-t-[1.75rem] bg-[var(--z-surface)] shadow-[var(--z-shadow-float)]"
      >
        <div className="flex justify-center pt-3">
          <span className="h-[5px] w-10 rounded-full bg-[var(--z-border-strong)]" />
        </div>

        <div className="flex min-h-[56px] items-center gap-3 px-4">
          {path.length ? (
            <button
              type="button"
              onClick={() => setPath((current) => current.slice(0, -1))}
              className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 pr-2 text-[16px] font-medium text-[var(--z-blue-text,#0a84ff)] [-webkit-tap-highlight-color:transparent]"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
              <span className="max-w-[8rem] truncate">{backLabel}</span>
            </button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-[var(--z-fg)]">{title}</h2>
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={onClose}
            className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--z-muted)] hover:bg-[var(--z-hover-strong)] hover:text-[var(--z-fg)] [-webkit-tap-highlight-color:transparent]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          <div className="grid grid-cols-3 gap-3">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              const active = containsTab(tile, activeTab);
              const badge = badgeTotal(tile, badgeCounts);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={!tile.isEnabled}
                  onClick={() => openTile(tile)}
                  className={`relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center transition-transform duration-150 active:scale-[0.97] [-webkit-tap-highlight-color:transparent] disabled:opacity-40 ${
                    active
                      ? 'bg-[var(--z-inverse)] text-[var(--z-inverse-fg)]'
                      : 'bg-[var(--z-elevated)] text-[var(--z-fg)]'
                  }`}
                >
                  <Icon className="h-6 w-6 shrink-0" strokeWidth={1.9} />
                  <span className="line-clamp-2 text-[13px] font-medium leading-tight">{tile.label}</span>
                  {badge > 0 ? (
                    <span className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--z-red-text,#ff453a)] px-1 text-[10px] font-semibold tabular-nums text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-[var(--z-border)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--z-elevated)] p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--z-surface)] text-[13px] font-semibold text-[var(--z-fg)]">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-[var(--z-fg)]">{displayName}</span>
              <span className="block text-[12px] text-[var(--z-muted)]">{roleText}</span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-[var(--z-red-text,#ff453a)] [-webkit-tap-highlight-color:transparent]"
            >
              <LogOut className="h-4 w-4" />
              Çıkış
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
