'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Appointment } from '../../types/appointments';
import type { CalendarEvent } from '../../types/calendar';
import {
  buildCalendarEventsFromAppointments,
  buildDayMarkers,
  eventsForDate,
  mergeCalendarEvents,
} from '../../lib/calendarEvents';
import {
  fetchCalendarNotes,
  insertCalendarNote,
  migrateLocalNotesToSupabase,
  updateCalendarNote,
} from '../../lib/calendarNotesApi';
import CalendarMonthGrid from './CalendarMonthGrid';
import DayEventsModal from './DayEventsModal';

function toDateStr(date: Date) {
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getFullYear()}`;
}

type Props = {
  appointments: Appointment[];
  /** auth.users / session UUID */
  userKey: string;
  showTeamAppointments?: boolean;
  fullName?: string;
  currentUserId?: string;
};

/**
 * Genel Takvim — ay ızgarası + gün modalı.
 * Randevular + notlar Supabase'den (SQL ile sıfırlanabilir).
 */
export default function GlobalCalendar({
  appointments,
  userKey,
  showTeamAppointments = true,
  fullName = '',
  currentUserId = '',
}: Props) {
  const now = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!userKey) return;
    let cancelled = false;
    (async () => {
      await migrateLocalNotesToSupabase(userKey);
      const loaded = await fetchCalendarNotes(userKey);
      if (!cancelled) setNotes(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [userKey]);

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

  const handleAddNote = async (title: string, body: string) => {
    if (!selectedDateStr || !userKey) return;
    const created = await insertCalendarNote(
      userKey,
      selectedDateStr,
      title,
      body
    );
    if (created) setNotes((prev) => [created, ...prev]);
  };

  const handleUpdateNote = async (id: string, title: string, body: string) => {
    const updated = await updateCalendarNote(id, title, body);
    if (updated) {
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    }
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
