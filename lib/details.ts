import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';

import { detailShard } from '@/lib/shard';

/** Detalhes de um jogo, como o pipeline grava no R2 (chaves curtas de propósito). */
export interface GameDetails {
  id: string;
  t: string;
  y: number;
  c: string;
  p: string[];
  g: string[];
  cs?: number;
  cc?: number;
  us?: number;
  uc?: number;
  s?: string;
  dev?: string[];
  pub?: string[];
  fr?: string[];
  alt?: string[];
  /** [id, título, capa, ano] dos jogos similares. */
  sim?: [string, string, string, number][];
  igdb?: string;
}

type Shard = Record<string, Omit<GameDetails, 'id'>>;

/**
 * Fatias já lidas nesta instância do Worker. Uma página de jogo lê ~250 KB do
 * R2 e interpreta em poucos ms; as próximas da mesma fatia saem da memória.
 */
const shardCache = new Map<string, Promise<Shard | null>>();
const MAX_CACHED_SHARDS = 32;

async function readShard(shard: string): Promise<Shard | null> {
  // `next dev`: os mesmos arquivos que o pipeline gera no disco. (O
  // getCloudflareContext do dev cria um R2 LOCAL e vazio — perguntar a ele
  // devolvia "não existe" para todo jogo.)
  if (process.env.NODE_ENV === 'development') {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    try {
      return JSON.parse(await readFile(path.join(process.cwd(), '.cache/pipeline/r2/details', `${shard}.json`), 'utf8')) as Shard;
    } catch {
      return null;
    }
  }
  // Worker: o bucket R2 ligado como CATALOG (wrangler.jsonc).
  const { env } = await getCloudflareContext({ async: true });
  const object = await env.CATALOG?.get(`details/${shard}.json`);
  return object ? ((await object.json()) as Shard) : null;
}

/** Detalhes de um jogo pelo ID estável; null se não existir. */
export async function getGameDetails(id: string): Promise<GameDetails | null> {
  if (!/^[a-z0-9_-]{1,120}$/i.test(id)) return null;
  const shard = detailShard(id);
  let pending = shardCache.get(shard);
  if (!pending) {
    pending = readShard(shard).catch(() => null);
    shardCache.set(shard, pending);
    if (shardCache.size > MAX_CACHED_SHARDS) shardCache.delete(shardCache.keys().next().value!);
  }
  const data = await pending;
  if (!data) shardCache.delete(shard); // falhou: tenta de novo na próxima
  const entry = data?.[id];
  return entry ? { id, ...entry } : null;
}
