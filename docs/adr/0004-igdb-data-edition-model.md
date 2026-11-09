# ADR 0004 — IGDB as the main source and the Work/Edition model

- **Status:** accepted
- **Date:** 2026-10-02

## Context

The Phase 0 catalog (libretro + Wikidata) has no genres, is missing years, has
regional duplicates and covers from the wrong platform, and the image license
is weak. The 2026-10-02 audit against IGDB:

| Console | Games on IGDB | With cover | Our catalog covered (exact name) |
| --- | --- | --- | --- |
| NES + Famicom | 2,813 | 89% | 74% |
| Master System | 564 | 95% | 80% |
| Mega Drive | 1,668 | 92% | 78% |
| SNES + Super Famicom | 3,093 | 94% | 84% |
| PS1 | 3,937 | 97% | 65% |
| PS2 | 4,297 | 99% | 71% |
| PS4 | 20,582 | 98% | 87% |
| Switch | 29,519 | 90% | 84% |

Titles released in Brazil (No-Intro "(Brazil)"): 83% of Master System and 95%
of Mega Drive are on IGDB; exclusives like "As Aventuras da TV Colosso" are
missing.

## Decision

1. **IGDB is the main source** (free non-commercial use, visible credit).
   Wikidata (CC0) is used for Portuguese names and ID cross-referencing; the
   Brazilian curation lives in versioned files in git, reviewed through PRs.
2. **Model:** *Work* (the game, an IGDB `game` without `version_parent`) and
   *Edition* (work × Zerei console). **The user marks "beaten" on the
   Edition**; the panel also aggregates by Work. A Zerei console can group
   several IGDB platforms (NES = NES + Famicom; SNES = SNES + Super Famicom).
3. **Accepted types** (`game_type`): main game, remake, remaster, port,
   expanded game and standalone expansion. DLC, bundle, mod, episode, season,
   pack and update are left out.
4. **A re-release is not an edition:** a game first released before the
   console (Virtual Console, Arcade Archives, compilations) doesn't go into
   that console's default list.
5. **IDs:** the Edition inherits the stable ID already published when it
   matches a game from the old catalog (ADR 0002); an old game with no IGDB
   match stays in the catalog with its old source until it's merged by alias.
   No saved progress is lost.
6. **Covers** load straight from the IGDB CDN (`images.igdb.com`), with no
   copy of our own, until the storage terms are confirmed.
7. **Popularity** (`popularity_primitives` plus rating count) sorts the
   catalog, so the classic shows up before the obscure.
8. **Pipeline in TypeScript** (the bottleneck is IGDB's 4 req/s limit, not
   CPU), run by Node 24 itself with no build step, with raw responses cached
   so reruns are cheap.

## Consequences

- Genre, theme, perspective, game modes, franchise, companies, similar games
  and external IDs (Steam, Xbox, PSN, the base for the Phase 3 import) now
  exist per game.
- PS4 and Switch have 20k to 30k games each on IGDB; popularity is what keeps
  obscure titles from burying the classics.
- Dependency on a third party (Twitch/Amazon): raw responses are cached and
  versioned as an artifact, so the catalog survives a change in terms.
