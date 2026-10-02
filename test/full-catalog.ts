import { readFileSync } from 'node:fs';
import path from 'node:path';

import { catalogToGames, type CatalogFile } from '@/lib/catalog';
import { CATALOG_COUNTS, CONSOLES } from '@/lib/consoles';
import { SEED_GAMES } from '@/lib/games';
import type { Game } from '@/types/game';

/** O catálogo inteiro (seed + public/catalog), montado exatamente como o app monta. */
export function loadFullCatalog(): Game[] {
  const games: Game[] = [...SEED_GAMES];
  for (const c of CONSOLES) {
    if (!CATALOG_COUNTS[c.id]) continue;
    const file = path.join(process.cwd(), 'public/catalog', `${c.id}.json`);
    games.push(...catalogToGames(c, JSON.parse(readFileSync(file, 'utf8')) as CatalogFile));
  }
  return games;
}
