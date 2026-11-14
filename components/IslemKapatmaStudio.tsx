'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '../utils/supabase/client';
import {
  CONSULTANT_SHARE_OPTIONS,
  DEAL_CLOSING_TABLE,
  EMPTY_DEAL_CLOSING_INPUT,
  buildPayload,
  computeDealClosing,
  dealTypeLabel,
  downloadDealClosingPdf,
  formatTl,
  recordToInput,
  rowToRecord,
  validateDealClosing,
  type ConsultantSharePercent,
  type DealClosingInput,
  type DealClosingRecord,
  type MoneyTriple,
} from '../lib/dealClosing';

type Mode = 'form' | 'list';

type Props = {
  mode: Mode;
  userId: string;
  fullName: string;
  onNavigate: (tabId: string) => void;
  /** Liste → düzenle: form sekmesine geçince yüklenecek id */
  editId?: string | null;
  onEditIdConsumed?: () => void;
  /** Listeden düzenle isteği */
  onRequestEdit?: (id: string) => void;
};

function MoneyRow({
  label,
  money,
  emphasis,
}: {
  label: string;
  money: MoneyTriple;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3 py-2.5 border-b border-[var(--z-border)] ${
        emphasis ? 'font-medium text-[var(--z-fg)]' : 'text-[var(--z-muted)]'
      }`}
    >
      <div className="text-[13px] text-[var(--z-fg)] sm:col-span-1">{label}</div>
      <div className="text-[13px] tabular-nums sm:text-right">{formatTl(money.excl)}</div>
      <div className="text-[13px] tabular-nums sm:text-right">{formatTl(money.vat)}</div>
      <div className="text-[13px] tabular-nums sm:text-right text-[var(--z-fg)]">
        {formatTl(money.incl)}
      </div>
    </div>
  );
}

function MoneyHeader() {
  return (
    <div className="hidden sm:grid grid-cols-4 gap-3 pb-2 text-[11px] uppercase tracking-wide text-[var(--z-muted-2)]">
      <div>Kalem</div>
      <div className="text-right">KDV hariç</div>
      <div className="text-right">KDV %20</div>
      <div className="text-right">Dahil</div>
    </div>
  );
}

export default function IslemKapatmaStudio({
  mode,
  userId,
  fullName,
  onNavigate,
  editId,
  onEditIdConsumed,
  onRequestEdit,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [input, setInput] = useState<DealClosingInput>({
    ...EMPTY_DEAL_CLOSING_INPUT,
    closedAt: new Date().toISOString().slice(0, 10),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<DealClosingRecord[]>([]);
  const [consultants, setConsultants] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const computed = useMemo(() => computeDealClosing(input), [input]);

  const patch = useCallback((partial: Partial<DealClosingInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
    setError(null);
    setInfo(null);
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setInput({
      ...EMPTY_DEAL_CLOSING_INPUT,
      closedAt: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setInfo(null);
  }, []);

  const loadConsultants = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('tam_isim, role')
      .order('tam_isim');
    const names = (data || [])
      .filter((p) => {
        const r = String(p.role || '').toLocaleLowerCase('tr-TR');
        return r === 'danisman' || r === 'broker' || r === 'personel';
      })
      .map((p) => String(p.tam_isim || '').trim())
      .filter(Boolean);
    setConsultants([...new Set(names)]);
  }, [supabase]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from(DEAL_CLOSING_TABLE)
        .select('*')
        .order('closed_at', { ascending: false })
        .order('created_at', { ascending: false });
      if (qErr) throw qErr;
      setRows((data || []).map((r) => rowToRecord(r as never)));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'İşlemler yüklenemedi. Tablo migration’ı uygulanmış mı?'
      );
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [supabase]);

  const loadOne = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from(DEAL_CLOSING_TABLE)
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (qErr) throw qErr;
        if (!data) {
          setError('Kayıt bulunamadı.');
          return;
        }
        const rec = rowToRecord(data as never);
        setEditingId(rec.id);
        setInput(recordToInput(rec));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kayıt açılamadı.');
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    void loadConsultants();
  }, [loadConsultants]);

  useEffect(() => {
    if (mode === 'list') void loadList();
  }, [mode, loadList]);

  useEffect(() => {
    if (mode === 'form' && editId) {
      void loadOne(editId);
      onEditIdConsumed?.();
    }
  }, [mode, editId, loadOne, onEditIdConsumed]);

  const save = async () => {
    const v = validateDealClosing(input);
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload = buildPayload(input, userId || null, editingId);
      const { data, error: sErr } = await supabase
        .from(DEAL_CLOSING_TABLE)
        .upsert(payload)
        .select('*')
        .maybeSingle();
      if (sErr) throw sErr;
      if (data) {
        const rec = rowToRecord(data as never);
        setEditingId(rec.id);
        setInfo('Kaydedildi.');
      } else {
        setInfo('Kaydedildi.');
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Kayıt başarısız. deal_closings migration’ını kontrol edin.'
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Bu işlemi silmek istiyor musunuz?')) return;
    try {
      const { error: dErr } = await supabase
        .from(DEAL_CLOSING_TABLE)
        .delete()
        .eq('id', id);
      if (dErr) throw dErr;
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi.');
    }
  };

  if (mode === 'list') {
    return (
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
              İşlemler
            </h1>
            <p className="mt-1 text-[14px] text-[var(--z-muted)]">
              Kaydedilen işlem kapatma formları
            </p>
          </div>
          <button
            type="button"
            className="z-btn-primary px-4 py-2 text-[13px]"
            onClick={() => {
              resetForm();
              onNavigate('islem-kapatma');
            }}
          >
            Yeni işlem
          </button>
        </div>

        {error ? (
          <p className="text-[13px] text-red-600 whitespace-pre-wrap">{error}</p>
        ) : null}

        {listLoading ? (
          <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <p className="text-[14px] text-[var(--z-muted)]">Henüz kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--z-border)]">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="bg-[var(--z-hover)] text-[var(--z-muted)]">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Tarih</th>
                  <th className="px-3 py-2.5 font-medium">Tür</th>
                  <th className="px-3 py-2.5 font-medium">Danışman</th>
                  <th className="px-3 py-2.5 font-medium text-right">Toplam</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net</th>
                  <th className="px-3 py-2.5 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--z-border)] text-[var(--z-fg)]"
                  >
                    <td className="px-3 py-2.5 tabular-nums">{r.closedAt}</td>
                    <td className="px-3 py-2.5">{dealTypeLabel(r.type)}</td>
                    <td className="px-3 py-2.5">{r.consultantName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatTl(r.totalExcl)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatTl(r.netExcl)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="z-btn-ghost px-2 py-1 text-[12px]"
                          onClick={() => {
                            if (onRequestEdit) onRequestEdit(r.id);
                            else {
                              onNavigate('islem-kapatma');
                              void loadOne(r.id);
                            }
                          }}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          className="z-btn-ghost px-2 py-1 text-[12px]"
                          onClick={() =>
                            void downloadDealClosingPdf(recordToInput(r), {
                              id: r.id,
                            })
                          }
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          className="z-btn-ghost px-2 py-1 text-[12px] text-red-600"
                          onClick={() => void remove(r.id)}
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--z-fg)]">
            İşlem Kapatma
          </h1>
          <p className="mt-1 text-[14px] text-[var(--z-muted)]">
            {editingId
              ? 'Kayıt düzenleniyor'
              : `Yeni form · ${fullName || 'Kullanıcı'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="z-btn-ghost px-3 py-2 text-[13px]"
            onClick={() => onNavigate('islemler')}
          >
            İşlemler
          </button>
          {editingId ? (
            <button
              type="button"
              className="z-btn-ghost px-3 py-2 text-[13px]"
              onClick={resetForm}
            >
              Yeni form
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-[14px] text-[var(--z-muted)]">Yükleniyor…</p>
      ) : (
        <>
          {/* Tür */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['sale', 'Satılık'],
                ['rent', 'Kiralık'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => patch({ type: value })}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors ${
                  input.type === value
                    ? 'border-[var(--z-fg)] bg-[var(--z-nav-active)] text-[var(--z-fg)]'
                    : 'border-[var(--z-border)] text-[var(--z-muted)] hover:bg-[var(--z-hover)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-[12px] text-[var(--z-muted)]">
              Kapanış tarihi
              <input
                type="date"
                value={input.closedAt}
                onChange={(e) => patch({ closedAt: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
              />
            </label>
            <label className="block text-[12px] text-[var(--z-muted)]">
              Danışman
              <input
                list="deal-consultants"
                value={input.consultantName}
                onChange={(e) => patch({ consultantName: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
                placeholder="Seç veya yaz"
              />
              <datalist id="deal-consultants">
                {consultants.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="block text-[12px] text-[var(--z-muted)] sm:col-span-2">
              Adres
              <input
                type="text"
                value={input.address}
                onChange={(e) => patch({ address: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
              />
            </label>
            <label className="block text-[12px] text-[var(--z-muted)]">
              Oda sayısı
              <input
                type="text"
                value={input.roomCount}
                onChange={(e) => patch({ roomCount: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
                placeholder="3+1"
              />
            </label>
            <label className="block text-[12px] text-[var(--z-muted)]">
              m²
              <input
                type="text"
                value={input.areaSqm}
                onChange={(e) => patch({ areaSqm: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
              />
            </label>
            <label className="block text-[12px] text-[var(--z-muted)]">
              İlan no
              <input
                type="text"
                value={input.listingNo}
                onChange={(e) => patch({ listingNo: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
              />
            </label>
            <label className="block text-[12px] text-[var(--z-muted)]">
              Telefon
              <input
                type="tel"
                value={input.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                className="z-field mt-1 w-full px-3 h-11 text-[14px]"
              />
            </label>
          </div>

          {/* Fatura */}
          <div className="space-y-3">
            <label className="block text-[12px] text-[var(--z-muted)]">
              {input.type === 'rent'
                ? 'Kiracı fatura bilgileri'
                : 'Alıcı / kiracı fatura bilgileri'}
              <textarea
                value={input.buyerInvoiceInfo}
                onChange={(e) => patch({ buyerInvoiceInfo: e.target.value })}
                rows={2}
                className="z-field mt-1 w-full px-3 py-2 text-[14px]"
              />
            </label>
            {input.type === 'sale' ? (
              <label className="block text-[12px] text-[var(--z-muted)]">
                Satıcı fatura bilgileri
                <textarea
                  value={input.sellerInvoiceInfo}
                  onChange={(e) => patch({ sellerInvoiceInfo: e.target.value })}
                  rows={2}
                  className="z-field mt-1 w-full px-3 py-2 text-[14px]"
                />
              </label>
            ) : null}
          </div>

          {/* Bedeller */}
          <div className="space-y-3">
            <p className="text-[13px] font-medium text-[var(--z-fg)]">
              Hizmet bedelleri
              <span className="font-normal text-[var(--z-muted)]">
                {' '}
                · KDV hariç girin
              </span>
            </p>
            {input.type === 'sale' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-[12px] text-[var(--z-muted)]">
                  Alıcı hizmet bedeli
                  <input
                    type="text"
                    inputMode="decimal"
                    value={input.buyerFeeTl}
                    onChange={(e) => patch({ buyerFeeTl: e.target.value })}
                    className="z-field mt-1 w-full px-3 h-11 text-[14px] tabular-nums"
                    placeholder="100000"
                  />
                </label>
                <label className="block text-[12px] text-[var(--z-muted)]">
                  Satıcı hizmet bedeli
                  <input
                    type="text"
                    inputMode="decimal"
                    value={input.sellerFeeTl}
                    onChange={(e) => patch({ sellerFeeTl: e.target.value })}
                    className="z-field mt-1 w-full px-3 h-11 text-[14px] tabular-nums"
                    placeholder="100000"
                  />
                </label>
              </div>
            ) : (
              <label className="block text-[12px] text-[var(--z-muted)] max-w-md">
                Danışman hizmet bedeli
                <input
                  type="text"
                  inputMode="decimal"
                  value={input.consultantFeeTl}
                  onChange={(e) => patch({ consultantFeeTl: e.target.value })}
                  className="z-field mt-1 w-full px-3 h-11 text-[14px] tabular-nums"
                  placeholder="50000"
                />
              </label>
            )}

            <div>
              <p className="text-[12px] text-[var(--z-muted)] mb-2">
                Danışman payı oranı
              </p>
              <div className="flex flex-wrap gap-2">
                {CONSULTANT_SHARE_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      patch({
                        consultantSharePercent: p as ConsultantSharePercent,
                      })
                    }
                    className={`min-w-[56px] px-3 py-2 rounded-lg text-[13px] font-medium border ${
                      input.consultantSharePercent === p
                        ? 'border-[var(--z-fg)] bg-[var(--z-nav-active)] text-[var(--z-fg)]'
                        : 'border-[var(--z-border)] text-[var(--z-muted)] hover:bg-[var(--z-hover)]'
                    }`}
                  >
                    %{p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Özet */}
          <div className="rounded-xl border border-[var(--z-border)] px-4 py-3">
            <p className="text-[13px] font-medium text-[var(--z-fg)] mb-2">
              Otomatik hesap
            </p>
            <MoneyHeader />
            {input.type === 'sale' && computed.buyerFee ? (
              <MoneyRow label="Alıcı hizmet bedeli" money={computed.buyerFee} />
            ) : null}
            {input.type === 'sale' && computed.sellerFee ? (
              <MoneyRow
                label="Satıcı hizmet bedeli"
                money={computed.sellerFee}
              />
            ) : null}
            {input.type === 'rent' && computed.consultantFee ? (
              <MoneyRow
                label="Danışman hizmet bedeli"
                money={computed.consultantFee}
              />
            ) : null}
            <MoneyRow label="Toplam hizmet bedeli" money={computed.total} emphasis />
            <MoneyRow label="Royalty (%9)" money={computed.royalty} />
            <MoneyRow label="Kalan net tutar" money={computed.net} emphasis />
            <MoneyRow
              label={`Danışman payı (%${input.consultantSharePercent})`}
              money={computed.consultantShare}
              emphasis
            />
            <MoneyRow label="Ofis payı" money={computed.officeShare} emphasis />
          </div>

          <label className="block text-[12px] text-[var(--z-muted)]">
            Not
            <textarea
              value={input.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
              className="z-field mt-1 w-full px-3 py-2 text-[14px]"
            />
          </label>

          {error ? (
            <p className="text-[13px] text-red-600 whitespace-pre-wrap">{error}</p>
          ) : null}
          {info ? (
            <p className="text-[13px] text-emerald-700">{info}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="z-btn-primary px-5 py-2.5 text-[13px] disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : editingId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button
              type="button"
              className="z-btn-ghost px-4 py-2.5 text-[13px]"
              onClick={() =>
                void downloadDealClosingPdf(input, {
                  id: editingId || undefined,
                })
              }
            >
              PDF indir
            </button>
          </div>
        </>
      )}
    </section>
  );
}
