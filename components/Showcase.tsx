'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, Trophy } from 'lucide-react';

import { GameCard } from '@/components/GameCard';
import { Onboarding } from '@/components/Onboarding';
import { CONSOLES } from '@/lib/consoles';
import { cn, CONTAINER, pluralize } from '@/lib/utils';
import {
  useAllGames,
  useBeatenCount,
  useGameStore,
  useCatalogStatus,
  useHasActiveFilters,
  useHydrated,
  useProgressMap,
} from '@/stores/useGameStore';
import type { Game } from '@/types/game';

/** Quantos jogos cabem numa fileira (mais que isso é trabalho da grade). */
const ROW_SIZE = 12;
const ROW_INSET = 'max(var(--app-pad), calc((100vw - 1600px) / 2 + var(--app-pad)))';
/** Fileiras de console: no máximo três, para a vitrine não virar uma lista. */
const MAX_CONSOLE_ROWS = 3;
const SKELETON = Array.from({ length: 10 }, (_, i) => `esqueleto-${i}`);

interface RowDef {
  key: string;
  title: string;
  subtitle?: string;
  games: Game[];
  /** "Ver todos": aplica o filtro equivalente e leva até a grade. */
  onSeeAll: () => void;
}

function scrollToCatalog() {
  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Uma fileira horizontal com rolagem por arraste/scroll e roving tabindex nas setas. */
function Row({ row }: { row: RowDef }) {
  const [focus, setFocus] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches('article[data-card-index]')) return;
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(row.games.length - 1, Number(target.dataset.cardIndex) + delta));
    setFocus(next);
    listRef.current?.querySelector<HTMLElement>(`[data-card-index="${next}"]`)?.focus();
  };

  return (
    <section aria-labelledby={`fileira-${row.key}`} className="mt-7 first:mt-0">
      <div className={cn(CONTAINER, 'mb-2.5 flex items-end justify-between gap-3')}>
        <div className="min-w-0">
          <h2 id={`fileira-${row.key}`} className="truncate text-base font-semibold text-ink sm:text-lg">
            {row.title}
          </h2>
          {row.subtitle && <p className="text-xs text-ink-dim">{row.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            row.onSeeAll();
            requestAnimationFrame(scrollToCatalog);
          }}
          className="flex min-h-10 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm text-ink-soft transition-colors duration-200 hover:text-neon"
        >
          Ver todos
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      {/* Sangra até a borda no celular (o arraste lateral é o gesto natural da fileira). */}
      <div
        ref={listRef}
        onKeyDown={onKeyDown}
        // Alinha o 1º card com o conteúdo da página (container de 1600 px) e
        // deixa o resto sangrar até a borda. Inline porque o calc() exige
        // espaços em volta de + e -, que uma classe arbitrária do Tailwind não tem.
        style={{ paddingInline: ROW_INSET, scrollPaddingInline: ROW_INSET }}
        className="flex snap-x gap-2.5 overflow-x-auto pb-2 no-scrollbar sm:gap-3"
      >
        {row.games.length === 0 &&
          SKELETON.map((key) => (
            <div key={key} aria-hidden="true" className="w-[128px] shrink-0 sm:w-[150px]">
              <div className="overflow-hidden rounded-xl border border-line bg-panel">
                <div className="aspect-[3/4] w-full animate-shimmer bg-panel-2" />
                <div className="h-[3.4rem] p-2">
                  <div className="h-2.5 w-11/12 animate-shimmer rounded-full bg-panel-2" />
                  <div className="mt-1.5 h-2.5 w-3/5 animate-shimmer rounded-full bg-panel-2" />
                </div>
              </div>
            </div>
          ))}
        {row.games.map((game, index) => (
          <div key={game.id} className="w-[128px] shrink-0 snap-start sm:w-[150px]">
            <GameCard game={game} index={index} focusable={index === Math.min(focus, row.games.length - 1)} onFocusCard={setFocus} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Tela inicial: fileiras temáticas (estilo vitrine) acima da grade completa.
 * Some quando a pessoa está procurando algo (busca ou filtro ativo): aí o que
 * importa são os resultados logo abaixo da busca, não a vitrine.
 */
export function Showcase() {
  const hydrated = useHydrated();
  const filtering = useHasActiveFilters();
  const games = useAllGames();
  const progress = useProgressMap();
  const beaten = useBeatenCount();
  const myConsoles = useGameStore((s) => s.myConsoles);
  const onboardingDone = useGameStore((s) => s.onboardingDone);
  const ensureConsoles = useGameStore((s) => s.ensureConsoles);
  const setPlatform = useGameStore((s) => s.setPlatform);
  const setStatusFilter = useGameStore((s) => s.setStatusFilter);
  const setBrazilOnly = useGameStore((s) => s.setBrazilOnly);
  const setSort = useGameStore((s) => s.setSort);
  const catalogStatus = useCatalogStatus();
  const catalogPending = catalogStatus === 'idle' || catalogStatus === 'loading';

  // Hidratou: daqui em diante quem manda no onboarding é a store, não o
  // palpite feito antes da primeira pintura (ver app/layout.tsx).
  useEffect(() => {
    if (hydrated) delete document.documentElement.dataset.returning;
  }, [hydrated]);
  // O filtro do link direto já está no estado (e esconde a vitrine): a marcação
  // feita antes da primeira pintura pode sair sem a vitrine piscar.
  useEffect(() => {
    if (filtering) delete document.documentElement.dataset.deeplink;
  }, [filtering]);

  const featuredConsoles = useMemo(
    () => CONSOLES.filter((c) => myConsoles.includes(c.id)).slice(0, MAX_CONSOLE_ROWS),
    [myConsoles],
  );

  // As fileiras dos seus consoles precisam do catálogo deles.
  const featuredIds = featuredConsoles.map((c) => c.id).join(',');
  useEffect(() => {
    if (hydrated && featuredIds) ensureConsoles(featuredIds.split(','));
  }, [hydrated, featuredIds, ensureConsoles]);

  const rows = useMemo<RowDef[]>(() => {
    const byPopularity = (a: Game, b: Game) => (b.popularity ?? 0) - (a.popularity ?? 0);
    const list: RowDef[] = [];

    const continueRows: RowDef[] = [];
    const inProgress = games
      .filter((g) => progress[g.id]?.status === 'playing' || progress[g.id]?.status === 'backlog')
      .sort((a, b) => (progress[b.id]?.updatedAt ?? '').localeCompare(progress[a.id]?.updatedAt ?? ''))
      .slice(0, ROW_SIZE);
    if (inProgress.length) {
      continueRows.push({
        key: 'continue',
        title: 'Continue de onde parou',
        subtitle: 'Jogando agora e na sua fila',
        games: inProgress,
        onSeeAll: () => setStatusFilter('playing'),
      });
    }

    list.push({
      key: 'locadora',
      title: 'Clássicos da locadora',
      subtitle: 'Tec Toy, fliperama e o que rodava na sala de todo mundo',
      games: games.filter((g) => g.isBrazilClassic).slice(0, ROW_SIZE),
      onSeeAll: () => setBrazilOnly(true),
    });

    // Fileiras que dependem do catálogo ficam com esqueleto (altura reservada)
    // até ele chegar: surgir depois empurraria o que está na tela (CLS).
    list.push({
      key: 'populares',
      title: 'Mais populares',
      subtitle: 'Os jogos mais vistos e avaliados de todos os tempos',
      games: games.filter((g) => g.isCatalog).sort(byPopularity).slice(0, ROW_SIZE),
      onSeeAll: () => setSort('popular'),
    });
    // Abaixo da dobra no celular: o que só existe depois de hidratar entra daqui pra baixo.
    list.push(...continueRows);

    for (const c of featuredConsoles) {
      const own = games.filter((g) => (g.platforms ?? [g.platform]).includes(c.name)).sort(byPopularity).slice(0, ROW_SIZE);
      if (own.length >= 4) {
        list.push({
          key: `console-${c.id}`,
          title: `Seus consoles: ${c.label}`,
          subtitle: 'Os mais jogados do console',
          games: own,
          onSeeAll: () => setPlatform(c.name),
        });
      }
    }

    list.push({
      key: 'critica',
      title: 'Aclamados pela crítica',
      subtitle: 'Maiores notas da crítica especializada (IGDB, com 10+ críticas)',
      games: games
        .filter((g) => (g.criticScore ?? 0) > 0 && (g.criticCount ?? 0) >= 10)
        .sort((a, b) => (b.criticScore ?? 0) - (a.criticScore ?? 0) || (b.criticCount ?? 0) - (a.criticCount ?? 0))
        .slice(0, ROW_SIZE),
      onSeeAll: () => setSort('critic'),
    });

    return list.filter((r) => r.games.length > 0 || (catalogPending && (r.key === 'populares' || r.key === 'critica')));
  }, [games, progress, featuredConsoles, catalogPending, setBrazilOnly, setPlatform, setSort, setStatusFilter]);

  if (filtering) return null;

  return (
    <div className="showcase pt-5 pb-2 sm:pt-7">
      <div className={cn(CONTAINER, 'mb-6')}>
        {hydrated && beaten > 0 ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {pluralize(beaten, 'jogo zerado', 'jogos zerados')}
              </h1>
              <p className="mt-1 text-sm text-ink-soft">E contando. Marque mais um ou veja como anda a sua vida gamer.</p>
            </div>
            <Link
              href="/painel"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neon/40 bg-neon/10 px-3 text-sm font-medium text-neon transition-colors duration-200 hover:bg-neon/20"
            >
              <Trophy className="size-4" aria-hidden="true" />
              Ver meu painel
            </Link>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Sua vida em jogos{' '}
              <span className="font-display text-glow text-[0.6em] text-neon">zerados</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              Do Phantom System da sala ao PS5 da TV grande: marque o que você terminou e veja a coleção de uma vida
              inteira em um lugar só.
            </p>
          </div>
        )}
        {/* No HTML estático o onboarding vem SEMPRE (a maioria na 1ª visita é
            nova); para quem volta, o CSS o esconde antes da primeira pintura. */}
        {(!hydrated || !onboardingDone) && (
          <div className="onboarding-slot mt-5">
            <Onboarding />
          </div>
        )}
      </div>

      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
    </div>
  );
}
