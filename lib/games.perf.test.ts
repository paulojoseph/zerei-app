import { describe, expect, it } from 'vitest';

import { countByStatus, filterByStatus, filterGames, selectGames, sortGames, statusOf } from '@/lib/games';
import { loadFullCatalog } from '@/test/full-catalog';
import { medianMs } from '@/test/measure';
import type { GameStatus, UserGameProgress } from '@/types/game';

/**
 * Budget for the "Beat it!" click (INP ≤50ms on a mid-range Android, which is
 * ~4–6x slower than the CI machine). Slack for variation between machines.
 */
const CLICK_BUDGET_MS = 10;

const games = loadFullCatalog();
const progress: Record<string, UserGameProgress> = {};
// Typical user after onboarding: 200 marked games.
for (const g of games.slice(0, 200)) {
  progress[g.id] = { gameId: g.id, status: 'beaten', updatedAt: new Date().toISOString() };
}

/** The click changes one record: a new object, like Zustand does. */
function clickProgress(): Record<string, UserGameProgress> {
  const id = games[5000].id;
  return { ...progress, [id]: { gameId: id, status: 'beaten', updatedAt: new Date().toISOString() } };
}

/** Counters the way they used to be: one pass over the whole catalog per click. */
function statusCountsOld(p: Record<string, UserGameProgress>) {
  const counts: Record<GameStatus, number> = { beaten: 0, playing: 0, backlog: 0, unplayed: 0 };
  for (const game of games) counts[statusOf(p, game.id)] += 1;
  return counts;
}

describe(`"Beat it!" click with ${games.length} games`, () => {
  const sorted = sortGames(selectGames({ games, search: '', platform: 'all', brazilOnly: false }), games, 'recent', progress);

  // High timeout: measuring the OLD path (hundreds of ms per click with the full
  // catalog) 18 times is what takes long. The new path is instant.
  it('stays within budget and well below the old path', { timeout: 60_000 }, () => {
    const before = medianMs(() => {
      const next = clickProgress();
      filterGames({ games, progress: next, search: '', platform: 'all', status: 'all', brazilOnly: false, sort: 'recent' });
      statusCountsOld(next);
    });
    const after = medianMs(() => {
      const next = clickProgress();
      filterByStatus(sorted, next, 'all');
      countByStatus(games, next);
    });
    const afterWorst = medianMs(() => {
      const next = clickProgress();
      filterByStatus(sorted, next, 'beaten');
      countByStatus(games, next);
    });

    console.log(
      `before: ${before.toFixed(1)}ms · after: ${after.toFixed(2)}ms · ` +
        `after with the "Beaten" filter: ${afterWorst.toFixed(2)}ms`,
    );
    expect(afterWorst).toBeLessThan(CLICK_BUDGET_MS);
    expect(after * 10).toBeLessThan(before);
  });

  it('counts the same as the old way', () => {
    const { unplayed, ...rest } = statusCountsOld(progress);
    expect(countByStatus(games, progress)).toEqual({ ...rest, unplayed });
  });

  it('produces exactly the same list as the full path', () => {
    for (const status of ['all', 'beaten', 'unplayed'] as const) {
      const fast = filterByStatus(sorted, progress, status).map((g) => g.id);
      const full = filterGames({ games, progress, search: '', platform: 'all', status, brazilOnly: false, sort: 'recent' }).map(
        (g) => g.id,
      );
      expect(fast).toEqual(full);
    }
  });
});
