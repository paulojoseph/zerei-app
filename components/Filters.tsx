'use client';

import { ArrowUpDown, ChevronDown, Flame, RotateCcw } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { SEED_GAMES, SORT_OPTIONS, countByStatus } from '@/lib/games';
import {
  CATALOG_COUNTS,
  CONSOLES,
  MAKER_ORDER,
  MAKER_PREFIX,
  MINE_FILTER,
  makerOf,
} from '@/lib/consoles';
import {
  CATEGORY_META,
  STATUS_FILTER_LABEL,
  STATUS_META,
  STATUS_ORDER,
} from '@/lib/platforms';
import { cn, pluralize, CONTAINER } from '@/lib/utils';
import {
  useAllGames,
  useFilters,
  useGameStore,
  useHasActiveFilters,
  useHydrated,
  useProgressMap,
} from '@/stores/useGameStore';
import type { Game, GameStatus, PlatformFilter, SortMode, StatusFilter } from '@/types/game';

/** Accent for "All" and the makers (design system neon green). */
const NEON = '#39ff9e';
/** Accent for "My consoles" (design system gold). */
const GOLD = '#fbbf24';

interface ChipItem {
  id: PlatformFilter;
  label: string;
  /** Full name, used as `title` and accessible label. */
  hint: string;
  color: string;
  count: number;
}

interface MakerGroup {
  maker: string;
  count: number;
  consoles: ChipItem[];
}

/** "1234" → "1.2k": fits the chip without pushing the bar. */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}

/**
 * Consoles grouped by maker, with each one's count. The count comes from the
 * catalog index + seed + IGDB games, so it's right before the full catalog
 * finishes downloading.
 */
function buildGroups(customGames: Game[]): MakerGroup[] {
  const extra = new Map<string, number>();
  for (const game of [...SEED_GAMES, ...customGames]) {
    extra.set(game.platform, (extra.get(game.platform) ?? 0) + 1);
  }

  const groups = new Map<string, ChipItem[]>(MAKER_ORDER.map((m) => [m, []]));
  const known = new Set<string>();
  for (const c of [...CONSOLES].sort((a, b) => a.year - b.year)) {
    known.add(c.name);
    const count = (CATALOG_COUNTS[c.id] ?? 0) + (extra.get(c.name) ?? 0);
    if (count === 0) continue;
    groups.get(c.maker)?.push({
      id: c.name,
      label: c.label,
      hint: c.name,
      color: CATEGORY_META[c.category].color,
      count,
    });
  }
  // Platforms that only exist in games imported from IGDB.
  for (const [platform, count] of extra) {
    if (known.has(platform)) continue;
    groups.get(makerOf(platform))?.push({
      id: platform,
      label: platform,
      hint: platform,
      color: NEON,
      count,
    });
  }

  return MAKER_ORDER.map((maker) => {
    const consoles = groups.get(maker) ?? [];
    return { maker, consoles, count: consoles.reduce((sum, c) => sum + c.count, 0) };
  }).filter((g) => g.count > 0);
}

interface StatusChip {
  id: StatusFilter;
  label: string;
  chipClass: string;
  dotClass: string;
}

/**
 * Full name of chips whose label was shortened to fit the bar. The chip says
 * "Backlog", but the card menu and the modal say "Want to play": without the long
 * name on hover and in screen readers, they look like two different filters.
 */
const STATUS_CHIP_FULL_LABEL: Partial<Record<StatusFilter, string>> = {
  backlog: STATUS_META.backlog.label,
};

/** Statuses accepted in `?status=`, so URL garbage never gets into the store. */
const DEEP_LINK_STATUS: ReadonlySet<string> = new Set<string>(STATUS_ORDER);

function isKnownStatus(value: string): value is GameStatus {
  return DEEP_LINK_STATUS.has(value);
}

/** "All" + the four statuses in the design system's canonical order. */
const STATUS_CHIPS: StatusChip[] = [
  {
    id: 'all',
    label: STATUS_FILTER_LABEL.all,
    chipClass: 'border-ink-dim/60 bg-panel-3 text-ink',
    dotClass: 'bg-ink-soft',
  },
  ...STATUS_ORDER.map<StatusChip>((status) => ({
    id: status,
    label: STATUS_FILTER_LABEL[status],
    chipClass: STATUS_META[status].chipClass,
    dotClass: STATUS_META[status].dotClass,
  })),
];

/**
 * Segmentation bar: makers and consoles, statuses, the "BR Nostalgia" preset and sorting.
 * It sticks right below the header, which is why `top` matches its height.
 */
export function Filters() {
  const games = useAllGames();
  const progress = useProgressMap();
  const hydrated = useHydrated();
  const hasActiveFilters = useHasActiveFilters();
  const { platform, status, brazilOnly, sort } = useFilters();
  const customGames = useGameStore((s) => s.customGames);
  const myConsoles = useGameStore((s) => s.myConsoles);
  const reopenOnboarding = useGameStore((s) => s.reopenOnboarding);

  const setPlatform = useGameStore((s) => s.setPlatform);
  const setStatusFilter = useGameStore((s) => s.setStatusFilter);
  const toggleBrazilOnly = useGameStore((s) => s.toggleBrazilOnly);
  const setBrazilOnly = useGameStore((s) => s.setBrazilOnly);
  const setSearch = useGameStore((s) => s.setSearch);
  const setSort = useGameStore((s) => s.setSort);
  const resetFilters = useGameStore((s) => s.resetFilters);

  /*
   * PWA shortcuts (manifest.json) and shared links: `/?status=beaten`,
   * `/?preset=brasil`, `/?q=<term>` and `/?console=<id>` (ids from data/consoles.json). Without this, installed shortcuts open the
   * home page with no filter at all, because nothing in the app reads the query string. Runs once
   * on mount and only on the client, with no `useSearchParams`, which would force the
   * (static) page to be born inside a <Suspense>.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');
    const preset = params.get('preset');
    const query = params.get('q')?.trim();
    const consoleParam = params.get('console');
    let applied = false;

    const linked = consoleParam ? CONSOLES.find((c) => c.id === consoleParam) : undefined;
    if (linked) {
      setPlatform(linked.name);
      applied = true;
    }

    if (statusParam && isKnownStatus(statusParam)) {
      setStatusFilter(statusParam);
      applied = true;
    }
    if (preset === 'brasil') {
      setBrazilOnly(true);
      applied = true;
    }
    if (query) {
      setSearch(query);
      applied = true;
    }

    // The query already became state: removing it from the address bar keeps the filter
    // from "coming back on its own" when the user clears filters and reloads the page.
    if (applied) window.history.replaceState({}, '', window.location.pathname);
    // Zustand actions have stable references, so this is a mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => buildGroups(customGames), [customGames]);
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  // Highlighted maker: the picked one or the owner of the picked console.
  const myNames = useMemo(
    () => new Set(CONSOLES.filter((c) => myConsoles.includes(c.id)).map((c) => c.name)),
    [myConsoles],
  );
  const allConsoleChips = useMemo(() => groups.flatMap((g) => g.consoles), [groups]);
  const mineActive = platform === MINE_FILTER;

  // Highlighted maker: the picked one or the owner of the picked console.
  const activeMaker =
    platform === 'all' || mineActive
      ? null
      : platform.startsWith(MAKER_PREFIX)
        ? platform.slice(MAKER_PREFIX.length)
        : makerOf(platform);
  const visibleConsoles = mineActive
    ? allConsoleChips.filter((c) => myNames.has(c.id))
    : activeMaker
      ? (groups.find((g) => g.maker === activeMaker)?.consoles ?? [])
      : allConsoleChips;

  const mineChip: ChipItem[] = myNames.size
    ? [
        {
          id: MINE_FILTER,
          label: 'My consoles',
          hint: 'The consoles you owned',
          color: GOLD,
          count: allConsoleChips.filter((c) => myNames.has(c.id)).reduce((sum, c) => sum + c.count, 0),
        },
      ]
    : [];

  const makerChips: ChipItem[] = [
    { id: 'all', label: 'All', hint: 'All consoles', color: NEON, count: total },
    ...mineChip,
    ...groups.map((g) => ({
      id: `${MAKER_PREFIX}${g.maker}`,
      label: g.maker,
      hint: `All ${g.maker} consoles`,
      color: NEON,
      count: g.count,
    })),
  ];

  /*
   * Status chip counters. `countByStatus` walks only the user's progress
   * (hundreds of records), not the catalog, so it runs on every click.
   */
  const statusCount = useMemo<Record<StatusFilter, number>>(() => {
    const counts = countByStatus(games, progress);
    // Before the full catalog arrives, "Not played" uses the index size.
    const pending = Math.max(0, total - games.length);
    return { ...counts, unplayed: counts.unplayed + pending, all: games.length + pending };
  }, [games, progress, total]);

  return (
    <div className="sticky top-[var(--header-h)] z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className={cn(CONTAINER, 'py-2.5 sm:py-3')}>
        {/*
          1. Maker and console. On phones each row scrolls horizontally without
          wrapping. Visually they're tabs, but there's no `tabpanel` or arrow
          navigation: it's a group of toggle buttons, like the status chips.
          The strips bleed exactly the `.app-container` padding
          (`--app-pad`): bleeding more would add horizontal scroll to the page.
        */}
        <div
          role="group"
          aria-label="Filter by maker"
          className="mx-[calc(var(--app-pad)*-1)] flex gap-1.5 overflow-x-auto px-[var(--app-pad)] no-scrollbar"
        >
          {makerChips.map((chip) => (
            <FilterChip
              key={chip.id}
              chip={chip}
              active={platform === chip.id}
              // Picked console: its maker gets a light highlight.
              partial={chip.id === `${MAKER_PREFIX}${activeMaker}`}
              onClick={() => setPlatform(chip.id)}
              strong
            />
          ))}
        </div>

        <div
          role="group"
          aria-label="Filter by console"
          className="mx-[calc(var(--app-pad)*-1)] mt-1.5 flex gap-1.5 overflow-x-auto px-[var(--app-pad)] no-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
        >
          {visibleConsoles.map((chip) => (
            <FilterChip
              key={chip.id}
              chip={chip}
              active={platform === chip.id}
              // A second click on the active console goes back to the group it came from.
              onClick={() =>
                setPlatform(
                  platform === chip.id
                    ? myNames.has(chip.id)
                      ? MINE_FILTER
                      : `${MAKER_PREFIX}${makerOf(chip.id)}`
                    : chip.id,
                )
              }
            />
          ))}
          {(mineActive || myNames.size === 0) && (
            <button
              type="button"
              onClick={reopenOnboarding}
              className="flex h-8 shrink-0 items-center rounded-lg border border-dashed border-line px-2.5 text-xs text-ink-dim transition-colors duration-200 hover:border-gold/60 hover:text-gold"
            >
              {myNames.size ? 'Edit my consoles' : '+ My consoles'}
            </button>
          )}
        </div>

        {/* On phones, status, preset and sorting share a single scrolling strip:
            stacked, they ate a third of the screen in the sticky bar. */}
        <div className="mx-[calc(var(--app-pad)*-1)] mt-2 flex items-center gap-2 overflow-x-auto px-[var(--app-pad)] no-scrollbar lg:mx-0 lg:justify-between lg:overflow-visible lg:px-0">
          {/* 2. Status chips, each with its count */}
          <div className="flex shrink-0 gap-2">
            {STATUS_CHIPS.map((chip) => {
              const active = status === chip.id;
              // "All" only counts the catalog; the others depend on saved progress.
              const showCount = chip.id === 'all' || hydrated;
              const fullLabel = STATUS_CHIP_FULL_LABEL[chip.id];
              const spokenLabel = fullLabel ?? chip.label;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  title={fullLabel}
                  aria-label={
                    showCount
                      ? `${spokenLabel} — ${pluralize(statusCount[chip.id], 'game')}`
                      : spokenLabel
                  }
                  onClick={() => setStatusFilter(chip.id)}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                    active
                      ? chip.chipClass
                      : 'border-line bg-panel-2/50 text-ink-soft hover:text-ink',
                    active && chip.id === 'beaten' && 'glow-neon',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 rounded-full',
                      active ? chip.dotClass : 'bg-ink-dim/70',
                    )}
                  />
                  <span>{chip.label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'font-display text-[10px] leading-none',
                      active ? 'opacity-80' : 'text-ink-dim',
                    )}
                  >
                    {showCount ? statusCount[chip.id] : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3. Nostalgia preset + sorting + clear */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              aria-pressed={brazilOnly}
              onClick={toggleBrazilOnly}
              className={cn(
                'h-9 shrink-0 px-3 text-sm whitespace-nowrap',
                brazilOnly
                  ? 'border-gold/50 bg-gold/15 text-gold hover:border-gold/70 hover:text-gold'
                  : 'border-line bg-panel-2/50 text-ink-soft hover:border-gold/40 hover:text-gold',
              )}
            >
              <Flame aria-hidden="true" className="size-4" />
              <span className="sm:hidden">BR Nostalgia</span>
              <span className="hidden sm:inline">Rental Store &amp; Brazil Classics</span>
            </Button>

            <div className="relative">
              <ArrowUpDown
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
              />
              <select
                aria-label="Sort by"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="h-9 cursor-pointer appearance-none rounded-xl border border-line bg-panel-2 pl-9 pr-8 text-[16px] text-ink transition-colors duration-200 hover:border-line-soft sm:text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id} className="bg-panel-2 text-ink">
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
              />
            </div>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={resetFilters}
                className="h-9 shrink-0 px-3 text-sm whitespace-nowrap"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  chip,
  active,
  partial = false,
  onClick,
  strong = false,
}: {
  chip: ChipItem;
  active: boolean;
  partial?: boolean;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      // The accessible name starts with the visible text ("SNES"): voice control
      // users say what they see ("click SNES") and screen readers keep working.
      aria-label={chip.hint === chip.label ? `${chip.label} — ${pluralize(chip.count, 'game')}` : `${chip.label} (${chip.hint}) — ${pluralize(chip.count, 'game')}`}
      title={chip.hint}
      onClick={onClick}
      style={
        active
          ? {
              color: chip.color,
              borderColor: chip.color,
              // Opaque background: with transparency over the bar's blur, text contrast
              // isn't guaranteed (or checkable by the tools).
              backgroundColor: `color-mix(in oklab, ${chip.color} 14%, var(--color-bg))`,
              boxShadow: `0 0 18px -10px ${chip.color}`,
            }
          : partial
            ? { color: chip.color, borderColor: `color-mix(in oklab, ${chip.color} 45%, transparent)` }
            : undefined
      }
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 whitespace-nowrap transition-colors duration-200',
        strong ? 'h-9 text-sm font-semibold' : 'h-8 text-xs font-medium',
        active || partial ? 'bg-panel-2/50' : 'border-line bg-panel-2/50 text-ink-soft hover:text-ink',
      )}
    >
      <span>{chip.label}</span>
      <span
        aria-hidden="true"
        className={cn('font-display text-[9px] leading-none', active ? 'opacity-80' : 'text-ink-dim')}
      >
        {compactCount(chip.count)}
      </span>
    </button>
  );
}

export default Filters;
