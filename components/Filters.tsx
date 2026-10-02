'use client';

import { ArrowUpDown, ChevronDown, Flame, RotateCcw } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { SEED_GAMES, SORT_OPTIONS, statusOf } from '@/lib/games';
import {
  CATALOG_COUNTS,
  CONSOLES,
  MAKER_ORDER,
  MAKER_PREFIX,
  makerOf,
} from '@/lib/consoles';
import {
  CATEGORY_META,
  STATUS_FILTER_LABEL,
  STATUS_META,
  STATUS_ORDER,
} from '@/lib/platforms';
import { cn, pluralize, CONTAINER } from '@/lib/utils';
import {
  useAllGames,
  useFilters,
  useGameStore,
  useHasActiveFilters,
  useHydrated,
  useProgressMap,
} from '@/stores/useGameStore';
import type { Game, GameStatus, PlatformFilter, SortMode, StatusFilter } from '@/types/game';

/** Acento de "Todos" e dos fabricantes (verde neon do design system). */
const NEON = '#39ff9e';

interface ChipItem {
  id: PlatformFilter;
  label: string;
  /** Nome completo — vira `title` e rótulo acessível. */
  hint: string;
  color: string;
  count: number;
}

interface MakerGroup {
  maker: string;
  count: number;
  consoles: ChipItem[];
}

/** "1234" → "1,2k": cabe no chip sem empurrar a barra. */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace('.', ',')}k`;
}

/**
 * Consoles agrupados por fabricante, com a contagem de cada um. A contagem vem
 * do índice do catálogo + seed + jogos da IGDB, então aparece certa antes de o
 * catálogo completo terminar de baixar.
 */
function buildGroups(customGames: Game[]): MakerGroup[] {
  const extra = new Map<string, number>();
  for (const game of [...SEED_GAMES, ...customGames]) {
    extra.set(game.platform, (extra.get(game.platform) ?? 0) + 1);
  }

  const groups = new Map<string, ChipItem[]>(MAKER_ORDER.map((m) => [m, []]));
  const known = new Set<string>();
  for (const c of [...CONSOLES].sort((a, b) => a.year - b.year)) {
    known.add(c.name);
    const count = (CATALOG_COUNTS[c.id] ?? 0) + (extra.get(c.name) ?? 0);
    if (count === 0) continue;
    groups.get(c.maker)?.push({
      id: c.name,
      label: c.label,
      hint: c.name,
      color: CATEGORY_META[c.category].color,
      count,
    });
  }
  // Plataformas que só existem em jogos importados da IGDB.
  for (const [platform, count] of extra) {
    if (known.has(platform)) continue;
    groups.get(makerOf(platform))?.push({
      id: platform,
      label: platform,
      hint: platform,
      color: NEON,
      count,
    });
  }

  return MAKER_ORDER.map((maker) => {
    const consoles = groups.get(maker) ?? [];
    return { maker, consoles, count: consoles.reduce((sum, c) => sum + c.count, 0) };
  }).filter((g) => g.count > 0);
}

interface StatusChip {
  id: StatusFilter;
  label: string;
  chipClass: string;
  dotClass: string;
}

/**
 * Nome completo dos chips cujo rótulo foi encurtado para caber na barra. O chip
 * diz "Fila", mas o menu do card e o modal dizem "Quero jogar": sem o nome longo
 * no hover e no leitor de tela, parecem dois filtros diferentes.
 */
const STATUS_CHIP_FULL_LABEL: Partial<Record<StatusFilter, string>> = {
  backlog: STATUS_META.backlog.label,
};

/** Status aceitos em `?status=` — impede que lixo da URL entre na store. */
const DEEP_LINK_STATUS: ReadonlySet<string> = new Set<string>(STATUS_ORDER);

function isKnownStatus(value: string): value is GameStatus {
  return DEEP_LINK_STATUS.has(value);
}

/** "Todos" + os quatro status na ordem canônica do design system. */
const STATUS_CHIPS: StatusChip[] = [
  {
    id: 'all',
    label: STATUS_FILTER_LABEL.all,
    chipClass: 'border-ink-dim/60 bg-panel-3 text-ink',
    dotClass: 'bg-ink-soft',
  },
  ...STATUS_ORDER.map<StatusChip>((status) => ({
    id: status,
    label: STATUS_FILTER_LABEL[status],
    chipClass: STATUS_META[status].chipClass,
    dotClass: STATUS_META[status].dotClass,
  })),
];

/**
 * Barra de segmentação: fabricantes e consoles, status, preset "Nostalgia BR" e ordenação.
 * Fica grudada logo abaixo do header — por isso o `top` casa com a altura dele.
 */
export function Filters() {
  const games = useAllGames();
  const progress = useProgressMap();
  const hydrated = useHydrated();
  const hasActiveFilters = useHasActiveFilters();
  const { platform, status, brazilOnly, sort } = useFilters();
  const customGames = useGameStore((s) => s.customGames);

  const setPlatform = useGameStore((s) => s.setPlatform);
  const setStatusFilter = useGameStore((s) => s.setStatusFilter);
  const toggleBrazilOnly = useGameStore((s) => s.toggleBrazilOnly);
  const setBrazilOnly = useGameStore((s) => s.setBrazilOnly);
  const setSearch = useGameStore((s) => s.setSearch);
  const setSort = useGameStore((s) => s.setSort);
  const resetFilters = useGameStore((s) => s.resetFilters);

  /*
   * Atalhos do PWA (manifest.json) e links compartilhados: `/?status=beaten`,
   * `/?preset=brasil`, `/?q=<termo>` e `/?console=<id>` (ids de data/consoles.json). Sem isto os atalhos instalados abrem a
   * home sem filtro nenhum, porque nada no app lê a query string. Roda uma vez
   * na montagem e só no cliente — nada de `useSearchParams`, que obrigaria a
   * página (estática) a nascer dentro de um <Suspense>.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');
    const preset = params.get('preset');
    const query = params.get('q')?.trim();
    const consoleParam = params.get('console');
    let applied = false;

    const linked = consoleParam ? CONSOLES.find((c) => c.id === consoleParam) : undefined;
    if (linked) {
      setPlatform(linked.name);
      applied = true;
    }

    if (statusParam && isKnownStatus(statusParam)) {
      setStatusFilter(statusParam);
      applied = true;
    }
    if (preset === 'brasil') {
      setBrazilOnly(true);
      applied = true;
    }
    if (query) {
      setSearch(query);
      applied = true;
    }

    // A query já virou estado: apagá-la da barra de endereços evita que o filtro
    // "volte sozinho" quando o usuário limpar os filtros e recarregar a página.
    if (applied) window.history.replaceState({}, '', window.location.pathname);
    // Ações do Zustand têm referência estável — o efeito é de montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => buildGroups(customGames), [customGames]);
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  // Fabricante em destaque: o escolhido ou o dono do console escolhido.
  const activeMaker =
    platform === 'all'
      ? null
      : platform.startsWith(MAKER_PREFIX)
        ? platform.slice(MAKER_PREFIX.length)
        : makerOf(platform);
  const visibleConsoles = activeMaker
    ? (groups.find((g) => g.maker === activeMaker)?.consoles ?? [])
    : groups.flatMap((g) => g.consoles);

  const makerChips: ChipItem[] = [
    { id: 'all', label: 'Todos', hint: 'Todos os consoles', color: NEON, count: total },
    ...groups.map((g) => ({
      id: `${MAKER_PREFIX}${g.maker}`,
      label: g.maker,
      hint: `Todos os consoles ${g.maker}`,
      color: NEON,
      count: g.count,
    })),
  ];

  /*
   * Contadores dos chips de status: também uma passada só. Para cada jogo
   * pegamos o status atual (sem registro no progresso = "não joguei") e
   * incrementamos o balde correspondente. "Todos" é o tamanho do catálogo.
   */
  const statusCount = useMemo<Record<StatusFilter, number>>(() => {
    const counts: Record<StatusFilter, number> = {
      // O índice já sabe o tamanho do catálogo antes de ele terminar de baixar.
      all: Math.max(games.length, total),
      beaten: 0,
      playing: 0,
      backlog: 0,
      unplayed: 0,
    };
    for (const game of games) {
      counts[statusOf(progress, game.id)] += 1;
    }
    return counts;
  }, [games, progress, total]);

  return (
    <div className="sticky top-[var(--header-h)] z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className={cn(CONTAINER, 'py-2.5 sm:py-3')}>
        {/*
          1. Fabricante e console — cada linha rola na horizontal no celular, sem
          quebrar. Visualmente são abas, mas não há `tabpanel` nem navegação por
          setas: é um grupo de botões que alternam, como os chips de status.
          As faixas sangram exatamente o padding do `.app-container`
          (`--app-pad`): sangrar mais empurraria rolagem horizontal na página.
        */}
        <div
          role="group"
          aria-label="Filtrar por fabricante"
          className="mx-[calc(var(--app-pad)*-1)] flex gap-1.5 overflow-x-auto px-[var(--app-pad)] no-scrollbar"
        >
          {makerChips.map((chip) => (
            <FilterChip
              key={chip.id}
              chip={chip}
              active={platform === chip.id}
              // Console escolhido: o fabricante dele fica marcado de leve.
              partial={chip.id === `${MAKER_PREFIX}${activeMaker}`}
              onClick={() => setPlatform(chip.id)}
              strong
            />
          ))}
        </div>

        <div
          role="group"
          aria-label="Filtrar por console"
          className="mx-[calc(var(--app-pad)*-1)] mt-1.5 flex gap-1.5 overflow-x-auto px-[var(--app-pad)] no-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
        >
          {visibleConsoles.map((chip) => (
            <FilterChip
              key={chip.id}
              chip={chip}
              active={platform === chip.id}
              // Segundo clique no console ativo volta para o fabricante dele.
              onClick={() =>
                setPlatform(
                  platform === chip.id ? `${MAKER_PREFIX}${makerOf(chip.id)}` : chip.id,
                )
              }
            />
          ))}
        </div>

        {/* No celular status, preset e ordenação dividem uma faixa só, com rolagem
            lateral: empilhados, comiam um terço da tela na barra fixa. */}
        <div className="mx-[calc(var(--app-pad)*-1)] mt-2 flex items-center gap-2 overflow-x-auto px-[var(--app-pad)] no-scrollbar lg:mx-0 lg:justify-between lg:overflow-visible lg:px-0">
          {/* 2. Chips de status, cada um com sua contagem */}
          <div className="flex shrink-0 gap-2">
            {STATUS_CHIPS.map((chip) => {
              const active = status === chip.id;
              // "Todos" só conta o catálogo; os demais dependem do progresso salvo.
              const showCount = chip.id === 'all' || hydrated;
              const fullLabel = STATUS_CHIP_FULL_LABEL[chip.id];
              const spokenLabel = fullLabel ?? chip.label;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  title={fullLabel}
                  aria-label={
                    showCount
                      ? `${spokenLabel} — ${pluralize(statusCount[chip.id], 'jogo')}`
                      : spokenLabel
                  }
                  onClick={() => setStatusFilter(chip.id)}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                    active
                      ? chip.chipClass
                      : 'border-line bg-panel-2/50 text-ink-soft hover:text-ink',
                    active && chip.id === 'beaten' && 'glow-neon',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 rounded-full',
                      active ? chip.dotClass : 'bg-ink-dim/70',
                    )}
                  />
                  <span>{chip.label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'font-display text-[10px] leading-none',
                      active ? 'opacity-80' : 'text-ink-dim',
                    )}
                  >
                    {showCount ? statusCount[chip.id] : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3. Preset nostalgia + ordenação + limpar */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              aria-pressed={brazilOnly}
              onClick={toggleBrazilOnly}
              className={cn(
                'h-9 shrink-0 px-3 text-sm whitespace-nowrap',
                brazilOnly
                  ? 'border-gold/50 bg-gold/15 text-gold hover:border-gold/70 hover:text-gold'
                  : 'border-line bg-panel-2/50 text-ink-soft hover:border-gold/40 hover:text-gold',
              )}
            >
              <Flame aria-hidden="true" className="size-4" />
              <span className="sm:hidden">Nostalgia BR</span>
              <span className="hidden sm:inline">Clássicos de Locadora &amp; Brasil</span>
            </Button>

            <div className="relative">
              <ArrowUpDown
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
              />
              <select
                aria-label="Ordenar por"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="h-9 cursor-pointer appearance-none rounded-xl border border-line bg-panel-2 pl-9 pr-8 text-[16px] text-ink transition-colors duration-200 hover:border-line-soft sm:text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id} className="bg-panel-2 text-ink">
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
              />
            </div>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={resetFilters}
                className="h-9 shrink-0 px-3 text-sm whitespace-nowrap"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  chip,
  active,
  partial = false,
  onClick,
  strong = false,
}: {
  chip: ChipItem;
  active: boolean;
  partial?: boolean;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${chip.hint} — ${pluralize(chip.count, 'jogo')}`}
      title={chip.hint}
      onClick={onClick}
      style={
        active
          ? {
              color: chip.color,
              borderColor: chip.color,
              backgroundColor: `color-mix(in oklab, ${chip.color} 14%, transparent)`,
              boxShadow: `0 0 18px -10px ${chip.color}`,
            }
          : partial
            ? { color: chip.color, borderColor: `color-mix(in oklab, ${chip.color} 45%, transparent)` }
            : undefined
      }
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 whitespace-nowrap transition-colors duration-200',
        strong ? 'h-9 text-sm font-semibold' : 'h-8 text-xs font-medium',
        active || partial ? 'bg-panel-2/50' : 'border-line bg-panel-2/50 text-ink-soft hover:text-ink',
      )}
    >
      <span>{chip.label}</span>
      <span
        aria-hidden="true"
        className={cn('font-display text-[9px] leading-none', active ? 'opacity-80' : 'text-ink-dim')}
      >
        {compactCount(chip.count)}
      </span>
    </button>
  );
}

export default Filters;
