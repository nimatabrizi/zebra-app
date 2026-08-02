'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Check,
  NotebookPen,
  Pencil,
  Plus,
  StickyNote,
  X,
} from 'lucide-react';
import type { CalendarEvent } from '../../types/calendar';
import { formatLongDateTr } from '../../lib/calendarEvents';

type Props = {
  open: boolean;
  date: Date | null;
  dateStr: string;
  events: CalendarEvent[];
  onClose: () => void;
  onAddNote: (title: string, body: string) => void;
  onUpdateNote: (id: string, title: string, body: string) => void;
};

const STATUS_META: Record<
  CalendarEvent['status'],
  { label: string; chip: string; dot: string }
> = {
  confirmed: {
    label: 'Kesinleşmiş',
    chip: 'border-[#34C759]/25 bg-[#34C759]/10 text-[#34C759]',
    dot: 'bg-[#34C759]',
  },
  pending: {
    label: 'Onay Bekliyor',
    chip: 'border-[#FF9F0A]/25 bg-[#FF9F0A]/10 text-[#FF9F0A]',
    dot: 'bg-[#FF9F0A]',
  },
  note: {
    label: 'Not',
    chip: 'border-white/10 bg-white/[0.06] text-[#A1A1A6]',
    dot: 'bg-white/50',
  },
};

export default function DayEventsModal({
  open,
  date,
  dateStr,
  events,
  onClose,
  onAddNote,
  onUpdateNote,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setAddingNote(false);
      setNoteTitle('');
      setNoteBody('');
      setEditingId(null);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !date || !mounted) return null;

  const startEdit = (ev: CalendarEvent) => {
    if (ev.type !== 'note') return;
    setAddingNote(false);
    setEditingId(ev.id);
    setEditTitle(ev.title);
    setEditBody(ev.body || '');
  };

  const saveEdit = () => {
    if (!editingId) return;
    onUpdateNote(editingId, editTitle, editBody);
    setEditingId(null);
  };

  const submitNote = () => {
    if (!noteTitle.trim() && !noteBody.trim()) return;
    onAddNote(noteTitle.trim() || 'Not', noteBody);
    setNoteTitle('');
    setNoteBody('');
    setAddingNote(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-6 animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-modal-title"
    >
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-[#0A0A0A]/65 backdrop-blur-xl cursor-pointer"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-[520px] max-h-[min(92dvh,720px)] flex flex-col rounded-t-[28px] sm:rounded-[28px] border border-white/[0.1] bg-[#141414]/92 backdrop-blur-3xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-500 ease-zebra overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 sm:px-8 pt-5 sm:pt-7 pb-5 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[#86868B] mb-2">
                <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="text-[11px] font-medium uppercase tracking-[0.14em]">
                  Gün planı
                </span>
              </div>
              <h2
                id="day-modal-title"
                className="text-[22px] sm:text-[24px] font-medium tracking-tight text-white capitalize leading-snug"
              >
                {formatLongDateTr(date)}
              </h2>
              <p className="text-[13px] text-[#636366] mt-1.5">
                {events.length === 0
                  ? 'Bu gün için henüz kayıt yok'
                  : `${events.length} kayıt · ${dateStr}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-[#86868B] hover:text-white hover:bg-white/[0.1] transition-all duration-300 ease-zebra cursor-pointer active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setAddingNote((v) => !v);
              }}
              className={`inline-flex items-center gap-2 h-11 px-5 rounded-2xl text-[14px] font-medium transition-all duration-300 ease-zebra cursor-pointer active:scale-[0.98]
                ${
                  addingNote
                    ? 'bg-white/10 text-white border border-white/15'
                    : 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.12)]'
                }`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Not Ekle
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-8 py-5 space-y-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {addingNote && (
            <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4 sm:p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 ease-zebra">
              <div className="flex items-center gap-2 text-[#A1A1A6]">
                <NotebookPen className="w-4 h-4" strokeWidth={1.75} />
                <span className="text-[12px] font-medium uppercase tracking-[0.12em]">
                  Yeni not
                </span>
              </div>
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Başlık"
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666] rounded-xl px-4 h-12 text-[16px] sm:text-[14px] focus:outline-none focus:border-white/20 transition-colors duration-300 ease-zebra"
                autoFocus
              />
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Detay (opsiyonel)"
                rows={3}
                className="w-full bg-[#1C1C1E] border border-white/5 text-white placeholder:text-[#666] rounded-xl p-4 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-white/20 transition-colors duration-300 ease-zebra"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddingNote(false);
                    setNoteTitle('');
                    setNoteBody('');
                  }}
                  className="flex-1 h-11 rounded-xl bg-[#1C1C1E] border border-white/5 text-[14px] text-[#EDEDED] cursor-pointer transition-all duration-300 ease-zebra active:scale-[0.98]"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={submitNote}
                  disabled={!noteTitle.trim() && !noteBody.trim()}
                  className="flex-1 h-11 rounded-xl bg-white text-black text-[14px] font-medium cursor-pointer disabled:opacity-40 transition-all duration-300 ease-zebra active:scale-[0.98] inline-flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                  Kaydet
                </button>
              </div>
            </div>
          )}

          {events.length === 0 && !addingNote ? (
            <div className="py-14 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                <StickyNote className="w-5 h-5 text-[#636366]" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-medium text-white mb-1">Boş gün</p>
              <p className="text-[13px] text-[#86868B] max-w-[240px]">
                Not ekleyerek bu güne hatırlatma veya plan yazabilirsiniz.
              </p>
            </div>
          ) : (
            events.map((ev) => {
              const meta = STATUS_META[ev.status];
              const isEditing = editingId === ev.id;

              if (isEditing) {
                return (
                  <div
                    key={ev.id}
                    className="rounded-2xl border border-white/15 bg-white/[0.05] p-4 sm:p-5 space-y-3"
                  >
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl px-4 h-12 text-[16px] sm:text-[14px] focus:outline-none focus:border-white/20"
                      autoFocus
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="w-full bg-[#1C1C1E] border border-white/5 text-white rounded-xl p-4 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-white/20"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex-1 h-10 rounded-xl bg-[#1C1C1E] text-[13px] cursor-pointer"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="flex-1 h-10 rounded-xl bg-white text-black text-[13px] font-medium cursor-pointer"
                      >
                        Güncelle
                      </button>
                    </div>
                  </div>
                );
              }

              const cardClass =
                'w-full text-left rounded-2xl border border-white/[0.06] bg-[#1C1C1E]/55 p-4 sm:p-5 transition-all duration-300 ease-zebra';
              const cardBody = (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium tracking-wide ${meta.chip}`}
                      >
                        <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
                        {ev.type === 'randevu' ? 'Randevu' : 'Not'}
                      </span>
                      {ev.time && (
                        <span className="text-[12px] font-medium text-white/80 tabular-nums">
                          {ev.time}
                        </span>
                      )}
                    </div>
                    {ev.type === 'note' && (
                      <span className="shrink-0 w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#86868B]">
                        <Pencil className="w-3 h-3" strokeWidth={2} />
                      </span>
                    )}
                  </div>
                  <p className="text-[15px] font-medium text-white leading-snug">
                    {ev.title}
                  </p>
                  {ev.subtitle && (
                    <p className="text-[13px] text-[#86868B] mt-1.5 leading-relaxed">
                      {ev.subtitle}
                    </p>
                  )}
                  {ev.body && (
                    <p className="text-[13px] text-[#A1A1A6] mt-2 leading-relaxed line-clamp-3">
                      {ev.body}
                    </p>
                  )}
                  <p className="text-[11px] text-[#636366] mt-3">{meta.label}</p>
                </>
              );

              if (ev.type === 'note') {
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => startEdit(ev)}
                    className={`${cardClass} hover:bg-[#1C1C1E] hover:border-white/10 cursor-pointer active:scale-[0.99]`}
                  >
                    {cardBody}
                  </button>
                );
              }

              return (
                <div key={ev.id} className={cardClass}>
                  {cardBody}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
