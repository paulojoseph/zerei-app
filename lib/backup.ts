/**
 * Zerei.app — export and import of the personal collection.
 *
 * This module is pure (no React, no Zustand) on purpose: the store imports
 * backup, so importing the store here would create a cycle. Everything that comes
 * in through `parseBackupFile` is treated as hostile data; the function never throws.
 */

import { CATEGORY_ORDER, inferCategory } from '@/lib/platforms';
import type { BackupPayload, Game, GameStatus, PlatformCategory, UserGameProgress } from '@/types/game';
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/types/game';

type ParseResult = { ok: true; payload: BackupPayload } | { ok: false; error: string };

/** CSV columns, in this exact order. The header is a contract with the spreadsheet. */
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

/** RFC 4180: line endings are always CRLF. */
const CRLF = '\r\n';

/** Excel only opens UTF-8 with correct accents when the file has a BOM. */
const BOM = '\uFEFF';

const VALID_STATUS = new Set<string>(['beaten', 'playing', 'backlog', 'unplayed']);
const VALID_CATEGORY = new Set<string>(CATEGORY_ORDER);

/**
 * Keys that, assigned on an object literal, trigger the `Object.prototype` setter
 * instead of becoming a normal property: a backup with `gameId: "__proto__"`
 * vanishes from the map and also swaps the object's prototype. Since `gameId` comes
 * from the file (hostile data), any record with one of these keys is dropped.
 */
const UNSAFE_KEYS = new Set<string>(['__proto__', 'constructor', 'prototype']);

function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

/* -------------------------------------------------------------------------- */
/*  Coercion helpers                                                           */
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

/** Only accepts the four known statuses (forgiving on case and whitespace). */
function toStatus(raw: unknown): GameStatus | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return VALID_STATUS.has(value) ? (value as GameStatus) : undefined;
}

/** Year as a positive integer; anything else becomes `undefined`. */
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

/** Score from 1 to 5; out of range (or not a number) becomes `undefined`. */
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

/** Normalized ISO date; invalid or missing input becomes "now". */
function toIso(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    const date = new Date(raw.trim());
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return nowIso();
}

/** Builds a valid `UserGameProgress` or returns `undefined` (row skipped). */
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

/** Normalizes a backup game (IGDB/manual); drops it without id or title. */
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
/*  Export                                                                     */
/* -------------------------------------------------------------------------- */

/** `zerei-app-backup-2024-03-12.json`, local date, to match the user's calendar. */
export function backupFilename(ext: 'json' | 'csv'): string {
  const today = new Date();
  const stamp = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  return `zerei-app-backup-${stamp}.${ext}`;
}

/** Indented JSON: the backup is meant to be read and versioned by humans. */
export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Escapes a field per RFC 4180: doubled quotes and a quoted field when needed. */
function csvCell(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (text === '') return '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Excel/LibreOffice treat any cell starting with one of these as a formula. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * TEXT cell (title, platform, notes…). "Memories" are free text and may have
 * come from someone else's backup: untreated, `=HYPERLINK(...)` or
 * `=cmd|...` run when the spreadsheet opens.
 *
 * DO NOT REMOVE the leading single quote: it's what makes the spreadsheet read
 * the cell as text. It isn't displayed, and the import parser hands it back
 * along with the content without breaking the record.
 *
 * Text columns only. releaseYear/completedYear/rating are generated by the
 * app and must stay numeric in the spreadsheet.
 */
function csvTextCell(value: string | null | undefined): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (text === '') return '';
  return csvCell(FORMULA_TRIGGER.test(text) ? `'${text}` : text);
}

/**
 * Inverse of `csvTextCell`: strips the guard apostrophe on the way back. Without
 * this, the text gains an apostrophe on every export → import cycle (`'=`, `''=`, …).
 * Only strips when the next character really is a formula trigger, so it doesn't
 * eat a single quote the user typed.
 */
function stripFormulaGuard(value: string): string {
  return value.startsWith("'") && FORMULA_TRIGGER.test(value.slice(1)) ? value.slice(1) : value;
}

/**
 * Spreadsheet-ready CSV. Title/platform/generation/year come from the catalog;
 * a game no longer in the catalog keeps its `gameId` with the other columns empty.
 */
export function backupToCsv(payload: BackupPayload, games: Game[]): string {
  const byId = new Map(games.map((game) => [game.id, game]));

  // Alphabetical order by title keeps the spreadsheet usable; without a title, sort by id.
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const progress: Record<string, UserGameProgress> = payload.progress ?? {};
  const rows = Object.entries(progress)
    .filter(([, entry]) => Boolean(entry))
    .map(([key, entry]) => {
      const gameId = entry.gameId || key;
      return { gameId, entry, game: byId.get(gameId) };
    })
    .sort((a, b) => {
      // A game that left the catalog has no title: goes to the end, sorted by id.
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

/** Triggers the download in the browser. On the server it does nothing (doesn't break SSR). */
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
    // Safari reads the blob after the click, so revoke on the next event loop turn.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error('[Zerei.app] could not create the download file:', error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Import                                                                     */
/* -------------------------------------------------------------------------- */

const EMPTY_FILE = 'Empty file.';
const NO_RECORDS = 'No valid records found in the file.';

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

/** Detects the format by the file name suffix; failing that, looks at the first character. */
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
    const detail = error instanceof Error ? error.message : 'could not read the content';
    return { ok: false, error: `Invalid JSON: ${detail}` };
  }

  // (c) raw array of UserGameProgress
  if (Array.isArray(data)) {
    return buildPayload(sanitizeProgressMap(data), [], nowIso());
  }

  if (!isRecord(data)) {
    return { ok: false, error: 'Invalid JSON: the file must contain an object or a list.' };
  }

  // Also accepts the raw Zustand LocalStorage dump (`{ state: { ... } }`).
  const wrapped = data.state;
  const root: Record<string, unknown> =
    isRecord(wrapped) && wrapped.progress !== undefined ? wrapped : data;

  // (a) full BackupPayload, (b) `{ progress }` without metadata,
  // or a direct progress map (object keyed by gameId).
  const rawProgress = root.progress !== undefined ? root.progress : root;
  const progress = sanitizeProgressMap(rawProgress);
  const customGames = sanitizeCustomGames(root.customGames);
  const exportedAt = typeof root.exportedAt === 'string' ? toIso(root.exportedAt) : nowIso();

  return buildPayload(progress, customGames, exportedAt);
}

/**
 * Full CSV parser (RFC 4180): handles quotes, escaped quotes and line breaks
 * inside a field. Accepts CRLF, LF and lone CR as line endings.
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

  // Last line without a trailing newline.
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
    // Unknown columns just don't go into the map; the first one wins.
    if (key && !columns.has(key)) columns.set(key, index);
  });

  if (!columns.has('gameid')) {
    return {
      ok: false,
      error: 'CSV is missing the "gameId" column. Use a file exported by Zerei.app.',
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
    // Same protection as JSON: `__proto__` and friends never become a map key.
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

  // CSV only describes progress: covers and game metadata live in the JSON.
  return buildPayload(progress, [], nowIso());
}

/**
 * Reads a backup file (JSON or CSV) and returns a normalized `BackupPayload`,
 * ready for `useGameStore.importBackup`. Never throws: errors come back in `error`.
 */
export function parseBackupFile(
  filename: string,
  text: string,
): { ok: true; payload: BackupPayload } | { ok: false; error: string } {
  try {
    if (!text || !stripBom(text).trim()) return { ok: false, error: EMPTY_FILE };
    return detectKind(filename ?? '', text) === 'json' ? parseJsonBackup(text) : parseCsvBackup(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: `Could not read the file: ${detail}` };
  }
}
