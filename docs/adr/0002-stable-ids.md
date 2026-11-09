# ADR 0002 — Stable game IDs

- **Status:** accepted
- **Date:** 2026-10-02

## Context

User progress ("beaten", score, notes) is stored by game ID. Until now the ID
was derived from the title (`snes--chrono-trigger`): any title fix at the
source, a source switch (libretro/Wikidata → IGDB) or a merge of regional
duplicates would change the ID and orphan the progress with no error at all.
The game would just "unmark" itself.

## Decision

1. **The ID is minted once and never recomputed.** `data/id-map.json` stores,
   per console, `source key → ID`. Source keys: `lr:<normalized title>`
   (libretro) and `wd:<Wikidata item>` (modern); Phase 1 adds the IGDB keys.
2. **IDs already published were adopted as they are** (57,579 of 57,579 kept
   in the migration). New games get `g_` plus 8 random characters with no
   meaning.
3. **The guard:** the catalog build fails if an ID that was ever in `id-map`
   doesn't show up in the output and has no alias in `data/id-aliases.json`
   (`oldId → newId`). Publishing is atomic: when blocked, nothing is written.
   `--allow-removals` exists for deliberate removals.
4. **The app repoints progress through the aliases** (`lib/aliases.ts`) on
   every LocalStorage read and every backup import. On merges, the most recent
   record wins.

## Consequences

- Merging duplicates (Rockman 2 → Mega Man 2) becomes one line in
  `id-aliases.json`, with no loss for anyone.
- `data/id-map.json` grows forever (3.4MB now, text with one key per line, so
  diffs stay readable in the PR). It never ships to the browser.
- The Phase 1 Work/Edition/Release model starts here: the stable ID belongs to
  the **Edition** (game × platform), which is where the user marks "beaten".
