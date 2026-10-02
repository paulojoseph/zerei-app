import { describe, expect, it } from 'vitest';

import { countByStatus, filterByStatus, filterGames, selectGames, sortGames, statusOf } from '@/lib/games';
import { loadFullCatalog } from '@/test/full-catalog';
import { medianMs } from '@/test/measure';
import type { GameStatus, UserGameProgress } from '@/types/game';

/**
 * Orçamento do clique em "Zerei!" (INP ≤ 50 ms num Android intermediário, que é
 * ~4–6x mais lento que a máquina de CI). Folga para variação entre máquinas.
 */
const CLICK_BUDGET_MS = 10;

const games = loadFullCatalog();
const progress: Record<string, UserGameProgress> = {};
// Usuário típico depois do onboarding: 200 jogos marcados.
for (const g of games.slice(0, 200)) {
  progress[g.id] = { gameId: g.id, status: 'beaten', updatedAt: new Date().toISOString() };
}

/** O clique muda um registro: objeto novo, como o Zustand faz. */
function clickProgress(): Record<string, UserGameProgress> {
  const id = games[5000].id;
  return { ...progress, [id]: { gameId: id, status: 'beaten', updatedAt: new Date().toISOString() } };
}

/** Contadores como eram antes: uma passada pelo catálogo inteiro a cada clique. */
function statusCountsOld(p: Record<string, UserGameProgress>) {
  const counts: Record<GameStatus, number> = { beaten: 0, playing: 0, backlog: 0, unplayed: 0 };
  for (const game of games) counts[statusOf(p, game.id)] += 1;
  return counts;
}

describe(`clique em "Zerei!" com ${games.length} jogos`, () => {
  const sorted = sortGames(selectGames({ games, search: '', platform: 'all', brazilOnly: false }), games, 'recent', progress);

  it('fica dentro do orçamento e bem abaixo do caminho antigo', () => {
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
      `antes: ${before.toFixed(1)} ms · depois: ${after.toFixed(2)} ms · ` +
        `depois com filtro "Zerei!": ${afterWorst.toFixed(2)} ms`,
    );
    expect(afterWorst).toBeLessThan(CLICK_BUDGET_MS);
    expect(after * 10).toBeLessThan(before);
  });

  it('conta igual ao jeito antigo', () => {
    const { unplayed, ...rest } = statusCountsOld(progress);
    expect(countByStatus(games, progress)).toEqual({ ...rest, unplayed });
  });

  it('produz exatamente a mesma lista que o caminho completo', () => {
    for (const status of ['all', 'beaten', 'unplayed'] as const) {
      const fast = filterByStatus(sorted, progress, status).map((g) => g.id);
      const full = filterGames({ games, progress, search: '', platform: 'all', status, brazilOnly: false, sort: 'recent' }).map(
        (g) => g.id,
      );
      expect(fast).toEqual(full);
    }
  });
});
