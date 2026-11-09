'use client';

import { ChartColumn, Download, FileText, Save, Search, Trophy, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  backupFilename,
  backupToCsv,
  backupToJson,
  downloadTextFile,
  parseBackupFile,
} from '@/lib/backup';
import { cn, debounce, pluralize, CONTAINER } from '@/lib/utils';
import { useAllGames, useBeatenCount, useGameStore, useHydrated } from '@/stores/useGameStore';
import type { BackupPayload, ImportMode } from '@/types/game';

/** Delay before pushing typed text to the store (the screen responds right away). */
const SEARCH_DEBOUNCE_MS = 220;

/** Backup read from the file, waiting for the user to choose how to apply it. */
interface PendingImport {
  payload: BackupPayload;
  filename: string;
  records: number;
  customGames: number;
}

export function Header() {
  /* ---------------------------------------------------------------- store -- */
  const hydrated = useHydrated();
  const beatenCount = useBeatenCount();
  const games = useAllGames();
  const storeSearch = useGameStore((s) => s.search);
  const setSearch = useGameStore((s) => s.setSearch);
  const setStatsOpen = useGameStore((s) => s.setStatsOpen);
  const importBackup = useGameStore((s) => s.importBackup);
  const pushToast = useGameStore((s) => s.pushToast);

  /* ------------------------------------------------------------- elements -- */
  const headerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  /* ---------------------------------------------------------------- state -- */
  const [text, setText] = useState(storeSearch);
  const [syncedSearch, setSyncedSearch] = useState(storeSearch);
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  /* ----------------------------------------------------- search (debounce) -- */

  // A single debounce instance per mount; recreating it on every key would reset the timer.
  const pushSearch = useMemo(() => debounce(setSearch, SEARCH_DEBOUNCE_MS), [setSearch]);

  /**
   * Publishes the real header height in `--header-h`. The filter bar sticks to
   * that offset. Hardcoding the value breaks alignment as soon as the header wraps
   * to two lines (phone and tablet), hiding the generation tabs behind it.
   */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => pushSearch.cancel(), [pushSearch]);

  // Keyed derived state: if the store is cleared from outside (`resetFilters`, the
  // "clear filters" button), the local input follows along, with no mirror useEffect.
  if (storeSearch !== syncedSearch) {
    setSyncedSearch(storeSearch);
    setText(storeSearch);
    // A pending submit would write the old text back right after.
    pushSearch.cancel();
  }

  const clearSearch = useCallback(
    (refocus: boolean) => {
      pushSearch.cancel();
      setText('');
      setSearch('');
      if (refocus) inputRef.current?.focus();
    },
    [pushSearch, setSearch],
  );

  // "/" shortcut to jump into search from anywhere on the page.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;

      // Someone already typing in a field keeps typing a slash.
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      // An open dialog takes priority: search is behind it.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ------------------------------------------------------------ backup menu -- */

  // Closes on outside click and on Escape while the popover is open.
  useEffect(() => {
    if (!exportOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && exportMenuRef.current?.contains(target)) return;
      setExportOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setExportOpen(false);
      exportButtonRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportOpen]);

  const handleExport = useCallback(
    (format: 'json' | 'csv') => {
      setExportOpen(false);

      const payload = useGameStore.getState().buildBackup();
      const records = Object.keys(payload.progress).length;

      if (records === 0) {
        pushToast('Nothing to export yet. Mark your first "Beat it!".', 'info');
        return;
      }

      if (format === 'json') {
        downloadTextFile(backupFilename('json'), 'application/json', backupToJson(payload));
      } else {
        downloadTextFile(backupFilename('csv'), 'text/csv', backupToCsv(payload, games));
      }

      pushToast(`Backup exported: ${records} record(s).`);
    },
    [games, pushToast],
  );

  /* ----------------------------------------------------------------- import -- */

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      // Resetting the value now lets the same file be picked again later.
      input.value = '';
      if (!file) return;

      try {
        const result = parseBackupFile(file.name, await file.text());
        if (!result.ok) {
          pushToast(result.error, 'error');
          return;
        }
        setPendingImport({
          payload: result.payload,
          filename: file.name,
          records: Object.keys(result.payload.progress).length,
          customGames: result.payload.customGames.length,
        });
      } catch {
        pushToast("Couldn't read that file. Try exporting it again.", 'error');
      }
    },
    [pushToast],
  );

  const applyImport = useCallback(
    (mode: ImportMode) => {
      if (!pendingImport) return;
      const result = importBackup(pendingImport.payload, mode);
      setPendingImport(null);
      pushToast(result.message, result.ok ? 'success' : 'error');
    },
    [importBackup, pendingImport, pushToast],
  );

  /* ----------------------------------------------------------- live counter -- */

  // `pluralize` returns "12 games beaten"; the number is pulled out to get the pixel font.
  const phrase = pluralize(beatenCount, 'game beaten', 'games beaten');
  const beatenNoun = phrase.slice(phrase.indexOf(' ') + 1);

  // `key={beatenCount}` remounts the badge on every new number and the `animate-pop`
  // class restarts with it. Keeping the previous value in state (the official "adjust
  // state when a prop changes" pattern) holds the animation on first paint and when
  // hydration arrives, when nothing changed that's worth celebrating.
  const [shownCount, setShownCount] = useState<number | null>(null);
  const [popped, setPopped] = useState(false);
  if (hydrated && shownCount !== beatenCount) {
    setPopped(shownCount !== null);
    setShownCount(beatenCount);
  }

  const hasText = text.length > 0;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
    >
      <div className={cn(CONTAINER, 'flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 lg:flex-nowrap lg:gap-4 lg:py-3')}>
        {/* ---------------------------------------------------------- marca -- */}
        <div className="flex w-full min-w-0 items-center gap-2.5 lg:w-auto lg:shrink-0">
          <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-neon/30 bg-neon/10 scanlines">
            <Trophy aria-hidden="true" className="size-5 text-neon" />
          </span>

          <span className="font-display text-sm leading-none whitespace-nowrap sm:text-base">
            <span className="text-neon text-glow">Zerei</span>
            <span className="text-ink-soft">.app</span>
          </span>

          {/* live badge */}
          <div
            title="Games you've beaten"
            className="ml-auto flex h-8 min-w-0 items-center rounded-xl border border-line bg-panel-2/60 px-2.5"
          >
            {hydrated ? (
              <span
                key={beatenCount}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-ink-soft',
                  popped && 'animate-pop',
                )}
              >
                {/* `font-normal`: Press Start 2P has a single weight; synthetic bold blurs it. */}
                <b className="shrink-0 font-display font-normal text-neon">{beatenCount}</b>
                <span className="truncate">{beatenNoun}</span>
              </span>
            ) : (
              // Skeleton in place of the number: avoids flashing "0" and the hydration mismatch.
              <span aria-hidden="true" className="h-3.5 w-24 rounded bg-panel-3 animate-shimmer" />
            )}
          </div>
        </div>

        {/* --------------------------------------------------------- search -- */}
        {/* On phones the logo takes the whole row, so search and actions drop to the one below. */}
        <div className="relative min-w-0 flex-1 lg:max-w-2xl">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
          />
          <input
            ref={inputRef}
            type="search"
            value={text}
            onChange={(event) => {
              const value = event.target.value;
              setText(value);
              pushSearch(value);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // Escape here must not bubble up and close something else: focus belongs to search.
              event.preventDefault();
              event.stopPropagation();
              clearSearch(false);
              inputRef.current?.blur();
            }}
            aria-label="Search games by title or console"
            placeholder="Search by title or console... (Mega Drive, PS1, arcade)"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              'h-10 w-full appearance-none rounded-xl border border-line bg-panel-2 pl-9 text-[16px] text-ink outline-none',
              'placeholder:text-ink-dim transition-colors duration-200 hover:border-neon/25 focus:border-neon/50',
              '[&::-webkit-search-cancel-button]:appearance-none',
              hasText ? 'pr-11' : 'pr-3',
            )}
          />
          {hasText ? (
            <button
              type="button"
              onClick={() => clearSearch(true)}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-xl text-ink-dim transition-colors duration-200 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        {/* -------------------------------------------------------- actions -- */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:ml-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStatsOpen(true)}
            aria-label="View stats"
            className="text-ink hover:border-cyan/50 hover:text-cyan sm:w-auto sm:px-3"
          >
            <ChartColumn aria-hidden="true" className="size-4" />
            <span className="hidden text-sm sm:inline">Stats</span>
          </Button>

          {/* export menu */}
          <div ref={exportMenuRef} className="relative">
            <Button
              ref={exportButtonRef}
              variant="outline"
              size="icon"
              onClick={() => setExportOpen((open) => !open)}
              aria-label="Export backup"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className={cn('sm:w-auto sm:px-3', exportOpen && 'border-neon/50 text-neon')}
            >
              <Download aria-hidden="true" className="size-4" />
              <span className="hidden text-sm sm:inline">Export</span>
            </Button>

            {exportOpen ? (
              <div
                role="menu"
                aria-label="Backup format"
                className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel-2 p-1 shadow-2xl animate-fade-in"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleExport('json')}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-200 hover:bg-panel-3"
                >
                  <Save aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon" />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">Export JSON</span>
                    <span className="block text-xs text-ink-dim">Full backup, restores everything</span>
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleExport('csv')}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-200 hover:bg-panel-3"
                >
                  <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan" />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">Export CSV</span>
                    <span className="block text-xs text-ink-dim">Opens straight in a spreadsheet</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import backup"
            className="sm:w-auto sm:px-3"
          >
            <Upload aria-hidden="true" className="size-4" />
            <span className="hidden text-sm sm:inline">Import</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            aria-label="Backup file to import (JSON or CSV)"
            className="hidden"
            accept=".json,.csv,application/json,text/csv"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* ------------------------------------------ how to apply the backup -- */}
      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        labelledBy="import-mode-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="import-mode-title" className="font-display text-xs leading-relaxed text-ink sm:text-sm">
            Import backup
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            We found{' '}
            <b className="font-semibold text-ink">
              {pluralize(pendingImport?.records ?? 0, 'record')}
            </b>{' '}
            in the file{' '}
            <span className="break-all text-ink-dim">{pendingImport?.filename}</span>.
            {pendingImport && pendingImport.customGames > 0
              ? ` It also brings ${pluralize(pendingImport.customGames, 'game from the personal catalog', 'games from the personal catalog')}.`
              : ''}
          </p>

          <div className="mt-5 grid gap-2">
            <Button
              variant="outline"
              onClick={() => applyImport('merge')}
              className="h-auto w-full flex-col items-start justify-start gap-1 border-neon/40 px-4 py-3 text-left hover:border-neon hover:text-ink"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">Merge with my data</span>
                <span className="rounded-md border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[10px] font-medium text-neon">
                  recommended
                </span>
              </span>
              <span className="text-xs font-normal text-ink-soft">
                Keeps what&apos;s already here. On conflict, the most recent record wins.
              </span>
            </Button>

            <Button
              variant="danger"
              onClick={() => applyImport('replace')}
              className="h-auto w-full flex-col items-start justify-start gap-1 px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold">Replace everything</span>
              <span className="text-xs font-normal text-danger/80">
                Deletes current progress and keeps only what&apos;s in the file.
              </span>
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={() => setPendingImport(null)}
            className="mt-2 w-full"
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </header>
  );
}
