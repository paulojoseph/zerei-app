#!/usr/bin/env node
/**
 * Zerei.app — resolvedor de capas.
 *
 * Lê `data/cover-sources.json` ({ idDoJogo: ["Titulo na Wikipedia", ...] }),
 * consulta a API REST da Wikipédia e grava a URL real da box art em
 * `data/seed-games.json` (campo `coverUrl`).
 *
 * Jogos sem capa encontrada ficam com `coverUrl: ""` — o componente
 * <CoverImage /> desenha uma capa gerada localmente nesse caso.
 *
 *   node scripts/fetch-covers.mjs            # só os que estão sem capa
 *   node scripts/fetch-covers.mjs --all      # revalida todo mundo
 */
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED = path.join(ROOT, 'data/seed-games.json');
const SOURCES = path.join(ROOT, 'data/cover-sources.json');

const UA = 'zerei.app/1.0 (aplicativo pessoal de catalogo de jogos; contato via repositorio local)';
const DELAY_MS = 900;
const MAX_RETRIES = 6;

/** GET com retry exponencial para o 429 da Wikipédia. */
async function getJson(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch {
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
      await sleep(Math.min(wait, 20000));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

/** Resolve um título de artigo em URL de imagem do upload.wikimedia.org. */
async function resolveTitle(rawTitle) {
  const isPt = rawTitle.startsWith('pt:');
  const title = isPt ? rawTitle.slice(3) : rawTitle;
  const host = isPt ? 'pt.wikipedia.org' : 'en.wikipedia.org';
  const url = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;

  const data = await getJson(url);
  if (!data || data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return null;

  const source = data.originalimage?.source || data.thumbnail?.source;
  if (typeof source !== 'string') return null;

  const clean = source.split('?')[0];
  if (!clean.startsWith('https://upload.wikimedia.org/')) return null;
  // Ignora ícones/logos genéricos que às vezes vêm no lugar da capa.
  if (/\.svg$/i.test(clean)) return null;
  return clean;
}

/** Confirma que a imagem realmente responde 200 antes de gravar. */
async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } });
    return res.ok;
  } catch {
    return false;
  }
}

const all = process.argv.includes('--all');
const games = JSON.parse(await readFile(SEED, 'utf8'));
const sources = JSON.parse(await readFile(SOURCES, 'utf8'));

let resolved = 0;
let kept = 0;
let missing = 0;
const failures = [];

for (const game of games) {
  if (!all && game.coverUrl) {
    kept += 1;
    continue;
  }
  const candidates = sources[game.id];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    game.coverUrl = '';
    missing += 1;
    failures.push(`${game.id} (sem candidato em cover-sources.json)`);
    continue;
  }

  let found = '';
  for (const candidate of candidates) {
    const url = await resolveTitle(candidate);
    await sleep(DELAY_MS);
    if (url && (await headOk(url))) {
      found = url;
      break;
    }
  }

  game.coverUrl = found;
  if (found) {
    resolved += 1;
    process.stdout.write(`OK   ${game.id}\n`);
  } else {
    missing += 1;
    failures.push(`${game.id} — tentou: ${candidates.join(' | ')}`);
    process.stdout.write(`MISS ${game.id}\n`);
  }
}

await writeFile(SEED, `${JSON.stringify(games, null, 2)}\n`, 'utf8');

console.log('\n─────────────────────────────────────────────');
console.log(`capas resolvidas agora : ${resolved}`);
console.log(`capas já existentes    : ${kept}`);
console.log(`sem capa (fallback)    : ${missing}`);
console.log(`total de jogos         : ${games.length}`);
if (failures.length) {
  console.log('\nSem capa (usarão a capa gerada localmente):');
  for (const f of failures) console.log(`  - ${f}`);
}
