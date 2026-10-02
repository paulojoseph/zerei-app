#!/usr/bin/env node
/**
 * Zerei.app — baixa as capas remotas para `public/covers/`.
 *
 * O otimizador do next/image busca dezenas de capas em paralelo no
 * upload.wikimedia.org e toma 429 (rate limit). Servindo as capas localmente,
 * o app não depende mais da Wikimedia em runtime.
 *
 * Para cada jogo de `data/seed-games.json` com `coverUrl` remota, baixa a
 * imagem (devagar e com User-Agent identificado, como pede a política da
 * Wikimedia) e reescreve o campo para `/covers/<id>.<ext>`.
 *
 *   node scripts/download-covers.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED = path.join(ROOT, 'data/seed-games.json');
const OUT_DIR = path.join(ROOT, 'public/covers');

const UA = 'zerei.app/1.0 (aplicativo pessoal de catalogo de jogos; contato via repositorio local)';
const DELAY_MS = 700;
const MAX_RETRIES = 6;

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** GET com retry exponencial para o 429 da Wikimedia. */
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
console.log(`capas baixadas agora   : ${saved}`);
console.log(`já locais / sem capa   : ${skipped}`);
console.log(`falhas (URL mantida)   : ${failures.length}`);
for (const f of failures) console.log(`  - ${f}`);
