# ADR 0003 — Performance budgets with a CI ratchet

- **Status:** accepted
- **Date:** 2026-10-02

## Context

Speed is the product: Zerei has to feel instant on a mid-range Android phone on
4G, which is the typical device of its audience in Brazil. A budget that never
fails a build is just decoration.

## Decision

Three guards in CI (`.github/workflows/ci.yml`):

1. **Performance test for the "Beat it!" click** (`lib/games.perf.test.ts`),
   with the full catalog: ≤10ms on the CI machine (≈50ms on a mid-range
   Android) and a list identical to the full code path.
2. **Worker size** ≤3MB gzip (Cloudflare free plan limit).
3. **Lighthouse CI** (`lighthouserc.json`, mobile profile, median of 3 runs).

### Ratchet

Lighthouse limits start from the measured baseline and only move up: no PR can
make things worse, and every improvement tightens the limit in the same PR.

Baseline (2026-10-02, production build, Lighthouse 12 mobile profile):

| Page | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 78 | 100 | 100 | 100 | 0.8s | 2.6s | 800ms | 0 | 2.5MB |
| `/?console=snes` | 88 | 100 | 100 | 100 | 0.8s | 2.5s | 400ms | 0 | 2.5MB |

### Error or warning

The first GitHub run (PR #1) showed the runner is about 2 to 4 times slower
than the dev machine and **very unstable**: the same page scored 0.44, 0.66
and 0.68 in three runs in a row, with LCP up to 12.9s and TBT of 3.9s. A guard
that passes or fails by luck teaches the team to ignore it. So:

- **Error (deterministic):** accessibility = 100, best practices ≥95,
  SEO ≥95, CLS ≤0.02 and transferred bytes ≤2.7MB.
- **Warning (depends on the runner CPU):** performance score, LCP and TBT.

The warnings go back to errors once Phase 2 moves catalog processing off the
main thread. Without that CPU work, the runner's variance drops.

The runner number is also real data. On a slow CPU, like a cheap Android
phone's, the app freezes the screen for almost 4s processing the 57k games.
That's the top priority of Phase 2.

### Ratchet tightened in Phase 1 (2026-10-02)

The catalog is 2.5 times bigger (145k games) and still faster, because the
first screen only downloads the most popular games (`top.json`, ~84KB) and
each console loads on demand.

| Page | Perf | A11y | LCP | TBT | CLS | Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 94 | 100 | 2.7s | 160–180ms | 0 | 1.1MB |
| `/?console=snes` | 95 | 100 | 2.7s | 120–130ms | 0 | 1.7MB |

New limits: bytes ≤2.0MB (error); score ≥0.85 and TBT ≤400ms (warning, with
room for the runner).

### Targets (Phase 2)

| Metric | Target |
| --- | --- |
| LCP (field p75, mobile) | ≤1.8s |
| INP (p75) / "Beat it!" click | ≤100ms / ≤50ms |
| CLS | ≤0.02 |
| Initial JS | ≤110KB br |
| First load of a console page | ≤300KB and ≤25 requests |

What separates the baseline from the targets is known: the app downloads and
processes the 57k games (2.5MB) on the main thread. Phase 2 fixes that with a
per-console catalog, a Web Worker for search and a virtualized grid.

## Consequences

- Performance regressions show up in the PR, with a Lighthouse report.
- The public `/status` page (Phase 2) will show field numbers (RUM) next to
  these lab numbers.
