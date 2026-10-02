import { beforeEach, describe, expect, it } from 'vitest';

import { selectGames, SEED_GAMES } from '@/lib/games';
import { MINE_FILTER } from '@/lib/consoles';
import { useGameStore } from '@/stores/useGameStore';

const [a, b, c] = SEED_GAMES;
const store = () => useGameStore.getState();

beforeEach(() => {
  useGameStore.setState({ progress: {}, selection: [], myConsoles: [] });
});

describe('marcação em lote', () => {
  it('marca vários jogos numa atualização só', () => {
    let updates = 0;
    const unsubscribe = useGameStore.subscribe(() => (updates += 1));
    expect(store().setManyStatus([a.id, b.id, c.id], 'beaten')).toBe(3);
    unsubscribe();
    expect(updates).toBe(1);
    expect(Object.values(store().progress).map((p) => p.status)).toEqual(['beaten', 'beaten', 'beaten']);
  });

  it('"Não joguei" em lote apaga só o que não tem nada para preservar', () => {
    store().setManyStatus([a.id, b.id], 'beaten');
    store().updateProgress(a.id, { rating: 5, notes: 'zerei na locadora' });
    store().setManyStatus([a.id, b.id], 'unplayed');
    expect(store().progress[a.id]).toMatchObject({ status: 'unplayed', rating: 5, notes: 'zerei na locadora' });
    expect(store().progress[b.id]).toBeUndefined();
  });

  it('não muda nada (nem dispara re-render) quando o status já é o pedido', () => {
    store().setManyStatus([a.id], 'beaten');
    const before = store().progress;
    store().setManyStatus([a.id], 'beaten');
    expect(store().progress).toBe(before);
  });

  it('seleção alterna e limpa', () => {
    store().toggleSelected(a.id);
    store().toggleSelected(b.id);
    store().toggleSelected(a.id);
    expect(store().selection).toEqual([b.id]);
    store().clearSelection();
    expect(store().selection).toEqual([]);
  });
});

describe('filtro "Meus consoles"', () => {
  it('mostra só os jogos dos consoles escolhidos', () => {
    const mine = new Set(['Master System', 'Mega Drive']);
    const list = selectGames({ games: SEED_GAMES, search: '', platform: MINE_FILTER, brazilOnly: false, mine });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((g) => mine.has(g.platform))).toBe(true);
  });

  it('sem consoles escolhidos, não mostra nada (em vez de tudo)', () => {
    expect(selectGames({ games: SEED_GAMES, search: '', platform: MINE_FILTER, brazilOnly: false, mine: new Set() })).toEqual([]);
  });
});

describe('migração de IDs (aliases baixados sob demanda)', () => {
  it('reaponta o progresso uma vez por versão do catálogo e não baixa de novo', async () => {
    let downloads = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      downloads += 1;
      return new Response(JSON.stringify({ 'ps4--gta-v': 'x360--gta-v' }));
    }) as typeof fetch;
    try {
      useGameStore.setState({
        progress: { 'ps4--gta-v': { gameId: 'ps4--gta-v', status: 'beaten', updatedAt: '2026-01-01' } },
        aliasesVersion: undefined,
      });
      await store().migrateIds();
      expect(Object.keys(store().progress)).toEqual(['x360--gta-v']);
      expect(store().aliasesVersion).toBeTruthy();
      await store().migrateIds();
      expect(downloads).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('quem não tem progresso não baixa o mapa', async () => {
    let downloads = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      downloads += 1;
      return new Response('{}');
    }) as typeof fetch;
    try {
      useGameStore.setState({ progress: {}, aliasesVersion: undefined });
      await store().migrateIds();
      expect(downloads).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
