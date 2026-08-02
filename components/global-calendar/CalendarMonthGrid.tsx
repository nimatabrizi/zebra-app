'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarDayMarkers } from '../../types/calendar';

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

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday-first offset (0 = Mon) */
function firstDayOffset(month: number, year: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function toDateStr(date: Date) {
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getFullYear()}`;
}

type Props = {
  viewMonth: number;
  viewYear: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  markers: Record<string, CalendarDayMarkers>;
  selectedDate: Date | null;
  onSelectDay: (date: Date) => void;
};

/** Gün hücresi — mobilde daha büyük; md+ (masaüstü) mevcut oranlar */
const DAY_CELL =
  'h-14 sm:h-[3.75rem] md:h-12 lg:h-14 xl:h-16 2xl:h-[4.5rem]';

export default function CalendarMonthGrid({
  viewMonth,
  viewYear,
  onPrevMonth,
  onNextMonth,
  markers,
  selectedDate,
  onSelectDay,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = daysInMonth(viewMonth, viewYear);
  const offset = firstDayOffset(viewMonth, viewYear);

  return (
    <div className="w-full rounded-2xl lg:rounded-[28px] border border-white/[0.08] bg-[#161616]/70 backdrop-blur-2xl p-4 sm:p-5 md:p-5 lg:p-6 xl:p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between mb-4 sm:mb-5 lg:mb-6">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.14em] text-[#86868B] mb-0.5">
            Ay görünümü
          </p>
          <h2 className="text-[18px] sm:text-[20px] lg:text-[24px] font-medium tracking-tight text-white">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Önceki ay"
            className="w-9 h-9 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/[0.12] transition-all duration-300 ease-zebra cursor-pointer active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Sonraki ay"
            className="w-9 h-9 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/[0.12] transition-all duration-300 ease-zebra cursor-pointer active:scale-95"
          >
            <ChevronRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:gap-1.5 lg:gap-2 mb-1.5 md:mb-1">
        {WEEK_DAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-medium text-[#636366] uppercase tracking-wide py-1.5 md:py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:gap-1.5 lg:gap-2">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className={DAY_CELL} />
        ))}

        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const dateObj = new Date(viewYear, viewMonth, day);
          const dateStr = toDateStr(dateObj);
          const marker = markers[dateStr];
          const isToday =
            day === today.getDate() &&
            viewMonth === today.getMonth() &&
            viewYear === today.getFullYear();
          const isSelected =
            !!selectedDate &&
            day === selectedDate.getDate() &&
            viewMonth === selectedDate.getMonth() &&
            viewYear === selectedDate.getFullYear();

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(dateObj)}
              className={`
                relative ${DAY_CELL} w-full rounded-xl lg:rounded-2xl flex flex-col items-center justify-center
                text-[15px] md:text-[14px] lg:text-[15px] font-medium transition-all duration-300 ease-zebra cursor-pointer active:scale-[0.97]
                ${
                  isSelected
                    ? 'bg-white text-black shadow-md'
                    : isToday
                      ? 'bg-white/[0.06] text-white ring-1 ring-white/15'
                      : 'bg-[#1C1C1E]/80 text-white hover:bg-white/[0.1]'
                }
              `}
            >
              <span className="leading-none">{day}</span>
              {(marker?.hasConfirmed || marker?.hasPending || marker?.hasNote) && (
                <div className="absolute bottom-1.5 md:bottom-1 lg:bottom-2 flex items-center gap-0.5">
                  {marker.hasConfirmed && (
                    <span
                      className={`w-1 h-1 rounded-full ${
                        isSelected ? 'bg-[#34C759]' : 'bg-[#34C759]/90'
                      }`}
                    />
                  )}
                  {marker.hasPending && (
                    <span
                      className={`w-1 h-1 rounded-full ${
                        isSelected ? 'bg-[#FF9F0A]' : 'bg-[#FF9F0A]/90'
                      }`}
                    />
                  )}
                  {marker.hasNote && (
                    <span
                      className={`w-1 h-1 rounded-full ${
                        isSelected ? 'bg-[#0A0A0A]/40' : 'bg-white/45'
                      }`}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-white/[0.06] flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <LegendDot color="bg-[#34C759]" label="Kesinleşmiş çekim" />
        <LegendDot color="bg-[#FF9F0A]" label="Onay bekleyen çekim" />
        <LegendDot color="bg-white/45" label="Not" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-[12px] text-[#86868B]">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
