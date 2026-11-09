'use client';

import {
  CalendarDays,
  ChartColumn,
  Clock,
  Cpu,
  Joystick,
  Medal,
  Trophy,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StarRating } from '@/components/ui/StarRating';
import { categoryMeta, platformShort } from '@/lib/platforms';
import { computeStats, maxOf } from '@/lib/stats';
import { cn, pluralize, timeAgo } from '@/lib/utils';
import { useAllGames, useGameStore, useHydrated, useProgressMap } from '@/stores/useGameStore';
import type { StatsSummary, TimelineEntry } from '@/types/game';

/** Console ranking: shows only the extended podium. */
const MAX_PLATFORMS = 10;

/** Average with one decimal place: 4.5 -> "4.5". Deterministic (no Intl during render). */
function formatAverage(value: number): string {
  return value.toFixed(1);
}

/** Adds alpha to a design system `#rrggbb` color; returns it untouched if it doesn't match. */
function withAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex;
}

/* -------------------------------------------------------------------------- */
/*  Pieces reused inside the panel                                             */
/* -------------------------------------------------------------------------- */

function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-panel-2/60 p-4', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-soft uppercase">
        <Icon aria-hidden="true" className="size-4 text-ink-dim" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-ink-dim">{children}</p>;
}

function SkeletonBar({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-md bg-panel-3 animate-shimmer', className)} />;
}

/* -------------------------------------------------------------------------- */
/*  Blocks                                                                     */
/* -------------------------------------------------------------------------- */

/** 1. Hero number + micro metrics. */
function HeroBlock({ stats }: { stats: StatsSummary }) {
  const micro = [
    `${stats.playing} playing`,
    `${stats.backlog} in backlog`,
    `${stats.catalogSize} in the catalog`,
  ];
  // The average only shows up when there's a score; otherwise it would be a misleading "0.0".
  if (stats.rated > 0) micro.push(`average score ${formatAverage(stats.averageRating)}`);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-neon/25 bg-panel-2/60 px-4 py-6 text-center scanlines sm:py-8">
      <p className="font-display text-5xl leading-none text-neon text-glow sm:text-6xl">
        {stats.beaten}
      </p>
      <p className="mt-4 text-sm tracking-wide text-ink-soft">games beaten in a lifetime</p>

      <p className="mt-3 flex flex-wrap items-center justify-center text-xs text-ink-dim">
        {micro.map((item, index) => (
          // The separator sticks to the previous item: when the line wraps, a stray "·" never starts it.
          <span key={item} className="whitespace-nowrap">
            {item}
            {index < micro.length - 1 ? (
              <span aria-hidden="true" className="px-1.5 text-ink-dim/60">
                ·
              </span>
            ) : null}
          </span>
        ))}
      </p>

      {stats.brazilBeaten > 0 ? (
        <p className="mt-2 text-xs text-gold">
          {pluralize(stats.brazilBeaten, 'BR classic beaten', 'BR classics beaten')}
        </p>
      ) : null}
    </section>
  );
}

/** 2. Progress by generation. */
function CategoryBlock({ stats }: { stats: StatsSummary }) {
  return (
    <Panel title="Progress by generation" icon={Cpu}>
      <ul className="space-y-3">
        {stats.byCategory.map((item) => {
          const percent = item.total > 0 ? Math.round((item.beaten / item.total) * 100) : 0;
          return (
            <li key={item.category}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-ink-soft">{item.label}</span>
                <span className="shrink-0 font-display text-[10px] text-ink tabular-nums">
                  {item.beaten}/{item.total}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label}: ${item.beaten} of ${item.total} beaten`}
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-3"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${percent}%`, backgroundColor: item.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** 3. Console ranking. */
function PlatformBlock({ stats }: { stats: StatsSummary }) {
  const top = stats.byPlatform.slice(0, MAX_PLATFORMS);
  const max = maxOf(top.map((item) => item.beaten));

  return (
    <Panel title="Console ranking" icon={Joystick}>
      {top.length === 0 ? (
        <Hint>Beat a game and your favorite console shows up here at the top.</Hint>
      ) : (
        <ul className="space-y-2.5">
          {top.map((item) => {
            const color = categoryMeta(item.category).color;
            const percent = max > 0 ? Math.max(6, Math.round((item.beaten / max) * 100)) : 0;
            return (
              <li key={item.platform} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="w-12 shrink-0 rounded-md border px-1 py-1 text-center font-display text-[8px] leading-none"
                  style={{
                    color,
                    borderColor: withAlpha(color, '55'),
                    backgroundColor: withAlpha(color, '14'),
                  }}
                >
                  {platformShort(item.platform)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-ink-soft">{item.platform}</span>
                    <span className="shrink-0 font-display text-[10px] text-ink tabular-nums">
                      {item.beaten}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${percent}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** 4. Timeline by year (vertical bars in plain CSS). */
function YearBlock({ stats }: { stats: StatsSummary }) {
  const years = stats.byYear;
  const max = maxOf(years.map((item) => item.count));
  const lastIndex = years.length - 1;
  const chartLabel = years.map((item) => `${item.year}: ${pluralize(item.count, 'game')}`).join('; ');

  return (
    <Panel title="Timeline" icon={CalendarDays}>
      {years.length === 0 ? (
        <Hint>
          Fill in the year you beat each game in its details to build your timeline.
        </Hint>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-thin">
          {/* Minimum width per year: on phones the chart scrolls instead of squeezing the bars. */}
          <div style={{ minWidth: `${years.length * 26}px` }}>
            <div role="img" aria-label={`Games beaten per year — ${chartLabel}`} className="flex h-32 items-end gap-1">
              {years.map((item) => {
                const ratio = max > 0 ? item.count / max : 0;
                return (
                  <div
                    key={item.year}
                    title={`${item.year}: ${pluralize(item.count, 'game')}`}
                    className="min-w-[10px] flex-1 rounded-t bg-neon transition-[height] duration-500 ease-out"
                    style={{ height: `${Math.max(8, Math.round(ratio * 100))}%`, opacity: 0.35 + ratio * 0.65 }}
                  />
                );
              })}
            </div>
            <div aria-hidden="true" className="mt-1.5 flex gap-1">
              {years.map((item, index) => {
                // Only the first, the last and the peaks get a label; the rest lives in `title`.
                const show = index === 0 || index === lastIndex || item.count === max;
                return (
                  <span
                    key={item.year}
                    className="min-w-[10px] flex-1 text-center text-[9px] leading-none text-ink-dim tabular-nums"
                  >
                    {show ? item.year : ''}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** 5. Latest beaten. */
function TimelineBlock({
  stats,
  onSelect,
}: {
  stats: StatsSummary;
  onSelect: (gameId: string) => void;
}) {
  return (
    <Panel title="Latest beaten" icon={Clock}>
      {stats.timeline.length === 0 ? (
        <Hint>As soon as you mark your first Beat it!, your latest trophies are listed here.</Hint>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {stats.timeline.map((entry) => (
            <li key={entry.game.id}>
              <button
                type="button"
                onClick={() => onSelect(entry.game.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors duration-200 hover:border-line hover:bg-panel-3"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-neon shadow-[0_0_10px_-1px_var(--color-neon)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{entry.game.title}</span>
                  <span className="block truncate text-xs text-ink-dim">{entry.game.platform}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[10px] text-neon tabular-nums">
                    {entry.progress.completedYear ?? '—'}
                  </span>
                  <span className="block text-[11px] text-ink-dim">
                    {timeAgo(entry.progress.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 6. Top scores. */
function TopRatedBlock({
  stats,
  onSelect,
}: {
  stats: StatsSummary;
  onSelect: (gameId: string) => void;
}) {
  return (
    <Panel title="Top scores" icon={Medal}>
      {stats.topRated.length === 0 ? (
        <Hint>Give stars to the games you beat to build your personal podium.</Hint>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {stats.topRated.map((entry: TimelineEntry) => {
            const rating = entry.progress.rating ?? 0;
            return (
              <li key={entry.game.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.game.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors duration-200 hover:border-line hover:bg-panel-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{entry.game.title}</span>
                    <span className="block truncate text-xs text-ink-dim">{entry.game.platform}</span>
                  </span>
                  <StarRating value={rating} readOnly size="sm" className="shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Content                                                                    */
/* -------------------------------------------------------------------------- */

function StatsContent({ stats }: { stats: StatsSummary }) {
  const openGame = useGameStore((s) => s.openGame);
  const setStatsOpen = useGameStore((s) => s.setStatsOpen);

  // From the stats list to the game modal: close this panel before opening the other.
  const handleSelect = (gameId: string) => {
    setStatsOpen(false);
    openGame(gameId);
  };

  const hasHistory =
    stats.beaten > 0 ||
    stats.playing > 0 ||
    stats.backlog > 0 ||
    stats.rated > 0 ||
    stats.withNotes > 0;

  if (!hasHistory) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid size-16 place-items-center rounded-2xl border border-neon/30 bg-neon/10 text-neon glow-neon">
          <Trophy aria-hidden="true" className="size-8" />
        </span>
        <h3 className="mt-6 font-display text-xs leading-relaxed text-ink sm:text-sm">
          Your shelf is still empty
        </h3>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
          Mark your first &ldquo;Beat it!&rdquo; on any game in the catalog and this screen becomes the
          timeline of your gaming life.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-6 sm:px-6">
      <HeroBlock stats={stats} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CategoryBlock stats={stats} />
        <PlatformBlock stats={stats} />
      </div>

      <YearBlock stats={stats} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TimelineBlock stats={stats} onSelect={handleSelect} />
        <TopRatedBlock stats={stats} onSelect={handleSelect} />
      </div>
    </div>
  );
}

/** Until LocalStorage comes back, no numbers, just the skeleton. */
function StatsSkeleton() {
  return (
    <div role="status" className="space-y-4 px-4 pb-6 sm:px-6">
      <span className="sr-only">Loading your stats</span>
      <div className="rounded-2xl border border-line bg-panel-2/60 px-4 py-8">
        <SkeletonBar className="mx-auto h-12 w-24" />
        <SkeletonBar className="mx-auto mt-4 h-3 w-40" />
        <SkeletonBar className="mx-auto mt-3 h-3 w-56" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((panel) => (
          <div key={panel} className="rounded-2xl border border-line bg-panel-2/60 p-4">
            <SkeletonBar className="h-3 w-32" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <SkeletonBar key={row} className="h-2 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                      */
/* -------------------------------------------------------------------------- */

/** Stats panel for the player's life. Reads everything from the store, no props. */
export function StatsModal() {
  const statsOpen = useGameStore((s) => s.statsOpen);
  const setStatsOpen = useGameStore((s) => s.setStatsOpen);
  const hydrated = useHydrated();
  const games = useAllGames();
  const progress = useProgressMap();

  // Scanning the whole catalog only makes sense with the panel open.
  const stats = useMemo(
    () => (statsOpen ? computeStats(games, progress) : null),
    [statsOpen, games, progress],
  );

  return (
    <Modal
      open={statsOpen}
      onClose={() => setStatsOpen(false)}
      labelledBy="stats-modal-title"
      className="sm:max-w-4xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
        <h2
          id="stats-modal-title"
          className="flex min-w-0 items-center gap-2 text-base font-semibold text-ink"
        >
          <ChartColumn aria-hidden="true" className="size-5 shrink-0 text-neon" />
          <span className="truncate">Your stats</span>
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close stats"
          onClick={() => setStatsOpen(false)}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <div className="pt-4">
        {!hydrated || !stats ? <StatsSkeleton /> : <StatsContent stats={stats} />}
      </div>
    </Modal>
  );
}
