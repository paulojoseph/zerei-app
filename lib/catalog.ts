import type { Game } from '@/types/game';
import { CATALOG_COUNTS, CONSOLES, consoleByName, type ConsoleMeta } from '@/lib/consoles';

const BY_ID = new Map(CONSOLES.map((c) => [c.id, c]));

/**
 * Uma linha por OBRA (jogo), repetida no arquivo de cada console em que saiu —
 * formato v3 gerado por pipeline/build.mts (ADR 0005):
 * [id, título, ano original, capa, popularidade, gêneros, consoles (índices em
 *  meta.consoles, o original primeiro), crítica, nº críticas, público, nº votos]
 */
export type CatalogRow = [string, string, number, string, number, number[], number[], number, number, number, number];

export interface CatalogFile {
  v: 3;
  /** Prefixo da capa → URL base: i = IGDB, l = libretro, w = Wikimedia. */
  covers: Record<string, string>;
  games: CatalogRow[];
}

export interface CatalogMeta {
  v: 3;
  genres: string[];
  /** Ids de console na ordem dos índices das linhas. */
  consoles: string[];
}

/**
 * "i:co1r76" → URL da capa. O prefixo diz a origem; "i:" sem imagem é um jogo
 * da IGDB sem capa (o app desenha uma).
 */
export function coverUrl(covers: Record<string, string>, cover: string): string {
  const source = cover.slice(0, 1);
  const value = cover.slice(2);
  const base = covers[source];
  if (!value || !base) return '';
  if (source === 'i') return `${base}${value}.jpg`;
  // libretro guarda o nome cru do arquivo; a Wikimedia já vem codificada.
  if (source === 'l') return `${base}${encodeURIComponent(value)}.png`;
  return `${base}${value}`;
}

/** Converte linhas do catálogo em jogos. Puro: usado no app, nos testes e nos benchmarks. */
export function rowsToGames(rows: CatalogRow[], covers: Record<string, string>, meta: CatalogMeta): Game[] {
  const games: Game[] = [];
  for (const [id, title, year, cover, popularity, genres, platformIdx, critic, criticCount, user, userCount] of rows) {
    const platforms = platformIdx.map((i) => BY_ID.get(meta.consoles[i])).filter((c): c is ConsoleMeta => !!c);
    const original = platforms[0];
    if (!original) continue;
    games.push({
      id,
      title,
      platform: original.name,
      platforms: platforms.map((c) => c.name),
      category: original.category,
      releaseYear: year,
      coverUrl: coverUrl(covers, cover),
      genres: genres.length ? genres.map((g) => meta.genres[g]).filter(Boolean) : undefined,
      popularity,
      criticScore: critic || undefined,
      criticCount: criticCount || undefined,
      userScore: user || undefined,
      userCount: userCount || undefined,
      isCatalog: true,
    });
  }
  return games;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/*  Carregamento sob demanda                                                   */
/* -------------------------------------------------------------------------- */

/** Console de cada jogo já visto (preenchido conforme os arquivos chegam). */
const consoleOfGame = new Map<string, string>();
const CONSOLE_IDS = new Set(CONSOLES.map((c) => c.id));

/**
 * Console de um jogo pelo ID. Jogos já carregados vêm do registro; IDs do
 * formato antigo ("snes--chrono-trigger") trazem o console no prefixo.
 */
export function consoleIdOf(gameId: string): string | undefined {
  const known = consoleOfGame.get(gameId);
  if (known) return known;
  const prefix = gameId.split('--')[0];
  return gameId.includes('--') && CONSOLE_IDS.has(prefix) ? prefix : undefined;
}

let metaPromise: Promise<CatalogMeta> | null = null;
function loadMeta(): Promise<CatalogMeta> {
  metaPromise ??= fetchJson<CatalogMeta>('/catalog/meta.json').catch(() => ({ v: 3 as const, genres: [], consoles: [] }));
  return metaPromise;
}

/** Registra o console de origem (o arquivo onde o jogo vive), se ainda não houver. */
function register(games: Game[], consoleId?: string): Game[] {
  for (const game of games) {
    if (consoleOfGame.has(game.id)) continue;
    const id = consoleId ?? consoleByName(game.platform)?.id;
    if (id) consoleOfGame.set(game.id, id);
  }
  return games;
}

/** Os mais populares de todos os consoles (primeira tela da aba "Todos"). */
export async function fetchTopGames(): Promise<Game[]> {
  const [meta, data] = await Promise.all([loadMeta(), fetchJson<CatalogFile>('/catalog/top.json')]);
  return register(rowsToGames(data.games, data.covers, meta));
}

/** O catálogo inteiro de um console (obras que saíram nele, inclusive multiplataforma). */
export async function fetchConsoleGames(consoleId: string): Promise<Game[]> {
  if (!BY_ID.has(consoleId) || !CATALOG_COUNTS[consoleId]) return [];
  const [meta, data] = await Promise.all([loadMeta(), fetchJson<CatalogFile>(`/catalog/${consoleId}.json`)]);
  return register(rowsToGames(data.games, data.covers, meta), consoleId);
}

/** Todos os consoles que têm catálogo publicado. */
export const CATALOG_CONSOLE_IDS = CONSOLES.filter((c) => (CATALOG_COUNTS[c.id] ?? 0) > 0).map((c) => c.id);
