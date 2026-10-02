'use client';

import { CircleCheckBig, Info, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';
import { useGameStore, type ToastTone } from '@/stores/useGameStore';

/** Tempo de vida do aviso na tela. */
const TOAST_DURATION = 4000;

interface ToneStyle {
  Icon: LucideIcon;
  iconClass: string;
  borderClass: string;
}

const TONE_STYLE: Record<ToastTone, ToneStyle> = {
  success: {
    Icon: CircleCheckBig,
    iconClass: 'text-neon',
    borderClass: 'border-neon/40',
  },
  error: {
    Icon: TriangleAlert,
    iconClass: 'text-danger',
    borderClass: 'border-danger/40',
  },
  info: {
    Icon: Info,
    iconClass: 'text-cyan',
    borderClass: 'border-cyan/40',
  },
};

/** Aviso flutuante único, alimentado por `pushToast` da store. */
export function Toaster() {
  const toast = useGameStore((s) => s.toast);
  const dismissToast = useGameStore((s) => s.dismissToast);
  const toastId = toast?.id;

  // Cada aviso novo reinicia a contagem (a dependência é o id, não o objeto).
  useEffect(() => {
    if (!toastId) return;
    const timer = setTimeout(() => dismissToast(), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toastId, dismissToast]);

  const tone = toast ? TONE_STYLE[toast.tone] : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] sm:inset-x-auto sm:right-6 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-sm"
    >
      {toast && tone ? (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border bg-panel-2 px-4 py-3 shadow-2xl animate-slide-up',
            tone.borderClass,
          )}
        >
          <tone.Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', tone.iconClass)} />
          <p className="min-w-0 flex-1 text-sm leading-snug text-ink break-words">{toast.message}</p>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Fechar aviso"
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-dim transition-colors duration-200 hover:bg-panel-3 hover:text-ink"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
