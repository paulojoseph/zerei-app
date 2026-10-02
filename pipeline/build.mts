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
import { createHash, randomBytes } from 'node:crypto';
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
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  rating?: number;
  rating_count?: number;
}

/**
 * v3 — uma linha por OBRA (jogo), repetida no arquivo de cada console em que saiu:
 * [id, título, ano original, capa, popularidade, gêneros, consoles (índices em
 *  meta.consoles, o original primeiro), crítica 0–100, nº de críticas,
 *  público 0–100, nº de votos]
 */
type Row = [string, string, number, string, number, number[], number[], number, number, number, number];

interface CatalogFileV3 {
  v: 3;
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
  if (raw.v === 3 || raw.v === 2) {
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
  'aggregated_rating',
  'aggregated_rating_count',
  'rating',
  'rating_count',
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

const allConsoles = await readJson<ConsoleDef[]>(path.join(ROOT, 'data/consoles.json'), []);
const consoles = allConsoles.filter((c) => c.igdb.length > 0 && (!only || only.has(c.id)));
const consoleIndex = new Map(allConsoles.map((c, i) => [c.id, i]));
const consoleOrder = new Map(allConsoles.map((c, i) => [c.id, i]));
const byName = new Map(allConsoles.map((c) => [c.name, c.id]));
const seed = await readJson<{ id: string; title: string; platform: string }[]>(path.join(ROOT, 'data/seed-games.json'), []);
const index = Object.fromEntries(
  Object.entries(await readJson<Record<string, unknown>>(INDEX_FILE, {})).filter(([k, v]) => !k.startsWith('_') && typeof v === 'number'),
) as Record<string, number>;
const idMap = await readJson<Record<string, Record<string, string>>>(ID_MAP_FILE, {});
const aliases = await readJson<Record<string, string>>(ALIASES_FILE, {});
const takenIds = new Set(Object.values(idMap).flatMap((m) => Object.values(m)));
/** Fusões descobertas nesta execução (gravadas em data/id-aliases.json). */
const newAliases: Record<string, string> = {};
/** IGDB → ID da obra (estável entre execuções). */
const worksMap = (idMap.__works ??= {});

const igdb = new IgdbClient(fresh);
const startedAt = Date.now();

const genreList = await igdb.query<Named>('genres', 'fields id,name; limit 500; sort id asc;');
const genreNames = genreList.map((g) => GENRE_PT[g.name] ?? g.name);
const genreIndex = new Map(genreList.map((g, i) => [g.id, i]));
const visits = await extractPopularity(igdb);

function alias(from: string, to: string) {
  if (from === to || aliases[from] === to) return;
  aliases[from] = to;
  newAliases[from] = to;
}

/* ---- 1ª passada: extração e edições válidas (obra × console, sem relançamento) ---- */

interface WorkAcc {
  game: IgdbGame;
  pop: number;
  /** console → ano do jogo naquele console */
  editions: Map<string, number>;
}
const works = new Map<number, WorkAcc>();
const prevByConsole = new Map<string, PrevCatalog>();
const reReleases = new Map<string, number>();

for (const console_ of consoles) {
  process.stdout.write(`${console_.name}… `);
  const games = await extractConsole(igdb, console_);
  prevByConsole.set(console_.id, await readPrevious(console_));
  let removed = 0;
  for (const game of games) {
    const year = consoleYear(game, console_);
    if (isRerelease(game, console_, year)) {
      removed += 1;
      continue;
    }
    let work = works.get(game.id);
    if (!work) {
      work = { game, pop: popularityOf(game, visits), editions: new Map() };
      works.set(game.id, work);
    }
    work.editions.set(console_.id, year);
  }
  reReleases.set(console_.id, removed);
  console.log(`${games.length} jogos (−${removed} relançamentos)`);
}

/* ---- 2ª passada: casamento com o catálogo anterior, console a console ---- */

/** IDs antigos (edições, curadoria, catálogo legado) que são esta obra. */
const workCandidates = new Map<number, string[]>();
const addCandidate = (gameId: number, id: string) => {
  const list = workCandidates.get(gameId) ?? [];
  if (!list.includes(id)) list.push(id);
  workCandidates.set(gameId, list);
};
/** IDs legados absorvidos por alguma obra (não continuam como linha própria). */
const absorbed = new Set<string>();
const ranked = [...works.values()].sort((a, b) => b.pop - a.pop || a.game.id - b.game.id);

for (const console_ of consoles) {
  const prev = prevByConsole.get(console_.id)!;
  const consoleMap = idMap[console_.id] ?? {};
  const inConsole = ranked.filter((w) => w.editions.has(console_.id));

  // Edição publicada antes (Fase 1) desta obra neste console.
  for (const w of inConsole) {
    const edition = consoleMap[`igdb:${w.game.id}`];
    if (edition) addCandidate(w.game.id, edition);
  }

  // Jogos legados do console: nome principal primeiro, depois alternativos.
  const legacyByKey = new Map<string, PrevRow[]>();
  for (const row of prev.rows.filter((r) => r.legacy)) {
    for (const key of matchKeys(row.title)) legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), row]);
  }
  const claimed = new Set<string>();
  const claim = (w: WorkAcc, names: string[]) => {
    for (const row of names.flatMap(matchKeys).flatMap((k) => legacyByKey.get(k) ?? [])) {
      if (claimed.has(row.id)) continue;
      claimed.add(row.id);
      absorbed.add(row.id);
      addCandidate(w.game.id, row.id);
    }
  };
  for (const w of inConsole) claim(w, [w.game.name]);
  for (const w of inConsole) claim(w, (w.game.alternative_names ?? []).map((a) => a.name));
}

/* ---- 3ª passada: ID da obra (curadoria > já publicado > edição original > novo) ---- */

const seedByKey = new Map<string, { id: string; consoleId: string }[]>();
for (const g of seed) {
  const consoleId = byName.get(g.platform);
  if (!consoleId) continue;
  const key = normKey(g.title);
  seedByKey.set(key, [...(seedByKey.get(key) ?? []), { id: g.id, consoleId }]);
}
const seedTaken = new Set<string>();
const workId = new Map<number, string>();
let minted = 0;

for (const w of ranked) {
  const names = [w.game.name, ...(w.game.alternative_names ?? []).map((a) => a.name)].map(normKey);
  const seedMatch = names
    .flatMap((k) => seedByKey.get(k) ?? [])
    .find((s) => w.editions.has(s.consoleId) && !seedTaken.has(s.id));
  const candidates = workCandidates.get(w.game.id) ?? [];
  // Edição do console original (o mais antigo) herda; empate pela ordem dos consoles.
  const original = [...w.editions.entries()].sort(
    (a, b) => (a[1] || 9999) - (b[1] || 9999) || consoleOrder.get(a[0])! - consoleOrder.get(b[0])!,
  )[0][0];
  const originalEdition = idMap[original]?.[`igdb:${w.game.id}`];

  let id = seedMatch?.id ?? worksMap[`igdb:${w.game.id}`] ?? originalEdition ?? candidates[0];
  if (!id) {
    id = mintId(takenIds, randomBytes);
    minted += 1;
  }
  if (seedMatch) seedTaken.add(seedMatch.id);
  takenIds.add(id);
  worksMap[`igdb:${w.game.id}`] = id;
  workId.set(w.game.id, id);
  for (const candidate of candidates) alias(candidate, id);
}

/* ---- saída por console + trava de IDs ---- */

const critic = (g: IgdbGame) => ((g.aggregated_rating_count ?? 0) >= 3 ? Math.round(g.aggregated_rating ?? 0) : 0);
const workRows = new Map<number, Row>();
for (const w of ranked) {
  const g = w.game;
  const platforms = [...w.editions.entries()]
    .sort((a, b) => (a[1] || 9999) - (b[1] || 9999) || consoleOrder.get(a[0])! - consoleOrder.get(b[0])!)
    .map(([c]) => consoleIndex.get(c)!);
  const genres = (g.genres ?? []).map((x) => genreIndex.get(x)).filter((x): x is number => x !== undefined);
  workRows.set(g.id, [
    workId.get(g.id)!,
    g.name,
    yearOf(g.first_release_date) || Math.min(...[...w.editions.values()].filter(Boolean), 9999) % 9999,
    `i:${g.cover?.image_id ?? ''}`,
    w.pop,
    genres,
    platforms,
    critic(g),
    critic(g) ? (g.aggregated_rating_count ?? 0) : 0,
    Math.round(g.rating ?? 0),
    g.rating_count ?? 0,
  ]);
}

interface Output {
  console: ConsoleDef;
  file: CatalogFileV3;
  details: Record<string, unknown>;
}
const outputs: Output[] = [];
const emittedIds = new Set<string>();
/** console → IDs que ele já publicou (verificados contra TODOS os arquivos no fim). */
const publishedBy = new Map<string, Set<string>>();

for (const console_ of consoles) {
  const prev = prevByConsole.get(console_.id)!;
  const rows: Row[] = [];
  const details: Record<string, unknown> = {};
  const used = new Set<string>();
  for (const w of ranked) {
    if (!w.editions.has(console_.id)) continue;
    const row = workRows.get(w.game.id)!;
    if (used.has(row[0])) continue;
    used.add(row[0]);
    rows.push(row);
    const g = w.game;
    const companies = g.involved_companies ?? [];
    details[row[0]] = {
      igdb: g.id,
      slug: g.slug,
      summary: g.summary,
      altNames: g.alternative_names?.map((a) => a.name),
      themes: g.themes,
      modes: g.game_modes,
      perspectives: g.player_perspectives,
      franchises: g.franchises?.map((f) => f.name),
      developers: companies.filter((c) => c.developer).map((c) => c.company?.name),
      publishers: companies.filter((c) => c.publisher).map((c) => c.company?.name),
      similar: g.similar_games?.map((s) => workId.get(s)).filter(Boolean),
      external: g.external_games?.map((e) => [e.external_game_source, e.uid]),
    };
  }
  // O que a IGDB não trouxe continua, com a fonte antiga (nenhum progresso se perde).
  let legacy = 0;
  for (const row of prev.rows) {
    if (!row.legacy || absorbed.has(row.id) || aliases[row.id] || used.has(row.id)) continue;
    used.add(row.id);
    rows.push([row.id, row.title, row.year, row.cover, row.pop, row.genres, [consoleIndex.get(console_.id)!], 0, 0, 0, 0]);
    legacy += 1;
  }
  for (const id of used) emittedIds.add(id);

  const published = new Set(Object.values(idMap[console_.id] ?? {}));
  for (const r of prev.rows) published.add(r.id);
  publishedBy.set(console_.name, published);

  rows.sort((a, b) => b[4] - a[4] || a[1].localeCompare(b[1], 'en'));
  outputs.push({ console: console_, file: { v: 3, covers: { i: COVER_BASES.i, ...prev.covers }, games: rows }, details });
  const withCover = rows.filter((r) => r[3].length > 2).length;
  console.log(
    `${console_.name}: ${rows.length} jogos · capa ${Math.round((withCover / rows.length) * 100)}% · ` +
      `${rows.filter((r) => r[6].length > 1).length} multiplataforma · ${legacy} só no catálogo antigo`,
  );
}

// A trava (ADR 0002), depois de todos os consoles: um ID publicado pode ter ido
// para o arquivo de outro console (obra multiplataforma) — isso não é sumiço.
const realViolations: string[] = [];
for (const [name, published] of publishedBy) {
  const missing = [...published].filter((id) => !emittedIds.has(id) && !aliases[id]);
  if (missing.length) realViolations.push(`${name}: ${missing.length} ID(s) sumiriam (ex.: ${missing.slice(0, 5).join(', ')})`);
}

if (realViolations.length) {
  console.error(`\n${allowRemovals ? 'AVISO' : 'ERRO'}: IDs publicados sumiriam sem alias em data/id-aliases.json:`);
  for (const v of realViolations) console.error(`  - ${v}`);
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
await writeFile(
  path.join(OUT_DIR, 'meta.json'),
  JSON.stringify({ v: 3, genres: genreNames, consoles: allConsoles.map((c) => c.id) }),
);

// top.json: as obras mais populares (uma vez cada), sem as da curadoria (já na tela).
const seedIds = new Set(seed.map((g) => g.id));
const seenTop = new Set<string>();
const top: Row[] = [];
// Totais SEM repetição (um jogo multiplataforma está no arquivo de cada console).
const uniqueAll = new Set<string>();
const uniqueByMaker = new Map<string, Set<string>>();
for (const c of allConsoles) {
  const file = await readJson<CatalogFileV3 | null>(path.join(OUT_DIR, `${c.id}.json`), null);
  if (file?.v !== 3) continue;
  const maker = (c as ConsoleDef & { maker?: string }).maker ?? 'Outros';
  const makerSet = uniqueByMaker.get(maker) ?? new Set<string>();
  uniqueByMaker.set(maker, makerSet);
  for (const row of file.games) {
    uniqueAll.add(row[0]);
    makerSet.add(row[0]);
    if (seenTop.has(row[0]) || seedIds.has(row[0]) || !row[3].startsWith('i:') || row[3].length <= 2) continue;
    seenTop.add(row[0]);
    top.push(row);
  }
}
top.sort((a, b) => b[4] - a[4] || (a[2] || 9999) - (b[2] || 9999));
await writeFile(path.join(OUT_DIR, 'top.json'), JSON.stringify({ v: 3, covers: { i: COVER_BASES.i }, games: top.slice(0, TOP_SIZE) }));

await writeFile(ID_MAP_FILE, `${JSON.stringify(idMap, null, 1)}\n`);
await writeFile(ALIASES_FILE, `${JSON.stringify(aliases, null, 1)}\n`);
// O app não embute os aliases no bundle (55 mil entradas): baixa este arquivo
// só quando há progresso salvo de uma versão anterior (ver lib/aliases.ts).
const aliasesJson = JSON.stringify(aliases);
await writeFile(path.join(OUT_DIR, 'aliases.json'), aliasesJson);
const aliasesVersion = createHash('sha1').update(aliasesJson).digest('hex').slice(0, 12);
const ordered: Record<string, unknown> = Object.fromEntries(
  allConsoles.filter((c) => index[c.id]).map((c) => [c.id, index[c.id]]),
);
// Curadoria que não casou com nenhuma obra também conta no total.
const seedOnly = seed.filter((g) => !uniqueAll.has(g.id)).length;
ordered._total = uniqueAll.size + seedOnly;
ordered._aliasesVersion = aliasesVersion;
ordered._makers = Object.fromEntries([...uniqueByMaker].map(([m, ids]) => [m, ids.size]));
await writeFile(INDEX_FILE, `${JSON.stringify(ordered, null, 2)}\n`);

const multi = [...workRows.values()].filter((r) => r[6].length > 1).length;
console.log(
  `\n${works.size} obras da IGDB (${multi} multiplataforma) · ${minted} IDs novos · ` +
    `${Object.keys(newAliases).length} edições/duplicatas viraram alias · ` +
    `${igdb.requests} requisições, ${igdb.cacheHits} do cache · ${Math.round((Date.now() - startedAt) / 1000)} s`,
);
