import { readFileSync } from 'node:fs';
import path from 'node:path';

import { catalogToGames, type CatalogFile, type CatalogMeta } from '@/lib/catalog';
import { CATALOG_COUNTS, CONSOLES } from '@/lib/consoles';
import { SEED_GAMES } from '@/lib/games';
import type { Game } from '@/types/game';

/** The whole catalog (seed + public/catalog), built exactly the way the app builds it. */
export function loadFullCatalog(): Game[] {
  const dir = path.join(process.cwd(), 'public/catalog');
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as CatalogMeta;
  const games: Game[] = [...SEED_GAMES];
  for (const c of CONSOLES) {
    if (!CATALOG_COUNTS[c.id]) continue;
    const file = path.join(dir, `${c.id}.json`);
    games.push(...catalogToGames(c, JSON.parse(readFileSync(file, 'utf8')) as CatalogFile, meta));
  }
  return games;
}
