/**
 * Zerei.app — modelo de dados central.
 * Tudo que o app persiste ou renderiza passa por estes tipos.
 */

/** Geração/era do console. Usado nas abas de segmentação visual. */
export type PlatformCategory =
  | '8-bit' // Phantom System/NES, Master System, Atari, MSX
  | '16-bit' // Mega Drive, SNES, Amiga
  | '32/64-bit' // PS1, Saturn, N64, Arcades/Neo Geo
  | '128-bit' // PS2, Xbox, GBA, PC Clássico
  | 'modern'; // PS3, PS4, PS5, Xbox One, PC Moderno

/** Situação de um jogo na vida do jogador. */
export type GameStatus = 'beaten' | 'playing' | 'backlog' | 'unplayed';

export interface Game {
  id: string;
  title: string;
  platform: string;
  category: PlatformCategory;
  releaseYear: number;
  coverUrl: string;
  summary?: string;
  /** Para filtros de nostalgia local (Tec Toy, fliperamas, locadoras). */
  isBrazilClassic?: boolean;
  /** Preenchido quando o jogo veio da busca IGDB e não da base local. */
  isCustom?: boolean;
  /** Veio do catálogo completo (public/catalog), não da curadoria da seed. */
  isCatalog?: boolean;
  /** 0–999: visitas na IGDB + número de avaliações. Ordena o clássico antes do obscuro. */
  popularity?: number;
  /** Gêneros (opcional; a IGDB devolve, a seed usa para busca textual). */
  genres?: string[];
}

export interface UserGameProgress {
  gameId: string;
  status: GameStatus;
  completedYear?: number;
  /** 1 a 5 estrelas. */
  rating?: number;
  notes?: string;
  /** Console do jogo (id de data/consoles.json): diz qual arquivo do catálogo carregar. */
  consoleId?: string;
  /** ISO string. */
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Filtros                                                                    */
/* -------------------------------------------------------------------------- */

export type CategoryFilter = PlatformCategory | 'all';
/** Nome do console (`Game.platform`) ou 'all'. */
export type PlatformFilter = string;
export type StatusFilter = GameStatus | 'all';
export type SortMode = 'recent' | 'title' | 'year-desc' | 'year-asc' | 'rating';

/* -------------------------------------------------------------------------- */
/*  Backup / restauração                                                       */
/* -------------------------------------------------------------------------- */

export const BACKUP_FORMAT = 'zerei.app/backup' as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** Progresso do usuário, indexado por gameId. */
  progress: Record<string, UserGameProgress>;
  /** Jogos adicionados manualmente / vindos da IGDB, para o backup ser completo. */
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
/*  Estatísticas                                                               */
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

/** Contagem por rótulo (gênero, década...). */
export interface CountStat {
  label: string;
  count: number;
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
  /** Zerados por gênero (um jogo conta em cada gênero que tem), do maior para o menor. */
  byGenre: CountStat[];
  /** Zerados por década de lançamento, em ordem cronológica. */
  byDecade: CountStat[];
  timeline: TimelineEntry[];
  topRated: TimelineEntry[];
}

/* -------------------------------------------------------------------------- */
/*  IGDB (rota /api/igdb/search)                                               */
/* -------------------------------------------------------------------------- */

export interface IgdbSearchResponse {
  /** `local` quando as credenciais não estão configuradas. */
  source: 'igdb' | 'local';
  results: Game[];
  /** Mensagem amigável quando caímos no fallback local ou deu erro. */
  notice?: string;
}
