/**
 * Envia os detalhes dos jogos (gerados por pipeline/build.mts em
 * .cache/pipeline/r2/details) para o bucket R2 que a página /jogo/[id] lê.
 *
 *   node pipeline/publish-r2.mts            # bucket remoto (precisa de `wrangler login`)
 *
 * Usa `wrangler r2 bulk put` (20 envios em paralelo). Os objetos são
 * sobrescritos: a versão nova de cada fatia substitui a anterior.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, '.cache/pipeline/r2/details');
const BUCKET = 'zerei-catalog';

const files = readdirSync(DIR).filter((f) => /^[0-9a-f]{2}\.json$/.test(f));
if (files.length !== 256) throw new Error(`esperava 256 fatias em ${DIR}, achei ${files.length} — rode o pipeline antes`);

const manifest = path.join(ROOT, '.cache/pipeline/r2/manifest.json');
writeFileSync(manifest, JSON.stringify(files.map((f) => ({ key: `details/${f}`, file: path.join(DIR, f) }))));

const started = Date.now();
execFileSync(
  'npx',
  ['wrangler', 'r2', 'bulk', 'put', BUCKET, '--filename', manifest, '--remote', '--content-type', 'application/json', '--force'],
  { stdio: 'inherit', cwd: ROOT },
);
console.log(`${files.length} fatias enviadas para r2://${BUCKET}/details em ${Math.round((Date.now() - started) / 1000)} s`);
