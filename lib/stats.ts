import type {
  CategoryStat,
  Game,
  PlatformCategory,
  PlatformStat,
  StatsSummary,
  TimelineEntry,
  UserGameProgress,
  YearStat,
} from '@/types/game';
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/platforms';

/**
 * Pure stats module: no React, store, `Date.now()` or I/O.
 * The same (games, progress) pair always returns the same `StatsSummary`, which
 * is what makes it safe to call during render without hydration mismatches.
 */

/** Stable tie-break by title, accent-aware. */
function byTitle(a: Game, b: Game): number {
  return a.title.localeCompare(b.title, 'en');
}

/** ISO dates compare fine lexicographically; `?? ''` only guards legacy data. */
function updatedAtOf(progress: UserGameProgress): string {
  return progress.updatedAt ?? '';
}

/** Most recent first; ties fall back to the title so the order never flips. */
function byRecent(a: TimelineEntry, b: TimelineEntry): number {
  const compared = updatedAtOf(b.progress).localeCompare(updatedAtOf(a.progress));
  if (compared !== 0) return compared;
  return byTitle(a.game, b.game);
}

/** Largest value in a list (0 when empty), used to scale bar heights in the UI. */
export function maxOf(values: number[]): number {
  let max = 0;
  for (const value of values) {
    if (value > max) max = value;
  }
  return max;
}

const MAX_TIMELINE = 12;
const MAX_TOP_RATED = 6;

interface CategoryTally {
  beaten: number;
  total: number;
}

export function computeStats(
  games: Game[],
  progress: Record<string, UserGameProgress>,
): StatsSummary {
  let beaten = 0;
  let playing = 0;
  let backlog = 0;
  let unplayed = 0;
  let rated = 0;
  let ratingSum = 0;
  let withNotes = 0;
  let brazilBeaten = 0;

  // Indexed accumulators, so we don't scan the catalog again per category/platform.
  const categoryTally = new Map<PlatformCategory, CategoryTally>(
    CATEGORY_ORDER.map((category): [PlatformCategory, CategoryTally] => [
      category,
      { beaten: 0, total: 0 },
    ]),
  );
  const platformTally = new Map<string, PlatformStat>();
  const yearTally = new Map<number, number>();
  const beatenEntries: TimelineEntry[] = [];
  const ratedEntries: TimelineEntry[] = [];

  // A single pass over the catalog. Starting from the games (not from `progress`)
  // naturally drops orphan progress for games that left the database.
  for (const game of games) {
    const category = categoryTally.get(game.category);
    if (category) category.total += 1;

    const entry = progress[game.id];
    if (!entry) {
      // No record at all: counts as not played, same as the explicit status.
      unplayed += 1;
      continue;
    }

    if (entry.rating !== undefined && entry.rating >= 1) {
      rated += 1;
      ratingSum += entry.rating;
      ratedEntries.push({ game, progress: entry });
    }
    if (entry.notes !== undefined && entry.notes.trim() !== '') withNotes += 1;

    switch (entry.status) {
      case 'beaten': {
        beaten += 1;
        if (game.isBrazilClassic) brazilBeaten += 1;
        if (category) category.beaten += 1;

        const platform = platformTally.get(game.platform);
        if (platform) platform.beaten += 1;
        // The badge generation comes from the first beaten game on that platform;
        // in practice they all share the same category.
        else platformTally.set(game.platform, { platform: game.platform, category: game.category, beaten: 1 });

        if (entry.completedYear !== undefined) {
          yearTally.set(entry.completedYear, (yearTally.get(entry.completedYear) ?? 0) + 1);
        }

        beatenEntries.push({ game, progress: entry });
        break;
      }
      case 'playing':
        playing += 1;
        break;
      case 'backlog':
        backlog += 1;
        break;
      default:
        unplayed += 1;
        break;
    }
  }

  const byCategory: CategoryStat[] = CATEGORY_ORDER.map((category) => {
    const tally = categoryTally.get(category) ?? { beaten: 0, total: 0 };
    const meta = CATEGORY_META[category];
    return {
      category,
      label: meta.label,
      color: meta.color,
      beaten: tally.beaten,
      total: tally.total,
    };
  });

  const byPlatform: PlatformStat[] = [...platformTally.values()].sort(
    (a, b) => b.beaten - a.beaten || a.platform.localeCompare(b.platform, 'en'),
  );

  // Gaming life timeline: ascending year so the chart reads left to right.
  const byYear: YearStat[] = [...yearTally.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const timeline = beatenEntries.sort(byRecent).slice(0, MAX_TIMELINE);

  const topRated = ratedEntries
    .sort((a, b) => (b.progress.rating ?? 0) - (a.progress.rating ?? 0) || byRecent(a, b))
    .slice(0, MAX_TOP_RATED);

  return {
    beaten,
    playing,
    backlog,
    unplayed,
    catalogSize: games.length,
    rated,
    // Average with one decimal place (0 when nothing was rated).
    averageRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : 0,
    withNotes,
    brazilBeaten,
    byCategory,
    byPlatform,
    byYear,
    timeline,
    topRated,
  };
}
