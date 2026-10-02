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
  /** Plataformas da IGDB que formam este console (NES = NES + Famicom). */
  igdb: number[];
  /** Filtro extra na consulta à IGDB (PC: só jogos com avaliação). */
  igdbWhere?: string;
}

export const CONSOLES = consolesData as ConsoleMeta[];

const INDEX = catalogIndex as Record<string, unknown>;

/** Quantos jogos cada console tem em `public/catalog/<id>.json` (multiplataforma conta em cada um). */
export const CATALOG_COUNTS: Record<string, number> = Object.fromEntries(
  Object.entries(INDEX).filter((e): e is [string, number] => !e[0].startsWith('_') && typeof e[1] === 'number'),
);

/** Jogos SEM repetição (um jogo multiplataforma conta uma vez), curadoria incluída. */
export const CATALOG_TOTAL =
  typeof INDEX._total === 'number' ? INDEX._total : Object.values(CATALOG_COUNTS).reduce((sum, n) => sum + n, 0);

/** Jogos sem repetição por fabricante. */
export const MAKER_COUNTS = (INDEX._makers ?? {}) as Record<string, number>;

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

/** Filtro "Meus consoles" (os escolhidos no onboarding). */
export const MINE_FILTER = 'mine';
