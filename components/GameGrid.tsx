'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Gamepad2, LoaderCircle, RotateCcw, Search, Trophy } from 'lucide-react';

import { GameCard } from '@/components/GameCard';
import { Button } from '@/components/ui/Button';
import { filterByStatus, selectGames, sortGames } from '@/lib/games';
import { CONSOLES, MAKER_PREFIX, consoleByName } from '@/lib/consoles';
import { pluralize } from '@/lib/utils';
import {
  progressConsoleIds,
  useAllGames,
  useCatalogStatus,
  useFilters,
  useGameStore,
  useHydrated,
  useProgressMap,
} from '@/stores/useGameStore';
import type {
  GameStatus,
  IgdbSearchResponse,
  PlatformFilter,
  StatusFilter,
} from '@/types/game';

/** Quantos cards entram a cada "página" da renderização progressiva. */
const PAGE_SIZE = 72;

/** Grade única do catálogo — o esqueleto usa exatamente a mesma classe. */
const GRID =
  'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9 sm:gap-3';

/** Chaves fixas: nada de índice aleatório durante o render. */
const SKELETON_KEYS = Array.from({ length: 12 }, (_, index) => `esqueleto-${index}`);

interface EmptyCopy {
  title: string;
  subtitle: string;
}

const STATUS_EMPTY: Record<GameStatus, EmptyCopy> = {
  beaten: {
    title: 'Nenhum jogo zerado ainda',
    subtitle: 'Você ainda não marcou nenhum jogo como zerado. Bora começar?',
  },
  playing: {
    title: 'Nada em andamento',
    subtitle:
      'Marque um jogo como "Jogando" e ele aparece aqui, esperando a próxima virada de noite.',
  },
  backlog: {
    title: 'A fila está vazia',
    subtitle:
      'Guarde na fila aqueles clássicos que você jurou terminar um dia. Eles aparecem nesta aba.',
  },
  unplayed: {
    title: 'Nenhum jogo sem marcação',
    subtitle: 'Todos os jogos desta seleção já têm alguma marcação sua. Nada mal.',
  },
};

/** Copy do estado vazio conforme o motivo real de a lista ter zerado. */
function emptyCopy(
  term: string,
  status: StatusFilter,
  brazilOnly: boolean,
  platform: PlatformFilter,
): EmptyCopy {
  if (term) {
    return {
      title: `Nenhum jogo encontrado para "${term}"`,
      subtitle:
        'Tente o nome do console (mega drive, snes, fliperama), parte do título ou o ano de lançamento.',
    };
  }
  if (status !== 'all') return STATUS_EMPTY[status];
  if (brazilOnly) {
    return {
      title: 'Nenhum clássico nacional por aqui',
      subtitle:
        'O filtro de clássicos brasileiros não achou nada com a seleção atual. Desligue o filtro para ver o catálogo inteiro.',
    };
  }
  if (platform !== 'all') {
    const name = platform.startsWith(MAKER_PREFIX)
      ? platform.slice(MAKER_PREFIX.length)
      : (consoleByName(platform)?.label ?? platform);
    return {
      title: `Nada em ${name}`,
      subtitle: 'Nenhum jogo deste console bate com os filtros de agora.',
    };
  }
  return {
    title: 'Catálogo vazio',
    subtitle: 'Nenhum jogo para mostrar agora. Limpe os filtros e comece de novo.',
  };
}

const SEARCH_ERROR = 'Não foi possível buscar agora. Tente de novo.';

/**
 * Única porta de entrada da rota `/api/igdb/search`. Sem credenciais da Twitch
 * a rota ainda responde: devolve a base local com um aviso em `notice`.
 */
function OnlineSearch({ term }: { term: string }) {
  const addCustomGames = useGameStore((s) => s.addCustomGames);
  const pushToast = useGameStore((s) => s.pushToast);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Busca em voo morre com o componente: resposta atrasada não vira setState nem toast.
  useEffect(() => () => abortRef.current?.abort(), []);

  const buscar = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setNotice('');
    try {
      const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(term)}&limit=24`, {
        signal: controller.signal,
      });
      const data = (await res.json()) as IgdbSearchResponse;
      if (controller.signal.aborted) return;

      // O aviso explica de onde vieram os resultados (ou por que não vieram).
      setNotice(data.notice ?? '');

      if (!res.ok) {
        pushToast(SEARCH_ERROR, 'error');
        return;
      }

      const encontrados = Array.isArray(data.results) ? data.results : [];
      if (encontrados.length === 0) {
        pushToast(`Nada encontrado para "${term}".`, 'info');
        return;
      }

      const novos = addCustomGames(encontrados);
      if (novos > 0) pushToast(`${novos} jogo(s) adicionado(s) ao seu catálogo.`);
      else pushToast('Esses jogos já estão no seu catálogo.', 'info');
    } catch {
      if (controller.signal.aborted) return;
      pushToast(SEARCH_ERROR, 'error');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <div className="mt-6 flex w-full max-w-md flex-col items-center gap-2 border-t border-line-soft pt-6">
      <Button variant="cyan" disabled={loading} onClick={() => void buscar()}>
        {loading ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="size-4" aria-hidden="true" />
        )}
        {loading ? 'Buscando…' : 'Procurar na base online'}
      </Button>
      {notice !== '' && (
        <p role="status" className="text-xs leading-relaxed text-ink-dim">
          {notice}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  copy,
  term,
  onReset,
}: {
  copy: EmptyCopy;
  term: string;
  onReset: () => void;
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center rounded-2xl border border-line-soft bg-panel/50 px-6 py-16 text-center">
      <div className="flex size-20 items-center justify-center rounded-full border border-line bg-panel-2">
        <Gamepad2 className="size-9 text-ink-dim" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-ink">{copy.title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{copy.subtitle}</p>
      <Button variant="outline" className="mt-6" onClick={onReset}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Limpar filtros
      </Button>
      {term !== '' && <OnlineSearch term={term} />}
    </div>
  );
}

/** Placeholder exibido até o LocalStorage ser lido (evita mismatch e piscada). */
function GridSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Carregando seu catálogo de jogos.</p>
      {/* h-5 = altura da linha do `text-sm` do contador real que entra aqui. */}
      <div className="mb-4 h-5 w-28 animate-shimmer rounded-full bg-panel-2" />
      <div className={GRID}>
        {SKELETON_KEYS.map((key) => (
          // Mesma caixa e mesmas medidas do GameCard (painel + capa 3/4 + rodapé
          // p-2.5 com título de 2 linhas e a linha de ano/plataforma): quando os
          // cards reais entram no lugar, nada na página se mexe.
          <div key={key} className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="aspect-[3/4] w-full animate-shimmer bg-panel-2" />
            <div className="p-2">
              <div className="min-h-[1.875rem]">
                <div className="h-2.5 w-11/12 animate-shimmer rounded-full bg-panel-2" />
                <div className="mt-1.5 h-2.5 w-3/5 animate-shimmer rounded-full bg-panel-2" />
              </div>
              <div className="mt-1 flex h-4 items-center gap-1.5">
                <div className="h-2.5 w-7 animate-shimmer rounded-full bg-panel-2" />
                <div className="ml-auto h-3.5 w-9 animate-shimmer rounded-md bg-panel-2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GameGrid() {
  const games = useAllGames();
  const progress = useProgressMap();
  const hydrated = useHydrated();
  const catalogStatus = useCatalogStatus();
  const { search, platform, status, brazilOnly, sort } = useFilters();
  const resetFilters = useGameStore((s) => s.resetFilters);
  const loadCatalog = useGameStore((s) => s.loadCatalog);
  const ensureConsoles = useGameStore((s) => s.ensureConsoles);

  /*
   * Baixar só o necessário (o catálogo inteiro passa de 3 MB comprimido):
   * - sempre: os mais populares (top.json, ~80 KB) para a aba "Todos";
   * - os consoles onde o usuário tem jogos marcados (contadores e "Zerei!");
   * - o console ou o fabricante escolhido;
   * - tudo só quando a pergunta é sobre tudo: busca ou "Não joguei" em "Todos".
   */
  const progressConsoles = useMemo(() => progressConsoleIds(progress).join(','), [progress]);
  const needsEverything = platform === 'all' && (search.trim() !== '' || status === 'unplayed');
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
  useEffect(() => {
    if (!hydrated) return;
    if (needsEverything) {
      ensureConsoles('all');
      return;
    }
    const wanted = new Set(progressConsoles ? progressConsoles.split(',') : []);
    if (platform.startsWith(MAKER_PREFIX)) {
      const maker = platform.slice(MAKER_PREFIX.length);
      for (const c of CONSOLES) if (c.maker === maker) wanted.add(c.id);
    } else if (platform !== 'all') {
      const id = consoleByName(platform)?.id;
      if (id) wanted.add(id);
    }
    ensureConsoles([...wanted]);
  }, [hydrated, needsEverything, platform, progressConsoles, ensureConsoles]);

  // Estado derivado por chave (padrão oficial do React, sem useEffect): quando
  // qualquer filtro muda, a paginação volta para a primeira leva e a ordem é
  // recalculada com uma fotografia do progresso daquele momento.
  const filterKey = `${search}|${platform}|${status}|${brazilOnly}|${sort}|${hydrated}`;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pagedKey, setPagedKey] = useState(filterKey);
  const [orderProgress, setOrderProgress] = useState(progress);
  let count = visibleCount;
  let snapshot = orderProgress;
  if (pagedKey !== filterKey) {
    setPagedKey(filterKey);
    setVisibleCount(PAGE_SIZE);
    setOrderProgress(progress);
    count = PAGE_SIZE;
    snapshot = progress;
  }

  // Três passos com custos bem diferentes. Seleção e ordenação (dezenas de
  // milhares de jogos) NÃO dependem do progresso ao vivo: um clique em
  // "Zerei!" só refaz o filtro de status, que é O(n) e sem ordenar. A ordem
  // fica congelada até o próximo filtro, então o card também não pula de
  // lugar embaixo do dedo. Medido em lib/games.perf.test.ts.
  const selected = useMemo(
    () => selectGames({ games, search, platform, brazilOnly }),
    [games, search, platform, brazilOnly],
  );
  const sorted = useMemo(() => sortGames(selected, games, sort, snapshot), [selected, games, sort, snapshot]);
  const visible = useMemo(() => filterByStatus(sorted, progress, status), [sorted, progress, status]);

  // Rolagem infinita: o sentinela no fim da grade puxa a próxima leva antes de
  // o usuário chegar lá. O botão "Carregar mais" continua como alternativa.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = count < visible.length;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, count, hydrated]);

  if (!hydrated) return <GridSkeleton />;

  const loadingCatalog = catalogStatus === 'loading';
  const term = search.trim();
  const total = visible.length;
  const shown = Math.min(count, total);
  const remaining = total - shown;
  const cards = visible.slice(0, shown);
  const narrowed = term !== '' || platform !== 'all' || status !== 'all' || brazilOnly;

  return (
    <div className="animate-fade-in">
      {total > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2"
          role="status"
          aria-live="polite"
        >
          <h2 className="text-sm font-semibold text-ink">{pluralize(total, 'jogo')}</h2>
          {term !== '' && (
            <span className="text-sm text-ink-soft">
              resultados para <span className="text-ink">&ldquo;{term}&rdquo;</span>
            </span>
          )}
          {status === 'beaten' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/15 px-2.5 py-1 text-[11px] font-medium text-neon">
              <Trophy className="size-3.5" aria-hidden="true" />
              Zerados
            </span>
          )}
          {/*
            A dica existe desde a primeira pintura e o carregamento é só um ícone:
            texto que aparece depois empurra a grade (CLS) e vira o LCP da página.
          */}
          {platform === 'all' && !needsEverything && (
            <span className="text-xs text-ink-dim">Os mais populares. Escolha um console ou busque para ver todos.</span>
          )}
          <span className="inline-flex size-3.5 items-center">
            {loadingCatalog && <LoaderCircle className="size-3.5 animate-spin text-ink-dim" aria-hidden="true" />}
            <span className="sr-only">{loadingCatalog ? 'Carregando jogos' : ''}</span>
          </span>
          {catalogStatus === 'error' && (
            <span className="text-xs text-gold">
              Parte do catálogo não carregou. Recarregue a página para tentar de novo.
            </span>
          )}
          {remaining > 0 && (
            <span className="ml-auto text-xs text-ink-dim">
              Mostrando {shown} de {total}
            </span>
          )}
        </div>
      )}

      {total === 0 && loadingCatalog ? (
        <GridSkeleton />
      ) : total === 0 ? (
        <EmptyState
          copy={emptyCopy(term, status, brazilOnly, platform)}
          term={term}
          onReset={resetFilters}
        />
      ) : (
        <>
          <div className={GRID}>
            {cards.map((game, index) => (
              // As 6 primeiras capas são o LCP provável do celular.
              <GameCard key={game.id} game={game} priority={index < 6} />
            ))}
          </div>
          <div ref={sentinelRef} aria-hidden="true" />

          {remaining > 0 ? (
            <div className="mt-7 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
                Carregar mais ({pluralize(remaining, 'restante')})
              </Button>
            </div>
          ) : (
            <p className="mt-8 text-center text-xs text-ink-dim">
              Fim da lista — {pluralize(total, 'jogo')} {narrowed ? 'nesta seleção' : 'no catálogo'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
