'use client';

import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { remapProgress } from '@/lib/aliases';
import { CATALOG_CONSOLE_IDS, consoleIdOf, fetchConsoleGames, fetchTopGames } from '@/lib/catalog';
import { SEED_GAMES, countByStatus } from '@/lib/games';
import type {
  BackupPayload,
  Game,
  GameStatus,
  ImportMode,
  ImportResult,
  PlatformFilter,
  SortMode,
  StatusFilter,
  UserGameProgress,
} from '@/types/game';
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/types/game';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface PersistedState {
  progress: Record<string, UserGameProgress>;
  customGames: Game[];
  /** Consoles the user owned (ids from data/consoles.json), picked during onboarding. */
  myConsoles: string[];
  /** Onboarding finished or skipped: it won't show again. */
  onboardingDone: boolean;
}

interface GameStore extends PersistedState {
  /* ---- session state (not persisted) ---- */
  search: string;
  platform: PlatformFilter;
  status: StatusFilter;
  brazilOnly: boolean;
  sort: SortMode;
  /**
   * Visible catalog: the most popular (top.json) + consoles already downloaded.
   * Nothing is downloaded before it's needed (see `ensureConsoles`).
   */
  catalog: Game[];
  catalogTop: Game[];
  catalogConsoles: Record<string, Game[]>;
  catalogStatus: CatalogStatus;
  selectedGameId: string | null;
  statsOpen: boolean;
  hydrated: boolean;
  toast: Toast | null;

  /* ---- filters ---- */
  setSearch: (value: string) => void;
  setPlatform: (value: PlatformFilter) => void;
  setStatusFilter: (value: StatusFilter) => void;
  toggleBrazilOnly: () => void;
  setBrazilOnly: (value: boolean) => void;
  setSort: (value: SortMode) => void;
  resetFilters: () => void;

  /* ---- UI ---- */
  openGame: (gameId: string) => void;
  closeGame: () => void;
  setStatsOpen: (open: boolean) => void;
  setHydrated: () => void;
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: () => void;

  /** Multi-select (game ids), to mark several at once. */
  selection: string[];

  /* ---- progress ---- */
  setGameStatus: (gameId: string, status: GameStatus) => void;
  /** Same status for several games, in a single update. Returns how many. */
  setManyStatus: (gameIds: string[], status: GameStatus) => number;
  toggleBeaten: (gameId: string) => void;
  updateProgress: (
    gameId: string,
    patch: Partial<Omit<UserGameProgress, 'gameId' | 'updatedAt'>>,
  ) => void;
  clearProgress: (gameId: string) => void;

  /* ---- onboarding and selection ---- */
  setMyConsoles: (ids: string[]) => void;
  finishOnboarding: () => void;
  reopenOnboarding: () => void;
  toggleSelected: (gameId: string) => void;
  clearSelection: () => void;

  /* ---- catalog ---- */
  loadCatalog: () => void;
  /** Downloads (once) the catalog of these consoles. 'all' = every console. */
  ensureConsoles: (ids: string[] | 'all') => void;
  addCustomGames: (games: Game[]) => number;
  removeCustomGame: (gameId: string) => void;

  /* ---- backup ---- */
  buildBackup: () => BackupPayload;
  importBackup: (payload: BackupPayload, mode: ImportMode) => ImportResult;
}

const now = () => new Date().toISOString();

let toastSeq = 0;

const FILTER_DEFAULTS = {
  search: '',
  platform: 'all' as PlatformFilter,
  status: 'all' as StatusFilter,
  brazilOnly: false,
  sort: 'recent' as SortMode,
};

/**
 * Applies a status to several games at once (a single store update, a single
 * re-render). Returns the same object if nothing changed.
 *
 * "Not played" is just another status, not a delete command: unmarking a game
 * must not take its score, its memories and the year it was beaten along with
 * it. The only destructive path is `clearProgress`, which has its own button
 * in the UI ("Clear record"). When there's nothing to keep, then the key
 * goes away so the map doesn't grow for nothing.
 */
function withStatus(
  progress: Record<string, UserGameProgress>,
  gameIds: string[],
  status: GameStatus,
): Record<string, UserGameProgress> {
  let next: Record<string, UserGameProgress> | null = null;
  for (const gameId of gameIds) {
    const current = progress[gameId];
    if (current?.status === status) continue;
    next ??= { ...progress };
    if (status === 'unplayed') {
      const worthKeeping =
        current !== undefined &&
        (current.rating !== undefined || current.notes !== undefined || current.completedYear !== undefined);
      if (!worthKeeping) {
        delete next[gameId];
        continue;
      }
    }
    next[gameId] = mergeProgress(current, gameId, { status });
  }
  return next ?? progress;
}

/** Merges existing progress with the patch, always stamping `updatedAt`. */
function mergeProgress(
  current: UserGameProgress | undefined,
  gameId: string,
  patch: Partial<Omit<UserGameProgress, 'gameId' | 'updatedAt'>>,
): UserGameProgress {
  const next: UserGameProgress = {
    gameId,
    status: patch.status ?? current?.status ?? 'unplayed',
    completedYear: patch.completedYear !== undefined ? patch.completedYear : current?.completedYear,
    rating: patch.rating !== undefined ? patch.rating : current?.rating,
    notes: patch.notes !== undefined ? patch.notes : current?.notes,
    // Storing the console lets us download only its file when the app reopens.
    consoleId: current?.consoleId ?? consoleIdOf(gameId),
    updatedAt: now(),
  };
  if (!next.consoleId) delete next.consoleId;
  if (next.completedYear === undefined) delete next.completedYear;
  if (next.rating === undefined || next.rating === 0) delete next.rating;
  if (!next.notes) delete next.notes;
  return next;
}

/**
 * Keys that don't become a normal record when used as an index on an object
 * literal: `out['__proto__'] = x` triggers the inherited setter and touches the
 * prototype instead of storing the value. Since gameId comes from an imported
 * file (which may have been tampered with), these keys are dropped on input.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Only accepts records shaped like `UserGameProgress`. */
function sanitizeProgress(raw: unknown): Record<string, UserGameProgress> {
  const out: Record<string, UserGameProgress> = {};
  if (!raw || typeof raw !== 'object') return out;
  const validStatus = new Set<GameStatus>(['beaten', 'playing', 'backlog', 'unplayed']);

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const status = item.status as GameStatus;
    if (!validStatus.has(status)) continue;
    const gameId = typeof item.gameId === 'string' && item.gameId ? item.gameId : key;
    if (UNSAFE_KEYS.has(gameId)) continue;
    const entry: UserGameProgress = {
      gameId,
      status,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now(),
    };
    if (typeof item.completedYear === 'number' && Number.isFinite(item.completedYear)) {
      entry.completedYear = Math.trunc(item.completedYear);
    }
    if (typeof item.rating === 'number' && item.rating >= 1 && item.rating <= 5) {
      entry.rating = Math.round(item.rating);
    }
    if (typeof item.notes === 'string' && item.notes.trim()) entry.notes = item.notes;
    if (typeof item.consoleId === 'string' && /^[a-z0-9-]{1,32}$/.test(item.consoleId)) entry.consoleId = item.consoleId;
    out[gameId] = entry;
  }
  return out;
}

/* ---- catalog loading (outside state: no re-render needed) ---- */

const TOP = '__top__';
/** What was already requested (or arrived): each file is downloaded only once. */
const catalogRequested = new Set<string>();
let inFlight = 0;
let failures = 0;

/** Popular games from consoles not downloaded yet + downloaded consoles (no repeats). */
function mergeCatalog(top: Game[], consoles: Record<string, Game[]>): Game[] {
  const loaded = Object.values(consoles);
  const topRest = top.filter((game) => !consoles[consoleIdOf(game.id) ?? '']);
  return loaded.length ? topRest.concat(...loaded) : topRest;
}

function trackLoad(promise: Promise<unknown>) {
  inFlight += 1;
  useGameStore.setState({ catalogStatus: 'loading' });
  void promise
    .catch(() => {
      failures += 1;
    })
    .finally(() => {
      inFlight -= 1;
      if (inFlight === 0) {
        flushConsoles();
        useGameStore.setState({ catalogStatus: failures ? 'error' : 'ready' });
        failures = 0;
      }
    });
}

/*
 * Each new batch rebuilds index and sorting for tens of thousands of games, so
 * consoles that arrive together go in all at once.
 */
let pendingConsoles: Record<string, Game[]> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function queueConsole(id: string, games: Game[]) {
  pendingConsoles[id] = games;
  flushTimer ??= setTimeout(flushConsoles, 200);
}

function flushConsoles() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!Object.keys(pendingConsoles).length) return;
  const batch = pendingConsoles;
  pendingConsoles = {};
  useGameStore.setState((s) => {
    const catalogConsoles = { ...s.catalogConsoles, ...batch };
    return { catalogConsoles, catalog: mergeCatalog(s.catalogTop, catalogConsoles) };
  });
}

/** Consoles where the user has marked games (they need to be downloaded). */
export function progressConsoleIds(progress: Record<string, UserGameProgress>): string[] {
  const ids = new Set<string>();
  for (const [gameId, entry] of Object.entries(progress)) {
    const id = entry.consoleId ?? consoleIdOf(gameId);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      progress: {},
      customGames: [],
      myConsoles: [],
      onboardingDone: false,
      selection: [],
      ...FILTER_DEFAULTS,
      catalog: [],
      catalogTop: [],
      catalogConsoles: {},
      catalogStatus: 'idle',
      selectedGameId: null,
      statsOpen: false,
      hydrated: false,
      toast: null,

      /* filters */
      setSearch: (value) => set({ search: value }),
      setPlatform: (value) => set({ platform: value }),
      setStatusFilter: (value) => set({ status: value }),
      toggleBrazilOnly: () => set((s) => ({ brazilOnly: !s.brazilOnly })),
      setBrazilOnly: (value) => set({ brazilOnly: value }),
      setSort: (value) => set({ sort: value }),
      resetFilters: () => set({ ...FILTER_DEFAULTS }),

      /* UI */
      openGame: (gameId) => set({ selectedGameId: gameId }),
      closeGame: () => set({ selectedGameId: null }),
      setStatsOpen: (open) => set({ statsOpen: open }),
      setHydrated: () => set({ hydrated: true }),
      pushToast: (message, tone = 'success') => {
        toastSeq += 1;
        set({ toast: { id: toastSeq, message, tone } });
      },
      dismissToast: () => set({ toast: null }),

      /* progress */
      setGameStatus: (gameId, status) =>
        set((s) => {
          const progress = withStatus(s.progress, [gameId], status);
          return progress === s.progress ? {} : { progress };
        }),

      setManyStatus: (gameIds, status) => {
        const before = get().progress;
        const progress = withStatus(before, gameIds, status);
        if (progress !== before) set({ progress });
        return gameIds.length;
      },

      toggleBeaten: (gameId) => {
        const isBeaten = get().progress[gameId]?.status === 'beaten';
        get().setGameStatus(gameId, isBeaten ? 'unplayed' : 'beaten');
      },

      updateProgress: (gameId, patch) =>
        set((s) => ({
          progress: {
            ...s.progress,
            [gameId]: mergeProgress(s.progress[gameId], gameId, patch),
          },
        })),

      clearProgress: (gameId) =>
        set((s) => {
          const { [gameId]: _removed, ...rest } = s.progress;
          void _removed;
          return { progress: rest };
        }),

      /* onboarding and selection */
      setMyConsoles: (ids) => set({ myConsoles: [...new Set(ids)] }),
      finishOnboarding: () => set({ onboardingDone: true }),
      reopenOnboarding: () => set({ onboardingDone: false }),
      toggleSelected: (gameId) =>
        set((s) => ({
          selection: s.selection.includes(gameId)
            ? s.selection.filter((id) => id !== gameId)
            : [...s.selection, gameId],
        })),
      clearSelection: () => set({ selection: [] }),

      /* catalog */
      loadCatalog: () => {
        if (catalogRequested.has(TOP)) return;
        catalogRequested.add(TOP);
        trackLoad(
          fetchTopGames().then((games) => {
            set((s) => ({ catalogTop: games, catalog: mergeCatalog(games, s.catalogConsoles) }));
          }),
        );
      },

      ensureConsoles: (ids) => {
        const wanted = (ids === 'all' ? CATALOG_CONSOLE_IDS : ids).filter((id) => !catalogRequested.has(id));
        if (!wanted.length) return;
        for (const id of wanted) catalogRequested.add(id);
        for (const id of wanted) {
          trackLoad(
            fetchConsoleGames(id).then(
              (games) => queueConsole(id, games),
              (error: unknown) => {
                catalogRequested.delete(id); // allows trying again
                throw error;
              },
            ),
          );
        }
      },

      addCustomGames: (games) => {
        const state = get();
        const known = new Set<string>([
          ...SEED_GAMES.map((g) => g.id),
          ...state.customGames.map((g) => g.id),
        ]);
        const fresh = games.filter((g) => g?.id && !known.has(g.id)).map((g) => ({ ...g, isCustom: true }));
        if (fresh.length) set({ customGames: [...state.customGames, ...fresh] });
        return fresh.length;
      },

      removeCustomGame: (gameId) =>
        set((s) => ({ customGames: s.customGames.filter((g) => g.id !== gameId) })),

      /* backup */
      buildBackup: () => {
        const { progress, customGames } = get();
        const values = Object.values(progress);
        return {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          exportedAt: now(),
          progress,
          customGames,
          stats: {
            beaten: values.filter((p) => p.status === 'beaten').length,
            total: values.length,
          },
        };
      },

      importBackup: (payload, mode) => {
        // Old backups may carry IDs that became aliases: repoint before merging.
        const incoming = remapProgress(sanitizeProgress(payload?.progress));
        const incomingCount = Object.keys(incoming).length;
        const incomingGames = Array.isArray(payload?.customGames) ? payload.customGames : [];

        if (!incomingCount && !incomingGames.length) {
          return {
            ok: false,
            imported: 0,
            skipped: 0,
            customGames: 0,
            message: 'No valid records found in the file.',
          };
        }

        const state = get();
        let skipped = 0;
        let merged: Record<string, UserGameProgress>;

        if (mode === 'replace') {
          merged = incoming;
        } else {
          // `incoming` already went through `sanitizeProgress` without dangerous keys, so
          // writing to `merged` (an object literal) can't reach the prototype.
          merged = { ...state.progress };
          for (const [id, entry] of Object.entries(incoming)) {
            const current = merged[id];
            // On conflict, the most recent record wins.
            if (current && current.updatedAt > entry.updatedAt) {
              skipped += 1;
              continue;
            }
            merged[id] = entry;
          }
        }

        const knownIds = new Set(SEED_GAMES.map((g) => g.id));
        // "Replace everything" is about PROGRESS. Games from online search are
        // CATALOG: a CSV can never carry them (no cover, no metadata), so wiping
        // them here would leave the freshly imported progress pointing at games that
        // vanished from the screen, which means orphan records. We only swap the catalog
        // when the imported file actually brings games.
        const replaceCatalog = mode === 'replace' && incomingGames.length > 0;
        const base = replaceCatalog ? [] : state.customGames;
        // The `Map` keys by its own key, so an id like "__proto__" here is just a
        // string. There's no way to pollute the prototype.
        const customMap = new Map(base.map((g) => [g.id, g]));
        let newGames = 0;
        for (const game of incomingGames) {
          if (!game || typeof game.id !== 'string' || knownIds.has(game.id)) continue;
          if (!customMap.has(game.id)) newGames += 1;
          customMap.set(game.id, { ...game, isCustom: true });
        }
        const customGames = [...customMap.values()];

        set({ progress: merged, customGames });

        return {
          ok: true,
          imported: incomingCount - skipped,
          skipped,
          customGames: newGames,
          message:
            mode === 'replace'
              ? `Backup restored: ${incomingCount} record(s).`
              : `${incomingCount - skipped} record(s) imported${skipped ? `, ${skipped} skipped for being older` : ''}.`,
        };
      },

    }),
    {
      name: 'zerei-app-storage',
      version: 1,
      // Every LocalStorage read goes through the ID aliases (ADR 0002): if the
      // catalog merged or renamed a game, saved progress follows the game.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedState>;
        return {
          ...current,
          ...saved,
          progress: remapProgress(saved.progress ?? current.progress),
          myConsoles: Array.isArray(saved.myConsoles) ? saved.myConsoles.filter((id) => typeof id === 'string') : [],
          // Anyone who already has marked games (from before onboarding existed) doesn't need it.
          onboardingDone:
            saved.onboardingDone === true || Object.keys(saved.progress ?? {}).length > 0,
        };
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedState => ({
        progress: state.progress,
        customGames: state.customGames,
        myConsoles: state.myConsoles,
        onboardingDone: state.onboardingDone,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[Zerei.app] failed to restore local data:', error);
        // LocalStorage answers synchronously, so this callback still runs inside
        // `create()`, where the `useGameStore` reference is still in the TDZ.
        // Signaling through the store's own action avoids that; the microtask covers
        // the error path, where `state` comes in undefined.
        if (state) state.setHydrated();
        else queueMicrotask(() => useGameStore.setState({ hydrated: true }));
      },
    },
  ),
);

// A private tab, blocked cookies or an iframe without same-origin make
// LocalStorage access throw: `persist` gives up before hydrating and the callback
// above never runs. Without this the app would be stuck on the skeleton forever.
// The catalog is static and works fine, it just doesn't persist.
if (typeof window !== 'undefined' && !useGameStore.persist.getOptions().storage) {
  useGameStore.getState().setHydrated();
}

/* -------------------------------------------------------------------------- */
/*  Ready-made selectors, avoiding boilerplate and needless re-renders         */
/* -------------------------------------------------------------------------- */

/** `true` once LocalStorage was read (avoids hydration mismatch). */
export const useHydrated = () => useGameStore((s) => s.hydrated);

/** Everything on screen: seed + full catalog + games from IGDB. */
export function useAllGames(): Game[] {
  const customGames = useGameStore((s) => s.customGames);
  const catalog = useGameStore((s) => s.catalog);
  return useMemo(
    () =>
      customGames.length || catalog.length ? [...SEED_GAMES, ...catalog, ...customGames] : SEED_GAMES,
    [customGames, catalog],
  );
}

export const useCatalogStatus = () => useGameStore((s) => s.catalogStatus);

export const useProgressMap = () => useGameStore((s) => s.progress);

export const useGameProgress = (gameId: string | null) =>
  useGameStore((s) => (gameId ? s.progress[gameId] : undefined));

/**
 * Counts beaten games by walking the CATALOG, not the progress map: an old
 * backup (or a game removed from the database) leaves orphan records that
 * don't show anywhere on screen. Counting this way keeps the header number
 * equal to the filter chips and the stats panel.
 */
export const useBeatenCount = () => {
  const games = useAllGames();
  const progress = useGameStore((s) => s.progress);
  return useMemo(() => countByStatus(games, progress).beaten, [games, progress]);
};

export interface FilterState {
  search: string;
  platform: PlatformFilter;
  status: StatusFilter;
  brazilOnly: boolean;
  sort: SortMode;
}

/** Filter object with shallow comparison, safe in Zustand v5. */
export const useFilters = (): FilterState =>
  useGameStore(
    useShallow((s) => ({
      search: s.search,
      platform: s.platform,
      status: s.status,
      brazilOnly: s.brazilOnly,
      sort: s.sort,
    })),
  );

/** `true` when any filter differs from the default. */
export const useHasActiveFilters = () =>
  useGameStore(
    (s) =>
      s.search !== '' || s.platform !== 'all' || s.status !== 'all' || s.brazilOnly || s.sort !== 'recent',
  );
