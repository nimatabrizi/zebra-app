'use client';

import React, { useEffect, useState } from 'react';
import {
  Aperture,
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  ChevronDown,
  LayoutGrid,
  LineChart,
  Megaphone,
  Newspaper,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  buildConsultantNav,
  buildManagerNav,
  findParentNavId,
  type SidebarItem,
} from '../lib/sidebarNav';
import { usesManagerShell } from '../lib/authIdentity';

const ICONS: Record<SidebarItem['icon'], LucideIcon> = {
  LayoutGrid,
  Users,
  Briefcase,
  Aperture,
  CalendarCheck,
  Megaphone,
  LineChart,
  Building2,
  Newspaper,
  BarChart3,
};

type SidebarNavProps = {
  role: string;
  activeTab: string;
  badgeCounts?: Record<string, number>;
  onNavigate: (tabId: string) => void;
};

export default function SidebarNav({
  role,
  activeTab,
  badgeCounts = {},
  onNavigate,
}: SidebarNavProps) {
  const items = usesManagerShell(role)
    ? buildManagerNav(role)
    : buildConsultantNav();

  const [openGroupId, setOpenGroupId] = useState<string | null>(() =>
    findParentNavId(items, activeTab)
  );

  useEffect(() => {
    const parent = findParentNavId(items, activeTab);
    if (parent) setOpenGroupId(parent);
  }, [activeTab, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (groupId: string) => {
    setOpenGroupId((prev) => (prev === groupId ? null : groupId));
  };

  return (
    <nav className="flex-1 px-3 space-y-0.5 custom-scrollbar overflow-y-auto pb-2">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const hasChildren = Array.isArray(item.children) && item.children.length > 0;
        const isOpen = openGroupId === item.id;
        const childActive = hasChildren
          ? item.children!.some((c) => c.id === activeTab)
          : false;
        const isActiveLeaf = !hasChildren && activeTab === item.id;

        if (hasChildren) {
          const groupInteractable = item.isEnabled;
          return (
            <div key={item.id} className="pt-0.5">
              <button
                type="button"
                disabled={!groupInteractable}
                onClick={() => groupInteractable && toggleGroup(item.id)}
                aria-expanded={isOpen}
                className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-300 ease-zebra
                  ${
                    childActive
                      ? 'bg-white/[0.07] text-white'
                      : groupInteractable
                        ? 'text-[#86868B] hover:bg-white/[0.04] hover:text-white cursor-pointer'
                        : 'text-[#86868B] opacity-40 cursor-not-allowed'
                  }`}
              >
                <Icon
                  className={`w-[16px] h-[16px] mr-3 shrink-0 transition-colors duration-300 ease-zebra ${
                    childActive ? 'text-white' : 'text-[#86868B]'
                  }`}
                  strokeWidth={2}
                />
                <span className="truncate text-left flex-1">{item.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 text-[#636366] transition-transform duration-300 ease-zebra ${
                    isOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                  strokeWidth={2}
                />
              </button>

              <div
                className={`grid transition-all duration-300 ease-zebra ${
                  isOpen
                    ? 'grid-rows-[1fr] opacity-100 mt-0.5'
                    : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden min-h-0">
                  <div className="ml-3 pl-3 border-l border-white/[0.06] space-y-0.5 py-1">
                    {item.children!.map((child) => {
                      const childIsActive = activeTab === child.id;
                      const badge = badgeCounts[child.id] || 0;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          disabled={!child.isEnabled}
                          onClick={() => {
                            if (!child.isEnabled) return;
                            onNavigate(child.id);
                          }}
                          className={`w-full flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-300 ease-zebra
                            ${
                              childIsActive
                                ? 'bg-white/10 text-white shadow-inner cursor-pointer'
                                : child.isEnabled
                                  ? 'text-[#86868B] hover:bg-white/[0.04] hover:text-white cursor-pointer'
                                  : 'text-[#636366] opacity-45 cursor-not-allowed'
                            }`}
                        >
                          <span className="truncate text-left flex-1">{child.label}</span>
                          {badge > 0 && (
                            <span className="ml-2 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#E5B540]/15 text-[#E5B540] text-[11px] font-medium tabular-nums flex items-center justify-center">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            disabled={!item.isEnabled}
            onClick={() => {
              if (!item.isEnabled) return;
              onNavigate(item.id);
            }}
            className={`w-full flex items-center px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-300 ease-zebra
              ${
                isActiveLeaf
                  ? 'bg-white/10 text-white shadow-inner cursor-pointer'
                  : item.isEnabled
                    ? 'text-[#86868B] hover:bg-white/[0.04] hover:text-white cursor-pointer'
                    : 'text-[#86868B] opacity-40 cursor-not-allowed'
              }`}
          >
            <Icon
              className={`w-[16px] h-[16px] mr-3 shrink-0 transition-colors duration-300 ease-zebra ${
                isActiveLeaf ? 'text-white' : 'text-[#86868B]'
              }`}
              strokeWidth={2}
            />
            <span className="truncate text-left flex-1">{item.label}</span>
            {(badgeCounts[item.id] || 0) > 0 && (
              <span className="ml-2 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#E5B540]/15 text-[#E5B540] text-[11px] font-medium tabular-nums flex items-center justify-center">
                {(badgeCounts[item.id] || 0) > 99 ? '99+' : badgeCounts[item.id]}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
