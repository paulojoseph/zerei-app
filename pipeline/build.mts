/**
 * Zerei — catalog pipeline from IGDB (ADR 0004).
 *
 *   node pipeline/build.mts                     # every console
 *   node pipeline/build.mts --only=nes,snes     # just a few
 *   node pipeline/build.mts --fresh             # ignores the IGDB cache
 *   node pipeline/build.mts --allow-removals    # accepts IDs disappearing (on purpose)
 *
 * For each console in data/consoles.json with IGDB platforms:
 *   1. extracts the games (only types that are "a game": main, remake,
 *      remaster, port, expanded, standalone);
 *   2. drops re-releases (a game much older than the console: Virtual
 *      Console, Arcade Archives...);
 *   3. sorts by popularity (IGDB visits plus rating count);
 *   4. gives each Edition (work × console) a stable ID: the published ID if
 *      it matches a game from the previous catalog, otherwise a new ID (ADR 0002);
 *   5. keeps, with the old source, previous catalog games with no IGDB
 *      match, so no saved progress is lost.
 *
 * Output (written only if the ID guard passes, all or nothing):
 *   public/catalog/<console>.json  lean list the app loads
 *   public/catalog/meta.json       genre dictionary
 *   public/catalog/top.json        the most popular across all consoles (the
 *                                  first screen doesn't download the whole catalog)
 *   data/catalog-index.json        count per console
 *   data/id-map.json               source key -> ID
 *   .cache/pipeline/details/       per-game details (summary, companies,
 *                                  similar games, external IDs), a Phase 2 artifact
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

/** IGDB types that count as "a game" to mark as beaten (`game_types`). */
const ACCEPTED_TYPES = [0, 4, 8, 9, 10, 11];
const REMAKE_TYPES = new Set([8, 9]);
/** Years between the original release and the console's, above which it's a re-release. */
const RERELEASE_GAP = 7;
/** How many games go into top.json (first screen of the "All" tab). */
const TOP_SIZE = 3000;

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const allowRemovals = args.includes('--allow-removals');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
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

/** [id, title, year, encoded cover, popularity, genre indexes] */
type Row = [string, string, number, string, number, number[]];

interface CatalogFileV2 {
  v: 2;
  covers: Record<string, string>;
  games: Row[];
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                  */
/* -------------------------------------------------------------------------- */

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const yearOf = (unix?: number) => (unix ? new Date(unix * 1000).getUTCFullYear() : 0);

/** Short display labels for IGDB genres (the IGDB name is the key; anything missing keeps the IGDB name). */
const GENRE_LABEL: Record<string, string> = {
  'Point-and-click': 'Point-and-click',
  Fighting: 'Fighting',
  Shooter: 'Shooter',
  Music: 'Music',
  Platform: 'Platformer',
  Puzzle: 'Puzzle',
  Racing: 'Racing',
  'Real Time Strategy (RTS)': 'Real-time strategy',
  'Role-playing (RPG)': 'RPG',
  Simulator: 'Simulation',
  Sport: 'Sports',
  Strategy: 'Strategy',
  'Turn-based strategy (TBS)': 'Turn-based strategy',
  Tactical: 'Tactical',
  "Hack and slash/Beat 'em up": "Beat 'em up / Hack and slash",
  'Quiz/Trivia': 'Quiz',
  Pinball: 'Pinball',
  Adventure: 'Adventure',
  Indie: 'Indie',
  Arcade: 'Arcade',
  'Visual Novel': 'Visual novel',
  'Card & Board Game': 'Card & board',
  MOBA: 'MOBA',
};

/* -------------------------------------------------------------------------- */
/*  Previous catalog (to keep IDs and carry what IGDB doesn't have)            */
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

/** Reads the console's published file, in the old (v1) or new (v2) format. */
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
  // v1: [title, year, raw cover, id]; libretro cover (file name) or Wikimedia (path).
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
/*  Extraction                                                                 */
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

/** IGDB visits for the most viewed games (popularity signal). */
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
/*  Transformation                                                             */
/* -------------------------------------------------------------------------- */

function popularityOf(game: IgdbGame, visits: Map<number, number>): number {
  const v = visits.get(game.id) ?? 0;
  // Visits come on a small scale (a fraction); ratings are a count. Log on both.
  const score = 40 * Math.log10(1 + v * 10_000) + 120 * Math.log10(1 + (game.total_rating_count ?? 0));
  return Math.min(999, Math.round(score));
}

/** The game's year ON THIS console (the earliest release on its platforms). */
function consoleYear(game: IgdbGame, console_: ConsoleDef): number {
  const platforms = new Set(console_.igdb);
  const years = (game.release_dates ?? [])
    .filter((r) => r.platform !== undefined && platforms.has(r.platform) && r.date)
    .map((r) => yearOf(r.date));
  return years.length ? Math.min(...years) : yearOf(game.first_release_date);
}

/** Re-release: a work much older than the console (Virtual Console, Arcade Archives...). */
function isRerelease(game: IgdbGame, console_: ConsoleDef, year: number): boolean {
  if (REMAKE_TYPES.has(game.game_type ?? 0)) return false;
  const original = yearOf(game.first_release_date);
  if (!original || original >= console_.year - 1) return false;
  return (year || original) - original > RERELEASE_GAP;
}

/* -------------------------------------------------------------------------- */
/*  Assembly                                                                   */
/* -------------------------------------------------------------------------- */

const consoles = (await readJson<ConsoleDef[]>(path.join(ROOT, 'data/consoles.json'), [])).filter(
  (c) => c.igdb.length > 0 && (!only || only.has(c.id)),
);
const seed = await readJson<{ title: string; platform: string }[]>(path.join(ROOT, 'data/seed-games.json'), []);
const index = await readJson<Record<string, number>>(INDEX_FILE, {});
const idMap = await readJson<Record<string, Record<string, string>>>(ID_MAP_FILE, {});
const aliases = await readJson<Record<string, string>>(ALIASES_FILE, {});
const takenIds = new Set(Object.values(idMap).flatMap((m) => Object.values(m)));
/** Merges found in this run (written to data/id-aliases.json). */
const newAliases: Record<string, string> = {};

const igdb = new IgdbClient(fresh);
const startedAt = Date.now();

const genreList = await igdb.query<Named>('genres', 'fields id,name; limit 500; sort id asc;');
const genreNames = genreList.map((g) => GENRE_LABEL[g.name] ?? g.name);
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

  // Previous catalog games that don't come from IGDB yet, by normalized title.
  const legacyByKey = new Map<string, PrevRow[]>();
  for (const row of prev.rows.filter((r) => r.legacy)) {
    for (const key of matchKeys(row.title)) legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), row]);
  }
  const claimed = new Set<string>();
  const usedIds = new Set<string>();

  const stats = { igdb: games.length, reReleases: 0, adopted: 0, merged: 0, minted: 0, legacy: 0 };
  const rows: Row[] = [];
  const details: Record<string, unknown> = {};

  // Popular games pick first: on a name tie, the classic inherits the old ID.
  const ranked = games
    .map((game) => ({ game, pop: popularityOf(game, visits), year: consoleYear(game, console_) }))
    .sort((a, b) => b.pop - a.pop || a.game.id - b.game.id);

  // First pass: match by MAIN NAME. Without it, a more popular game
  // "steals" the match through an alternative name ("T2: The Arcade Game" has
  // the alternative "Terminator 2: Judgment Day", which is the NES game's name).
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
    // Old catalog games that are this same game (name, regional name, romanization).
    const own = primaryClaim.get(game.id);
    const matches = [
      ...new Set([
        ...(own ? [own] : []),
        ...keys
          .flatMap((k) => legacyByKey.get(k) ?? [])
          // A match already claimed by another game's main name doesn't count here.
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
    // The other matches in the old catalog are the same game under another name
    // ("Dragon Quest" x "Dragon Warrior"): they become aliases and saved progress migrates.
    for (const row of matches) {
      claimed.add(row.id);
      if (row.id === id) continue;
      aliases[row.id] = id;
      newAliases[row.id] = id;
      stats.merged += 1;
    }

    const genres = (game.genres ?? []).map((g) => genreIndex.get(g)).filter((g): g is number => g !== undefined);
    // "i:" with no image = an IGDB game without a cover (the prefix marks the origin).
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

  // Whatever IGDB didn't bring stays, with the old source (no progress lost).
  for (const row of prev.rows) {
    if (usedIds.has(row.id) || aliases[row.id]) continue;
    usedIds.add(row.id);
    rows.push([row.id, row.title, row.year, row.cover, row.pop, row.genres]);
    stats.legacy += 1;
  }

  // The guard (ADR 0002): every published ID still exists or has an alias.
  const missing = [...published].filter((id) => !usedIds.has(id) && !aliases[id]);
  if (missing.length) {
    violations.push(`${console_.name}: ${missing.length} ID(s) sumiriam (ex.: ${missing.slice(0, 5).join(', ')})`);
  }

  rows.sort((a, b) => b[4] - a[4] || a[1].localeCompare(b[1], 'en'));
  const covers: Record<string, string> = { i: COVER_BASES.i, ...prev.covers };
  outputs.push({ console: console_, file: { v: 2, covers, games: rows }, details, stats });

  const withCover = rows.filter((r) => r[3].length > 2).length;
  console.log(
    `${rows.length} games · cover ${Math.round((withCover / rows.length) * 100)}% · ` +
      `IGDB ${stats.igdb} (−${stats.reReleases} re-releases) · IDs: ${stats.adopted} inherited, ` +
      `${stats.merged} merged, ${stats.minted} new · ${stats.legacy} only in the old catalog`,
  );
}

if (violations.length) {
  console.error(`\n${allowRemovals ? 'WARNING' : 'ERROR'}: published IDs would disappear without an alias in data/id-aliases.json:`);
  for (const v of violations) console.error(`  - ${v}`);
  if (!allowRemovals) {
    console.error('Nothing was written. Add the aliases (oldId -> newId) or run with --allow-removals on purpose.');
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

// top.json: the most popular across ALL published consoles (including the ones
// that didn't run now), only with IGDB covers so they fit a single base URL.
const topRows: [string, ...Row][] = [];
for (const c of await readJson<{ id: string }[]>(path.join(ROOT, 'data/consoles.json'), [])) {
  const file = await readJson<CatalogFileV2 | null>(path.join(OUT_DIR, `${c.id}.json`), null);
  if (file?.v !== 2) continue;
  for (const row of file.games) if (row[3].length > 2 && row[3].startsWith('i:')) topRows.push([c.id, ...row]);
}
// The same game has the same popularity on every console: on a tie, the edition
// released first wins (the original, San Andreas is a PS2 game, not Xbox).
topRows.sort((a, b) => b[5] - a[5] || (a[3] || 9999) - (b[3] || 9999));
// One card per game on the first screen: GTA V shows up once (the most popular
// edition), not five times. The other editions live in each console's filter.
// Curated titles already show on the first screen through the seed: no repeats here.
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
if (Object.keys(newAliases).length) console.log(`${Object.keys(newAliases).length} duplicate(s) merged by alias`);
const allConsoles = await readJson<{ id: string }[]>(path.join(ROOT, 'data/consoles.json'), []);
const ordered = Object.fromEntries(allConsoles.filter((c) => index[c.id]).map((c) => [c.id, index[c.id]]));
await writeFile(INDEX_FILE, `${JSON.stringify(ordered, null, 2)}\n`);

const total = Object.values(ordered).reduce((a, b) => a + b, 0);
console.log(
  `\ntotal: ${total} games across ${Object.keys(ordered).length} consoles · ` +
    `${igdb.requests} IGDB requests, ${igdb.cacheHits} from cache · ${Math.round((Date.now() - startedAt) / 1000)}s`,
);
if (!existsSync(path.join(ROOT, '.env.local')) && !process.env.TWITCH_CLIENT_ID) {
  console.log('(no credentials in the environment: everything came from cache)');
}
