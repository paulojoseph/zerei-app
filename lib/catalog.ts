import type { Game } from '@/types/game';
import { CATALOG_COUNTS, CONSOLES, type ConsoleMeta } from '@/lib/consoles';

/**
 * [id estável, título, ano, capa codificada, popularidade, índices de gênero] —
 * formato v2 gerado por pipeline/build.mts (ADR 0004).
 */
export type CatalogRow = [string, string, number, string, number, number[]];

export interface CatalogFile {
  v: 2;
  /** Prefixo da capa → URL base: i = IGDB, l = libretro, w = Wikimedia. */
  covers: Record<string, string>;
  games: CatalogRow[];
}

export interface CatalogMeta {
  v: 2;
  genres: string[];
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

/** Converte um arquivo de catálogo em jogos. Puro: usado no app, nos testes e nos benchmarks. */
export function catalogToGames(console_: ConsoleMeta, data: CatalogFile, meta: CatalogMeta): Game[] {
  return data.games.map(([id, title, year, cover, popularity, genres]) => ({
    id,
    title,
    platform: console_.name,
    category: console_.category,
    releaseYear: year,
    coverUrl: coverUrl(data.covers, cover),
    genres: genres.length ? genres.map((g) => meta.genres[g]).filter(Boolean) : undefined,
    popularity,
    isCatalog: true,
  }));
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
const BY_ID = new Map(CONSOLES.map((c) => [c.id, c]));

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
  metaPromise ??= fetchJson<CatalogMeta>('/catalog/meta.json').catch(() => ({ v: 2 as const, genres: [] }));
  return metaPromise;
}

function register(consoleId: string, games: Game[]): Game[] {
  for (const game of games) consoleOfGame.set(game.id, consoleId);
  return games;
}

/** Os mais populares de todos os consoles (primeira tela da aba "Todos"). */
export async function fetchTopGames(): Promise<Game[]> {
  const [meta, data] = await Promise.all([
    loadMeta(),
    fetchJson<{ v: 2; covers: Record<string, string>; games: [string, ...CatalogRow][] }>('/catalog/top.json'),
  ]);
  const games: Game[] = [];
  for (const [consoleId, ...row] of data.games) {
    const console_ = BY_ID.get(consoleId);
    if (!console_) continue;
    const [game] = catalogToGames(console_, { v: 2, covers: data.covers, games: [row] }, meta);
    consoleOfGame.set(game.id, consoleId);
    games.push(game);
  }
  return games;
}

/** O catálogo inteiro de um console. */
export async function fetchConsoleGames(consoleId: string): Promise<Game[]> {
  const console_ = BY_ID.get(consoleId);
  if (!console_ || !CATALOG_COUNTS[consoleId]) return [];
  const [meta, data] = await Promise.all([loadMeta(), fetchJson<CatalogFile>(`/catalog/${consoleId}.json`)]);
  return register(consoleId, catalogToGames(console_, data, meta));
}

/** Todos os consoles que têm catálogo publicado. */
export const CATALOG_CONSOLE_IDS = CONSOLES.filter((c) => (CATALOG_COUNTS[c.id] ?? 0) > 0).map((c) => c.id);
