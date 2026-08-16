'use client';

import React, { useEffect, useState } from 'react';
import {
  Aperture,
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
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
  type SidebarChild,
  type SidebarItem,
} from '../lib/sidebarNav';
import { isUserAdmin, usesManagerShell } from '../lib/authIdentity';

const ICONS: Record<SidebarItem['icon'], LucideIcon> = {
  LayoutGrid,
  CalendarDays,
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
  fullName?: string;
  activeTab: string;
  badgeCounts?: Record<string, number>;
  onNavigate: (tabId: string) => void;
};

function childHasNested(
  child: SidebarChild
): child is SidebarChild & { children: { id: string; label: string; isEnabled: boolean }[] } {
  return Array.isArray(child.children) && child.children.length > 0;
}

function nestedContainsActive(child: SidebarChild, activeTab: string): boolean {
  if (!childHasNested(child)) return false;
  return child.children.some((leaf) => leaf.id === activeTab);
}

export default function SidebarNav({
  role,
  fullName = '',
  activeTab,
  badgeCounts = {},
  onNavigate,
}: SidebarNavProps) {
  const adminOpts = { includeUserAdmin: isUserAdmin(fullName, role) };
  const items = usesManagerShell(role)
    ? buildManagerNav(role, adminOpts)
    : buildConsultantNav(adminOpts);

  const [openGroupId, setOpenGroupId] = useState<string | null>(() =>
    findParentNavId(items, activeTab)
  );
  const [openNestedId, setOpenNestedId] = useState<string | null>(() => {
    for (const item of items) {
      for (const child of item.children || []) {
        if (nestedContainsActive(child, activeTab)) return child.id;
      }
    }
    return null;
  });

  useEffect(() => {
    const parent = findParentNavId(items, activeTab);
    if (parent) setOpenGroupId(parent);
    let nested: string | null = null;
    for (const item of items) {
      for (const child of item.children || []) {
        if (nestedContainsActive(child, activeTab)) {
          nested = child.id;
          break;
        }
      }
      if (nested) break;
    }
    if (nested) setOpenNestedId(nested);
  }, [activeTab, role, fullName]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (groupId: string) => {
    setOpenGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const toggleNested = (nestedId: string) => {
    setOpenNestedId((prev) => (prev === nestedId ? null : nestedId));
  };

  return (
    <nav className="flex-1 px-3 space-y-0.5 custom-scrollbar overflow-y-auto pb-2">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const hasChildren = Array.isArray(item.children) && item.children.length > 0;
        const isOpen = openGroupId === item.id;
        const childActive = hasChildren
          ? item.children!.some(
              (c) =>
                c.id === activeTab || nestedContainsActive(c, activeTab)
            )
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
                      if (childHasNested(child)) {
                        const nestedOpen = openNestedId === child.id;
                        const nestedActive = nestedContainsActive(child, activeTab);
                        return (
                          <div key={child.id}>
                            <button
                              type="button"
                              disabled={!child.isEnabled}
                              onClick={() =>
                                child.isEnabled && toggleNested(child.id)
                              }
                              aria-expanded={nestedOpen}
                              className={`w-full flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-300 ease-zebra
                                ${
                                  nestedActive
                                    ? 'bg-white/[0.06] text-white'
                                    : child.isEnabled
                                      ? 'text-[#86868B] hover:bg-white/[0.04] hover:text-white cursor-pointer'
                                      : 'text-[#636366] opacity-45 cursor-not-allowed'
                                }`}
                            >
                              <span className="truncate text-left flex-1">
                                {child.label}
                              </span>
                              <ChevronDown
                                className={`w-3 h-3 shrink-0 text-[#636366] transition-transform duration-300 ease-zebra ${
                                  nestedOpen ? 'rotate-180' : 'rotate-0'
                                }`}
                                strokeWidth={2}
                              />
                            </button>
                            <div
                              className={`grid transition-all duration-300 ease-zebra ${
                                nestedOpen
                                  ? 'grid-rows-[1fr] opacity-100 mt-0.5'
                                  : 'grid-rows-[0fr] opacity-0'
                              }`}
                            >
                              <div className="overflow-hidden min-h-0">
                                <div className="ml-2 pl-2 border-l border-white/[0.05] space-y-0.5 py-0.5">
                                  {child.children.map((leaf) => {
                                    const leafActive = activeTab === leaf.id;
                                    const badge = badgeCounts[leaf.id] || 0;
                                    return (
                                      <button
                                        key={leaf.id}
                                        type="button"
                                        disabled={!leaf.isEnabled}
                                        onClick={() => {
                                          if (!leaf.isEnabled) return;
                                          onNavigate(leaf.id);
                                        }}
                                        className={`w-full flex items-center px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-300 ease-zebra
                                          ${
                                            leafActive
                                              ? 'bg-white/10 text-white shadow-inner cursor-pointer'
                                              : leaf.isEnabled
                                                ? 'text-[#86868B] hover:bg-white/[0.04] hover:text-white cursor-pointer'
                                                : 'text-[#636366] opacity-45 cursor-not-allowed'
                                          }`}
                                      >
                                        <span className="truncate text-left flex-1">
                                          {leaf.label}
                                        </span>
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
                          <span className="truncate text-left flex-1">
                            {child.label}
                          </span>
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
