import { readFileSync } from 'node:fs';
import path from 'node:path';

import { rowsToGames, type CatalogFile, type CatalogMeta } from '@/lib/catalog';
import { CATALOG_COUNTS, CONSOLES } from '@/lib/consoles';
import { SEED_GAMES } from '@/lib/games';
import type { Game } from '@/types/game';

/** O catálogo inteiro (seed + public/catalog), montado exatamente como o app monta. */
export function loadFullCatalog(): Game[] {
  const dir = path.join(process.cwd(), 'public/catalog');
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as CatalogMeta;
  // Obras multiplataforma aparecem no arquivo de cada console: uma vez só aqui.
  const byId = new Map<string, Game>(SEED_GAMES.map((g) => [g.id, g]));
  for (const c of CONSOLES) {
    if (!CATALOG_COUNTS[c.id]) continue;
    const file = JSON.parse(readFileSync(path.join(dir, `${c.id}.json`), 'utf8')) as CatalogFile;
    for (const game of rowsToGames(file.games, file.covers, meta)) if (!byId.has(game.id)) byId.set(game.id, game);
  }
  return [...byId.values()];
}
