/**
 * GET /api/igdb/search?q=mario&limit=20
 *
 * Game search with graceful degradation: if IGDB is enabled, results come
 * from there; otherwise (or if IGDB fails) we return the local database
 * (`SEED_GAMES`) with a message in `notice`. The route never breaks the UI.
 *
 * HOW TO ENABLE ONLINE SEARCH
 * 1. Create an application at https://dev.twitch.tv/console/apps (IGDB uses
 *    Twitch OAuth). Under "OAuth Redirect URLs" you can use http://localhost:3000.
 * 2. Copy the Client ID and generate a Client Secret.
 * 3. At the project root: `cp .env.example .env.local` and fill in
 *    TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.
 * 4. Restart `npm run dev`. Without this step the app keeps working 100%
 *    offline with the local database.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { matchesSearch, SEED_GAMES } from '@/lib/games';
import { isIgdbConfigured, searchIgdb } from '@/lib/igdb';
import { clamp } from '@/lib/utils';
import type { Game, IgdbSearchResponse } from '@/types/game';

// Depends on environment variables and the network: no prerender, no cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const NOT_CONFIGURED_NOTICE =
  'Online search is off: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env.local. Showing local results.';
const IGDB_DOWN_NOTICE =
  "We couldn't reach IGDB right now. Showing local results, try again in a moment.";
const SHORT_QUERY_NOTICE = 'Type at least 2 characters to search.';
const RATE_LIMITED_NOTICE = 'Too many searches in a row. Wait a few seconds and try again.';

/* -------------------------------------------------------------------------- */
/*  Rate limiter                                                               */
/* -------------------------------------------------------------------------- */

/*
 * With credentials configured, this route becomes an open, AUTHENTICATED proxy:
 * anyone on the internet could burn the app owner's IGDB quota.
 *
 * The limiter below is PER INSTANCE: the `Map` lives in this process's memory,
 * so it doesn't apply across replicas and doesn't survive a restart. That's on
 * purpose. Zerei.app is a personal app, and the goal here is just to contain
 * bursts without dragging Redis (or any other dependency) into the project.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

/** IP → epoch (ms) of requests still inside the window. */
const rateLimitHits = new Map<string, number[]>();

function readClientKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

/**
 * Sliding window per IP. Returns `0` when the request goes through, or how many
 * seconds are left until it's allowed when the limit is hit. It also drops
 * expired entries so the `Map` doesn't grow without bound.
 */
function rateLimitRetryAfter(key: string): number {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  for (const [entryKey, timestamps] of rateLimitHits) {
    const recent = timestamps.filter((at) => at > cutoff);
    if (recent.length === 0) rateLimitHits.delete(entryKey);
    else rateLimitHits.set(entryKey, recent);
  }

  const hits = rateLimitHits.get(key) ?? [];
  if (hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = hits[0] ?? now;
    // Round up: `Retry-After: 0` would invite an immediate retry.
    return Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
  }

  hits.push(now);
  rateLimitHits.set(key, hits);
  return 0;
}

/* -------------------------------------------------------------------------- */

function reply(
  body: IgdbSearchResponse,
  status = 200,
  headers?: Record<string, string>,
): NextResponse<IgdbSearchResponse> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

/** Fallback: the first `limit` local games that match the query. */
function searchLocal(query: string, limit: number): Game[] {
  const results: Game[] = [];
  for (const game of SEED_GAMES) {
    if (results.length >= limit) break;
    if (matchesSearch(game, query)) results.push(game);
  }
  return results;
}

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return clamp(parsed, 1, MAX_LIMIT);
}

export async function GET(request: NextRequest): Promise<NextResponse<IgdbSearchResponse>> {
  const params = request.nextUrl.searchParams;
  const query = (params.get('q') ?? '').trim();
  const limit = parseLimit(params.get('limit'));

  if (query.length < MIN_QUERY_LENGTH) {
    return reply({ source: 'local', results: [], notice: SHORT_QUERY_NOTICE }, 400);
  }

  if (!isIgdbConfigured()) {
    // Without credentials the route only reads the local database: no quota spent, no limit.
    return reply({
      source: 'local',
      results: searchLocal(query, limit),
      notice: NOT_CONFIGURED_NOTICE,
    });
  }

  const retryAfter = rateLimitRetryAfter(readClientKey(request));
  if (retryAfter > 0) {
    return reply({ source: 'local', results: [], notice: RATE_LIMITED_NOTICE }, 429, {
      'Retry-After': String(retryAfter),
    });
  }

  try {
    const results = await searchIgdb(query, limit);
    return reply({ source: 'igdb', results });
  } catch (error) {
    // The message already comes sanitized from lib/igdb (no client secret).
    console.error('[igdb] search failed:', error instanceof Error ? error.message : error);
    return reply({
      source: 'local',
      results: searchLocal(query, limit),
      notice: IGDB_DOWN_NOTICE,
    });
  }
}
