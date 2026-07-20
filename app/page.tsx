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
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { 
  Search, Plus, LayoutGrid, Briefcase, Camera, Megaphone, CalendarCheck, Building2, Globe, 
  LineChart, Map, Mail, X, ChevronDown, LogOut, ChevronLeft, ChevronRight, Clock, 
  MapPin, Image as ImageIcon, AlignLeft, User, CheckCircle2, AlertCircle, Inbox, 
  History, Bell, CheckCheck, PlayCircle, CalendarDays, Pencil, BarChart3
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
} from '../lib/authIdentity';
import CekimRaporuPanel from '../components/CekimRaporuPanel';

export default function App() {
  // --- PRESERVED LOGIC & STATE MANAGEMENT ---
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

  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    rememberMeRef.current = rememberMe;
  }, [rememberMe]);

  const REMEMBER_ME_KEY = 'zebra_remember_me';
  const TAB_SESSION_KEY = 'zebra_session_active';

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
const [notifications, setNotifications] = useState<any[]>([]);

  // Supabase'den kişiye özel bildirimleri çeken motor
// Supabase'den kişiye özel bildirimleri çeken motor (İçi dolu ve eksiksiz)
  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      const formattedNotifs = data.map(n => ({
        ...n,
        created_at: new Date(n.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      }));
      setNotifications(formattedNotifs);
    }
  };

  // Kullanıcı değiştiğinde veya giriş yapıldığında bildirimleri yükle
  useEffect(() => {
    if (isLoggedIn && (fullName || currentUserId)) {
      fetchNotifications();
    }
  }, [isLoggedIn, fullName, currentUserId]);

  const isNotificationForMe = (n) =>
    (currentUserId && n.user_id === currentUserId) ||
    (fullName && n.user_id === fullName);

  const userNotifications = notifications.filter(isNotificationForMe);
  const unreadCount = userNotifications.filter(n => !n.is_read).length;

  const markAllAsRead = async () => {
    setNotifications(prev =>
      prev.map(n => (isNotificationForMe(n) ? { ...n, is_read: true } : n))
    );

    // UUID + legacy isim anahtarları tek sorguda (mükerrer / yarım güncelleme yok)
    const userKeys = [...new Set([currentUserId, fullName].filter(Boolean))];
    if (userKeys.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('user_id', userKeys)
      .eq('is_read', false);

    if (error) {
      console.error('Bildirimler okundu işaretlenemedi:', error.message, error);
      showToast('Bildirimler güncellenirken bir hata oluştu.');
    }
  };

const [bookedAppointments, setBookedAppointments] = useState<any[]>([]);

  // 1. GÜNCELLEME: Veri çekme motorunu özgürleştirdik (Her yerden çağrılabilir)
  const fetchAppointments = async () => {
    const { data, error } = await supabase.from('appointments').select('*');
    if (error) {
      console.error("Veri çekme hatası:", error?.message || error, error);
      return;
    }
    if (data) {
      const formatted = data.map((row) => {
        return {
          id: row.id.toString(),
          danismanIsmi: row.danisman_ismi,
          tarih: toDisplayDate(row.tarih),
          saatBlok: row.saat_blok,
          konum: row.konum,
          portfoyTuru: row.portfoy_turu,
          aciklama: row.aciklama,
          pilot: row.pilot,
          ownerRole: row.owner_role,
          status: row.status,
          reddedilmeSebebi: row.reddedilme_sebebi,
          isManual: row.is_manual === true,
          createdByRole: row.created_by_role || null,
          createdBy: row.created_by || null,
        };
      });
      setBookedAppointments(formatted);
    }
  };

  // Sayfa yüklendiğinde verileri otomatik çeker
  useEffect(() => {
    if (isLoggedIn) {
      fetchAppointments();
    }
  }, [isLoggedIn]);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTimeBlock, setSelectedTimeBlock] = useState(null);
  const [locationStr, setLocationStr] = useState('');
  const [portfolioType, setPortfolioType] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPilot, setSelectedPilot] = useState(null);
  
  const [processingId, setProcessingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
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
    status: 'pending',
    reddedilmeSebebi: '',
  });
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
  const [consultants, setConsultants] = useState([]);
  const [manualForm, setManualForm] = useState({
    tarih: '',
    saatBlok: '',
    konum: '',
    portfoyTuru: '',
    aciklama: '',
    danismanIsmi: '',
    pilot: '',
  });

  const PILOT_OPTIONS = ['FATİMA BAYRAMOVA', 'MEHMET SELİM İDİZ'];
  const TIME_BLOCKS = [
    'Sabah (09:00 - 12:00)',
    'Öğlen (12:00 - 15:00)',
    'Öğleden Sonra (15:00 - 18:00)',
  ];

  const [currentDate] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [expandedRows, setExpandedRows] = useState([]);

  const [takvimSelectedDate, setTakvimSelectedDate] = useState(new Date());
  /** Günün randevuları filtresi: all | confirmed */
  const [dayListFilter, setDayListFilter] = useState('all');

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

  /** Formdaki pilot ismi → owner_role enum */
  const ownerRoleFromPilot = (pilotName: string) => {
    const key = (pilotName || '').trim().toLocaleUpperCase('tr-TR');
    if (key.includes('FATİMA') || key.includes('FATIMA')) return 'fatima';
    if (key.includes('SELİM') || key.includes('SELIM')) return 'selim';
    return null;
  };

  const showToast = (msg: any) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /** owner_role → kartta gösterilecek işlem sorumlusu adı */
  const ownerRoleDisplayName = (ownerRole) => {
    if (ownerRole === 'fatima') return 'Fatima Bayramova';
    if (ownerRole === 'selim') return 'Mehmet Selim İdiz';
    return null;
  };

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
    const danisman = String(danismanTamAdi || '').trim();
    const pilotLabel = withTurkishAblative(String(pilotTamAdi || '').trim());
    const dateLabel = formatNotifDayMonth(tarih);
    return `${danisman} ${pilotLabel} ${dateLabel} tarihinde çekim randevusu aldı.`;
  };

  /** Danışman (randevu sahibi) bildirimi: eski standart onay metni */
  const buildOwnerApprovedMessage = (tarih, konum) => {
    const dateLabel = toDisplayDate(tarih) || String(tarih || '').trim();
    const konumLabel = String(konum || '').trim() || 'Portföy';
    return `${dateLabel} tarihli ${konumLabel} çekim talebiniz onaylandı.`;
  };

  /** profiles'tan pilot tam adı */
  const resolvePilotFullName = async (pilotField, ownerRoleHint) => {
    const ownerRole = ownerRoleHint || ownerRoleFromPilot(pilotField);
    if (ownerRole === 'fatima' || ownerRole === 'selim') {
      const { data } = await supabase
        .from('profiles')
        .select('tam_isim')
        .eq('role', ownerRole)
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

    return ownerRoleDisplayName(ownerRole) || pilotStr || fullName || '';
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

  /** Pilot profil UUID — owner_role veya isim ile */
  const resolvePilotProfileId = async (pilotField) => {
    const ownerRole = ownerRoleFromPilot(pilotField);
    if (ownerRole === 'fatima' || ownerRole === 'selim') {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', ownerRole)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    return resolveProfileIdByName(pilotField);
  };

  /** Danışman profil UUID — isim, yoksa created_by */
  const resolveDanismanProfileId = async (danismanIsmi, createdBy = null) => {
    const byName = await resolveProfileIdByName(danismanIsmi);
    if (byName) return byName;
    if (createdBy) return createdBy;
    return null;
  };

  /**
   * Onaylandı: danışman + tüm broker'lara (UUID) bildirim.
   * Sahip → standart onay metni; diğer broker'lar → çekim randevusu metni.
   */
  const notifyAppointmentApproved = async (appointment) => {
    const danismanIsmi = String(appointment?.danismanIsmi || '').trim();
    const createdBy = appointment?.createdBy || null;
    const tarih = appointment?.tarih;
    const konum = appointment?.konum;
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

    // 3) Alıcı listesi (mükerrer yok)
    const recipientIds = new Set();
    if (ownerId) recipientIds.add(ownerId);
    brokerIds.forEach((id) => recipientIds.add(id));

    if (recipientIds.size === 0) {
      console.warn('Onay bildirimi: alıcı bulunamadı', { danismanIsmi, createdBy });
      return false;
    }

    const pilotTamAdi = await resolvePilotFullName(pilotField, ownerRoleHint);
    const ownerMessage = buildOwnerApprovedMessage(tarih, konum);
    const brokerMessage = buildBrokerApprovedMessage(danismanTamAdi, pilotTamAdi, tarih);

    const rows = Array.from(recipientIds).map((uid) => {
      const isOwner = ownerId && uid === ownerId;
      return {
        user_id: uid,
        title: isOwner ? 'Talebiniz Onaylandı' : 'Yeni Onaylanan Çekim',
        message: isOwner ? ownerMessage : brokerMessage,
      };
    });

    const { error: notifError } = await supabase.from('notifications').insert(rows);
    if (notifError) {
      console.error('Onay bildirimleri yazılamadı:', notifError.message, notifError);
      return false;
    }
    await fetchNotifications();
    return true;
  };

  const canEditAppointment = (app) => {
    if (!app || !role) return false;
    if (role === 'broker') return true;
    if (role === 'selim' || role === 'fatima') {
      const owner = app.ownerRole || ownerRoleFromPilot(app.pilot);
      return owner === role;
    }
    return false;
  };

  /** Manuel formda kilitli pilot adı */
  const lockedPilotForRole = (appRole) => {
    if (appRole === 'fatima') return 'FATİMA BAYRAMOVA';
    if (appRole === 'selim') return 'MEHMET SELİM İDİZ';
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
    const locked = lockedPilotForRole(role);
    const now = new Date();
    setManualForm({
      tarih: '',
      saatBlok: '',
      konum: '',
      portfoyTuru: '',
      aciklama: '',
      danismanIsmi: '',
      pilot: locked || '',
    });
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

  const handleManualCalendarSelect = (dateObj) => {
    handleManualFormChange('tarih', toIsoDate(dateObj));
    setIsManualCalendarOpen(false);
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
      role === 'broker' ? manualForm.pilot : lockedPilotForRole(role);
    const ownerRole = ownerRoleFromPilot(effectivePilot);

    if (!manualForm.tarih || !manualForm.saatBlok || !manualForm.konum.trim()) {
      showToast('Tarih, saat ve konum zorunludur.');
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
    if ((role === 'selim' || role === 'fatima') && ownerRole !== role) {
      showToast('Yalnızca kendi adınıza çekim ekleyebilirsiniz.');
      return;
    }

    setIsManualSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      showToast('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
      setIsManualSaving(false);
      return;
    }

    // DB enum: confirmed (= onaylanmış / approved)
    const payload = {
      created_by: userId,
      owner_role: ownerRole,
      danisman_ismi: manualForm.danismanIsmi.trim(),
      pilot: effectivePilot,
      tarih: manualForm.tarih,
      saat_blok: manualForm.saatBlok,
      konum: manualForm.konum.trim(),
      portfoy_turu: manualForm.portfoyTuru.trim() || null,
      aciklama: manualForm.aciklama.trim() || null,
      status: 'confirmed',
      source: 'other',
      is_manual: true,
      created_by_role: role,
      reddedilme_sebebi: null,
    };

    const { error } = await supabase.from('appointments').insert([payload]);

    if (error) {
      console.error('Manuel çekim ekleme hatası:', error.message, error);
      showToast(error.message || 'Kayıt sırasında bir hata oluştu.');
      setIsManualSaving(false);
      return;
    }

    await fetchAppointments();
    setIsManualSaving(false);
    setIsManualModalOpen(false);
    showToast('Çekim başarıyla eklendi');
  };

  const isRejectedStatus = (status) => status === 'rejected' || status === 'Reddedildi';
  const isPendingStatus = (status) => status === 'pending' || status === 'Bekliyor';
  // DB: confirmed — kullanıcı dili: approved / Onaylandı
  const isConfirmedStatus = (status) =>
    status === 'confirmed' || status === 'Onaylandı' || status === 'approved';

  /** Broker / yönetici: frontend'de created_by / owner_role / status filtresi yok */
  const seesAllAppointments = role === 'broker' || role === 'yonetici';

  const bookingStats = useMemo(() => {
    const stats = {};
    bookedAppointments.forEach(app => {
      // Slot doluluk: reddedilenler slotu bloklamaz
      if (isConfirmedStatus(app.status) || isPendingStatus(app.status)) {
        if (!stats[app.tarih]) stats[app.tarih] = {};
        if (!stats[app.tarih][app.saatBlok]) stats[app.tarih][app.saatBlok] = [];
        stats[app.tarih][app.saatBlok].push(app.pilot);
      }
    });
    return stats; 
  }, [bookedAppointments]);

  /** Takvim gün noktaları: aktif + reddedilen (broker arşiv görünürlüğü) */
  const calendarDayMarkers = useMemo(() => {
    const markers = {};
    bookedAppointments.forEach(app => {
      if (!markers[app.tarih]) {
        markers[app.tarih] = { hasActive: false, hasRejected: false, hasPending: false };
      }
      if (isRejectedStatus(app.status)) markers[app.tarih].hasRejected = true;
      else if (isPendingStatus(app.status)) {
        markers[app.tarih].hasPending = true;
        markers[app.tarih].hasActive = true;
      } else if (isConfirmedStatus(app.status)) {
        markers[app.tarih].hasActive = true;
      }
    });
    return markers;
  }, [bookedAppointments]);

  const archiveAppointments = useMemo(() => {
    let filtered = [...bookedAppointments];

    if (seesAllAppointments) {
      // broker + yonetici: tüm kayıtlar, tüm statüler — ekstra filtre yok
    } else if (role === 'selim' || role === 'fatima' || isPilot) {
      filtered = filtered.filter(app => app.pilot === fullName);
      // Arşiv: bekleyenler "Çekim Talepleri"nde; burada onay/ret
      filtered = filtered.filter(app => !isPendingStatus(app.status));
    } else {
      filtered = filtered.filter(app => app.danismanIsmi === fullName);
    }

    return filtered.sort((a, b) => Number(b.id) - Number(a.id));
  }, [bookedAppointments, role, fullName, isPilot, seesAllAppointments]);

  const selectedTakvimDateStr = formatDateStr(takvimSelectedDate);
  const takvimAppointmentsForSelectedDate = useMemo(() => {
    let filtered = bookedAppointments.filter(app => app.tarih === selectedTakvimDateStr);

    if (seesAllAppointments) {
      // broker + yonetici: o günün randevuları
    } else if (role === 'selim' || role === 'fatima' || isPilot) {
      filtered = filtered.filter(app => app.pilot === fullName);
    } else {
      filtered = filtered.filter(app => app.danismanIsmi === fullName);
    }

    // Segmented filter: Tümü | Sadece Onaylananlar
    // yonetici: filtre gizli; kalıcı olarak yalnızca onaylılar
    const effectiveDayFilter =
      role === 'yonetici' ? 'confirmed' : dayListFilter;
    if (effectiveDayFilter === 'confirmed') {
      filtered = filtered.filter(app => isConfirmedStatus(app.status));
    }

    return filtered.sort((a, b) => {
      const rank = (s) => (isPendingStatus(s) ? 0 : isConfirmedStatus(s) ? 1 : 2);
      return rank(a.status) - rank(b.status) || Number(b.id) - Number(a.id);
    });
  }, [bookedAppointments, selectedTakvimDateStr, role, fullName, isPilot, seesAllAppointments, dayListFilter]);

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
      showToast('Profil bulunamadı. Yöneticiye başvurun.');
      setIsLoggedIn(false);
      setIsLoading(false);
      return false;
    }

    const appRole = profile.role;
    const pilot =
      profile.is_pilot === true || appRole === 'selim' || appRole === 'fatima';

    setRole(appRole);
    setUsername(profile.kullanici_adi || profile.tam_isim);
    setFullName(profile.tam_isim);
    setCurrentUserId(userId);
    setIsPilot(pilot);
    setIsLoggedIn(true);
    const tabFromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('tab')
        : null;
    const allowedTabs = ['genel', 'takvim', 'cekim', 'randevu', 'cekim-raporu'];
    let nextTab =
      (tabFromUrl && allowedTabs.includes(tabFromUrl) && tabFromUrl) ||
      options.tab ||
      defaultTabForRole(appRole);
    // Çekim Raporu yalnızca broker
    if (nextTab === 'cekim-raporu' && appRole !== 'broker') {
      nextTab = 'genel';
    }
    setActiveTab(nextTab);

    // Beni hatırla: profil önbelleğini localStorage'a yaz; aksi halde temizle
    if (options.persist) {
      localStorage.setItem('zebra_auth_status', 'true');
      localStorage.setItem('zebra_user_role', appRole);
      localStorage.setItem('zebra_username', profile.kullanici_adi || profile.tam_isim);
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

      // SIGNED_IN / INITIAL_SESSION: Beni hatırla tercihine göre persist
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (event === 'INITIAL_SESSION' && !canRestoreSession()) {
          await supabase.auth.signOut();
          return;
        }
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
        const alreadySynced =
          isLoggedInRef.current && currentUserIdRef.current === session.user.id;
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

  // Mobil menü açıkken arkada kaydırmayı engelleme
  useEffect(() => {
    document.body.style.overflow = (isMobileMenuOpen || isNotificationOpen || !!editingAppointment || isManualModalOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen, isNotificationOpen, editingAppointment, isManualModalOpen]);

  // 2. SUPABASE AUTH GİRİŞ (tam_isim + whatsapp_number)
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showToast('Lütfen tam isim ve WhatsApp numaranızı girin.');
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
      showToast('Hatalı giriş! Tam isim veya WhatsApp numarası yanlış.');
      localStorage.removeItem(REMEMBER_ME_KEY);
      sessionStorage.removeItem(TAB_SESSION_KEY);
      setIsLoading(false);
      return;
    }

    await applyProfileSession(authData.user.id, { persist: rememberMe });
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
    setUsername('');
    setPassword('');
    setRole('');
    setFullName('');
    setCurrentUserId('');
  };

  const isFormValid = selectedDate && selectedTimeBlock && locationStr && portfolioType && description && selectedPilot;

// 2. GÜNCELLEME: Form gönderildiğinde yeni appointments şemasına insert
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
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

    const payload = {
      created_by: userId,
      owner_role: ownerRole,
      danisman_ismi: fullName,
      tarih: toIsoDate(selectedDate),
      saat_blok: selectedTimeBlock,
      konum: locationStr,
      portfoy_turu: portfolioType,
      aciklama: description,
      pilot: selectedPilot,
      status: 'pending',
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

    const pilotUserId = await resolvePilotProfileId(selectedPilot);
    if (pilotUserId) {
      const { error: notifError } = await supabase.from('notifications').insert([{
        user_id: pilotUserId,
        title: 'Yeni Çekim Talebi',
        message: `${fullName}, ${formatDateStr(selectedDate)} için sizden ${locationStr} çekimi talebinde bulundu, onayınızı bekliyor.`,
      }]);
      if (notifError) {
        console.error('Pilot bildirimi yazılamadı:', notifError.message, notifError);
      } else {
        await fetchNotifications();
      }
    } else {
      console.warn('Pilot UUID bulunamadı, bildirim atlanıyor:', selectedPilot);
    }

    setIsSubmitting(false);
    setShowSuccessModal(true);

    setTimeout(() => {
      setShowSuccessModal(false);
      setSelectedDate(null);
      setSelectedTimeBlock(null);
      setLocationStr('');
      setPortfolioType('');
      setDescription('');
      setSelectedPilot(null);
    }, 3000);
  };

  // 3. GÜNCELLEME: Yönetici onayladığında Danışmana kalıcı bildirim atar
  const handleApprove = async (req) => {
    setProcessingId(req.id);
    
    const { error } = await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', req.id);

    if (error) {
      console.error("Onaylama hatası:", error);
      showToast("Onaylama sırasında bir hata oluştu.");
      setProcessingId(null);
      return;
    }

    await fetchAppointments();

    const notified = await notifyAppointmentApproved(req);

    setProcessingId(null);
    if (notified) {
      showToast("Çekim onaylandı. Danışman ve broker'lara bildirim gönderildi.");
    } else {
      showToast('Çekim onaylandı, ancak bildirim gönderilemedi.');
    }
  };

  // 4. GÜNCELLEME: Yönetici reddettiğinde Danışmana kalıcı bildirim atar
  const handleRejectSubmit = async (req) => {
    setProcessingId(req.id);
    
    const { error } = await supabase.from('appointments').update({ status: 'rejected', reddedilme_sebebi: rejectReason }).eq('id', req.id);

    if (error) {
      console.error("Reddetme hatası:", error);
      showToast("Reddetme sırasında bir hata oluştu.");
      setProcessingId(null);
      return;
    }

    await fetchAppointments();

    const ownerUuid = await resolveDanismanProfileId(req.danismanIsmi, req.createdBy);
    if (ownerUuid) {
      const { error: notifError } = await supabase.from('notifications').insert([{
        user_id: ownerUuid,
        title: 'Talebiniz Reddedildi',
        message: `${req.tarih} tarihli talebiniz reddedildi. Sebep: ${rejectReason}`,
      }]);
      if (notifError) {
        console.error('Red bildirimi yazılamadı:', notifError.message, notifError);
      } else {
        await fetchNotifications();
      }
    } else {
      console.warn('Danışman UUID bulunamadı, red bildirimi atlanıyor:', req.danismanIsmi);
    }

    setProcessingId(null); 
    setRejectingId(null); 
    setRejectReason('');
    showToast("Talep reddedildi ve danışmana bildirildi.");
  };

  const openEditModal = (app) => {
    if (!canEditAppointment(app)) {
      showToast('Bu randevuyu düzenleme yetkiniz yok.');
      return;
    }
    const iso = displayDateToIso(app.tarih);
    setEditingAppointment(app);
    setEditForm({
      tarih: iso,
      saatBlok: app.saatBlok || '',
      konum: app.konum || '',
      portfoyTuru: app.portfoyTuru || '',
      aciklama: app.aciklama || '',
      pilot: app.pilot || '',
      status: isRejectedStatus(app.status)
        ? 'rejected'
        : isConfirmedStatus(app.status)
          ? 'confirmed'
          : 'pending',
      reddedilmeSebebi: app.reddedilmeSebebi || '',
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
    setEditForm({
      tarih: '',
      saatBlok: '',
      konum: '',
      portfoyTuru: '',
      aciklama: '',
      pilot: '',
      status: 'pending',
      reddedilmeSebebi: '',
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

  const handleEditCalendarSelect = (dateObj) => {
    handleEditFormChange('tarih', toIsoDate(dateObj));
    setIsEditCalendarOpen(false);
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
      if (field === 'status' && value !== 'rejected') {
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

    if (!editForm.tarih || !editForm.saatBlok || !editForm.konum || !editForm.pilot) {
      showToast('Tarih, saat, konum ve pilot zorunludur.');
      return;
    }

    // Pilot değişimi: yalnızca broker (RLS WITH CHECK — selim/fatima owner_role değiştiremez)
    const effectivePilot =
      role === 'broker' ? editForm.pilot : editingAppointment.pilot;
    const ownerRole = ownerRoleFromPilot(effectivePilot);

    if (!ownerRole) {
      showToast('Geçerli bir medya sorumlusu seçin.');
      return;
    }

    if ((role === 'selim' || role === 'fatima') && ownerRole !== role) {
      showToast('Yalnızca kendi takviminizdeki randevuları güncelleyebilirsiniz.');
      return;
    }

    if (editForm.status === 'rejected' && !String(editForm.reddedilmeSebebi || '').trim()) {
      showToast('Reddedildi durumu için red sebebi girin.');
      return;
    }

    const normalizeStatus = (s) => {
      if (isConfirmedStatus(s)) return 'confirmed';
      if (isRejectedStatus(s)) return 'rejected';
      if (isPendingStatus(s)) return 'pending';
      return String(s || '');
    };

    const oldStatus = normalizeStatus(editingAppointment.status);
    const newStatus = normalizeStatus(editForm.status);
    const statusChanged = oldStatus !== newStatus;
    const danismanIsmi = editingAppointment.danismanIsmi || editForm.danismanIsmi;
    const konumLabel = editForm.konum.trim() || editingAppointment.konum || 'Portföy';
    const actorLabel =
      role === 'broker'
        ? (fullName || 'Broker')
        : (ownerRoleDisplayName(role) || fullName || effectivePilot || 'Ekip');

    setIsEditSaving(true);

    try {
      const payload = {
        tarih: editForm.tarih, // YYYY-MM-DD
        saat_blok: editForm.saatBlok,
        konum: editForm.konum.trim(),
        portfoy_turu: editForm.portfoyTuru.trim(),
        aciklama: editForm.aciklama.trim(),
        pilot: effectivePilot,
        owner_role: ownerRole,
        status: editForm.status,
        reddedilme_sebebi:
          editForm.status === 'rejected'
            ? String(editForm.reddedilmeSebebi).trim()
            : null,
      };

      const { error } = await supabase
        .from('appointments')
        .update(payload)
        .eq('id', editingAppointment.id);

      if (error) {
        console.error('Güncelleme hatası:', error.message, error.code, error.details, error);
        showToast(error.message || 'Güncelleme sırasında bir hata oluştu.');
        return;
      }

      // Statü değiştiyse bildirim
      if (statusChanged && (newStatus === 'confirmed' || newStatus === 'rejected')) {
        try {
          if (newStatus === 'confirmed') {
            await notifyAppointmentApproved({
              ...editingAppointment,
              danismanIsmi: danismanIsmi || editingAppointment.danismanIsmi,
              tarih: editForm.tarih || editingAppointment.tarih,
              konum: konumLabel,
              pilot: effectivePilot || editingAppointment.pilot,
              ownerRole,
              createdBy: editingAppointment.createdBy,
            });
          } else if (danismanIsmi || editingAppointment.createdBy) {
            const ownerUuid = await resolveDanismanProfileId(
              danismanIsmi,
              editingAppointment.createdBy
            );
            if (ownerUuid) {
              const notif = {
                user_id: ownerUuid,
                title: 'Talebiniz Reddedildi',
                message: `${konumLabel} için çekim talebiniz ${actorLabel} tarafından reddedilmiştir.${
                  editForm.reddedilmeSebebi
                    ? ` Sebep: ${String(editForm.reddedilmeSebebi).trim()}`
                    : ''
                }`,
              };
              const { error: notifError } = await supabase.from('notifications').insert([notif]);
              if (notifError) {
                console.error('Bildirim yazılamadı:', notifError.message, notifError);
              } else {
                await fetchNotifications();
              }
            } else {
              console.warn('Danışman UUID bulunamadı, red bildirimi atlanıyor:', danismanIsmi);
            }
          }
        } catch (notifErr) {
          console.error('Bildirim hatası:', notifErr);
        }
      }

      await fetchAppointments();
      setEditingAppointment(null);
      showToast('Başarıyla güncellendi');
    } catch (err) {
      console.error('Güncelleme istisnası:', err);
      showToast('Güncelleme sırasında beklenmeyen bir hata oluştu.');
    } finally {
      setIsEditSaving(false);
    }
  };

  // --- APPLE HIG UI RENDERERS ---
  const getStatusBadge = (status) => {
    const baseClass = "px-3 py-1 rounded-xl text-[11px] font-medium tracking-wide uppercase border flex items-center shadow-sm shrink-0";
    switch(status) {
      case 'Bekliyor':
      case 'pending':
        return <span className={`${baseClass} bg-[#1C1C1E] text-[#E5B540] border-[#E5B540]/20`}><div className="w-1.5 h-1.5 rounded-full bg-[#E5B540] mr-2"></div>Bekliyor</span>;
      case 'Onaylandı':
      case 'confirmed':
        return <span className={`${baseClass} bg-[#1C1C1E] text-[#34C759] border-[#34C759]/20`}><div className="w-1.5 h-1.5 rounded-full bg-[#34C759] mr-2"></div>Onaylandı</span>;
      case 'Reddedildi':
      case 'rejected':
        return <span className={`${baseClass} bg-[#1C1C1E] text-[#FF3B30] border-[#FF3B30]/20`}><div className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] mr-2"></div>Reddedildi</span>;
      default: return null;
    }
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
          className={`flex flex-col sm:flex-row justify-between sm:items-center p-6 gap-4 sm:gap-0 transition-colors ${isRejected ? 'cursor-pointer active:scale-[0.99]' : ''}`}
          onClick={() => isRejected && toggleRow(app.id)}
        >
          <div className="flex items-center space-x-6 min-w-0 flex-1">
            <div className="flex flex-col shrink-0 text-center w-16">
              <span className={`text-sm font-medium ${isRejected ? 'text-[#FF3B30]/80' : 'text-white'}`}>
                {app.tarih.substring(0,5)}
              </span>
              <span className={`text-[11px] font-medium mt-1 uppercase tracking-wide ${isRejected ? 'text-[#FF3B30]/55' : 'text-[#86868B]'}`}>
                {app.saatBlok.split(' (')[0]}
              </span>
            </div>
            <div className={`w-px h-8 mx-2 hidden sm:block ${isRejected ? 'bg-[#FF3B30]/20' : 'bg-white/5'}`}></div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className={`text-[15px] font-medium truncate ${isRejected ? 'text-[#FF3B30]/90' : 'text-white'}`}>
                {app.konum}
              </span>
              <span className={`text-[13px] truncate mt-1 ${isRejected ? 'text-[#FF3B30]/50' : 'text-[#86868B]'}`}>
                {app.portfoyTuru}
                {usesManagerShell(role) ? ` • Danışman: ${app.danismanIsmi}` : ` • Pilot: ${app.pilot}`}
                {role === 'broker' && (() => {
                  const owner = app.ownerRole || ownerRoleFromPilot(app.pilot);
                  const islem = ownerRoleDisplayName(owner);
                  return islem ? (
                    <span className="text-neutral-400"> • İşlem: {islem}</span>
                  ) : null;
                })()}
              </span>
              {app.isManual && (
                <span className="inline-flex mt-2 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase bg-white/5 text-neutral-400 border border-white/5">
                  Manuel Giriş: {manualEntryDisplayName(app.createdByRole)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-row items-center gap-3 shrink-0 sm:ml-4 self-end sm:self-center">
            {canEditAppointment(app) && (
              <button
                type="button"
                title="Düzenle"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(app);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1C1C1E] border border-white/5 text-[#86868B] hover:text-white hover:bg-white/10 hover:border-white/10 transition-all duration-300 cursor-pointer active:scale-95"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            )}
            {getStatusBadge(app.status)}
            {isRejected && (
              <div className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all duration-300 cursor-pointer active:scale-95 ${isExpanded ? 'bg-[#FF3B30]/15 border-[#FF3B30]/30' : 'bg-[#1C1C1E] border-[#FF3B30]/20 hover:bg-[#FF3B30]/10'}`}>
                <ChevronDown className={`w-4 h-4 text-[#FF3B30]/80 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            )}
          </div>
        </div>

        {isRejected && (
          <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
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

  const consultantMenuItems = [
    { id: 'genel', label: 'Genel Bakış', icon: LayoutGrid, isEnabled: true },
    { id: 'takvim', label: 'Çekim Takvimi', icon: CalendarDays, isEnabled: true },
    { id: 'randevu', label: 'Randevu Talebi Oluştur', icon: CalendarCheck, isEnabled: true },
    { id: 'portfoy', label: 'Portföy Havuzu', icon: Briefcase, isEnabled: false },
    { id: 'studyo', label: 'Zebra Stüdyo', icon: Camera, isEnabled: false },
    { id: 'kampanya', label: 'Kampanyalar', icon: Megaphone, isEnabled: false },
    { id: 'kurumsal', label: 'Kurumsal', icon: Building2, isEnabled: false },
    { id: 'pazar', label: 'Pazar Analiz Raporu', icon: LineChart, isEnabled: false },
  ];

  const managerMenuItems = [
    { id: 'genel', label: 'Genel Bakış', icon: LayoutGrid, isEnabled: true },
    { id: 'takvim', label: 'Çekim Takvimi', icon: CalendarDays, isEnabled: true },
    ...(role === 'broker'
      ? [{ id: 'cekim-raporu', label: 'Çekim Raporu', icon: BarChart3, isEnabled: true }]
      : []),
    { id: 'cekim', label: 'Çekim Talepleri', icon: Camera, isEnabled: true },
    { id: 'danisman', label: 'Danışman Talepleri', icon: User, isEnabled: false },
    { id: 'kurumsal', label: 'Kurumsal', icon: Building2, isEnabled: false },
  ];

  const currentMenuItems = usesManagerShell(role) ? managerMenuItems : consultantMenuItems;

  const navigateToTab = (tabId) => {
    if (tabId === 'cekim-raporu' && role !== 'broker') return;
    setActiveTab(tabId);
    setIsMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    }
  };

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
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#86868B] rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-out text-base md:text-sm"
                required
              />
            </div>

            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="WhatsApp Numarası"
                autoComplete="current-password"
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#86868B] rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-out text-base md:text-sm"
                required
              />
            </div>

            <div className="flex items-center justify-between px-2 pt-2">
              <label className="flex items-center space-x-3 cursor-pointer group active:scale-[0.98] transition-transform">
                <div className="relative flex items-center">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="peer sr-only cursor-pointer" />
                  <div className="w-5 h-5 bg-[#1C1C1E] border border-white/10 rounded-md peer-checked:bg-white peer-checked:border-white transition-all duration-300 ease-out flex items-center justify-center">
                    {rememberMe && <CheckCircle2 className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
                  </div>
                </div>
                <span className="text-[13px] text-[#86868B] group-hover:text-white transition-colors duration-300 ease-out">Beni hatırla</span>
              </label>
            </div>

            <div className="pt-6">
              <button 
                type="submit" 
                className="w-full h-[56px] bg-white text-black text-[15px] font-medium rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all duration-300 ease-out flex items-center justify-center cursor-pointer"
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

const pendingRequests = bookedAppointments.filter(app => {
    const isPending = app.status === 'Bekliyor' || app.status === 'pending';
    if (!isPending) return false;
    if (!canApproveAppointments(role)) return false;
    if (isPilot) return app.pilot === fullName;
    return true; // broker: tüm bekleyenler
  });
  return (
    <div className="min-h-screen flex font-sans antialiased text-[#EDEDED] overflow-hidden selection:bg-white/20 selection:text-white bg-[#0A0A0A]">
      
      {/* Toast Notification */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[110] transition-all duration-500 ease-out pointer-events-none
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
          <div className="bg-[#111111]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-10 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-500 ease-out">
            <div className="w-20 h-20 bg-[#1C1C1E] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative">
              <CheckCircle2 className="w-10 h-10 text-white relative z-10" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-medium tracking-tight text-white mb-2">Talep İletildi</h2>
            <p className="text-[#86868B] text-[14px] leading-relaxed">Randevu talebiniz başarıyla oluşturuldu ve ekibe bildirildi.</p>
          </div>
        </div>
      )}

      {/* EDIT APPOINTMENT MODAL */}
      {editingAppointment && (
        <div
          className="fixed inset-0 bg-[#0A0A0A]/70 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={closeEditModal}
        >
          <div
            className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300 ease-out max-h-[90vh] flex flex-col overflow-hidden"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
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

                    {/* Şık takvim popup — ana takvimle aynı dil */}
                    {isEditCalendarOpen && (
                      <div
                        className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200"
                        onClick={() => setIsEditCalendarOpen(false)}
                      >
                        <div className="absolute inset-0 bg-[#0A0A0A]/50 backdrop-blur-md" />
                        <div
                          className="relative z-10 w-full max-w-[360px] bg-[#161616] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-300 ease-out"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[15px] font-medium tracking-tight text-white">
                              {monthNames[editCalMonth]} {editCalYear}
                            </h3>
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={handleEditCalPrevMonth}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={handleEditCalNextMonth}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditCalendarOpen(false)}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1C1C1E] text-[#86868B] hover:text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95 ml-1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-7 gap-1 mb-2">
                            {weekDays.map((day) => (
                              <div
                                key={day}
                                className="text-center text-[10px] font-medium text-[#86868B] uppercase tracking-wide py-1.5"
                              >
                                {day}
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: getFirstDayOfMonth(editCalMonth, editCalYear) }).map((_, i) => (
                              <div key={`edit-empty-${i}`} className="h-10" />
                            ))}
                            {Array.from({ length: getDaysInMonth(editCalMonth, editCalYear) }).map((_, i) => {
                              const dayNumber = i + 1;
                              const dateObj = new Date(editCalYear, editCalMonth, dayNumber);
                              const iso = toIsoDate(dateObj);
                              const isSelected = editForm.tarih === iso;
                              const isToday =
                                dayNumber === today.getDate() &&
                                editCalMonth === today.getMonth() &&
                                editCalYear === today.getFullYear();

                              return (
                                <button
                                  key={`edit-day-${dayNumber}`}
                                  type="button"
                                  onClick={() => handleEditCalendarSelect(dateObj)}
                                  className={`
                                    relative h-10 w-full rounded-xl flex items-center justify-center text-[14px] font-medium transition-all duration-300 cursor-pointer active:scale-[0.98]
                                    ${!isSelected && !isToday ? 'bg-[#1C1C1E] text-white hover:bg-white/10' : ''}
                                    ${isToday && !isSelected ? 'bg-neutral-800/50 text-neutral-400 font-medium ring-1 ring-white/10' : ''}
                                    ${isSelected ? 'bg-white text-black font-medium shadow-xl' : ''}
                                  `}
                                >
                                  {dayNumber}
                                </button>
                              );
                            })}
                          </div>

                          <p className="text-[11px] text-[#86868B] text-center mt-4">
                            Bir gün seçerek tarihi güncelleyin
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Saat Bloğu</label>
                    <div className="relative">
                      <select
                        required
                        value={editForm.saatBlok}
                        onChange={(e) => handleEditFormChange('saatBlok', e.target.value)}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px] cursor-pointer"
                      >
                        <option value="" disabled>Seçin</option>
                        {!TIME_BLOCKS.includes(editForm.saatBlok) && editForm.saatBlok ? (
                          <option value={editForm.saatBlok}>{editForm.saatBlok}</option>
                        ) : null}
                        {TIME_BLOCKS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Konum</label>
                  <input
                    type="text"
                    required
                    value={editForm.konum}
                    onChange={(e) => handleEditFormChange('konum', e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px]"
                    placeholder="Adres / proje"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Portföy Türü</label>
                  <input
                    type="text"
                    value={editForm.portfoyTuru}
                    onChange={(e) => handleEditFormChange('portfoyTuru', e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px]"
                    placeholder="Örn. 3+1 Daire"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Açıklama</label>
                  <textarea
                    value={editForm.aciklama}
                    onChange={(e) => handleEditFormChange('aciklama', e.target.value)}
                    rows={3}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 resize-none focus:outline-none focus:border-white/20 transition-all text-[14px] custom-scrollbar"
                    placeholder="Çekim notları"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Medya Sorumlusu</label>
                  {role === 'broker' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PILOT_OPTIONS.map((pilot) => (
                        <button
                          key={pilot}
                          type="button"
                          onClick={() => handleEditFormChange('pilot', pilot)}
                          className={`w-full flex items-center p-3.5 rounded-xl transition-all duration-300 text-left cursor-pointer active:scale-[0.98]
                            ${editForm.pilot === pilot
                              ? 'bg-white text-black'
                              : 'bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]'
                            }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 shrink-0 ${editForm.pilot === pilot ? 'bg-[#F2F2F7]' : 'bg-[#2C2C2E]'}`}>
                            <User className={`w-3.5 h-3.5 ${editForm.pilot === pilot ? 'text-black' : 'text-white'}`} />
                          </div>
                          <span className="text-[13px] font-medium truncate">{pilot}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full bg-[#1C1C1E] border border-white/5 rounded-xl px-4 h-12 flex items-center text-[14px] text-[#86868B]">
                      {editForm.pilot}
                      <span className="ml-auto text-[11px] uppercase tracking-wide">Kilitli</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Durum</label>
                  <div className="relative">
                    <select
                      value={editForm.status}
                      onChange={(e) => handleEditFormChange('status', e.target.value)}
                      className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px] cursor-pointer"
                    >
                      <option value="pending">Bekliyor</option>
                      <option value="confirmed">Onaylandı</option>
                      <option value="rejected">Reddedildi</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                  </div>
                </div>

                {editForm.status === 'rejected' && (
                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Red Sebebi</label>
                    <textarea
                      required
                      value={editForm.reddedilmeSebebi}
                      onChange={(e) => handleEditFormChange('reddedilmeSebebi', e.target.value)}
                      rows={2}
                      className="w-full bg-[#1C1C1E] border border-[#FF3B30]/20 text-white placeholder:text-[#666666] rounded-xl p-4 resize-none focus:outline-none focus:border-[#FF3B30]/40 transition-all text-[14px] custom-scrollbar"
                      placeholder="Red gerekçesi"
                    />
                  </div>
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
                  disabled={isEditSaving}
                  className="flex-1 h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                >
                  {isEditSaving ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Kaydet'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL CREATE MODAL */}
      {isManualModalOpen && (
        <div
          className="fixed inset-0 bg-[#0A0A0A]/70 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={closeManualModal}
        >
          <div
            className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300 ease-out max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/5 shrink-0">
              <div>
                <h2 className="text-lg font-medium tracking-tight text-white">Yeni Çekim Oluştur</h2>
                <p className="text-[12px] text-[#86868B] mt-1">Manuel giriş — doğrudan onaylı kaydedilir</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Tarih</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (manualForm.tarih) {
                          const [y, m] = manualForm.tarih.split('-').map(Number);
                          if (y && m) {
                            setManualCalYear(y);
                            setManualCalMonth(m - 1);
                          }
                        }
                        setIsManualCalendarOpen(true);
                      }}
                      className="w-full bg-[#1C1C1E] border border-white/5 text-left text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 hover:border-white/15 transition-all text-[14px] cursor-pointer flex items-center justify-between active:scale-[0.99]"
                    >
                      <span className={manualForm.tarih ? 'text-white' : 'text-[#666666]'}>
                        {manualForm.tarih ? toDisplayDate(manualForm.tarih) : 'Tarih seçin'}
                      </span>
                      <CalendarDays className="w-4 h-4 text-[#86868B] shrink-0" />
                    </button>

                    {isManualCalendarOpen && (
                      <div
                        className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200"
                        onClick={() => setIsManualCalendarOpen(false)}
                      >
                        <div className="absolute inset-0 bg-[#0A0A0A]/50 backdrop-blur-md" />
                        <div
                          className="relative z-10 w-full max-w-[360px] bg-[#161616] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-300 ease-out"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[15px] font-medium tracking-tight text-white">
                              {monthNames[manualCalMonth]} {manualCalYear}
                            </h3>
                            <div className="flex items-center space-x-2">
                              <button type="button" onClick={handleManualCalPrevMonth} className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95">
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={handleManualCalNextMonth} className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95">
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={() => setIsManualCalendarOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-[#1C1C1E] text-[#86868B] hover:text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95 ml-1">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-7 gap-1 mb-2">
                            {weekDays.map((day) => (
                              <div key={day} className="text-center text-[10px] font-medium text-[#86868B] uppercase tracking-wide py-1.5">{day}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: getFirstDayOfMonth(manualCalMonth, manualCalYear) }).map((_, i) => (
                              <div key={`man-empty-${i}`} className="h-10" />
                            ))}
                            {Array.from({ length: getDaysInMonth(manualCalMonth, manualCalYear) }).map((_, i) => {
                              const dayNumber = i + 1;
                              const dateObj = new Date(manualCalYear, manualCalMonth, dayNumber);
                              const iso = toIsoDate(dateObj);
                              const isSelected = manualForm.tarih === iso;
                              const isToday =
                                dayNumber === today.getDate() &&
                                manualCalMonth === today.getMonth() &&
                                manualCalYear === today.getFullYear();
                              return (
                                <button
                                  key={`man-day-${dayNumber}`}
                                  type="button"
                                  onClick={() => handleManualCalendarSelect(dateObj)}
                                  className={`
                                    relative h-10 w-full rounded-xl flex items-center justify-center text-[14px] font-medium transition-all duration-300 cursor-pointer active:scale-[0.98]
                                    ${!isSelected && !isToday ? 'bg-[#1C1C1E] text-white hover:bg-white/10' : ''}
                                    ${isToday && !isSelected ? 'bg-neutral-800/50 text-neutral-400 font-medium ring-1 ring-white/10' : ''}
                                    ${isSelected ? 'bg-white text-black font-medium shadow-xl' : ''}
                                  `}
                                >
                                  {dayNumber}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Saat Bloğu</label>
                    <div className="relative">
                      <select
                        required
                        value={manualForm.saatBlok}
                        onChange={(e) => handleManualFormChange('saatBlok', e.target.value)}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px] cursor-pointer"
                      >
                        <option value="" disabled>Seçin</option>
                        {TIME_BLOCKS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Portföy Konumu</label>
                  <input
                    type="text"
                    required
                    value={manualForm.konum}
                    onChange={(e) => handleManualFormChange('konum', e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px]"
                    placeholder="Adres / proje"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Portföy Türü</label>
                  <input
                    type="text"
                    value={manualForm.portfoyTuru}
                    onChange={(e) => handleManualFormChange('portfoyTuru', e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px]"
                    placeholder="Örn. 3+1 Daire"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Açıklama</label>
                  <textarea
                    value={manualForm.aciklama}
                    onChange={(e) => handleManualFormChange('aciklama', e.target.value)}
                    rows={3}
                    className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 resize-none focus:outline-none focus:border-white/20 transition-all text-[14px] custom-scrollbar"
                    placeholder="Çekim notları"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Danışman</label>
                  {consultants.length > 0 ? (
                    <div className="relative">
                      <select
                        required
                        value={manualForm.danismanIsmi}
                        onChange={(e) => handleManualFormChange('danismanIsmi', e.target.value)}
                        className="w-full appearance-none bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px] cursor-pointer"
                      >
                        <option value="" disabled>Danışman seçin</option>
                        {consultants.map((name) => (
                          <option key={name} value={name}>{name}</option>
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
                      className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 h-12 focus:outline-none focus:border-white/20 transition-all text-[14px]"
                      placeholder="Danışman tam adı"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-0.5">Sorumlu Pilot</label>
                  {role === 'broker' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PILOT_OPTIONS.map((pilot) => (
                        <button
                          key={pilot}
                          type="button"
                          onClick={() => handleManualFormChange('pilot', pilot)}
                          className={`w-full flex items-center p-3.5 rounded-xl transition-all duration-300 text-left cursor-pointer active:scale-[0.98]
                            ${manualForm.pilot === pilot
                              ? 'bg-white text-black'
                              : 'bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]'
                            }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 shrink-0 ${manualForm.pilot === pilot ? 'bg-[#F2F2F7]' : 'bg-[#2C2C2E]'}`}>
                            <User className={`w-3.5 h-3.5 ${manualForm.pilot === pilot ? 'text-black' : 'text-white'}`} />
                          </div>
                          <span className="text-[13px] font-medium truncate">{pilot}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full bg-[#1C1C1E] border border-white/5 rounded-xl px-4 h-12 flex items-center text-[14px] text-[#86868B]">
                      {manualForm.pilot || lockedPilotForRole(role)}
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
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isManualSaving}
                  className="flex-1 h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                >
                  {isManualSaving ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Kaydet'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Overlays */}
      <div className={`fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-md z-40 lg:hidden transition-opacity duration-300 ease-out cursor-pointer ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMobileMenuOpen(false)} />
      <div className={`fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-md z-[60] transition-opacity duration-300 ease-out cursor-pointer ${isNotificationOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsNotificationOpen(false)} />

      {/* NOTIFICATION CENTER */}
      <aside className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-[#111111]/95 backdrop-blur-3xl shadow-2xl border-l border-white/5 z-[70] flex flex-col transition-transform duration-500 cubic-bezier-[0.16, 1, 0.3, 1] ${isNotificationOpen ? 'translate-x-0' : 'translate-x-full'}`}>
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
            userNotifications.map(notif => (
<div key={notif.id} className={`bg-[#1C1C1E] border ${notif.is_read ? 'border-transparent opacity-60' : 'border-white/10 shadow-lg'} rounded-2xl p-5 transition-all duration-300`}>                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-[14px] font-medium text-white">{notif.title}</h4>
                  <span className="text-[11px] font-medium text-[#86868B]">{notif.created_at}</span>
                </div>
                <p className="text-[13px] text-[#86868B] leading-relaxed">{notif.message}</p>
              </div>
            ))
          )}
        </div>
        {unreadCount > 0 && (
          <div className="p-6 border-t border-white/5 shrink-0">
            <button onClick={markAllAsRead} className="w-full py-4 text-[14px] font-medium text-black bg-white rounded-xl transition-all active:scale-[0.98] cursor-pointer">
              Tümünü Okundu İşaretle
            </button>
          </div>
        )}
      </aside>

      {/* SIDEBAR NAVIGATION */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[260px] bg-[#111111]/50 backdrop-blur-2xl border-r border-white/5 flex flex-col transition-transform duration-500 ease-out shrink-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
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

        <nav className="flex-1 px-4 space-y-1 custom-scrollbar overflow-y-auto">
          {currentMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                disabled={!item.isEnabled}
                onClick={() => {
                  if (!item.isEnabled) return;
                  navigateToTab(item.id);
                }}
                className={`w-full flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 text-[14px] font-medium
                  ${isActive ? 'bg-white/10 text-white shadow-inner cursor-pointer' 
                    : item.isEnabled ? 'text-[#86868B] hover:bg-white/5 hover:text-white cursor-pointer' 
                    : 'text-[#86868B] opacity-40 cursor-not-allowed'}`}
              >
                <Icon className={`w-[16px] h-[16px] mr-3.5 transition-colors duration-300 ${isActive ? 'text-white' : 'text-[#86868B]'}`} strokeWidth={2} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 shrink-0">
          <div className="flex items-center justify-between bg-[#1C1C1E]/50 rounded-xl p-3 border border-white/5 transition-colors hover:bg-[#1C1C1E] cursor-pointer group">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-white/10 text-white rounded-full flex items-center justify-center text-xs font-medium">
                {usesManagerShell(role) ? 'YP' : 'NT'}
              </div>
              <div className="ml-3">
                <p className="text-[13px] font-medium text-white leading-none">{fullName}</p>
                <p className="text-[11px] text-[#86868B] mt-1">{roleLabel(role)}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-[#86868B] group-hover:text-white transition-colors p-2 cursor-pointer active:scale-95" title="Çıkış Yap">
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
            
            <button onClick={() => setIsNotificationOpen(true)} className="relative w-10 h-10 flex items-center justify-center text-[#86868B] hover:text-white bg-[#161616] border border-white/5 rounded-full transition-all duration-300 shadow-sm active:scale-95 cursor-pointer">
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-white rounded-full border-2 border-[#161616]"></span>}
            </button>

            {role === 'danisman' && (
              <button onClick={() => navigateToTab('randevu')} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.15)]">
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-12 lg:px-16 py-8">
          <div className="w-full mx-auto space-y-10 pb-20 max-w-7xl">
            
            {/* --- GENEL BAKIŞ (Completely Empty/Minimalist Entry) --- */}
            {activeTab === 'genel' && (
              <div className="animate-in fade-in duration-700 flex flex-col items-center justify-center h-[70vh] text-center">
                <Image
                  src="/icon-512x512.png"
                  alt="Zebra 360"
                  width={64}
                  height={64}
                  className="w-16 h-16 mb-6 rounded-full object-cover shadow-[0_0_40px_-12px_rgba(255,255,255,0.25)]"
                  priority
                />
                <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">
                  {greeting}, {fullName.split(' ')[0]}.
                </h1>
                <p className="text-[#86868B] text-[15px]">Zebra 360’a Hoş Geldiniz.</p>
              </div>
            )}

            {/* --- ÇEKİM TAKVİMİ --- */}
            {activeTab === 'takvim' && (
              <div className="animate-in fade-in duration-700 space-y-8">
                <div className="mb-10">
                  <h1 className="text-2xl font-medium tracking-tight text-white">Çekim Takvimi</h1>
                  <p className="text-[#86868B] mt-2 text-[14px]">Operasyon takvimini görüntüleyin.</p>
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
                      const hasAppointments = !!(dayMarker?.hasActive || dayMarker?.hasRejected || dayMarker?.hasPending);
                      
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
                              {dayMarker?.hasActive && (
                                <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#34C759]' : 'bg-[#86868B]'}`} />
                              )}
                              {dayMarker?.hasRejected && (
                                <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-[#FF3B30]' : 'bg-[#FF3B30]/80'}`} />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-8 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <h3 className="text-lg font-medium text-white">
                      {formatDateStr(takvimSelectedDate)} Randevuları
                    </h3>
                    {role !== 'yonetici' && (
                      <div className="flex w-full p-1 rounded-xl bg-[#1C1C1E] border border-white/5">
                        <button
                          type="button"
                          onClick={() => setDayListFilter('all')}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-[12px] sm:text-[13px] font-medium transition-all cursor-pointer active:scale-[0.98]
                            ${dayListFilter === 'all' ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-white'}`}
                        >
                          Tümü
                        </button>
                        <button
                          type="button"
                          onClick={() => setDayListFilter('confirmed')}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-[12px] sm:text-[13px] font-medium transition-all cursor-pointer active:scale-[0.98]
                            ${dayListFilter === 'confirmed' ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-white'}`}
                        >
                          Sadece Onaylananlar
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col space-y-4 w-full">
                    {takvimAppointmentsForSelectedDate.length === 0 ? (
                      <p className="text-[#86868B] text-[14px]">
                        {role === 'yonetici' || dayListFilter === 'confirmed'
                          ? 'Bu tarihte onaylanmış randevu bulunmuyor.'
                          : 'Bu tarihte planlanan bir işlem bulunmuyor.'}
                      </p>
                    ) : (
                      takvimAppointmentsForSelectedDate.map(app => renderAppointmentRow(app))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* BROKER: Çekim Raporu (SPA tab — anında geçiş) */}
            {role === 'broker' && activeTab === 'cekim-raporu' && (
              <CekimRaporuPanel appointments={bookedAppointments} />
            )}

            {/* MANAGER: PENDING REQUESTS */}
            {canApproveAppointments(role) && activeTab === 'cekim' && (
              <div className="animate-in fade-in duration-700 w-full">
                <div className="mb-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-medium tracking-tight text-white">Çekim Talepleri</h1>
                    <p className="text-[#86868B] mt-2 text-[15px]">Onay bekleyen yeni talepleri inceleyin.</p>
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
                
                {pendingRequests.length === 0 ? (
                  <div className="bg-[#111111] border border-white/5 rounded-2xl p-20 flex flex-col items-center justify-center text-center w-full">
                    <div className="w-16 h-16 bg-[#1C1C1E] rounded-full flex items-center justify-center mb-6">
                      <Inbox className="w-6 h-6 text-[#86868B]" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Her Şey Tamam</h3>
                    <p className="text-[#86868B] text-[14px]">Şu an bekleyen güncel talep bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-4 w-full">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="bg-[#161616] border border-white/5 rounded-2xl p-6 sm:p-8 flex flex-col shadow-sm transition-all duration-300 w-full">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-[17px] font-medium text-white">{req.danismanIsmi}</h3>
                            <p className="text-[12px] text-[#86868B] mt-1 font-medium">{req.tarih} • {req.saatBlok.split(' (')[0]}</p>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        <div className="space-y-3 mb-6">
                          <div className="flex items-start text-[14px]"><MapPin className="w-4 h-4 text-[#666666] mr-4 shrink-0 mt-0.5" /><span className="text-white truncate">{req.konum}</span></div>
                          <div className="flex items-start text-[14px]"><Building2 className="w-4 h-4 text-[#666666] mr-4 shrink-0 mt-0.5" /><span className="text-white truncate">{req.portfoyTuru}</span></div>
                          <div className="flex items-start text-[14px]"><ImageIcon className="w-4 h-4 text-[#666666] mr-4 shrink-0 mt-0.5" /><span className="text-white truncate">{req.pilot}</span></div>
                          <div className="flex items-start text-[13px] bg-[#1C1C1E] p-4 rounded-xl border border-white/5 mt-4"><AlignLeft className="w-4 h-4 text-[#666666] mr-4 shrink-0 mt-0.5" /><p className="text-[#86868B] leading-relaxed">{req.aciklama}</p></div>
                        </div>
                        {rejectingId === req.id ? (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 mt-auto">
                            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reddetme sebebi..." className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-24 resize-none focus:outline-none focus:border-white/20 text-[14px] mb-4 custom-scrollbar" />
                            <div className="flex space-x-3">
                              <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="flex-1 py-3 bg-[#1C1C1E] text-white rounded-xl text-[14px] font-medium hover:bg-[#2C2C2E] transition-all cursor-pointer">İptal</button>
                              <button disabled={processingId === req.id || !rejectReason.trim()} onClick={() => handleRejectSubmit(req)} className="flex-1 py-3 bg-[#1C1C1E] text-[#FF3B30] border border-[#FF3B30]/20 rounded-xl text-[14px] font-medium hover:bg-[#FF3B30]/10 transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer">
                                {processingId === req.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Reddet"}
                              </button>
                            </div>
                          </div>
                       ) : (
                          isPilot ? (
                            <div className="flex space-x-3 mt-auto">
                              <button onClick={() => setRejectingId(req.id)} className="flex-1 py-3 bg-[#1C1C1E] text-[#EDEDED] rounded-xl text-[14px] font-medium hover:bg-[#2C2C2E] transition-all cursor-pointer">Reddet</button>
                              <button disabled={processingId === req.id} onClick={() => handleApprove(req)} className="flex-1 py-3 bg-white text-black rounded-xl text-[14px] font-medium hover:bg-gray-200 transition-all cursor-pointer flex items-center justify-center">
                                {processingId === req.id ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : "Onayla"}
                              </button>
                            </div>
                          ) : (
                            <div className="mt-auto pt-4 text-[13px] font-medium text-[#E5B540] flex items-center">
                              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                              Sadece atanmış medya sorumlusu (pilot) bu talebi onaylayabilir.
                            </div>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* ARCHIVE COMPONENT FOR MANAGER */}
                <div className="pt-16 mt-8 border-t border-white/5">
                  <h2 className="text-2xl font-medium tracking-tight text-white mb-8 flex items-center">
                    <History className="w-5 h-5 mr-3 text-white/70" /> Geçmiş Çekim Talepleri / Arşiv
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

            {/* CONSULTANT: REQUEST FORM */}
            {role === 'danisman' && activeTab === 'randevu' && (
              <div className="animate-in fade-in duration-700 w-full">
                <div className="mb-10">
                  <h1 className="text-3xl font-medium tracking-tight text-white">Randevu Talebi Oluştur</h1>
                  <p className="text-[#86868B] mt-2 text-[15px]">Müsait tarihi seçin ve talebinizi iletin.</p>
                </div>
                
                <div className="space-y-8 w-full">
                  {/* STEP 1: CALENDAR */}
                  <div className="bg-[#161616] border border-white/5 rounded-2xl p-6 lg:p-8 shadow-sm w-full">
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
                        
                        const bookedSlotsForDay = bookingStats[dateStr] || {};
                        const blocks = ['Sabah (09:00 - 12:00)', 'Öğlen (12:00 - 15:00)', 'Öğleden Sonra (15:00 - 18:00)'];
                        const isFullyBooked = blocks.every(b => (bookedSlotsForDay[b] || []).length >= 2);
                        
                        // Constraints: Disable past and today dates
                        const isPastOrToday = currentDateObj <= today;
                        const isSelected = selectedDate && dayNumber === selectedDate.getDate() && viewMonth === selectedDate.getMonth() && viewYear === selectedDate.getFullYear();

                        return (
                          <button
                            key={dayNumber}
                            disabled={isPastOrToday}
                            onClick={() => { setSelectedDate(currentDateObj); setSelectedTimeBlock(null); setSelectedPilot(null); }}
                            className={`
                              relative h-10 sm:h-12 w-full rounded-xl flex flex-col items-center justify-center text-[14px] sm:text-[15px] font-medium transition-all duration-300
                              ${isPastOrToday ? 'opacity-30 cursor-not-allowed pointer-events-none text-[#86868B] bg-neutral-800/30' : 'cursor-pointer active:scale-[0.98]'}
                              ${!isPastOrToday && !isSelected ? 'bg-[#1C1C1E] text-white hover:bg-white/10' : ''}
                              ${isSelected ? 'bg-white text-black font-medium shadow-xl' : ''}
                            `}
                          >
                            <span>{dayNumber}</span>
                            {!isPastOrToday && isFullyBooked && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#666666]"></div>}
                            {!isPastOrToday && isFullyBooked && isSelected && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#666666]"></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 2: TIME BLOCKS */}
                  <div className={`transition-all duration-500 ease-out overflow-hidden w-full ${selectedDate ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0'}`}>
                    <div className="bg-[#161616] border border-white/5 rounded-2xl p-6 lg:p-8 w-full">
                      <h3 className="text-[12px] font-medium text-[#86868B] mb-6">SAAT BLOĞU SEÇİN</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {['Sabah (09:00 - 12:00)', 'Öğlen (12:00 - 15:00)', 'Öğleden Sonra (15:00 - 18:00)'].map(block => {
                          const selectedDateStr = formatDateStr(selectedDate);
                          const bookedPilotsInBlock = bookingStats[selectedDateStr]?.[block] || [];
                          const isBlockFullyBooked = bookedPilotsInBlock.length >= 2;
                          const blockName = block.split(' (')[0];
                          const blockTime = '(' + block.split(' (')[1];

                          return (
                            <button
                              key={block}
                              onClick={() => {
                                if (isBlockFullyBooked) return showToast('Tüm pilotlar doludur.');
                                setSelectedTimeBlock(block);
                                setSelectedPilot(null); 
                              }}
                              className={`
                                w-full px-5 py-4 rounded-xl border transition-all duration-300 ease-out flex justify-between sm:justify-start lg:justify-between items-center min-h-[64px]
                                ${isBlockFullyBooked 
                                  ? 'bg-[#1C1C1E] border-transparent text-[#666666] cursor-not-allowed opacity-50' 
                                  : selectedTimeBlock === block 
                                    ? 'bg-white border-white text-black shadow-lg cursor-pointer active:scale-95' 
                                    : 'bg-[#1C1C1E] border-transparent text-white hover:bg-[#2C2C2E] cursor-pointer active:scale-[0.98]'}
                              `}
                            >
                              <div className="flex items-center">
                                <div className={`hidden sm:flex w-4 h-4 rounded-full border-[1.5px] mr-3 items-center justify-center transition-colors shrink-0
                                  ${isBlockFullyBooked ? 'border-[#666666]/30' : selectedTimeBlock === block ? 'border-black' : 'border-[#666666]'}
                                `}>
                                  {selectedTimeBlock === block && !isBlockFullyBooked && <div className="w-2 h-2 rounded-full bg-black" />}
                                </div>
                                <span className="text-[14px] font-medium truncate mr-2">{blockName}</span>
                              </div>
                              <span className={`text-[12px] whitespace-nowrap shrink-0 ${selectedTimeBlock === block ? 'opacity-80 font-medium' : 'opacity-50'}`}>{blockTime}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* STEP 3: DETAILS FORM */}
                  <div className={`transition-all duration-700 ease-out w-full ${selectedTimeBlock ? 'opacity-100 max-h-[1200px]' : 'opacity-0 max-h-0 pointer-events-none'}`}>
                    <div className="bg-[#161616] border border-white/5 rounded-2xl p-6 lg:p-8 w-full">
                      <h3 className="text-[12px] font-medium text-[#86868B] mb-6">DETAYLARI GİRİN</h3>
                      <form onSubmit={handleSubmit} className="space-y-6 w-full">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 w-full">
                          <div className="w-full">
                            <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">Portföy Konumu</label>
                            <input type="text" value={locationStr} onChange={(e) => setLocationStr(e.target.value)} placeholder="Folkart Towers, B Kule" className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/20 transition-all text-[14px] cursor-pointer" />
                          </div>
                          <div className="w-full">
                            <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">Portföy Türü</label>
                            <input type="text" value={portfolioType} onChange={(e) => setPortfolioType(e.target.value)} placeholder="3+1 Lüks Daire" className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/20 transition-all text-[14px] cursor-pointer" />
                          </div>
                        </div>

                        <div className="w-full">
                          <label className="block text-[12px] font-medium text-[#86868B] mb-2 ml-1">Çekim Açıklaması</label>
                          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Geniş açı lens kullanılmalı..." className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666666] rounded-xl p-4 h-32 resize-none focus:outline-none focus:border-white/20 transition-all text-[14px] custom-scrollbar cursor-pointer" />
                        </div>

                        <div className="w-full">
                          <label className="block text-[12px] font-medium text-[#86868B] mb-3 ml-1">Medya Sorumlusu (Pilot)</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {['FATİMA BAYRAMOVA', 'MEHMET SELİM İDİZ'].map(pilot => {
                              const isPilotBooked = selectedTimeBlock && bookingStats[formatDateStr(selectedDate)]?.[selectedTimeBlock]?.includes(pilot);

                              return (
                                <button
                                  key={pilot}
                                  type="button"
                                  disabled={isPilotBooked}
                                  onClick={() => setSelectedPilot(pilot)}
                                  className={`w-full flex items-center p-4 rounded-xl transition-all duration-300 text-left
                                    ${isPilotBooked 
                                      ? 'bg-[#1C1C1E] opacity-40 cursor-not-allowed' 
                                      : selectedPilot === pilot 
                                        ? 'bg-white shadow-lg cursor-pointer active:scale-[0.98]' 
                                        : 'bg-[#1C1C1E] hover:bg-[#2C2C2E] cursor-pointer active:scale-[0.98]'}
                                  `}
                                >
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 shrink-0 ${selectedPilot === pilot ? 'bg-[#F2F2F7]' : 'bg-[#2C2C2E]'}`}>
                                    <User className={`w-4 h-4 ${selectedPilot === pilot ? 'text-black' : 'text-white'}`} />
                                  </div>
                                  <div>
                                    <p className={`text-[14px] font-medium ${selectedPilot === pilot ? 'text-black' : 'text-white'}`}>{pilot}</p>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div className="pt-4 w-full">
                          <button
                            type="submit"
                            disabled={!isFormValid || isSubmitting}
                            className={`w-full py-4 rounded-xl font-medium text-[15px] transition-all duration-300 ease-out flex justify-center
                              ${isFormValid ? 'bg-white text-black hover:bg-gray-200 active:scale-[0.98] cursor-pointer' : 'bg-[#1C1C1E] text-[#666666] cursor-not-allowed'}`}
                          >
                            {isSubmitting ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : "Randevu Talebi Gönder"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                {/* ARCHIVE COMPONENT FOR CONSULTANT */}
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