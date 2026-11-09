import aliasData from '@/data/id-aliases.json';
import type { UserGameProgress } from '@/types/game';

/**
 * Old IDs → current IDs (duplicate merges, catalog fixes). The catalog build
 * refuses to publish if an ID disappears without an entry here, and the app
 * repoints saved progress through this map, so nobody loses a "beaten".
 */
const ALIASES: Record<string, string> = aliasData;

/** Follows the alias chain (a → b → c), with a cap against cycles. */
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
 * Repoints progress keys. If both the old and the new ID have a record (two
 * editions merged into one), the most recent wins.
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
