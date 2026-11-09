/**
 * Zerei.app — optional IGDB integration (API v4), through Twitch OAuth.
 *
 * Server only (/api/igdb/search route). Without `TWITCH_CLIENT_ID` and
 * `TWITCH_CLIENT_SECRET` the module stays inert: `isIgdbConfigured()` returns
 * `false` and the route falls back to the local database. The client secret never
 * shows up in logs or error messages; everything leaving here goes through `redact()`.
 */
import type { Game } from '@/types/game';
import { inferCategory } from '@/lib/platforms';
import { clamp } from '@/lib/utils';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GAMES_URL = 'https://api.igdb.com/v4/games';
const IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';

const REQUEST_TIMEOUT_MS = 8000;
/** Renews the token a bit before it expires, so we don't lose the race. */
const TOKEN_SAFETY_SECONDS = 60;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const SUMMARY_MAX_CHARS = 300;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const FALLBACK_PLATFORM = 'Multiplataforma';

/* -------------------------------------------------------------------------- */
/*  Credentials                                                                */
/* -------------------------------------------------------------------------- */

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function readCredentials(): Credentials | null {
  const clientId = (process.env.TWITCH_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.TWITCH_CLIENT_SECRET ?? '').trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** `true` only when both environment variables are set. */
export function isIgdbConfigured(): boolean {
  return readCredentials() !== null;
}

/** Already sanitized error: safe to log without leaking the secret. */
class IgdbError extends Error {
  constructor(message: string) {
    super(redact(message));
    this.name = 'IgdbError';
  }
}

/** Replaces any occurrence of the client secret with `***`. */
function redact(message: string): string {
  const secret = (process.env.TWITCH_CLIENT_SECRET ?? '').trim();
  if (!secret) return message;
  return message.split(secret).join('***');
}

/** Describes an unknown error without carrying raw objects along. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' ? 'response timed out' : error.message;
  }
  return 'unknown error';
}

/* -------------------------------------------------------------------------- */
/*  OAuth token (client_credentials) with cache and deduplication              */
/* -------------------------------------------------------------------------- */

interface CachedToken {
  accessToken: string;
  /** Epoch in ms, already minus the safety window. */
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;
/** In-flight promise: several concurrent requests share a single token. */
let inFlightToken: Promise<CachedToken> | null = null;

async function requestToken(credentials: Credentials): Promise<CachedToken> {
  // RFC 6749 (2.3.1): client credentials go in the BODY, never in the query
  // string. A URI with the secret ends up in server, proxy and history logs
  // of every intermediary along the way.
  const form = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'client_credentials',
  }).toString();

  let response: Response;
  try {
    // The body carries the secret: nothing from it may leak into error messages.
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new IgdbError(`network failure authenticating with Twitch (${describe(error)})`);
  }

  if (!response.ok) {
    throw new IgdbError(`Twitch rejected authentication (HTTP ${response.status})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new IgdbError('Twitch authentication response is not valid JSON');
  }

  if (!isRecord(payload)) {
    throw new IgdbError('Twitch authentication response has an unexpected format');
  }

  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new IgdbError('Twitch authentication response has no access_token');
  }

  const rawTtl = payload.expires_in;
  const ttlSeconds =
    typeof rawTtl === 'number' && Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : DEFAULT_TOKEN_TTL_SECONDS;

  return {
    accessToken,
    expiresAt: Date.now() + Math.max(ttlSeconds - TOKEN_SAFETY_SECONDS, 0) * 1000,
  };
}

function getToken(credentials: Credentials): Promise<CachedToken> {
  const cached = tokenCache;
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached);
  if (inFlightToken) return inFlightToken;

  const pending = requestToken(credentials);
  inFlightToken = pending;
  // Release the slot only if nobody has started a newer renewal.
  const release = () => {
    if (inFlightToken === pending) inFlightToken = null;
  };
  pending.then((token) => {
    tokenCache = token;
    release();
  }, release);

  return pending;
}

/** Drops the cached token (used when IGDB answers 401/403). */
function invalidateToken(): void {
  tokenCache = null;
}

/* -------------------------------------------------------------------------- */
/*  Raw IGDB response                                                          */
/* -------------------------------------------------------------------------- */

interface IgdbNamedEntity {
  id?: number;
  name?: string;
}

interface IgdbCover {
  id?: number;
  image_id?: string;
}

/** Exactly the fields requested in the Apicalypse query `fields`. */
interface IgdbRawGame {
  id: number;
  name: string;
  summary?: string;
  /** Release date in seconds since the Unix epoch. */
  first_release_date?: number;
  cover?: IgdbCover;
  platforms?: IgdbNamedEntity[];
  genres?: IgdbNamedEntity[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Only `id` and `name` are required; the rest is checked field by field later. */
function isIgdbRawGame(value: unknown): value is IgdbRawGame {
  if (!isRecord(value)) return false;
  const id = value.id;
  const name = value.name;
  return typeof id === 'number' && Number.isFinite(id) && typeof name === 'string' && name.trim().length > 0;
}

function readNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = entry.name;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
  }
  return names;
}

function readReleaseYear(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCFullYear();
}

function readCoverUrl(value: unknown): string {
  if (!isRecord(value)) return '';
  const imageId = value.image_id;
  if (typeof imageId !== 'string') return '';
  const trimmed = imageId.trim();
  // IGDB uses alphanumeric ids ("co1r76"); anything else is dropped.
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return '';
  return `${IMAGE_BASE}/${trimmed}.jpg`;
}

function readSummary(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= SUMMARY_MAX_CHARS) return text;
  return `${text.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…`;
}

function toGame(raw: unknown): Game | null {
  if (!isIgdbRawGame(raw)) return null;

  const platforms = readNames(raw.platforms);
  const platform = platforms[0] ?? FALLBACK_PLATFORM;
  const genres = readNames(raw.genres);

  return {
    id: `igdb-${raw.id}`,
    title: raw.name.trim(),
    platform,
    category: inferCategory(platform),
    releaseYear: readReleaseYear(raw.first_release_date),
    coverUrl: readCoverUrl(raw.cover),
    summary: readSummary(raw.summary),
    genres: genres.length > 0 ? genres : undefined,
    isCustom: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                     */
/* -------------------------------------------------------------------------- */

/** Apicalypse is plain text: quotes and backslashes need escaping. */
function escapeQuery(query: string): string {
  return query
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function buildBody(query: string, limit: number): string {
  return (
    'fields name, summary, first_release_date, cover.image_id, platforms.name, genres.name; ' +
    `search "${escapeQuery(query)}"; ` +
    `limit ${limit}; ` +
    'where version_parent = null & category = 0;'
  );
}

async function postGames(credentials: Credentials, body: string, token: string): Promise<Response> {
  try {
    return await fetch(GAMES_URL, {
      method: 'POST',
      headers: {
        'Client-ID': credentials.clientId,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new IgdbError(`network failure querying IGDB (${describe(error)})`);
  }
}

/**
 * Searches IGDB and returns results already in the app's `Game` format.
 * Throws `IgdbError` (sanitized message) on any failure; the caller
 * decides the fallback.
 */
export async function searchIgdb(query: string, limit: number): Promise<Game[]> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new IgdbError('Twitch/IGDB credentials not configured');
  }

  const term = query.trim();
  if (!term) return [];

  const parsedLimit = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  const safeLimit = clamp(parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
  const body = buildBody(term, safeLimit);

  let token = await getToken(credentials);
  let response = await postGames(credentials, body, token.accessToken);

  // Token revoked early: drop the cache and try exactly once more.
  if (response.status === 401 || response.status === 403) {
    invalidateToken();
    token = await getToken(credentials);
    response = await postGames(credentials, body, token.accessToken);
  }

  if (!response.ok) {
    throw new IgdbError(`IGDB respondeu HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new IgdbError('IGDB response is not valid JSON');
  }

  if (!Array.isArray(payload)) return [];

  const games: Game[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    const game = toGame(entry);
    if (!game || seen.has(game.id)) continue;
    seen.add(game.id);
    games.push(game);
    if (games.length >= safeLimit) break;
  }

  return games;
}
