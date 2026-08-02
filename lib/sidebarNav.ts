/**
 * Zebra 360 — Sidebar / Navigation menu architecture
 * Accordion groups: only one open at a time (enforced in SidebarNav).
 * Pasif ürün sayfaları menüde aktif; içerik "Yakında" placeholder gösterir.
 */

export type SidebarChild = {
  id: string;
  label: string;
  isEnabled: boolean;
};

export type SidebarItem = {
  id: string;
  label: string;
  /** lucide icon key resolved in SidebarNav */
  icon:
    | 'LayoutGrid'
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
  'randevu',
  'cekim',
  'cekim-raporu',
] as const;

function productTreeBase(): SidebarItem[] {
  return [
    {
      id: 'genel',
      label: 'Genel Bakış',
      icon: 'LayoutGrid',
      isEnabled: true,
    },
    {
      id: 'musteri',
      label: 'Müşteri Yönetimi',
      icon: 'Users',
      isEnabled: true,
    },
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
        { id: 'studio-sosyal', label: 'Sosyal Medya Tasarımları', isEnabled: true },
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

function productTreeTail(opts: { brokerReport: boolean }): SidebarItem[] {
  return [
    {
      id: 'reklam',
      label: 'Reklam Yönetimi',
      icon: 'Megaphone',
      isEnabled: true,
      children: [
        { id: 'kampanya-aktif', label: 'Aktif Kampanyalar', isEnabled: true },
        { id: 'kampanya-olustur', label: 'Kampanya Oluştur', isEnabled: true },
      ],
    },
    {
      id: 'analiz',
      label: 'Analiz & Raporlar',
      icon: 'LineChart',
      isEnabled: true,
      children: [
        ...(opts.brokerReport
          ? [{ id: 'cekim-raporu', label: 'Çekim Raporu', isEnabled: true }]
          : []),
        { id: 'pazar', label: 'Pazar Analiz', isEnabled: true },
        { id: 'bolge-raporu', label: 'Bölge raporu', isEnabled: true },
        { id: 'cma', label: 'Karşılaştırmalı Piyasa Analizi (CMA)', isEnabled: true },
      ],
    },
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

/** Danışman kabuğu */
export function buildConsultantNav(): SidebarItem[] {
  return [
    ...productTreeBase(),
    {
      id: 'randevu-sistemi',
      label: 'Randevu Sistemi',
      icon: 'CalendarCheck',
      isEnabled: true,
      children: [
        { id: 'takvim', label: 'Çekim takvimi', isEnabled: true },
        { id: 'randevu', label: 'Randevu Talebi', isEnabled: true },
      ],
    },
    ...productTreeTail({ brokerReport: false }),
  ];
}

/** Yönetici kabuğu */
export function buildManagerNav(role: string): SidebarItem[] {
  const isBroker = role === 'broker';
  return [
    ...productTreeBase(),
    {
      id: 'randevu-sistemi',
      label: 'Randevu Sistemi',
      icon: 'CalendarCheck',
      isEnabled: true,
      children: [
        { id: 'takvim', label: 'Çekim takvimi', isEnabled: true },
        { id: 'cekim', label: 'Çekim Talepleri', isEnabled: true },
        { id: 'randevu', label: 'Randevu Talebi', isEnabled: true },
      ],
    },
    ...productTreeTail({ brokerReport: isBroker }),
  ];
}

/** Menüdeki tüm navigasyon id'leri (URL / allowedTabs) */
export function collectNavTabIds(items: SidebarItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.children?.length) {
      for (const child of item.children) ids.push(child.id);
    } else {
      ids.push(item.id);
    }
  }
  return ids;
}

export function findParentNavId(
  items: SidebarItem[],
  childId: string
): string | null {
  for (const item of items) {
    if (item.children?.some((c) => c.id === childId)) return item.id;
  }
  return null;
}

/**
 * Canlı içerik mi, yoksa "Yakında" mı?
 * Rol yetkisi olmayan core sekmeler de Yakında gösterir.
 */
export function isLiveContentTab(tabId: string, role: string): boolean {
  if (tabId === 'genel' || tabId === 'takvim') return true;
  if (tabId === 'randevu' && role === 'danisman') return true;
  if (
    tabId === 'cekim' &&
    (role === 'broker' || role === 'selim' || role === 'fatima')
  ) {
    return true;
  }
  if (tabId === 'cekim-raporu' && role === 'broker') return true;
  return false;
}
