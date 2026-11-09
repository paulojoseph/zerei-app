#!/usr/bin/env node
/**
 * Zerei.app — cover resolver.
 *
 * Reads `data/cover-sources.json` ({ gameId: ["Wikipedia title", ...] }),
 * queries the Wikipedia REST API and writes the real box art URL to
 * `data/seed-games.json` (`coverUrl` field).
 *
 * Games with no cover found keep `coverUrl: ""`, and the <CoverImage />
 * component draws a locally generated cover in that case.
 *
 *   node scripts/fetch-covers.mjs            # only the ones without a cover
 *   node scripts/fetch-covers.mjs --all      # revalidates everyone
 */
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED = path.join(ROOT, 'data/seed-games.json');
const SOURCES = path.join(ROOT, 'data/cover-sources.json');

const UA = 'zerei.app/1.0 (personal game catalog app; contact via local repository)';
const DELAY_MS = 900;
const MAX_RETRIES = 6;

/** GET with exponential retry for Wikipedia's 429. */
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

/** Resolves an article title to an upload.wikimedia.org image URL. */
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
  // Ignores generic icons/logos that sometimes come instead of the cover.
  if (/\.svg$/i.test(clean)) return null;
  return clean;
}

/** Confirms the image really answers 200 before writing it. */
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
    failures.push(`${game.id} (no candidate in cover-sources.json)`);
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
console.log(`covers resolved now    : ${resolved}`);
console.log(`covers already present : ${kept}`);
console.log(`no cover (fallback)    : ${missing}`);
console.log(`total games            : ${games.length}`);
if (failures.length) {
  console.log('\nNo cover (will use the locally generated cover):');
  for (const f of failures) console.log(`  - ${f}`);
}
