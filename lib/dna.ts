import { CONSOLES, MAKER_ORDER, makerOf } from '@/lib/consoles';
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/platforms';
import type { PlatformCategory, StatsSummary } from '@/types/game';

/*
 * Gamer DNA: o resumo compartilhável do painel. Módulo puro (roda no app, na
 * rota que desenha a imagem e nos testes).
 *
 * O DNA viaja na URL (/dna?d=...), sem conta e sem guardar nada no servidor.
 * Por isso a decodificação é uma ALLOWLIST: só índices de listas fechadas e
 * números com limite. Ninguém consegue montar um link que faça a imagem
 * exibir um texto qualquer (ofensivo, golpe) com a marca do Zerei.
 */

/** Gêneros da IGDB em PT-BR (mesma tradução do pipeline). Índice = posição. */
export const DNA_GENRES = [
  'Point-and-click', 'Luta', 'Tiro', 'Música', 'Plataforma', 'Quebra-cabeça', 'Corrida',
  'Estratégia em tempo real', 'RPG', 'Simulação', 'Esporte', 'Estratégia', 'Estratégia por turnos',
  'Tático', 'Briga de rua / Hack and slash', 'Quiz', 'Pinball', 'Aventura', 'Indie', 'Arcade',
  'Visual novel', 'Cartas e tabuleiro', 'MOBA', 'Ação',
] as const;

export interface Archetype {
  key: string;
  label: string;
  /** Uma frase, com o humor da casa. */
  line: string;
}

/** Em ordem de prioridade: o primeiro que bater vence. */
export const ARCHETYPES: Archetype[] = [
  { key: 'zerador', label: 'Zerador Compulsivo', line: 'Mais de 300 jogos zerados. Você não joga: você termina.' },
  { key: 'locadora', label: 'Cria da Locadora', line: 'A infância foi no cartucho: 8 e 16 bits dominam a sua história.' },
  { key: 'fliperama', label: 'Rato de Fliperama', line: 'Ficha na mão e o recorde da máquina na cabeça.' },
  { key: 'sega', label: 'Sega Raiz', line: 'Blast processing no sangue. Tec Toy forever.' },
  { key: 'nintendo', label: 'Nintendista de Carteirinha', line: 'Cogumelo, estrela e cartucho soprado.' },
  { key: 'playstation', label: 'Geração PlayStation', line: 'Do memory card de 15 blocos ao troféu de platina.' },
  { key: 'xbox', label: 'Time Verde', line: 'Gamertag é sobrenome e conquista é currículo.' },
  { key: 'pc', label: 'Raiz do PC', line: 'Teclado, mouse e um disquete guardado de lembrança.' },
  { key: 'rpg', label: 'RPGista de Fim de Semana', line: 'Grinding até as 4 da manhã é estilo de vida.' },
  { key: 'viajante', label: 'Viajante do Tempo', line: 'Zerou jogo de toda geração. O console da vez é detalhe.' },
  { key: 'raiz', label: 'Jogador Raiz', line: 'Cada jogo zerado é uma história. E a sua só começou.' },
];

export interface Dna {
  beaten: number;
  archetype: Archetype;
  /** Até 3 consoles, do mais zerado para o menos. */
  consoles: { id: string; label: string; count: number }[];
  genre: string | null;
  era: PlatformCategory | null;
  /** Fabricante dominante e a fatia dele (0–100). */
  maker: { name: string; pct: number } | null;
}

const BY_NAME = new Map(CONSOLES.map((c) => [c.name, c]));
const ARCADE_NAMES = new Set(['Arcade', 'Neo Geo']);

/** Calcula o DNA a partir das estatísticas do painel. */
export function computeDna(stats: StatsSummary): Dna {
  const beaten = stats.beaten;
  const consoles = stats.byPlatform
    .map((p) => ({ console: BY_NAME.get(p.platform), count: p.beaten }))
    .filter((p): p is { console: (typeof CONSOLES)[number]; count: number } => !!p.console)
    .slice(0, 3)
    .map((p) => ({ id: p.console.id, label: p.console.label, count: p.count }));

  const makerCount = new Map<string, number>();
  let arcade = 0;
  for (const p of stats.byPlatform) {
    makerCount.set(makerOf(p.platform), (makerCount.get(makerOf(p.platform)) ?? 0) + p.beaten);
    if (ARCADE_NAMES.has(p.platform)) arcade += p.beaten;
  }
  const topMaker = [...makerCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const maker = topMaker && beaten ? { name: topMaker[0], pct: Math.round((topMaker[1] / beaten) * 100) } : null;
  const share = (name: string) => (beaten ? (makerCount.get(name) ?? 0) / beaten : 0);

  const eraTop = [...stats.byCategory].sort((a, b) => b.beaten - a.beaten)[0];
  const era = eraTop && eraTop.beaten > 0 ? eraTop.category : null;
  const retro = beaten
    ? stats.byCategory.filter((c) => c.category === '8-bit' || c.category === '16-bit').reduce((s, c) => s + c.beaten, 0) / beaten
    : 0;
  const generations = stats.byCategory.filter((c) => c.beaten > 0).length;
  const genre = stats.byGenre.find((g) => (DNA_GENRES as readonly string[]).includes(g.label))?.label ?? null;

  const rules: Record<string, boolean> = {
    zerador: beaten >= 300,
    locadora: retro >= 0.5,
    fliperama: beaten > 0 && arcade / beaten >= 0.2,
    sega: share('Sega') >= 0.4,
    nintendo: share('Nintendo') >= 0.5,
    playstation: share('Sony') >= 0.5,
    xbox: share('Microsoft') >= 0.4,
    pc: share('PC') >= 0.5,
    rpg: genre === 'RPG',
    viajante: generations >= 4,
    raiz: true,
  };
  const archetype = ARCHETYPES.find((a) => rules[a.key]) ?? ARCHETYPES[ARCHETYPES.length - 1];
  return { beaten, archetype, consoles, genre, era, maker };
}

/* ------------------------------------------------------------- URL ---- */

interface Packed {
  v: 1;
  n: number;
  a: number;
  c: [number, number][];
  g: number;
  e: number;
  m: [number, number] | null;
}

const CONSOLE_INDEX = new Map(CONSOLES.map((c, i) => [c.id, i]));

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeDna(dna: Dna): string {
  const packed: Packed = {
    v: 1,
    n: dna.beaten,
    a: ARCHETYPES.indexOf(dna.archetype),
    c: dna.consoles.map((c) => [CONSOLE_INDEX.get(c.id)!, c.count]),
    g: dna.genre ? (DNA_GENRES as readonly string[]).indexOf(dna.genre) : -1,
    e: dna.era ? CATEGORY_ORDER.indexOf(dna.era) : -1,
    m: dna.maker ? [MAKER_ORDER.indexOf(dna.maker.name), dna.maker.pct] : null,
  };
  return toBase64Url(JSON.stringify(packed));
}

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Decodifica e VALIDA (allowlist). Qualquer coisa fora do esperado → null. */
export function decodeDna(code: string | null | undefined): Dna | null {
  if (!code || code.length > 400 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const beaten = int(p.n, 0, 100_000);
  const a = int(p.a, 0, ARCHETYPES.length - 1);
  if (p.v !== 1 || beaten === null || a === null || !Array.isArray(p.c) || p.c.length > 3) return null;

  const consoles: Dna['consoles'] = [];
  for (const entry of p.c) {
    if (!Array.isArray(entry)) return null;
    const idx = int(entry[0], 0, CONSOLES.length - 1);
    const count = int(entry[1], 0, 100_000);
    if (idx === null || count === null) return null;
    consoles.push({ id: CONSOLES[idx].id, label: CONSOLES[idx].label, count });
  }
  const g = int(p.g, -1, DNA_GENRES.length - 1);
  const e = int(p.e, -1, CATEGORY_ORDER.length - 1);
  if (g === null || e === null) return null;
  let maker: Dna['maker'] = null;
  if (p.m !== null) {
    if (!Array.isArray(p.m)) return null;
    const mi = int(p.m[0], 0, MAKER_ORDER.length - 1);
    const pct = int(p.m[1], 0, 100);
    if (mi === null || pct === null) return null;
    maker = { name: MAKER_ORDER[mi], pct };
  }
  return {
    beaten,
    archetype: ARCHETYPES[a],
    consoles,
    genre: g >= 0 ? DNA_GENRES[g] : null,
    era: e >= 0 ? CATEGORY_ORDER[e] : null,
    maker,
  };
}

export const eraLabel = (era: PlatformCategory | null) => (era ? CATEGORY_META[era].label : null);
