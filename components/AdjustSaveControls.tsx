'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, RotateCcw, Save } from 'lucide-react';

type DialogAction = {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'ghost' | 'danger';
  busy?: boolean;
};

function ChoiceDialog({
  title,
  body,
  actions,
  onCancel,
}: {
  title: string;
  body: string;
  actions: DialogAction[];
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-end justify-center bg-[var(--z-scrim)] sm:items-center sm:p-4"
      onClick={(event) => {
        event.stopPropagation();
        onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="z-modal zebra-sheet-enter w-full max-w-sm rounded-b-none p-5 sm:rounded-b-[inherit] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[17px] font-semibold text-[var(--z-fg)]">{title}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--z-muted)]">{body}</p>
        <div className="mt-6 flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.busy}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 px-4 text-[13px] disabled:opacity-60 ${
                action.tone === 'primary'
                  ? 'z-btn-primary'
                  : action.tone === 'danger'
                    ? 'z-btn-ghost text-[var(--z-danger)]'
                    : 'z-btn-ghost'
              }`}
            >
              {action.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] text-[13px] text-[var(--z-muted)] hover:text-[var(--z-fg)]"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Düzenleyiciyi kapatırken kaydedilmemiş değişiklik varsa sorar.
 * `dirty` yalnızca kaydetme yetkisi olan kullanıcıda true verilmeli.
 */
export function useUnsavedChangesGuard({
  dirty,
  onSave,
  onClose,
}: {
  dirty: boolean;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  const requestClose = () => {
    if (dirty) setAsking(true);
    else onClose();
  };

  const dialog = asking ? (
    <ChoiceDialog
      title="Kaydedilmemiş değişiklikler var"
      body="Bu ayarları kaydederseniz görsel bundan sonra hep bu konum ve boyutla üretilir."
      onCancel={() => setAsking(false)}
      actions={[
        {
          label: 'Kaydet ve kapat',
          tone: 'primary',
          busy: saving,
          onClick: async () => {
            setSaving(true);
            try {
              await onSave();
              setAsking(false);
              onClose();
            } catch (error) {
              alert(error instanceof Error ? error.message : 'Kaydedilemedi');
            } finally {
              setSaving(false);
            }
          },
        },
        {
          label: 'Kaydetmeden kapat',
          tone: 'danger',
          onClick: () => {
            setAsking(false);
            onClose();
          },
        },
      ]}
    />
  ) : null;

  return { requestClose, dialog };
}

/**
 * Düzenleyicide "Değişiklikleri kaydet" + "Varsayılana dön" düğmeleri.
 * Kayıtlı ayar varken sıfırlama, yalnızca ekranı mı yoksa kaydı da mı sıfırlayacağını sorar.
 */
export function AdjustSaveActions({
  canSave,
  dirty,
  hasSaved,
  onSave,
  onResetScreen,
  onDeleteSaved,
  resetLabel = 'Varsayılana dön',
  className = '',
}: {
  canSave: boolean;
  dirty: boolean;
  hasSaved: boolean;
  onSave: () => Promise<void>;
  onResetScreen: () => void;
  onDeleteSaved: () => Promise<void>;
  resetLabel?: string;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setJustSaved(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (canSave && hasSaved) setResetOpen(true);
    else onResetScreen();
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {canSave ? (
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="z-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : justSaved && !dirty ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {justSaved && !dirty ? 'Kaydedildi' : 'Değişiklikleri kaydet'}
        </button>
      ) : (
        <p className="text-[11px] leading-relaxed text-[var(--z-muted)]">
          Ayarları kaydetme yetkiniz yok; yaptığınız değişiklikler yalnızca bu indirme için geçerli.
        </p>
      )}
      <button
        type="button"
        onClick={handleReset}
        className="z-btn-ghost inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px]"
      >
        <RotateCcw className="h-3.5 w-3.5" /> {resetLabel}
      </button>

      {resetOpen ? (
        <ChoiceDialog
          title="Neyi sıfırlayalım?"
          body="Bu görsel için kayıtlı bir ayar var. Yalnızca ekrandaki düzenlemeyi sıfırlayabilir ya da kayıtlı ayarı da silebilirsiniz."
          onCancel={() => setResetOpen(false)}
          actions={[
            {
              label: 'Sadece ekrandakini sıfırla',
              tone: 'ghost',
              onClick: () => {
                onResetScreen();
                setResetOpen(false);
              },
            },
            {
              label: 'Kayıtlı ayarı da sil',
              tone: 'danger',
              busy: deleting,
              onClick: async () => {
                setDeleting(true);
                try {
                  await onDeleteSaved();
                  setResetOpen(false);
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Silinemedi');
                } finally {
                  setDeleting(false);
                }
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}
