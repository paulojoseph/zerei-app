/** Title normalization shared by the pipeline (matching and IDs). */

/** Comparison key: no accents, case, leading article or punctuation. */
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
 * Key variations to match the same game written in different ways:
 * - TOSEC revision/version suffixes ("Platoon Rev PRG1", "Solar Wars v.1 Silent");
 * - Japanese romanization ("Ninja Ryuuken Den" x "Ninja Ryukenden").
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
    // Only Japanese long vowels. "ii"/"aa" are left out on purpose:
    // doubling "ii" confuses Roman numerals (Final Fantasy II x Final Fantasy).
    keys.add(k.replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o'));
  }
  return [...keys];
}

const BASE32 = 'abcdefghijkmnpqrstuvwxyz23456789';

/** New ID, short and meaningless: "g_" + 8 characters (ADR 0002). */
export function mintId(taken: Set<string>, random: (n: number) => Uint8Array): string {
  for (;;) {
    const id = `g_${[...random(8)].map((b) => BASE32[b % BASE32.length]).join('')}`;
    if (!taken.has(id)) return id;
  }
}
