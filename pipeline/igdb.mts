/**
 * IGDB client for the pipeline (ADR 0004). Runs only on the build machine or
 * in CI, never in the browser.
 *
 * - Twitch OAuth token (client_credentials), read from the environment or .env.local.
 * - Pace: 1 request every 260ms (IGDB limit: 4/s).
 * - Retry with exponential backoff on 429 and 5xx.
 * - Every response is cached on disk (.cache/igdb), keyed by the query:
 *   rerunning the pipeline doesn't spend the quota. `fresh: true` ignores the cache.
 *
 * Credentials never show up in logs or error messages.
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
    throw new Error('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (environment or .env.local).');
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
    if (!res.ok) throw new Error(`Twitch rejected authentication (HTTP ${res.status})`);
    this.token = ((await res.json()) as { access_token: string }).access_token;
    return this.token;
  }

  /** One Apicalypse query. `body` is the whole query (fields, where, limit...). */
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
    throw new Error(`IGDB ${endpoint}: failed after several attempts`);
  }

  /** Every page of a query. `body` without limit/offset; needs a stable `sort`. */
  async queryAll<T>(endpoint: string, body: string): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.query<T>(endpoint, `${body} limit ${PAGE}; offset ${offset};`);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
}
