import type {
  CategoryStat,
  CountStat,
  Game,
  PlatformCategory,
  PlatformStat,
  StatsSummary,
  TimelineEntry,
  UserGameProgress,
  YearStat,
} from '@/types/game';
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/platforms';

/**
 * Módulo puro de estatísticas: nada de React, store, `Date.now()` ou I/O.
 * Mesmo par (games, progress) sempre devolve o mesmo `StatsSummary` — é o que
 * permite chamar isto no render sem risco de divergência de hidratação.
 */

/** Desempate estável por título, com regras de acentuação do pt-BR. */
function byTitle(a: Game, b: Game): number {
  return a.title.localeCompare(b.title, 'pt-BR');
}

/** Datas ISO comparam bem lexicograficamente; o `?? ''` só protege dados legados. */
function updatedAtOf(progress: UserGameProgress): string {
  return progress.updatedAt ?? '';
}

/** Mais recente primeiro; empate cai no título para a ordem nunca oscilar. */
function byRecent(a: TimelineEntry, b: TimelineEntry): number {
  const compared = updatedAtOf(b.progress).localeCompare(updatedAtOf(a.progress));
  if (compared !== 0) return compared;
  return byTitle(a.game, b.game);
}

/** Maior valor de uma lista (0 quando vazia) — normaliza a altura das barras na UI. */
export function maxOf(values: number[]): number {
  let max = 0;
  for (const value of values) {
    if (value > max) max = value;
  }
  return max;
}

const MAX_TIMELINE = 12;
const MAX_TOP_RATED = 6;

interface CategoryTally {
  beaten: number;
  total: number;
}

export function computeStats(
  games: Game[],
  progress: Record<string, UserGameProgress>,
): StatsSummary {
  let beaten = 0;
  let playing = 0;
  let backlog = 0;
  let unplayed = 0;
  let rated = 0;
  let ratingSum = 0;
  let withNotes = 0;
  let brazilBeaten = 0;

  // Acumuladores indexados: evitam varrer o catálogo de novo por categoria/plataforma.
  const categoryTally = new Map<PlatformCategory, CategoryTally>(
    CATEGORY_ORDER.map((category): [PlatformCategory, CategoryTally] => [
      category,
      { beaten: 0, total: 0 },
    ]),
  );
  const platformTally = new Map<string, PlatformStat>();
  const yearTally = new Map<number, number>();
  const genreTally = new Map<string, number>();
  const decadeTally = new Map<number, number>();
  const beatenEntries: TimelineEntry[] = [];
  const ratedEntries: TimelineEntry[] = [];

  // Uma única passada pelo catálogo. Partir dos jogos (e não do `progress`)
  // descarta naturalmente progresso órfão de jogo que saiu da base.
  for (const game of games) {
    const category = categoryTally.get(game.category);
    if (category) category.total += 1;

    const entry = progress[game.id];
    if (!entry) {
      // Sem registro nenhum: conta como não jogado, igual ao status explícito.
      unplayed += 1;
      continue;
    }

    if (entry.rating !== undefined && entry.rating >= 1) {
      rated += 1;
      ratingSum += entry.rating;
      ratedEntries.push({ game, progress: entry });
    }
    if (entry.notes !== undefined && entry.notes.trim() !== '') withNotes += 1;

    switch (entry.status) {
      case 'beaten': {
        beaten += 1;
        if (game.isBrazilClassic) brazilBeaten += 1;
        if (category) category.beaten += 1;

        const platform = platformTally.get(game.platform);
        if (platform) platform.beaten += 1;
        // A geração do badge vem do primeiro zerado daquela plataforma —
        // na prática todos compartilham a mesma categoria.
        else platformTally.set(game.platform, { platform: game.platform, category: game.category, beaten: 1 });

        if (entry.completedYear !== undefined) {
          yearTally.set(entry.completedYear, (yearTally.get(entry.completedYear) ?? 0) + 1);
        }
        // Um jogo pode ter vários gêneros: conta em cada um.
        for (const genre of game.genres ?? []) genreTally.set(genre, (genreTally.get(genre) ?? 0) + 1);
        if (game.releaseYear > 0) {
          const decade = Math.floor(game.releaseYear / 10) * 10;
          decadeTally.set(decade, (decadeTally.get(decade) ?? 0) + 1);
        }

        beatenEntries.push({ game, progress: entry });
        break;
      }
      case 'playing':
        playing += 1;
        break;
      case 'backlog':
        backlog += 1;
        break;
      default:
        unplayed += 1;
        break;
    }
  }

  const byCategory: CategoryStat[] = CATEGORY_ORDER.map((category) => {
    const tally = categoryTally.get(category) ?? { beaten: 0, total: 0 };
    const meta = CATEGORY_META[category];
    return {
      category,
      label: meta.label,
      color: meta.color,
      beaten: tally.beaten,
      total: tally.total,
    };
  });

  const byPlatform: PlatformStat[] = [...platformTally.values()].sort(
    (a, b) => b.beaten - a.beaten || a.platform.localeCompare(b.platform, 'pt-BR'),
  );

  // Linha do tempo da vida: ano crescente para o gráfico ler da esquerda para a direita.
  const byYear: YearStat[] = [...yearTally.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const byGenre: CountStat[] = [...genreTally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));

  const byDecade: CountStat[] = [...decadeTally.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ label: `${decade}s`, count }));

  const timeline = beatenEntries.sort(byRecent).slice(0, MAX_TIMELINE);

  const topRated = ratedEntries
    .sort((a, b) => (b.progress.rating ?? 0) - (a.progress.rating ?? 0) || byRecent(a, b))
    .slice(0, MAX_TOP_RATED);

  return {
    beaten,
    playing,
    backlog,
    unplayed,
    catalogSize: games.length,
    rated,
    // Média com uma casa decimal (0 quando ninguém foi avaliado).
    averageRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : 0,
    withNotes,
    brazilBeaten,
    byCategory,
    byPlatform,
    byYear,
    byGenre,
    byDecade,
    timeline,
    topRated,
  };
}
