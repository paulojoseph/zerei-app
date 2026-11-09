'use client';

import { Check, Clock, Flame, PartyPopper, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Button } from '@/components/ui/Button';
import { CoverImage } from '@/components/ui/CoverImage';
import { Modal } from '@/components/ui/Modal';
import { StarRating } from '@/components/ui/StarRating';
import { STATUS_META, STATUS_ORDER, categoryMeta } from '@/lib/platforms';
import { cn, currentYear, formatDate, timeAgo } from '@/lib/utils';
import { useAllGames, useGameProgress, useGameStore } from '@/stores/useGameStore';
import type { Game, GameStatus } from '@/types/game';

/** Pong is from 1972, so before that there's nothing to beat. */
const MIN_YEAR = 1972;
const NOTES_MAX = 2000;
/** Duration of the micro-celebration and the "Saved" badge. */
const CELEBRATION_MS = 1100;
const SAVED_MS = 2000;

const RATING_HINT: Record<number, string> = {
  1: "Didn't like it",
  2: 'Ok',
  3: 'Good',
  4: 'Great',
  5: 'Unforgettable',
};

/** Ring + glow in the status/generation color (colors come as hex, not classes). */
function accentRing(color: string): CSSProperties {
  return {
    boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 60%, transparent), 0 0 22px -10px ${color}`,
  };
}

const SECTION = 'border-t border-line-soft px-4 py-4 sm:px-6 sm:py-5';
const SECTION_TITLE = 'text-xs font-semibold tracking-[0.14em] text-ink-dim uppercase';
const FIELD =
  'h-11 rounded-xl border border-line bg-panel-2 px-3 text-[16px] text-ink placeholder:text-ink-dim transition-colors duration-200 focus:border-neon/60 disabled:opacity-50';

export function GameModal() {
  const selectedGameId = useGameStore((s) => s.selectedGameId);
  const closeGame = useGameStore((s) => s.closeGame);
  const games = useAllGames();

  const game = useMemo(
    () => (selectedGameId ? games.find((item) => item.id === selectedGameId) : undefined),
    [games, selectedGameId],
  );

  return (
    <Modal open={!!game} onClose={closeGame} labelledBy="game-modal-title" className="sm:max-w-3xl">
      {/* `key` remounts the content for each game: local drafts reload on their own. */}
      {game ? <GameModalContent key={game.id} game={game} /> : null}
    </Modal>
  );
}

function GameModalContent({ game }: { game: Game }) {
  const progress = useGameProgress(game.id);
  const closeGame = useGameStore((s) => s.closeGame);
  const updateProgress = useGameStore((s) => s.updateProgress);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const clearProgress = useGameStore((s) => s.clearProgress);
  const pushToast = useGameStore((s) => s.pushToast);
  const removeCustomGame = useGameStore((s) => s.removeCustomGame);

  // `new Date()` only on the client and only once, so no unstable HTML.
  const maxYear = useMemo(() => currentYear(), []);

  const meta = categoryMeta(game.category);
  const status: GameStatus = progress?.status ?? 'unplayed';
  const storedYear = progress?.completedYear;
  const storedNotes = progress?.notes ?? '';
  const rating = progress?.rating ?? 0;

  const [yearDraft, setYearDraft] = useState(storedYear ? String(storedYear) : '');
  const [notesDraft, setNotesDraft] = useState(storedNotes);
  const [celebrating, setCelebrating] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  /** Last year text already processed, so we don't save/notify twice (Enter + blur). */
  const lastYearCommit = useRef(yearDraft);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  /**
   * Closing on Escape unmounts the field that was still focused, and the browser
   * doesn't fire `blur` on an element removed from the DOM. Without this flush, a
   * freshly typed year and memory would vanish silently. The ref updates on every
   * render (effect with no deps) so the cleanup always sees the newest draft.
   */
  const flushDrafts = useRef<() => void>(undefined);
  useEffect(() => {
    flushDrafts.current = () => {
      commitYear();
      persistNotes();
    };
  });
  useEffect(() => () => flushDrafts.current?.(), []);

  /* ---------------------------------------------------------------- status */

  function handleStatus(next: GameStatus) {
    if (next === status) return;
    setGameStatus(game.id, next);

    if (next === 'beaten') {
      pushToast('Beaten! One more for the count.');
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      setCelebrating(true);
      celebrationTimer.current = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    }
  }

  /* ------------------------------------------------------------------ year */

  /**
   * The store merges `undefined` as "keep the current value", so clearing the year
   * means dropping the record and writing back the rest of the progress without it.
   */
  function clearCompletedYear() {
    if (!progress || progress.completedYear === undefined) return;
    clearProgress(game.id);
    updateProgress(game.id, {
      status: progress.status,
      rating: progress.rating,
      notes: progress.notes,
    });
  }

  function commitYear() {
    const raw = yearDraft.trim();
    if (raw === lastYearCommit.current) return;
    lastYearCommit.current = raw;

    if (!raw) {
      clearCompletedYear();
      return;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > maxYear) {
      pushToast(`Enter a year between ${MIN_YEAR} and ${maxYear}.`, 'error');
      return; // out of range doesn't save; the text stays there for the user to fix
    }

    const completedYear = parsed;
    updateProgress(game.id, { completedYear });
  }

  function fillCurrentYear() {
    const text = String(maxYear);
    setYearDraft(text);
    lastYearCommit.current = text;
    updateProgress(game.id, { completedYear: maxYear });
  }

  /* ----------------------------------------------------------------- notes */

  /** Saves the notes if they changed. Returns `true` when something was written. */
  function persistNotes(): boolean {
    const notes = notesDraft.trim();
    if (notes === storedNotes) return false;
    updateProgress(game.id, { notes });
    return true;
  }

  function commitNotes() {
    if (!persistNotes()) return;

    if (savedTimer.current) clearTimeout(savedTimer.current);
    setNotesSaved(true);
    savedTimer.current = setTimeout(() => setNotesSaved(false), SAVED_MS);
  }

  /** A game from online search can leave the catalog; otherwise adding is a one-way street. */
  function handleRemoveCustom() {
    clearProgress(game.id);
    removeCustomGame(game.id);
    closeGame();
    pushToast(`${game.title} left your catalog.`, 'info');
  }

  /* ----------------------------------------------------------------- clear */

  function handleClear() {
    clearProgress(game.id);
    setYearDraft('');
    setNotesDraft('');
    lastYearCommit.current = '';
    setNotesSaved(false);
    pushToast('Record deleted. This game is back to square one.', 'info');
  }

  // The year field lives next to "Beat it!", but never hides a year already saved.
  const showYear = status === 'beaten' || storedYear !== undefined;

  return (
    <div className="flex flex-col">
      {/* Close always within reach, even with the panel scrolled. */}
      <div className="sticky top-0 z-20 flex justify-end bg-panel/95 px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-3">
        <Button variant="ghost" size="icon" aria-label="Close" onClick={closeGame}>
          <X aria-hidden className="size-5" />
        </Button>
      </div>

      <header className="flex gap-4 px-4 pb-5 sm:gap-5 sm:px-6">
        <div className="w-28 shrink-0 overflow-hidden rounded-xl border border-line sm:w-44">
          <CoverImage game={game} sizes="200px" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 id="game-modal-title" className="text-xl font-semibold text-balance sm:text-2xl">
            {game.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-soft">
            <span className="font-medium text-ink">{game.platform}</span>
            {game.releaseYear > 0 && (
              <>
                <span aria-hidden className="text-ink-dim">
                  ·
                </span>
                <span>{game.releaseYear}</span>
              </>
            )}
            <span
              className="rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
              style={{
                color: meta.color,
                borderColor: `color-mix(in oklab, ${meta.color} 40%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
              }}
            >
              {meta.tabLabel}
            </span>
            {game.isBrazilClassic && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold uppercase"
                title="A landmark of Brazilian rental stores and arcades"
              >
                <Flame aria-hidden className="size-3" />
                BR Classic
              </span>
            )}
          </div>

          {game.summary && (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{game.summary}</p>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------ status */}
      <section className={cn(SECTION, 'relative')}>
        <h3 className={SECTION_TITLE}>Status</h3>

        {celebrating && (
          <span
            aria-hidden
            className="animate-pop pointer-events-none absolute top-2 right-4 z-10 sm:right-6"
          >
            <PartyPopper
              className="size-8 text-neon"
              style={{ filter: 'drop-shadow(0 0 12px color-mix(in oklab, var(--color-neon) 70%, transparent))' }}
            />
          </span>
        )}

        <div
          role="radiogroup"
          aria-label="Game status"
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {STATUS_ORDER.map((option) => {
            const optionMeta = STATUS_META[option];
            const selected = option === status;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                title={optionMeta.longLabel}
                onClick={() => handleStatus(option)}
                style={selected ? accentRing(optionMeta.color) : undefined}
                className={cn(
                  'flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors duration-200 active:scale-[0.98]',
                  selected
                    ? optionMeta.chipClass
                    : 'border-line bg-panel-2 text-ink-soft hover:border-line-soft hover:bg-panel-3 hover:text-ink',
                )}
              >
                <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', optionMeta.dotClass)} />
                <span className="truncate">{optionMeta.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------ year */}
      <div
        aria-hidden={!showYear}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          showYear ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <section className={SECTION}>
            <label htmlFor="zerei-completed-year" className={SECTION_TITLE}>
              What year did you beat it?
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                id="zerei-completed-year"
                type="number"
                inputMode="numeric"
                min={MIN_YEAR}
                max={maxYear}
                step={1}
                placeholder="E.g. 1996"
                disabled={!showYear}
                value={yearDraft}
                onChange={(event) => setYearDraft(event.target.value)}
                onBlur={commitYear}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  commitYear();
                }}
                className={cn(FIELD, 'w-32')}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!showYear}
                onClick={fillCurrentYear}
              >
                This year
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-dim">
              Don&apos;t remember the exact date? An honest guess is fine, it&apos;s your timeline.
            </p>
          </section>
        </div>
      </div>

      {/* ---------------------------------------------------------------- rating */}
      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>Your score</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <StarRating
            value={rating}
            onChange={(value) => updateProgress(game.id, { rating: value })}
            size="lg"
            className="-ml-1"
          />
          <span className={cn('text-sm', rating > 0 ? 'text-ink' : 'text-ink-dim')}>
            {rating > 0 ? RATING_HINT[rating] : 'Tap the stars'}
          </span>
        </div>
      </section>

      {/* ----------------------------------------------------------------- notes */}
      <section className={SECTION}>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="zerei-notes" className={SECTION_TITLE}>
            Memories / notes
          </label>
          <span role="status" aria-live="polite" className="text-xs text-neon">
            {notesSaved && (
              <span className="animate-fade-in inline-flex items-center gap-1">
                <Check aria-hidden className="size-3.5" />
                Saved
              </span>
            )}
          </span>
        </div>

        <textarea
          id="zerei-notes"
          rows={4}
          maxLength={NOTES_MAX}
          placeholder="Rented it at the video store from Friday to Monday..."
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={commitNotes}
          className={cn(
            FIELD,
            'mt-3 block h-auto w-full resize-y py-2.5 leading-relaxed scrollbar-thin',
          )}
        />
        <p className="mt-1.5 text-right text-[11px] text-ink-dim tabular-nums">
          {notesDraft.length}/{NOTES_MAX}
        </p>
      </section>

      {/* ---------------------------------------------------------------- footer */}
      {(progress || game.isCustom) && (
        <footer
          className={cn(
            SECTION,
            // A single value: `.safe-bottom` sits in the same cascade layer as Tailwind's
            // utilities and is declared later, so it would beat `sm:pb-6`.
            'flex flex-wrap items-center justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6',
          )}
        >
          {progress ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-dim">
              <Clock aria-hidden className="size-3.5" />
              Updated{' '}
              <time dateTime={progress.updatedAt} title={formatDate(progress.updatedAt)}>
                {timeAgo(progress.updatedAt)}
              </time>
            </span>
          ) : (
            <span className="text-xs text-ink-dim">Added by you through online search.</span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {game.isCustom && (
              <Button type="button" variant="outline" size="sm" onClick={handleRemoveCustom}>
                <Trash2 aria-hidden className="size-4" />
                Remove from catalog
              </Button>
            )}
            {progress && (
              <Button type="button" variant="danger" size="sm" onClick={handleClear}>
                <Trash2 aria-hidden className="size-4" />
                Clear record
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
