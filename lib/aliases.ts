import catalogIndex from '@/data/catalog-index.json';
import type { UserGameProgress } from '@/types/game';

/**
 * IDs antigos → IDs atuais (edições fundidas numa obra, duplicatas, correções).
 * O build do catálogo se recusa a publicar se um ID sumir sem entrada aqui, e o
 * app reaponta o progresso salvo por este mapa — ninguém perde um "zerei".
 *
 * São dezenas de milhares de entradas (~650 KB comprimido): o mapa NÃO entra
 * no bundle. Só quem tem progresso salvo de uma versão anterior do catálogo o
 * baixa, uma vez (ver `migrateIds` na store); visitante novo nunca baixa.
 */
export type AliasMap = Record<string, string>;

/** Muda sempre que o mapa muda (gravado pelo pipeline). */
export const ALIASES_VERSION = String((catalogIndex as Record<string, unknown>)._aliasesVersion ?? '');

let aliasesPromise: Promise<AliasMap> | null = null;

export function loadAliases(): Promise<AliasMap> {
  aliasesPromise ??= fetch('/catalog/aliases.json')
    .then((res) => (res.ok ? (res.json() as Promise<AliasMap>) : {}))
    .catch(() => {
      aliasesPromise = null; // tenta de novo na próxima
      return {};
    });
  return aliasesPromise;
}

/** Segue a cadeia de aliases (a → b → c), com limite contra ciclos. */
export function resolveGameId(id: string, aliases: AliasMap): string {
  let current = id;
  for (let hops = 0; hops < 10; hops += 1) {
    const next = aliases[current];
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

const STATUS_RANK: Record<UserGameProgress['status'], number> = { beaten: 3, playing: 2, backlog: 1, unplayed: 0 };

/**
 * Funde dois registros do mesmo jogo (edições que viraram uma obra só). Vence
 * o status "mais forte" — zerado em qualquer console é zerado (ADR 0005) —,
 * depois o mais recente; nota, anotações e ano do perdedor não se perdem.
 */
function mergeEntries(a: UserGameProgress, b: UserGameProgress, id: string): UserGameProgress {
  const [win, lose] =
    STATUS_RANK[a.status] !== STATUS_RANK[b.status]
      ? STATUS_RANK[a.status] > STATUS_RANK[b.status]
        ? [a, b]
        : [b, a]
      : a.updatedAt >= b.updatedAt
        ? [a, b]
        : [b, a];
  const merged: UserGameProgress = { ...lose, ...win, gameId: id };
  merged.rating = win.rating ?? lose.rating;
  merged.completedYear = win.completedYear ?? lose.completedYear;
  merged.notes = win.notes && lose.notes && win.notes !== lose.notes ? `${win.notes}\n\n${lose.notes}` : (win.notes ?? lose.notes);
  merged.playedOn = win.playedOn ?? lose.playedOn ?? (win.consoleId !== lose.consoleId ? win.consoleId : undefined);
  for (const key of ['rating', 'completedYear', 'notes', 'playedOn'] as const) if (merged[key] === undefined) delete merged[key];
  return merged;
}

/** Reaponta as chaves do progresso pelos aliases, fundindo registros do mesmo jogo. */
export function remapProgress(
  progress: Record<string, UserGameProgress>,
  aliases: AliasMap,
): Record<string, UserGameProgress> {
  let changed = false;
  const out: Record<string, UserGameProgress> = {};
  for (const [key, entry] of Object.entries(progress)) {
    const id = resolveGameId(key, aliases);
    if (id !== key) changed = true;
    const moved = id === entry.gameId ? entry : { ...entry, gameId: id };
    out[id] = out[id] ? mergeEntries(out[id], moved, id) : moved;
  }
  return changed ? out : progress;
}
