'use client';

import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { ALIASES_VERSION, loadAliases, remapProgress } from '@/lib/aliases';
import { CATALOG_CONSOLE_IDS, consoleIdOf, fetchConsoleGames, fetchConsoleHead, fetchTopGames } from '@/lib/catalog';
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
  /** Consoles que o usuário teve (ids de data/consoles.json), escolhidos no onboarding. */
  myConsoles: string[];
  /** Onboarding concluído ou pulado: não aparece de novo. */
  onboardingDone: boolean;
  /** Versão do mapa de aliases já aplicada ao progresso (ver `migrateIds`). */
  aliasesVersion?: string;
}

interface GameStore extends PersistedState {
  /* ---- estado de sessão (não persistido) ---- */
  search: string;
  platform: PlatformFilter;
  status: StatusFilter;
  brazilOnly: boolean;
  sort: SortMode;
  /**
   * Catálogo visível: os mais populares (top.json) + os consoles já baixados.
   * Nada é baixado antes de ser preciso (ver `ensureConsoles`).
   */
  catalog: Game[];
  catalogTop: Game[];
  catalogConsoles: Record<string, Game[]>;
  /** Primeiros em A–Z de consoles cujo arquivo completo ainda não chegou. */
  catalogHeads: Record<string, Game[]>;
  catalogStatus: CatalogStatus;
  selectedGameId: string | null;
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
  setHydrated: () => void;
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: () => void;

  /** Seleção múltipla (ids de jogos), para marcar vários de uma vez. */
  selection: string[];
  /** Filtros do link (?console=, ?q=...) já aplicados: a grade pode aparecer. */
  urlApplied: boolean;
  markUrlApplied: () => void;

  /* ---- progresso ---- */
  setGameStatus: (gameId: string, status: GameStatus) => void;
  /** Mesmo status para vários jogos, numa atualização só. Devolve quantos. */
  setManyStatus: (gameIds: string[], status: GameStatus) => number;
  toggleBeaten: (gameId: string) => void;
  updateProgress: (
    gameId: string,
    patch: Partial<Omit<UserGameProgress, 'gameId' | 'updatedAt'>>,
  ) => void;
  clearProgress: (gameId: string) => void;

  /* ---- onboarding e seleção ---- */
  setMyConsoles: (ids: string[]) => void;
  finishOnboarding: () => void;
  reopenOnboarding: () => void;
  /** Reaponta o progresso pelos aliases, se o catálogo mudou desde a última vez. */
  migrateIds: () => Promise<void>;
  toggleSelected: (gameId: string) => void;
  clearSelection: () => void;

  /* ---- catálogo ---- */
  loadCatalog: () => void;
  /** Baixa (uma vez) o catálogo destes consoles. 'all' = todos. */
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
  // A–Z é o padrão (decisão de produto, inclusive na aba "Todos").
  sort: 'title' as SortMode,
};

/**
 * Aplica um status a vários jogos de uma vez (uma única atualização da store,
 * um único re-render). Devolve o mesmo objeto se nada mudou.
 *
 * "Não joguei" é só mais um status, não um comando de apagar: desmarcar um
 * jogo não pode levar junto a nota, a memória afetiva e o ano em que ele foi
 * zerado. O único caminho destrutivo é `clearProgress`, que na interface tem
 * botão próprio ("Limpar registro"). Quando não há nada para preservar, aí sim
 * a chave sai e o mapa não engorda à toa.
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
    // Guardar o console permite baixar só o arquivo dele ao reabrir o app
    // (a página do jogo informa no patch: lá o catálogo não está carregado).
    consoleId: current?.consoleId ?? patch.consoleId ?? consoleIdOf(gameId),
    playedOn: patch.playedOn !== undefined ? patch.playedOn || undefined : current?.playedOn,
    updatedAt: now(),
  };
  if (!next.consoleId) delete next.consoleId;
  if (!next.playedOn) delete next.playedOn;
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
    if (typeof item.consoleId === 'string' && /^[a-z0-9-]{1,32}$/.test(item.consoleId)) entry.consoleId = item.consoleId;
    if (typeof item.playedOn === 'string' && /^[a-z0-9-]{1,32}$/.test(item.playedOn)) entry.playedOn = item.playedOn;
    out[gameId] = entry;
  }
  return out;
}

/* ---- carregamento do catálogo (fora do estado: não precisa re-renderizar) ---- */

const TOP = '__top__';
/** O que já foi pedido (ou chegou): cada arquivo é baixado uma vez só. */
const catalogRequested = new Set<string>();
let inFlight = 0;
let failures = 0;

/**
 * Populares + consoles baixados, cada obra uma vez só: um jogo multiplataforma
 * vem no arquivo de cada console em que saiu (e talvez no top.json também).
 */
function mergeCatalog(top: Game[], consoles: Record<string, Game[]>, heads: Record<string, Game[]> = {}): Game[] {
  const byId = new Map<string, Game>();
  for (const list of Object.values(consoles)) for (const game of list) if (!byId.has(game.id)) byId.set(game.id, game);
  for (const [id, list] of Object.entries(heads)) {
    if (consoles[id]) continue;
    for (const game of list) if (!byId.has(game.id)) byId.set(game.id, game);
  }
  for (const game of top) if (!byId.has(game.id)) byId.set(game.id, game);
  return [...byId.values()];
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
 * Cada lote novo refaz índice e ordenação de dezenas de milhares de jogos: os
 * consoles que chegam juntos entram de uma vez só.
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
    return { catalogConsoles, catalog: mergeCatalog(s.catalogTop, catalogConsoles, s.catalogHeads) };
  });
}

/** Consoles onde o usuário tem jogos marcados (precisam estar baixados). */
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
      urlApplied: false,
      markUrlApplied: () => set({ urlApplied: true }),
      ...FILTER_DEFAULTS,
      catalog: [],
      catalogTop: [],
      catalogConsoles: {},
      catalogHeads: {},
      catalogStatus: 'idle',
      selectedGameId: null,
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
      setHydrated: () => set({ hydrated: true }),
      pushToast: (message, tone = 'success') => {
        toastSeq += 1;
        set({ toast: { id: toastSeq, message, tone } });
      },
      dismissToast: () => set({ toast: null }),

      /* progresso */
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

      /* onboarding e seleção */
      setMyConsoles: (ids) => set({ myConsoles: [...new Set(ids)] }),
      finishOnboarding: () => set({ onboardingDone: true }),
      reopenOnboarding: () => set({ onboardingDone: false }),
      migrateIds: async () => {
        const { progress, aliasesVersion } = get();
        if (aliasesVersion === ALIASES_VERSION) return;
        if (!Object.keys(progress).length) {
          set({ aliasesVersion: ALIASES_VERSION });
          return;
        }
        const aliases = await loadAliases();
        if (!Object.keys(aliases).length) return; // falhou: tenta na próxima visita
        // Usa o progresso de AGORA: o usuário pode ter marcado algo durante o download.
        set((s) => ({ progress: remapProgress(s.progress, aliases), aliasesVersion: ALIASES_VERSION }));
      },
      toggleSelected: (gameId) =>
        set((s) => ({
          selection: s.selection.includes(gameId)
            ? s.selection.filter((id) => id !== gameId)
            : [...s.selection, gameId],
        })),
      clearSelection: () => set({ selection: [] }),

      /* catálogo */
      loadCatalog: () => {
        if (catalogRequested.has(TOP)) return;
        catalogRequested.add(TOP);
        trackLoad(
          fetchTopGames().then((games) => {
            set((s) => ({ catalogTop: games, catalog: mergeCatalog(games, s.catalogConsoles, s.catalogHeads) }));
          }),
        );
      },

      ensureConsoles: (ids) => {
        const wanted = (ids === 'all' ? CATALOG_CONSOLE_IDS : ids).filter((id) => !catalogRequested.has(id));
        if (!wanted.length) return;
        for (const id of wanted) catalogRequested.add(id);
        for (const id of wanted) {
          // A cabeça (~4 KB) chega bem antes e já desenha a primeira tela.
          void fetchConsoleHead(id)
            .then((games) =>
              set((s) =>
                s.catalogConsoles[id]
                  ? {}
                  : {
                      catalogHeads: { ...s.catalogHeads, [id]: games },
                      catalog: mergeCatalog(s.catalogTop, s.catalogConsoles, { ...s.catalogHeads, [id]: games }),
                    },
              ),
            )
            .catch(() => {});
          trackLoad(
            fetchConsoleGames(id).then(
              (games) => queueConsole(id, games),
              (error: unknown) => {
                catalogRequested.delete(id); // permite tentar de novo
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
        // Backups antigos podem trazer IDs que viraram alias: `migrateIds`, logo
        // depois do import, reaponta tudo (o mapa é baixado sob demanda).
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

        set({ progress: merged, customGames, aliasesVersion: undefined });
        void get().migrateIds();

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
      // Os aliases de ID (ADR 0002) são aplicados depois, por `migrateIds`:
      // o mapa é grande demais para entrar no bundle ou atrasar a hidratação.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedState>;
        return {
          ...current,
          ...saved,
          progress: saved.progress ?? current.progress,
          myConsoles: Array.isArray(saved.myConsoles) ? saved.myConsoles.filter((id) => typeof id === 'string') : [],
          // Quem já tem jogos marcados (de antes do onboarding existir) não precisa dele.
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
        aliasesVersion: state.aliasesVersion,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[Zerei.app] falha ao restaurar dados locais:', error);
        // O LocalStorage responde de forma síncrona, então este callback roda ainda
        // dentro do `create()` — a referência `useGameStore` ainda está em TDZ aqui.
        // Sinalizar pela própria ação da store evita isso; o microtask cobre o
        // caminho de erro, em que `state` vem indefinido.
        if (state) {
          state.setHydrated();
          // Depois da hidratação e fora do caminho crítico da primeira pintura.
          queueMicrotask(() => void useGameStore.getState().migrateIds());
        }
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

const SEED_IDS = new Set(SEED_GAMES.map((g) => g.id));

/**
 * Tudo que aparece na tela: curadoria + catálogo + jogos vindos da busca online.
 * Jogo da curadoria que também está no catálogo vira um só: fica a capa, o
 * resumo e a marca BR da curadoria, e entram as plataformas e notas da IGDB.
 */
export function useAllGames(): Game[] {
  const customGames = useGameStore((s) => s.customGames);
  const catalog = useGameStore((s) => s.catalog);
  return useMemo(() => {
    if (!customGames.length && !catalog.length) return SEED_GAMES;
    const fromCatalog = new Map<string, Game>();
    const rest: Game[] = [];
    for (const game of catalog) {
      if (SEED_IDS.has(game.id)) fromCatalog.set(game.id, game);
      else rest.push(game);
    }
    const seed = SEED_GAMES.map((g) => {
      const extra = fromCatalog.get(g.id);
      if (!extra) return g;
      return {
        ...g,
        platform: g.platform,
        platforms: [g.platform, ...(extra.platforms ?? []).filter((p) => p !== g.platform)],
        popularity: extra.popularity,
        criticScore: extra.criticScore,
        criticCount: extra.criticCount,
        userScore: extra.userScore,
        userCount: extra.userCount,
        genres: g.genres ?? extra.genres,
      };
    });
    return [...seed, ...rest, ...customGames];
  }, [customGames, catalog]);
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
      s.search !== '' || s.platform !== 'all' || s.status !== 'all' || s.brazilOnly || s.sort !== 'title',
  );
