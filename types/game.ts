/**
 * Zerei.app — core data model.
 * Everything the app persists or renders goes through these types.
 */

/** Console generation/era. Used by the visual segmentation tabs. */
export type PlatformCategory =
  | '8-bit' // Phantom System/NES, Master System, Atari, MSX
  | '16-bit' // Mega Drive, SNES, Amiga
  | '32/64-bit' // PS1, Saturn, N64, Arcade/Neo Geo
  | '128-bit' // PS2, Xbox, GBA, Classic PC
  | 'modern'; // PS3, PS4, PS5, Xbox One, Modern PC

/** Where a game stands in the player's life. */
export type GameStatus = 'beaten' | 'playing' | 'backlog' | 'unplayed';

export interface Game {
  id: string;
  title: string;
  platform: string;
  category: PlatformCategory;
  releaseYear: number;
  coverUrl: string;
  summary?: string;
  /** For Brazilian nostalgia filters (Tec Toy, arcades, rental stores). */
  isBrazilClassic?: boolean;
  /** Set when the game came from IGDB search instead of the local database. */
  isCustom?: boolean;
  /** Came from the full catalog (public/catalog), not from the curated seed. */
  isCatalog?: boolean;
  /** 0–999: IGDB visits plus rating count. Puts the classic ahead of the obscure. */
  popularity?: number;
  /** Genres (optional; IGDB returns them, the seed uses them for text search). */
  genres?: string[];
}

export interface UserGameProgress {
  gameId: string;
  status: GameStatus;
  completedYear?: number;
  /** 1 to 5 stars. */
  rating?: number;
  notes?: string;
  /** The game's console (id from data/consoles.json): tells which catalog file to load. */
  consoleId?: string;
  /** ISO string. */
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Filters                                                                    */
/* -------------------------------------------------------------------------- */

export type CategoryFilter = PlatformCategory | 'all';
/** Console name (`Game.platform`) or 'all'. */
export type PlatformFilter = string;
export type StatusFilter = GameStatus | 'all';
export type SortMode = 'recent' | 'title' | 'year-desc' | 'year-asc' | 'rating';

/* -------------------------------------------------------------------------- */
/*  Backup / restore                                                           */
/* -------------------------------------------------------------------------- */

export const BACKUP_FORMAT = 'zerei.app/backup' as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** User progress, keyed by gameId. */
  progress: Record<string, UserGameProgress>;
  /** Games added by hand or from IGDB, so the backup is complete. */
  customGames: Game[];
  stats?: {
    beaten: number;
    total: number;
  };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  customGames: number;
  message: string;
}

/* -------------------------------------------------------------------------- */
/*  Stats                                                                      */
/* -------------------------------------------------------------------------- */

export interface CategoryStat {
  category: PlatformCategory;
  label: string;
  color: string;
  beaten: number;
  total: number;
}

export interface PlatformStat {
  platform: string;
  category: PlatformCategory;
  beaten: number;
}

export interface TimelineEntry {
  game: Game;
  progress: UserGameProgress;
}

export interface YearStat {
  year: number;
  count: number;
}

export interface StatsSummary {
  beaten: number;
  playing: number;
  backlog: number;
  unplayed: number;
  catalogSize: number;
  rated: number;
  averageRating: number;
  withNotes: number;
  brazilBeaten: number;
  byCategory: CategoryStat[];
  byPlatform: PlatformStat[];
  byYear: YearStat[];
  timeline: TimelineEntry[];
  topRated: TimelineEntry[];
}

/* -------------------------------------------------------------------------- */
/*  IGDB (/api/igdb/search route)                                              */
/* -------------------------------------------------------------------------- */

export interface IgdbSearchResponse {
  /** `local` when credentials are not configured. */
  source: 'igdb' | 'local';
  results: Game[];
  /** Friendly message when we fell back to local results or something failed. */
  notice?: string;
}
