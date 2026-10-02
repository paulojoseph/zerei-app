/**
 * GET /api/igdb/search?q=mario&limit=20
 *
 * Busca de jogos com degradação graciosa: se a IGDB estiver ligada, os
 * resultados vêm de lá; caso contrário (ou se a IGDB falhar) devolvemos a base
 * local (`SEED_GAMES`) com um aviso em `notice` — a rota nunca quebra a UI.
 *
 * COMO HABILITAR A BUSCA ONLINE
 * 1. Crie um aplicativo em https://dev.twitch.tv/console/apps (a IGDB usa o
 *    OAuth da Twitch). Em "OAuth Redirect URLs" pode usar http://localhost:3000.
 * 2. Copie o Client ID e gere um Client Secret.
 * 3. Na raiz do projeto: `cp .env.example .env.local` e preencha
 *    TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET.
 * 4. Reinicie o `npm run dev`. Sem esse passo o app segue funcionando 100%
 *    offline com a base local.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { matchesSearch, SEED_GAMES } from '@/lib/games';
import { isIgdbConfigured, searchIgdb } from '@/lib/igdb';
import { clamp } from '@/lib/utils';
import type { Game, IgdbSearchResponse } from '@/types/game';

// Depende de variáveis de ambiente e de rede: nada de pré-render nem de cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const NOT_CONFIGURED_NOTICE =
  'Busca online desativada: configure TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET no .env.local. Mostrando resultados da base local.';
const IGDB_DOWN_NOTICE =
  'Não conseguimos falar com a IGDB agora. Mostrando resultados da base local — tente de novo em instantes.';
const SHORT_QUERY_NOTICE = 'Informe ao menos 2 caracteres para buscar.';
const RATE_LIMITED_NOTICE = 'Muitas buscas seguidas. Espere alguns segundos e tente de novo.';

/* -------------------------------------------------------------------------- */
/*  Limitador de taxa                                                          */
/* -------------------------------------------------------------------------- */

/*
 * Com credenciais configuradas esta rota vira um proxy CREDENCIADO e aberto:
 * qualquer um na internet poderia queimar a cota da IGDB do dono do app.
 *
 * O limitador abaixo é POR INSTÂNCIA: o `Map` vive na memória deste processo,
 * então não vale para várias réplicas nem sobrevive a um restart. É proposital
 * — o Zerei.app é um app pessoal, e o objetivo aqui é só conter rajadas sem
 * arrastar Redis (ou qualquer outra dependência) para dentro do projeto.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

/** IP → epoch (ms) das requisições ainda dentro da janela. */
const rateLimitHits = new Map<string, number[]>();

function readClientKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

/**
 * Janela deslizante por IP. Devolve `0` quando a requisição passa, ou quantos
 * segundos faltam para liberar quando o limite estourou. Também descarta as
 * entradas vencidas para o `Map` não crescer sem limite.
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
    // Arredonda para cima: `Retry-After: 0` convidaria a tentar de novo já.
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

/** Fallback: os primeiros `limit` jogos da base local que casam com a busca. */
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
    // Sem credenciais a rota só lê a base local: não gasta cota, não limitamos.
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
    // A mensagem já vem higienizada do lib/igdb (sem client secret).
    console.error('[igdb] busca falhou:', error instanceof Error ? error.message : error);
    return reply({
      source: 'local',
      results: searchLocal(query, limit),
      notice: IGDB_DOWN_NOTICE,
    });
  }
}
