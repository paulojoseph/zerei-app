import consolesData from '@/data/consoles.json';
import catalogIndex from '@/data/catalog-index.json';
import type { PlatformCategory } from '@/types/game';

/**
 * Catalog consoles, in chronological release order. `name` is the same string
 * stored in `Game.platform`, and it's what the filter matches games by.
 */
export interface ConsoleMeta {
  id: string;
  name: string;
  /** Short label for the filter buttons. */
  label: string;
  short: string;
  maker: string;
  category: PlatformCategory;
  year: number;
  /** Folder in the libretro box art collection (null = list comes from Wikidata). */
  libretro: string | null;
  wikidata: string[];
  /** IGDB platforms that make up this console (NES = NES + Famicom). */
  igdb: number[];
  /** Extra filter on the IGDB query (PC: only rated games). */
  igdbWhere?: string;
}

export const CONSOLES = consolesData as ConsoleMeta[];

/** How many games each console has in `public/catalog/<id>.json`. */
export const CATALOG_COUNTS: Record<string, number> = catalogIndex;

export const CATALOG_TOTAL = Object.values(CATALOG_COUNTS).reduce((sum, n) => sum + n, 0);

/** Maker order in the filter bar. */
export const MAKER_ORDER = ['Nintendo', 'Sony', 'Sega', 'Microsoft', 'Atari', 'PC', 'Other'];

const BY_NAME = new Map(CONSOLES.map((c) => [c.name, c]));

export function consoleByName(name: string): ConsoleMeta | undefined {
  return BY_NAME.get(name);
}

/** Maker of a platform; anything not in the table falls into "Other". */
export function makerOf(platform: string): string {
  return BY_NAME.get(platform)?.maker ?? 'Other';
}

/** The maker filter travels in the same field as the console: "maker:Sony". */
export const MAKER_PREFIX = 'maker:';

/** "My consoles" filter (the ones picked during onboarding). */
export const MINE_FILTER = 'mine';
