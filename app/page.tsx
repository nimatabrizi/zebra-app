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
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, LayoutGrid, Briefcase, Camera, Megaphone, CalendarCheck, Building2, Globe, 
  LineChart, Map, Mail, X, ChevronDown, LogOut, ChevronLeft, ChevronRight, Clock, 
  MapPin, Image as ImageIcon, AlignLeft, User, CheckCircle2, AlertCircle, Inbox, 
  History, Bell, CheckCheck, PlayCircle, CalendarDays
} from 'lucide-react';
import { supabase } from '../supabaseClient';
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
  const [isPilot, setIsPilot] = useState(false); // YENİ: Pilot yetkisi
  
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
    if (isLoggedIn && fullName) {
      fetchNotifications();
    }
  }, [isLoggedIn, fullName]);

  const userNotifications = notifications.filter(n => n.user_id === fullName);
  const unreadCount = userNotifications.filter(n => !n.is_read).length;

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => n.user_id === fullName ? { ...n, is_read: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', fullName).eq('is_read', false);
  };

const [bookedAppointments, setBookedAppointments] = useState<any[]>([]);

  // 1. GÜNCELLEME: Veri çekme motorunu özgürleştirdik (Her yerden çağrılabilir)
  const fetchAppointments = async () => {
    const { data, error } = await supabase.from('appointments').select('*');
    if (error) {
      console.error("Veri çekme hatası:", error);
      return;
    }
    if (data) {
      const formatted = data.map((row) => {
        return {
          id: row.id.toString(),
          danismanIsmi: row.danisman_ismi,
          tarih: row.tarih,
          saatBlok: row.saat_blok,
          konum: row.konum,
          portfoyTuru: row.portfoy_turu,
          aciklama: row.aciklama,
          pilot: row.pilot,
          status: row.status,
          reddedilmeSebebi: row.reddedilme_sebebi
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

  const [currentDate] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [expandedRows, setExpandedRows] = useState([]);

  const [takvimSelectedDate, setTakvimSelectedDate] = useState(new Date());

  const formatDateStr = (date: any) => {
    if (!date) return '';
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
  };

  const showToast = (msg: any) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const bookingStats = useMemo(() => {
    const stats = {};
    bookedAppointments.forEach(app => {
      if (app.status === 'Onaylandı' || app.status === 'Bekliyor') {
        if (!stats[app.tarih]) stats[app.tarih] = {};
        if (!stats[app.tarih][app.saatBlok]) stats[app.tarih][app.saatBlok] = [];
        stats[app.tarih][app.saatBlok].push(app.pilot);
      }
    });
    return stats; 
  }, [bookedAppointments]);

const archiveAppointments = useMemo(() => {
    let filtered = [];
    if (role === 'Yönetici') {
      filtered = bookedAppointments.filter(app => app.status !== 'Bekliyor');
      if (isPilot) {
        filtered = filtered.filter(app => app.pilot === fullName); // Pilot sadece kendi geçmişini görür
      }
      // Ofis yöneticisi (Pilot olmayanlar) tüm arşivi görecek
    } else {
      filtered = bookedAppointments.filter(app => app.danismanIsmi === fullName);
    }
    return filtered.sort((a, b) => Number(b.id) - Number(a.id));
  }, [bookedAppointments, role, fullName, isPilot]);

  const selectedTakvimDateStr = formatDateStr(takvimSelectedDate);
  const takvimAppointmentsForSelectedDate = useMemo(() => {
    let filtered = bookedAppointments.filter(app => app.tarih === selectedTakvimDateStr);
    if (role === 'Yönetici') {
      if (isPilot) {
        filtered = filtered.filter(app => app.pilot === fullName); // Pilot sadece kendi takvimini görür
      }
    } else if (role !== 'Yönetici') {
      filtered = filtered.filter(app => app.danismanIsmi === fullName);
    }
    return filtered;
  }, [bookedAppointments, selectedTakvimDateStr, role, fullName, isPilot]);

  const toggleRow = (id) => setExpandedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

// 1. OTOMATİK GİRİŞ (Sistemde Kalma)
// 1. OTOMATİK GİRİŞ (Sistemde Kalma)
  useEffect(() => {
    const storedLoginStatus = localStorage.getItem('zebra_auth_status');
    const storedRole = localStorage.getItem('zebra_user_role');
    const storedUsername = localStorage.getItem('zebra_username');
    const storedFullName = localStorage.getItem('zebra_fullname'); 
    const storedIsPilot = localStorage.getItem('zebra_is_pilot'); // YENİ: Pilot hafızası
    
    if (storedLoginStatus === 'true' && storedRole && storedUsername && storedFullName) {
      setRole(storedRole);
      setUsername(storedUsername);
      setFullName(storedFullName); 
      setIsPilot(storedIsPilot === 'true'); // YENİ: Pilot bilgisini yükle
      setIsLoggedIn(true);
      setActiveTab('genel');
    }
    setIsLoading(false);
  }, []);

  // Mobil menü açıkken arkada kaydırmayı engelleme
  useEffect(() => {
    document.body.style.overflow = (isMobileMenuOpen || isNotificationOpen) ? 'hidden' : '';
    return () => document.body.style.overflow = '';
  }, [isMobileMenuOpen, isNotificationOpen]);

  // 2. AKILLI VE GÜVENLİ GİRİŞ MOTORU
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password || !role) {
        showToast("Lütfen tüm alanları doldurun.");
        return;
    }

    setIsLoading(true);

    // Şifredeki (telefon numarasındaki) boşlukları otomatik temizler
// 1. Akıllı Şifre Temizleyici: Boşluk, tire, parantez ve + işaretlerini siler
    let cleanPassword = password.replace(/[\s\-\(\)\+]/g, ''); 
    // Eğer numara 90 veya 0 ile başlıyorsa, onları silip saf 10 haneli hale getirir (Örn: 5545406168)
    if (cleanPassword.startsWith('90')) cleanPassword = cleanPassword.substring(2);
    if (cleanPassword.startsWith('0')) cleanPassword = cleanPassword.substring(1);

    // 2. Akıllı İsim Temizleyici: Baş/son boşlukları siler
    const cleanUsername = username.trim();

    // Veritabanına soruyoruz (ilike ile büyük/küçük harf duyarlılığını ortadan kaldırdık!)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', role)
      .ilike('kullanici_adi', cleanUsername) // ilike sayesinde "fatima", "FATİMA" fark etmez
      .eq('whatsapp_number', cleanPassword)
      .single();

    if (error || !data) {
      showToast("Hatalı giriş! Rol, kullanıcı adı veya şifre yanlış.");
      setIsLoading(false);
      return;
    }

    // Kapılar açıldı! Bilgileri telefona/bilgisayara güvenle kaydet
    if (rememberMe) {
      localStorage.setItem('zebra_auth_status', 'true');
      localStorage.setItem('zebra_user_role', data.role);
      localStorage.setItem('zebra_username', data.kullanici_adi);
      localStorage.setItem('zebra_is_pilot', data.is_pilot);
    }
    
setRole(data.role);
    setUsername(data.kullanici_adi); 
    setFullName(data.tam_isim); 
    setIsPilot(data.is_pilot); // YENİ: Veritabanından pilot bilgisini çek
    setIsLoggedIn(true);
    setActiveTab('genel');
    setIsLoading(false);
  };

  // 3. GÜVENLİ ÇIKIŞ
  // 3. GÜVENLİ ÇIKIŞ
  const handleLogout = () => {
    localStorage.removeItem('zebra_auth_status');
    localStorage.removeItem('zebra_user_role');
    localStorage.removeItem('zebra_username');
    localStorage.removeItem('zebra_fullname');
    localStorage.removeItem('zebra_is_pilot');
    setIsLoggedIn(false);
    setIsPilot(false); // YENİ: Çıkış yapınca pilot yetkisini sıfırla
    setIsMobileMenuOpen(false);
    setIsNotificationOpen(false);
    setActiveTab('genel');
    setUsername('');
    setPassword('');
    setRole('');
  };

  const isFormValid = selectedDate && selectedTimeBlock && locationStr && portfolioType && description && selectedPilot;

// 2. GÜNCELLEME: Form gönderildiğinde Yöneticiye bildirim atar
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsSubmitting(true);

    const payload = {
      danisman_ismi: fullName,
      tarih: formatDateStr(selectedDate),
      saat_blok: selectedTimeBlock,
      konum: locationStr,
      portfoy_turu: portfolioType,
      aciklama: description,
      pilot: selectedPilot,
      status: "Bekliyor"
    };

    const { error } = await supabase.from('appointments').insert([payload]);

    if (error) {
      console.error("Veritabanına yazarken hata oluştu:", error);
      showToast("Sistemsel bir hata oluştu, lütfen tekrar deneyin.");
      setIsSubmitting(false);
      return;
    }

    await fetchAppointments();

    // SİHİR BURADA: Yönetici Paneline kalıcı bildirim gidiyor
// SİHİR BURADA: Doğrudan seçilen Pilota kalıcı bildirim gidiyor
    await supabase.from('notifications').insert([{
      user_id: selectedPilot, 
      title: 'Yeni Çekim Talebi',
      message: `${fullName}, ${formatDateStr(selectedDate)} için sizden ${locationStr} çekimi talebinde bulundu, onayınızı bekliyor.`
    }]);
    await fetchNotifications();

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
    
    const { error } = await supabase.from('appointments').update({ status: 'Onaylandı' }).eq('id', req.id);

    if (error) {
      console.error("Onaylama hatası:", error);
      showToast("Onaylama sırasında bir hata oluştu.");
      setProcessingId(null);
      return;
    }

    await fetchAppointments(); 
    
    // Danışmana özel kalıcı bildirim veritabanına yazılıyor
    await supabase.from('notifications').insert([{
      user_id: req.danismanIsmi,
      title: 'Talebiniz Onaylandı',
      message: `${req.tarih} tarihli ${req.konum} çekim talebiniz Yönetici tarafından onaylandı.`
    }]);
    await fetchNotifications();

    setProcessingId(null);
    showToast("Çekim onaylandı. Danışmana WhatsApp üzerinden bilgi iletildi.");
  };

  // 4. GÜNCELLEME: Yönetici reddettiğinde Danışmana kalıcı bildirim atar
  const handleRejectSubmit = async (req) => {
    setProcessingId(req.id);
    
    const { error } = await supabase.from('appointments').update({ status: 'Reddedildi', reddedilme_sebebi: rejectReason }).eq('id', req.id);

    if (error) {
      console.error("Reddetme hatası:", error);
      showToast("Reddetme sırasında bir hata oluştu.");
      setProcessingId(null);
      return;
    }

    await fetchAppointments(); 
    
    // Danışmana özel kalıcı red bildirimi veritabanına yazılıyor
    await supabase.from('notifications').insert([{
      user_id: req.danismanIsmi,
      title: 'Talebiniz Reddedildi',
      message: `${req.tarih} tarihli talebiniz reddedildi. Sebep: ${rejectReason}`
    }]);
    await fetchNotifications();

    setProcessingId(null); 
    setRejectingId(null); 
    setRejectReason('');
    showToast("Talep reddedildi ve danışmana bildirildi.");
  };
  // --- APPLE HIG UI RENDERERS ---
  const getStatusBadge = (status) => {
    const baseClass = "px-3 py-1 rounded-xl text-[11px] font-medium tracking-wide uppercase border flex items-center shadow-sm shrink-0";
    switch(status) {
      case 'Bekliyor': 
        return <span className={`${baseClass} bg-[#1C1C1E] text-[#E5B540] border-[#E5B540]/20`}><div className="w-1.5 h-1.5 rounded-full bg-[#E5B540] mr-2"></div>Bekliyor</span>;
      case 'Onaylandı': 
        return <span className={`${baseClass} bg-[#1C1C1E] text-[#34C759] border-[#34C759]/20`}><div className="w-1.5 h-1.5 rounded-full bg-[#34C759] mr-2"></div>Onaylandı</span>;
      case 'Reddedildi': 
        return <span className={`${baseClass} bg-[#1C1C1E] text-[#FF3B30] border-[#FF3B30]/20`}><div className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] mr-2"></div>Reddedildi</span>;
      default: return null;
    }
  };

  const renderAppointmentRow = (app) => {
    const isExpanded = expandedRows.includes(app.id);
    const isRejected = app.status === 'Reddedildi';

    return (
      <div key={app.id} className="w-full bg-[#161616] border border-white/5 rounded-2xl transition-all duration-300 hover:border-white/10 hover:bg-[#1A1A1A] flex flex-col overflow-hidden shadow-sm">
        <div 
          className={`flex flex-col sm:flex-row justify-between sm:items-center p-6 gap-4 sm:gap-0 transition-colors ${isRejected ? 'cursor-pointer active:scale-[0.99]' : ''}`}
          onClick={() => isRejected && toggleRow(app.id)}
        >
          <div className="flex items-center space-x-6 min-w-0 flex-1">
            <div className="flex flex-col shrink-0 text-center w-16">
              <span className="text-sm font-medium text-white">{app.tarih.substring(0,5)}</span>
              <span className="text-[11px] font-medium text-[#86868B] mt-1 uppercase tracking-wide">{app.saatBlok.split(' (')[0]}</span>
            </div>
            <div className="w-px h-8 bg-white/5 mx-2 hidden sm:block"></div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[15px] font-medium text-white truncate">{app.konum}</span>
              <span className="text-[13px] text-[#86868B] truncate mt-1">
                {app.portfoyTuru} {role === 'Yönetici' ? `• Danışman: ${app.danismanIsmi}` : `• Pilot: ${app.pilot}`}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4 shrink-0 sm:ml-4 self-end sm:self-auto">
            {getStatusBadge(app.status)}
            {isRejected && (
              <div className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all duration-300 cursor-pointer active:scale-95 ${isExpanded ? 'bg-white/10 border-white/10' : 'bg-[#1C1C1E] border-white/5 hover:bg-white/5'}`}>
                <ChevronDown className={`w-4 h-4 text-[#86868B] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            )}
          </div>
        </div>

        {isRejected && (
          <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-6 pb-6 pt-1">
              <div className="bg-[#1C1C1E] border border-white/5 rounded-xl p-4 flex items-start space-x-3 shadow-inner">
                <AlertCircle className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-[#FF3B30] uppercase mb-1">Red Sebebi</p>
                  <p className="text-[14px] text-[#A1A1A6] leading-relaxed">{app.reddedilmeSebebi}</p>
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
    { id: 'takvim', label: 'Takvim', icon: CalendarDays, isEnabled: true },
    { id: 'randevu', label: 'Randevu Talebi Oluştur', icon: CalendarCheck, isEnabled: true },
    { id: 'portfoy', label: 'Portföy Havuzu', icon: Briefcase, isEnabled: false },
    { id: 'studyo', label: 'Zebra Stüdyo', icon: Camera, isEnabled: false },
    { id: 'kampanya', label: 'Kampanyalar', icon: Megaphone, isEnabled: false },
    { id: 'kurumsal', label: 'Kurumsal', icon: Building2, isEnabled: false },
    { id: 'pazar', label: 'Pazar Analiz Raporu', icon: LineChart, isEnabled: false },
  ];

  const managerMenuItems = [
    { id: 'genel', label: 'Genel Bakış', icon: LayoutGrid, isEnabled: true },
    { id: 'takvim', label: 'Takvim', icon: CalendarDays, isEnabled: true },
    { id: 'cekim', label: 'Çekim Talepleri', icon: Camera, isEnabled: true }, 
    { id: 'danisman', label: 'Danışman Talepleri', icon: User, isEnabled: false },
    { id: 'kurumsal', label: 'Kurumsal', icon: Building2, isEnabled: false },
  ];

  const currentMenuItems = role === 'Yönetici' ? managerMenuItems : consultantMenuItems;

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
             <div className="w-14 h-14 bg-gradient-to-b from-white/10 to-transparent border border-white/10 rounded-xl flex items-center justify-center mb-6 shadow-inner">
              <span className="text-white font-medium text-2xl tracking-tighter">Z</span>
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-white mb-2">Zebra Ağı</h1>
            <p className="text-[14px] text-[#86868B]">Kurumsal hesaba giriş yapın</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <select 
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`w-full appearance-none bg-[#1C1C1E] border border-white/5 rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-out cursor-pointer text-[14px] ${!role ? 'text-[#86868B]' : 'text-white'}`}
              >
                <option value="" disabled hidden>Rolünüzü seçin</option>
                <option value="Danışman" className="text-white">Danışman</option>
                <option value="Yönetici" className="text-white">Yönetici / Pilot</option>
                <option value="Broker" className="text-white">Broker</option>
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] pointer-events-none" />
            </div>

            <div className="relative">
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="E-posta veya kullanıcı adı"
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#86868B] rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-out text-[14px]"
                required
              />
            </div>

            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifre"
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#86868B] rounded-xl px-5 h-[56px] focus:outline-none focus:border-white/20 transition-all duration-300 ease-out text-[14px]"
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
  const currentHour = new Date().getHours();
  let greeting = "";
  if (currentHour >= 6 && currentHour < 12) greeting = "Günaydın";
  else if (currentHour >= 12 && currentHour < 17) greeting = "İyi günler";
  else if (currentHour >= 17 && currentHour < 22) greeting = "İyi akşamlar";
  else greeting = "İyi geceler";

  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const pendingRequests = bookedAppointments.filter(app => {
    if (app.status !== 'Bekliyor') return false;
    if (role === 'Yönetici') {
      if (isPilot) return app.pilot === fullName; // Pilot sadece kendi taleplerini görür
      return true; // Ofis personeli tüm bekleyenleri görür
    }
    return false;
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
          <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center mr-3 shadow-inner">
            <span className="text-white font-medium text-xs tracking-tighter">Z</span>
          </div>
          <span className="text-[17px] font-medium tracking-tight text-white">Zebra</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 custom-scrollbar overflow-y-auto">
          {currentMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                disabled={!item.isEnabled}
                onClick={() => { if (item.isEnabled) { setActiveTab(item.id); setIsMobileMenuOpen(false); } }}
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
                {role === 'Yönetici' ? 'YP' : 'NT'}
              </div>
              <div className="ml-3">
                <p className="text-[13px] font-medium text-white leading-none">{fullName}</p>
                <p className="text-[11px] text-[#86868B] mt-1">{role}</p>
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
            <div className="hidden md:block text-right mr-2">
              <p className="text-[13px] font-medium text-white">{todayStr}</p>
            </div>
            
            <button onClick={() => setIsNotificationOpen(true)} className="relative w-10 h-10 flex items-center justify-center text-[#86868B] hover:text-white bg-[#161616] border border-white/5 rounded-full transition-all duration-300 shadow-sm active:scale-95 cursor-pointer">
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-white rounded-full border-2 border-[#161616]"></span>}
            </button>

            {role !== 'Yönetici' && (
              <button onClick={() => setActiveTab('randevu')} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.15)]">
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
                 <div className="w-14 h-14 bg-gradient-to-b from-white/10 to-transparent border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                  <span className="text-white font-medium text-2xl tracking-tighter">Z</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">
                  {greeting}, {fullName.split(' ')[0]}.
                </h1>
                <p className="text-[#86868B] text-[15px]">Zebra Kurumsal Ağına Hoş Geldiniz.</p>
              </div>
            )}

            {/* --- TAKVİM GÖRÜNÜMÜ --- */}
            {activeTab === 'takvim' && (
              <div className="animate-in fade-in duration-700 space-y-8">
                <div className="mb-10">
                  <h1 className="text-2xl font-medium tracking-tight text-white">Takvim</h1>
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
                      
                      const bookedSlotsForDay = bookingStats[dateStr] || {};
                      const hasAppointments = Object.keys(bookedSlotsForDay).length > 0;
                      
                      const isToday = dayNumber === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                      const isSelected = takvimSelectedDate && dayNumber === takvimSelectedDate.getDate() && viewMonth === takvimSelectedDate.getMonth() && viewYear === takvimSelectedDate.getFullYear();

                      return (
                        <button
                          key={dayNumber}
                          onClick={() => setTakvimSelectedDate(currentDateObj)}
                          className={`
                            relative h-10 sm:h-12 w-full rounded-xl flex flex-col items-center justify-center text-[14px] sm:text-[15px] font-medium transition-all duration-300 cursor-pointer active:scale-[0.98]
                            ${!isSelected && !isToday ? 'bg-[#1C1C1E] text-white hover:bg-white/10' : ''}
                            ${isToday && !isSelected ? 'text-black bg-white/80 font-medium' : ''}
                            ${isSelected ? 'bg-white text-black font-medium shadow-xl' : ''}
                          `}
                        >
                          <span>{dayNumber}</span>
                          {hasAppointments && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#86868B]"></div>}
                          {hasAppointments && isSelected && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-[#86868B]"></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-8 border-t border-white/5">
                  <h3 className="text-lg font-medium text-white mb-6">{formatDateStr(takvimSelectedDate)} Randevuları</h3>
                  <div className="flex flex-col space-y-4 w-full">
                    {takvimAppointmentsForSelectedDate.length === 0 ? (
                      <p className="text-[#86868B] text-[14px]">Bu tarihte planlanan bir işlem bulunmuyor.</p>
                    ) : (
                      takvimAppointmentsForSelectedDate.map(app => renderAppointmentRow(app))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* MANAGER: PENDING REQUESTS */}
            {role === 'Yönetici' && activeTab === 'cekim' && (
              <div className="animate-in fade-in duration-700 w-full">
                <div className="mb-10">
                  <h1 className="text-3xl font-medium tracking-tight text-white">Çekim Talepleri</h1>
                  <p className="text-[#86868B] mt-2 text-[15px]">Onay bekleyen yeni talepleri inceleyin.</p>
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
            {role !== 'Yönetici' && activeTab === 'randevu' && (
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
                              ${isPastOrToday ? 'opacity-30 cursor-not-allowed pointer-events-none text-[#86868B]' : 'cursor-pointer active:scale-[0.98]'}
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