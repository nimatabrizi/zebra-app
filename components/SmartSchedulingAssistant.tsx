'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Sparkles,
  Wind,
  X,
} from 'lucide-react';
import type { Appointment } from '../types/appointments';
import { normalizeAppointmentStatus } from '../lib/appointmentUtils';
import { toTitleCaseName } from '../lib/formatName';
import {
  getBusyDatesInMonth,
  getDayAgenda,
  getSameDistrictConfirmedDates,
} from '../lib/smartScheduling';
import {
  fetchLocationForecast,
  getDayFromForecast,
  type WeatherByDate,
} from '../lib/weather';

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const WEEK_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function formatDateStr(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getFullYear()}`;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOffset(month: number, year: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function statusAccent(status: unknown): string {
  const n = normalizeAppointmentStatus(status);
  if (n === 'kesinlesti') return 'text-[#34C759] border-[#34C759]/25 bg-[#34C759]/08';
  if (n === 'danisman_onayi_bekliyor') return 'text-[#E5B540] border-[#E5B540]/25 bg-[#E5B540]/08';
  return 'text-[#86868B] border-white/10 bg-white/[0.03]';
}

function shortStatusLabel(status: unknown): string {
  const n = normalizeAppointmentStatus(status);
  if (n === 'kesinlesti') return 'Kesinleşti';
  if (n === 'danisman_onayi_bekliyor') return 'Onay Bekliyor';
  if (n === 'pilot_bekleniyor') return 'Pilot Bekliyor';
  if (n === 'iptal') return 'İptal';
  return String(status ?? '');
}

export type SmartSchedulingAssistantProps = {
  open: boolean;
  onClose: () => void;
  targetIl?: string | null;
  targetIlce?: string | null;
  pilotName?: string | null;
  appointments: Appointment[];
  selectedIso: string;
  onSelectDate: (iso: string) => void;
  month: number;
  year: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

export default function SmartSchedulingAssistant({
  open,
  onClose,
  targetIl,
  targetIlce,
  pilotName,
  appointments,
  selectedIso,
  onSelectDate,
  month,
  year,
  onPrevMonth,
  onNextMonth,
}: SmartSchedulingAssistantProps) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [weatherByDate, setWeatherByDate] = useState<WeatherByDate>({});

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !targetIl) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLocationForecast(targetIl, targetIlce);
        if (!cancelled) setWeatherByDate(data || {});
      } catch {
        if (!cancelled) setWeatherByDate({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, targetIl, targetIlce]);

  const selectedWeather = useMemo(() => {
    try {
      return getDayFromForecast(weatherByDate, selectedIso);
    } catch {
      return null;
    }
  }, [weatherByDate, selectedIso]);

  const sameDistrictDates = useMemo(
    () =>
      getSameDistrictConfirmedDates(
        appointments,
        targetIl,
        targetIlce,
        pilotName
      ),
    [appointments, targetIl, targetIlce, pilotName]
  );

  const busyDates = useMemo(
    () => getBusyDatesInMonth(appointments, month, year, pilotName),
    [appointments, month, year, pilotName]
  );

  const selectedDisplay = useMemo(() => {
    if (!selectedIso || !/^\d{4}-\d{2}-\d{2}$/.test(selectedIso)) return '';
    const [y, m, d] = selectedIso.split('-').map(Number);
    return formatDateStr(new Date(y, m - 1, d));
  }, [selectedIso]);

  const dayAgenda = useMemo(
    () => getDayAgenda(appointments, selectedDisplay, pilotName),
    [appointments, selectedDisplay, pilotName]
  );

  const selectedIsSameDistrict =
    selectedDisplay !== '' && sameDistrictDates.has(selectedDisplay);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Akıllı Planlama Asistanı"
    >
      <div className="absolute inset-0 bg-[#0A0A0A]/60 backdrop-blur-md" />
      <div
        className="relative z-10 w-full sm:max-w-[860px] h-[min(96dvh,960px)] sm:h-auto sm:max-h-[min(92vh,680px)] flex flex-col bg-[#161616] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-zebra overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — sabit */}
        <div className="px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-5 pb-3 sm:pb-4 border-b border-white/5 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-2 sm:mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-[#E5B540] shrink-0" />
                <h3 className="text-[15px] font-medium tracking-tight text-white">
                  Akıllı Planlama
                </h3>
              </div>
              <p className="text-[12px] text-[#86868B] leading-relaxed">
                {targetIlce
                  ? `${targetIlce} için lojistik olarak uygun günleri vurguluyoruz.`
                  : 'Güne tıklayarak ajandanızı görün ve tarih seçin.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-[#86868B] hover:text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95 shrink-0"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-[#86868B]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5B540] shadow-[0_0_6px_rgba(229,181,64,0.7)]" />
              Aynı bölge
            </span>
          </div>
        </div>

        {/* Kaydırılabilir gövde — mobilde tek scroll */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex flex-col md:flex-row md:min-h-full">
            {/* Calendar */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 md:w-[380px] md:shrink-0 md:border-r border-white/5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[14px] font-medium tracking-tight text-white">
                  {MONTH_NAMES[month]} {year}
                </h4>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onPrevMonth}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"
                    aria-label="Önceki ay"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onNextMonth}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"
                    aria-label="Sonraki ay"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEK_DAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-[10px] font-medium text-[#86868B] uppercase tracking-wide py-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOffset(month, year) }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-[52px] sm:h-[56px]" />
                ))}
                {Array.from({ length: daysInMonth(month, year) }).map((_, i) => {
                  const dayNumber = i + 1;
                  const dateObj = new Date(year, month, dayNumber);
                  dateObj.setHours(0, 0, 0, 0);
                  const display = formatDateStr(dateObj);
                  const iso = toIsoDate(dateObj);
                  const isSelected = selectedIso === iso;
                  const isToday = dateObj.getTime() === today.getTime();
                  const isPast = dateObj < today;
                  const isSameDistrict = sameDistrictDates.has(display);
                  const isBusy = busyDates.has(display);
                  const dayWx = weatherByDate[iso];
                  const tipParts = [
                    isSameDistrict ? `Aynı bölge — ${targetIlce || ''}` : '',
                    dayWx
                      ? `${dayWx.label} · Rüzgar maks ${Math.round(dayWx.windMaxKmh)} km/s`
                      : '',
                  ].filter(Boolean);

                  return (
                    <button
                      key={`day-${dayNumber}`}
                      type="button"
                      disabled={isPast}
                      title={tipParts.length ? tipParts.join(' · ') : undefined}
                      onClick={() => onSelectDate(iso)}
                      className={`
                        h-[52px] sm:h-[56px] w-full rounded-xl flex flex-col items-center justify-center gap-[3px] px-0.5
                        text-[13px] font-medium transition-all duration-200 active:scale-[0.97]
                        ${isPast ? 'opacity-30 cursor-not-allowed text-[#86868B] bg-neutral-800/30' : 'cursor-pointer'}
                        ${!isPast && !isSelected && !isSameDistrict ? 'bg-[#1C1C1E] text-white hover:bg-white/10' : ''}
                        ${!isPast && !isSelected && isSameDistrict ? 'bg-[#E5B540]/12 text-white ring-1 ring-[#E5B540]/45 hover:bg-[#E5B540]/18' : ''}
                        ${isToday && !isSelected && !isPast && !isSameDistrict ? 'ring-1 ring-white/15' : ''}
                        ${isSelected ? 'bg-white text-black font-semibold shadow-xl' : ''}
                      `}
                    >
                      {/* 1) Gün */}
                      <span className="leading-none tabular-nums">{dayNumber}</span>
                      {/* 2) Hava — sabit yükseklik */}
                      <span
                        className={`h-[12px] flex items-center justify-center text-[10px] leading-none select-none ${isSelected ? 'opacity-55' : 'opacity-45'}`}
                        aria-hidden
                      >
                        {!isPast && dayWx ? dayWx.emoji : '\u00a0'}
                      </span>
                      {/* 3) Durum noktası — sabit yükseklik, ortalı */}
                      <span className="h-[6px] flex items-center justify-center" aria-hidden>
                        {!isPast && (isSameDistrict || isBusy) ? (
                          isSameDistrict ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#E5B540] shadow-[0_0_4px_rgba(229,181,64,0.8)]" />
                          ) : (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-black/35' : 'bg-white/40'}`}
                            />
                          )
                        ) : (
                          <span className="w-1.5 h-1.5" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Agenda */}
            <div className="flex-1 border-t md:border-t-0 border-white/5 px-4 sm:px-6 py-4 flex flex-col min-h-[200px]">
              <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-3 shrink-0">
                Günlük ajanda
              </p>

              {!selectedDisplay ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center px-2 py-8">
                  <div className="w-12 h-12 rounded-full bg-[#1C1C1E] border border-white/5 flex items-center justify-center mb-3">
                    <CalendarDays className="w-5 h-5 text-[#86868B]" strokeWidth={1.5} />
                  </div>
                  <p className="text-[13px] text-white font-medium mb-1">Günlük ajanda</p>
                  <p className="text-[12px] text-[#86868B] leading-relaxed max-w-[260px]">
                    Bir güne dokunun — kesinleşmiş ve danışman kesinleştirmesi bekleyen çekimleri görün.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide">
                        {selectedDisplay}
                      </p>
                      <p className="text-[14px] text-white mt-0.5 font-medium">
                        {dayAgenda.length === 0
                          ? 'Boş gün'
                          : `${dayAgenda.length} randevu`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0 max-w-[55%]">
                      {selectedIsSameDistrict && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium uppercase tracking-wide bg-[#E5B540]/15 text-[#E5B540] border border-[#E5B540]/25">
                          <MapPin className="w-3 h-3" />
                          Aynı Bölge
                        </span>
                      )}
                      {selectedWeather && (
                        <span
                          title={`${selectedWeather.label} · Maks. rüzgar ${Math.round(selectedWeather.windMaxKmh)} km/s`}
                          className="inline-flex flex-wrap items-center justify-end gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.04] border border-white/5 text-[#86868B]"
                        >
                          <span className="opacity-70 text-[13px] leading-none">
                            {selectedWeather.emoji}
                          </span>
                          <span className="text-white/65">{selectedWeather.label}</span>
                          <span className="inline-flex items-center gap-0.5 text-white/50 tabular-nums">
                            <Wind className="w-3 h-3 opacity-60" />
                            {Math.round(selectedWeather.windMaxKmh)} km/s
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {dayAgenda.length === 0 ? (
                    <p className="text-[12px] text-[#86868B] bg-[#1C1C1E]/60 border border-white/5 rounded-xl px-4 py-3">
                      Bu günde aktif çekim yok — teklif için uygun bir seçenek.
                    </p>
                  ) : (
                    <ul className="space-y-2 pb-2">
                      {dayAgenda.map((app) => {
                        const loc =
                          [app.ilce, app.semt].filter(Boolean).join(' · ') ||
                          app.konum ||
                          'Konum yok';
                        const sameAsTarget =
                          !!targetIlce &&
                          app.ilce === targetIlce &&
                          (!targetIl || !app.il || app.il === targetIl);
                        return (
                          <li
                            key={app.id}
                            className={`rounded-xl border px-3.5 py-3 ${statusAccent(app.status)}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-white">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-[#86868B] shrink-0" />
                                    {app.saatBlok || 'Saat yok'}
                                  </span>
                                  {sameAsTarget && (
                                    <span className="text-[9px] uppercase tracking-wide text-[#E5B540] font-medium px-1.5 py-0.5 rounded bg-[#E5B540]/15 border border-[#E5B540]/20">
                                      Aynı bölge
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] text-[#86868B] mt-1.5 flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="break-words">{loc}</span>
                                </p>
                                {app.danismanIsmi && (
                                  <p className="text-[11px] text-[#666666] mt-1">
                                    {toTitleCaseName(app.danismanIsmi)}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] font-medium uppercase tracking-wide shrink-0 text-right max-w-[7.5rem] leading-snug opacity-90">
                                {shortStatusLabel(app.status)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — sabit + safe area */}
        <div className="px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/5 shrink-0 flex gap-3 bg-[#161616]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-[#1C1C1E] text-white text-[14px] font-medium hover:bg-[#2C2C2E] cursor-pointer active:scale-[0.99] transition-all"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!selectedIso}
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 disabled:opacity-40 cursor-pointer active:scale-[0.99] transition-all"
          >
            Bu Tarihi Kullan
          </button>
        </div>
      </div>
    </div>
  );
}
