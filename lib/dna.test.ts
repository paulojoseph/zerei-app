import { describe, expect, it } from 'vitest';

import { computeDna, decodeDna, encodeDna } from '@/lib/dna';
import { CATEGORY_ORDER } from '@/lib/platforms';
import type { PlatformCategory, StatsSummary } from '@/types/game';

function stats(byPlatform: [string, number][], extra: Partial<StatsSummary> = {}): StatsSummary {
  const beaten = byPlatform.reduce((s, [, n]) => s + n, 0);
  const category: Record<string, PlatformCategory> = {
    'Mega Drive': '16-bit', 'Master System': '8-bit', 'Super Nintendo': '16-bit', 'PlayStation 4': 'modern',
    PlayStation: '32/64-bit', Arcade: '32/64-bit', 'Nintendo Switch': 'modern',
  };
  return {
    beaten, playing: 0, backlog: 0, unplayed: 0, catalogSize: 0, rated: 0, averageRating: 0, withNotes: 0, brazilBeaten: 0,
    byPlatform: byPlatform.map(([platform, n]) => ({ platform, category: category[platform] ?? 'modern', beaten: n })),
    byCategory: CATEGORY_ORDER.map((c) => ({
      category: c, label: c, color: '#000', total: 0,
      beaten: byPlatform.filter(([p]) => (category[p] ?? 'modern') === c).reduce((s, [, n]) => s + n, 0),
    })),
    byYear: [], byGenre: [{ label: 'Plataforma', count: 3 }], byDecade: [], timeline: [], topRated: [],
    ...extra,
  };
}

describe('Gamer DNA', () => {
  it('quem zerou mais Mega Drive e Master System é Cria da Locadora', () => {
    const dna = computeDna(stats([['Mega Drive', 20], ['Master System', 10], ['PlayStation 4', 5]]));
    expect(dna.archetype.label).toBe('Cria da Locadora');
    expect(dna.consoles.map((c) => c.label)).toEqual(['Mega Drive', 'Master System', 'PS4']);
    expect(dna.maker).toEqual({ name: 'Sega', pct: 86 });
  });

  it('Sony dominante e moderno é Geração PlayStation', () => {
    expect(computeDna(stats([['PlayStation 4', 30], ['PlayStation', 10], ['Nintendo Switch', 5]])).archetype.key).toBe('playstation');
  });

  it('ida e volta pela URL preserva tudo', () => {
    const dna = computeDna(stats([['Mega Drive', 20], ['Arcade', 9]]));
    expect(decodeDna(encodeDna(dna))).toEqual(dna);
  });

  it('cabe numa URL curta', () => {
    expect(encodeDna(computeDna(stats([['Mega Drive', 20], ['Master System', 10], ['PlayStation 4', 5]]))).length).toBeLessThan(120);
  });

  it('recusa links adulterados: texto livre, índices fora da lista, números absurdos, lixo', () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const valid = { v: 1, n: 10, a: 0, c: [[0, 10]], g: 0, e: 0, m: [0, 50] };
    expect(decodeDna(b64(valid))).not.toBeNull();
    expect(decodeDna(b64({ ...valid, a: 'COMPRE AGORA' }))).toBeNull();
    expect(decodeDna(b64({ ...valid, a: 999 }))).toBeNull();
    expect(decodeDna(b64({ ...valid, c: [[0, 10], [1, 2], [2, 3], [3, 4]] }))).toBeNull();
    expect(decodeDna(b64({ ...valid, c: [['<script>', 1]] }))).toBeNull();
    expect(decodeDna(b64({ ...valid, n: 1e12 }))).toBeNull();
    expect(decodeDna(b64({ ...valid, m: [0, 101] }))).toBeNull();
    expect(decodeDna(b64({ ...valid, v: 2 }))).toBeNull();
    expect(decodeDna('%%%')).toBeNull();
    expect(decodeDna('x'.repeat(500))).toBeNull();
    expect(decodeDna(null)).toBeNull();
  });
});
