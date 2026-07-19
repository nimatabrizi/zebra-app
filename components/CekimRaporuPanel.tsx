'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Info,
  LineChart,
  X,
} from 'lucide-react';
import {
  formatDateStr,
  isConfirmedStatus,
  isRejectedStatus,
  ownerRoleDisplayName,
  ownerRoleFromPilot,
  parseDisplayDate,
} from '../lib/appointmentUtils';
import { manualEntryDisplayName } from '../lib/authIdentity';

type Appointment = {
  id: string;
  danismanIsmi?: string;
  tarih: string;
  saatBlok?: string;
  konum?: string;
  portfoyTuru?: string;
  aciklama?: string;
  pilot?: string;
  ownerRole?: string;
  owner?: string;
  status: string;
  reddedilmeSebebi?: string;
  isManual?: boolean;
  createdByRole?: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const baseClass =
    'px-3 py-1 rounded-xl text-[11px] font-medium tracking-wide uppercase border flex items-center shadow-sm shrink-0';
  if (status === 'Bekliyor' || status === 'pending') {
    return (
      <span className={`${baseClass} bg-[#1C1C1E] text-[#E5B540] border-[#E5B540]/20`}>
        <div className="w-1.5 h-1.5 rounded-full bg-[#E5B540] mr-2" />
        Bekliyor
      </span>
    );
  }
  if (status === 'Onaylandı' || status === 'confirmed' || status === 'approved') {
    return (
      <span className={`${baseClass} bg-[#1C1C1E] text-[#34C759] border-[#34C759]/20`}>
        <div className="w-1.5 h-1.5 rounded-full bg-[#34C759] mr-2" />
        Onaylandı
      </span>
    );
  }
  if (status === 'Reddedildi' || status === 'rejected') {
    return (
      <span className={`${baseClass} bg-[#1C1C1E] text-[#FF3B30] border-[#FF3B30]/20`}>
        <div className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] mr-2" />
        Reddedildi
      </span>
    );
  }
  return null;
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

type Props = {
  appointments: Appointment[];
};

export default function CekimRaporuPanel({ appointments }: Props) {
  const [reportMode, setReportMode] = useState<'weekly' | 'monthly'>('weekly');
  const [reportPilot, setReportPilot] = useState<'all' | 'fatima' | 'selim'>('all');
  const [reportDetailAppointment, setReportDetailAppointment] = useState<Appointment | null>(null);
  const [reportRefDate, setReportRefDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    if (reportDetailAppointment) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [reportDetailAppointment]);

  const shiftReportPeriod = (direction: number) => {
    setReportRefDate((prev) => {
      const next = new Date(prev);
      if (reportMode === 'weekly') {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setMonth(next.getMonth() + direction);
      }
      return next;
    });
  };

  const reportRange = useMemo(() => {
    if (reportMode === 'weekly') {
      return { start: startOfWeekMonday(reportRefDate), end: endOfWeekSunday(reportRefDate) };
    }
    const start = new Date(reportRefDate.getFullYear(), reportRefDate.getMonth(), 1);
    const end = new Date(reportRefDate.getFullYear(), reportRefDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, [reportMode, reportRefDate]);

  const reportRangeLabel = useMemo(() => {
    const { start, end } = reportRange;
    if (reportMode === 'weekly') {
      return `${formatDateStr(start)} – ${formatDateStr(end)}`;
    }
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ];
    return `${months[start.getMonth()]} ${start.getFullYear()}`;
  }, [reportRange, reportMode]);

  const cekimRaporu = useMemo(() => {
    const { start, end } = reportRange;

    const confirmed = appointments.filter((app) => {
      if (!isConfirmedStatus(app.status)) return false;
      const d = parseDisplayDate(app.tarih);
      if (!d) return false;
      return d >= start && d <= end;
    });

    const withOwner = confirmed.map((app) => ({
      ...app,
      owner: app.ownerRole || ownerRoleFromPilot(app.pilot || ''),
    }));

    const fatimaAll = withOwner.filter((a) => a.owner === 'fatima');
    const selimAll = withOwner.filter((a) => a.owner === 'selim');

    let rows = withOwner;
    if (reportPilot === 'fatima') rows = fatimaAll;
    else if (reportPilot === 'selim') rows = selimAll;

    rows = [...rows].sort((a, b) => {
      const da = parseDisplayDate(a.tarih)?.getTime() || 0;
      const db = parseDisplayDate(b.tarih)?.getTime() || 0;
      return da - db || Number(a.id) - Number(b.id);
    });

    return {
      rows,
      total: withOwner.length,
      fatimaCount: fatimaAll.length,
      selimCount: selimAll.length,
      filteredCount: rows.length,
    };
  }, [appointments, reportRange, reportPilot]);

  return (
    <>
      <div className="animate-in fade-in duration-700 space-y-8 w-full">
        <div className="mb-2">
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white flex items-center">
            <LineChart className="w-6 h-6 mr-3 text-white/70" />
            Çekim Raporu
          </h1>
          <p className="text-[#86868B] mt-2 text-[14px]">
            Yalnızca onaylanmış çekimler. Haftalık veya aylık özet.
          </p>
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-6">
          <div className="inline-flex p-1 rounded-xl bg-[#1C1C1E] border border-white/5 self-start">
            <button
              type="button"
              onClick={() => setReportMode('weekly')}
              className={`px-4 h-10 rounded-lg text-[13px] font-medium transition-all cursor-pointer active:scale-[0.98]
                ${reportMode === 'weekly' ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-white'}`}
            >
              Haftalık
            </button>
            <button
              type="button"
              onClick={() => setReportMode('monthly')}
              className={`px-4 h-10 rounded-lg text-[13px] font-medium transition-all cursor-pointer active:scale-[0.98]
                ${reportMode === 'monthly' ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-white'}`}
            >
              Aylık
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#161616] border border-white/5 rounded-xl px-2 py-1.5 self-start">
            <button
              type="button"
              onClick={() => shiftReportPeriod(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"
              title="Önceki dönem"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-[160px] sm:min-w-[200px] text-center px-2">
              <p className="text-[13px] font-medium text-white tracking-tight">{reportRangeLabel}</p>
              <p className="text-[10px] text-[#86868B] uppercase tracking-wide mt-0.5">
                {reportMode === 'weekly' ? 'Hafta' : 'Ay'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => shiftReportPeriod(1)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1C1C1E] text-white hover:bg-[#2C2C2E] transition-colors cursor-pointer active:scale-95"
              title="Sonraki dönem"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="inline-flex flex-wrap p-1 rounded-xl bg-[#1C1C1E] border border-white/5 gap-0.5">
            {[
              { id: 'all' as const, label: 'Tümü' },
              { id: 'fatima' as const, label: 'Fatima Bayramova' },
              { id: 'selim' as const, label: 'Mehmet Selim İdiz' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setReportPilot(opt.id)}
                className={`px-3 sm:px-4 h-10 rounded-lg text-[12px] sm:text-[13px] font-medium transition-all cursor-pointer active:scale-[0.98]
                  ${reportPilot === opt.id ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-white'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {reportPilot === 'all' ? (
            <>
              <div className="bg-[#161616] border border-white/5 rounded-2xl p-5 sm:p-6">
                <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide">
                  {reportMode === 'weekly' ? 'Bu Hafta' : 'Bu Ay'} Toplam Çekim
                </p>
                <p className="text-3xl font-medium tracking-tight text-white mt-3 tabular-nums">
                  {cekimRaporu.total}
                </p>
              </div>
              <div className="bg-[#161616] border border-white/5 rounded-2xl p-5 sm:p-6">
                <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide">
                  Fatima Bayramova
                </p>
                <p className="text-3xl font-medium tracking-tight text-white mt-3 tabular-nums">
                  {cekimRaporu.fatimaCount}
                </p>
              </div>
              <div className="bg-[#161616] border border-white/5 rounded-2xl p-5 sm:p-6">
                <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide">
                  Mehmet Selim İdiz
                </p>
                <p className="text-3xl font-medium tracking-tight text-white mt-3 tabular-nums">
                  {cekimRaporu.selimCount}
                </p>
              </div>
            </>
          ) : (
            <div className="bg-[#161616] border border-white/5 rounded-2xl p-5 sm:p-6 sm:col-span-3">
              <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide">
                {reportPilot === 'fatima' ? 'Fatima Bayramova' : 'Mehmet Selim İdiz'}{' '}
                {reportMode === 'weekly' ? 'Bu Haftaki' : 'Bu Ayki'} Çekim Sayısı
              </p>
              <p className="text-3xl font-medium tracking-tight text-white mt-3 tabular-nums">
                {cekimRaporu.filteredCount}
              </p>
            </div>
          )}
        </div>

        <div className="bg-[#161616] border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-[14px] font-medium text-white">Onaylı Çekimler</h3>
            <span className="text-[12px] text-[#86868B] tabular-nums">{cekimRaporu.rows.length} kayıt</span>
          </div>

          {cekimRaporu.rows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-[14px] text-[#86868B]">Bu dönemde onaylanmış çekim yok.</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[480px] text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-5 sm:px-6 py-3.5 text-[11px] font-medium text-[#86868B] uppercase tracking-wide">Tarih</th>
                    <th className="px-5 sm:px-6 py-3.5 text-[11px] font-medium text-[#86868B] uppercase tracking-wide">Danışman</th>
                    <th className="px-5 sm:px-6 py-3.5 text-[11px] font-medium text-[#86868B] uppercase tracking-wide">Sorumlu Pilot</th>
                    <th className="px-5 sm:px-6 py-3.5 w-14" aria-label="Detay" />
                  </tr>
                </thead>
                <tbody>
                  {cekimRaporu.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 sm:px-6 py-4 text-[13px] text-white whitespace-nowrap tabular-nums">
                        {row.tarih}
                      </td>
                      <td className="px-5 sm:px-6 py-4 text-[13px] text-[#A1A1A6] whitespace-nowrap">
                        {row.danismanIsmi || '—'}
                      </td>
                      <td className="px-5 sm:px-6 py-4 text-[13px] text-neutral-400 whitespace-nowrap">
                        {ownerRoleDisplayName(row.owner) || row.pilot || '—'}
                      </td>
                      <td className="px-5 sm:px-6 py-4 text-right">
                        <button
                          type="button"
                          title="Detayları gör"
                          onClick={() => setReportDetailAppointment(row)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent text-[#666666] hover:text-[#A1A1A6] hover:bg-white/5 transition-all cursor-pointer active:scale-95"
                        >
                          <Info className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {reportDetailAppointment && (
        <div
          className="fixed inset-0 bg-[#0A0A0A]/70 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setReportDetailAppointment(null)}
        >
          <div
            className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300 ease-out max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/5 shrink-0">
              <div>
                <h2 className="text-lg font-medium tracking-tight text-white">Çekim Detayı</h2>
                <p className="text-[12px] text-[#86868B] mt-1">Salt okunur özet</p>
              </div>
              <button
                type="button"
                onClick={() => setReportDetailAppointment(null)}
                className="w-8 h-8 flex items-center justify-center text-[#86868B] hover:text-white bg-[#1C1C1E] rounded-full transition-colors active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-8 py-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-[#86868B] uppercase tracking-wide">Durum</span>
                <StatusBadge status={reportDetailAppointment.status} />
              </div>

              <div className="h-px bg-white/5" />

              {[
                { label: 'Tarih', value: reportDetailAppointment.tarih },
                { label: 'Saat Bloğu', value: reportDetailAppointment.saatBlok },
                { label: 'Portföy Konumu', value: reportDetailAppointment.konum },
                { label: 'Portföy Türü', value: reportDetailAppointment.portfoyTuru },
                { label: 'Danışman', value: reportDetailAppointment.danismanIsmi },
                {
                  label: 'Sorumlu Pilot',
                  value:
                    ownerRoleDisplayName(
                      reportDetailAppointment.owner ||
                        reportDetailAppointment.ownerRole ||
                        ownerRoleFromPilot(reportDetailAppointment.pilot || '')
                    ) || reportDetailAppointment.pilot,
                },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-1.5">
                    {item.label}
                  </p>
                  <p className="text-[15px] text-white leading-relaxed">{item.value || '—'}</p>
                </div>
              ))}

              <div>
                <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-1.5">
                  Açıklama
                </p>
                <div className="bg-[#1C1C1E] border border-white/5 rounded-xl p-4">
                  <p className="text-[14px] text-[#A1A1A6] leading-relaxed whitespace-pre-wrap">
                    {reportDetailAppointment.aciklama || 'Açıklama yok.'}
                  </p>
                </div>
              </div>

              {(isRejectedStatus(reportDetailAppointment.status) ||
                reportDetailAppointment.reddedilmeSebebi) && (
                <div>
                  <p className="text-[11px] font-medium text-[#FF3B30]/80 uppercase tracking-wide mb-1.5">
                    Red Sebebi / Not
                  </p>
                  <div className="bg-[#1A1212] border border-[#FF3B30]/15 rounded-xl p-4">
                    <p className="text-[14px] text-[#A1A1A6] leading-relaxed">
                      {reportDetailAppointment.reddedilmeSebebi || '—'}
                    </p>
                  </div>
                </div>
              )}

              {reportDetailAppointment.isManual && (
                <div>
                  <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-1.5">
                    Kayıt Türü
                  </p>
                  <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide uppercase bg-white/5 text-neutral-400 border border-white/5">
                    Manuel Giriş: {manualEntryDisplayName(reportDetailAppointment.createdByRole)}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 sm:px-8 py-5 border-t border-white/5 shrink-0">
              <button
                type="button"
                onClick={() => setReportDetailAppointment(null)}
                className="w-full h-12 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-gray-200 transition-all cursor-pointer active:scale-[0.98]"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
