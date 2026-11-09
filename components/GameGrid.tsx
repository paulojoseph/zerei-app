'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Gamepad2, LoaderCircle, RotateCcw, Search, Trophy } from 'lucide-react';

import { GameCard } from '@/components/GameCard';
import { Onboarding } from '@/components/Onboarding';
import { SelectionBar } from '@/components/SelectionBar';
import { Button } from '@/components/ui/Button';
import { filterByStatus, selectGames, sortGames } from '@/lib/games';
import { CONSOLES, MAKER_PREFIX, MINE_FILTER, consoleByName } from '@/lib/consoles';
import { STATUS_META } from '@/lib/platforms';
import { pluralize } from '@/lib/utils';
import {
  progressConsoleIds,
  useAllGames,
  useCatalogStatus,
  useFilters,
  useGameStore,
  useHydrated,
  useProgressMap,
} from '@/stores/useGameStore';
import type {
  Game,
  GameStatus,
  IgdbSearchResponse,
  PlatformFilter,
  StatusFilter,
} from '@/types/game';

/** How many cards go in on each "page" of progressive rendering. */
const PAGE_SIZE = 72;

/** The single catalog grid; the skeleton uses exactly the same class. */
const GRID =
  'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9 sm:gap-3';

/** Fixed keys: no random index during render. */
const SKELETON_KEYS = Array.from({ length: 12 }, (_, index) => `esqueleto-${index}`);

interface EmptyCopy {
  title: string;
  subtitle: string;
}

const STATUS_EMPTY: Record<GameStatus, EmptyCopy> = {
  beaten: {
    title: 'No beaten games yet',
    subtitle: "You haven't marked any game as beaten yet. Shall we start?",
  },
  playing: {
    title: 'Nothing in progress',
    subtitle:
      'Mark a game as "Playing" and it shows up here, waiting for the next all-nighter.',
  },
  backlog: {
    title: 'Your backlog is empty',
    subtitle:
      'Put in your backlog those classics you swore you would finish one day. They show up in this tab.',
  },
  unplayed: {
    title: 'No unmarked games',
    subtitle: 'Every game in this selection already has a mark from you. Not bad.',
  },
};

/** Empty state copy based on the real reason the list ended up empty. */
function emptyCopy(
  term: string,
  status: StatusFilter,
  brazilOnly: boolean,
  platform: PlatformFilter,
): EmptyCopy {
  if (term) {
    return {
      title: `No games found for "${term}"`,
      subtitle:
        'Try the console name (mega drive, snes, arcade), part of the title or the release year.',
    };
  }
  if (status !== 'all') return STATUS_EMPTY[status];
  if (brazilOnly) {
    return {
      title: 'No Brazilian classics here',
      subtitle:
        'The Brazilian classics filter found nothing in the current selection. Turn the filter off to see the whole catalog.',
    };
  }
  if (platform === MINE_FILTER) {
    return {
      title: 'Nothing on your consoles',
      subtitle: 'No game from the consoles you picked matches the current filters.',
    };
  }
  if (platform !== 'all') {
    const name = platform.startsWith(MAKER_PREFIX)
      ? platform.slice(MAKER_PREFIX.length)
      : (consoleByName(platform)?.label ?? platform);
    return {
      title: `Nothing on ${name}`,
      subtitle: 'No game from this console matches the current filters.',
    };
  }
  return {
    title: 'Empty catalog',
    subtitle: 'No games to show right now. Clear the filters and start over.',
  };
}

const SEARCH_ERROR = "Couldn't search right now. Try again.";

/**
 * The single entry point to the `/api/igdb/search` route. Without Twitch credentials
 * the route still answers: it returns the local database with a message in `notice`.
 */
function OnlineSearch({ term }: { term: string }) {
  const addCustomGames = useGameStore((s) => s.addCustomGames);
  const pushToast = useGameStore((s) => s.pushToast);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // An in-flight search dies with the component: a late response won't setState or toast.
  useEffect(() => () => abortRef.current?.abort(), []);

  const searchOnline = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setNotice('');
    try {
      const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(term)}&limit=24`, {
        signal: controller.signal,
      });
      const data = (await res.json()) as IgdbSearchResponse;
      if (controller.signal.aborted) return;

      // The notice explains where the results came from (or why they didn't).
      setNotice(data.notice ?? '');

      if (!res.ok) {
        pushToast(SEARCH_ERROR, 'error');
        return;
      }

      const found = Array.isArray(data.results) ? data.results : [];
      if (found.length === 0) {
        pushToast(`Nothing found for "${term}".`, 'info');
        return;
      }

      const added = addCustomGames(found);
      if (added > 0) pushToast(`${added} game(s) added to your catalog.`);
      else pushToast('These games are already in your catalog.', 'info');
    } catch {
      if (controller.signal.aborted) return;
      pushToast(SEARCH_ERROR, 'error');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <div className="mt-6 flex w-full max-w-md flex-col items-center gap-2 border-t border-line-soft pt-6">
      <Button variant="cyan" disabled={loading} onClick={() => void searchOnline()}>
        {loading ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="size-4" aria-hidden="true" />
        )}
        {loading ? 'Searching…' : 'Search the online database'}
      </Button>
      {notice !== '' && (
        <p role="status" className="text-xs leading-relaxed text-ink-dim">
          {notice}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  copy,
  term,
  onReset,
}: {
  copy: EmptyCopy;
  term: string;
  onReset: () => void;
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center rounded-2xl border border-line-soft bg-panel/50 px-6 py-16 text-center">
      <div className="flex size-20 items-center justify-center rounded-full border border-line bg-panel-2">
        <Gamepad2 className="size-9 text-ink-dim" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-ink">{copy.title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{copy.subtitle}</p>
      <Button variant="outline" className="mt-6" onClick={onReset}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Clear filters
      </Button>
      {term !== '' && <OnlineSearch term={term} />}
    </div>
  );
}

/** Placeholder shown until LocalStorage is read (avoids mismatch and flicker). */
function GridSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading your game catalog.</p>
      {/* h-5 = line height of the `text-sm` of the real counter that goes here. */}
      <div className="mb-4 h-5 w-28 animate-shimmer rounded-full bg-panel-2" />
      <div className={GRID}>
        {SKELETON_KEYS.map((key) => (
          // Same box and measurements as GameCard (panel + 3/4 cover + p-2.5 footer
          // with a 2-line title and the year/platform line): when the real cards
          // take their place, nothing on the page moves.
          <div key={key} className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="aspect-[3/4] w-full animate-shimmer bg-panel-2" />
            <div className="p-2">
              <div className="min-h-[1.875rem]">
                <div className="h-2.5 w-11/12 animate-shimmer rounded-full bg-panel-2" />
                <div className="mt-1.5 h-2.5 w-3/5 animate-shimmer rounded-full bg-panel-2" />
              </div>
              <div className="mt-1 flex h-4 items-center gap-1.5">
                <div className="h-2.5 w-7 animate-shimmer rounded-full bg-panel-2" />
                <div className="ml-auto h-3.5 w-9 animate-shimmer rounded-md bg-panel-2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GameGrid() {
  const games = useAllGames();
  const progress = useProgressMap();
  const hydrated = useHydrated();
  const catalogStatus = useCatalogStatus();
  const { search, platform, status, brazilOnly, sort } = useFilters();
  const resetFilters = useGameStore((s) => s.resetFilters);
  const loadCatalog = useGameStore((s) => s.loadCatalog);
  const ensureConsoles = useGameStore((s) => s.ensureConsoles);
  const myConsoles = useGameStore((s) => s.myConsoles);
  const onboardingDone = useGameStore((s) => s.onboardingDone);
  const mine = useMemo(
    () => new Set(CONSOLES.filter((c) => myConsoles.includes(c.id)).map((c) => c.name)),
    [myConsoles],
  );

  /*
   * Download only what's needed (the whole catalog is over 3MB compressed):
   * - always: the most popular (top.json, ~80KB) for the "All" tab;
   * - consoles where the user has marked games (counters and "Beat it!");
   * - the picked console or maker;
   * - everything only when the question is about everything: search or "Not played" under "All".
   */
  const progressConsoles = useMemo(() => progressConsoleIds(progress).join(','), [progress]);
  const needsEverything = platform === 'all' && (search.trim() !== '' || status === 'unplayed');
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
  useEffect(() => {
    if (!hydrated) return;
    if (needsEverything) {
      ensureConsoles('all');
      return;
    }
    const wanted = new Set(progressConsoles ? progressConsoles.split(',') : []);
    if (platform === MINE_FILTER) {
      for (const id of myConsoles) wanted.add(id);
    } else if (platform.startsWith(MAKER_PREFIX)) {
      const maker = platform.slice(MAKER_PREFIX.length);
      for (const c of CONSOLES) if (c.maker === maker) wanted.add(c.id);
    } else if (platform !== 'all') {
      const id = consoleByName(platform)?.id;
      if (id) wanted.add(id);
    }
    ensureConsoles([...wanted]);
  }, [hydrated, needsEverything, platform, progressConsoles, myConsoles, ensureConsoles]);

  // Keyed derived state (the official React pattern, no useEffect): when any
  // filter changes, pagination goes back to the first batch and the order is
  // recomputed with a snapshot of the progress at that moment.
  const filterKey = `${search}|${platform}|${status}|${brazilOnly}|${sort}|${hydrated}|${myConsoles.join()}`;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pagedKey, setPagedKey] = useState(filterKey);
  const [orderProgress, setOrderProgress] = useState(progress);
  const [focusIndex, setFocusIndex] = useState(0);
  let count = visibleCount;
  let snapshot = orderProgress;
  let focused = focusIndex;
  if (pagedKey !== filterKey) {
    setPagedKey(filterKey);
    setVisibleCount(PAGE_SIZE);
    setOrderProgress(progress);
    setFocusIndex(0);
    count = PAGE_SIZE;
    snapshot = progress;
    focused = 0;
  }

  // Three steps with very different costs. Selection and sorting (tens of
  // thousands of games) do NOT depend on live progress: a "Beat it!" click
  // only redoes the status filter, which is O(n) with no sorting. The order
  // stays frozen until the next filter, so the card doesn't jump out from
  // under the finger either. Measured in lib/games.perf.test.ts.
  const selected = useMemo(
    () => selectGames({ games, search, platform, brazilOnly, mine }),
    [games, search, platform, brazilOnly, mine],
  );
  const sorted = useMemo(() => sortGames(selected, games, sort, snapshot), [selected, games, sort, snapshot]);
  const visible = useMemo(() => filterByStatus(sorted, progress, status), [sorted, progress, status]);

  /* ----------------------------------------------------------- keyboard -- */

  const gridRef = useRef<HTMLDivElement>(null);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const toggleBeaten = useGameStore((s) => s.toggleBeaten);
  const toggleSelected = useGameStore((s) => s.toggleSelected);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const openGame = useGameStore((s) => s.openGame);
  const pushToast = useGameStore((s) => s.pushToast);
  const pendingFocus = useRef<number | null>(null);

  // Focus requested by the keyboard on a card that only exists after the next render.
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-card-index="${pendingFocus.current}"]`);
    if (node) {
      node.focus();
      pendingFocus.current = null;
    }
  });

  const STATUS_KEYS: Record<string, GameStatus> = { p: 'playing', w: 'backlog', n: 'unplayed' };

  /**
   * Marking without a mouse: arrows move, B toggles beaten, P/W/N change the status,
   * Space/X selects, Enter opens, Esc clears the selection. Only acts with focus on a card
   * (never inside search, the card menu or with Ctrl/⌘).
   */
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, list: Game[], total: number) => {
    const target = event.target as HTMLElement;
    if (!target.matches('article[data-card-index]') || event.ctrlKey || event.metaKey || event.altKey) return;
    const index = Number(target.dataset.cardIndex);
    const game = list[index];
    if (!game) return;

    const columns = gridRef.current
      ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').filter(Boolean).length
      : 1;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
      Home: -index,
      End: total - 1 - index,
    };
    const key = event.key.toLowerCase();

    if (event.key in moves) {
      event.preventDefault();
      const next = Math.max(0, Math.min(total - 1, index + moves[event.key]));
      if (next >= count) setVisibleCount((c) => Math.max(c, next + PAGE_SIZE));
      pendingFocus.current = next;
      setFocusIndex(next);
      gridRef.current?.querySelector<HTMLElement>(`[data-card-index="${next}"]`)?.focus();
      return;
    }
    if (key === 'b') {
      event.preventDefault();
      const wasBeaten = progress[game.id]?.status === 'beaten';
      toggleBeaten(game.id);
      pushToast(`${game.title} → ${wasBeaten ? STATUS_META.unplayed.label : STATUS_META.beaten.label}`, wasBeaten ? 'info' : 'success');
    } else if (key in STATUS_KEYS) {
      event.preventDefault();
      setGameStatus(game.id, STATUS_KEYS[key]);
      pushToast(`${game.title} → ${STATUS_META[STATUS_KEYS[key]].label}`, 'info');
    } else if (key === 'x' || event.key === ' ') {
      event.preventDefault();
      toggleSelected(game.id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openGame(game.id);
    } else if (event.key === 'Escape') {
      clearSelection();
    }
  };

  // Infinite scroll: the sentinel at the end of the grid pulls the next batch before
  // the user gets there. The "Load more" button stays as an alternative.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = count < visible.length;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, count, hydrated]);

  if (!hydrated) return <GridSkeleton />;

  const loadingCatalog = catalogStatus === 'loading';
  const term = search.trim();
  const total = visible.length;
  const shown = Math.min(count, total);
  const remaining = total - shown;
  const cards = visible.slice(0, shown);
  const narrowed = term !== '' || platform !== 'all' || status !== 'all' || brazilOnly;

  return (
    <div className="animate-fade-in">
      {!onboardingDone && <Onboarding />}
      <SelectionBar />
      {total > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2"
          role="status"
          aria-live="polite"
        >
          <h2 className="text-sm font-semibold text-ink">{pluralize(total, 'game')}</h2>
          {term !== '' && (
            <span className="text-sm text-ink-soft">
              results for <span className="text-ink">&ldquo;{term}&rdquo;</span>
            </span>
          )}
          {status === 'beaten' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/15 px-2.5 py-1 text-[11px] font-medium text-neon">
              <Trophy className="size-3.5" aria-hidden="true" />
              Beaten
            </span>
          )}
          {/*
            The hint is there from the first paint and loading is just an icon:
            text that shows up later pushes the grid (CLS) and becomes the page's LCP.
          */}
          {platform === 'all' && !needsEverything && (
            <span className="text-xs text-ink-dim">The most popular games. Pick a console or search to see them all.</span>
          )}
          <span className="inline-flex size-3.5 items-center">
            {loadingCatalog && <LoaderCircle className="size-3.5 animate-spin text-ink-dim" aria-hidden="true" />}
            <span className="sr-only">{loadingCatalog ? 'Loading games' : ''}</span>
          </span>
          {catalogStatus === 'error' && (
            <span className="text-xs text-gold">
              Part of the catalog didn&apos;t load. Reload the page to try again.
            </span>
          )}
          {remaining > 0 && (
            <span className="ml-auto text-xs text-ink-dim">
              Showing {shown} of {total}
            </span>
          )}
        </div>
      )}

      {total === 0 && loadingCatalog ? (
        <GridSkeleton />
      ) : total === 0 ? (
        <EmptyState
          copy={emptyCopy(term, status, brazilOnly, platform)}
          term={term}
          onReset={resetFilters}
        />
      ) : (
        <>
          <div ref={gridRef} className={GRID} onKeyDown={(e) => onGridKeyDown(e, visible, total)}>
            {cards.map((game, index) => (
              // The first 6 covers are the likely LCP on phones.
              <GameCard
                key={game.id}
                game={game}
                priority={index < 6}
                index={index}
                focusable={index === Math.min(focused, cards.length - 1)}
                onFocusCard={setFocusIndex}
              />
            ))}
          </div>
          <p className="mt-4 hidden text-center text-[11px] text-ink-dim [@media(hover:hover)_and_(pointer:fine)]:block">
            Keyboard: arrows move · <kbd className="font-display">B</kbd> beat it · <kbd className="font-display">P</kbd> playing ·{' '}
            <kbd className="font-display">W</kbd> want to play · <kbd className="font-display">N</kbd> not played ·{' '}
            <kbd className="font-display">Space</kbd> selects · Shift+click selects several
          </p>
          <div ref={sentinelRef} aria-hidden="true" />

          {remaining > 0 ? (
            <div className="mt-7 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
                Load more ({pluralize(remaining, 'remaining', 'remaining')})
              </Button>
            </div>
          ) : (
            <p className="mt-8 text-center text-xs text-ink-dim">
              End of the list: {pluralize(total, 'game')} {narrowed ? 'in this selection' : 'in the catalog'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
