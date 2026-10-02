import type { Game } from '@/types/game';
import { CATALOG_COUNTS, CONSOLES, type ConsoleMeta } from '@/lib/consoles';

/** [título, ano, capa, slug] — formato compacto gerado por scripts/build-catalog.mjs. */
type CatalogRow = [string, number, string, string];

interface CatalogFile {
  base: string;
  games: CatalogRow[];
}

function coverUrl(console_: ConsoleMeta, base: string, cover: string): string {
  if (!cover) return '';
  // libretro guarda o nome cru do arquivo; Wikimedia já vem codificado.
  return console_.libretro ? `${base}${encodeURIComponent(cover)}.png` : `${base}${cover}`;
}

async function fetchConsole(console_: ConsoleMeta): Promise<Game[]> {
  const res = await fetch(`/catalog/${console_.id}.json`);
  if (!res.ok) throw new Error(`catálogo ${console_.id}: HTTP ${res.status}`);
  const data = (await res.json()) as CatalogFile;
  return data.games.map(([title, year, cover, slug]) => ({
    id: `${console_.id}--${slug}`,
    title,
    platform: console_.name,
    category: console_.category,
    releaseYear: year,
    coverUrl: coverUrl(console_, data.base, cover),
    isCatalog: true,
  }));
}

/**
 * Baixa o catálogo de todos os consoles em paralelo, entregando cada um assim
 * que chega (`onConsole`). Resolve com a quantidade de consoles que falharam.
 */
export async function loadCatalog(onConsole: (games: Game[]) => void): Promise<number> {
  const targets = CONSOLES.filter((c) => (CATALOG_COUNTS[c.id] ?? 0) > 0);
  const results = await Promise.allSettled(
    targets.map((c) => fetchConsole(c).then((games) => onConsole(games))),
  );
  return results.filter((r) => r.status === 'rejected').length;
}
