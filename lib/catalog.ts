import type { Game } from '@/types/game';
import { CATALOG_COUNTS, CONSOLES, type ConsoleMeta } from '@/lib/consoles';

/** [título, ano, capa, id estável] — formato compacto gerado por scripts/build-catalog.mjs (ADR 0002). */
type CatalogRow = [string, number, string, string];

export interface CatalogFile {
  base: string;
  games: CatalogRow[];
}

function coverUrl(console_: ConsoleMeta, base: string, cover: string): string {
  if (!cover) return '';
  // libretro guarda o nome cru do arquivo; Wikimedia já vem codificado.
  return console_.libretro ? `${base}${encodeURIComponent(cover)}.png` : `${base}${cover}`;
}

/** Converte um arquivo de catálogo em jogos. Puro: usado no app, nos testes e nos benchmarks. */
export function catalogToGames(console_: ConsoleMeta, data: CatalogFile): Game[] {
  return data.games.map(([title, year, cover, id]) => ({
    id,
    title,
    platform: console_.name,
    category: console_.category,
    releaseYear: year,
    coverUrl: coverUrl(console_, data.base, cover),
    isCatalog: true,
  }));
}

async function fetchConsole(console_: ConsoleMeta): Promise<Game[]> {
  const res = await fetch(`/catalog/${console_.id}.json`);
  if (!res.ok) throw new Error(`catálogo ${console_.id}: HTTP ${res.status}`);
  return catalogToGames(console_, (await res.json()) as CatalogFile);
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
