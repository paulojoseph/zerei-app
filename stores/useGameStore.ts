'use client';

import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { loadCatalog } from '@/lib/catalog';
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
}

interface GameStore extends PersistedState {
  /* ---- estado de sessão (não persistido) ---- */
  search: string;
  platform: PlatformFilter;
  status: StatusFilter;
  brazilOnly: boolean;
  sort: SortMode;
  /** Catálogo completo (public/catalog), carregado sob demanda. */
  catalog: Game[];
  catalogStatus: CatalogStatus;
  selectedGameId: string | null;
  statsOpen: boolean;
  hydrated: boolean;
  toast: Toast | null;

  /* ---- filtros ---- */
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

  /* ---- progresso ---- */
  setGameStatus: (gameId: string, status: GameStatus) => void;
  toggleBeaten: (gameId: string) => void;
  updateProgress: (
    gameId: string,
    patch: Partial<Omit<UserGameProgress, 'gameId' | 'updatedAt'>>,
  ) => void;
  clearProgress: (gameId: string) => void;

  /* ---- catálogo ---- */
  loadCatalog: () => void;
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

/** Mescla um progresso existente com o patch, sempre carimbando `updatedAt`. */
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
    updatedAt: now(),
  };
  if (next.completedYear === undefined) delete next.completedYear;
  if (next.rating === undefined || next.rating === 0) delete next.rating;
  if (!next.notes) delete next.notes;
  return next;
}

/**
 * Chaves que não viram registro comum quando usadas como índice de um objeto
 * literal: `out['__proto__'] = x` aciona o setter herdado e mexe no protótipo
 * em vez de guardar o valor. Como o gameId vem de um arquivo importado (que
 * pode ter sido adulterado), essas chaves são descartadas na entrada.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Aceita apenas registros com formato de `UserGameProgress`. */
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
    out[gameId] = entry;
  }
  return out;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      progress: {},
      customGames: [],
      ...FILTER_DEFAULTS,
      catalog: [],
      catalogStatus: 'idle',
      selectedGameId: null,
      statsOpen: false,
      hydrated: false,
      toast: null,

      /* filtros */
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

      /* progresso */
      setGameStatus: (gameId, status) =>
        set((s) => {
          const current = s.progress[gameId];

          // "Não joguei" é só mais um status, não um comando de apagar: desmarcar
          // um jogo não pode levar junto a nota, a memória afetiva e o ano em que
          // ele foi zerado. O único caminho destrutivo é `clearProgress`, que na
          // interface tem botão próprio ("Limpar registro"). Quando não há nada
          // para preservar, aí sim removemos a chave e o mapa não engorda à toa.
          if (status === 'unplayed') {
            const worthKeeping =
              current !== undefined &&
              (current.rating !== undefined ||
                current.notes !== undefined ||
                current.completedYear !== undefined);
            if (!worthKeeping) {
              if (!current) return {};
              const { [gameId]: _removed, ...rest } = s.progress;
              void _removed;
              return { progress: rest };
            }
          }

          return {
            progress: {
              ...s.progress,
              [gameId]: mergeProgress(current, gameId, { status }),
            },
          };
        }),

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

      /* catálogo */
      loadCatalog: () => {
        if (get().catalogStatus !== 'idle') return;
        set({ catalogStatus: 'loading' });
        // Cada lote novo refaz índice e ordenação de dezenas de milhares de jogos:
        // os consoles que chegam juntos entram de uma vez só.
        let pending: Game[] = [];
        let timer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
          timer = null;
          if (!pending.length) return;
          const batch = pending;
          pending = [];
          set((s) => ({ catalog: s.catalog.concat(batch) }));
        };
        void loadCatalog((games) => {
          pending = pending.concat(games);
          timer ??= setTimeout(flush, 300);
        }).then((failed) => {
          if (timer) clearTimeout(timer);
          flush();
          set({ catalogStatus: failed > 0 ? 'error' : 'ready' });
        });
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
        const incoming = sanitizeProgress(payload?.progress);
        const incomingCount = Object.keys(incoming).length;
        const incomingGames = Array.isArray(payload?.customGames) ? payload.customGames : [];

        if (!incomingCount && !incomingGames.length) {
          return {
            ok: false,
            imported: 0,
            skipped: 0,
            customGames: 0,
            message: 'Nenhum registro válido encontrado no arquivo.',
          };
        }

        const state = get();
        let skipped = 0;
        let merged: Record<string, UserGameProgress>;

        if (mode === 'replace') {
          merged = incoming;
        } else {
          // `incoming` já saiu do `sanitizeProgress` sem chaves perigosas, então
          // escrever em `merged` (objeto literal) não alcança o protótipo.
          merged = { ...state.progress };
          for (const [id, entry] of Object.entries(incoming)) {
            const current = merged[id];
            // Em caso de conflito, vence o registro mais recente.
            if (current && current.updatedAt > entry.updatedAt) {
              skipped += 1;
              continue;
            }
            merged[id] = entry;
          }
        }

        const knownIds = new Set(SEED_GAMES.map((g) => g.id));
        // "Substituir tudo" fala do PROGRESSO. Os jogos vindos da busca online são
        // CATÁLOGO: um CSV nunca consegue carregá-los (não leva capa nem metadados),
        // então zerá-los aqui deixaria o progresso recém-importado apontando para
        // jogos que sumiram da tela — registros órfãos. Só trocamos o catálogo
        // quando o arquivo importado realmente traz jogos.
        const replaceCatalog = mode === 'replace' && incomingGames.length > 0;
        const base = replaceCatalog ? [] : state.customGames;
        // O `Map` indexa por chave própria, então um id como "__proto__" aqui é
        // só uma string — não há como sujar o protótipo.
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
              ? `Backup restaurado: ${incomingCount} registro(s).`
              : `${incomingCount - skipped} registro(s) importado(s)${skipped ? `, ${skipped} ignorado(s) por serem mais antigos` : ''}.`,
        };
      },

    }),
    {
      name: 'zerei-app-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedState => ({
        progress: state.progress,
        customGames: state.customGames,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[Zerei.app] falha ao restaurar dados locais:', error);
        // O LocalStorage responde de forma síncrona, então este callback roda ainda
        // dentro do `create()` — a referência `useGameStore` ainda está em TDZ aqui.
        // Sinalizar pela própria ação da store evita isso; o microtask cobre o
        // caminho de erro, em que `state` vem indefinido.
        if (state) state.setHydrated();
        else queueMicrotask(() => useGameStore.setState({ hydrated: true }));
      },
    },
  ),
);

// Aba privada, cookies bloqueados ou iframe sem same-origin fazem o acesso ao
// LocalStorage lançar: o `persist` desiste antes de hidratar e o callback acima
// nunca roda. Sem isto o app ficaria preso no esqueleto para sempre — o catálogo
// é estático e funciona bem, só não persiste.
if (typeof window !== 'undefined' && !useGameStore.persist.getOptions().storage) {
  useGameStore.getState().setHydrated();
}

/* -------------------------------------------------------------------------- */
/*  Seletores prontos — evitam boilerplate e re-renders desnecessários         */
/* -------------------------------------------------------------------------- */

/** `true` depois que o LocalStorage foi lido (evita mismatch de hidratação). */
export const useHydrated = () => useGameStore((s) => s.hydrated);

/** Tudo que aparece na tela: seed + catálogo completo + jogos vindos da IGDB. */
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
 * Conta zerados percorrendo o CATÁLOGO, não o mapa de progresso: um backup
 * antigo (ou um jogo removido da base) deixa registros órfãos que não aparecem
 * em lugar nenhum da tela. Contar por aqui mantém o número do cabeçalho igual
 * ao dos chips de filtro e ao do painel de estatísticas.
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

/** Objeto de filtros com comparação rasa — seguro no Zustand v5. */
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

/** `true` quando algum filtro está diferente do padrão. */
export const useHasActiveFilters = () =>
  useGameStore(
    (s) =>
      s.search !== '' || s.platform !== 'all' || s.status !== 'all' || s.brazilOnly || s.sort !== 'recent',
  );
