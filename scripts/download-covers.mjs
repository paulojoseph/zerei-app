#!/usr/bin/env node
/**
 * Zerei.app — downloads remote covers to `public/covers/`.
 *
 * The next/image optimizer fetches dozens of covers in parallel from
 * upload.wikimedia.org and gets 429s (rate limit). Serving covers locally,
 * the app no longer depends on Wikimedia at runtime.
 *
 * For each game in `data/seed-games.json` with a remote `coverUrl`, downloads the
 * image (slowly and with an identified User-Agent, as Wikimedia's policy asks)
 * and rewrites the field to `/covers/<id>.<ext>`.
 *
 *   node scripts/download-covers.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED = path.join(ROOT, 'data/seed-games.json');
const OUT_DIR = path.join(ROOT, 'public/covers');

const UA = 'zerei.app/1.0 (personal game catalog app; contact via local repository)';
const DELAY_MS = 700;
const MAX_RETRIES = 6;

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** GET with exponential retry for Wikimedia's 429. */
async function download(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA } });
    } catch {
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
      await sleep(Math.min(wait, 20000));
      continue;
    }
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return null;
    return { ext, bytes: Buffer.from(await res.arrayBuffer()) };
  }
  return null;
}

const games = JSON.parse(await readFile(SEED, 'utf8'));
await mkdir(OUT_DIR, { recursive: true });

let saved = 0;
let skipped = 0;
const failures = [];

for (const game of games) {
  if (!game.coverUrl || !/^https?:\/\//.test(game.coverUrl)) {
    skipped += 1;
    continue;
  }
  const file = await download(game.coverUrl);
  await sleep(DELAY_MS);
  if (!file) {
    failures.push(`${game.id} — ${game.coverUrl}`);
    process.stdout.write(`FAIL ${game.id}\n`);
    continue;
  }
  const name = `${game.id}.${file.ext}`;
  await writeFile(path.join(OUT_DIR, name), file.bytes);
  game.coverUrl = `/covers/${name}`;
  saved += 1;
  process.stdout.write(`OK   ${game.id}\n`);
}

await writeFile(SEED, `${JSON.stringify(games, null, 2)}\n`, 'utf8');

console.log('\n─────────────────────────────────────────────');
console.log(`covers downloaded now  : ${saved}`);
console.log(`already local / none   : ${skipped}`);
console.log(`falhas (URL mantida)   : ${failures.length}`);
for (const f of failures) console.log(`  - ${f}`);
