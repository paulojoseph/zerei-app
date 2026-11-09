'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focusable elements that are actually visible inside the panel. */
function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.getClientRects().length > 0,
  );
}

/**
 * Detects "already mounted on the client" without setState in an effect: on the server
 * the snapshot is `false`, on the client it's `true`. `createPortal` can only run after that.
 */
const subscribeToNothing = () => () => {};

/**
 * Hand-made modal dialog (Radix pattern, without the dependency):
 * portal on body, scroll lock, focus trapped inside and returned on exit.
 * On phones it becomes a bottom sheet; from `sm` up it's a centered box.
 */
export function Modal({ open, onClose, children, labelledBy, className }: ModalProps) {
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Remembers whether the gesture started on the backdrop, so dragging from inside out doesn't close it. */
  const pressStartedOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Locks body scroll and compensates for the scrollbar (the page doesn't "jump").
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const current = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  // Focus: goes into the panel on open, back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const [first] = getFocusable(panel);
      (first ?? panel).focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  // Escape closes; Tab/Shift+Tab cycle only inside the panel.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const items = getFocusable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!(active instanceof HTMLElement) || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex bg-black/75 backdrop-blur-sm animate-fade-in sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const closes = pressStartedOnBackdrop.current && event.target === event.currentTarget;
        pressStartedOnBackdrop.current = false;
        if (closes) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          'fixed inset-x-0 bottom-0 w-full max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-panel shadow-2xl outline-none scrollbar-thin animate-slide-up',
          'pb-[env(safe-area-inset-bottom)]',
          'sm:relative sm:mx-auto sm:my-auto sm:max-h-[86dvh] sm:max-w-2xl sm:rounded-2xl sm:pb-0',
          className,
        )}
      >
        {/* Bottom sheet grab handle, only meaningful on phones. */}
        <div aria-hidden="true" className="flex justify-center pt-3 sm:hidden">
          <span className="h-1.5 w-11 rounded-full bg-line" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
