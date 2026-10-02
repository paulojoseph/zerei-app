#!/usr/bin/env node
/**
 * Zerei.app — gera o catálogo completo por console.
 *
 * Fontes (todas abertas, sem chave de API):
 *   - Retrô (consoles com `libretro` em data/consoles.json): a lista de jogos
 *     vem do acervo de box art do libretro (thumbnails.libretro.com) — só entra
 *     jogo que tem capa. O ano vem do libretro-database e, na falta, do Wikidata.
 *   - Moderno (sem `libretro`): a lista vem do Wikidata (jogos com artigo na
 *     Wikipédia em inglês) e a capa é a imagem principal do artigo.
 *
 * Saída:
 *   public/catalog/<console>.json  { base, games: [[titulo, ano, capa], ...] }
 *   data/catalog-index.json        { <console>: quantidade } (importado pelo app)
 *
 * Jogos que já estão em data/seed-games.json (curadoria com resumo e capa
 * local) não são repetidos no catálogo.
 *
 * IDs estáveis (ADR 0002): o ID de um jogo é cunhado uma vez e guardado em
 * data/id-map.json, indexado pela chave de origem (título normalizado no
 * libretro, item do Wikidata no moderno). O build FALHA se um ID já publicado
 * sumir sem um alias em data/id-aliases.json — é o que impede que o progresso
 * salvo dos usuários fique órfão. `--allow-removals` libera de propósito.
 *
 * A publicação é atômica: tudo é calculado em memória e só vai para o disco se a
 * trava de IDs passar.
 *
 * As respostas remotas ficam em cache em `.cache/catalog/`; use `--fresh`
 * para ignorar o cache, ou `--only=nes,snes` para gerar só alguns consoles.
 *
 *   node scripts/build-catalog.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONSOLES = JSON.parse(await readFile(path.join(ROOT, 'data/consoles.json'), 'utf8'));
const SEED = JSON.parse(await readFile(path.join(ROOT, 'data/seed-games.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'public/catalog');
const INDEX_FILE = path.join(ROOT, 'data/catalog-index.json');
const ID_MAP_FILE = path.join(ROOT, 'data/id-map.json');
const ALIASES_FILE = path.join(ROOT, 'data/id-aliases.json');
const CACHE_DIR = path.join(ROOT, '.cache/catalog');

const UA = 'zerei.app/1.0 (aplicativo pessoal de catalogo de jogos; contato via repositorio local)';
const LIBRETRO = 'https://thumbnails.libretro.com';
const LIBRETRO_DB = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/releaseyear';
const SPARQL = 'https://query.wikidata.org/sparql';
const ENWIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKIMEDIA_BASE = 'https://upload.wikimedia.org/wikipedia/';
/** Wikimedia só serve miniaturas em larguras padronizadas. */
const THUMB_WIDTH = 330;

const fresh = process.argv.includes('--fresh');
const allowRemovals = process.argv.includes('--allow-removals');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;

/* -------------------------------------------------------------------------- */
/*  HTTP com cache e retry                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Intervalo mínimo entre chamadas por host. A API da Wikipédia bloqueia o IP
 * por vários minutos (429 em tudo) se as chamadas vierem coladas.
 */
const MIN_GAP_MS = { 'en.wikipedia.org': 1500, 'query.wikidata.org': 1000 };
const lastCall = new Map();

async function throttle(host) {
  const gap = MIN_GAP_MS[host] ?? 0;
  const wait = (lastCall.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());
}

async function fetchText(url, { accept, cache = true } = {}) {
  const key = createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, key);
  if (cache && !fresh) {
    try {
      return await readFile(file, 'utf8');
    } catch {
      /* sem cache */
    }
  }
  const host = new URL(url).host;
  for (let attempt = 0; attempt <= 10; attempt += 1) {
    await throttle(host);
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}) } });
    } catch {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      await sleep(Math.max(retryAfter || 0, Math.min(5000 * 2 ** attempt, 120000)));
      continue;
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (cache) await writeFile(file, text, 'utf8');
    return text;
  }
  throw new Error(`falhou depois de várias tentativas: ${url}`);
}

/* -------------------------------------------------------------------------- */
/*  Títulos                                                                    */
/* -------------------------------------------------------------------------- */

/** Chave de comparação: sem acento, caixa, artigo inicial e pontuação. */
function normKey(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function slugify(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "Legend of Zelda, The - A Link..." → "The Legend of Zelda - A Link..." */
function fixArticle(title) {
  return title.replace(/^(.+?), (The|A|An|Les|Le|La|Die|Der|Das|Il|Os|As|O|El)(?=$| - |: )/, '$2 $1');
}

/** O libretro troca &*\/:`<>?\\|" por "_" no nome do arquivo. */
function restoreChars(title) {
  return title.replace(/ _ /g, ' & ').replace(/_ /g, ': ').replace(/_/g, "'");
}

/* -------------------------------------------------------------------------- */
/*  libretro                                                                   */
/* -------------------------------------------------------------------------- */

/** Versões que não são o jogo de verdade. */
const JUNK =
  /\((?:[^)]*\b(?:Beta|Proto|Prototype|Demo|Sample|Kiosk|Pirate|Hack|Program|Debug|Promo|Trial|Preview|Test|Aftermarket|Homebrew|BIOS|Competition Cart|Not for Resale|Taikenban)\b[^)]*)\)|\[/i;

/** Cartões do e-Reader, vídeos e cartuchos de trapaça: tem capa, mas não é jogo. */
const NOT_A_GAME =
  /Card-e\b|Battle-e\b|Pokemon-e\b|-e - Series|e-Reader|^(GBA|Game Boy Advance) Video\b|Action Replay|GameShark|Game Shark|Code ?Breaker|Xploder|Pro Action Replay|Jampack|Demo Disc|Official .*Magazine/i;

/**
 * Versões localizadas de um jogo que já existe em inglês ("Die Welt Ist Nicht
 * Genug" = "The World Is Not Enough"). Só sai quando é a ÚNICA região do
 * arquivo; Japão e Brasil ficam, porque lá há muito jogo exclusivo.
 */
const LOCALIZED_ONLY = new Set([
  'germany', 'france', 'spain', 'italy', 'netherlands', 'sweden', 'denmark', 'norway',
  'finland', 'poland', 'russia', 'greece', 'portugal', 'korea', 'china', 'taiwan',
  'hong kong', 'asia', 'scandinavia', 'belgium', 'switzerland', 'austria',
]);

function isLocalizedDuplicate(stem) {
  const m = / \(([^)]+)\)/.exec(stem);
  if (!m) return false;
  const regions = m[1].split(',').map((r) => r.trim().toLowerCase());
  return regions.every((r) => LOCALIZED_ONLY.has(r));
}

/** Quanto menor, mais preferida é a versão (Brasil e EUA na frente). */
function regionRank(name) {
  const tags = name.slice(name.indexOf('(')).toLowerCase();
  let rank = 50;
  if (tags.includes('brazil')) rank = 0;
  else if (tags.includes('usa')) rank = 1;
  else if (tags.includes('world')) rank = 2;
  else if (tags.includes('europe')) rank = 3;
  else if (tags.includes('japan')) rank = 4;
  // Relançamentos e revisões perdem para o cartucho original.
  if (/virtual console|switch online|collection|classic mini|rev \d|\bv\d/.test(tags)) rank += 10;
  return rank;
}

function parseLibretroName(stem) {
  const cut = stem.search(/ \(|\[/);
  const base = (cut === -1 ? stem : stem.slice(0, cut)).trim();
  // TOSEC: "Nome (1989)(Editora)(...)" traz o ano logo no primeiro parêntese.
  const tosecYear = /^[^(]*\((\d{4})[-)]/.exec(stem);
  return {
    title: fixArticle(restoreChars(base)),
    year: tosecYear ? Number(tosecYear[1]) : 0,
  };
}

async function libretroYears(dir) {
  const text = await fetchText(`${LIBRETRO_DB}/${encodeURIComponent(dir)}.dat`);
  const years = new Map();
  if (!text) return years;
  const re = /comment "([^"]+)"\s+releaseyear "(\d{4})"/g;
  for (const m of text.matchAll(re)) {
    const key = normKey(parseLibretroName(m[1].replace(/[&*/:`<>?\\|]/g, '_')).title);
    const year = Number(m[2]);
    if (!years.has(key) || years.get(key) > year) years.set(key, year);
  }
  return years;
}

async function fromLibretro(console_, wikiYears) {
  const base = `${LIBRETRO}/${encodeURIComponent(console_.libretro)}/Named_Boxarts/`;
  const html = await fetchText(base);
  if (!html) throw new Error(`listagem do libretro indisponível: ${console_.libretro}`);
  const datYears = await libretroYears(console_.libretro);

  /** chave normalizada → melhor versão encontrada */
  const groups = new Map();
  for (const m of html.matchAll(/href="([^"?/]+)\.png"/g)) {
    // A listagem é HTML: "&" chega como "&amp;" dentro do href.
    const stem = decodeURIComponent(m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
    if (JUNK.test(stem) || NOT_A_GAME.test(stem) || isLocalizedDuplicate(stem)) continue;
    const { title, year } = parseLibretroName(stem);
    const key = normKey(title);
    if (!key) continue;
    const rank = regionRank(stem);
    const current = groups.get(key);
    if (!current || rank < current.rank) {
      groups.set(key, { title, year: current?.year || year, rank, cover: stem });
    } else if (!current.year && year) {
      current.year = year;
    }
  }

  return [...groups.entries()].map(([key, g]) => ({
    key,
    sources: [`lr:${key}`],
    title: g.title,
    year: datYears.get(key) || g.year || wikiYears.get(key) || 0,
    cover: g.cover,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Wikidata + Wikipédia                                                       */
/* -------------------------------------------------------------------------- */

async function wikidataGames(qids) {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  // Consulta enxuta de propósito: hierarquia de tipos (P279*) e data qualificada
  // por plataforma estouram o limite de 60s do serviço nos consoles grandes.
  const query = `
SELECT ?g ?article ?label (MIN(YEAR(?d)) AS ?y) WHERE {
  VALUES ?platform { ${values} }
  ?g wdt:P400 ?platform ; wdt:P31 wd:Q7889 .
  ?article schema:about ?g ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?g rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?g wdt:P577 ?d }
} GROUP BY ?g ?article ?label`;
  const text = await fetchText(`${SPARQL}?query=${encodeURIComponent(query)}`, {
    accept: 'application/sparql-results+json',
  });
  if (!text) throw new Error(`consulta ao Wikidata falhou: ${qids.join(',')}`);
  const rows = JSON.parse(text).results.bindings;

  const byItem = new Map();
  for (const row of rows) {
    const id = row.g.value;
    if (byItem.has(id)) continue;
    const article = decodeURIComponent(row.article.value.split('/wiki/')[1]).replace(/_/g, ' ');
    const label = row.label?.value || article.replace(/ \([^)]*\)$/, '');
    byItem.set(id, {
      qid: id.split('/').pop(),
      article,
      title: label,
      year: Number(row.y?.value) || 0,
    });
  }
  return [...byItem.values()];
}

/** Imagem principal de cada artigo (inclui capas não livres), 50 por chamada. */
async function articleCovers(articles) {
  const covers = new Map();
  for (let i = 0; i < articles.length; i += 50) {
    const batch = articles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: String(THUMB_WIDTH),
      pilicense: 'any',
      titles: batch.join('|'),
    });
    const text = await fetchText(`${ENWIKI_API}?${params}`);
    if (!text) continue;
    const data = JSON.parse(text).query ?? {};
    // Título pedido → título final (normalização + redirecionamento).
    const alias = new Map();
    for (const n of data.normalized ?? []) alias.set(n.to, n.from);
    for (const r of data.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    for (const page of data.pages ?? []) {
      const src = page.thumbnail?.source;
      if (!src || !src.startsWith(WIKIMEDIA_BASE)) continue;
      // A API pendura ?utm_source=... na URL; o arquivo é o mesmo sem isso.
      covers.set(alias.get(page.title) ?? page.title, src.split('?')[0].slice(WIKIMEDIA_BASE.length));
    }
    process.stdout.write('.');
  }
  return covers;
}

async function fromWikidata(console_) {
  const games = await wikidataGames(console_.wikidata);
  const covers = await articleCovers(games.map((g) => g.article));
  process.stdout.write('\n');
  const groups = new Map();
  for (const g of games) {
    const key = normKey(g.title);
    if (!key) continue;
    const cover = covers.get(g.article) ?? '';
    const current = groups.get(key);
    if (!current || (!current.cover && cover)) {
      const sources = [...(current?.sources ?? []), `wd:${g.qid}`];
      groups.set(key, { key, title: g.title, year: plausibleYear(g.year, console_), cover, sources });
    } else {
      current.sources.push(`wd:${g.qid}`);
    }
  }
  return [...groups.values()];
}

/**
 * O Wikidata guarda o ano do lançamento ORIGINAL: o Pac-Man do PS4 (Arcade
 * Archives) vem como 1980. Ano anterior ao próprio console vira desconhecido.
 */
function plausibleYear(year, console_) {
  return year >= console_.year - 1 ? year : 0;
}

/* -------------------------------------------------------------------------- */
/*  IDs estáveis                                                               */
/* -------------------------------------------------------------------------- */

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const BASE32 = 'abcdefghijkmnpqrstuvwxyz23456789';

/** ID novo, curto e sem significado: "g_" + 8 caracteres (~10^12 combinações). */
function mintId(taken) {
  for (;;) {
    const id = `g_${[...randomBytes(8)].map((b) => BASE32[b % BASE32.length]).join('')}`;
    if (!taken.has(id)) return id;
  }
}

/** IDs que o arquivo publicado anterior deste console expunha (formato antigo ou novo). */
async function previousIds(consoleId) {
  const prev = await readJson(path.join(OUT_DIR, `${consoleId}.json`), { games: [] });
  return new Set(prev.games.map((row) => (row[3].includes('--') || row[3].startsWith('g_') ? row[3] : `${consoleId}--${row[3]}`)));
}

/* -------------------------------------------------------------------------- */
/*  Montagem                                                                   */
/* -------------------------------------------------------------------------- */

await mkdir(OUT_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });

const index = await readJson(INDEX_FILE, {});
/** { console: { chaveDeOrigem: id } } — todo ID que já foi publicado. */
const idMap = await readJson(ID_MAP_FILE, {});
/** { idAntigo: idNovo } — fusões e remoções conscientes. */
const aliases = await readJson(ALIASES_FILE, {});
const takenIds = new Set(Object.values(idMap).flatMap((m) => Object.values(m)));
const violations = [];
/** Saídas em memória: só vão para o disco se a trava passar (tudo ou nada). */
const outputs = [];

for (const console_ of CONSOLES) {
  if (only && !only.has(console_.id)) continue;
  if (!console_.libretro && console_.wikidata.length === 0) {
    delete index[console_.id];
    continue;
  }

  process.stdout.write(`${console_.name}… `);
  const seedKeys = new Set(SEED.filter((g) => g.platform === console_.name).map((g) => normKey(g.title)));

  let entries;
  let base;
  if (console_.libretro) {
    const wikiYears = new Map();
    if (console_.wikidata.length) {
      for (const g of await wikidataGames(console_.wikidata)) {
        const key = normKey(g.title);
        const year = plausibleYear(g.year, console_);
        if (year && !wikiYears.has(key)) wikiYears.set(key, year);
      }
    }
    entries = await fromLibretro(console_, wikiYears);
    base = `${LIBRETRO}/${encodeURIComponent(console_.libretro)}/Named_Boxarts/`;
  } else {
    entries = await fromWikidata(console_);
    base = WIKIMEDIA_BASE;
  }

  const consoleMap = (idMap[console_.id] ??= {});
  const published = new Set(Object.values(consoleMap));
  const legacy = await previousIds(console_.id);
  const usedSlugs = new Set();
  const usedIds = new Set();
  const games = entries
    .filter((e) => !seedKeys.has(e.key))
    .sort((a, b) => a.title.localeCompare(b.title, 'en'))
    .map((e) => {
      // Slug no formato antigo: só serve para adotar IDs publicados antes do id-map.
      let slug = slugify(e.title) || 'jogo';
      while (usedSlugs.has(slug)) slug += '-2';
      usedSlugs.add(slug);
      const legacyId = `${console_.id}--${slug}`;

      let id = e.sources.map((source) => consoleMap[source]).find((known) => known && !usedIds.has(known));
      if (!id) id = legacy.has(legacyId) && !usedIds.has(legacyId) ? legacyId : mintId(takenIds);
      usedIds.add(id);
      takenIds.add(id);
      for (const source of e.sources) consoleMap[source] ??= id;
      return [e.title, e.year, e.cover, id];
    });

  // A trava: todo ID já publicado continua existindo ou tem alias.
  const missing = [...published].filter((id) => !usedIds.has(id) && !aliases[id]);
  if (missing.length) {
    violations.push(`${console_.name}: ${missing.length} ID(s) sumiriam (ex.: ${missing.slice(0, 5).join(', ')})`);
    console.log(`BLOQUEADO — ${missing.length} ID(s) publicados sumiriam`);
  }

  outputs.push({ id: console_.id, base, games });
  const withCover = games.filter((g) => g[2]).length;
  const withYear = games.filter((g) => g[1]).length;
  console.log(`${games.length} jogos (capa: ${withCover}, ano: ${withYear})`);
}

if (violations.length) {
  console.error(`\n${allowRemovals ? 'AVISO' : 'ERRO'}: IDs publicados sumiriam sem alias em data/id-aliases.json:`);
  for (const v of violations) console.error(`  - ${v}`);
  if (!allowRemovals) {
    console.error('Nada foi gravado. Adicione os aliases (idAntigo -> idNovo) ou rode com --allow-removals de propósito.');
    process.exit(1);
  }
}

for (const out of outputs) {
  await writeFile(path.join(OUT_DIR, `${out.id}.json`), JSON.stringify({ base: out.base, games: out.games }), 'utf8');
  index[out.id] = out.games.length;
}

async function writeIndex() {
  const ordered = Object.fromEntries(CONSOLES.filter((c) => index[c.id]).map((c) => [c.id, index[c.id]]));
  await writeFile(INDEX_FILE, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  return ordered;
}

await writeFile(ID_MAP_FILE, `${JSON.stringify(idMap, null, 1)}\n`, 'utf8');
const ordered = await writeIndex();
console.log(`\ntotal: ${Object.values(ordered).reduce((a, b) => a + b, 0)} jogos em ${Object.keys(ordered).length} consoles`);
