import seedData from '@/data/seed-games.json';
import type {
  Game,
  GameStatus,
  PlatformCategory,
  PlatformFilter,
  SortMode,
  StatusFilter,
  UserGameProgress,
} from '@/types/game';
import { CATEGORY_ORDER } from '@/lib/platforms';
import { platformSearchTerms } from '@/lib/platforms';
import { MAKER_PREFIX, MINE_FILTER, consoleByName, makerOf } from '@/lib/consoles';
import { normalize } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Local database                                                             */
/* -------------------------------------------------------------------------- */

const VALID_CATEGORIES = new Set<string>(CATEGORY_ORDER);

/** Normalizes the raw seed JSON into `Game[]` (drops invalid rows). */
function loadSeed(raw: unknown): Game[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const games: Game[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    const title = typeof item.title === 'string' ? item.title : '';
    const platform = typeof item.platform === 'string' ? item.platform : '';
    const category = typeof item.category === 'string' ? item.category : '';
    if (!id || !title || !platform || !VALID_CATEGORIES.has(category)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    games.push({
      id,
      title,
      platform,
      // The generation follows the console when it's known (colors and stats).
      category: consoleByName(platform)?.category ?? (category as PlatformCategory),
      releaseYear: typeof item.releaseYear === 'number' ? item.releaseYear : 0,
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : '',
      summary: typeof item.summary === 'string' ? item.summary : undefined,
      isBrazilClassic: item.isBrazilClassic === true,
      genres: Array.isArray(item.genres) ? (item.genres.filter((g) => typeof g === 'string') as string[]) : undefined,
    });
  }

  return games;
}

export const SEED_GAMES: Game[] = loadSeed(seedData);

/* -------------------------------------------------------------------------- */
/*  Search                                                                     */
/* -------------------------------------------------------------------------- */

const searchIndex = new Map<string, string>();

/** Searchable text: title + platform + nicknames + genres + year. */
export function searchTextOf(game: Game): string {
  const cached = searchIndex.get(game.id);
  if (cached) return cached;
  const text = normalize(
    [game.title, game.platform, platformSearchTerms(game.platform), game.genres?.join(' ') ?? '', String(game.releaseYear)].join(' '),
  );
  searchIndex.set(game.id, text);
  return text;
}

/** Forgiving search: every term must appear (AND), ignoring accents and case. */
export function matchesSearch(game: Game, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const haystack = searchTextOf(game);
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/* -------------------------------------------------------------------------- */
/*  Status helpers                                                             */
/* -------------------------------------------------------------------------- */

export function statusOf(progress: Record<string, UserGameProgress>, gameId: string): GameStatus {
  return progress[gameId]?.status ?? 'unplayed';
}


/* -------------------------------------------------------------------------- */
/*  Filter + sorting                                                           */
/* -------------------------------------------------------------------------- */

export interface FilterOptions {
  games: Game[];
  progress: Record<string, UserGameProgress>;
  search: string;
  platform: PlatformFilter;
  status: StatusFilter;
  brazilOnly: boolean;
  sort: SortMode;
}

const SORT_LABEL: Record<SortMode, string> = {
  recent: 'Recently updated',
  title: 'Title (A–Z)',
  'year-desc': 'Release (newest)',
  'year-asc': 'Release (oldest)',
  rating: 'Best score',
};

export const SORT_OPTIONS = (Object.keys(SORT_LABEL) as SortMode[]).map((id) => ({
  id,
  label: SORT_LABEL[id],
}));

const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Position of each game in alphabetical order, computed once per catalog.
 * With tens of thousands of games, comparing strings on every "Beat it!" click
 * would freeze the screen; comparing integers doesn't.
 */
const titleRankCache = new WeakMap<Game[], Map<string, number>>();

function titleRanks(games: Game[]): Map<string, number> {
  const cached = titleRankCache.get(games);
  if (cached) return cached;
  const sorted = [...games].sort((a, b) => collator.compare(a.title, b.title));
  const ranks = new Map(sorted.map((g, i) => [g.id, i]));
  titleRankCache.set(games, ranks);
  return ranks;
}

export type SelectionOptions = Pick<FilterOptions, 'games' | 'search' | 'platform' | 'brazilOnly'> & {
  /** Platform names of "My consoles" (MINE_FILTER). */
  mine?: ReadonlySet<string>;
};

/**
 * The slice that does NOT depend on user progress (console, search, preset).
 * Kept apart on purpose: marking "Beat it!" must not redo this work.
 */
export function selectGames({ games, search, platform, brazilOnly, mine }: SelectionOptions): Game[] {
  const maker = platform.startsWith(MAKER_PREFIX) ? platform.slice(MAKER_PREFIX.length) : null;
  return games.filter((game) => {
    if (platform === MINE_FILTER) {
      if (!mine?.has(game.platform)) return false;
    } else if (maker !== null) {
      if (makerOf(game.platform) !== maker) return false;
    } else if (platform !== 'all' && game.platform !== platform) {
      return false;
    }
    if (brazilOnly && !game.isBrazilClassic) return false;
    return matchesSearch(game, search);
  });
}

/**
 * Sorts a selection (new copy). `games` is the whole catalog, used only for
 * the cached alphabetical ranking; `progress` feeds "recent" and "score".
 */
export function sortGames(
  list: Game[],
  games: Game[],
  sort: SortMode,
  progress: Record<string, UserGameProgress>,
): Game[] {
  const result = [...list];
  const ranks = titleRanks(games);
  const byTitle = (a: Game, b: Game) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0);
  // Year 0 = unknown: goes to the end in both directions.
  const year = (g: Game, fallback: number) => g.releaseYear || fallback;

  switch (sort) {
    case 'title':
      result.sort(byTitle);
      break;
    case 'year-desc':
      result.sort((a, b) => year(b, -1) - year(a, -1) || byTitle(a, b));
      break;
    case 'year-asc':
      result.sort((a, b) => year(a, 9999) - year(b, 9999) || byTitle(a, b));
      break;
    case 'rating':
      result.sort((a, b) => (progress[b.id]?.rating ?? 0) - (progress[a.id]?.rating ?? 0) || byTitle(a, b));
      break;
    case 'recent':
    default:
      result.sort((a, b) => {
        const ua = progress[a.id]?.updatedAt ?? '';
        const ub = progress[b.id]?.updatedAt ?? '';
        if (ua !== ub) return ub.localeCompare(ua);
        // Curated games (with summary and reviewed cover) before the full catalog,
        // and inside the catalog, popular before obscure.
        if (!a.isCatalog !== !b.isCatalog) return a.isCatalog ? 1 : -1;
        const pa = a.popularity ?? 0;
        const pb = b.popularity ?? 0;
        if (pa !== pb) return pb - pa;
        const ra = CATEGORY_RANK.get(a.category) ?? 99;
        const rb = CATEGORY_RANK.get(b.category) ?? 99;
        if (ra !== rb) return ra - rb;
        return year(a, 9999) - year(b, 9999) || byTitle(a, b);
      });
      break;
  }

  return result;
}

/**
 * Indexes cached per array (WeakMap: they go away with the array). With them,
 * the steps that look at progress cost as much as the games the user marked
 * (hundreds), not the size of the catalog (tens of thousands).
 */
const positionCache = new WeakMap<Game[], Map<string, number>>();
const idSetCache = new WeakMap<Game[], Set<string>>();

function positionsOf(list: Game[]): Map<string, number> {
  let map = positionCache.get(list);
  if (!map) {
    map = new Map(list.map((g, i) => [g.id, i]));
    positionCache.set(list, map);
  }
  return map;
}

function idsOf(games: Game[]): Set<string> {
  let set = idSetCache.get(games);
  if (!set) {
    set = new Set(games.map((g) => g.id));
    idSetCache.set(games, set);
  }
  return set;
}

/** Status filter: the only step that looks at live progress. Keeps the order of `list`. */
export function filterByStatus(
  list: Game[],
  progress: Record<string, UserGameProgress>,
  status: StatusFilter,
): Game[] {
  if (status === 'all') return list;
  // "Not played" is almost the whole catalog, so there's no shortcut here.
  if (status === 'unplayed') return list.filter((game) => statusOf(progress, game.id) === 'unplayed');

  const positions = positionsOf(list);
  const hits: number[] = [];
  for (const id of Object.keys(progress)) {
    if (progress[id].status !== status) continue;
    const index = positions.get(id);
    if (index !== undefined) hits.push(index);
  }
  hits.sort((a, b) => a - b);
  return hits.map((index) => list[index]);
}

/**
 * How many catalog games are in each status. Walks only the progress;
 * orphan records (a game that left the catalog) don't count.
 */
export function countByStatus(
  games: Game[],
  progress: Record<string, UserGameProgress>,
): Record<GameStatus, number> {
  const ids = idsOf(games);
  const counts: Record<GameStatus, number> = { beaten: 0, playing: 0, backlog: 0, unplayed: 0 };
  for (const id of Object.keys(progress)) {
    if (ids.has(id)) counts[progress[id].status] += 1;
  }
  counts.unplayed = games.length - counts.beaten - counts.playing - counts.backlog;
  return counts;
}

/** Everything at once: selection → sorting → status. */
export function filterGames({ games, progress, search, platform, status, brazilOnly, sort }: FilterOptions): Game[] {
  const selected = selectGames({ games, search, platform, brazilOnly });
  return filterByStatus(sortGames(selected, games, sort, progress), progress, status);
}
