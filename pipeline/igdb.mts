/**
 * Cliente da IGDB para o pipeline (ADR 0004). Roda só na máquina de build ou
 * no CI, nunca no navegador.
 *
 * - Token OAuth da Twitch (client_credentials), lido do ambiente ou do .env.local.
 * - Ritmo: 1 requisição a cada 260 ms (limite da IGDB: 4/s).
 * - Retentativa com espera exponencial em 429 e 5xx.
 * - Toda resposta fica em cache em disco (.cache/igdb), indexada pela consulta:
 *   reexecutar o pipeline não gasta a cota. `fresh: true` ignora o cache.
 *
 * As credenciais nunca aparecem em log nem em mensagem de erro.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache/igdb');
const MIN_GAP_MS = 260;
const PAGE = 500;

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function readCredentials(): Credentials {
  let clientId = process.env.TWITCH_CLIENT_ID ?? '';
  let clientSecret = process.env.TWITCH_CLIENT_SECRET ?? '';
  const envFile = path.join(ROOT, '.env.local');
  if ((!clientId || !clientSecret) && existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, '');
      if (match[1] === 'TWITCH_CLIENT_ID') clientId ||= value;
      else clientSecret ||= value;
    }
  }
  if (!clientId || !clientSecret) {
    throw new Error('Defina TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET (ambiente ou .env.local).');
  }
  return { clientId, clientSecret };
}

export class IgdbClient {
  private readonly credentials = readCredentials();
  private token: string | null = null;
  private lastCall = 0;
  private readonly fresh: boolean;
  requests = 0;
  cacheHits = 0;

  constructor(fresh = false) {
    this.fresh = fresh;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) throw new Error(`Twitch recusou a autenticação (HTTP ${res.status})`);
    this.token = ((await res.json()) as { access_token: string }).access_token;
    return this.token;
  }

  /** Uma consulta Apicalypse. `body` é a consulta inteira (fields, where, limit...). */
  async query<T>(endpoint: string, body: string): Promise<T[]> {
    const key = createHash('sha1').update(`${endpoint}\n${body}`).digest('hex');
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!this.fresh && existsSync(file)) {
      this.cacheHits += 1;
      return JSON.parse(await readFile(file, 'utf8')) as T[];
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const wait = this.lastCall + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCall = Date.now();
      this.requests += 1;

      const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-ID': this.credentials.clientId,
          Authorization: `Bearer ${await this.getToken()}`,
          'Content-Type': 'text/plain',
        },
        body,
      });
      if (res.status === 401) {
        this.token = null;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(Math.min(1000 * 2 ** attempt, 30_000));
        continue;
      }
      if (!res.ok) throw new Error(`IGDB ${endpoint} respondeu HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

      const data = (await res.json()) as T[];
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, JSON.stringify(data));
      return data;
    }
    throw new Error(`IGDB ${endpoint}: falhou depois de várias tentativas`);
  }

  /** Todas as páginas de uma consulta. `body` sem limit/offset; precisa de `sort` estável. */
  async queryAll<T>(endpoint: string, body: string): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.query<T>(endpoint, `${body} limit ${PAGE}; offset ${offset};`);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
}
