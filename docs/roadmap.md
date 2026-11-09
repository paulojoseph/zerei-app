# Roadmap

Order set by product priority: **finding and marking beaten games fast** comes
before anything else; the charts panel comes right after.

## Phase 0 — Foundation ✅ (PR #1)

Hosting on Workers + OpenNext, "Beat it!" click from 164ms down to 0.04ms,
stable IDs, tests, security headers, CI with a performance budget.

## Phase 1 — Data ✅ (PR #2)

145k IGDB games in the Edition model, popularity, re-releases left out,
on-demand loading.

## Phase 2 — MVP (in progress)

| Milestone | Deliverable | Why |
| --- | --- | --- |
| **M1 — Mark fast** | "Which consoles did you own?" onboarding, "My consoles" filter, keyboard shortcuts (arrows + B/P/W/N), multi-select with an action bar | Logging 200 games on the first visit is the activation moment |
| **M2 — Panel** | Charts of beaten games by genre, console, generation and decade; a gaming life timeline | Core product request; genres exist since Phase 1 |
| **M3 — Share** | "Gamer DNA" card (image for stories and link previews), labels with Brazilian humor, share buttons | Growth engine |
| **M4 — Game page** | Own URL per game and per console, rendered at the edge; similar games; share "I beat this game" | SEO and shareable links |
| **M5 — Scale** | Search index in a Web Worker, virtualized grid, public `/status` page with real metrics (RUM) | LCP ≤1.8s and INP ≤100ms on a mid-range Android |
| **M6 — Localization** | Brazilian Portuguese locale (pt-BR) alongside English, with locale-aware genre names and summaries | The core audience is Brazilian; the UI moved to English first so the codebase is shared in one language |

## Phase 3 — Growth

Accounts and sync (Google login, no password), public profiles, compare with a
friend, Steam and RetroAchievements import (as suggestions the user confirms),
a community in steps (first without free text, then moderated clubs), a "who
beat X also beat Y" recommender, speedrun records (speedrun.com) and AI to find
that lost childhood game.
