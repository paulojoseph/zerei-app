# ADR 0001 — Hosting on Cloudflare Workers with OpenNext

- **Status:** accepted
- **Date:** 2026-10-02

## Context

Zerei needs a real page (indexable HTML) for each game, tens of thousands
today and hundreds of thousands with IGDB, and in the next phases a server for
accounts, share images (OG) and AI search. The project is free and
non-commercial, so the cost has to stay at US$0, with at most US$5/month as
insurance for traffic spikes.

Options considered:

1. **Cloudflare Pages with static export.** 20k file limit per deploy, so one
   page per game doesn't fit. No server for OG, accounts or AI.
2. **Vercel.** Native integration, but the free plan caps bandwidth
   (100GB/month), which is risky for an image-heavy site with viral traffic.
3. **Cloudflare Workers with the OpenNext adapter.** Pages rendered on demand
   at the edge and cached; static assets served by the CDN; the same code runs
   on Vercel and AWS (OpenNext/SST).

## Decision

Option 3. Feasibility test run on 2026-10-02 with Next 16.3.8,
`@opennextjs/cloudflare` 1.20.7 and `wrangler` 4.146.0, running locally on
`workerd`:

| Check | Result |
| --- | --- |
| `opennextjs-cloudflare build` | ok, 12.5s |
| `GET /` (static) | 200, 46ms |
| `GET /api/igdb/search` (dynamic route) | 200, 41ms |
| `GET /catalog/*.json` (asset) | 200, 4ms |
| `GET /_next/image` local and remote | 200 |
| Worker size | 4.9MB / **1.05MB gzip** (free limit: 3MB) |

The adapter requires `next >= 16.3.6`, so Next went from 16.3.3 to 16.3.8.

## Consequences

- `npm run preview` builds and runs the Worker locally; `npm run deploy`
  publishes it.
- The incremental cache (ISR) on R2 stays commented out in
  `open-next.config.ts` until the Cloudflare account exists.
- Risk: the adapter may lag behind new Next features. Mitigation: pinned
  versions and the OpenNext build running in CI on every PR.
- Plan B, if the adapter blocks an upgrade: static export of the main pages
  plus a separate Worker for the API, OG and game pages.
