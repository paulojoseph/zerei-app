import { describe, expect, it } from 'vitest';

import { filterGames, matchesSearch, SEED_GAMES } from '@/lib/games';
import type { Game } from '@/types/game';

// O índice de busca faz cache por ID: cada jogo de teste precisa do seu.
let seq = 0;
const game = (over: Partial<Game>): Game => ({
  id: over.id ?? `teste-${(seq += 1)}`,
  title: 'Jogo',
  platform: 'Mega Drive',
  category: '16-bit',
  releaseYear: 1992,
  coverUrl: '',
  ...over,
});

describe('busca', () => {
  it('ignora acento e caixa', () => {
    const monica = game({ title: 'Mônica no Castelo do Dragão', platform: 'Master System' });
    expect(matchesSearch(monica, 'monica dragao')).toBe(true);
    expect(matchesSearch(monica, 'MÔNICA')).toBe(true);
  });

  it('entende apelidos de console', () => {
    const sonic = game({ title: 'Sonic the Hedgehog 2' });
    expect(matchesSearch(sonic, 'sonic megadrive')).toBe(true);
    expect(matchesSearch(sonic, 'sonic genesis')).toBe(true);
    const mario = game({ title: 'Super Mario Bros.', platform: 'Phantom System / NES' });
    expect(matchesSearch(mario, 'mario nintendinho')).toBe(true);
  });

  it('todos os termos precisam bater (E, não OU)', () => {
    const sonic = game({ title: 'Sonic the Hedgehog 2' });
    expect(matchesSearch(sonic, 'sonic playstation')).toBe(false);
  });

  it('acha pelo ano de lançamento', () => {
    expect(matchesSearch(game({ title: 'Street Fighter II', releaseYear: 1991 }), 'street 1991')).toBe(true);
  });

  it('filtra por fabricante ("maker:Sega") e por console', () => {
    const sega = filterGames({ games: SEED_GAMES, progress: {}, search: '', platform: 'maker:Sega', status: 'all', brazilOnly: false, sort: 'title' });
    expect(sega.length).toBeGreaterThan(0);
    expect(sega.every((g) => ['Master System', 'Mega Drive', 'Sega Saturn', 'Dreamcast', 'Game Gear', 'Sega CD', '32X'].includes(g.platform))).toBe(true);

    const snes = filterGames({ games: SEED_GAMES, progress: {}, search: '', platform: 'Super Nintendo', status: 'all', brazilOnly: false, sort: 'title' });
    expect(snes.every((g) => g.platform === 'Super Nintendo')).toBe(true);
  });
});
