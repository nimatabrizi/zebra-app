/**
 * Zebra 360 — Sidebar / Navigation menu architecture
 * Accordion groups: only one open at a time (enforced in SidebarNav).
 * Pasif ürün sayfaları menüde aktif; içerik "Yakında" placeholder gösterir.
 */

import { isUserAdmin, isPilotRole, isPersonelRole } from './authIdentity';

export type SidebarLeaf = {
  id: string;
  label: string;
  isEnabled: boolean;
  children?: never;
};

export type SidebarGroupChild = {
  id: string;
  label: string;
  isEnabled: boolean;
  children: SidebarLeaf[];
};

/** Leaf veya nested grup (Sosyal Medya → Yeni Portföy / Satıldı) */
export type SidebarChild = SidebarLeaf | SidebarGroupChild;

export type SidebarItem = {
  id: string;
  label: string;
  /** lucide icon key resolved in SidebarNav */
  icon:
    | 'LayoutGrid'
    | 'CalendarDays'
    | 'Users'
    | 'Briefcase'
    | 'Aperture'
    | 'CalendarCheck'
    | 'Megaphone'
    | 'LineChart'
    | 'Building2'
    | 'Newspaper'
    | 'BarChart3';
  isEnabled: boolean;
  children?: SidebarChild[];
};

/** Gerçek içeriği olan sekmeler (rol bazlı kontrol page'de) */
export const CORE_LIVE_TABS = [
  'genel',
  'takvim',
  'randevularim',
  'randevu',
  'cekim',
  'cekim-raporu',
  'studio-yeni-portfoy',
  'studio-satildi-kiralandi',
  'studio-toplu',
  'users-overview',
  'users-add',
] as const;

/** Eski sekme id → güncel leaf */
export function migrateStudioTabId(tabId: string): string {
  if (tabId === 'studio-sosyal') return 'studio-yeni-portfoy';
  return tabId;
}

function sharedProductModules(options?: {
  includeMusteri?: boolean;
  includeTopluUretim?: boolean;
}): SidebarItem[] {
  const includeMusteri = options?.includeMusteri !== false;
  const includeTopluUretim = options?.includeTopluUretim === true;
  return [
    ...(includeMusteri
      ? [
          {
            id: 'musteri',
            label: 'Müşteri Yönetimi',
            icon: 'Users' as const,
            isEnabled: true,
          },
        ]
      : []),
    {
      id: 'portfoy-yonetimi',
      label: 'Portföy Yönetimi',
      icon: 'Briefcase',
      isEnabled: true,
      children: [
        { id: 'portfoylerim', label: 'Portföylerim', isEnabled: true },
        { id: 'portfoy', label: 'Portföy Havuzu', isEnabled: true },
      ],
    },
    {
      id: 'zebra-studio',
      label: 'Zebra Studio',
      icon: 'Aperture',
      isEnabled: true,
      children: [
        {
          id: 'studio-sosyal-group',
          label: 'Sosyal Medya Tasarımları',
          isEnabled: true,
          children: [
            {
              id: 'studio-yeni-portfoy',
              label: 'Yeni Portföy',
              isEnabled: true,
            },
            {
              id: 'studio-satildi-kiralandi',
              label: 'Satıldı/Kiralandı',
              isEnabled: true,
            },
          ],
        },
        ...(includeTopluUretim
          ? [{ id: 'studio-toplu', label: 'Toplu Üretim', isEnabled: true }]
          : []),
        { id: 'studio-branda', label: 'Branda', isEnabled: true },
        { id: 'studio-brosur', label: 'Broşür', isEnabled: true },
        { id: 'studio-sunum', label: 'Sunum Dosyaları', isEnabled: true },
        { id: 'studio-microsite', label: 'Portföy Micro-site', isEnabled: true },
        { id: 'studio-email', label: 'E-Posta Bültenleri', isEnabled: true },
        { id: 'studio-qr', label: 'Akıllı QR Kod', isEnabled: true },
      ],
    },
  ];
}

function productTreeTail(options?: { includeMarketingAnalytics?: boolean }): SidebarItem[] {
  const includeMarketingAnalytics = options?.includeMarketingAnalytics !== false;
  return [
    ...(includeMarketingAnalytics
      ? [
          {
            id: 'reklam',
            label: 'Reklam Yönetimi',
            icon: 'Megaphone' as const,
            isEnabled: true,
            children: [
              { id: 'kampanya-aktif', label: 'Aktif Kampanyalar', isEnabled: true },
              { id: 'kampanya-olustur', label: 'Kampanya Oluştur', isEnabled: true },
            ],
          },
          {
            id: 'analiz',
            label: 'Analiz & Raporlar',
            icon: 'LineChart' as const,
            isEnabled: true,
            children: [
              { id: 'pazar', label: 'Pazar Analiz', isEnabled: true },
              { id: 'bolge-raporu', label: 'Bölge raporu', isEnabled: true },
              {
                id: 'cma',
                label: 'Karşılaştırmalı Piyasa Analizi (CMA)',
                isEnabled: true,
              },
            ],
          },
        ]
      : []),
    {
      id: 'kurumsal',
      label: 'Kurumsal',
      icon: 'Building2',
      isEnabled: true,
    },
    {
      id: 'bulten',
      label: 'Bülten',
      icon: 'Newspaper',
      isEnabled: true,
    },
  ];
}

const userAdminNavItem: SidebarItem = {
  id: 'kullanici-yonetimi',
  label: 'Kullanıcı Yönetimi',
  icon: 'Users',
  isEnabled: true,
  children: [
    { id: 'users-overview', label: 'Tüm Kullanıcılar', isEnabled: true },
    { id: 'users-add', label: 'Kullanıcı Ekle', isEnabled: true },
  ],
};

/** Danışman kabuğu */
export function buildConsultantNav(options?: {
  includeUserAdmin?: boolean;
}): SidebarItem[] {
  const includeUserAdmin = options?.includeUserAdmin === true;
  return [
    {
      id: 'genel',
      label: 'Genel Bakış',
      icon: 'LayoutGrid',
      isEnabled: true,
    },
    {
      id: 'takvim',
      label: 'Takvim',
      icon: 'CalendarDays',
      isEnabled: true,
    },
    ...sharedProductModules(),
    {
      id: 'randevu-sistemi',
      label: 'Randevu Sistemi',
      icon: 'CalendarCheck',
      isEnabled: true,
      children: [
        { id: 'randevularim', label: 'Randevularım', isEnabled: true },
        { id: 'randevu', label: 'Randevu Talebi', isEnabled: true },
      ],
    },
    ...(includeUserAdmin ? [userAdminNavItem] : []),
    ...productTreeTail(),
  ];
}

/** Personel / pilot kabuğu — müşteri, reklam, analiz yok */
export function buildManagerNav(
  role: string,
  options?: { includeUserAdmin?: boolean }
): SidebarItem[] {
  const isBroker = role === 'broker';
  const isPersonel = isPersonelRole(role);
  const includeUserAdmin = options?.includeUserAdmin === true;
  return [
    {
      id: 'genel',
      label: 'Genel Bakış',
      icon: 'LayoutGrid',
      isEnabled: true,
    },
    ...sharedProductModules({ includeMusteri: false, includeTopluUretim: true }),
    {
      id: 'randevu-sistemi',
      label: 'Randevu Sistemi',
      icon: 'CalendarCheck',
      isEnabled: true,
      children: [
        { id: 'takvim', label: 'Çekim takvimi', isEnabled: true },
        // Personel yalnızca pilot programlarını görür; talep onay akışı yok.
        ...(!isPersonel
          ? [{ id: 'cekim', label: 'Randevu Talepleri', isEnabled: true }]
          : []),
        ...(isBroker
          ? [{ id: 'cekim-raporu', label: 'Çekim Raporu', isEnabled: true }]
          : []),
      ],
    },
    ...(includeUserAdmin ? [userAdminNavItem] : []),
    ...productTreeTail({ includeMarketingAnalytics: false }),
  ];
}

function childHasNested(child: SidebarChild): child is SidebarGroupChild {
  return Array.isArray(child.children) && child.children.length > 0;
}

/** Menüdeki tüm navigasyon leaf id'leri (URL / allowedTabs) */
export function collectNavTabIds(items: SidebarItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.children?.length) {
      for (const child of item.children) {
        if (childHasNested(child)) {
          for (const leaf of child.children) ids.push(leaf.id);
        } else {
          ids.push(child.id);
        }
      }
    } else {
      ids.push(item.id);
    }
  }
  return ids;
}

/** Leaf sekmenin üst accordion grubu (zebra-studio vb.) */
export function findParentNavId(
  items: SidebarItem[],
  childId: string
): string | null {
  for (const item of items) {
    if (!item.children?.length) continue;
    for (const child of item.children) {
      if (child.id === childId) return item.id;
      if (childHasNested(child) && child.children.some((leaf) => leaf.id === childId)) {
        return item.id;
      }
    }
  }
  return null;
}

/**
 * Canlı içerik mi, yoksa "Yakında" mı?
 * Rol yetkisi olmayan core sekmeler de Yakında gösterir.
 */
export function isLiveContentTab(
  tabId: string,
  role: string,
  fullName?: string
): boolean {
  const id = migrateStudioTabId(tabId);
  if (id === 'genel') return true;
  if (id === 'takvim') return true;
  if (id === 'randevularim' && role === 'danisman') return true;
  if (id === 'randevu' && role === 'danisman') return true;
  if (
    id === 'cekim' &&
    (role === 'broker' || isPilotRole(role))
  ) {
    return true;
  }
  if (id === 'cekim-raporu' && role === 'broker') return true;
  if (id === 'studio-yeni-portfoy') return true;
  if (id === 'studio-satildi-kiralandi') return true;
  if (
    id === 'studio-toplu' &&
    (role === 'broker' ||
      isPilotRole(role) ||
      isPersonelRole(role))
  ) {
    return true;
  }
  if (id === 'users-overview' || id === 'users-add') {
    return isUserAdmin(fullName, role);
  }
  return false;
}
