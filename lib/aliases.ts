import aliasData from '@/data/id-aliases.json';
import type { UserGameProgress } from '@/types/game';

/**
 * IDs antigos → IDs atuais (fusões de duplicatas, correções de catálogo). O
 * build do catálogo se recusa a publicar se um ID sumir sem entrada aqui, e o
 * app reaponta o progresso salvo por este mapa — ninguém perde um "zerei".
 */
const ALIASES: Record<string, string> = aliasData;

/** Segue a cadeia de aliases (a → b → c), com limite contra ciclos. */
export function resolveGameId(id: string): string {
  let current = id;
  for (let hops = 0; hops < 10; hops += 1) {
    const next = ALIASES[current];
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Reaponta as chaves do progresso. Se o antigo e o novo ID tiverem registro
 * (duas edições fundidas numa), vence o mais recente.
 */
export function remapProgress(progress: Record<string, UserGameProgress>): Record<string, UserGameProgress> {
  let changed = false;
  const out: Record<string, UserGameProgress> = {};
  for (const [key, entry] of Object.entries(progress)) {
    const id = resolveGameId(key);
    if (id !== key) changed = true;
    const current = out[id];
    if (!current || current.updatedAt < entry.updatedAt) out[id] = id === entry.gameId ? entry : { ...entry, gameId: id };
  }
  return changed ? out : progress;
}
