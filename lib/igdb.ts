/**
 * Zerei.app — integração opcional com a IGDB (API v4), via OAuth da Twitch.
 *
 * Só roda no servidor (rota /api/igdb/search). Sem `TWITCH_CLIENT_ID` e
 * `TWITCH_CLIENT_SECRET` o módulo fica inerte: `isIgdbConfigured()` devolve
 * `false` e a rota cai na base local. O client secret nunca aparece em log
 * nem em mensagem de erro — tudo que sai daqui passa por `redact()`.
 */
import type { Game } from '@/types/game';
import { inferCategory } from '@/lib/platforms';
import { clamp } from '@/lib/utils';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GAMES_URL = 'https://api.igdb.com/v4/games';
const IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';

const REQUEST_TIMEOUT_MS = 8000;
/** Renova o token um pouco antes de expirar, para não perder a corrida. */
const TOKEN_SAFETY_SECONDS = 60;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const SUMMARY_MAX_CHARS = 300;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const FALLBACK_PLATFORM = 'Multiplataforma';

/* -------------------------------------------------------------------------- */
/*  Credenciais                                                                */
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

/** `true` só quando as duas variáveis de ambiente estão preenchidas. */
export function isIgdbConfigured(): boolean {
  return readCredentials() !== null;
}

/** Erro já higienizado: pode ser logado sem medo de vazar o segredo. */
class IgdbError extends Error {
  constructor(message: string) {
    super(redact(message));
    this.name = 'IgdbError';
  }
}

/** Troca qualquer ocorrência do client secret por `***`. */
function redact(message: string): string {
  const secret = (process.env.TWITCH_CLIENT_SECRET ?? '').trim();
  if (!secret) return message;
  return message.split(secret).join('***');
}

/** Descreve um erro desconhecido sem carregar objetos crus adiante. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' ? 'tempo de resposta esgotado' : error.message;
  }
  return 'erro desconhecido';
}

/* -------------------------------------------------------------------------- */
/*  Token OAuth (client_credentials) com cache e deduplicação                   */
/* -------------------------------------------------------------------------- */

interface CachedToken {
  accessToken: string;
  /** Epoch em ms já descontada a janela de segurança. */
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;
/** Promessa em voo: várias requisições simultâneas compartilham um só token. */
let inFlightToken: Promise<CachedToken> | null = null;

async function requestToken(credentials: Credentials): Promise<CachedToken> {
  // RFC 6749 (2.3.1): credenciais do cliente vão no CORPO, nunca na query
  // string — uma URI com o segredo acaba em log de servidor, proxy e histórico
  // de qualquer intermediário no caminho.
  const form = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'client_credentials',
  }).toString();

  let response: Response;
  try {
    // O corpo carrega o segredo: nada dele pode escapar para mensagens de erro.
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
    throw new IgdbError(`falha de rede ao autenticar na Twitch (${describe(error)})`);
  }

  if (!response.ok) {
    throw new IgdbError(`Twitch recusou a autenticação (HTTP ${response.status})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new IgdbError('resposta de autenticação da Twitch não é JSON válido');
  }

  if (!isRecord(payload)) {
    throw new IgdbError('resposta de autenticação da Twitch em formato inesperado');
  }

  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new IgdbError('resposta de autenticação da Twitch sem access_token');
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
  // Libera o slot só se ninguém já tiver começado uma renovação mais nova.
  const release = () => {
    if (inFlightToken === pending) inFlightToken = null;
  };
  pending.then((token) => {
    tokenCache = token;
    release();
  }, release);

  return pending;
}

/** Descarta o token em cache (usado quando a IGDB responde 401/403). */
function invalidateToken(): void {
  tokenCache = null;
}

/* -------------------------------------------------------------------------- */
/*  Resposta crua da IGDB                                                      */
/* -------------------------------------------------------------------------- */

interface IgdbNamedEntity {
  id?: number;
  name?: string;
}

interface IgdbCover {
  id?: number;
  image_id?: string;
}

/** Exatamente os campos pedidos no `fields` da consulta Apicalypse. */
interface IgdbRawGame {
  id: number;
  name: string;
  summary?: string;
  /** Data de lançamento em segundos desde a época Unix. */
  first_release_date?: number;
  cover?: IgdbCover;
  platforms?: IgdbNamedEntity[];
  genres?: IgdbNamedEntity[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Só `id` e `name` são obrigatórios; o resto é conferido campo a campo depois. */
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
  // A IGDB usa ids alfanuméricos ("co1r76"); qualquer outra coisa é descartada.
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
/*  Busca                                                                      */
/* -------------------------------------------------------------------------- */

/** Apicalypse é texto puro: aspas e barras invertidas precisam de escape. */
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
    // `category` foi substituído por `game_type` na IGDB: com o campo antigo a
    // busca voltava sempre vazia. 0 = jogo principal, 8/9 = remake/remaster.
    'where version_parent = null & game_type = (0,8,9);'
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
    throw new IgdbError(`falha de rede ao consultar a IGDB (${describe(error)})`);
  }
}

/**
 * Busca jogos na IGDB e devolve já no formato `Game` do app.
 * Lança `IgdbError` (mensagem higienizada) em qualquer falha — quem chama
 * decide o fallback.
 */
export async function searchIgdb(query: string, limit: number): Promise<Game[]> {
  const credentials = readCredentials();
  if (!credentials) {
    throw new IgdbError('credenciais da Twitch/IGDB não configuradas');
  }

  const term = query.trim();
  if (!term) return [];

  const parsedLimit = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  const safeLimit = clamp(parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
  const body = buildBody(term, safeLimit);

  let token = await getToken(credentials);
  let response = await postGames(credentials, body, token.accessToken);

  // Token revogado antes da hora: joga fora o cache e tenta uma única vez mais.
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
    throw new IgdbError('resposta da IGDB não é JSON válido');
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
