/** Normalização de títulos compartilhada pelo pipeline (casamento e IDs). */

/** Chave de comparação: sem acento, caixa, artigo inicial e pontuação. */
export function normKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Variações de chave para casar o mesmo jogo escrito de jeitos diferentes:
 * - sufixos de revisão/versão do TOSEC ("Platoon Rev PRG1", "Solar Wars v.1 Silent");
 * - romanização japonesa ("Ninja Ryuuken Den" x "Ninja Ryukenden").
 */
export function matchKeys(title: string): string[] {
  const base = title
    .replace(/\s+(rev\s*[\w.]+|v\.?\s*\d[\w.]*)(\s+\w+)?$/i, '')
    .replace(/\s*\((rev|v)[^)]*\)$/i, '');
  const keys = new Set<string>();
  for (const t of [title, base]) {
    const k = normKey(t);
    if (!k) continue;
    keys.add(k);
    // Só as vogais longas do japonês. "ii"/"aa" ficam de fora de propósito:
    // dobrar "ii" confunde algarismos romanos (Final Fantasy II x Final Fantasy).
    keys.add(k.replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o'));
  }
  return [...keys];
}

const BASE32 = 'abcdefghijkmnpqrstuvwxyz23456789';

/** ID novo, curto e sem significado: "g_" + 8 caracteres (ADR 0002). */
export function mintId(taken: Set<string>, random: (n: number) => Uint8Array): string {
  for (;;) {
    const id = `g_${[...random(8)].map((b) => BASE32[b % BASE32.length]).join('')}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Cópia de `detailShard` (lib/shard.ts): fatia 00–ff dos detalhes no R2.
 * Se divergir da do app, toda página de jogo dá 404 — pipeline/normalize.test.ts
 * garante que as duas batem.
 */
export function detailShard(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) & 0xff).toString(16).padStart(2, '0');
}
