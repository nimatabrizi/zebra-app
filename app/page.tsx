// @ts-nocheck
'use client';
/**
 * ZEBRA PRO - Enterprise Apple HIG Aesthetic Refactor
 * * Visual Overhaul Details:
 * - Theme: Deep Graphite (#0A0A0A base, #121212 & #161616 components).
 * - Typography: Pure sans-serif (System UI/Inter). High contrast, precise tracking.
 * - Geometry: Corner radii strictly 12px-16px (rounded-xl, rounded-2xl).
 * - Layout: Full-width containers, 8pt grid precision.
 * - Restored Modules: "Geçmiş Randevularım / Hareketler" & "Geçmiş Çekim Talepleri / Arşiv" as Apple Wallet/iOS Notification style stacks.
 * - Calendar: Defaults to "Today", explicitly separates filtering logic per user.
 * * Structural Preservation (100% INTACT):
 * - Backend data flow, multi-user scaffolding, Supabase integrations, and custom slots (15:00 - 18:00) preserved perfectly.
 */
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { 
  Search, Plus, Camera, Building2, 
  X, ChevronDown, LogOut, ChevronLeft, ChevronRight, Clock, 
  MapPin, AlignLeft, User, CheckCircle2, AlertCircle, Inbox, 
  History, Bell, CheckCheck, CalendarDays, Pencil
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  generateEmailFromName,
  normalizeWhatsappPassword,
  defaultTabForRole,
  roleLabel,
  usesManagerShell,
  canApproveAppointments,
  canCreateManualAppointment,
  manualEntryDisplayName,
  isUserAdmin,
  isPilotRole,
  isPilotAccount,
  isUuid,
  normalizeAppRole,
  isPersonelRole,
  PILOT_OPTIONS,
} from '../lib/authIdentity';
import { toTitleCaseName } from '../lib/formatName';
import {
  appointmentNamesMatch,
  formatAppointmentRow,
  isConfirmedStatus as isConfirmedStatusUtil,
  isPendingStatus as isPendingStatusUtil,
  isRejectedStatus as isRejectedStatusUtil,
  groupAppointmentsByIlce,
  normalizeAppointmentStatus,
  ownerRoleFromPilot as ownerRoleFromPilotUtil,
  ownerRoleDisplayName as ownerRoleDisplayNameUtil,
  pilotOwnsAppointment as pilotOwnsAppointmentUtil,
  parseDisplayDate,
  formatWeekdayTr,
} from '../lib/appointmentUtils';
import { DEFAULT_IL, TURKEY_ILLER, getIlceler } from '../lib/turkeyLocations';
import {
  OFFER_HOUR_OPTIONS,
  formatOfferHour,
  formatOfferRange,
  getOfferEndHours,
  parseOfferRange,
} from '../lib/timeSlots';
import {
  findOfferRangeConflicts,
  isOfferEndBlockedByConfirmed,
  isOfferStartBlockedByConfirmed,
} from '../lib/offerConflicts';
import { APPOINTMENT_STATUS_LABELS } from '../types/appointments';
import {
  formatNotificationRow,
  isNotificationOwnedBy,
} from '../lib/notifications';
import CekimRaporuPanel from '../components/CekimRaporuPanel';
import ComingSoonPlaceholder from '../components/ComingSoonPlaceholder';
import GlobalCalendar from '../components/global-calendar/GlobalCalendar';
import DayEventsModal from '../components/global-calendar/DayEventsModal';
import OverviewDashboard from '../components/OverviewDashboard';
import SidebarNav from '../components/SidebarNav';
import SmartSchedulingAssistant from '../components/SmartSchedulingAssistant';
import WeatherBadge from '../components/WeatherBadge';
import ZebraStudio from '../components/ZebraStudio';
import SoldRentedStudio from '../components/SoldRentedStudio';
import BatchProductionStudio from '../components/BatchProductionStudio';
import UserManagement from '../components/UserManagement';
import {
  buildConsultantNav,
  buildManagerNav,
  collectNavTabIds,
  isLiveContentTab,
} from '../lib/sidebarNav';
import {
  appointmentToCalendarEvent,
  buildDayMarkers,
} from '../lib/calendarEvents';

export default function App() {
  // --- PRESERVED LOGIC & STATE MANAGEMENT ---
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [role, setRole] = useState(''); 
const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('genel');
  const [fullName, setFullName] = useState(''); // Gerçek isim veritabanından çekilip buraya yazılacak
  const [currentUserId, setCurrentUserId] = useState(''); // Auth / profiles UUID
  const [isPilot, setIsPilot] = useState(false); // YENİ: Pilot yetkisi
  const isLoggedInRef = useRef(false);
  const currentUserIdRef = useRef('');
  const rememberMeRef = useRef(false);
  const activeTabRef = useRef('genel');
  const mainScrollRef = useRef(null);

  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    rememberMeRef.current = rememberMe;
  }, [rememberMe]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const REMEMBER_ME_KEY = 'zebra_remember_me';
  const TAB_SESSION_KEY = 'zebra_session_active';
  const ACTIVE_TAB_KEY = 'zebra_active_tab';

  const normalizeAppTab = (tabId) => {
    if (!tabId || typeof tabId !== 'string') return null;
    if (tabId === 'teklif-onay') return 'randevu';
    if (tabId === 'studio-sosyal') return 'studio-yeni-portfoy';
    if (
      tabId === 'kullanici-yonetimi' ||
      tabId === 'users-edit' ||
      tabId === 'users-delete'
    ) {
      return 'users-overview';
    }
    return tabId;
  };

  const readStoredActiveTab = () => {
    if (typeof window === 'undefined') return null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('tab');
      const normalizedUrl = normalizeAppTab(fromUrl);
      if (normalizedUrl) return normalizedUrl;
      return normalizeAppTab(sessionStorage.getItem(ACTIVE_TAB_KEY));
    } catch {
      return null;
    }
  };

  const persistActiveTab = (tabId) => {
    const next = normalizeAppTab(tabId) || 'genel';
    activeTabRef.current = next;
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(ACTIVE_TAB_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    } catch {
      /* ignore */
    }
  };

  /** İlk boyamada URL / sessionStorage sekmesini geri yükle (auth'tan önce) */
  useLayoutEffect(() => {
    const stored = readStoredActiveTab();
    if (stored && stored !== activeTabRef.current) {
      setActiveTab(stored);
      activeTabRef.current = stored;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Sekme değişince ana içerik her zaman en üstten açılsın */
  useEffect(() => {
    const el = mainScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [activeTab]);

  /** Eski teklif-onay / pilot randevu sekmesi → rolün canlı paneline */
  useEffect(() => {
    if (activeTab === 'teklif-onay') {
      const next =
        role === 'danisman' ? 'randevu' : isPersonelRole(role) ? 'takvim' : 'cekim';
      setActiveTab(next);
      persistActiveTab(next);
      return;
    }
    if (activeTab === 'randevu' && role && role !== 'danisman') {
      const next = isPersonelRole(role) ? 'takvim' : 'cekim';
      setActiveTab(next);
      persistActiveTab(next);
      return;
    }
    if (activeTab === 'cekim' && isPersonelRole(role)) {
      setActiveTab('takvim');
      persistActiveTab('takvim');
    }
  }, [activeTab, role]);

  const clearProfileCache = () => {
    localStorage.removeItem('zebra_auth_status');
    localStorage.removeItem('zebra_user_role');
    localStorage.removeItem('zebra_username');
    localStorage.removeItem('zebra_fullname');
    localStorage.removeItem('zebra_is_pilot');
  };

  /** Beni hatırla / sekme oturumu tercihlerini uygula */
  const applyRememberPreference = (shouldRemember) => {
    if (typeof window === 'undefined') return;
    if (shouldRemember) {
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
      sessionStorage.removeItem(TAB_SESSION_KEY);
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      sessionStorage.setItem(TAB_SESSION_KEY, 'true');
    }
  };

  const canRestoreSession = () => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem(REMEMBER_ME_KEY) === 'true' ||
      sessionStorage.getItem(TAB_SESSION_KEY) === 'true'
    );
  };

  const shouldPersistProfileCache = () =>
    typeof window !== 'undefined' && localStorage.getItem(REMEMBER_ME_KEY) === 'true';
  
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const isNotificationOpenRef = useRef(false);
  const showToastRef = useRef(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  /** Panelde ilk kez gösterilen (açılışta okunmamış) bildirim id'leri — stil için */
  const [firstShownNotifIds, setFirstShownNotifIds] = useState(() => new Set());

  useEffect(() => {
    isNotificationOpenRef.current = isNotificationOpen;
  }, [isNotificationOpen]);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data.map((n) => formatNotificationRow(n)));
    }
  };

  const [bookedAppointments, setBookedAppointments] = useState<any[]>([]);

  // Service-role API: profiles.role=pilot iken eski appointments RLS boş döner.
  const fetchAppointments = async () => {
    try {
      const res = await fetch('/api/appointments', {
        credentials: 'same-origin',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(
          'Veri çekme hatası:',
          payload?.error || res.statusText,
          payload
        );
        return;
      }
      const data = Array.isArray(payload?.appointments)
        ? payload.appointments
        : [];
      setBookedAppointments(data.map((row) => formatAppointmentRow(row)));
    } catch (error) {
      console.error('Veri çekme hatası:', error);
    }
  };

  // Kullanıcı değiştiğinde veya giriş yapıldığında bildirimleri yükle
  useEffect(() => {
    if (isLoggedIn && (fullName || currentUserId)) {
      fetchNotifications();
    }
  }, [isLoggedIn, fullName, currentUserId]);

  /**
   * Gerçek zamanlı bildirimler — INSERT/UPDATE/DELETE
   * Sayfa yenilemeden zil rozeti + panel güncellenir.
   */
  useEffect(() => {
    if (!isLoggedIn || (!currentUserId && !fullName)) return;

    const channelName = `zebra-notifications:${currentUserId || fullName}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const row = payload.new;
          if (!row || !isNotificationOwnedBy(row, currentUserId, fullName)) return;
          const formatted = formatNotificationRow(row);
          setNotifications((prev) => {
            if (prev.some((n) => String(n.id) === String(formatted.id))) return prev;
            return [formatted, ...prev];
          });
          // Eski appointments RLS pilot realtime olayını gizleyebilir.
          // Bildirim güvenilir tetikleyicidir; aktif akışı sunucu API'sinden yenile.
          const title = String(formatted.title || '').toLocaleLowerCase('tr-TR');
          if (
            title.includes('çekim') ||
            title.includes('cekim') ||
            title.includes('talep')
          ) {
            void fetchAppointments();
          }
          if (!isNotificationOpenRef.current) {
            showToastRef.current?.(String(formatted.title || 'Yeni bildirim'));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          if (!isNotificationOwnedBy(row, currentUserId, fullName)) {
            setNotifications((prev) =>
              prev.filter((n) => String(n.id) !== String(row.id))
            );
            return;
          }
          const formatted = formatNotificationRow(row);
          setNotifications((prev) => {
            const idx = prev.findIndex((n) => String(n.id) === String(formatted.id));
            if (idx === -1) return [formatted, ...prev];
            const next = [...prev];
            next[idx] = { ...next[idx], ...formatted };
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload) => {
          const row = payload.old;
          if (!row?.id) return;
          setNotifications((prev) =>
            prev.filter((n) => String(n.id) !== String(row.id))
          );
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Supabase bağlantıyı kendisi yeniden dener. console.error Next.js
          // geliştirme overlay'ini açarak ilgisiz işlemleri bölüyordu.
          console.warn('Bildirim Realtime kanalı yeniden bağlanıyor');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isLoggedIn, currentUserId, fullName]);

  const isNotificationForMe = (n) =>
    isNotificationOwnedBy(n, currentUserId, fullName);

  const userNotifications = notifications.filter(isNotificationForMe);
  const unreadCount = userNotifications.filter((n) => !n.is_read).length;

  /** Panel açılınca tüm okunmamışları DB'de is_read=true yap (liste silinmez) */
  const markUnreadAsRead = async () => {
    const unread = notifications.filter(
      (n) => isNotificationForMe(n) && !n.is_read
    );
    if (unread.length === 0) return;

    setFirstShownNotifIds(new Set(unread.map((n) => String(n.id))));

    setNotifications((prev) =>
      prev.map((n) => (isNotificationForMe(n) ? { ...n, is_read: true } : n))
    );

    const userKeys = [...new Set([currentUserId, fullName].filter(Boolean))];
    if (userKeys.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('user_id', userKeys)
      .eq('is_read', false);

    if (error) {
      console.error('Bildirimler okundu işaretlenemedi:', error.message, error);
    }
  };

  useEffect(() => {
    if (!isNotificationOpen) {
      setFirstShownNotifIds(new Set());
      return;
    }
    void markUnreadAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotificationOpen]);

  /** Bildirim kartı → ilgili sekme */
  const resolveNotificationTab = (notif) => {
    if (notif?.link_tab) {
      // Personelde talep paneli yok; eski link_tab=cekim → takvim
      if (isPersonelRole(role) && notif.link_tab === 'cekim') return 'takvim';
      return notif.link_tab;
    }
    const title = String(notif?.title || '').toLocaleLowerCase('tr-TR');
    const msg = String(notif?.message || '').toLocaleLowerCase('tr-TR');
    const blob = `${title} ${msg}`;

    if (isPersonelRole(role)) return 'takvim';

    if (
      blob.includes('teklif') ||
      blob.includes('kesinleştirmenizi') ||
      blob.includes('kesinlestirmenizi') ||
      blob.includes('güncellendi') ||
      blob.includes('guncellendi') ||
      blob.includes('yeniden atandı') ||
      blob.includes('yeniden atandi')
    ) {
      return role === 'danisman' ? 'randevu' : 'cekim';
    }
    if (
      blob.includes('yarın') ||
      blob.includes('yarin') ||
      blob.includes('bugün çekim') ||
      blob.includes('bugun cekim') ||
      blob.includes('hatırlat') ||
      blob.includes('hatirlat')
    ) {
      return 'takvim';
    }
    if (blob.includes('talep') || blob.includes('iptal')) {
      return role === 'danisman' ? 'randevu' : 'cekim';
    }
    if (blob.includes('kesinleş') || blob.includes('kesinles')) {
      return 'takvim';
    }
    if (usesManagerShell(role)) return 'cekim';
    return 'takvim';
  };

  const handleNotificationClick = (notif) => {
    const tab = resolveNotificationTab(notif);
    setIsNotificationOpen(false);
    navigateToTab(tab);
    try {
      router.replace(`/?tab=${encodeURIComponent(tab)}`);
    } catch {
      /* SPA fallback: navigateToTab already updated history */
    }
  };

  const patchAppointment = async (
    id: string | number,
    patch: Record<string, unknown>
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(String(id))}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          message: String(payload?.error || res.statusText || 'Güncelleme başarısız'),
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Güncelleme başarısız',
      };
    }
  };

  // Sayfa yüklendiğinde verileri otomatik çeker
  useEffect(() => {
    if (isLoggedIn) {
      fetchAppointments();
    }
  }, [isLoggedIn]);

  /**
   * Gerçek zamanlı randevular — listeler / takvim / teklifler yenilemesiz.
   */
  useEffect(() => {
    if (!isLoggedIn) return;

    const channel = supabase
      .channel(`zebra-appointments:${currentUserId || 'anon'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void fetchAppointments();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('Randevu Realtime kanalı yeniden bağlanıyor');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isLoggedIn, currentUserId]);

  // Location-first talep formu (tarih/saat yok)
  const [requestIl, setRequestIl] = useState(DEFAULT_IL);
  const [requestIlce, setRequestIlce] = useState('');
  const [requestSemt, setRequestSemt] = useState('');
  const [danismanNotu, setDanismanNotu] = useState('');
  const [portfolioType, setPortfolioType] = useState('');
  const [selectedPilot, setSelectedPilot] = useState(null);

  // Bölge aktivitesi — il/ilçe seçilince otomatik (Soruştur yok)
  const regionActivity = useMemo(() => {
    if (!requestIl || !requestIlce) return null;
    const activeStatuses = new Set([
      'pilot_bekleniyor',
      'danisman_onayi_bekliyor',
      'kesinlesti',
    ]);
    return bookedAppointments
      .filter((app) => {
        const st = normalizeAppointmentStatus(app.status);
        return (
          activeStatuses.has(st) &&
          app.il === requestIl &&
          app.ilce === requestIlce
        );
      })
      .sort((a, b) => {
        const da = String(a.tarih || '');
        const db = String(b.tarih || '');
        if (da !== db) return da.localeCompare(db, 'tr');
        return String(a.saatBlok || '').localeCompare(String(b.saatBlok || ''), 'tr');
      });
  }, [bookedAppointments, requestIl, requestIlce]);

  // Pilot teklif (aşama 2)
  const [offeringId, setOfferingId] = useState(null);
  const [offerTarih, setOfferTarih] = useState('');
  const [offerStartHour, setOfferStartHour] = useState('');
  const [offerEndHour, setOfferEndHour] = useState('');
  const [isOfferCalendarOpen, setIsOfferCalendarOpen] = useState(false);
  const [offerCalMonth, setOfferCalMonth] = useState(new Date().getMonth());
  const [offerCalYear, setOfferCalYear] = useState(new Date().getFullYear());

  // Takvim / slot (personel paneli — talep formundan bağımsız)
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTimeBlock, setSelectedTimeBlock] = useState(null);
  const [locationStr, setLocationStr] = useState('');
  const [description, setDescription] = useState('');

  const [processingId, setProcessingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [confirmSuccessInfo, setConfirmSuccessInfo] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Düzenleme modalı
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [editForm, setEditForm] = useState({
    tarih: '',
    saatBlok: '',
    konum: '',
    portfoyTuru: '',
    aciklama: '',
    pilot: '',
    status: 'pilot_bekleniyor',
    reddedilmeSebebi: '',
    il: DEFAULT_IL,
    ilce: '',
    semt: '',
    danismanNotu: '',
  });
  const [editStartHour, setEditStartHour] = useState('');
  const [editEndHour, setEditEndHour] = useState('');
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [isEditCalendarOpen, setIsEditCalendarOpen] = useState(false);
  const [editCalMonth, setEditCalMonth] = useState(new Date().getMonth());
  const [editCalYear, setEditCalYear] = useState(new Date().getFullYear());

  // Manuel çekim ekleme
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [isManualCalendarOpen, setIsManualCalendarOpen] = useState(false);
  const [manualCalMonth, setManualCalMonth] = useState(new Date().getMonth());
  const [manualCalYear, setManualCalYear] = useState(new Date().getFullYear());
  const [manualStartHour, setManualStartHour] = useState('');
  const [manualEndHour, setManualEndHour] = useState('');
  const [consultants, setConsultants] = useState([]);
  const [manualForm, setManualForm] = useState({
    tarih: '',
    il: DEFAULT_IL,
    ilce: '',
    semt: '',
    portfoyTuru: '',
    aciklama: '',
    danismanIsmi: '',
    pilot: '',
  });

  const [currentDate] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [expandedRows, setExpandedRows] = useState([]);

  /** null = henüz gün seçilmedi; liste yalnızca içerik olan güne tıklanınca açılır */
  const [takvimSelectedDate, setTakvimSelectedDate] = useState(null);
  /** Günün randevuları filtresi: all | confirmed */
  const [dayListFilter, setDayListFilter] = useState('all');
  /** Danışman Randevularım: sayfa her açıldığında tüm kayıtlar. */
  const [randevularimFilter, setRandevularimFilter] = useState('all');

  const RANDEVULARIM_FILTERS = [
    { value: 'all', label: 'Tümü' },
    { value: 'danisman_onayi_bekliyor', label: 'Onay Bekliyor' },
    { value: 'pilot_bekleniyor', label: 'Teklif Bekleniyor' },
    { value: 'kesinlesti', label: 'Kesinleşmiş' },
    { value: 'iptal', label: 'İptal' },
  ];

  const formatDateStr = (date: any) => {
    if (!date) return '';
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
  };

  /** Supabase date kolonu için YYYY-MM-DD */
  const toIsoDate = (date: any) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  /** DB'den gelen tarihi UI formatına (DD.MM.YYYY) çevir */
  const toDisplayDate = (value: any) => {
    if (!value) return '';
    const raw = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-');
      return `${d}.${m}.${y}`;
    }
    return String(value);
  };

  /** DD.MM.YYYY → YYYY-MM-DD (date input) */
  const displayDateToIso = (display: string) => {
    if (!display) return '';
    const raw = String(display).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
  };

  /** Formdaki pilot ismi → owner_role (takvim kişi anahtarı; AppRole değil) */
  const ownerRoleFromPilot = (pilotName: string) => ownerRoleFromPilotUtil(pilotName);
  const ownerRoleDisplayName = (ownerRole) => ownerRoleDisplayNameUtil(ownerRole);
  const pilotOwnsAppointment = (app) =>
    pilotOwnsAppointmentUtil(app, { fullName, userId: currentUserId });

  const showToast = (msg: any) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };
  showToastRef.current = showToast;

  /** Türkçe ayrılma eki: Fatima Bayramova'dan, Mehmet Selim İdiz'den */
  const withTurkishAblative = (name) => {
    const n = String(name || '').trim();
    const lower = n.toLocaleLowerCase('tr-TR');
    let lastVowel = 'a';
    for (let i = lower.length - 1; i >= 0; i -= 1) {
      if ('aeıioöuü'.includes(lower[i])) {
        lastVowel = lower[i];
        break;
      }
    }
    const isFront = 'eiöü'.includes(lastVowel);
    return `${n}'${isFront ? 'den' : 'dan'}`;
  };

  /** Randevu tarihi → "25 Temmuz" */
  const formatNotifDayMonth = (tarihValue) => {
    const raw = String(tarihValue || '').trim();
    let day;
    let monthIndex;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const parts = raw.slice(0, 10).split('-').map(Number);
      day = parts[2];
      monthIndex = parts[1] - 1;
    } else if (/^\d{2}\.\d{2}\.\d{4}/.test(raw)) {
      const [d, m] = raw.split('.').map(Number);
      day = d;
      monthIndex = m - 1;
    } else {
      return raw;
    }
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ];
    return `${day} ${months[monthIndex] || ''}`.trim();
  };

  /** Broker bildirimi: tam isimlerle */
  const buildBrokerApprovedMessage = (danismanTamAdi, pilotTamAdi, tarih) => {
    const danisman = toTitleCaseName(danismanTamAdi);
    const pilotLabel = withTurkishAblative(toTitleCaseName(pilotTamAdi));
    const dateLabel = formatNotifDayMonth(tarih);
    return `${danisman} ${pilotLabel} ${dateLabel} tarihinde çekim randevusu aldı.`;
  };

  /** Danışman (randevu sahibi) bildirimi: kesinleşme metni */
  const buildOwnerApprovedMessage = (tarih, konum) => {
    const dateLabel = toDisplayDate(tarih) || String(tarih || '').trim();
    const konumLabel = String(konum || '').trim() || 'Portföy';
    return `${dateLabel} tarihli ${konumLabel} çekim talebiniz kesinleşti.`;
  };

  /** profiles'tan pilot tam adı */
  const resolvePilotFullName = async (pilotField, ownerRoleHint) => {
    const ownerKey = ownerRoleHint || ownerRoleFromPilot(pilotField);
    const displayFallback = ownerRoleDisplayName(ownerKey);
    if (displayFallback) {
      const { data } = await supabase
        .from('profiles')
        .select('tam_isim')
        .eq('is_pilot', true)
        .ilike('tam_isim', `%${displayFallback.split(' ')[0]}%`)
        .limit(1)
        .maybeSingle();
      if (data?.tam_isim) return data.tam_isim;
    }

    const pilotStr = String(pilotField || '').trim();
    if (pilotStr) {
      const { data } = await supabase
        .from('profiles')
        .select('tam_isim')
        .ilike('tam_isim', pilotStr)
        .limit(1)
        .maybeSingle();
      if (data?.tam_isim) return data.tam_isim;
    }

    return displayFallback || pilotStr || fullName || '';
  };

  /** profiles.id (UUID) — tam isim ile */
  const resolveProfileIdByName = async (name) => {
    const label = String(name || '').trim();
    if (!label) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('tam_isim', label)
      .maybeSingle();
    if (error) console.error('Profil UUID çözülemedi:', error.message);
    if (data?.id) return data.id;

    const { data: fuzzy } = await supabase
      .from('profiles')
      .select('id')
      .ilike('tam_isim', label)
      .limit(1)
      .maybeSingle();
    return fuzzy?.id || null;
  };

  /** Pilot profil UUID — isim / takvim anahtarı ile (asla fatima/selim yazılmaz) */
  const resolvePilotProfileId = async (pilotField) => {
    const byName = await resolveProfileIdByName(pilotField);
    if (byName) return byName;

    const ownerKey = ownerRoleFromPilot(pilotField);
    const displayName = ownerRoleDisplayName(ownerKey);
    if (displayName) {
      const { data: exact } = await supabase
        .from('profiles')
        .select('id')
        .ilike('tam_isim', displayName)
        .limit(1)
        .maybeSingle();
      if (exact?.id) return exact.id;

      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_pilot', true)
        .ilike('tam_isim', `%${displayName.split(' ')[0]}%`)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    return null;
  };

  const resolvePilotUserId = async (appointmentLike) => {
    const existing = appointmentLike?.pilotId ?? appointmentLike?.pilot_id;
    if (isUuid(existing)) return existing;
    return resolvePilotProfileId(
      appointmentLike?.pilot || appointmentLike?.ownerRole || null
    );
  };

  /** Danışman profil UUID — isim, yoksa created_by */
  const resolveDanismanProfileId = async (danismanIsmi, createdBy = null) => {
    const byName = await resolveProfileIdByName(danismanIsmi);
    if (byName) return byName;
    if (createdBy) return createdBy;
    return null;
  };

  /**
   * Kesinleşti: danışman + tüm broker'lar + sorumlu pilot (UUID) bildirim.
   * Sahip → standart kesinleşme metni; broker → çekim randevusu; pilot → kesinleşme.
   */
  const notifyAppointmentApproved = async (appointment) => {
    const danismanIsmi = String(appointment?.danismanIsmi || '').trim();
    const createdBy = appointment?.createdBy || null;
    const tarih = appointment?.tarih;
    const konum = appointment?.konum;
    const saatBlok = appointment?.saatBlok || '';
    const pilotField = appointment?.pilot;
    const ownerRoleHint = appointment?.ownerRole || ownerRoleFromPilot(pilotField);

    // 1) Danışman profili (UUID + tam ad)
    let ownerProfile = null;
    if (danismanIsmi) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, tam_isim, role')
        .eq('tam_isim', danismanIsmi)
        .maybeSingle();
      if (error) console.error('Danışman profili bulunamadı:', error.message);
      ownerProfile = data;
      if (!ownerProfile) {
        const { data: fuzzy } = await supabase
          .from('profiles')
          .select('id, tam_isim, role')
          .ilike('tam_isim', danismanIsmi)
          .limit(1)
          .maybeSingle();
        ownerProfile = fuzzy;
      }
    }
    if (!ownerProfile && createdBy) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, tam_isim, role')
        .eq('id', createdBy)
        .maybeSingle();
      if (error) console.error('created_by profili bulunamadı:', error.message);
      // Manuel kayıtta created_by operatör olabilir; yalnızca danışman/broker ise sahip say
      if (data && (data.role === 'danisman' || data.role === 'broker' || data.tam_isim === danismanIsmi)) {
        ownerProfile = data;
      }
    }

    const ownerId = ownerProfile?.id || null;
    const danismanTamAdi = ownerProfile?.tam_isim || danismanIsmi;

    // 2) Tüm broker UUID'leri
    const { data: brokers, error: brokerError } = await supabase
      .from('profiles')
      .select('id, tam_isim, role')
      .eq('role', 'broker');

    if (brokerError) {
      console.error('Broker listesi alınamadı:', brokerError.message);
    }

    const brokerIds = (brokers || []).map((b) => b.id).filter(Boolean);

    // 3) Sorumlu pilot UUID
    const pilotUserId = await resolvePilotUserId(appointment);

    // 4) Alıcı listesi (mükerrer yok)
    const recipientIds = new Set();
    if (ownerId) recipientIds.add(ownerId);
    brokerIds.forEach((id) => recipientIds.add(id));
    if (pilotUserId) recipientIds.add(pilotUserId);

    if (recipientIds.size === 0) {
      console.warn('Kesinleşme bildirimi: alıcı bulunamadı', { danismanIsmi, createdBy });
      return false;
    }

    const pilotTamAdi = await resolvePilotFullName(pilotField, ownerRoleHint);
    const ownerMessage = buildOwnerApprovedMessage(tarih, konum);
    const brokerMessage = buildBrokerApprovedMessage(danismanTamAdi, pilotTamAdi, tarih);
    const dateLabel = tarih || '';
    const pilotMessage = `${toTitleCaseName(danismanTamAdi)}, ${dateLabel}${
      saatBlok ? ` • ${saatBlok}` : ''
    } randevusu kesinleşti.`;

    const rows = Array.from(recipientIds).map((uid) => {
      const isOwner = ownerId && uid === ownerId;
      const isPilotRecipient = pilotUserId && uid === pilotUserId && !isOwner;
      if (isPilotRecipient) {
        return {
          user_id: uid,
          title: 'Randevu Kesinleşti',
          message: pilotMessage,
        };
      }
      return {
        user_id: uid,
        title: isOwner ? 'Talebiniz Kesinleşti' : 'Yeni Kesinleşen Çekim',
        message: isOwner ? ownerMessage : brokerMessage,
      };
    });

    const { error: notifError } = await supabase.from('notifications').insert(rows);
    if (notifError) {
      console.error('Kesinleşme bildirimi yazılamadı:', notifError.message, notifError);
      return false;
    }
    await fetchNotifications();
    return true;
  };

  /**
   * Randevu içeriği güncellendi: ilgili karşı taraflara bildirim.
   * Düzenleyen kişi hariç — danışman / pilot / broker.
   */
  const notifyAppointmentUpdated = async ({
    danismanIsmi,
    createdBy,
    konumLabel,
    tarih,
    saatBlok,
    appointmentId,
    pilot,
    pilotId,
    ownerRole,
    previousPilotId = null,
    changeKind = 'update',
  }) => {
    const dateLabel = toDisplayDate(tarih) || String(tarih || '').trim();
    const timeLabel = String(saatBlok || '').trim();
    const place = String(konumLabel || '').trim() || 'Portföy';
    const actor = toTitleCaseName(fullName || 'Bir kullanıcı');
    const danismanLabel = toTitleCaseName(danismanIsmi) || 'danışman';
    const schedule = timeLabel
      ? `${dateLabel || '—'} • ${timeLabel}`
      : dateLabel || null;
    const scheduleSuffix = schedule ? ` Yeni plan: ${schedule}.` : '';

    const ownerUuid = await resolveDanismanProfileId(danismanIsmi, createdBy);
    const assignedPilotId =
      (isUuid(pilotId) ? pilotId : null) ||
      (await resolvePilotUserId({
        pilot,
        ownerRole,
        pilotId,
      }));

    const { data: brokers, error: brokerError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'broker');
    if (brokerError) {
      console.error('Broker listesi alınamadı:', brokerError.message);
    }

    const actorId = currentUserId || null;
    const rows = [];
    const seen = new Set();

    const pushRow = (userId, title, message, linkTab) => {
      if (!userId || seen.has(userId) || (actorId && userId === actorId)) return;
      seen.add(userId);
      rows.push({
        user_id: userId,
        title,
        message,
        appointment_id: appointmentId ? String(appointmentId) : null,
        link_tab: linkTab,
        is_read: false,
      });
    };

    // Danışman düzenlediyse → atanan pilot + broker
    // Pilot / broker düzenlediyse → danışman + (diğer) pilot + broker
    if (role === 'danisman') {
      const pilotTitle =
        changeKind === 'approval_required'
          ? 'Randevu Değişiklik Talebi'
          : changeKind === 'note'
            ? 'Çekim Notu Güncellendi'
            : 'Çekim Talebi Güncellendi';
      const pilotMessage =
        changeKind === 'approval_required'
          ? `${actor}, ${place} çekiminde değişiklik istedi. İnceleyip yeni teklif gönderin.`
          : changeKind === 'note'
            ? `${actor}, ${place} çekiminin notunu güncelledi.`
            : `${actor}, ${place} çekim talebini güncelledi. Tarih önerinizi bekliyor.`;
      pushRow(
        assignedPilotId,
        pilotTitle,
        pilotMessage,
        'cekim'
      );
      (brokers || []).forEach((b) =>
        pushRow(
          b?.id,
          'Çekim Talebi Güncellendi',
          `${actor}, ${place} çekim talebini güncelledi.`,
          'cekim'
        )
      );
    } else {
      const ownerTitle =
        changeKind === 'approval_required'
          ? 'Çekim Randevusu Değişikliği Onayınızda'
          : changeKind === 'note'
            ? 'Çekim Notu Güncellendi'
            : 'Çekim Randevunuz Güncellendi';
      const ownerMessage =
        changeKind === 'approval_required'
          ? `${actor}, ${place} çekimini güncelledi.${scheduleSuffix} Onayınızı bekliyor.`
          : changeKind === 'note'
            ? `${actor}, ${place} çekiminin notunu güncelledi.`
            : `${actor}, ${place} çekim randevunuzu güncelledi.${scheduleSuffix}`;
      pushRow(
        ownerUuid,
        ownerTitle,
        ownerMessage,
        'randevularim'
      );
      pushRow(
        assignedPilotId,
        'Çekim Güncellendi',
        `${actor}, ${danismanLabel} — ${place} çekimini güncelledi.${scheduleSuffix}`,
        'cekim'
      );
      (brokers || []).forEach((b) =>
        pushRow(
          b?.id,
          'Çekim Güncellendi',
          `${actor}, ${danismanLabel} — ${place} çekimini güncelledi.${scheduleSuffix}`,
          'takvim'
        )
      );
    }

    // Pilot değiştiyse eski sorumluya da haber ver
    if (
      previousPilotId &&
      assignedPilotId &&
      previousPilotId !== assignedPilotId
    ) {
      pushRow(
        previousPilotId,
        'Çekim Talebi Yeniden Atandı',
        `${actor}, ${place} talebini başka bir medya sorumlusuna taşıdı.`,
        'cekim'
      );
    }

    if (rows.length === 0) {
      console.warn('Güncelleme bildirimi: alıcı bulunamadı', {
        danismanIsmi,
        createdBy,
        pilot,
        pilotId: assignedPilotId,
      });
      return false;
    }

    const { error: notifError } = await supabase.from('notifications').insert(rows);
    if (notifError) {
      console.error('Güncelleme bildirimleri yazılamadı:', notifError.message, notifError);
      return false;
    }
    await fetchNotifications();
    return true;
  };

  const canEditAppointment = (app) => {
    if (!app || !role) return false;
    if (role === 'broker') return true;
    if (isPilotRole(role) || isPilot) {
      return pilotOwnsAppointment(app);
    }
    if (role === 'danisman') {
      const isOwner =
        app.createdBy === currentUserId ||
        appointmentNamesMatch(app.danismanIsmi, fullName);
      const status = normalizeAppointmentStatus(app.status);
      return (
        isOwner &&
        (status === 'pilot_bekleniyor' ||
          status === 'kesinlesti')
      );
    }
    return false;
  };

  const isDanismanLocationEdit =
    role === 'danisman' &&
    editingAppointment &&
    normalizeAppointmentStatus(editingAppointment.status) === 'pilot_bekleniyor';

  const editIlceler = getIlceler(editForm.il);
  const manualIlceler = getIlceler(manualForm.il);

  /** Manuel formda kilitli pilot adı — rol değil, giriş yapan kişinin adı */
  const lockedPilotForRole = () => {
    if (isPilotRole(role) || isPilot) {
      return String(fullName || '').trim();
    }
    return '';
  };

  const fetchConsultants = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('tam_isim, role')
      .eq('role', 'danisman')
      .order('tam_isim', { ascending: true });
    if (error) {
      console.error('Danışman listesi hatası:', error.message);
      return;
    }
    setConsultants((data || []).map((p) => p.tam_isim).filter(Boolean));
  };

  useEffect(() => {
    if (isLoggedIn && canCreateManualAppointment(role)) {
      fetchConsultants();
    }
  }, [isLoggedIn, role]);

  const openManualModal = () => {
    if (!canCreateManualAppointment(role)) return;
    const locked = lockedPilotForRole();
    const now = new Date();
    setManualForm({
      tarih: '',
      il: DEFAULT_IL,
      ilce: '',
      semt: '',
      portfoyTuru: '',
      aciklama: '',
      danismanIsmi: '',
      pilot: locked || '',
    });
    setManualStartHour('');
    setManualEndHour('');
    setManualCalMonth(now.getMonth());
    setManualCalYear(now.getFullYear());
    setIsManualCalendarOpen(false);
    setIsManualModalOpen(true);
    fetchConsultants();
  };

  const closeManualModal = () => {
    if (isManualSaving) return;
    setIsManualModalOpen(false);
    setIsManualCalendarOpen(false);
  };

  const handleManualFormChange = (field, value) => {
    setManualForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleManualCalendarSelectIso = (iso) => {
    handleManualFormChange('tarih', iso);
  };

  const openManualSmartCalendar = () => {
    if (!manualForm.il || !manualForm.ilce) {
      showToast('Önce il ve ilçe seçin — takvim hava ve aynı bölge önerilerini buna göre gösterir.');
      return;
    }
    if (manualForm.tarih) {
      const [y, m] = manualForm.tarih.split('-').map(Number);
      if (y && m) {
        setManualCalYear(y);
        setManualCalMonth(m - 1);
      }
    } else {
      const now = new Date();
      setManualCalYear(now.getFullYear());
      setManualCalMonth(now.getMonth());
    }
    setIsManualCalendarOpen(true);
  };

  const handleManualCalPrevMonth = () => {
    if (manualCalMonth === 0) {
      setManualCalMonth(11);
      setManualCalYear((y) => y - 1);
    } else setManualCalMonth((m) => m - 1);
  };

  const handleManualCalNextMonth = () => {
    if (manualCalMonth === 11) {
      setManualCalMonth(0);
      setManualCalYear((y) => y + 1);
    } else setManualCalMonth((m) => m + 1);
  };

  const handleManualCreate = async (e) => {
    e.preventDefault();
    if (!canCreateManualAppointment(role)) {
      showToast('Bu işlem için yetkiniz yok.');
      return;
    }

    const effectivePilot =
      role === 'broker' ? manualForm.pilot : lockedPilotForRole();
    const ownerRole = ownerRoleFromPilot(effectivePilot);
    const startHour = Number(manualStartHour);
    const endHour = Number(manualEndHour);
    const validEndHours = getOfferEndHours(startHour);

    if (
      !manualForm.tarih ||
      !manualStartHour ||
      !manualEndHour ||
      !validEndHours.includes(endHour) ||
      !manualForm.il ||
      !manualForm.ilce
    ) {
      showToast('Tarih, başlangıç/bitiş saati, il ve ilçe zorunludur.');
      return;
    }
    if (!manualForm.danismanIsmi.trim()) {
      showToast('Danışman seçin veya girin.');
      return;
    }
    if (!ownerRole || !effectivePilot) {
      showToast('Geçerli bir sorumlu pilot seçin.');
      return;
    }
    if ((isPilotRole(role) || isPilot) && ownerRole !== ownerRoleFromPilot(fullName)) {
      showToast('Yalnızca kendi adınıza çekim ekleyebilirsiniz.');
      return;
    }

    const manualConflicts = findOfferRangeConflicts({
      appointments: bookedAppointments,
      date: manualForm.tarih,
      startHour,
      endHour,
      pilotName: effectivePilot,
    });
    if (manualConflicts.confirmed.length > 0) {
      showToast('Bu saat aralığı kesinleşmiş bir çekimle çakışıyor; seçilemez.');
      return;
    }

    setIsManualSaving(true);

    const locationLabel = [manualForm.il, manualForm.ilce, manualForm.semt.trim()]
      .filter(Boolean)
      .join(' / ');
    const pilotUserId = await resolvePilotProfileId(effectivePilot);
    if (!pilotUserId) {
      showToast('Pilot profili bulunamadı. Fatima / Selim kaydını kontrol edin.');
      setIsManualSaving(false);
      return;
    }
    const saatBlok = formatOfferRange(startHour, endHour);

    const payload = {
      danisman_ismi: manualForm.danismanIsmi.trim(),
      pilot: effectivePilot,
      pilot_id: pilotUserId,
      tarih: manualForm.tarih,
      saat_blok: saatBlok,
      il: manualForm.il,
      ilce: manualForm.ilce,
      semt: manualForm.semt.trim() || null,
      konum: locationLabel,
      portfoy_turu: manualForm.portfoyTuru.trim() || null,
      aciklama: manualForm.aciklama.trim() || null,
    };

    const response = await fetch('/api/appointments', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Manuel çekim ekleme hatası:', result?.error || response.statusText);
      showToast(result?.error || 'Kayıt sırasında bir hata oluştu.');
      setIsManualSaving(false);
      return;
    }

    await fetchAppointments();
    await fetchNotifications();
    setIsManualSaving(false);
    setIsManualModalOpen(false);
    showToast(
      result?.notificationSent
        ? 'Çekim kesinleşti ve danışmana bildirim gönderildi.'
        : 'Çekim kesinleşti; danışman profili bulunamadığı için bildirim gönderilemedi.'
    );
  };

  const isRejectedStatus = (status) => isRejectedStatusUtil(status);
  const isPendingStatus = (status) => isPendingStatusUtil(status);
  const isConfirmedStatus = (status) => isConfirmedStatusUtil(status);

  /** Broker / personel: frontend'de created_by / owner_role / status filtresi yok */
  const seesAllAppointments = role === 'broker' || isPersonelRole(role);

  /**
   * Çekim takvimi için tek görünür veri kaynağı.
   * Gün noktaları ve gün modalı aynı listeyi kullanır; böylece başka kullanıcıya
   * ait veya iptal edilmiş bir kayıt boş gün noktası oluşturamaz.
   */
  const takvimVisibleAppointments = useMemo(() => {
    if (seesAllAppointments) return bookedAppointments;

    if (isPilotRole(role) || isPilot) {
      return bookedAppointments.filter((app) =>
        pilotOwnsAppointmentUtil(app, {
          fullName,
          userId: currentUserId,
        })
      );
    }

    if (role === 'danisman') {
      return bookedAppointments.filter(
        (app) =>
          appointmentNamesMatch(app.danismanIsmi, fullName) ||
          (!!currentUserId && app.createdBy === currentUserId)
      );
    }

    return [];
  }, [
    bookedAppointments,
    role,
    fullName,
    currentUserId,
    isPilot,
    seesAllAppointments,
  ]);

  const takvimCalendarEvents = useMemo(
    () =>
      takvimVisibleAppointments
        .map((app) => appointmentToCalendarEvent(app))
        .filter(Boolean),
    [takvimVisibleAppointments]
  );

  const bookingStats = useMemo(() => {
    const stats = {};
    bookedAppointments.forEach(app => {
      if (!app.tarih || !app.saatBlok) return;
      // Slot doluluk: reddedilenler slotu bloklamaz
      if (isConfirmedStatus(app.status) || isPendingStatus(app.status)) {
        if (!stats[app.tarih]) stats[app.tarih] = {};
        if (!stats[app.tarih][app.saatBlok]) stats[app.tarih][app.saatBlok] = [];
        stats[app.tarih][app.saatBlok].push(app.pilot);
      }
    });
    return stats; 
  }, [bookedAppointments]);

  /** Noktalar ve gün modalı aynı aktif etkinliklerden türetilir. */
  const calendarDayMarkers = useMemo(
    () => buildDayMarkers(takvimCalendarEvents),
    [takvimCalendarEvents]
  );

  const archiveAppointments = useMemo(() => {
    let filtered = [...bookedAppointments];

    if (seesAllAppointments) {
      // broker + personel: tüm kayıtlar, tüm statüler — ekstra filtre yok
    } else if (isPilotRole(role) || isPilot) {
      filtered = filtered.filter((app) => pilotOwnsAppointment(app));
      // Talep ve teklif aşamaları aktif Çekim Talepleri iş akışında kalır.
      filtered = filtered.filter(
        (app) => {
          const status = normalizeAppointmentStatus(app.status);
          return (
            status !== 'pilot_bekleniyor' &&
            status !== 'danisman_onayi_bekliyor'
          );
        }
      );
    } else {
      filtered = filtered.filter((app) =>
        appointmentNamesMatch(app.danismanIsmi, fullName)
      );
    }

    return filtered.sort((a, b) => Number(b.id) - Number(a.id));
  }, [bookedAppointments, role, fullName, isPilot, seesAllAppointments]);

  /** Danışman — Randevularım listesi (filtreli) */
  const danismanRandevularim = useMemo(() => {
    if (role !== 'danisman') return [];
    let filtered = bookedAppointments.filter(
      (app) =>
        appointmentNamesMatch(app.danismanIsmi, fullName) ||
        (!!currentUserId && app.createdBy === currentUserId)
    );
    if (randevularimFilter !== 'all') {
      filtered = filtered.filter(
        (app) => normalizeAppointmentStatus(app.status) === randevularimFilter
      );
    }
    return filtered.sort((a, b) => {
      const da = parseDisplayDate(a.tarih)?.getTime() ?? 0;
      const db = parseDisplayDate(b.tarih)?.getTime() ?? 0;
      if (db !== da) return db - da;
      return Number(b.id) - Number(a.id);
    });
  }, [
    bookedAppointments,
    role,
    fullName,
    currentUserId,
    randevularimFilter,
  ]);

  const selectedTakvimDateStr = formatDateStr(takvimSelectedDate);

  /** Seçili gündeki rol-görünür randevular (segment filtresi hariç) */
  const takvimDayBaseAppointments = useMemo(() => {
    if (!selectedTakvimDateStr) return [];
    const filtered = takvimVisibleAppointments.filter(
      (app) => app.tarih === selectedTakvimDateStr
    );

    return filtered.sort((a, b) => {
      const rank = (s) =>
        isPendingStatus(s) ? 0 : isConfirmedStatus(s) ? 1 : 2;
      return rank(a.status) - rank(b.status) || Number(b.id) - Number(a.id);
    });
  }, [
    takvimVisibleAppointments,
    selectedTakvimDateStr,
  ]);

  const takvimAppointmentsForSelectedDate = useMemo(() => {
    // personel: filtre gizli; kalıcı olarak yalnızca kesinleşmişler
    const effectiveDayFilter =
      isPersonelRole(role) ? 'confirmed' : dayListFilter;
    if (effectiveDayFilter === 'confirmed') {
      return takvimDayBaseAppointments.filter((app) =>
        isConfirmedStatus(app.status)
      );
    }
    return takvimDayBaseAppointments;
  }, [takvimDayBaseAppointments, role, dayListFilter]);

  /** Pilot / personel çekim takvimi — gün popup içeriği */
  const cekimTakvimDayEvents = useMemo(
    () =>
      takvimAppointmentsForSelectedDate
        .map((app) => appointmentToCalendarEvent(app))
        .filter(Boolean),
    [takvimAppointmentsForSelectedDate]
  );

  const isCekimDayModalOpen = role !== 'danisman' && !!takvimSelectedDate;

  const offeringRequest = useMemo(
    () => bookedAppointments.find((a) => a.id === offeringId) || null,
    [bookedAppointments, offeringId]
  );

  const offerPilotName =
    offeringRequest?.pilot || (isPilot ? fullName : null);

  /** Seçili teklif aralığı — kesinleşmiş / onay bekleyen çakışmalar */
  const offerRangeConflicts = useMemo(() => {
    if (!offerTarih || !offerStartHour || !offerEndHour) {
      return { confirmed: [], pending: [], all: [] };
    }
    return findOfferRangeConflicts({
      appointments: bookedAppointments,
      date: offerTarih,
      startHour: Number(offerStartHour),
      endHour: Number(offerEndHour),
      pilotName: offerPilotName,
      excludeId: offeringId,
    });
  }, [
    bookedAppointments,
    offerTarih,
    offerStartHour,
    offerEndHour,
    offerPilotName,
    offeringId,
  ]);

  const editPilotName =
    editForm.pilot || editingAppointment?.pilot || (isPilot ? fullName : null);

  const editRangeConflicts = useMemo(() => {
    if (!editForm.tarih || !editStartHour || !editEndHour) {
      return { confirmed: [], pending: [], all: [] };
    }
    return findOfferRangeConflicts({
      appointments: bookedAppointments,
      date: editForm.tarih,
      startHour: Number(editStartHour),
      endHour: Number(editEndHour),
      pilotName: editPilotName,
      excludeId: editingAppointment?.id,
    });
  }, [
    bookedAppointments,
    editForm.tarih,
    editStartHour,
    editEndHour,
    editPilotName,
    editingAppointment?.id,
  ]);

  const toggleRow = (id) => setExpandedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  /** Auth session → profiles yükle ve panele yönlendir */
  const applyProfileSession = async (userId, options = {}) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('Profil yüklenemedi:', error);
      await supabase.auth.signOut();
      showToast('Profil bulunamadı. Personele başvurun.');
      setIsLoggedIn(false);
      setIsLoading(false);
      return false;
    }

    const appRole = normalizeAppRole(profile.role);
    const pilot = isPilotAccount({
      role: profile.role,
      fullName: profile.tam_isim,
      is_pilot: profile.is_pilot,
    });

    setRole(appRole);
    setUsername(profile.tam_isim || '');
    setFullName(profile.tam_isim);
    setCurrentUserId(userId);
    setIsPilot(pilot);
    setIsLoggedIn(true);

    // Auth echo / tab-focus: sekme paneline dokunma
    if (!options.preserveTab) {
      const adminOpts = {
        includeUserAdmin: isUserAdmin(profile.tam_isim, appRole),
      };
      const navItems = usesManagerShell(appRole)
        ? buildManagerNav(appRole, adminOpts)
        : buildConsultantNav(adminOpts);
      const allowedTabs = collectNavTabIds(navItems);
      const storedTab = readStoredActiveTab();
      let nextTab =
        normalizeAppTab(options.tab) ||
        (storedTab && allowedTabs.includes(storedTab) ? storedTab : null) ||
        (activeTabRef.current && allowedTabs.includes(activeTabRef.current)
          ? activeTabRef.current
          : null) ||
        defaultTabForRole(appRole);

      if (nextTab === 'cekim-raporu' && appRole !== 'broker') {
        nextTab = storedTab && storedTab !== 'cekim-raporu' ? storedTab : 'genel';
      }
      if (nextTab === 'cekim' && isPersonelRole(appRole)) {
        nextTab = 'takvim';
      }

      setActiveTab(nextTab);
      persistActiveTab(nextTab);
    }

    // Beni hatırla: profil önbelleğini localStorage'a yaz; aksi halde temizle
    if (options.persist) {
      localStorage.setItem('zebra_auth_status', 'true');
      localStorage.setItem('zebra_user_role', appRole);
      localStorage.setItem('zebra_username', profile.tam_isim || '');
      localStorage.setItem('zebra_fullname', profile.tam_isim);
      localStorage.setItem('zebra_is_pilot', String(pilot));
    } else {
      clearProfileCache();
    }

    setIsLoading(false);
    return true;
  };

  // 1. SUPABASE AUTH OTURUMU
  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        // Cookie kalmış olabilir; Beni hatırla / sekme oturumu yoksa temizle
        if (!canRestoreSession()) {
          await supabase.auth.signOut();
          clearProfileCache();
          setIsLoading(false);
          return;
        }
        await applyProfileSession(session.user.id, {
          persist: shouldPersistProfileCache(),
        });
      } else {
        setIsLoading(false);
      }
    };

    boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
        setRole('');
        setFullName('');
        setCurrentUserId('');
        setIsPilot(false);
        return;
      }

      if (!session?.user) return;

      const alreadySynced =
        isLoggedInRef.current && currentUserIdRef.current === session.user.id;

      // SIGNED_IN / INITIAL_SESSION: Beni hatırla tercihine göre persist
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (event === 'INITIAL_SESSION' && !canRestoreSession()) {
          await supabase.auth.signOut();
          return;
        }
        // Tab focus / token yenileme SIGNED_IN echo → paneli sıfırlama
        if (alreadySynced) return;

        const persist =
          rememberMeRef.current || shouldPersistProfileCache();
        await applyProfileSession(session.user.id, { persist });
        return;
      }

      // TOKEN_REFRESHED: UI oturumu yoksa veya kullanıcı değiştiyse profili senkronize et
      if (event === 'TOKEN_REFRESHED') {
        if (!canRestoreSession() && !isLoggedInRef.current) {
          await supabase.auth.signOut();
          return;
        }
        if (alreadySynced) return;
        await applyProfileSession(session.user.id, {
          persist: shouldPersistProfileCache(),
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobil menü / modal açıkken arkada kaydırmayı engelleme
  useEffect(() => {
    const lock =
      isMobileMenuOpen ||
      isNotificationOpen ||
      !!editingAppointment ||
      isManualModalOpen ||
      isManualCalendarOpen ||
      isOfferCalendarOpen ||
      isEditCalendarOpen;
    document.body.style.overflow = lock ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [
    isMobileMenuOpen,
    isNotificationOpen,
    editingAppointment,
    isManualModalOpen,
    isManualCalendarOpen,
    isOfferCalendarOpen,
    isEditCalendarOpen,
  ]);

  // 2. SUPABASE AUTH GİRİŞ (tam_isim + whatsapp_number)
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showToast('Lütfen tam isim ve telefon numaranızı girin.');
      return;
    }

    setIsLoading(true);

    const email = generateEmailFromName(username);
    const cleanPassword = normalizeWhatsappPassword(password);

    if (!email || email === '@zebra.local') {
      showToast('Geçerli bir tam isim girin.');
      setIsLoading(false);
      return;
    }

    // SIGNED_IN dinleyicisinden önce tercihi yaz (yarış önleme)
    applyRememberPreference(rememberMe);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPassword,
    });

    if (authError || !authData.user) {
      console.error('Auth giriş hatası:', authError);
      showToast('Hatalı giriş! Tam isim veya telefon numarası yanlış.');
      localStorage.removeItem(REMEMBER_ME_KEY);
      sessionStorage.removeItem(TAB_SESSION_KEY);
      setIsLoading(false);
      return;
    }

    await applyProfileSession(authData.user.id, { persist: rememberMe, tab: 'genel' });
  };

  // 3. GÜVENLİ ÇIKIŞ
  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearProfileCache();
    localStorage.removeItem(REMEMBER_ME_KEY);
    sessionStorage.removeItem(TAB_SESSION_KEY);
    setIsLoggedIn(false);
    setIsPilot(false);
    setIsMobileMenuOpen(false);
    setIsNotificationOpen(false);
    setActiveTab('genel');
    try {
      sessionStorage.removeItem(ACTIVE_TAB_KEY);
    } catch {
      /* ignore */
    }
    setUsername('');
    setPassword('');
    setRole('');
    setFullName('');
    setCurrentUserId('');
  };

  const isFormValid =
    Boolean(requestIl) &&
    Boolean(requestIlce) &&
    Boolean(portfolioType.trim()) &&
    Boolean(selectedPilot);

  const resetRequestForm = () => {
    setRequestIl(DEFAULT_IL);
    setRequestIlce('');
    setRequestSemt('');
    setDanismanNotu('');
    setPortfolioType('');
    setSelectedPilot(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      if (!portfolioType.trim()) {
        showToast('Portföy bilgileri zorunludur.');
      }
      return;
    }
    setIsSubmitting(true);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (sessionError || !userId) {
      console.error('Oturum okunamadı:', sessionError);
      showToast('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
      setIsSubmitting(false);
      return;
    }

    const ownerRole = ownerRoleFromPilot(selectedPilot);
    if (!ownerRole) {
      showToast('Geçerli bir medya sorumlusu seçin (Selim veya Fatima).');
      setIsSubmitting(false);
      return;
    }

    const pilotUserId = await resolvePilotProfileId(selectedPilot);
    if (!pilotUserId) {
      showToast('Pilot profili bulunamadı. Personele başvurun.');
      setIsSubmitting(false);
      return;
    }

    const locationLabel = [requestIl, requestIlce, requestSemt.trim()]
      .filter(Boolean)
      .join(' / ');

    const payload = {
      created_by: userId,
      owner_role: ownerRole,
      danisman_ismi: fullName,
      tarih: null,
      saat_blok: null,
      il: requestIl,
      ilce: requestIlce,
      semt: requestSemt.trim() || null,
      konum: locationLabel,
      portfoy_turu: portfolioType.trim(),
      aciklama: danismanNotu.trim() || null,
      danisman_notu: danismanNotu.trim() || null,
      pilot: selectedPilot,
      pilot_id: pilotUserId,
      status: 'pilot_bekleniyor',
      source: 'app',
    };

    const { error } = await supabase.from('appointments').insert([payload]);

    if (error) {
      console.error(
        'Veritabanına yazarken hata oluştu:',
        error.message,
        error.code,
        error.details,
        error.hint,
        error
      );
      showToast(error.message || 'Sistemsel bir hata oluştu, lütfen tekrar deneyin.');
      setIsSubmitting(false);
      return;
    }

    await fetchAppointments();

    const { error: notifError } = await supabase.from('notifications').insert([{
      user_id: pilotUserId,
      title: 'Yeni Çekim Talebi',
      message: `${toTitleCaseName(fullName)}, ${locationLabel} bölgesi için çekim talebi oluşturdu. Tarih önerinizi bekliyor.`,
    }]);
    if (notifError) {
      console.error('Pilot bildirimi yazılamadı:', notifError.message, notifError);
    } else {
      await fetchNotifications();
    }

    setIsSubmitting(false);
    setShowSuccessModal(true);

    setTimeout(() => {
      setShowSuccessModal(false);
      resetRequestForm();
    }, 3000);
  };

  /** Aşama 2 — Pilot tarih/saat aralığı teklif eder */
  const handlePilotOffer = async (req) => {
    const startH = Number(offerStartHour);
    const endH = Number(offerEndHour);
    const endOptions = getOfferEndHours(startH);
    if (!offerTarih || !offerStartHour || !offerEndHour || !endOptions.includes(endH)) {
      showToast('Teklif için tarih, başlangıç ve bitiş saati seçin.');
      return;
    }
    const conflicts = findOfferRangeConflicts({
      appointments: bookedAppointments,
      date: offerTarih,
      startHour: startH,
      endHour: endH,
      pilotName: req.pilot || offerPilotName,
      excludeId: req.id,
    });
    if (conflicts.confirmed.length > 0) {
      showToast('Bu saat aralığı o gün kesinleşmiş bir çekimle çakışıyor; seçilemez.');
      return;
    }
    const offerSaatBlok = formatOfferRange(startH, endH);
    setProcessingId(req.id);

    const patched = await patchAppointment(req.id, {
      tarih: offerTarih,
      saat_blok: offerSaatBlok,
      status: 'danisman_onayi_bekliyor',
    });

    if (!patched.ok) {
      console.error('Teklif gönderme hatası:', patched.message);
      showToast(patched.message || 'Teklif gönderilirken bir hata oluştu.');
      setProcessingId(null);
      return;
    }

    await fetchAppointments();

    const ownerUuid = await resolveDanismanProfileId(req.danismanIsmi, req.createdBy);
    if (ownerUuid) {
      const dateLabel = toDisplayDate(offerTarih);
      const { error: notifError } = await supabase.from('notifications').insert([{
        user_id: ownerUuid,
        title: 'Çekim Teklifi Hazır',
        message: `${req.ilce || req.konum} için ${dateLabel} • ${offerSaatBlok} teklif edildi. Kesinleştirmenizi bekliyor.`,
      }]);
      if (notifError) {
        console.error('Danışman teklif bildirimi yazılamadı:', notifError.message, notifError);
      } else {
        await fetchNotifications();
      }
    }

    setProcessingId(null);
    setOfferingId(null);
    setIsOfferCalendarOpen(false);
    setOfferTarih('');
    setOfferStartHour('');
    setOfferEndHour('');
    showToast('Teklif danışmana gönderildi.');
  };

  /** Aşama 3 — Danışman teklifi kesinleştirir */
  const handleDanismanConfirm = async (req) => {
    setProcessingId(req.id);

    const patched = await patchAppointment(req.id, { status: 'kesinlesti' });

    if (!patched.ok) {
      console.error('Kesinleştirme hatası:', patched.message);
      showToast(patched.message || 'Kesinleştirme sırasında bir hata oluştu.');
      setProcessingId(null);
      return;
    }

    await fetchAppointments();

    // Broker + danışman + pilot bildirimleri (ortak kesinleşme yolu)
    await notifyAppointmentApproved({ ...req, status: 'kesinlesti' });

    setProcessingId(null);
    setConfirmSuccessInfo({
      tarih: req.tarih || '',
      saatBlok: req.saatBlok || '',
      ilce: req.ilce || '',
      il: req.il || '',
    });
  };

  /** Broker hızlı kesinleştirme (tarih zaten varsa → kesinlesti) */
  const handleApprove = async (req) => {
    if (req.status === 'pilot_bekleniyor' || !req.tarih) {
      setOfferingId(req.id);
      setOfferTarih('');
      setOfferStartHour('');
      setOfferEndHour('');
      const now = new Date();
      setOfferCalMonth(now.getMonth());
      setOfferCalYear(now.getFullYear());
      // Form kartın altında uzamasın; Akıllı Planlama doğrudan viewport'ta açılsın.
      setIsOfferCalendarOpen(true);
      return;
    }
    setProcessingId(req.id);

    const patched = await patchAppointment(req.id, { status: 'kesinlesti' });

    if (!patched.ok) {
      console.error('Kesinleştirme hatası:', patched.message);
      showToast(patched.message || 'Kesinleştirme sırasında bir hata oluştu.');
      setProcessingId(null);
      return;
    }

    await fetchAppointments();
    const notified = await notifyAppointmentApproved(req);
    setProcessingId(null);
    if (notified) {
      showToast("Çekim kesinleşti. Danışman, broker ve pilot'a bildirim gönderildi.");
    } else {
      showToast('Çekim kesinleşti, ancak bildirim gönderilemedi.');
    }
  };

  const handleRejectSubmit = async (req) => {
    setProcessingId(req.id);

    const patched = await patchAppointment(req.id, {
      status: 'iptal',
      reddedilme_sebebi: rejectReason,
    });

    if (!patched.ok) {
      console.error('Reddetme hatası:', patched.message);
      showToast(patched.message || 'Reddetme sırasında bir hata oluştu.');
      setProcessingId(null);
      return;
    }

    await fetchAppointments();

    const place = `${req.il || ''} ${req.ilce || req.konum || ''}`.trim() || 'Portföy';
    const actorName = toTitleCaseName(fullName || 'Bir kullanıcı');
    const cancelRows = [];

    if (role === 'danisman') {
      const pilotUuid = await resolvePilotUserId(req);
      if (pilotUuid) {
        cancelRows.push({
          user_id: pilotUuid,
          title: 'Çekim Teklifi Reddedildi',
          message: `${actorName}, ${place} teklifinizi reddetti. Sebep: ${rejectReason}`,
          appointment_id: String(req.id),
          link_tab: 'cekim',
          is_read: false,
        });
      }
    } else {
      const ownerUuid = await resolveDanismanProfileId(
        req.danismanIsmi,
        req.createdBy
      );
      if (ownerUuid) {
        cancelRows.push({
          user_id: ownerUuid,
          title: 'Talebiniz İptal Edildi',
          message: `${place} talebiniz iptal edildi. Sebep: ${rejectReason}`,
          appointment_id: String(req.id),
          link_tab: 'randevularim',
          is_read: false,
        });
      } else {
        console.warn(
          'Danışman UUID bulunamadı, red bildirimi atlanıyor:',
          req.danismanIsmi
        );
      }
    }

    if (cancelRows.length > 0) {
      const { error: notifError } = await supabase
        .from('notifications')
        .insert(cancelRows);
      if (notifError) {
        console.error('Red bildirimi yazılamadı:', notifError.message, notifError);
      } else {
        await fetchNotifications();
      }
    }

    setProcessingId(null);
    setRejectingId(null);
    setRejectReason('');
    setOfferingId(null);
    showToast(
      role === 'danisman'
        ? 'Teklif reddedildi ve pilota bildirildi.'
        : 'Talep iptal edildi ve danışmana bildirildi.'
    );
  };

  const openEditModal = (app) => {
    if (!canEditAppointment(app)) {
      showToast('Bu randevuyu düzenleme yetkiniz yok.');
      return;
    }
    const iso = displayDateToIso(app.tarih);
    const currentStatus = normalizeAppointmentStatus(app.status);
    const canReoffer =
      currentStatus === 'iptal' &&
      (canApproveAppointments(role));
    // Reddedilmiş kaydı açınca varsayılan: yeniden teklif (tarih/saat seçilince kaydet)
    const initialStatus = canReoffer ? 'danisman_onayi_bekliyor' : currentStatus;
    setEditingAppointment(app);
    const parsedRange = parseOfferRange(app.saatBlok);
    setEditStartHour(parsedRange ? String(parsedRange.start) : '');
    setEditEndHour(parsedRange ? String(parsedRange.end) : '');
    setEditForm({
      tarih: iso,
      saatBlok: app.saatBlok || '',
      konum: app.konum || '',
      portfoyTuru: app.portfoyTuru || '',
      aciklama: app.aciklama || '',
      pilot: app.pilot || '',
      status: initialStatus,
      reddedilmeSebebi: canReoffer ? '' : app.reddedilmeSebebi || '',
      il: app.il || DEFAULT_IL,
      ilce: app.ilce || '',
      semt: app.semt || '',
      danismanNotu: app.danismanNotu || app.aciklama || '',
    });
    setIsEditCalendarOpen(false);
    if (iso) {
      const [y, m] = iso.split('-').map(Number);
      setEditCalYear(y);
      setEditCalMonth(m - 1);
    } else {
      const now = new Date();
      setEditCalYear(now.getFullYear());
      setEditCalMonth(now.getMonth());
    }
  };

  const closeEditModal = () => {
    if (isEditSaving) return;
    setIsEditCalendarOpen(false);
    setEditingAppointment(null);
    setEditStartHour('');
    setEditEndHour('');
    setEditForm({
      tarih: '',
      saatBlok: '',
      konum: '',
      portfoyTuru: '',
      aciklama: '',
      pilot: '',
      status: 'pilot_bekleniyor',
      reddedilmeSebebi: '',
      il: DEFAULT_IL,
      ilce: '',
      semt: '',
      danismanNotu: '',
    });
  };

  const openEditCalendar = () => {
    if (editForm.tarih) {
      const [y, m] = editForm.tarih.split('-').map(Number);
      if (y && m) {
        setEditCalYear(y);
        setEditCalMonth(m - 1);
      }
    }
    setIsEditCalendarOpen(true);
  };

  const handleEditCalendarSelectIso = (iso) => {
    handleEditFormChange('tarih', iso);
  };

  const handleEditCalPrevMonth = () => {
    if (editCalMonth === 0) {
      setEditCalMonth(11);
      setEditCalYear((y) => y - 1);
    } else {
      setEditCalMonth((m) => m - 1);
    }
  };

  const handleEditCalNextMonth = () => {
    if (editCalMonth === 11) {
      setEditCalMonth(0);
      setEditCalYear((y) => y + 1);
    } else {
      setEditCalMonth((m) => m + 1);
    }
  };

  const handleEditFormChange = (field, value) => {
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      // Ret dışı status'ta sebep temizlensin
      if (field === 'status' && value !== 'iptal') {
        next.reddedilmeSebebi = '';
      }
      return next;
    });
  };

  const handleUpdateAppointment = async (e) => {
    e.preventDefault();
    if (!editingAppointment) return;

    if (!canEditAppointment(editingAppointment)) {
      showToast('Bu randevuyu düzenleme yetkiniz yok.');
      return;
    }

    const isDanismanEdit =
      role === 'danisman' &&
      normalizeAppointmentStatus(editingAppointment.status) === 'pilot_bekleniyor';

    const normalizeStatus = (s) => normalizeAppointmentStatus(s);
    const oldStatus = normalizeStatus(editingAppointment.status);
    const effectivePilot =
      role === 'broker' || role === 'danisman'
        ? editForm.pilot
        : editingAppointment.pilot || editForm.pilot;
    const oldIso = displayDateToIso(editingAppointment.tarih) || '';
    const pilotChanged =
      String(effectivePilot || '') !== String(editingAppointment.pilot || '');
    const noteChanged =
      (editForm.danismanNotu || '').trim() !==
      String(
        editingAppointment.danismanNotu || editingAppointment.aciklama || ''
      ).trim();
    const substantiveChanged =
      (editForm.tarih || '') !== oldIso ||
      (editForm.saatBlok || '') !== (editingAppointment.saatBlok || '') ||
      (editForm.il || '') !== (editingAppointment.il || '') ||
      (editForm.ilce || '') !== (editingAppointment.ilce || '') ||
      (editForm.semt || '').trim() !==
        String(editingAppointment.semt || '').trim() ||
      (editForm.portfoyTuru || '').trim() !==
        String(editingAppointment.portfoyTuru || '').trim() ||
      (editForm.aciklama || '').trim() !==
        String(editingAppointment.aciklama || '').trim() ||
      pilotChanged;
    let newStatus = isDanismanEdit
      ? 'pilot_bekleniyor'
      : normalizeStatus(editForm.status);

    // Kesinleşmiş çekimde not dışındaki değişiklik yeniden karşı taraf onayına gider.
    if (oldStatus === 'kesinlesti' && substantiveChanged) {
      newStatus =
        role === 'danisman'
          ? 'pilot_bekleniyor'
          : isPilotRole(role) || isPilot
            ? 'danisman_onayi_bekliyor'
            : newStatus;
    }

    // İptal kaydı + tarih/saat dolu + hâlâ iptal seçiliyse → otomatik yeniden teklif
    const canReofferRole =
      canApproveAppointments(role);
    if (
      oldStatus === 'iptal' &&
      canReofferRole &&
      editForm.tarih &&
      editForm.saatBlok &&
      newStatus === 'iptal'
    ) {
      newStatus = 'danisman_onayi_bekliyor';
    }

    if (isDanismanEdit) {
      if (!editForm.il || !editForm.ilce || !editForm.pilot) {
        showToast('İl, ilçe ve pilot zorunludur.');
        return;
      }
    } else if (newStatus === 'pilot_bekleniyor') {
      if (!editForm.pilot && role === 'broker') {
        showToast('Pilot seçin.');
        return;
      }
    } else if (!editForm.tarih || !editForm.saatBlok) {
      showToast(
        oldStatus === 'iptal'
          ? 'Yeniden teklif için tarih ve saat aralığı seçin.'
          : 'Tarih ve saat aralığı zorunludur.'
      );
      return;
    } else if (!editForm.pilot && role === 'broker') {
      showToast('Pilot seçin.');
      return;
    }

    if (
      editForm.tarih &&
      editStartHour &&
      editEndHour &&
      newStatus !== 'pilot_bekleniyor' &&
      newStatus !== 'iptal'
    ) {
      const editConflicts = findOfferRangeConflicts({
        appointments: bookedAppointments,
        date: editForm.tarih,
        startHour: Number(editStartHour),
        endHour: Number(editEndHour),
        pilotName:
          role === 'broker' || role === 'danisman'
            ? editForm.pilot
            : editingAppointment.pilot || editForm.pilot,
        excludeId: editingAppointment.id,
      });
      if (editConflicts.confirmed.length > 0) {
        showToast('Bu saat aralığı o gün kesinleşmiş bir çekimle çakışıyor; seçilemez.');
        return;
      }
    }

    const ownerRole = ownerRoleFromPilot(effectivePilot);

    if (!ownerRole) {
      showToast('Geçerli bir medya sorumlusu seçin.');
      return;
    }

    if ((isPilotRole(role) || isPilot) && ownerRole !== ownerRoleFromPilot(fullName)) {
      showToast('Yalnızca kendi takviminizdeki randevuları güncelleyebilirsiniz.');
      return;
    }

    if ((newStatus === 'iptal' || newStatus === 'rejected') && !String(editForm.reddedilmeSebebi || '').trim()) {
      showToast('İptal durumu için sebep girin.');
      return;
    }
    const statusChanged = oldStatus !== newStatus;
    const danismanIsmi = editingAppointment.danismanIsmi || editForm.danismanIsmi;
    const locationLabel = [editForm.il, editForm.ilce, (editForm.semt || '').trim()]
      .filter(Boolean)
      .join(' / ');
    const konumLabel =
      locationLabel ||
      (editForm.konum || '').trim() ||
      editingAppointment.konum ||
      'Portföy';
    const actorLabel =
      role === 'broker'
        ? (fullName || 'Broker')
        : (ownerRoleDisplayName(role) || fullName || effectivePilot || 'Ekip');

    const contentChanged = substantiveChanged || noteChanged;
    const updateChangeKind =
      oldStatus === 'kesinlesti' && substantiveChanged
        ? 'approval_required'
        : noteChanged && !substantiveChanged
          ? 'note'
          : 'update';

    setIsEditSaving(true);

    try {
      const pilotUserId = await resolvePilotProfileId(effectivePilot);
      const existingPilotId = isUuid(editingAppointment.pilotId)
        ? editingAppointment.pilotId
        : null;
      const resolvedPilotId = pilotUserId || existingPilotId;
      if (!resolvedPilotId) {
        showToast('Pilot profili bulunamadı. Fatima / Selim kaydını kontrol edin.');
        return;
      }
      const updatePayload = isDanismanEdit
        ? {
            il: editForm.il,
            ilce: editForm.ilce,
            semt: (editForm.semt || '').trim() || null,
            konum: locationLabel,
            danisman_notu: (editForm.danismanNotu || '').trim() || null,
            aciklama: (editForm.danismanNotu || '').trim() || null,
            pilot: effectivePilot,
            pilot_id: resolvedPilotId,
            owner_role: ownerRole,
            status: 'pilot_bekleniyor',
          }
        : {
            tarih:
              role === 'danisman' && pilotChanged ? null : editForm.tarih || null,
            saat_blok:
              role === 'danisman' && pilotChanged
                ? null
                : editForm.saatBlok || null,
            il: editForm.il || editingAppointment.il || DEFAULT_IL,
            ilce: editForm.ilce || editingAppointment.ilce || 'Belirsiz',
            semt: (editForm.semt || '').trim() || editingAppointment.semt || null,
            konum: locationLabel || (editForm.konum || '').trim(),
            portfoy_turu: (editForm.portfoyTuru || '').trim() || null,
            aciklama: (editForm.aciklama || '').trim() || null,
            danisman_notu: (editForm.danismanNotu || '').trim() || null,
            pilot: effectivePilot,
            pilot_id: resolvedPilotId,
            owner_role: ownerRole,
            status: newStatus,
            reddedilme_sebebi:
              newStatus === 'iptal'
                ? String(editForm.reddedilmeSebebi || '').trim()
                : null,
          };

      const patched = await patchAppointment(editingAppointment.id, updatePayload);

      if (!patched.ok) {
        console.error('Güncelleme hatası:', patched.message);
        showToast(patched.message || 'Güncelleme sırasında bir hata oluştu.');
        return;
      }

      if (statusChanged) {
        try {
          if (newStatus === 'kesinlesti') {
            await notifyAppointmentApproved({
              ...editingAppointment,
              danismanIsmi: danismanIsmi || editingAppointment.danismanIsmi,
              tarih: editForm.tarih || editingAppointment.tarih,
              konum: konumLabel,
              pilot: effectivePilot || editingAppointment.pilot,
              ownerRole,
              createdBy: editingAppointment.createdBy,
            });
          } else if (newStatus === 'iptal') {
            const cancelReason = String(editForm.reddedilmeSebebi || '').trim();
            const cancelRows = [];
            const actorName = toTitleCaseName(fullName || actorLabel);

            if (role === 'danisman') {
              if (resolvedPilotId) {
                cancelRows.push({
                  user_id: resolvedPilotId,
                  title: 'Çekim Talebi İptal Edildi',
                  message: `${actorName}, ${konumLabel} talebini iptal etti.${
                    cancelReason ? ` Sebep: ${cancelReason}` : ''
                  }`,
                  appointment_id: String(editingAppointment.id),
                  link_tab: 'cekim',
                  is_read: false,
                });
              }
            } else {
              const ownerUuid = await resolveDanismanProfileId(
                danismanIsmi,
                editingAppointment.createdBy
              );
              if (ownerUuid) {
                cancelRows.push({
                  user_id: ownerUuid,
                  title: 'Talebiniz İptal Edildi',
                  message: `${konumLabel} için çekim talebiniz ${actorName} tarafından iptal edilmiştir.${
                    cancelReason ? ` Sebep: ${cancelReason}` : ''
                  }`,
                  appointment_id: String(editingAppointment.id),
                  link_tab: 'randevularim',
                  is_read: false,
                });
              } else {
                console.warn(
                  'Danışman UUID bulunamadı, red bildirimi atlanıyor:',
                  danismanIsmi
                );
              }
            }

            if (cancelRows.length > 0) {
              const { error: notifError } = await supabase
                .from('notifications')
                .insert(cancelRows);
              if (notifError) {
                console.error('Bildirim yazılamadı:', notifError.message, notifError);
              } else {
                await fetchNotifications();
              }
            }
          } else if (
            oldStatus === 'iptal' &&
            newStatus === 'danisman_onayi_bekliyor'
          ) {
            const ownerUuid = await resolveDanismanProfileId(
              danismanIsmi,
              editingAppointment.createdBy
            );
            if (ownerUuid) {
              const dateLabel = toDisplayDate(editForm.tarih);
              const { error: notifError } = await supabase.from('notifications').insert([{
                user_id: ownerUuid,
                title: 'Çekim Teklifi Hazır',
                message: `${editForm.ilce || konumLabel} için ${dateLabel} • ${editForm.saatBlok || ''} teklif edildi. Kesinleştirmenizi bekliyor.`,
              }]);
              if (notifError) {
                console.error('Yeniden teklif bildirimi yazılamadı:', notifError.message, notifError);
              } else {
                await fetchNotifications();
              }
            } else {
              console.warn(
                'Yeniden teklif: danışman UUID bulunamadı',
                danismanIsmi,
                editingAppointment.createdBy
              );
              showToast('Teklif kaydedildi; danışman bildirimi iletilemedi (profil bulunamadı).');
            }
          } else if (contentChanged) {
            await notifyAppointmentUpdated({
              danismanIsmi,
              createdBy: editingAppointment.createdBy,
              konumLabel,
              tarih: editForm.tarih || editingAppointment.tarih,
              saatBlok: editForm.saatBlok || editingAppointment.saatBlok,
              appointmentId: editingAppointment.id,
              pilot: effectivePilot || editingAppointment.pilot,
              pilotId: resolvedPilotId,
              ownerRole,
              previousPilotId: existingPilotId,
              changeKind: updateChangeKind,
            });
          }
        } catch (notifErr) {
          console.error('Bildirim hatası:', notifErr);
        }
      } else if (contentChanged) {
        // Status aynı ama içerik değişti (danışman talep düzenlemesi dahil)
        try {
          await notifyAppointmentUpdated({
            danismanIsmi,
            createdBy: editingAppointment.createdBy,
            konumLabel,
            tarih: editForm.tarih || editingAppointment.tarih,
            saatBlok: editForm.saatBlok || editingAppointment.saatBlok,
            appointmentId: editingAppointment.id,
            pilot: effectivePilot || editingAppointment.pilot,
            pilotId: resolvedPilotId,
            ownerRole,
            previousPilotId: existingPilotId,
            changeKind: updateChangeKind,
          });
        } catch (notifErr) {
          console.error('Güncelleme bildirimi hatası:', notifErr);
        }
      }

      await fetchAppointments();
      const reoffered =
        oldStatus === 'iptal' && newStatus === 'danisman_onayi_bekliyor';
      const sentForReapproval =
        oldStatus === 'kesinlesti' && substantiveChanged;
      setIsEditCalendarOpen(false);
      setEditingAppointment(null);
      setEditStartHour('');
      setEditEndHour('');
      setEditForm({
        tarih: '',
        saatBlok: '',
        konum: '',
        portfoyTuru: '',
        aciklama: '',
        pilot: '',
        status: 'pilot_bekleniyor',
        reddedilmeSebebi: '',
        il: DEFAULT_IL,
        ilce: '',
        semt: '',
        danismanNotu: '',
      });
      showToast(
        reoffered
          ? 'Teklif danışmana iletildi'
          : sentForReapproval
            ? 'Değişiklik karşı tarafın onayına gönderildi.'
            : 'Başarıyla güncellendi'
      );
    } catch (err) {
      console.error('Güncelleme istisnası:', err);
      showToast('Güncelleme sırasında beklenmeyen bir hata oluştu.');
    } finally {
      setIsEditSaving(false);
    }
  };

  // --- APPLE HIG UI RENDERERS ---
  const getStatusBadge = (status) => {
    const baseClass =
      'px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-medium border inline-flex items-center max-w-full whitespace-nowrap shadow-sm';
    const n = normalizeAppointmentStatus(status);
    if (n === 'pilot_bekleniyor' || n === 'danisman_onayi_bekliyor') {
      const label = APPOINTMENT_STATUS_LABELS[n];
      return (
        <span className={`${baseClass} bg-[#1C1C1E] text-[#E5B540] border-[#E5B540]/20`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#E5B540] mr-1.5 shrink-0" />
          {label}
        </span>
      );
    }
    if (n === 'kesinlesti') {
      return (
        <span className={`${baseClass} bg-[#1C1C1E] text-[#34C759] border-[#34C759]/20`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] mr-1.5 shrink-0" />
          Kesinleşti
        </span>
      );
    }
    if (n === 'iptal') {
      return (
        <span className={`${baseClass} bg-[#1C1C1E] text-[#FF3B30] border-[#FF3B30]/20`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] mr-1.5 shrink-0" />
          İptal
        </span>
      );
    }
    return null;
  };

  const renderAppointmentRow = (app) => {
    const isExpanded = expandedRows.includes(app.id);
    const isRejected = isRejectedStatus(app.status);
    const isConfirmed = isConfirmedStatus(app.status);

    return (
      <div
        key={app.id}
        className={`w-full rounded-2xl transition-all duration-300 flex flex-col overflow-hidden shadow-sm relative
          ${isRejected
            ? 'bg-[#1A1212]/90 border border-[#FF3B30]/25 hover:border-[#FF3B30]/40 opacity-80'
            : isConfirmed
              ? 'bg-[#161616] border border-white/5 hover:border-white/10 hover:bg-[#1A1A1A]'
              : 'bg-[#161616] border border-[#E5B540]/15 hover:border-[#E5B540]/25 hover:bg-[#1A1A1A]'
          }`}
      >
        <div 
          className={`flex flex-col gap-4 p-4 sm:p-6 sm:flex-row sm:justify-between sm:items-center transition-colors ${isRejected ? 'cursor-pointer active:scale-[0.99]' : ''}`}
          onClick={() => isRejected && toggleRow(app.id)}
        >
          <div className="flex items-start sm:items-center gap-3 sm:gap-6 min-w-0 flex-1">
            <div className="flex flex-col shrink-0 text-center w-14 sm:w-16 items-center pt-0.5">
              <span className={`text-sm font-medium ${isRejected ? 'text-[#FF3B30]/80' : 'text-white'}`}>
                {app.tarih ? String(app.tarih).substring(0, 5) : '—'}
              </span>
              <span className={`text-[11px] font-medium mt-1 tracking-wide ${isRejected ? 'text-[#FF3B30]/55' : 'text-[#86868B]'}`}>
                {app.saatBlok || app.ilce || 'Bekliyor'}
              </span>
              {app.tarih &&
                app.il &&
                !isRejected &&
                (isConfirmed ||
                  normalizeAppointmentStatus(app.status) === 'danisman_onayi_bekliyor') && (
                  <WeatherBadge
                    il={app.il}
                    ilce={app.ilce}
                    tarih={app.tarih}
                    variant="icon"
                    className="mt-1 sm:hidden"
                  />
                )}
            </div>
            <div className={`w-px h-8 mx-1 hidden sm:block shrink-0 ${isRejected ? 'bg-[#FF3B30]/20' : 'bg-white/5'}`}></div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className={`text-[14px] sm:text-[15px] font-medium break-words ${isRejected ? 'text-[#FF3B30]/90' : 'text-white'}`}>
                {app.il && app.ilce ? `${app.il} / ${app.ilce}${app.semt ? ` / ${app.semt}` : ''}` : (app.konum || 'Konum yok')}
              </span>
              <span className={`text-[12px] sm:text-[13px] mt-1 break-words ${isRejected ? 'text-[#FF3B30]/50' : 'text-[#86868B]'}`}>
                {app.portfoyTuru || app.danismanNotu || '—'}
                {usesManagerShell(role)
                  ? ` • Danışman: ${toTitleCaseName(app.danismanIsmi)}`
                  : role === 'danisman'
                    ? ` • ${toTitleCaseName(app.danismanIsmi)}${app.pilot ? ` • Pilot: ${toTitleCaseName(app.pilot)}` : ''}`
                    : ` • Pilot: ${toTitleCaseName(app.pilot)}`}
                {role === 'broker' && (() => {
                  const owner = app.ownerRole || ownerRoleFromPilot(app.pilot);
                  const islem = ownerRoleDisplayName(owner);
                  return islem ? (
                    <span className="text-neutral-400"> • İşlem: {toTitleCaseName(islem)}</span>
                  ) : null;
                })()}
              </span>
              {app.isManual && (
                <span className="inline-flex mt-2 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase bg-white/5 text-neutral-400 border border-white/5 w-fit">
                  Manuel Giriş: {toTitleCaseName(manualEntryDisplayName(app.createdByRole))}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-4 shrink-0">
            {app.tarih &&
              app.il &&
              !isRejected &&
              (isConfirmed ||
                normalizeAppointmentStatus(app.status) === 'danisman_onayi_bekliyor') && (
                <WeatherBadge
                  il={app.il}
                  ilce={app.ilce}
                  tarih={app.tarih}
                  variant="compact"
                  className="hidden sm:inline-flex"
                />
              )}
            {canEditAppointment(app) && (
              <button
                type="button"
                title="Düzenle"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(app);
                }}
                className="size-8 shrink-0 aspect-square flex items-center justify-center rounded-full bg-[#1C1C1E] border border-white/5 text-[#86868B] hover:text-white hover:bg-white/10 hover:border-white/10 transition-all duration-300 cursor-pointer active:scale-95 self-center"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            )}
            {getStatusBadge(app.status)}
            {isRejected && (
              <div className={`size-8 shrink-0 aspect-square flex items-center justify-center rounded-full border transition-all duration-300 cursor-pointer active:scale-95 self-center ${isExpanded ? 'bg-[#FF3B30]/15 border-[#FF3B30]/30' : 'bg-[#1C1C1E] border-[#FF3B30]/20 hover:bg-[#FF3B30]/10'}`}>
                <ChevronDown className={`w-4 h-4 text-[#FF3B30]/80 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            )}
          </div>
        </div>

        {isRejected && (
          <div className={`transition-all duration-300 ease-zebra ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-6 pb-6 pt-1">
              <div className="bg-[#2A1515] border border-[#FF3B30]/20 rounded-xl p-4 flex items-start space-x-3 shadow-inner">
                <AlertCircle className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-[#FF3B30] uppercase mb-1">Red Sebebi</p>
                  <p className="text-[14px] text-[#A1A1A6] leading-relaxed">{app.reddedilmeSebebi || 'Sebep belirtilmedi.'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const navigateToTab = (tabId) => {
    if (tabId === 'teklif-onay') tabId = 'randevu';
    if (
      tabId === 'kullanici-yonetimi' ||
      tabId === 'users-edit' ||
      tabId === 'users-delete'
    ) {
      tabId = 'users-overview';
    }
    if (tabId === 'randevularim') {
      setRandevularimFilter('all');
    }
    setActiveTab(tabId);
    persistActiveTab(tabId);
    setIsMobileMenuOpen(false);
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
  };

  useEffect(() => {
    if (!confirmSuccessInfo) return undefined;
    const timer = setTimeout(() => {
      setConfirmSuccessInfo(null);
      navigateToTab('genel');
    }, 3200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmSuccessInfo]);

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; 
  };
  const handlePrevMonth = () => { viewMonth === 0 ? (setViewMonth(11), setViewYear(viewYear - 1)) : setViewMonth(viewMonth - 1); };
  const handleNextMonth = () => { viewMonth === 11 ? (setViewMonth(0), setViewYear(viewYear + 1)) : setViewMonth(viewMonth + 1); };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1C1C1E] border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- LOGIN SCREEN (Apple Premium Authentication) ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans antialiased bg-[#0A0A0A]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1C1C1E]/30 via-[#0A0A0A] to-[#0A0A0A] pointer-events-none"></div>
        
        <div className="w-full max-w-[420px] bg-[#111111]/80 backdrop-blur-3xl border border-white/5 rounded-2xl p-10 shadow-[0_0_80px_-20px_rgba(0,0,0,0.8)] relative z-10">
          <div className="flex flex-col items-center justify-center mb-12">
            <Image
              src="/icon-512x512.png"
              alt="Zebra 360"
              width={64}
              height={64}
              className="w-16 h-16 mb-6 rounded-xl object-contain"
              priority
            />
            <h1 className="text-2xl font-medium tracking-tight text-white mb-2">Zebra 360</h1>
            <p className="text-[14px] text-[#86868B]">Kurumsal hesaba giriş yapın</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tam İsim"
                autoComplete="username"
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#86868B] rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-zebra text-[14px]"
                required
              />
            </div>

            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Telefon Numarası"
                autoComplete="current-password"
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#86868B] rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-zebra text-[14px]"
                required
              />
            </div>

            <div className="flex items-center justify-between px-2 pt-2">
              <label className="flex items-center space-x-3 cursor-pointer group active:scale-[0.98] transition-transform">
                <div className="relative flex items-center">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="peer sr-only cursor-pointer" />
                  <div className="w-5 h-5 bg-[#1C1C1E] border border-white/10 rounded-md peer-checked:bg-white peer-checked:border-white transition-all duration-300 ease-zebra flex items-center justify-center">
                    {rememberMe && <CheckCircle2 className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
                  </div>
                </div>
                <span className="text-[13px] text-[#86868B] group-hover:text-white transition-colors duration-300 ease-zebra">Beni hatırla</span>
              </label>
            </div>

            <div className="pt-6">
              <button 
                type="submit" 
                className="w-full h-[56px] bg-white text-black text-[15px] font-medium rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all duration-300 ease-zebra flex items-center justify-center cursor-pointer"
              >
                Giriş Yap
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- DASHBOARD (Apple Executive Interface) ---
  const todayDateObj = new Date();
  const today = new Date(todayDateObj);
  today.setHours(0, 0, 0, 0);

  const todayStr = todayDateObj.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nameKey = fullName?.toLocaleLowerCase('tr-TR') ?? '';
  const canShowNewCekimBtn =
    nameKey.includes('fatima') || nameKey.includes('mehmet selim');
  const currentHour = new Date().getHours();
  let greeting = "";
  if (currentHour >= 6 && currentHour < 12) greeting = "Günaydın";
  else if (currentHour >= 12 && currentHour < 17) greeting = "İyi günler";
  else if (currentHour >= 17 && currentHour < 22) greeting = "İyi akşamlar";
  else greeting = "İyi geceler";

  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  /** Pilotun işlem yapacağı talepler (sidebar rozeti yalnızca bu sayıyı gösterir). */
  const pendingRequests = bookedAppointments.filter(app => {
    const isWaitingPilot =
      normalizeAppointmentStatus(app.status) === 'pilot_bekleniyor';
    if (!isWaitingPilot) return false;
    if (!canApproveAppointments(role)) return false;
    if (isPilotRole(role) || isPilot) {
      return pilotOwnsAppointment(app);
    }
    return true; // broker: tüm bekleyenler
  });

  /**
   * Çekim Talepleri aktif iş akışı:
   * Talep → pilot teklifi → danışman onayı.
   * Teklif gönderilince kayıt kaybolmamalı; danışman yanıtlayana kadar burada kalır.
   */
  const appointmentWorkflowRequests = bookedAppointments.filter((app) => {
    const status = normalizeAppointmentStatus(app.status);
    const isActiveWorkflow =
      status === 'pilot_bekleniyor' ||
      status === 'danisman_onayi_bekliyor';
    if (!isActiveWorkflow || !canApproveAppointments(role)) return false;
    if (isPilotRole(role) || isPilot) {
      return pilotOwnsAppointment(app);
    }
    return true;
  });

  const pendingByIlce = groupAppointmentsByIlce(appointmentWorkflowRequests);

  const danismanConfirmRequests = bookedAppointments.filter(
    (app) =>
      role === 'danisman' &&
      normalizeAppointmentStatus(app.status) === 'danisman_onayi_bekliyor' &&
      (app.createdBy === currentUserId ||
        appointmentNamesMatch(app.danismanIsmi, fullName))
  );

  const requestIlceler = getIlceler(requestIl);

  /** Sidebar badge: menü başına bekleyen eylem sayısı */
  const menuBadgeCounts = {
    cekim: canApproveAppointments(role) ? pendingRequests.length : 0,
    randevu: role === 'danisman' ? danismanConfirmRequests.length : 0,
    randevularim: role === 'danisman' ? danismanConfirmRequests.length : 0,
  };

  const openOfferCalendar = () => {
    if (offerTarih) {
      const [y, m] = offerTarih.split('-').map(Number);
      if (y && m) {
        setOfferCalYear(y);
        setOfferCalMonth(m - 1);
      }
    } else {
      const now = new Date();
      setOfferCalYear(now.getFullYear());
      setOfferCalMonth(now.getMonth());
    }
    setIsOfferCalendarOpen(true);
  };

  const closeOfferFlow = () => {
    if (processingId) return;
    setIsOfferCalendarOpen(false);
    setOfferingId(null);
    setOfferTarih('');
    setOfferStartHour('');
    setOfferEndHour('');
  };

  const handleOfferCalendarSelectIso = (iso) => {
    setOfferTarih(iso);
    if (
      offerStartHour &&
      isOfferStartBlockedByConfirmed({
        appointments: bookedAppointments,
        date: iso,
        startHour: Number(offerStartHour),
        pilotName: offerPilotName,
        excludeId: offeringId,
      })
    ) {
      setOfferStartHour('');
      setOfferEndHour('');
      return;
    }
    if (
      offerStartHour &&
      offerEndHour &&
      isOfferEndBlockedByConfirmed({
        appointments: bookedAppointments,
        date: iso,
        startHour: Number(offerStartHour),
        endHour: Number(offerEndHour),
        pilotName: offerPilotName,
        excludeId: offeringId,
      })
    ) {
      setOfferEndHour('');
      showToast('Seçili aralık bu günde kesinleşmiş çekimle çakışıyor; bitiş saatini yeniden seçin.');
    }
  };

  const handleOfferCalPrevMonth = () => {
    if (offerCalMonth === 0) {
      setOfferCalMonth(11);
      setOfferCalYear((y) => y - 1);
    } else {
      setOfferCalMonth((m) => m - 1);
    }
  };

  const handleOfferCalNextMonth = () => {
    if (offerCalMonth === 11) {
      setOfferCalMonth(0);
      setOfferCalYear((y) => y + 1);
    } else {
      setOfferCalMonth((m) => m + 1);
    }
  };

  return (
    <div className="min-h-screen flex font-sans antialiased text-[#EDEDED] overflow-hidden selection:bg-white/20 selection:text-white bg-[#0A0A0A]">
      
      {/* Toast Notification */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[110] transition-all duration-500 ease-zebra pointer-events-none
        ${toastMessage ? 'opacity-100 transform translate-y-0 scale-100' : 'opacity-0 transform translate-y-8 scale-95'}
      `}>
        <div className="bg-[#1C1C1E]/90 backdrop-blur-xl border border-white/10 text-white px-6 py-4 rounded-full shadow-2xl flex items-center space-x-3">
          <CheckCircle2 className="w-5 h-5 text-white" />
          <span className="text-[14px] font-medium">{toastMessage}</span>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-lg z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#111111]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-10 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-500 ease-zebra">
            <div className="w-20 h-20 bg-[#1C1C1E] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative">
              <CheckCircle2 className="w-10 h-10 text-white relative z-10" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-medium tracking-tight text-white mb-2">Talep İletildi</h2>
            <p className="text-[#86868B] text-[14px] leading-relaxed">Randevu talebiniz başarıyla oluşturuldu ve ekibe bildirildi.</p>
          </div>
        </div>
      )}

      {/* Danışman kesinleştirme başarı modalı → Genel Bakış */}
      {confirmSuccessInfo && (
        <div className="fixed inset-0 bg-[#0A0A0A]/70 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 sm:p-10 max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-[#34C759]/10 border border-[#34C759]/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-[#34C759]" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-medium tracking-tight text-white mb-3">Randevu Kesinleşti</h2>
            <p className="text-[#AEAEB2] text-[15px] leading-relaxed">
              Randevunuz{' '}
              <span className="text-white font-medium">
                {confirmSuccessInfo.tarih || 'belirlenen tarihte'}
                {confirmSuccessInfo.saatBlok ? ` • ${confirmSuccessInfo.saatBlok}` : ''}
              </span>
              {confirmSuccessInfo.ilce ? (
                <>
                  {' '}
                  ({confirmSuccessInfo.il ? `${confirmSuccessInfo.il} / ` : ''}
                  {confirmSuccessInfo.ilce})
                </>
              ) : null}{' '}
              için kesinleşti.
            </p>
            <button
              type="button"
              onClick={() => {
                setConfirmSuccessInfo(null);
                navigateToTab('genel');
              }}
              className="mt-8 w-full h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-neutral-200 transition-all duration-300 ease-zebra cursor-pointer active:scale-[0.98]"
            >
              Genel Bakışa Dön
            </button>
          </div>
        </div>
      )}

      {/* Edit tarih — teklif ile aynı Akıllı Planlama (modal dışında: fixed stacking) */}
      <SmartSchedulingAssistant
        open={!!editingAppointment && isEditCalendarOpen}
        onClose={() => setIsEditCalendarOpen(false)}
        targetIl={editForm.il || editingAppointment?.il}
        targetIlce={editForm.ilce || editingAppointment?.ilce}
        pilotName={editForm.pilot || editingAppointment?.pilot || (isPilot ? fullName : null)}
        appointments={bookedAppointments}
        selectedIso={editForm.tarih || ''}
        onSelectDate={handleEditCalendarSelectIso}
        month={editCalMonth}
        year={editCalYear}
        onPrevMonth={handleEditCalPrevMonth}
        onNextMonth={handleEditCalNextMonth}
      />

      {/* EDIT APPOINTMENT MODAL */}
      {editingAppointment && (
        <div
          className="fixed inset-0 bg-[#0A0A0A]/70 backdrop-blur-xl z-[100] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-300"
          onClick={closeEditModal}
        >
          <div
            className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-zebra max-h-[min(96dvh,90vh)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/5 shrink-0">
              <div>
                <h2 className="text-lg font-medium tracking-tight text-white">Randevuyu Düzenle</h2>
                <p className="text-[12px] text-[#86868B] mt-1">Alanları güncelleyip kaydedin.</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isEditSaving}
                className="w-8 h-8 flex items-center justify-center text-[#86868B] hover:text-white bg-[#1C1C1E] rounded-full transition-colors active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateAppointment} className="flex flex-col flex-1 min-h-0">
                            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-8 py-6 space-y-5">
                {isDanismanLocationEdit ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İl</label>
                        <div className="relative">
                          <select
                            required
                            value={editForm.il}
                            onChange={(e) => { handleEditFormChange('il', e.target.value); handleEditFormChange('ilce', ''); }}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                          >
                            {TURKEY_ILLER.map((il) => (
                              <option key={il} value={il}>{il}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İlçe</label>
                        <div className="relative">
                          <select
                            required
                            value={editForm.ilce}
                            onChange={(e) => handleEditFormChange('ilce', e.target.value)}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                          >
                            <option value="">İlçe seçin</option>
                            {editIlceler.map((ilce) => (
                              <option key={ilce} value={ilce}>{ilce}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Semt</label>
                        <input
                          type="text"
                          value={editForm.semt}
                          onChange={(e) => handleEditFormChange('semt', e.target.value)}
                          className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px]"
                          placeholder="Opsiyonel"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Danışman Notu</label>
                      <textarea
                        value={editForm.danismanNotu}
                        onChange={(e) => handleEditFormChange('danismanNotu', e.target.value)}
                        rows={3}
                        className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 resize-none focus:outline-none focus:border-white/20 text-[14px]"
                        placeholder="Notlar"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Pilot</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {PILOT_OPTIONS.map((pilot) => (
                          <button
                            key={pilot}
                            type="button"
                            onClick={() => handleEditFormChange('pilot', pilot)}
                            className={`w-full flex items-center p-3.5 rounded-xl transition-all text-left cursor-pointer active:scale-[0.98]
                              ${editForm.pilot === pilot ? 'bg-white text-black' : 'bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]'}`}
                          >
                            <User className={`w-3.5 h-3.5 mr-3 ${editForm.pilot === pilot ? 'text-black' : 'text-white'}`} />
                            <span className="text-[13px] font-medium truncate">{toTitleCaseName(pilot)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[12px] text-[#86868B]">Yalnızca talep aşamasında (pilot bekleniyor) düzenlenebilir.</p>
                  </>
                ) : (
                  <>
                    {normalizeAppointmentStatus(editingAppointment?.status) ===
                      'kesinlesti' && (
                      <div className="rounded-xl border border-[#0A84FF]/25 bg-[#0A84FF]/10 px-4 py-3 space-y-1">
                        <p className="text-[13px] font-medium text-[#64AFFF]">
                          Kesinleşmiş randevu
                        </p>
                        <p className="text-[12px] text-[#A1A1A6] leading-relaxed">
                          Yalnızca notu değiştirirseniz randevu kesin kalır. Tarih,
                          saat, konum, portföy veya pilot değişikliği karşı tarafın
                          yeniden onayına gönderilir.
                        </p>
                      </div>
                    )}
                    {normalizeAppointmentStatus(editingAppointment?.status) === 'iptal' &&
                      (canApproveAppointments(role)) && (
                      <div className="rounded-xl border border-[#E5B540]/25 bg-[#E5B540]/10 px-4 py-3 space-y-1">
                        <p className="text-[13px] font-medium text-[#E5B540]">Reddedilmiş randevu — yeniden teklif</p>
                        <p className="text-[12px] text-[#86868B] leading-relaxed">
                          Tarih ve saat aralığı seçip kaydedin. Durum otomatik olarak danışman kesinleştirmesine geçer;
                          danışmana bildirim gider.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="relative sm:col-span-2">
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Tarih</label>
                        <button
                          type="button"
                          onClick={openEditCalendar}
                          className="w-full bg-[#1C1C1E] border border-white/5 text-left text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 hover:border-white/15 transition-all text-[14px] cursor-pointer flex items-center justify-between active:scale-[0.99]"
                        >
                          <span className={editForm.tarih ? 'text-white' : 'text-[#666666]'}>
                            {editForm.tarih ? toDisplayDate(editForm.tarih) : 'Tarih seçin'}
                          </span>
                          <CalendarDays className="w-4 h-4 text-[#86868B] shrink-0" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Başlangıç</label>
                        <div className="relative">
                          <select
                            value={editStartHour}
                            onChange={(e) => {
                              const nextStart = e.target.value;
                              setEditStartHour(nextStart);
                              setEditEndHour('');
                              handleEditFormChange('saatBlok', '');
                            }}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                          >
                            <option value="">Başlangıç seçin</option>
                            {OFFER_HOUR_OPTIONS.map((h) => (
                              <option key={h} value={String(h)}>{formatOfferHour(h)}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Bitiş</label>
                        <div className="relative">
                          <select
                            value={editEndHour}
                            onChange={(e) => {
                              const nextEnd = e.target.value;
                              if (
                                editForm.tarih &&
                                editStartHour &&
                                nextEnd &&
                                isOfferEndBlockedByConfirmed({
                                  appointments: bookedAppointments,
                                  date: editForm.tarih,
                                  startHour: Number(editStartHour),
                                  endHour: Number(nextEnd),
                                  pilotName: editPilotName,
                                  excludeId: editingAppointment?.id,
                                })
                              ) {
                                showToast('Bu saat aralığı kesinleşmiş bir çekimle çakışıyor; seçilemez.');
                                return;
                              }
                              setEditEndHour(nextEnd);
                              const startH = Number(editStartHour);
                              const endH = Number(nextEnd);
                              if (editStartHour && nextEnd) {
                                handleEditFormChange('saatBlok', formatOfferRange(startH, endH));
                              } else {
                                handleEditFormChange('saatBlok', '');
                              }
                            }}
                            disabled={!editStartHour}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <option value="">
                              {editStartHour ? 'Bitiş seçin' : 'Önce başlangıç seçin'}
                            </option>
                            {getOfferEndHours(Number(editStartHour)).map((h) => {
                              const blocked =
                                !!editForm.tarih &&
                                isOfferEndBlockedByConfirmed({
                                  appointments: bookedAppointments,
                                  date: editForm.tarih,
                                  startHour: Number(editStartHour),
                                  endHour: h,
                                  pilotName: editPilotName,
                                  excludeId: editingAppointment?.id,
                                });
                              return (
                                <option key={h} value={String(h)} disabled={blocked}>
                                  {formatOfferHour(h)}{blocked ? ' (dolu)' : ''}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {editRangeConflicts.confirmed.length > 0 && (
                      <div className="rounded-xl border border-[#FF3B30]/25 bg-[#FF3B30]/10 px-4 py-3 text-[12px] text-[#FF3B30]">
                        Bu saat aralığı kesinleşmiş çekimle çakışıyor; seçilemez.
                      </div>
                    )}
                    {editRangeConflicts.pending.length > 0 && (
                      <div className="rounded-xl border border-[#E5B540]/25 bg-[#E5B540]/10 px-4 py-3 space-y-1.5">
                        <p className="text-[12px] font-medium text-[#E5B540]">Bu aralıkta onay bekleniyor</p>
                        {editRangeConflicts.pending.map((app) => (
                          <p key={app.id} className="text-[12px] text-[#AEAEB2] leading-relaxed">
                            {toTitleCaseName(app.danismanIsmi)}
                            {app.saatBlok ? ` · ${app.saatBlok}` : ''}
                            {app.ilce ? ` · ${app.ilce}` : ''}
                          </p>
                        ))}
                      </div>
                    )}

                    {editForm.tarih && editForm.il && (
                      <div className="flex items-center gap-2 -mt-1">
                        <span className="text-[11px] text-[#86868B]">Hava</span>
                        <WeatherBadge
                          il={editForm.il}
                          ilce={editForm.ilce}
                          tarih={editForm.tarih}
                          variant="detail"
                        />
                      </div>
                    )}

                    {(canApproveAppointments(role)) && (
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Durum</label>
                        <div className="relative">
                          <select
                            value={editForm.status}
                            onChange={(e) => handleEditFormChange('status', e.target.value)}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer"
                          >
                            <option value="pilot_bekleniyor">Pilot Bekleniyor</option>
                            <option value="danisman_onayi_bekliyor">Danışman Kesinleştirmesi Bekleniyor (Teklif)</option>
                            {(role === 'broker' ||
                              isPilotRole(role) ||
                              editForm.status === 'kesinlesti') && (
                              <option value="kesinlesti">Kesinleşti</option>
                            )}
                            <option value="iptal">İptal / Reddedildi</option>
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {editForm.status === 'iptal' && (
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İptal Sebebi</label>
                        <textarea value={editForm.reddedilmeSebebi} onChange={(e) => handleEditFormChange('reddedilmeSebebi', e.target.value)} rows={2} className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 resize-none text-[14px]" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İl</label>
                        <div className="relative">
                          <select value={editForm.il} onChange={(e) => { handleEditFormChange('il', e.target.value); handleEditFormChange('ilce', ''); }} className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer">
                            {TURKEY_ILLER.map((il) => (<option key={il} value={il}>{il}</option>))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İlçe</label>
                        <div className="relative">
                          <select value={editForm.ilce} onChange={(e) => handleEditFormChange('ilce', e.target.value)} className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer">
                            <option value="">İlçe seçin</option>
                            {editIlceler.map((ilce) => (<option key={ilce} value={ilce}>{ilce}</option>))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Semt</label>
                        <input type="text" value={editForm.semt} onChange={(e) => handleEditFormChange('semt', e.target.value)} className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px]" placeholder="Opsiyonel" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Portföy Türü</label>
                      <input type="text" value={editForm.portfoyTuru} onChange={(e) => handleEditFormChange('portfoyTuru', e.target.value)} className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px]" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Açıklama</label>
                      <textarea value={editForm.aciklama} onChange={(e) => handleEditFormChange('aciklama', e.target.value)} rows={3} className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 resize-none text-[14px]" />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">
                        Randevu Notu
                      </label>
                      <textarea
                        value={editForm.danismanNotu}
                        onChange={(e) =>
                          handleEditFormChange('danismanNotu', e.target.value)
                        }
                        rows={3}
                        className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 resize-none text-[14px]"
                        placeholder="Pilot ve danışmanın görebileceği not"
                      />
                    </div>

                    {(role === 'broker' || role === 'danisman') && (
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Pilot</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {PILOT_OPTIONS.map((pilot) => (
                            <button key={pilot} type="button" onClick={() => handleEditFormChange('pilot', pilot)} className={`w-full flex items-center p-3.5 rounded-xl text-left cursor-pointer ${editForm.pilot === pilot ? 'bg-white text-black' : 'bg-[#1C1C1E] text-white'}`}>
                              <span className="text-[13px] font-medium truncate">{toTitleCaseName(pilot)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

<div className="px-6 sm:px-8 py-5 border-t border-white/5 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isEditSaving}
                  className="flex-1 h-12 rounded-xl bg-[#1C1C1E] text-white text-[14px] font-medium hover:bg-[#2C2C2E] transition-all cursor-pointer active:scale-[0.98] disabled:opacity-40"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isEditSaving || editRangeConflicts.confirmed.length > 0}
                  className="flex-1 h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                >
                  {isEditSaving ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : normalizeAppointmentStatus(editingAppointment?.status) === 'iptal' &&
                    editForm.status === 'danisman_onayi_bekliyor' ? (
                    'Teklifi Gönder'
                  ) : (
                    'Kaydet'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manuel çekim tarih — Akıllı Planlama (modal dışında) */}
      <SmartSchedulingAssistant
        open={isManualModalOpen && isManualCalendarOpen}
        onClose={() => setIsManualCalendarOpen(false)}
        targetIl={manualForm.il}
        targetIlce={manualForm.ilce}
        pilotName={
          role === 'broker'
            ? manualForm.pilot || null
            : lockedPilotForRole() || fullName || null
        }
        appointments={bookedAppointments}
        selectedIso={manualForm.tarih || ''}
        onSelectDate={handleManualCalendarSelectIso}
        month={manualCalMonth}
        year={manualCalYear}
        onPrevMonth={handleManualCalPrevMonth}
        onNextMonth={handleManualCalNextMonth}
      />

      {/* MANUAL CREATE MODAL */}
      {isManualModalOpen && (
        <div
          className="fixed inset-0 bg-[#0A0A0A]/70 backdrop-blur-xl z-[100] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-300"
          onClick={closeManualModal}
        >
          <div
            className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-zebra max-h-[min(96dvh,90vh)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/5 shrink-0">
              <div>
                <h2 className="text-lg font-medium tracking-tight text-white">Yeni Çekim Oluştur</h2>
                <p className="text-[12px] text-[#86868B] mt-1">
                  Akıllı planlama ile doğrudan kesinleştir — ara onay yok
                </p>
              </div>
              <button
                type="button"
                onClick={closeManualModal}
                disabled={isManualSaving}
                className="w-8 h-8 flex items-center justify-center text-[#86868B] hover:text-white bg-[#1C1C1E] rounded-full transition-colors active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualCreate} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-8 py-6 space-y-5">
                {/* 1) Konum — takvim hava/aynı bölge için önce */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İl</label>
                    <div className="relative">
                      <select
                        required
                        value={manualForm.il}
                        onChange={(e) => {
                          handleManualFormChange('il', e.target.value);
                          handleManualFormChange('ilce', '');
                          handleManualFormChange('tarih', '');
                        }}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer"
                      >
                        {TURKEY_ILLER.map((il) => (
                          <option key={il} value={il}>{il}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">İlçe</label>
                    <div className="relative">
                      <select
                        required
                        value={manualForm.ilce}
                        onChange={(e) => {
                          handleManualFormChange('ilce', e.target.value);
                          handleManualFormChange('tarih', '');
                        }}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer"
                      >
                        <option value="">İlçe seçin</option>
                        {manualIlceler.map((ilce) => (
                          <option key={ilce} value={ilce}>{ilce}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Semt</label>
                    <input
                      type="text"
                      value={manualForm.semt}
                      onChange={(e) => handleManualFormChange('semt', e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px]"
                      placeholder="Opsiyonel"
                    />
                  </div>
                </div>

                {/* 2) Akıllı tarih + başlangıç/bitiş aralığı */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">
                      Tarih (Akıllı Planlama)
                    </label>
                    <button
                      type="button"
                      onClick={openManualSmartCalendar}
                      className="w-full bg-[#1C1C1E] border border-white/5 text-left text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 hover:border-white/15 transition-all text-[14px] cursor-pointer flex items-center justify-between active:scale-[0.99]"
                    >
                      <span className={manualForm.tarih ? 'text-white' : 'text-[#666666]'}>
                        {manualForm.tarih ? toDisplayDate(manualForm.tarih) : 'Akıllı takvimi aç'}
                      </span>
                      <CalendarDays className="w-4 h-4 text-[#86868B] shrink-0" />
                    </button>
                    {!manualForm.ilce && (
                      <p className="text-[11px] text-[#86868B] mt-1.5 ml-0.5">
                        İlçe seçildikten sonra takvimde hava ve aynı bölge vurguları aktif olur.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">
                      Başlangıç
                    </label>
                    <div className="relative">
                      <select
                        required
                        value={manualStartHour}
                        onChange={(e) => {
                          setManualStartHour(e.target.value);
                          setManualEndHour('');
                        }}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer"
                      >
                        <option value="">Başlangıç seçin</option>
                        {OFFER_HOUR_OPTIONS.map((hour) => (
                          <option key={hour} value={String(hour)}>
                            {formatOfferHour(hour)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">
                      Bitiş
                    </label>
                    <div className="relative">
                      <select
                        required
                        disabled={!manualStartHour}
                        value={manualEndHour}
                        onChange={(e) => setManualEndHour(e.target.value)}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <option value="">
                          {manualStartHour
                            ? 'Bitiş seçin'
                            : 'Önce başlangıç seçin'}
                        </option>
                        {getOfferEndHours(Number(manualStartHour)).map((hour) => {
                          const blocked =
                            !!manualForm.tarih &&
                            isOfferEndBlockedByConfirmed({
                              appointments: bookedAppointments,
                              date: manualForm.tarih,
                              startHour: Number(manualStartHour),
                              endHour: hour,
                              pilotName:
                                role === 'broker'
                                  ? manualForm.pilot
                                  : lockedPilotForRole(),
                            });
                          return (
                            <option
                              key={hour}
                              value={String(hour)}
                              disabled={blocked}
                            >
                              {formatOfferHour(hour)}
                              {blocked ? ' (dolu)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  </div>
                </div>

                {manualForm.tarih && manualForm.il && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#86868B]">Hava</span>
                    <WeatherBadge
                      il={manualForm.il}
                      ilce={manualForm.ilce}
                      tarih={manualForm.tarih}
                      variant="detail"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">
                    Portföy bilgileri
                  </label>
                  <textarea
                    value={manualForm.portfoyTuru}
                    onChange={(e) => handleManualFormChange('portfoyTuru', e.target.value)}
                    rows={3}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 resize-none text-[14px]"
                    placeholder="Örn. 3+1 satılık daire, site girişi..."
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Açıklama / Not</label>
                  <textarea
                    value={manualForm.aciklama}
                    onChange={(e) => handleManualFormChange('aciklama', e.target.value)}
                    rows={2}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 resize-none text-[14px]"
                    placeholder="Opsiyonel"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Hedef Danışman</label>
                  {consultants.length > 0 ? (
                    <div className="relative">
                      <select
                        required
                        value={manualForm.danismanIsmi}
                        onChange={(e) => handleManualFormChange('danismanIsmi', e.target.value)}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px] cursor-pointer"
                      >
                        <option value="" disabled>Danışman seçin</option>
                        {consultants.map((name) => (
                          <option key={name} value={name}>{toTitleCaseName(name)}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      value={manualForm.danismanIsmi}
                      onChange={(e) => handleManualFormChange('danismanIsmi', e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[14px]"
                      placeholder="Danışman tam adı"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Pilot</label>
                  {role === 'broker' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PILOT_OPTIONS.map((pilot) => (
                        <button
                          key={pilot}
                          type="button"
                          onClick={() => handleManualFormChange('pilot', pilot)}
                          className={`w-full flex items-center p-3.5 rounded-xl text-left cursor-pointer ${manualForm.pilot === pilot ? 'bg-white text-black' : 'bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]'}`}
                        >
                          <span className="text-[13px] font-medium truncate">{toTitleCaseName(pilot)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full bg-[#1C1C1E] border border-white/5 rounded-xl px-4 h-12 flex items-center text-[14px] text-[#86868B]">
                      {manualForm.pilot || lockedPilotForRole()
                        ? toTitleCaseName(manualForm.pilot || lockedPilotForRole())
                        : ''}
                      <span className="ml-auto text-[11px] uppercase tracking-wide">Kilitli</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 sm:px-8 py-5 border-t border-white/5 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={closeManualModal}
                  disabled={isManualSaving}
                  className="flex-1 h-12 rounded-xl bg-[#1C1C1E] text-white text-[14px] font-medium hover:bg-[#2C2C2E] transition-all cursor-pointer active:scale-[0.98] disabled:opacity-40"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isManualSaving}
                  className="flex-1 h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                >
                  {isManualSaving ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Kesinleştir'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Overlays */}
      <div className={`fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-md z-40 lg:hidden transition-opacity duration-300 ease-zebra cursor-pointer ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMobileMenuOpen(false)} />
      <div className={`fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-md z-[60] transition-opacity duration-300 ease-zebra cursor-pointer ${isNotificationOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsNotificationOpen(false)} />

      {/* NOTIFICATION CENTER */}
      <aside className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-[#111111]/95 backdrop-blur-3xl shadow-2xl border-l border-white/5 z-[70] flex flex-col transition-transform duration-500 ease-zebra ${isNotificationOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-20 flex items-center justify-between px-8 border-b border-white/5 shrink-0">
          <h2 className="text-lg font-medium tracking-tight text-white">Bildirimler</h2>
          <button onClick={() => setIsNotificationOpen(false)} className="w-8 h-8 flex items-center justify-center text-[#86868B] hover:text-white bg-[#1C1C1E] rounded-full transition-colors active:scale-95 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {userNotifications.length === 0 ? (
            <div className="text-center py-20 px-4">
              <Bell className="w-10 h-10 text-[#333333] mx-auto mb-4" />
              <p className="text-[15px] font-medium text-[#86868B]">Bildirim Yok</p>
            </div>
          ) : (
            userNotifications.map((notif) => {
              const isFirstShown =
                !notif.is_read || firstShownNotifIds.has(String(notif.id));
              return (
              <button
                key={notif.id}
                type="button"
                onClick={() => handleNotificationClick(notif)}
                className={`w-full text-left border rounded-2xl p-5 transition-all duration-300 cursor-pointer active:scale-[0.99]
                  ${isFirstShown
                    ? 'bg-white text-black border-transparent shadow-lg hover:bg-neutral-100'
                    : 'bg-[#1C1C1E] border-transparent opacity-70 hover:border-white/15 text-white'}`}
              >
                <div className="flex justify-between items-start mb-2 gap-3">
                  <h4 className={`text-[14px] font-medium ${isFirstShown ? 'text-black' : 'text-white'}`}>
                    {notif.title}
                  </h4>
                  <span
                    className={`text-[11px] font-medium shrink-0 ${
                      isFirstShown ? 'text-black/45' : 'text-[#86868B]'
                    }`}
                  >
                    {notif.created_at}
                  </span>
                </div>
                <p
                  className={`text-[13px] leading-relaxed ${
                    isFirstShown ? 'text-black/65' : 'text-[#86868B]'
                  }`}
                >
                  {notif.message}
                </p>
              </button>
              );
            })
          )}
        </div>
      </aside>

      {/* SIDEBAR NAVIGATION */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[272px] bg-[#111111]/55 backdrop-blur-2xl border-r border-white/5 flex flex-col transition-transform duration-500 ease-zebra shrink-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-20 flex items-center px-6 shrink-0">
          <Image
            src="/icon-512x512.png"
            alt="Zebra 360"
            width={32}
            height={32}
            className="w-8 h-8 mr-3 rounded-full object-cover shrink-0"
            priority
          />
          <span className="text-[17px] font-medium tracking-tight text-white">Zebra 360</span>
        </div>

        <SidebarNav
          role={role}
          fullName={fullName}
          activeTab={activeTab}
          badgeCounts={menuBadgeCounts}
          onNavigate={navigateToTab}
        />

        <div className="p-4 shrink-0">
          <div className="flex items-center justify-between bg-[#1C1C1E]/50 rounded-xl p-3 border border-white/5 transition-colors duration-300 ease-zebra hover:bg-[#1C1C1E] cursor-pointer group">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-white/10 text-white rounded-full flex items-center justify-center text-xs font-medium">
                {usesManagerShell(role) ? 'YP' : 'NT'}
              </div>
              <div className="ml-3">
                <p className="text-[13px] font-medium text-white leading-none">{toTitleCaseName(fullName)}</p>
                <p className="text-[11px] text-[#86868B] mt-1">{roleLabel(role)}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-[#86868B] group-hover:text-white transition-colors duration-300 ease-zebra p-2 cursor-pointer active:scale-95" title="Çıkış Yap">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* TOPBAR */}
        <header className="h-20 flex items-center justify-between px-6 md:px-12 lg:px-16 z-10 shrink-0 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-xl w-full">
          <div className="flex items-center flex-1 space-x-6">
            <button className="lg:hidden flex flex-col justify-center items-center w-8 h-8 space-y-[4px] group cursor-pointer active:scale-[0.98] -ml-2" onClick={() => setIsMobileMenuOpen(true)}>
              <span className="w-5 h-[1.5px] bg-[#86868B] group-hover:bg-white transition-colors"></span>
              <span className="w-5 h-[1.5px] bg-[#86868B] group-hover:bg-white transition-colors"></span>
            </button>
            <div className="hidden sm:flex items-center relative w-full max-w-md group">
              <Search className="w-4 h-4 text-[#86868B] absolute left-4 group-focus-within:text-white transition-colors duration-300" />
              <input type="text" placeholder="Arama yapın..." className="w-full bg-[#161616] border border-white/5 focus:border-white/20 text-white placeholder:text-[#86868B] text-[14px] rounded-full pl-11 pr-4 h-10 transition-all duration-300 outline-none" />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {canShowNewCekimBtn && (
              <button
                type="button"
                onClick={openManualModal}
                className="inline-flex items-center gap-2 h-10 px-4 shrink-0 text-[#86868B] hover:text-white bg-[#161616] border border-white/5 rounded-full transition-all duration-300 shadow-sm active:scale-95 cursor-pointer text-[13px] font-medium"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Yeni Çekim Ekle
              </button>
            )}

            <div className="hidden md:block text-right mr-2">
              <p className="text-[13px] font-medium text-white">{todayStr}</p>
            </div>
            
            <button
              type="button"
              onClick={() => setIsNotificationOpen(true)}
              className="relative w-10 h-10 flex items-center justify-center text-[#86868B] hover:text-white bg-[#161616] border border-white/5 rounded-full transition-all duration-300 shadow-sm active:scale-95 cursor-pointer"
              aria-label={unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : 'Bildirimler'}
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#FF3B30] text-white text-[10px] font-semibold tabular-nums flex items-center justify-center border-2 border-[#161616] shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {role === 'danisman' && (
              <button onClick={() => navigateToTab('randevu')} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.15)]">
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        <div
          ref={mainScrollRef}
          data-main-scroll
          className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-4 sm:px-6 md:px-12 lg:px-16 py-6 sm:py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="w-full mx-auto space-y-10 pb-20 max-w-7xl">
            
            {/* --- GENEL BAKIŞ / OVERVIEW --- */}
            {activeTab === 'genel' && (
              <OverviewDashboard
                greeting={greeting}
                fullName={fullName}
                role={role}
                isPilot={isPilot}
                currentUserId={currentUserId}
                appointments={bookedAppointments}
                pendingCount={pendingRequests.length}
                confirmCount={danismanConfirmRequests.length}
                onNavigate={navigateToTab}
                onOpenManual={
                  canCreateManualAppointment(role)
                    ? () => setIsManualModalOpen(true)
                    : undefined
                }
              />
            )}

            {/* Henüz yayında olmayan sayfalar */}
            {!isLiveContentTab(activeTab, role, fullName) && (
              <ComingSoonPlaceholder />
            )}

            {(activeTab === 'users-overview' || activeTab === 'users-add') &&
              isUserAdmin(fullName, role) && (
                <UserManagement
                  mode={activeTab === 'users-add' ? 'add' : 'overview'}
                  onNavigate={navigateToTab}
                />
              )}

            {/* --- ZEBRA STUDIO: Yeni Portföy (sekme değişince state korunur) --- */}
            <div
              aria-hidden={activeTab !== 'studio-yeni-portfoy'}
              className={
                activeTab === 'studio-yeni-portfoy'
                  ? ''
                  : 'fixed left-[-100000px] top-0 w-[1280px] pointer-events-none'
              }
            >
              <ZebraStudio
                userId={currentUserId}
                fallbackName={fullName}
                role={role}
              />
            </div>

            {/* --- ZEBRA STUDIO: Satıldı / Kiralandı --- */}
            <div
              aria-hidden={activeTab !== 'studio-satildi-kiralandi'}
              className={
                activeTab === 'studio-satildi-kiralandi'
                  ? ''
                  : 'fixed left-[-100000px] top-0 w-[1280px] pointer-events-none'
              }
            >
              <SoldRentedStudio
                userId={currentUserId}
                fallbackName={fullName}
                role={role}
                isActive={activeTab === 'studio-satildi-kiralandi'}
              />
            </div>

            {usesManagerShell(role) && (
              <div
                aria-hidden={activeTab !== 'studio-toplu'}
                className={
                  activeTab === 'studio-toplu'
                    ? ''
                    : 'fixed left-[-100000px] top-0 w-[1280px] pointer-events-none'
                }
              >
                <BatchProductionStudio />
              </div>
            )}

            {/* --- TAKVİM: danışman genel takvim --- */}
            {activeTab === 'takvim' && role === 'danisman' && (
              <GlobalCalendar
                appointments={bookedAppointments}
                userKey={currentUserId}
                showTeamAppointments={false}
                fullName={fullName}
                currentUserId={currentUserId}
              />
            )}

            {/* --- TAKVİM: personel çekim takvimi --- */}
            {activeTab === 'takvim' && role !== 'danisman' && (
              <div className="panel-enter space-y-8">
                <div className="mb-10">
                  <h1 className="text-2xl font-medium tracking-tight text-white">
                    Çekim Takvimi
                  </h1>
                  <p className="text-[#86868B] mt-2 text-[14px]">
                    Operasyon takvimini görüntüleyin.
                  </p>
                </div>

                <div className="bg-[#161616] border border-white/5 rounded-2xl p-6 lg:p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-medium text-white">
                      {monthNames[viewMonth]} {viewYear}
                    </h2>
                    <div className="flex space-x-2">
                      <button onClick={handlePrevMonth} className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={handleNextMonth} className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
                    {weekDays.map(day => (
                      <div key={day} className="text-center text-[11px] font-medium text-[#86868B] uppercase tracking-wide py-2">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {Array.from({ length: getFirstDayOfMonth(viewMonth, viewYear) }).map((_, i) => (<div key={`empty-${i}`} className="h-10 sm:h-12"></div>))}
                    
                    {Array.from({ length: getDaysInMonth(viewMonth, viewYear) }).map((_, i) => {
                      const dayNumber = i + 1;
                      const currentDateObj = new Date(viewYear, viewMonth, dayNumber);
                      const dateStr = formatDateStr(currentDateObj);
                      
                      const dayMarker = calendarDayMarkers[dateStr];
                      const hasAppointments = !!(
                        dayMarker?.hasConfirmed ||
                        dayMarker?.hasPending ||
                        dayMarker?.hasCancelled
                      );
                      
                      const isToday = dayNumber === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                      const isSelected = takvimSelectedDate && dayNumber === takvimSelectedDate.getDate() && viewMonth === takvimSelectedDate.getMonth() && viewYear === takvimSelectedDate.getFullYear();

                      return (
                        <button
                          key={dayNumber}
                          onClick={() => setTakvimSelectedDate(currentDateObj)}
                          className={`
                            relative h-10 sm:h-12 w-full rounded-xl flex flex-col items-center justify-center text-[14px] sm:text-[15px] font-medium transition-all duration-300 cursor-pointer active:scale-[0.98]
                            ${!isSelected && !isToday ? 'bg-[#1C1C1E] text-white hover:bg-white/10' : ''}
                            ${isToday && !isSelected ? 'bg-neutral-800/50 text-neutral-400 font-medium ring-1 ring-white/10' : ''}
                            ${isSelected ? 'bg-white text-black font-medium shadow-xl' : ''}
                          `}
                        >
                          <span>{dayNumber}</span>
                          {hasAppointments && (
                            <div className="absolute bottom-1.5 flex items-center gap-0.5">
                              {dayMarker?.hasConfirmed && (
                                <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#34C759]' : 'bg-[#34C759]/90'}`} />
                              )}
                              {dayMarker?.hasPending && (
                                <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#FF9F0A]' : 'bg-[#FF9F0A]/90'}`} />
                              )}
                              {dayMarker?.hasCancelled && (
                                <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#FF453A]' : 'bg-[#FF453A]/90'}`} />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <DayEventsModal
                  open={isCekimDayModalOpen}
                  date={takvimSelectedDate}
                  dateStr={selectedTakvimDateStr}
                  events={cekimTakvimDayEvents}
                  onClose={() => setTakvimSelectedDate(null)}
                  allowNotes={false}
                  eyebrow="Çekim günü"
                  emptyHint="Bu tarihte planlanmış çekim bulunmuyor."
                  onEventClick={
                    isPersonelRole(role)
                      ? undefined
                      : (ev) => {
                          const sourceId =
                            ev.sourceId ||
                            String(ev.id || '').replace(/^randevu-/, '');
                          const app = bookedAppointments.find(
                            (a) => String(a.id) === String(sourceId)
                          );
                          if (!app) return;
                          if (!canEditAppointment(app)) {
                            showToast('Bu randevuyu düzenleme yetkiniz yok.');
                            return;
                          }
                          setTakvimSelectedDate(null);
                          openEditModal(app);
                        }
                  }
                  toolbar={
                    !isPersonelRole(role) ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDayListFilter('all')}
                          className={`min-h-10 px-3.5 sm:px-4 py-2 rounded-xl text-[12px] sm:text-[13px] font-medium transition-all duration-300 ease-zebra cursor-pointer active:scale-[0.98] border ${
                            dayListFilter === 'all'
                              ? 'bg-white text-black border-white shadow-sm'
                              : 'bg-[#1C1C1E] text-[#86868B] border-white/5 hover:text-white hover:border-white/10'
                          }`}
                        >
                          Tümü
                        </button>
                        <button
                          type="button"
                          onClick={() => setDayListFilter('confirmed')}
                          className={`min-h-10 px-3.5 sm:px-4 py-2 rounded-xl text-[12px] sm:text-[13px] font-medium transition-all duration-300 ease-zebra cursor-pointer active:scale-[0.98] border ${
                            dayListFilter === 'confirmed'
                              ? 'bg-white text-black border-white shadow-sm'
                              : 'bg-[#1C1C1E] text-[#86868B] border-white/5 hover:text-white hover:border-white/10'
                          }`}
                        >
                          Kesinleşmiş
                        </button>
                      </div>
                    ) : null
                  }
                />
              </div>
            )}

            {/* BROKER: Çekim Raporu (SPA tab — anında geçiş) */}
            {role === 'broker' && activeTab === 'cekim-raporu' && (
              <CekimRaporuPanel appointments={bookedAppointments} />
            )}

            {/* MANAGER: PENDING REQUESTS */}
            {canApproveAppointments(role) && activeTab === 'cekim' && (
              <div className="panel-enter w-full">
                <div className="mb-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-medium tracking-tight text-white">Randevu Talepleri</h1>
                    <p className="text-[#86868B] mt-2 text-[15px]">İlçeye göre gruplanmış taleplere tarih/saat teklif edin.</p>
                  </div>
                  {canCreateManualAppointment(role) && (
                    <button
                      type="button"
                      onClick={openManualModal}
                      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.12)] shrink-0 self-start"
                    >
                      <Plus className="w-4 h-4" strokeWidth={2.5} />
                      Yeni Çekim Ekle
                    </button>
                  )}
                </div>
                
                <p className="text-[#86868B] text-[14px] mb-6">Talepler ilçeye göre gruplanır. Tarih/saat teklif ederek danışmana gönderin.</p>

                {appointmentWorkflowRequests.length === 0 ? (
                  <div className="bg-[#111111] border border-white/5 rounded-2xl p-20 flex flex-col items-center justify-center text-center w-full">
                    <div className="w-16 h-16 bg-[#1C1C1E] rounded-full flex items-center justify-center mb-6">
                      <Inbox className="w-6 h-6 text-[#86868B]" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Her Şey Tamam</h3>
                    <p className="text-[#86868B] text-[14px]">Şu an bekleyen güncel talep bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-8 w-full">
                    {Object.entries(pendingByIlce).map(([ilce, reqs]) => (
                      <div key={ilce} className="space-y-4">
                        <h2 className="text-[15px] font-medium text-white flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#86868B]" />
                          {ilce}
                          <span className="text-[12px] text-[#86868B] font-normal">({reqs.length})</span>
                        </h2>
                        {reqs.map((req) => {
                          const requestStatus = normalizeAppointmentStatus(
                            req.status
                          );
                          const waitingForConsultant =
                            requestStatus === 'danisman_onayi_bekliyor';
                          const districtConfirmed = bookedAppointments.filter(
                            (a) =>
                              isConfirmedStatus(a.status) &&
                              a.ilce === req.ilce &&
                              a.il === req.il
                          );
                          const canAct =
                            role === 'broker' || pilotOwnsAppointment(req);
                          return (
                            <div key={req.id} className="bg-[#161616] border border-white/5 rounded-2xl p-6 sm:p-8 flex flex-col shadow-sm w-full">
                              <div className="flex justify-between items-start mb-4 gap-3">
                                <div>
                                  <h3 className="text-[17px] font-medium text-white">{toTitleCaseName(req.danismanIsmi)}</h3>
                                  <p className="text-[12px] text-[#86868B] mt-1 font-medium">
                                    {req.il} / {req.ilce}{req.semt ? ` / ${req.semt}` : ''}
                                  </p>
                                </div>
                                {getStatusBadge(req.status)}
                              </div>
                              <div className="mb-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                                {[
                                  {
                                    label: 'Talep',
                                    active: true,
                                    complete: waitingForConsultant,
                                  },
                                  {
                                    label: 'Teklif',
                                    active: waitingForConsultant,
                                    complete: false,
                                  },
                                  {
                                    label: 'Onay',
                                    active: false,
                                    complete: false,
                                  },
                                ].map((step, index) => (
                                  <React.Fragment key={step.label}>
                                    <div className="min-w-0 text-center">
                                      <div
                                        className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                                          step.complete
                                            ? 'border-[#34C759]/30 bg-[#34C759]/15 text-[#34C759]'
                                            : step.active
                                              ? 'border-[#E5B540]/35 bg-[#E5B540]/15 text-[#E5B540]'
                                              : 'border-white/10 bg-[#1C1C1E] text-[#636366]'
                                        }`}
                                      >
                                        {step.complete ? '✓' : index + 1}
                                      </div>
                                      <span
                                        className={`text-[11px] ${
                                          step.active || step.complete
                                            ? 'text-white'
                                            : 'text-[#636366]'
                                        }`}
                                      >
                                        {step.label}
                                      </span>
                                    </div>
                                    {index < 2 ? (
                                      <div
                                        className={`h-px w-full ${
                                          index === 0 && waitingForConsultant
                                            ? 'bg-[#34C759]/40'
                                            : 'bg-white/10'
                                        }`}
                                      />
                                    ) : null}
                                  </React.Fragment>
                                ))}
                              </div>
                              <div className="space-y-3 mb-4">
                                {waitingForConsultant && (
                                  <div className="rounded-xl border border-[#E5B540]/20 bg-[#E5B540]/10 p-4">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#E5B540]">
                                      Danışman onayı bekleniyor
                                    </p>
                                    <p className="mt-2 text-[17px] font-medium text-white">
                                      {req.tarih || '—'}
                                      {formatWeekdayTr(req.tarih) ? (
                                        <span className="text-white/80">
                                          {' '}· {formatWeekdayTr(req.tarih)}
                                        </span>
                                      ) : null}
                                    </p>
                                    <p className="mt-1 text-[20px] font-semibold tabular-nums text-white">
                                      {req.saatBlok || '—'}
                                    </p>
                                  </div>
                                )}
                                {req.portfoyTuru && (
                                  <div className="flex items-start text-[13px] bg-[#1C1C1E] p-4 rounded-xl border border-white/5">
                                    <Building2 className="w-4 h-4 text-[#666666] mr-4 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-1">Portföy bilgileri</p>
                                      <p className="text-white leading-relaxed break-words">{req.portfoyTuru}</p>
                                    </div>
                                  </div>
                                )}
                                {(req.danismanNotu || req.aciklama) && (
                                  <div className="flex items-start text-[13px] bg-[#1C1C1E] p-4 rounded-xl border border-white/5">
                                    <AlignLeft className="w-4 h-4 text-[#666666] mr-4 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-1">Danışman notu</p>
                                      <p className="text-[#86868B] leading-relaxed break-words">{req.danismanNotu || req.aciklama}</p>
                                    </div>
                                  </div>
                                )}
                                {districtConfirmed.length > 0 && (
                                  <div className="text-[12px] text-[#86868B] bg-[#1C1C1E]/60 border border-white/5 rounded-xl p-3">
                                    Bu ilçede {districtConfirmed.length} kesinleşmiş çekim randevusu var
                                    {districtConfirmed.slice(0, 3).map((a) => (
                                      <span key={a.id} className="block mt-1 text-white/80">
                                        • {a.tarih || '—'} {a.saatBlok || ''} — {toTitleCaseName(a.danismanIsmi) || 'Danışman yok'}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {waitingForConsultant ? (
                                <div className="mt-auto flex items-center gap-2 rounded-xl border border-white/5 bg-[#1C1C1E]/70 px-4 py-3 text-[13px] text-[#AEAEB2]">
                                  <Clock className="h-4 w-4 shrink-0 text-[#E5B540]" />
                                  Teklif gönderildi; danışmanın onayı bekleniyor.
                                </div>
                              ) : rejectingId === req.id ? (
                                <div className="animate-in fade-in duration-300">
                                  <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reddetme sebebi..." className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-24 resize-none focus:outline-none focus:border-white/20 text-[14px] mb-4" />
                                  <div className="flex space-x-3">
                                    <button type="button" onClick={() => { setRejectingId(null); setRejectReason(''); }} className="flex-1 py-3 bg-[#1C1C1E] text-white rounded-xl text-[14px] font-medium cursor-pointer">Vazgeç</button>
                                    <button type="button" disabled={processingId === req.id || !rejectReason.trim()} onClick={() => handleRejectSubmit(req)} className="flex-1 py-3 bg-[#1C1C1E] text-[#FF3B30] border border-[#FF3B30]/20 rounded-xl text-[14px] font-medium disabled:opacity-50 cursor-pointer flex items-center justify-center">
                                      {processingId === req.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Reddet'}
                                    </button>
                                  </div>
                                </div>
                              ) : offeringId === req.id ? (
                                <div className="hidden">
                                  <p className="text-[12px] font-medium text-[#86868B]">TARİH VE SAAT ARALIĞI TEKLİF ET</p>
                                  <div>
                                    <label className="block text-[12px] text-[#86868B] mb-2">Tarih</label>
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={openOfferCalendar}
                                        className="w-full bg-[#1C1C1E] border border-white/5 text-left text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 hover:border-white/15 transition-all text-[14px] cursor-pointer flex items-center justify-between active:scale-[0.99]"
                                      >
                                        <span className={offerTarih ? 'text-white' : 'text-[#666666]'}>
                                          {offerTarih ? toDisplayDate(offerTarih) : 'Tarih seçin'}
                                        </span>
                                        <CalendarDays className="w-4 h-4 text-[#86868B] shrink-0" />
                                      </button>
                                      <SmartSchedulingAssistant
                                        open={isOfferCalendarOpen}
                                        onClose={closeOfferFlow}
                                        targetIl={offeringRequest?.il || req.il}
                                        targetIlce={offeringRequest?.ilce || req.ilce}
                                        pilotName={offeringRequest?.pilot || req.pilot || (isPilot ? fullName : null)}
                                        appointments={bookedAppointments}
                                        selectedIso={offerTarih}
                                        onSelectDate={handleOfferCalendarSelectIso}
                                        month={offerCalMonth}
                                        year={offerCalYear}
                                        onPrevMonth={handleOfferCalPrevMonth}
                                        onNextMonth={handleOfferCalNextMonth}
                                        footerContent={
                                          <div className="space-y-2.5">
                                            <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-2 sm:gap-3 items-end">
                                              <label className="min-w-0">
                                                <span className="block text-[10px] sm:text-[11px] text-[#86868B] mb-1.5">
                                                  Başlangıç
                                                </span>
                                                <select
                                                  value={offerStartHour}
                                                  onChange={(e) => {
                                                    setOfferStartHour(e.target.value);
                                                    setOfferEndHour('');
                                                  }}
                                                  className="w-full min-w-0 appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-3 h-11 text-[13px] cursor-pointer"
                                                >
                                                  <option value="">Seçin</option>
                                                  {OFFER_HOUR_OPTIONS.filter(
                                                    (h) =>
                                                      getOfferEndHours(h).length >
                                                      0
                                                  ).map((h) => {
                                                    const blocked =
                                                      !!offerTarih &&
                                                        isOfferStartBlockedByConfirmed({
                                                          appointments:
                                                            bookedAppointments,
                                                          date: offerTarih,
                                                          startHour: h,
                                                          pilotName:
                                                            req.pilot ||
                                                            offerPilotName,
                                                          excludeId: req.id,
                                                        });
                                                    return (
                                                      <option
                                                        key={h}
                                                        value={String(h)}
                                                        disabled={blocked}
                                                      >
                                                        {formatOfferHour(h)}
                                                        {blocked ? ' (dolu)' : ''}
                                                      </option>
                                                    );
                                                  })}
                                                </select>
                                              </label>
                                              <label className="min-w-0">
                                                <span className="block text-[10px] sm:text-[11px] text-[#86868B] mb-1.5">
                                                  Bitiş
                                                </span>
                                                <select
                                                  value={offerEndHour}
                                                  disabled={!offerStartHour}
                                                  onChange={(e) => {
                                                    const nextEnd = e.target.value;
                                                    if (
                                                      offerTarih &&
                                                      nextEnd &&
                                                      isOfferEndBlockedByConfirmed({
                                                        appointments: bookedAppointments,
                                                        date: offerTarih,
                                                        startHour: Number(offerStartHour),
                                                        endHour: Number(nextEnd),
                                                        pilotName:
                                                          req.pilot || offerPilotName,
                                                        excludeId: req.id,
                                                      })
                                                    ) {
                                                      showToast(
                                                        'Bu saat aralığı kesinleşmiş bir çekimle çakışıyor; seçilemez.'
                                                      );
                                                      return;
                                                    }
                                                    setOfferEndHour(nextEnd);
                                                  }}
                                                  className="w-full min-w-0 appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-3 h-11 text-[13px] cursor-pointer disabled:opacity-40"
                                                >
                                                  <option value="">
                                                    {offerStartHour
                                                      ? 'Seçin'
                                                      : 'Önce başlangıç'}
                                                  </option>
                                                  {getOfferEndHours(
                                                    Number(offerStartHour)
                                                  ).map((h) => {
                                                    const blocked =
                                                      !!offerTarih &&
                                                      isOfferEndBlockedByConfirmed({
                                                        appointments:
                                                          bookedAppointments,
                                                        date: offerTarih,
                                                        startHour:
                                                          Number(offerStartHour),
                                                        endHour: h,
                                                        pilotName:
                                                          req.pilot ||
                                                          offerPilotName,
                                                        excludeId: req.id,
                                                      });
                                                    return (
                                                      <option
                                                        key={h}
                                                        value={String(h)}
                                                        disabled={blocked}
                                                      >
                                                        {formatOfferHour(h)}
                                                        {blocked ? ' (dolu)' : ''}
                                                      </option>
                                                    );
                                                  })}
                                                </select>
                                              </label>
                                              <button
                                                type="button"
                                                onClick={closeOfferFlow}
                                                disabled={!!processingId}
                                                className="h-11 rounded-xl bg-[#1C1C1E] px-4 text-[13px] text-white cursor-pointer disabled:opacity-40"
                                              >
                                                Vazgeç
                                              </button>
                                              <button
                                                type="button"
                                                disabled={
                                                  processingId === req.id ||
                                                  !offerTarih ||
                                                  !offerStartHour ||
                                                  !offerEndHour ||
                                                  offerRangeConflicts.confirmed
                                                    .length > 0
                                                }
                                                onClick={() =>
                                                  handlePilotOffer(req)
                                                }
                                                className="h-11 rounded-xl bg-white px-4 text-[13px] font-medium text-black cursor-pointer disabled:opacity-40 flex items-center justify-center whitespace-nowrap"
                                              >
                                                {processingId === req.id ? (
                                                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                  'Teklifi Gönder'
                                                )}
                                              </button>
                                            </div>
                                            {!offerTarih && (
                                              <p className="text-[10px] sm:text-[11px] text-[#E5B540]">
                                                Önce takvimden bir tarih seçin.
                                              </p>
                                            )}
                                            {offerRangeConflicts.confirmed.length >
                                              0 && (
                                              <p className="text-[10px] sm:text-[11px] text-[#FF453A]">
                                                Bu saat aralığı kesinleşmiş bir
                                                çekimle çakışıyor.
                                              </p>
                                            )}
                                          </div>
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative">
                                      <label className="block text-[12px] text-[#86868B] mb-2">Başlangıç</label>
                                      <select
                                        value={offerStartHour}
                                        onChange={(e) => {
                                          setOfferStartHour(e.target.value);
                                          setOfferEndHour('');
                                        }}
                                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                                      >
                                        <option value="">Başlangıç seçin</option>
                                        {OFFER_HOUR_OPTIONS.map((h) => (
                                          <option key={h} value={String(h)}>{formatOfferHour(h)}</option>
                                        ))}
                                      </select>
                                      <ChevronDown className="absolute right-4 top-[42px] w-4 h-4 text-[#86868B] pointer-events-none" />
                                    </div>
                                    <div className="relative">
                                      <label className="block text-[12px] text-[#86868B] mb-2">Bitiş</label>
                                      <select
                                        value={offerEndHour}
                                        onChange={(e) => {
                                          const nextEnd = e.target.value;
                                          if (
                                            offerTarih &&
                                            offerStartHour &&
                                            nextEnd &&
                                            isOfferEndBlockedByConfirmed({
                                              appointments: bookedAppointments,
                                              date: offerTarih,
                                              startHour: Number(offerStartHour),
                                              endHour: Number(nextEnd),
                                              pilotName: req.pilot || offerPilotName,
                                              excludeId: req.id,
                                            })
                                          ) {
                                            showToast('Bu saat aralığı kesinleşmiş bir çekimle çakışıyor; seçilemez.');
                                            return;
                                          }
                                          setOfferEndHour(nextEnd);
                                        }}
                                        disabled={!offerStartHour}
                                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        <option value="">
                                          {offerStartHour ? 'Bitiş seçin' : 'Önce başlangıç seçin'}
                                        </option>
                                        {getOfferEndHours(Number(offerStartHour)).map((h) => {
                                          const blocked =
                                            !!offerTarih &&
                                            isOfferEndBlockedByConfirmed({
                                              appointments: bookedAppointments,
                                              date: offerTarih,
                                              startHour: Number(offerStartHour),
                                              endHour: h,
                                              pilotName: req.pilot || offerPilotName,
                                              excludeId: req.id,
                                            });
                                          return (
                                            <option key={h} value={String(h)} disabled={blocked}>
                                              {formatOfferHour(h)}{blocked ? ' (dolu)' : ''}
                                            </option>
                                          );
                                        })}
                                      </select>
                                      <ChevronDown className="absolute right-4 top-[42px] w-4 h-4 text-[#86868B] pointer-events-none" />
                                    </div>
                                  </div>
                                  {offerRangeConflicts.confirmed.length > 0 && (
                                    <div className="rounded-xl border border-[#FF3B30]/25 bg-[#FF3B30]/10 px-4 py-3 text-[12px] text-[#FF3B30]">
                                      Bu saat aralığı kesinleşmiş çekimle çakışıyor; seçilemez.
                                    </div>
                                  )}
                                  {offerRangeConflicts.pending.length > 0 && (
                                    <div className="rounded-xl border border-[#E5B540]/25 bg-[#E5B540]/10 px-4 py-3 space-y-1.5">
                                      <p className="text-[12px] font-medium text-[#E5B540]">Bu aralıkta onay bekleniyor</p>
                                      {offerRangeConflicts.pending.map((app) => (
                                        <p key={app.id} className="text-[12px] text-[#AEAEB2] leading-relaxed">
                                          {toTitleCaseName(app.danismanIsmi)}
                                          {app.saatBlok ? ` · ${app.saatBlok}` : ''}
                                          {app.ilce ? ` · ${app.ilce}` : ''}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {offerTarih && (req.il || offeringRequest?.il) && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-[#86868B]">Hava</span>
                                      <WeatherBadge
                                        il={offeringRequest?.il || req.il}
                                        ilce={offeringRequest?.ilce || req.ilce}
                                        tarih={offerTarih}
                                        variant="detail"
                                      />
                                    </div>
                                  )}
                                  <div className="flex gap-3">
                                    <button type="button" onClick={() => { setOfferingId(null); setOfferTarih(''); setOfferStartHour(''); setOfferEndHour(''); setIsOfferCalendarOpen(false); }} className="flex-1 py-3 bg-[#1C1C1E] rounded-xl text-[14px] cursor-pointer">Vazgeç</button>
                                    <button type="button" disabled={processingId === req.id || !offerTarih || !offerStartHour || !offerEndHour || offerRangeConflicts.confirmed.length > 0} onClick={() => handlePilotOffer(req)} className="flex-1 py-3 bg-white text-black rounded-xl text-[14px] font-medium disabled:opacity-50 cursor-pointer flex items-center justify-center">
                                      {processingId === req.id ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : 'Teklifi Gönder'}
                                    </button>
                                  </div>
                                </div>
                              ) : canAct ? (
                                <div className="flex space-x-3 mt-auto">
                                  <button type="button" onClick={() => setRejectingId(req.id)} className="flex-1 py-3 bg-[#1C1C1E] text-[#EDEDED] rounded-xl text-[14px] font-medium hover:bg-[#2C2C2E] cursor-pointer">Reddet</button>
                                  <button type="button" onClick={() => handleApprove(req)} className="flex-1 py-3 bg-white text-black rounded-xl text-[14px] font-medium hover:bg-gray-200 cursor-pointer">
                                    Tarih Teklif Et
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-auto pt-4 text-[13px] font-medium text-[#E5B540] flex items-center">
                                  <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                                  Sadece atanmış medya sorumlusu (pilot) bu talebi işleyebilir.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* ARCHIVE COMPONENT FOR MANAGER */}
                <div className="pt-16 mt-8 border-t border-white/5">
                  <h2 className="text-2xl font-medium tracking-tight text-white mb-8 flex items-center">
                    <History className="w-5 h-5 mr-3 text-white/70" /> Geçmiş Randevu Talepleri / Arşiv
                  </h2>
                  <div className="space-y-4 w-full">
                    {archiveAppointments.length === 0 ? (
                      <p className="text-[#86868B] text-[15px]">Geçmiş işlem bulunmuyor.</p>
                    ) : (
                      archiveAppointments.map(app => renderAppointmentRow(app))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CONSULTANT: RANDEVULARIM */}
            {role === 'danisman' && activeTab === 'randevularim' && (
              <div className="panel-enter w-full">
                <div className="mb-8">
                  <h1 className="text-3xl font-medium tracking-tight text-white">Randevularım</h1>
                  <p className="text-[#86868B] mt-2 text-[15px]">
                    Kesinleşen, onay bekleyen ve teklif sürecindeki tüm randevularınız.
                  </p>
                </div>

                <div className="mb-8 max-w-sm">
                  <div className="relative">
                    <select
                      value={randevularimFilter}
                      onChange={(e) => setRandevularimFilter(e.target.value)}
                      className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                    >
                      {RANDEVULARIM_FILTERS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                  </div>
                </div>

                {danismanRandevularim.length === 0 ? (
                  <div className="bg-[#111111] border border-white/5 rounded-2xl p-16 sm:p-20 flex flex-col items-center justify-center text-center w-full">
                    <div className="w-16 h-16 bg-[#1C1C1E] rounded-full flex items-center justify-center mb-6">
                      <Inbox className="w-6 h-6 text-[#86868B]" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Kayıt yok</h3>
                    <p className="text-[#86868B] text-[14px] max-w-sm">
                      {randevularimFilter === 'kesinlesti'
                        ? 'Henüz kesinleşmiş randevunuz bulunmuyor.'
                        : randevularimFilter === 'all'
                          ? 'Henüz randevu kaydınız yok.'
                          : 'Bu filtrede görüntülenecek randevu yok.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-4 w-full">
                    {danismanRandevularim.map((app) => {
                      const needsConfirm =
                        normalizeAppointmentStatus(app.status) ===
                        'danisman_onayi_bekliyor';
                      if (!needsConfirm) return renderAppointmentRow(app);

                      return (
                        <div
                          key={app.id}
                          className="bg-[#161616]/90 backdrop-blur-xl border border-[#E5B540]/20 rounded-2xl p-6 sm:p-8 space-y-4"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-[17px] font-medium text-white">
                                {app.il} / {app.ilce}
                                {app.semt ? ` / ${app.semt}` : ''}
                              </p>
                              <div className="mt-3 rounded-xl border border-white/10 bg-[#1C1C1E]/80 px-4 py-3.5 space-y-1">
                                <p className="text-[15px] sm:text-[16px] font-medium text-white tracking-tight">
                                  {app.tarih || '—'}
                                  {formatWeekdayTr(app.tarih) ? (
                                    <span className="text-white/90"> · {formatWeekdayTr(app.tarih)}</span>
                                  ) : null}
                                </p>
                                <p className="text-[20px] sm:text-[22px] font-semibold text-white tracking-tight tabular-nums">
                                  {app.saatBlok || '—'}
                                </p>
                                <div className="pt-1 flex flex-wrap items-center gap-2">
                                  <span className="text-[12px] text-[#86868B]">
                                    Pilot: {toTitleCaseName(app.pilot)}
                                  </span>
                                  {app.tarih && app.il && (
                                    <WeatherBadge
                                      il={app.il}
                                      ilce={app.ilce}
                                      tarih={app.tarih}
                                      variant="compact"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                            {getStatusBadge(app.status)}
                          </div>
                          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                            {['Talep', 'Teklif', 'Onay'].map((label, index) => (
                              <React.Fragment key={label}>
                                <div className="min-w-0 text-center">
                                  <div
                                    className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                                      index < 2
                                        ? 'border-[#34C759]/30 bg-[#34C759]/15 text-[#34C759]'
                                        : 'border-[#E5B540]/35 bg-[#E5B540]/15 text-[#E5B540]'
                                    }`}
                                  >
                                    {index < 2 ? '✓' : '3'}
                                  </div>
                                  <span className="text-[11px] text-white">
                                    {label}
                                  </span>
                                </div>
                                {index < 2 ? (
                                  <div className="h-px w-full bg-[#34C759]/40" />
                                ) : null}
                              </React.Fragment>
                            ))}
                          </div>
                          {(app.danismanNotu || app.aciklama) && (
                            <p className="text-[13px] text-[#86868B] bg-[#1C1C1E] p-4 rounded-xl border border-white/5">
                              {app.danismanNotu || app.aciklama}
                            </p>
                          )}
                          {rejectingId === app.id ? (
                            <div className="space-y-3">
                              <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reddetme sebebi..."
                                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-24 resize-none focus:outline-none focus:border-white/20 text-[14px]"
                              />
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason('');
                                  }}
                                  className="flex-1 py-3 bg-[#1C1C1E] rounded-xl text-[14px] cursor-pointer transition-all duration-300 ease-zebra"
                                >
                                  Vazgeç
                                </button>
                                <button
                                  type="button"
                                  disabled={!rejectReason.trim() || processingId === app.id}
                                  onClick={() => handleRejectSubmit(app)}
                                  className="flex-1 py-3 bg-[#1C1C1E] text-[#FF3B30] border border-[#FF3B30]/20 rounded-xl text-[14px] cursor-pointer disabled:opacity-50 transition-all duration-300 ease-zebra"
                                >
                                  İptal Et
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => setRejectingId(app.id)}
                                className="flex-1 py-3 bg-[#1C1C1E] text-[#EDEDED] rounded-xl text-[14px] font-medium hover:bg-[#2C2C2E] transition-all duration-300 ease-zebra cursor-pointer"
                              >
                                Reddet
                              </button>
                              <button
                                type="button"
                                disabled={processingId === app.id}
                                onClick={() => handleDanismanConfirm(app)}
                                className="flex-1 py-3 bg-white text-black rounded-xl text-[14px] font-medium hover:bg-gray-200 transition-all duration-300 ease-zebra cursor-pointer flex items-center justify-center"
                              >
                                {processingId === app.id ? (
                                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  'Kesinleştir'
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* CONSULTANT: REQUEST FORM */}
            {role === 'danisman' && activeTab === 'randevu' && (
              <div className="panel-enter w-full">
                <div className="mb-10">
                  <h1 className="text-3xl font-medium tracking-tight text-white">Randevu Talebi</h1>
                  <p className="text-[#86868B] mt-2 text-[15px]">Bölge ve pilot seçin — tarih/saat pilot tarafından teklif edilecek.</p>
                </div>

                {danismanConfirmRequests.length > 0 && (
                  <section className="mb-10 space-y-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5B540]/25 bg-[#E5B540]/10">
                        <CheckCheck className="w-4 h-4 text-[#E5B540]" strokeWidth={2} />
                      </div>
                      <div>
                        <h2 className="text-[17px] font-medium tracking-tight text-white">
                          Kesinleştirmenizi bekleyenler
                        </h2>
                        <p className="text-[13px] text-[#86868B] mt-0.5">
                          {danismanConfirmRequests.length} teklif onayınızı bekliyor
                        </p>
                      </div>
                    </div>

                    {danismanConfirmRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-[#161616]/90 backdrop-blur-xl border border-[#E5B540]/20 rounded-2xl p-6 sm:p-8 space-y-4"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-[17px] font-medium text-white">
                              {req.il} / {req.ilce}{req.semt ? ` / ${req.semt}` : ''}
                            </p>
                            <div className="mt-3 rounded-xl border border-white/10 bg-[#1C1C1E]/80 px-4 py-3.5 space-y-1">
                              <p className="text-[15px] sm:text-[16px] font-medium text-white tracking-tight">
                                {req.tarih || '—'}
                                {formatWeekdayTr(req.tarih) ? (
                                  <span className="text-white/90"> · {formatWeekdayTr(req.tarih)}</span>
                                ) : null}
                              </p>
                              <p className="text-[20px] sm:text-[22px] font-semibold text-white tracking-tight tabular-nums">
                                {req.saatBlok || '—'}
                              </p>
                              <div className="pt-1 flex flex-wrap items-center gap-2">
                                <span className="text-[12px] text-[#86868B]">
                                  Pilot: {toTitleCaseName(req.pilot)}
                                </span>
                                {req.tarih && req.il && (
                                  <WeatherBadge
                                    il={req.il}
                                    ilce={req.ilce}
                                    tarih={req.tarih}
                                    variant="compact"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                          {['Talep', 'Teklif', 'Onay'].map((label, index) => (
                            <React.Fragment key={label}>
                              <div className="min-w-0 text-center">
                                <div
                                  className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                                    index < 2
                                      ? 'border-[#34C759]/30 bg-[#34C759]/15 text-[#34C759]'
                                      : 'border-[#E5B540]/35 bg-[#E5B540]/15 text-[#E5B540]'
                                  }`}
                                >
                                  {index < 2 ? '✓' : '3'}
                                </div>
                                <span className="text-[11px] text-white">
                                  {label}
                                </span>
                              </div>
                              {index < 2 ? (
                                <div className="h-px w-full bg-[#34C759]/40" />
                              ) : null}
                            </React.Fragment>
                          ))}
                        </div>
                        {(req.danismanNotu || req.aciklama) && (
                          <p className="text-[13px] text-[#86868B] bg-[#1C1C1E] p-4 rounded-xl border border-white/5">
                            {req.danismanNotu || req.aciklama}
                          </p>
                        )}
                        {rejectingId === req.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reddetme sebebi..."
                              className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-24 resize-none focus:outline-none focus:border-white/20 text-[14px]"
                            />
                            <div className="flex gap-3">
                              <button type="button" onClick={() => { setRejectingId(null); setRejectReason(''); }} className="flex-1 py-3 bg-[#1C1C1E] rounded-xl text-[14px] cursor-pointer transition-all duration-300 ease-zebra">Vazgeç</button>
                              <button type="button" disabled={!rejectReason.trim() || processingId === req.id} onClick={() => handleRejectSubmit(req)} className="flex-1 py-3 bg-[#1C1C1E] text-[#FF3B30] border border-[#FF3B30]/20 rounded-xl text-[14px] cursor-pointer disabled:opacity-50 transition-all duration-300 ease-zebra">İptal Et</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setRejectingId(req.id)}
                              className="flex-1 py-3 bg-[#1C1C1E] text-[#EDEDED] rounded-xl text-[14px] font-medium hover:bg-[#2C2C2E] transition-all duration-300 ease-zebra cursor-pointer"
                            >
                              Reddet
                            </button>
                            <button
                              type="button"
                              disabled={processingId === req.id}
                              onClick={() => handleDanismanConfirm(req)}
                              className="flex-1 py-3 bg-white text-black rounded-xl text-[14px] font-medium hover:bg-gray-200 transition-all duration-300 ease-zebra cursor-pointer flex items-center justify-center"
                            >
                              {processingId === req.id ? (
                                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                              ) : (
                                'Kesinleştir'
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                <div className="bg-[#161616] border border-white/5 rounded-2xl p-6 lg:p-8 w-full mb-8">
                  <h3 className="text-[12px] font-medium text-[#86868B] mb-6">KONUM VE DETAYLAR</h3>
                  <form onSubmit={handleSubmit} className="space-y-6 w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">İl</label>
                        <div className="relative">
                          <select
                            value={requestIl}
                            onChange={(e) => {
                              setRequestIl(e.target.value);
                              setRequestIlce('');
                            }}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                          >
                            {TURKEY_ILLER.map((il) => (
                              <option key={il} value={il}>{il}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">İlçe</label>
                        <div className="relative">
                          <select
                            value={requestIlce}
                            onChange={(e) => setRequestIlce(e.target.value)}
                            className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px] cursor-pointer"
                          >
                            <option value="">İlçe seçin</option>
                            {requestIlceler.map((ilce) => (
                              <option key={ilce} value={ilce}>{ilce}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                        </div>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-1">
                        <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">Semt (opsiyonel)</label>
                        <input
                          type="text"
                          value={requestSemt}
                          onChange={(e) => setRequestSemt(e.target.value)}
                          placeholder="Örn. Alsancak"
                          className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 text-[14px]"
                        />
                      </div>
                    </div>

                    {regionActivity && (
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                          <p className="text-[12px] font-medium text-[#86868B]">
                            {requestIl} / {requestIlce} — bölgedeki çekimler
                          </p>
                          <p className="text-[11px] text-[#636366]">
                            {regionActivity.length === 0
                              ? 'Aktif kayıt yok'
                              : `${regionActivity.length} kayıt`}
                          </p>
                        </div>

                        {regionActivity.length === 0 ? (
                          <p className="text-[14px] text-[#86868B] bg-[#1C1C1E]/60 border border-white/5 rounded-xl px-4 py-3">
                            Bu bölgede teklif veya kesinleşmiş çekim bulunmuyor.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {regionActivity.map((app) => (
                              <div
                                key={app.id}
                                className="flex flex-col gap-3 bg-[#1C1C1E] border border-white/5 rounded-2xl p-4 sm:p-5"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <p className="text-[15px] font-medium text-white leading-snug">
                                      {app.tarih || 'Tarih bekleniyor'}
                                      {app.saatBlok ? (
                                        <span className="text-white/90"> · {app.saatBlok}</span>
                                      ) : (
                                        <span className="text-[#86868B] font-normal text-[13px]"> · Saat yok</span>
                                      )}
                                    </p>
                                    {app.semt ? (
                                      <p className="text-[12px] text-[#86868B] truncate">{app.semt}</p>
                                    ) : null}
                                    <p className="text-[12px] text-[#86868B] truncate">
                                      {toTitleCaseName(app.danismanIsmi)}
                                      {app.pilot ? ` · Pilot: ${toTitleCaseName(app.pilot)}` : ''}
                                    </p>
                                  </div>
                                  {getStatusBadge(app.status)}
                                </div>
                                {app.tarih && app.il && (
                                  <div className="flex items-center gap-2 pt-0.5 border-t border-white/[0.05]">
                                    <span className="text-[11px] text-[#636366]">Hava</span>
                                    <WeatherBadge
                                      il={app.il}
                                      ilce={app.ilce}
                                      tarih={app.tarih}
                                      variant="detail"
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">
                        Portföy bilgileri <span className="text-[#E5B540]">*</span>
                      </label>
                      <textarea
                        required
                        value={portfolioType}
                        onChange={(e) => setPortfolioType(e.target.value)}
                        placeholder="Örn. 3+1 satılık daire, deniz manzaralı, kapı kodu / site girişi..."
                        className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-28 resize-none focus:outline-none focus:border-white/20 text-[14px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">Danışman Notu</label>
                      <textarea
                        value={danismanNotu}
                        onChange={(e) => setDanismanNotu(e.target.value)}
                        placeholder="Çekim notları, erişim bilgisi (opsiyonel)..."
                        className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-28 resize-none focus:outline-none focus:border-white/20 text-[14px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#86868B] mb-3 ml-1">Drone Pilotu</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {['FATİMA BAYRAMOVA', 'MEHMET SELİM İDİZ'].map((pilot) => (
                          <button
                            key={pilot}
                            type="button"
                            onClick={() => setSelectedPilot(pilot)}
                            className={`w-full flex items-center p-4 rounded-xl transition-all duration-300 text-left cursor-pointer active:scale-[0.98]
                              ${selectedPilot === pilot ? 'bg-white shadow-lg' : 'bg-[#1C1C1E] hover:bg-[#2C2C2E]'}`}
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 shrink-0 ${selectedPilot === pilot ? 'bg-[#F2F2F7]' : 'bg-[#2C2C2E]'}`}>
                              <User className={`w-4 h-4 ${selectedPilot === pilot ? 'text-black' : 'text-white'}`} />
                            </div>
                            <p className={`text-[14px] font-medium ${selectedPilot === pilot ? 'text-black' : 'text-white'}`}>{toTitleCaseName(pilot)}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!isFormValid || isSubmitting}
                      className={`w-full py-4 rounded-xl font-medium text-[15px] transition-all flex justify-center
                        ${isFormValid ? 'bg-white text-black hover:bg-gray-200 active:scale-[0.98] cursor-pointer' : 'bg-[#1C1C1E] text-[#666666] cursor-not-allowed'}`}
                    >
                      {isSubmitting ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : 'Randevu Talebi Gönder'}
                    </button>
                  </form>
                </div>

                <div className="pt-16 mt-8 border-t border-white/5">
                  <h2 className="text-2xl font-medium tracking-tight text-white mb-8 flex items-center">
                    <History className="w-5 h-5 mr-3 text-white/70" /> Geçmiş Randevularım / Hareketler
                  </h2>
                  <div className="space-y-4 w-full">
                    {archiveAppointments.length === 0 ? (
                      <div className="text-center py-16 px-4 border border-dashed border-white/5 rounded-2xl bg-[#111111]">
                        <div className="w-16 h-16 bg-[#1C1C1E] rounded-full flex items-center justify-center mx-auto mb-4">
                          <History className="w-8 h-8 text-[#666666]" />
                        </div>
                        <p className="text-lg font-medium text-white">Henüz Aktivite Yok</p>
                        <p className="text-[14px] text-[#86868B] mt-2">Oluşturduğunuz çekim randevuları burada listelenecektir.</p>
                      </div>
                    ) : (
                      archiveAppointments.map(app => renderAppointmentRow(app))
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333333; border-radius: 8px; }
      `}} />
    </div>
  );
}

// Vercel şifreleri için yeni tetikleme