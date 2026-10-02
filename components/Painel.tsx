'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Star, Trophy } from 'lucide-react';

import { BarList, ColumnChart } from '@/components/charts/Chart';
import { DnaShare } from '@/components/DnaShare';
import { consoleByName } from '@/lib/consoles';
import { CATEGORY_META, CATEGORY_ORDER } from '@/lib/platforms';
import { computeStats } from '@/lib/stats';
import { cn, CONTAINER, pluralize } from '@/lib/utils';
import {
  progressConsoleIds,
  useAllGames,
  useCatalogStatus,
  useGameStore,
  useHydrated,
  useProgressMap,
} from '@/stores/useGameStore';
import type { StatsSummary, TimelineEntry } from '@/types/game';

/** Stat tile: rótulo em frase, valor em sans semibold. */
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel-2/60 px-4 py-3">
      <p className="text-xs text-ink-dim">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-dim">{hint}</p>}
    </div>
  );
}

function GameList({ title, entries, empty, rating }: { title: string; entries: TimelineEntry[]; empty: string; rating?: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-panel-2/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-dim">{empty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line-soft">
          {entries.map(({ game, progress }) => (
            <li key={game.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-ink">{game.title}</span>
                <span className="block text-xs text-ink-dim">
                  {consoleByName(game.platform)?.label ?? game.platform}
                  {progress.completedYear ? ` · zerado em ${progress.completedYear}` : ''}
                </span>
              </span>
              {rating && progress.rating ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-gold" aria-label={`Nota ${progress.rating} de 5`}>
                  <Star className="size-3.5 fill-current" aria-hidden="true" />
                  {progress.rating}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Dashboard({ stats }: { stats: StatsSummary }) {
  const consoles = stats.byPlatform.map((p) => ({ label: consoleByName(p.platform)?.label ?? p.platform, count: p.beaten }));
  const generations = CATEGORY_ORDER.map((c) => ({
    label: CATEGORY_META[c].tabLabel,
    count: stats.byCategory.find((b) => b.category === c)?.beaten ?? 0,
  }));
  const years = stats.byYear.map((y) => ({ label: String(y.year), count: y.count }));
  const withYear = years.reduce((sum, y) => sum + y.count, 0);

  return (
    <>
      {/* Um número lidera a página: o total de zerados. */}
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-neon/25 bg-panel-2/60 px-5 py-6 scanlines">
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:gap-4">
          <p className="text-6xl leading-none font-semibold text-ink sm:text-7xl">{stats.beaten}</p>
          <p className="pb-1 text-sm text-ink-soft">
            {stats.beaten === 1 ? 'jogo zerado' : 'jogos zerados'}
            {stats.byPlatform.length > 0 && ` em ${pluralize(stats.byPlatform.length, 'console')}`}
          </p>
        </div>
        {stats.beaten > 0 && <DnaShare stats={stats} />}
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Jogando agora" value={String(stats.playing)} />
        <Kpi label="Na fila" value={String(stats.backlog)} />
        <Kpi
          label="Nota média"
          value={stats.rated ? stats.averageRating.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '—'}
          hint={stats.rated ? `${pluralize(stats.rated, 'jogo avaliado', 'jogos avaliados')}` : 'Dê nota nos detalhes do jogo'}
        />
        <Kpi label="Clássicos BR zerados" value={String(stats.brazilBeaten)} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <BarList
          title="Zerados por gênero"
          description="Um jogo conta em cada gênero que tem."
          data={stats.byGenre}
          total={stats.beaten}
          categoryLabel="Gênero"
          empty="Os gêneros aparecem quando você zerar jogos."
        />
        <BarList
          title="Zerados por console"
          data={consoles}
          total={stats.beaten}
          categoryLabel="Console"
          empty="Nenhum console ainda."
        />
        <ColumnChart
          title="Zerados por geração"
          data={generations}
          total={stats.beaten}
          categoryLabel="Geração"
          empty="Nenhum jogo zerado ainda."
        />
        <ColumnChart
          title="Zerados por década de lançamento"
          data={stats.byDecade}
          total={stats.beaten}
          categoryLabel="Década"
          empty="Nenhum jogo zerado ainda."
        />
        <div className="lg:col-span-2">
          <ColumnChart
            title="Sua vida gamer: o ano em que você zerou"
            description={
              withYear < stats.beaten
                ? `${pluralize(withYear, 'jogo')} com o ano preenchido. Informe o ano nos detalhes de cada jogo para completar a linha do tempo.`
                : undefined
            }
            data={years}
            total={withYear}
            categoryLabel="Ano"
            empty="Informe o ano em que zerou nos detalhes de um jogo para começar sua linha do tempo."
          />
        </div>
        <GameList title="Últimos zerados" entries={stats.timeline} empty="Nenhum jogo zerado ainda." />
        <GameList title="Suas melhores notas" entries={stats.topRated} empty="Dê nota aos jogos nos detalhes." rating />
      </div>
    </>
  );
}

export function Painel() {
  const hydrated = useHydrated();
  const games = useAllGames();
  const progress = useProgressMap();
  const catalogStatus = useCatalogStatus();
  const loadCatalog = useGameStore((s) => s.loadCatalog);
  const ensureConsoles = useGameStore((s) => s.ensureConsoles);

  // O painel só precisa dos consoles onde o usuário tem jogos marcados.
  const consoles = useMemo(() => progressConsoleIds(progress).join(','), [progress]);
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
  useEffect(() => {
    if (hydrated && consoles) ensureConsoles(consoles.split(','));
  }, [hydrated, consoles, ensureConsoles]);

  const stats = useMemo(() => computeStats(games, progress), [games, progress]);
  // Espera os consoles dos jogos marcados: sem eles, os números sairiam menores.
  const loading = !hydrated || catalogStatus === 'idle' || catalogStatus === 'loading';

  return (
    <main className={cn(CONTAINER, 'min-h-dvh py-6 pb-[max(4rem,env(safe-area-inset-bottom))]')}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Catálogo
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink">
            <Trophy className="size-6 text-neon" aria-hidden="true" />
            Seu painel
          </h1>
        </div>
      </div>

      {loading ? (
        <div aria-busy="true" className="grid gap-3">
          <p className="sr-only">Calculando seu painel.</p>
          <div className="h-28 animate-shimmer rounded-2xl bg-panel-2" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-shimmer rounded-2xl bg-panel-2" />
            ))}
          </div>
          <div className="h-64 animate-shimmer rounded-2xl bg-panel-2" />
        </div>
      ) : stats.beaten === 0 && stats.playing === 0 && stats.backlog === 0 ? (
        <section className="rounded-2xl border border-line bg-panel/60 px-6 py-14 text-center">
          <Trophy className="mx-auto size-10 text-ink-dim" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Seu painel começa no primeiro &ldquo;Zerei!&rdquo;</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            Marque os jogos que você terminou e aqui aparecem seus gêneros, consoles, gerações e a linha do tempo da sua vida
            gamer.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-neon px-4 text-sm font-semibold text-bg-deep hover:brightness-110"
          >
            Marcar meus jogos
          </Link>
        </section>
      ) : (
        <Dashboard stats={stats} />
      )}
    </main>
  );
}
