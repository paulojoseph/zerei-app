import consolesData from '@/data/consoles.json';
import catalogIndex from '@/data/catalog-index.json';
import type { PlatformCategory } from '@/types/game';

/**
 * Consoles do catálogo, na ordem cronológica de lançamento. `name` é a mesma
 * string gravada em `Game.platform` — é por ela que o filtro casa os jogos.
 */
export interface ConsoleMeta {
  id: string;
  name: string;
  /** Rótulo curto dos botões de filtro. */
  label: string;
  short: string;
  maker: string;
  category: PlatformCategory;
  year: number;
  /** Pasta no acervo de box art do libretro (null = lista vem do Wikidata). */
  libretro: string | null;
  wikidata: string[];
}

export const CONSOLES = consolesData as ConsoleMeta[];

/** Quantos jogos cada console tem em `public/catalog/<id>.json`. */
export const CATALOG_COUNTS: Record<string, number> = catalogIndex;

export const CATALOG_TOTAL = Object.values(CATALOG_COUNTS).reduce((sum, n) => sum + n, 0);

/** Ordem dos fabricantes na barra de filtros. */
export const MAKER_ORDER = ['Nintendo', 'Sony', 'Sega', 'Microsoft', 'Atari', 'PC', 'Outros'];

const BY_NAME = new Map(CONSOLES.map((c) => [c.name, c]));

export function consoleByName(name: string): ConsoleMeta | undefined {
  return BY_NAME.get(name);
}

/** Fabricante de uma plataforma; o que não está na tabela cai em "Outros". */
export function makerOf(platform: string): string {
  return BY_NAME.get(platform)?.maker ?? 'Outros';
}

/** Filtro de fabricante viaja no mesmo campo do console: "maker:Sony". */
export const MAKER_PREFIX = 'maker:';
