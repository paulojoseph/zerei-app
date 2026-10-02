/**
 * Zerei — pipeline do catálogo a partir da IGDB (ADR 0004).
 *
 *   node pipeline/build.mts                     # todos os consoles
 *   node pipeline/build.mts --only=nes,snes     # só alguns
 *   node pipeline/build.mts --fresh             # ignora o cache da IGDB
 *   node pipeline/build.mts --allow-removals    # aceita IDs sumindo (de propósito)
 *
 * Para cada console de data/consoles.json com plataformas da IGDB:
 *   1. extrai os jogos (só tipos que são "um jogo": principal, remake,
 *      remaster, port, expanded, standalone);
 *   2. descarta relançamentos (jogo muito anterior ao console: Virtual
 *      Console, Arcade Archives...);
 *   3. ordena por popularidade (visitas na IGDB + número de avaliações);
 *   4. dá a cada Edição (obra × console) um ID estável: o ID já publicado se
 *      ela casa com um jogo do catálogo anterior, senão um ID novo (ADR 0002);
 *   5. mantém, com a fonte antiga, os jogos do catálogo anterior sem par na
 *      IGDB — nenhum progresso salvo se perde.
 *
 * Saída (gravada só se a trava de IDs passar — tudo ou nada):
 *   public/catalog/<console>.json  lista enxuta que o app carrega
 *   public/catalog/meta.json       dicionário de gêneros (PT-BR)
 *   public/catalog/top.json        os mais populares de todos os consoles (a
 *                                  primeira tela não baixa o catálogo inteiro)
 *   data/catalog-index.json        quantidade por console
 *   data/id-map.json               chave de origem -> ID
 *   .cache/pipeline/details/       detalhes por jogo (resumo, empresas,
 *                                  similares, IDs externos) — artefato da Fase 2
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { IgdbClient } from './igdb.mts';
import { matchKeys, mintId, normKey } from './normalize.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/catalog');
const DETAILS_DIR = path.join(ROOT, '.cache/pipeline/details');
const INDEX_FILE = path.join(ROOT, 'data/catalog-index.json');
const ID_MAP_FILE = path.join(ROOT, 'data/id-map.json');
const ALIASES_FILE = path.join(ROOT, 'data/id-aliases.json');

const COVER_BASES = {
  i: 'https://images.igdb.com/igdb/image/upload/t_cover_big/',
  w: 'https://upload.wikimedia.org/wikipedia/',
} as const;

/** Tipos da IGDB que são "um jogo" para marcar como zerado (`game_types`). */
const ACCEPTED_TYPES = [0, 4, 8, 9, 10, 11];
const REMAKE_TYPES = new Set([8, 9]);
/** Anos entre o lançamento original e o do console acima dos quais é relançamento. */
const RERELEASE_GAP = 7;
/** Quantos jogos entram em top.json (primeira tela da aba "Todos"). */
const TOP_SIZE = 3000;

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const allowRemovals = args.includes('--allow-removals');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                      */
/* -------------------------------------------------------------------------- */

interface ConsoleDef {
  id: string;
  name: string;
  year: number;
  libretro: string | null;
  igdb: number[];
  igdbWhere?: string;
}

interface Named {
  id: number;
  name: string;
}

interface IgdbGame {
  id: number;
  name: string;
  slug?: string;
  game_type?: number;
  first_release_date?: number;
  alternative_names?: { name: string }[];
  release_dates?: { platform?: number; date?: number }[];
  genres?: number[];
  themes?: number[];
  game_modes?: number[];
  player_perspectives?: number[];
  franchises?: Named[];
  involved_companies?: { company?: Named; developer?: boolean; publisher?: boolean }[];
  cover?: { image_id?: string };
  summary?: string;
  similar_games?: number[];
  external_games?: { external_game_source?: number; uid?: string }[];
  total_rating?: number;
  total_rating_count?: number;
}

/** [id, título, ano, capa codificada, popularidade, índices de gênero] */
type Row = [string, string, number, string, number, number[]];

interface CatalogFileV2 {
  v: 2;
  covers: Record<string, string>;
  games: Row[];
}

/* -------------------------------------------------------------------------- */
/*  Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const yearOf = (unix?: number) => (unix ? new Date(unix * 1000).getUTCFullYear() : 0);

/** Gêneros da IGDB em PT-BR (o nome em inglês é a chave; o que faltar fica em inglês). */
const GENRE_PT: Record<string, string> = {
  'Point-and-click': 'Point-and-click',
  Fighting: 'Luta',
  Shooter: 'Tiro',
  Music: 'Música',
  Platform: 'Plataforma',
  Puzzle: 'Quebra-cabeça',
  Racing: 'Corrida',
  'Real Time Strategy (RTS)': 'Estratégia em tempo real',
  'Role-playing (RPG)': 'RPG',
  Simulator: 'Simulação',
  Sport: 'Esporte',
  Strategy: 'Estratégia',
  'Turn-based strategy (TBS)': 'Estratégia por turnos',
  Tactical: 'Tático',
  "Hack and slash/Beat 'em up": 'Briga de rua / Hack and slash',
  'Quiz/Trivia': 'Quiz',
  Pinball: 'Pinball',
  Adventure: 'Aventura',
  Indie: 'Indie',
  Arcade: 'Arcade',
  'Visual Novel': 'Visual novel',
  'Card & Board Game': 'Cartas e tabuleiro',
  MOBA: 'MOBA',
};

/* -------------------------------------------------------------------------- */
/*  Catálogo anterior (para preservar IDs e carregar o que a IGDB não tem)     */
/* -------------------------------------------------------------------------- */

interface PrevRow {
  id: string;
  title: string;
  year: number;
  cover: string;
  pop: number;
  genres: number[];
  legacy: boolean;
}

interface PrevCatalog {
  rows: PrevRow[];
  covers: Record<string, string>;
}

/** Lê o arquivo publicado do console, no formato antigo (v1) ou no novo (v2). */
async function readPrevious(console_: ConsoleDef): Promise<PrevCatalog> {
  const raw = await readJson<{ v?: number; base?: string; covers?: Record<string, string>; games?: unknown[][] }>(
    path.join(OUT_DIR, `${console_.id}.json`),
    { games: [] },
  );
  if (raw.v === 2) {
    const rows = (raw.games as Row[]).map(([id, title, year, cover, pop, genres]) => ({
      id,
      title,
      year,
      cover,
      pop,
      genres,
      legacy: !cover.startsWith('i:'),
    }));
    return { rows, covers: raw.covers ?? {} };
  }
  // v1: [título, ano, capa crua, id]; capa do libretro (nome do arquivo) ou da Wikimedia (caminho).
  const prefix = console_.libretro ? 'l' : 'w';
  const rows = ((raw.games ?? []) as [string, number, string, string][]).map(([title, year, cover, id]) => ({
    id,
    title,
    year,
    cover: cover ? `${prefix}:${cover}` : '',
    pop: 0,
    genres: [],
    legacy: true,
  }));
  const covers: Record<string, string> = { w: COVER_BASES.w };
  if (console_.libretro && raw.base) covers.l = raw.base;
  return { rows, covers };
}

/* -------------------------------------------------------------------------- */
/*  Extração                                                                   */
/* -------------------------------------------------------------------------- */

const GAME_FIELDS = [
  'name',
  'slug',
  'game_type',
  'first_release_date',
  'alternative_names.name',
  'release_dates.platform',
  'release_dates.date',
  'genres',
  'themes',
  'game_modes',
  'player_perspectives',
  'franchises.name',
  'involved_companies.company.name',
  'involved_companies.developer',
  'involved_companies.publisher',
  'cover.image_id',
  'summary',
  'similar_games',
  'external_games.external_game_source',
  'external_games.uid',
  'total_rating',
  'total_rating_count',
].join(',');

async function extractConsole(igdb: IgdbClient, console_: ConsoleDef): Promise<IgdbGame[]> {
  const where = [
    `platforms = (${console_.igdb.join(',')})`,
    `game_type = (${ACCEPTED_TYPES.join(',')})`,
    'version_parent = null',
    console_.igdbWhere,
  ]
    .filter(Boolean)
    .join(' & ');
  return igdb.queryAll<IgdbGame>('games', `fields ${GAME_FIELDS}; where ${where}; sort id asc;`);
}

/** Visitas na IGDB dos jogos mais vistos (sinal de popularidade). */
async function extractPopularity(igdb: IgdbClient): Promise<Map<number, number>> {
  const visits = new Map<number, number>();
  for (let offset = 0; offset < 30_000; offset += 500) {
    const page = await igdb.query<{ game_id: number; value: number }>(
      'popularity_primitives',
      `fields game_id,value; where popularity_type = 1; sort value desc; limit 500; offset ${offset};`,
    );
    for (const p of page) visits.set(p.game_id, p.value);
    if (page.length < 500) break;
  }
  return visits;
}

/* -------------------------------------------------------------------------- */
/*  Transformação                                                              */
/* -------------------------------------------------------------------------- */

function popularityOf(game: IgdbGame, visits: Map<number, number>): number {
  const v = visits.get(game.id) ?? 0;
  // Visitas vêm em escala pequena (fração); avaliações são contagem. Log nas duas.
  const score = 40 * Math.log10(1 + v * 10_000) + 120 * Math.log10(1 + (game.total_rating_count ?? 0));
  return Math.min(999, Math.round(score));
}

/** Ano do jogo NESTE console (o lançamento mais antigo nas plataformas dele). */
function consoleYear(game: IgdbGame, console_: ConsoleDef): number {
  const platforms = new Set(console_.igdb);
  const years = (game.release_dates ?? [])
    .filter((r) => r.platform !== undefined && platforms.has(r.platform) && r.date)
    .map((r) => yearOf(r.date));
  return years.length ? Math.min(...years) : yearOf(game.first_release_date);
}

/** Relançamento: obra muito anterior ao console (Virtual Console, Arcade Archives...). */
function isRerelease(game: IgdbGame, console_: ConsoleDef, year: number): boolean {
  if (REMAKE_TYPES.has(game.game_type ?? 0)) return false;
  const original = yearOf(game.first_release_date);
  if (!original || original >= console_.year - 1) return false;
  return (year || original) - original > RERELEASE_GAP;
}

/* -------------------------------------------------------------------------- */
/*  Montagem                                                                   */
/* -------------------------------------------------------------------------- */

const consoles = (await readJson<ConsoleDef[]>(path.join(ROOT, 'data/consoles.json'), [])).filter(
  (c) => c.igdb.length > 0 && (!only || only.has(c.id)),
);
const seed = await readJson<{ title: string; platform: string }[]>(path.join(ROOT, 'data/seed-games.json'), []);
const index = await readJson<Record<string, number>>(INDEX_FILE, {});
const idMap = await readJson<Record<string, Record<string, string>>>(ID_MAP_FILE, {});
const aliases = await readJson<Record<string, string>>(ALIASES_FILE, {});
const takenIds = new Set(Object.values(idMap).flatMap((m) => Object.values(m)));
/** Fusões descobertas nesta execução (gravadas em data/id-aliases.json). */
const newAliases: Record<string, string> = {};

const igdb = new IgdbClient(fresh);
const startedAt = Date.now();

const genreList = await igdb.query<Named>('genres', 'fields id,name; limit 500; sort id asc;');
const genreNames = genreList.map((g) => GENRE_PT[g.name] ?? g.name);
const genreIndex = new Map(genreList.map((g, i) => [g.id, i]));
const visits = await extractPopularity(igdb);

interface Output {
  console: ConsoleDef;
  file: CatalogFileV2;
  details: Record<string, unknown>;
  stats: { igdb: number; reReleases: number; adopted: number; minted: number; legacy: number };
}

const outputs: Output[] = [];
const violations: string[] = [];

for (const console_ of consoles) {
  process.stdout.write(`${console_.name}… `);
  const games = await extractConsole(igdb, console_);
  const prev = await readPrevious(console_);
  const consoleMap = (idMap[console_.id] ??= {});
  const published = new Set(Object.values(consoleMap));
  const seedKeys = new Set(seed.filter((g) => g.platform === console_.name).map((g) => normKey(g.title)));

  // Jogos do catálogo anterior que ainda não vêm da IGDB, por título normalizado.
  const legacyByKey = new Map<string, PrevRow[]>();
  for (const row of prev.rows.filter((r) => r.legacy)) {
    for (const key of matchKeys(row.title)) legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), row]);
  }
  const claimed = new Set<string>();
  const usedIds = new Set<string>();

  const stats = { igdb: games.length, reReleases: 0, adopted: 0, merged: 0, minted: 0, legacy: 0 };
  const rows: Row[] = [];
  const details: Record<string, unknown> = {};

  // Os populares escolhem primeiro: num empate de nome, o clássico herda o ID antigo.
  const ranked = games
    .map((game) => ({ game, pop: popularityOf(game, visits), year: consoleYear(game, console_) }))
    .sort((a, b) => b.pop - a.pop || a.game.id - b.game.id);

  // Primeira passada: casamento pelo NOME PRINCIPAL. Sem ela, um jogo mais
  // popular "rouba" o par pelo nome alternativo ("T2: The Arcade Game" tem o
  // alternativo "Terminator 2: Judgment Day", que é o nome do jogo de NES).
  const primaryClaim = new Map<number, PrevRow>();
  const primaryClaimed = new Set<string>();
  for (const { game } of ranked) {
    const row = matchKeys(game.name)
      .flatMap((k) => legacyByKey.get(k) ?? [])
      .find((r) => !primaryClaimed.has(r.id));
    if (row) {
      primaryClaim.set(game.id, row);
      primaryClaimed.add(row.id);
    }
  }

  for (const { game, pop, year } of ranked) {
    if (isRerelease(game, console_, year)) {
      stats.reReleases += 1;
      continue;
    }
    const names = [game.name, ...(game.alternative_names ?? []).map((a) => a.name)];
    if (names.some((n) => seedKeys.has(normKey(n)))) continue;
    const keys = [...new Set(names.flatMap(matchKeys))];
    // Jogos do catálogo antigo que são este mesmo jogo (nome, nome regional, romanização).
    const own = primaryClaim.get(game.id);
    const matches = [
      ...new Set([
        ...(own ? [own] : []),
        ...keys
          .flatMap((k) => legacyByKey.get(k) ?? [])
          // Par já reservado pelo nome principal de outro jogo não entra aqui.
          .filter((row) => !primaryClaimed.has(row.id)),
      ]),
    ].filter((row) => !claimed.has(row.id) && !usedIds.has(row.id));

    const sourceKey = `igdb:${game.id}`;
    let id: string | undefined = consoleMap[sourceKey];
    if (id && usedIds.has(id)) id = undefined;
    if (!id && matches.length) {
      id = matches[0].id;
      stats.adopted += 1;
    }
    if (!id) {
      id = mintId(takenIds, randomBytes);
      stats.minted += 1;
    }
    usedIds.add(id);
    takenIds.add(id);
    consoleMap[sourceKey] ??= id;
    // Os demais pares no catálogo antigo são o mesmo jogo com outro nome
    // ("Dragon Quest" x "Dragon Warrior"): viram alias, e o progresso salvo migra.
    for (const row of matches) {
      claimed.add(row.id);
      if (row.id === id) continue;
      aliases[row.id] = id;
      newAliases[row.id] = id;
      stats.merged += 1;
    }

    const genres = (game.genres ?? []).map((g) => genreIndex.get(g)).filter((g): g is number => g !== undefined);
    // "i:" sem imagem = jogo da IGDB sem capa (o prefixo marca a origem).
    rows.push([id, game.name, year, `i:${game.cover?.image_id ?? ''}`, pop, genres]);

    const companies = game.involved_companies ?? [];
    details[id] = {
      igdb: game.id,
      slug: game.slug,
      summary: game.summary,
      altNames: game.alternative_names?.map((a) => a.name),
      genres: game.genres,
      themes: game.themes,
      modes: game.game_modes,
      perspectives: game.player_perspectives,
      franchises: game.franchises?.map((f) => f.name),
      developers: companies.filter((c) => c.developer).map((c) => c.company?.name),
      publishers: companies.filter((c) => c.publisher).map((c) => c.company?.name),
      similar: game.similar_games,
      external: game.external_games?.map((e) => [e.external_game_source, e.uid]),
      rating: game.total_rating ? Math.round(game.total_rating) : undefined,
      ratingCount: game.total_rating_count,
    };
  }

  // O que a IGDB não trouxe continua, com a fonte antiga (sem perder progresso).
  for (const row of prev.rows) {
    if (usedIds.has(row.id) || aliases[row.id]) continue;
    usedIds.add(row.id);
    rows.push([row.id, row.title, row.year, row.cover, row.pop, row.genres]);
    stats.legacy += 1;
  }

  // A trava (ADR 0002): todo ID já publicado continua existindo ou tem alias.
  const missing = [...published].filter((id) => !usedIds.has(id) && !aliases[id]);
  if (missing.length) {
    violations.push(`${console_.name}: ${missing.length} ID(s) sumiriam (ex.: ${missing.slice(0, 5).join(', ')})`);
  }

  rows.sort((a, b) => b[4] - a[4] || a[1].localeCompare(b[1], 'en'));
  const covers: Record<string, string> = { i: COVER_BASES.i, ...prev.covers };
  outputs.push({ console: console_, file: { v: 2, covers, games: rows }, details, stats });

  const withCover = rows.filter((r) => r[3].length > 2).length;
  console.log(
    `${rows.length} jogos · capa ${Math.round((withCover / rows.length) * 100)}% · ` +
      `IGDB ${stats.igdb} (−${stats.reReleases} relançamentos) · IDs: ${stats.adopted} herdados, ` +
      `${stats.merged} fundidos, ${stats.minted} novos · ${stats.legacy} só no catálogo antigo`,
  );
}

if (violations.length) {
  console.error(`\n${allowRemovals ? 'AVISO' : 'ERRO'}: IDs publicados sumiriam sem alias em data/id-aliases.json:`);
  for (const v of violations) console.error(`  - ${v}`);
  if (!allowRemovals) {
    console.error('Nada foi gravado. Adicione os aliases (idAntigo -> idNovo) ou rode com --allow-removals de propósito.');
    process.exit(1);
  }
}

await mkdir(OUT_DIR, { recursive: true });
await mkdir(DETAILS_DIR, { recursive: true });
for (const out of outputs) {
  await writeFile(path.join(OUT_DIR, `${out.console.id}.json`), JSON.stringify(out.file));
  await writeFile(path.join(DETAILS_DIR, `${out.console.id}.json`), JSON.stringify(out.details));
  index[out.console.id] = out.file.games.length;
}
await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify({ v: 2, genres: genreNames }));

// top.json: os mais populares entre TODOS os consoles publicados (inclusive os
// que não rodaram agora), só com capa da IGDB para caber numa URL base só.
const topRows: [string, ...Row][] = [];
for (const c of await readJson<{ id: string }[]>(path.join(ROOT, 'data/consoles.json'), [])) {
  const file = await readJson<CatalogFileV2 | null>(path.join(OUT_DIR, `${c.id}.json`), null);
  if (file?.v !== 2) continue;
  for (const row of file.games) if (row[3].length > 2 && row[3].startsWith('i:')) topRows.push([c.id, ...row]);
}
// Mesmo jogo tem a mesma popularidade em todo console: no empate vale a edição
// lançada primeiro (a original — San Andreas é de PS2, não de Xbox).
topRows.sort((a, b) => b[5] - a[5] || (a[3] || 9999) - (b[3] || 9999));
// Um card por jogo na primeira tela: GTA V aparece uma vez (a edição mais
// popular), não cinco. As outras edições ficam no filtro de cada console.
// Títulos da curadoria já aparecem na primeira tela pela seed: não repetem aqui.
const seenTitles = new Set<string>(seed.map((g) => normKey(g.title)));
const top = topRows.filter((row) => {
  const key = normKey(row[2]);
  if (seenTitles.has(key)) return false;
  seenTitles.add(key);
  return true;
});
await writeFile(
  path.join(OUT_DIR, 'top.json'),
  JSON.stringify({ v: 2, covers: { i: COVER_BASES.i }, games: top.slice(0, TOP_SIZE) }),
);
await writeFile(ID_MAP_FILE, `${JSON.stringify(idMap, null, 1)}\n`);
await writeFile(ALIASES_FILE, `${JSON.stringify(aliases, null, 1)}\n`);
if (Object.keys(newAliases).length) console.log(`${Object.keys(newAliases).length} duplicata(s) fundida(s) por alias`);
const allConsoles = await readJson<{ id: string }[]>(path.join(ROOT, 'data/consoles.json'), []);
const ordered = Object.fromEntries(allConsoles.filter((c) => index[c.id]).map((c) => [c.id, index[c.id]]));
await writeFile(INDEX_FILE, `${JSON.stringify(ordered, null, 2)}\n`);

const total = Object.values(ordered).reduce((a, b) => a + b, 0);
console.log(
  `\ntotal: ${total} jogos em ${Object.keys(ordered).length} consoles · ` +
    `${igdb.requests} requisições à IGDB, ${igdb.cacheHits} do cache · ${Math.round((Date.now() - startedAt) / 1000)} s`,
);
if (!existsSync(path.join(ROOT, '.env.local')) && !process.env.TWITCH_CLIENT_ID) {
  console.log('(sem credenciais no ambiente: tudo veio do cache)');
}
