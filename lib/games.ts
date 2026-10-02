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
import { MAKER_PREFIX, consoleByName, makerOf } from '@/lib/consoles';
import { normalize } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Base local                                                                 */
/* -------------------------------------------------------------------------- */

const VALID_CATEGORIES = new Set<string>(CATEGORY_ORDER);

/** Normaliza o JSON cru da seed em `Game[]` (descarta linhas inválidas). */
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
      // A geração segue o console quando ele é conhecido (cores e estatísticas).
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
/*  Busca                                                                      */
/* -------------------------------------------------------------------------- */

const searchIndex = new Map<string, string>();

/** Texto pesquisável: título + plataforma + apelidos + gêneros + ano. */
export function searchTextOf(game: Game): string {
  const cached = searchIndex.get(game.id);
  if (cached) return cached;
  const text = normalize(
    [game.title, game.platform, platformSearchTerms(game.platform), game.genres?.join(' ') ?? '', String(game.releaseYear)].join(' '),
  );
  searchIndex.set(game.id, text);
  return text;
}

/** Busca tolerante: todos os termos precisam aparecer (AND), sem acento/caixa. */
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
/*  Filtro + ordenação                                                         */
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
  recent: 'Atualizados primeiro',
  title: 'Título (A–Z)',
  'year-desc': 'Lançamento (novos)',
  'year-asc': 'Lançamento (antigos)',
  rating: 'Melhor nota',
};

export const SORT_OPTIONS = (Object.keys(SORT_LABEL) as SortMode[]).map((id) => ({
  id,
  label: SORT_LABEL[id],
}));

const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * Posição de cada jogo na ordem alfabética, calculada uma vez por catálogo.
 * Com dezenas de milhares de jogos, comparar strings a cada clique em "Zerei!"
 * travaria a tela; comparar inteiros não.
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

export function filterGames({
  games,
  progress,
  search,
  platform,
  status,
  brazilOnly,
  sort,
}: FilterOptions): Game[] {
  const maker = platform.startsWith(MAKER_PREFIX) ? platform.slice(MAKER_PREFIX.length) : null;
  const result = games.filter((game) => {
    if (maker !== null) {
      if (makerOf(game.platform) !== maker) return false;
    } else if (platform !== 'all' && game.platform !== platform) {
      return false;
    }
    if (brazilOnly && !game.isBrazilClassic) return false;
    if (status !== 'all' && statusOf(progress, game.id) !== status) return false;
    if (!matchesSearch(game, search)) return false;
    return true;
  });

  const ranks = titleRanks(games);
  const byTitle = (a: Game, b: Game) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0);
  // Ano 0 = desconhecido: vai para o fim nas duas direções.
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
        // Curadoria (com resumo e capa revisada) antes do catálogo completo.
        if (!a.isCatalog !== !b.isCatalog) return a.isCatalog ? 1 : -1;
        const ra = CATEGORY_RANK.get(a.category) ?? 99;
        const rb = CATEGORY_RANK.get(b.category) ?? 99;
        if (ra !== rb) return ra - rb;
        return year(a, 9999) - year(b, 9999) || byTitle(a, b);
      });
      break;
  }

  return result;
}
