'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, EllipsisVertical, Trophy } from 'lucide-react';

import { CoverImage } from '@/components/ui/CoverImage';
import { StarRating } from '@/components/ui/StarRating';
import { statusOf } from '@/lib/games';
import { STATUS_META, STATUS_ORDER, categoryMeta, platformShort } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import { useGameProgress, useGameStore } from '@/stores/useGameStore';
import type { Game, GameStatus, UserGameProgress } from '@/types/game';

export interface GameCardProps {
  game: Game;
  priority?: boolean;
  /** Position in the grid (keyboard navigation). */
  index?: number;
  /** Only the focused card enters the Tab order (roving tabindex). */
  focusable?: boolean;
  onFocusCard?: (index: number) => void;
}

/** Long-press duration that selects the card on phones. */
const LONG_PRESS_MS = 450;

/** With no saved progress, the card goes down the same `statusOf` path as the rest of the app. */
const NO_PROGRESS: Record<string, UserGameProgress> = {};

/** Border/glow per status, since Tailwind doesn't accept classes built at runtime. */
const CARD_STATUS_CLASS: Record<GameStatus, string> = {
  beaten: 'border-neon/70 glow-neon',
  playing: 'border-cyan/60',
  backlog: 'border-gold/40',
  unplayed: 'border-line hover:border-ink-dim/50',
};

export function GameCard({ game, priority, index = 0, focusable = false, onFocusCard }: GameCardProps) {
  const progress = useGameProgress(game.id);
  const selected = useGameStore((s) => s.selection.includes(game.id));
  const selectionMode = useGameStore((s) => s.selection.length > 0);
  const toggleSelected = useGameStore((s) => s.toggleSelected);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const openGame = useGameStore((s) => s.openGame);
  const toggleBeaten = useGameStore((s) => s.toggleBeaten);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const pushToast = useGameStore((s) => s.pushToast);

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const status = statusOf(progress ? { [game.id]: progress } : NO_PROGRESS, game.id);
  const beaten = status === 'beaten';
  const accent = categoryMeta(game.category).color;
  const rating = progress?.rating ?? 0;
  // The year survives status changes (the data stays stored), but it only makes sense to show it on beaten games.
  const completedYear = beaten ? progress?.completedYear : undefined;

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // An open menu closes on Escape and on outside click (trigger and menu count as "inside").
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const applyStatus = (next: GameStatus) => {
    setGameStatus(game.id, next);
    pushToast(`${game.title} → ${STATUS_META[next].label}`, next === 'beaten' ? 'success' : 'info');
    closeMenu(true);
  };

  return (
    <article
      data-card-index={index}
      data-game-id={game.id}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${game.title}, ${game.platform}${game.releaseYear ? `, ${game.releaseYear}` : ''} — ${STATUS_META[status].label}${selected ? ', selected' : ''}`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusCard?.(index);
      }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-line bg-panel transition-all duration-200',
        'outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        CARD_STATUS_CLASS[status],
        selected && 'ring-2 ring-gold ring-offset-2 ring-offset-bg',
      )}
    >
      {/* Cover area: anchor for the floating elements and clip for the hover zoom. */}
      <div className="relative overflow-hidden">
        <button
          type="button"
          onClick={(e) => {
            // A long press already selected it: the "click" that follows doesn't open the game.
            if (longPress.current.fired) {
              longPress.current.fired = false;
              return;
            }
            // Shift+click (or any click while selection is active) selects instead of opening.
            if (e.shiftKey || selectionMode) toggleSelected(game.id);
            else openGame(game.id);
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') return;
            longPress.current.fired = false;
            longPress.current.timer = setTimeout(() => {
              longPress.current.fired = true;
              toggleSelected(game.id);
              navigator.vibrate?.(15);
            }, LONG_PRESS_MS);
          }}
          onPointerUp={() => clearTimeout(longPress.current.timer ?? undefined)}
          onPointerLeave={() => clearTimeout(longPress.current.timer ?? undefined)}
          onPointerCancel={() => clearTimeout(longPress.current.timer ?? undefined)}
          onContextMenu={(e) => {
            // The phone context menu would compete with the long press.
            if (longPress.current.fired) e.preventDefault();
          }}
          tabIndex={-1}
          aria-label={`Open details for ${game.title}`}
          className="relative block w-full text-left"
        >
          <CoverImage
            game={game}
            priority={priority}
            className="transition-transform duration-300 group-hover:scale-[1.04]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent"
          />
        </button>

        {selected && (
          <span
            aria-hidden="true"
            className="animate-pop pointer-events-none absolute bottom-1.5 left-1.5 z-10 grid size-6 place-items-center rounded-md bg-gold text-bg-deep"
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        )}

        {beaten && (
          <span
            aria-hidden="true"
            className="animate-pop pointer-events-none absolute top-1.5 left-1.5 z-10 grid size-6 place-items-center rounded-full bg-neon text-bg-deep shadow-[0_0_18px_-4px_var(--color-neon)]"
          >
            <Trophy className="size-3.5" strokeWidth={2.4} />
          </span>
        )}

        <button
          ref={triggerRef}
          type="button"
          tabIndex={focusable ? 0 : -1}
          aria-label={`Change status of ${game.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setMenuOpen((open) => !open);
          }}
          className={cn(
            'absolute top-1 right-1 z-10 grid size-8 place-items-center rounded-lg transition-colors duration-200',
            // Permanent dark background: without it the icon disappears on light covers
            // (Alex Kidd, Top Gear and a good share of SNES box art).
            'bg-bg/55 text-ink-soft backdrop-blur-sm hover:bg-bg/80 hover:text-ink',
            menuOpen && 'bg-bg/85 text-ink',
          )}
        >
          <EllipsisVertical className="size-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" />
        </button>

        {/* "Beat it!" under the thumb: always visible on phones, revealed on hover on desktop. */}
        <button
          type="button"
          aria-pressed={beaten}
          tabIndex={focusable ? 0 : -1}
          aria-label={beaten ? 'Unmark as beaten' : 'Mark as beaten'}
          title={beaten ? 'Unmark as beaten' : 'Mark as beaten'}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleBeaten(game.id);
            pushToast(
              beaten ? `${game.title} → ${STATUS_META.unplayed.label}` : `${game.title} → Beat it!`,
              beaten ? 'info' : 'success',
            );
          }}
          className={cn(
            'absolute right-1.5 bottom-1.5 z-10 grid size-8 place-items-center rounded-full border transition-all duration-200',
            beaten
              ? 'animate-pop border-neon bg-neon text-bg-deep'
              : cn(
                  'border-line bg-bg/80 text-ink-soft backdrop-blur',
                  'hover:border-neon/60 hover:text-neon active:scale-95',
                  // Hiding by WIDTH would leave the primary action invisible, but
                  // still clickable, on tablets and landscape phones, which becomes a trap
                  // (the tap turns into "beaten" instead of opening the details). The right
                  // trigger is hover capability: only mouse users see the button
                  // appear on hover.
                  '[@media(hover:hover)_and_(pointer:fine)]:opacity-0',
                  'group-hover:opacity-100 focus-visible:opacity-100',
                ),
          )}
        >
          <Check className="size-4" strokeWidth={2.6} />
        </button>
      </div>

      {/* Outside the cover so its `overflow-hidden` doesn't clip the menu on narrow cards. */}
      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Status of ${game.title}`}
          className="animate-fade-in absolute top-9 right-1 z-30 w-40 max-w-[calc(100%_-_0.5rem)] rounded-xl border border-line bg-panel-2 p-1 shadow-2xl"
        >
          {STATUS_ORDER.map((option) => {
            const meta = STATUS_META[option];
            const active = option === status;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  applyStatus(option);
                }}
                className={cn(
                  'flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors duration-200',
                  active ? 'bg-panel-3 text-ink' : 'text-ink-soft hover:bg-panel-3 hover:text-ink',
                )}
              >
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', meta.dotClass)} />
                <span className="flex-1 truncate">{meta.label}</span>
                {active && <Check aria-hidden="true" className="size-3.5 shrink-0 text-neon" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-2">
        <h3
          title={game.title}
          className={cn(
            'line-clamp-2 min-h-[1.875rem] text-xs leading-[1.25] font-medium transition-colors duration-200',
            beaten ? 'text-neon' : 'text-ink',
          )}
        >
          {game.title}
        </h3>

        <div className="mt-1 flex h-4 items-center gap-1.5">
          {game.releaseYear > 0 && <span className="text-[11px] text-ink-dim">{game.releaseYear}</span>}
          <span
            className="font-display ml-auto shrink-0 rounded border px-1 py-0.5 text-[8px] leading-none"
            style={{
              color: accent,
              borderColor: `color-mix(in oklab, ${accent} 38%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
            }}
          >
            {platformShort(game.platform)}
          </span>
        </div>

        {(rating > 0 || completedYear !== undefined) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {rating > 0 && (
              // The primitive's `size="sm"` (size-4) is too wide for the footer in a 2-column phone layout:
              // shrink the icon here, without touching StarRating.
              <StarRating value={rating} readOnly size="sm" className="gap-px [&_svg]:size-2.5" />
            )}
            {completedYear !== undefined && (
              <span className="ml-auto text-[10px] text-neon/80">Beaten in {completedYear}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
