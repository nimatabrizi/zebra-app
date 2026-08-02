'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Appointment } from '../../types/appointments';
import type { CalendarEvent } from '../../types/calendar';
import {
  buildCalendarEventsFromAppointments,
  buildDayMarkers,
  createNoteEvent,
  eventsForDate,
  loadNotesFromStorage,
  mergeCalendarEvents,
  migrateNotesToPrimary,
  saveNotesToStorage,
} from '../../lib/calendarEvents';
import CalendarMonthGrid from './CalendarMonthGrid';
import DayEventsModal from './DayEventsModal';

function toDateStr(date: Date) {
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getFullYear()}`;
}

type Props = {
  appointments: Appointment[];
  /** Primary persistence key (UUID tercih) */
  userKey: string;
  /** Eski / alternatif anahtarlar (isim → UUID geçişi) */
  fallbackKeys?: string[];
  showTeamAppointments?: boolean;
  fullName?: string;
  currentUserId?: string;
};

/**
 * Genel Takvim — ay ızgarası + gün modalı.
 * Randevular Supabase listesinden; notlar localStorage (sekme değişiminde kalır).
 */
export default function GlobalCalendar({
  appointments,
  userKey,
  fallbackKeys = [],
  showTeamAppointments = true,
  fullName = '',
  currentUserId = '',
}: Props) {
  const now = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState<CalendarEvent[]>([]);
  /** İlk yüklemede boş state'in localStorage'ı ezmesini engeller */
  const skipSaveRef = useRef(true);
  const fallbackKey = useMemo(
    () => [...new Set(fallbackKeys.filter(Boolean))].join('|'),
    [fallbackKeys]
  );
  const resolvedFallbacks = useMemo(
    () => (fallbackKey ? fallbackKey.split('|') : []),
    [fallbackKey]
  );

  useEffect(() => {
    if (!userKey) return;
    skipSaveRef.current = true;
    migrateNotesToPrimary(userKey, resolvedFallbacks);
    setNotes(loadNotesFromStorage(userKey, resolvedFallbacks));
  }, [userKey, fallbackKey, resolvedFallbacks]);

  useEffect(() => {
    if (!userKey) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    saveNotesToStorage(userKey, notes);
    // İsim anahtarına da yaz — UUID geçişinde kayıp olmasın
    for (const key of resolvedFallbacks) {
      if (key && key !== userKey) saveNotesToStorage(key, notes);
    }
  }, [notes, userKey, resolvedFallbacks]);

  const randevuEvents = useMemo(
    () =>
      buildCalendarEventsFromAppointments(appointments, {
        allTeam: showTeamAppointments,
        danismanIsmi: fullName,
        currentUserId,
      }),
    [appointments, showTeamAppointments, fullName, currentUserId]
  );

  const allEvents = useMemo(
    () => mergeCalendarEvents(randevuEvents, notes),
    [randevuEvents, notes]
  );

  const markers = useMemo(() => buildDayMarkers(allEvents), [allEvents]);

  const selectedDateStr = selectedDate ? toDateStr(selectedDate) : '';
  const dayEvents = useMemo(
    () => (selectedDateStr ? eventsForDate(allEvents, selectedDateStr) : []),
    [allEvents, selectedDateStr]
  );

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleAddNote = (title: string, body: string) => {
    if (!selectedDateStr) return;
    setNotes((prev) => [createNoteEvent(selectedDateStr, title, body), ...prev]);
  };

  const handleUpdateNote = (id: string, title: string, body: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              title: title.trim() || 'Not',
              body: body.trim() || null,
              updatedAt: new Date().toISOString(),
            }
          : n
      )
    );
  };

  if (!userKey) return null;

  return (
    <div className="panel-enter w-full space-y-4 sm:space-y-5">
      <div className="w-full">
        <h1 className="text-xl sm:text-2xl lg:text-[28px] font-medium tracking-tight text-white">
          Takvim
        </h1>
      </div>

      <CalendarMonthGrid
        viewMonth={viewMonth}
        viewYear={viewYear}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        markers={markers}
        selectedDate={selectedDate}
        onSelectDay={setSelectedDate}
      />

      <DayEventsModal
        open={!!selectedDate}
        date={selectedDate}
        dateStr={selectedDateStr}
        events={dayEvents}
        onClose={() => setSelectedDate(null)}
        onAddNote={handleAddNote}
        onUpdateNote={handleUpdateNote}
      />
    </div>
  );
}
