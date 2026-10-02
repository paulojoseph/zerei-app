/**
 * Zerei.app — exportação e importação do acervo pessoal.
 *
 * Este módulo é puro (sem React, sem Zustand) de propósito: a store importa o
 * backup, então importar a store aqui criaria ciclo. Tudo que entra por
 * `parseBackupFile` é tratado como dado hostil — a função nunca lança.
 */

import { CATEGORY_ORDER, inferCategory } from '@/lib/platforms';
import type { BackupPayload, Game, GameStatus, PlatformCategory, UserGameProgress } from '@/types/game';
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/types/game';

type ParseResult = { ok: true; payload: BackupPayload } | { ok: false; error: string };

/** Colunas do CSV, nesta ordem exata — o cabeçalho é contrato com a planilha. */
const CSV_COLUMNS = [
  'gameId',
  'title',
  'platform',
  'category',
  'releaseYear',
  'status',
  'completedYear',
  'rating',
  'notes',
  'updatedAt',
] as const;

/** RFC 4180: fim de linha é sempre CRLF. */
const CRLF = '\r\n';

/** Excel (pt-BR) só abre UTF-8 com acento correto quando o arquivo tem BOM. */
const BOM = '\uFEFF';

const VALID_STATUS = new Set<string>(['beaten', 'playing', 'backlog', 'unplayed']);
const VALID_CATEGORY = new Set<string>(CATEGORY_ORDER);

/**
 * Chaves que, atribuídas num objeto literal, acionam o setter de `Object.prototype`
 * em vez de virarem uma propriedade normal: um backup com `gameId: "__proto__"`
 * some do mapa e ainda troca o protótipo do objeto. Como o `gameId` vem do arquivo
 * (dado hostil), qualquer registro com uma dessas chaves é descartado.
 */
const UNSAFE_KEYS = new Set<string>(['__proto__', 'constructor', 'prototype']);

function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

/* -------------------------------------------------------------------------- */
/*  Helpers de coerção                                                         */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Aceita só os quatro status conhecidos (tolerante a caixa e espaços). */
function toStatus(raw: unknown): GameStatus | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return VALID_STATUS.has(value) ? (value as GameStatus) : undefined;
}

/** Ano em número inteiro positivo; qualquer outra coisa vira `undefined`. */
function toYear(raw: unknown): number | undefined {
  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    value = Number(raw.trim());
  } else {
    return undefined;
  }
  if (!Number.isFinite(value)) return undefined;
  const year = Math.trunc(value);
  return year > 0 ? year : undefined;
}

/** Nota de 1 a 5; fora do intervalo (ou não numérica) vira `undefined`. */
function toRating(raw: unknown): number | undefined {
  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    value = Number(raw.trim().replace(',', '.'));
  } else {
    return undefined;
  }
  if (!Number.isFinite(value)) return undefined;
  const rating = Math.round(value);
  return rating >= 1 && rating <= 5 ? rating : undefined;
}

/** Data ISO normalizada; entrada inválida ou ausente vira "agora". */
function toIso(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    const date = new Date(raw.trim());
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return nowIso();
}

/** Constrói um `UserGameProgress` válido ou devolve `undefined` (linha ignorada). */
function toProgressEntry(raw: unknown, fallbackId?: string): UserGameProgress | undefined {
  if (!isRecord(raw)) return undefined;

  const rawId = typeof raw.gameId === 'string' ? raw.gameId.trim() : '';
  const gameId = rawId || (fallbackId ?? '').trim();
  if (!gameId) return undefined;

  const status = toStatus(raw.status);
  if (!status) return undefined;

  const entry: UserGameProgress = { gameId, status, updatedAt: toIso(raw.updatedAt) };

  const completedYear = toYear(raw.completedYear);
  if (completedYear !== undefined) entry.completedYear = completedYear;

  const rating = toRating(raw.rating);
  if (rating !== undefined) entry.rating = rating;

  if (typeof raw.notes === 'string' && raw.notes.trim()) entry.notes = raw.notes;

  return entry;
}

/** Normaliza um jogo do backup (IGDB/manual); sem id ou título, descarta. */
function toGame(raw: unknown): Game | undefined {
  if (!isRecord(raw)) return undefined;

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!id || !title) return undefined;

  const platform = typeof raw.platform === 'string' ? raw.platform.trim() : '';
  const category =
    typeof raw.category === 'string' && VALID_CATEGORY.has(raw.category)
      ? (raw.category as PlatformCategory)
      : inferCategory(platform);

  const game: Game = {
    id,
    title,
    platform,
    category,
    releaseYear: toYear(raw.releaseYear) ?? 0,
    coverUrl: typeof raw.coverUrl === 'string' ? raw.coverUrl : '',
    isCustom: true,
  };

  if (typeof raw.summary === 'string' && raw.summary.trim()) game.summary = raw.summary;
  if (raw.isBrazilClassic === true) game.isBrazilClassic = true;
  if (Array.isArray(raw.genres)) {
    const genres = raw.genres.filter((genre): genre is string => typeof genre === 'string');
    if (genres.length) game.genres = genres;
  }

  return game;
}

function sanitizeProgressMap(raw: unknown): Record<string, UserGameProgress> {
  const out: Record<string, UserGameProgress> = {};

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const entry = toProgressEntry(item);
      if (entry && !isUnsafeKey(entry.gameId)) out[entry.gameId] = entry;
    }
    return out;
  }

  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const entry = toProgressEntry(value, key);
      if (entry && !isUnsafeKey(entry.gameId)) out[entry.gameId] = entry;
    }
  }

  return out;
}

function sanitizeCustomGames(raw: unknown): Game[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const games: Game[] = [];
  for (const item of raw) {
    const game = toGame(item);
    if (!game || seen.has(game.id)) continue;
    seen.add(game.id);
    games.push(game);
  }
  return games;
}

/* -------------------------------------------------------------------------- */
/*  Exportação                                                                 */
/* -------------------------------------------------------------------------- */

/** `zerei-app-backup-2024-03-12.json` — data local, para bater com o calendário do usuário. */
export function backupFilename(ext: 'json' | 'csv'): string {
  const today = new Date();
  const stamp = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  return `zerei-app-backup-${stamp}.${ext}`;
}

/** JSON identado — o backup é feito para ser lido e versionado por humanos. */
export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Escapa um campo conforme RFC 4180: aspas dobradas e campo citado quando necessário. */
function csvCell(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (text === '') return '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Excel/LibreOffice tratam como fórmula toda célula iniciada por um destes. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Célula de TEXTO (title, platform, notes…). "Memórias afetivas" é texto livre e
 * pode ter vindo do backup de outra pessoa: sem tratamento, `=HYPERLINK(...)` ou
 * `=cmd|...` são executados ao abrir a planilha.
 *
 * NÃO REMOVER a aspa simples do começo: é ela que faz a planilha ler a célula
 * como texto. Ela não aparece na exibição e o parser de importação a devolve
 * junto do conteúdo, sem quebrar o registro.
 *
 * Só para colunas de texto — releaseYear/completedYear/rating são geradas pelo
 * app e precisam continuar numéricas na planilha.
 */
function csvTextCell(value: string | null | undefined): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (text === '') return '';
  return csvCell(FORMULA_TRIGGER.test(text) ? `'${text}` : text);
}

/**
 * Inverso de `csvTextCell`: tira o apóstrofo de proteção na volta. Sem isto o
 * texto engorda um apóstrofo a cada ciclo exportar → importar (`'=`, `''=`, …).
 * Só remove quando o caractere seguinte é de fato um gatilho de fórmula, para
 * não comer uma aspa simples que o usuário mesmo escreveu.
 */
function stripFormulaGuard(value: string): string {
  return value.startsWith("'") && FORMULA_TRIGGER.test(value.slice(1)) ? value.slice(1) : value;
}

/**
 * CSV pronto para planilha. Título/plataforma/geração/ano vêm do catálogo;
 * jogo que não está mais no catálogo mantém o `gameId` com as demais colunas vazias.
 */
export function backupToCsv(payload: BackupPayload, games: Game[]): string {
  const byId = new Map(games.map((game) => [game.id, game]));

  // Ordem alfabética por título deixa a planilha utilizável; sem título, ordena pelo id.
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const progress: Record<string, UserGameProgress> = payload.progress ?? {};
  const rows = Object.entries(progress)
    .filter(([, entry]) => Boolean(entry))
    .map(([key, entry]) => {
      const gameId = entry.gameId || key;
      return { gameId, entry, game: byId.get(gameId) };
    })
    .sort((a, b) => {
      // Jogo que saiu do catálogo não tem título: vai para o fim, ordenado pelo id.
      const titleA = a.game?.title ?? '';
      const titleB = b.game?.title ?? '';
      if (titleA && titleB) return collator.compare(titleA, titleB);
      if (titleA) return -1;
      if (titleB) return 1;
      return collator.compare(a.gameId, b.gameId);
    });

  const lines = [CSV_COLUMNS.join(',')];
  for (const { gameId, entry, game } of rows) {
    lines.push(
      [
        csvTextCell(gameId),
        csvTextCell(game?.title),
        csvTextCell(game?.platform),
        csvTextCell(game?.category),
        csvCell(game?.releaseYear ? game.releaseYear : undefined),
        csvTextCell(entry.status),
        csvCell(entry.completedYear),
        csvCell(entry.rating),
        csvTextCell(entry.notes),
        csvTextCell(entry.updatedAt),
      ].join(','),
    );
  }

  return `${BOM}${lines.join(CRLF)}${CRLF}`;
}

/** Dispara o download no navegador. No servidor, não faz nada (sem quebrar o SSR). */
export function downloadTextFile(filename: string, mime: string, content: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  try {
    const type = mime.toLowerCase().includes('charset=') ? mime : `${mime};charset=utf-8`;
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // O Safari lê o blob depois do clique — revogar na próxima volta do event loop.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error('[Zerei.app] não foi possível gerar o arquivo para download:', error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Importação                                                                 */
/* -------------------------------------------------------------------------- */

const EMPTY_FILE = 'Arquivo vazio.';
const NO_RECORDS = 'Nenhum registro válido encontrado no arquivo.';

function buildPayload(
  progress: Record<string, UserGameProgress>,
  customGames: Game[],
  exportedAt: string,
): ParseResult {
  const total = Object.keys(progress).length;
  if (!total && !customGames.length) return { ok: false, error: NO_RECORDS };

  return {
    ok: true,
    payload: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt,
      progress,
      customGames,
      stats: {
        beaten: Object.values(progress).filter((entry) => entry.status === 'beaten').length,
        total,
      },
    },
  };
}

/** Descobre o formato pelo sufixo do nome; se não der, olha o primeiro caractere. */
function detectKind(filename: string, text: string): 'json' | 'csv' {
  const name = filename.trim().toLowerCase();
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.csv')) return 'csv';
  const head = stripBom(text).trimStart();
  return head.startsWith('{') || head.startsWith('[') ? 'json' : 'csv';
}

function parseJsonBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'não foi possível ler o conteúdo';
    return { ok: false, error: `JSON inválido: ${detail}` };
  }

  // (c) array cru de UserGameProgress
  if (Array.isArray(data)) {
    return buildPayload(sanitizeProgressMap(data), [], nowIso());
  }

  if (!isRecord(data)) {
    return { ok: false, error: 'JSON inválido: o arquivo precisa conter um objeto ou uma lista.' };
  }

  // Aceita também o dump bruto do LocalStorage do Zustand (`{ state: { ... } }`).
  const wrapped = data.state;
  const root: Record<string, unknown> =
    isRecord(wrapped) && wrapped.progress !== undefined ? wrapped : data;

  // (a) BackupPayload completo, (b) `{ progress }` sem metadados,
  // ou um mapa de progresso direto (objeto indexado por gameId).
  const rawProgress = root.progress !== undefined ? root.progress : root;
  const progress = sanitizeProgressMap(rawProgress);
  const customGames = sanitizeCustomGames(root.customGames);
  const exportedAt = typeof root.exportedAt === 'string' ? toIso(root.exportedAt) : nowIso();

  return buildPayload(progress, customGames, exportedAt);
}

/**
 * Parser CSV completo (RFC 4180): respeita aspas, aspas escapadas e quebras de
 * linha dentro do campo. Aceita CRLF, LF e CR soltos como fim de linha.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      started = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      endField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      endRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    started = true;
    i += 1;
  }

  // Última linha sem quebra final.
  if (started || quoted || field !== '' || row.length) endRow();

  return rows;
}

/** "Game ID", "game_id", "gameid" → "gameid". */
function headerKey(value: string): string {
  return stripBom(value).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

function parseCsvBackup(text: string): ParseResult {
  const rows = parseCsvRows(stripBom(text)).filter((row) => !isBlankRow(row));
  if (!rows.length) return { ok: false, error: EMPTY_FILE };

  const columns = new Map<string, number>();
  rows[0].forEach((cell, index) => {
    const key = headerKey(cell);
    // Colunas desconhecidas simplesmente não entram no mapa; a primeira vence.
    if (key && !columns.has(key)) columns.set(key, index);
  });

  if (!columns.has('gameid')) {
    return {
      ok: false,
      error: 'CSV sem a coluna "gameId". Use um arquivo exportado pelo Zerei.app.',
    };
  }

  const raw = (row: string[], key: string): string => {
    const index = columns.get(key);
    if (index === undefined) return '';
    return row[index] ?? '';
  };

  const progress: Record<string, UserGameProgress> = {};
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const gameId = raw(row, 'gameid').trim();
    // Mesma proteção do JSON: `__proto__` & cia. nunca viram chave do mapa.
    if (!gameId || isUnsafeKey(gameId)) continue;

    const status = toStatus(raw(row, 'status'));
    if (!status) continue;

    const entry: UserGameProgress = { gameId, status, updatedAt: toIso(raw(row, 'updatedat')) };

    const completedYear = toYear(raw(row, 'completedyear'));
    if (completedYear !== undefined) entry.completedYear = completedYear;

    const rating = toRating(raw(row, 'rating'));
    if (rating !== undefined) entry.rating = rating;

    const notes = stripFormulaGuard(raw(row, 'notes'));
    if (notes.trim()) entry.notes = notes;

    progress[gameId] = entry;
  }

  // O CSV descreve só o progresso: capas e metadados dos jogos ficam no JSON.
  return buildPayload(progress, [], nowIso());
}

/**
 * Lê um arquivo de backup (JSON ou CSV) e devolve um `BackupPayload` normalizado,
 * pronto para `useGameStore.importBackup`. Nunca lança: erros voltam em `error`.
 */
export function parseBackupFile(
  filename: string,
  text: string,
): { ok: true; payload: BackupPayload } | { ok: false; error: string } {
  try {
    if (!text || !stripBom(text).trim()) return { ok: false, error: EMPTY_FILE };
    return detectKind(filename ?? '', text) === 'json' ? parseJsonBackup(text) : parseCsvBackup(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro desconhecido';
    return { ok: false, error: `Não foi possível ler o arquivo: ${detail}` };
  }
}
