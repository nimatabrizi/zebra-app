'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Appointment } from '../../types/appointments';
import type { CalendarEvent } from '../../types/calendar';
import {
  buildCalendarEventsFromAppointments,
  buildDayMarkers,
  buildTeamInfoCalendarEvents,
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
  /**
   * true: noktalar ve gün listesi tüm takım.
   * false: noktalar yalnız kendi kayıtları; gün detayında diğer aktif çekimler bilgi olarak kalır.
   */
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

  const scopeOpts = useMemo(
    () => ({ danismanIsmi: fullName, currentUserId }),
    [fullName, currentUserId]
  );

  /** Gün kutusu işaretleri — yalnızca danışmanı ilgilendiren kayıtlar (+ notlar) */
  const ownRandevuEvents = useMemo(
    () =>
      buildCalendarEventsFromAppointments(appointments, {
        allTeam: showTeamAppointments,
        ...scopeOpts,
      }),
    [appointments, showTeamAppointments, scopeOpts]
  );

  /** Gün detayı — diğer danışmanların aktif çekimleri (bilgi) */
  const teamInfoEvents = useMemo(() => {
    if (showTeamAppointments) return [];
    return buildTeamInfoCalendarEvents(appointments, scopeOpts);
  }, [appointments, showTeamAppointments, scopeOpts]);

  const markerEvents = useMemo(
    () => mergeCalendarEvents(ownRandevuEvents, notes),
    [ownRandevuEvents, notes]
  );

  const dayListEvents = useMemo(() => {
    const ownAndNotes = mergeCalendarEvents(ownRandevuEvents, notes);
    if (teamInfoEvents.length === 0) return ownAndNotes;
    // Kendi kayıtları önce, takım bilgisi sonda
    return [...ownAndNotes, ...teamInfoEvents].sort((a, b) => {
      const ownRank = (ev: CalendarEvent) => (ev.isTeamInfo ? 1 : 0);
      const ra = ownRank(a);
      const rb = ownRank(b);
      if (ra !== rb) return ra - rb;
      const ta = a.time || '99:99';
      const tb = b.time || '99:99';
      if (ta !== tb) return ta.localeCompare(tb, 'tr');
      return a.title.localeCompare(b.title, 'tr');
    });
  }, [ownRandevuEvents, notes, teamInfoEvents]);

  const markers = useMemo(() => buildDayMarkers(markerEvents), [markerEvents]);

  const selectedDateStr = selectedDate ? toDateStr(selectedDate) : '';
  const dayEvents = useMemo(
    () => (selectedDateStr ? eventsForDate(dayListEvents, selectedDateStr) : []),
    [dayListEvents, selectedDateStr]
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
        <p className="text-[#86868B] mt-1.5 text-[13px] sm:text-[14px]">
          Noktalar ve notlar yalnızca size aittir. Gün detayında diğer
          danışmanların çekimleri görünür; onların talep notları gizlenir.
        </p>
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
        emptyHint="Bu tarihte kişisel kaydınız yok. Diğer danışman çekimleri varsa yalnızca konum ve saat bilgisi görünür."
      />
    </div>
  );
}
