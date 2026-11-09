import { beforeEach, describe, expect, it } from 'vitest';

import { selectGames, SEED_GAMES } from '@/lib/games';
import { MINE_FILTER } from '@/lib/consoles';
import { useGameStore } from '@/stores/useGameStore';

const [a, b, c] = SEED_GAMES;
const store = () => useGameStore.getState();

beforeEach(() => {
  useGameStore.setState({ progress: {}, selection: [], myConsoles: [] });
});

describe('bulk marking', () => {
  it('marks several games in a single update', () => {
    let updates = 0;
    const unsubscribe = useGameStore.subscribe(() => (updates += 1));
    expect(store().setManyStatus([a.id, b.id, c.id], 'beaten')).toBe(3);
    unsubscribe();
    expect(updates).toBe(1);
    expect(Object.values(store().progress).map((p) => p.status)).toEqual(['beaten', 'beaten', 'beaten']);
  });

  it('bulk "Not played" only removes what has nothing to keep', () => {
    store().setManyStatus([a.id, b.id], 'beaten');
    store().updateProgress(a.id, { rating: 5, notes: 'beat it at the rental store' });
    store().setManyStatus([a.id, b.id], 'unplayed');
    expect(store().progress[a.id]).toMatchObject({ status: 'unplayed', rating: 5, notes: 'beat it at the rental store' });
    expect(store().progress[b.id]).toBeUndefined();
  });

  it('changes nothing (and triggers no re-render) when the status is already the requested one', () => {
    store().setManyStatus([a.id], 'beaten');
    const before = store().progress;
    store().setManyStatus([a.id], 'beaten');
    expect(store().progress).toBe(before);
  });

  it('selection toggles and clears', () => {
    store().toggleSelected(a.id);
    store().toggleSelected(b.id);
    store().toggleSelected(a.id);
    expect(store().selection).toEqual([b.id]);
    store().clearSelection();
    expect(store().selection).toEqual([]);
  });
});

describe('"My consoles" filter', () => {
  it('shows only games from the picked consoles', () => {
    const mine = new Set(['Master System', 'Mega Drive']);
    const list = selectGames({ games: SEED_GAMES, search: '', platform: MINE_FILTER, brazilOnly: false, mine });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((g) => mine.has(g.platform))).toBe(true);
  });

  it('with no consoles picked, shows nothing (instead of everything)', () => {
    expect(selectGames({ games: SEED_GAMES, search: '', platform: MINE_FILTER, brazilOnly: false, mine: new Set() })).toEqual([]);
  });
});
