import { Filters } from '@/components/Filters';
import { GameGrid } from '@/components/GameGrid';
import { GameModal } from '@/components/GameModal';
import { Header } from '@/components/Header';
import { StatsModal } from '@/components/StatsModal';
import { Toaster } from '@/components/Toaster';
import { SEED_GAMES } from '@/lib/games';
import { CATALOG_TOTAL } from '@/lib/consoles';
import { pluralize, CONTAINER } from '@/lib/utils';


export default function HomePage() {
  return (
    <main className="min-h-dvh pb-[max(4rem,env(safe-area-inset-bottom))]">
      <Header />

      {/* Hero só no desktop: no celular a tela é do catálogo, não do discurso. */}
      <div className="hidden md:block">
        <div className={`${CONTAINER} pt-8 pb-5`}>
          <h1 className="text-2xl font-semibold tracking-tight text-ink lg:text-[28px]">
            Sua vida em jogos{' '}
            <span className="font-display text-glow text-[17px] text-neon lg:text-[19px]">
              zerados
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Do Phantom System da sala ao PS5 da TV grande: marque o que você terminou, dê nota,
            guarde a memória afetiva e veja a coleção de uma vida inteira em um lugar só.
          </p>
        </div>
      </div>

      <Filters />

      <section className={`${CONTAINER} py-5`}>
        <GameGrid />
      </section>

      <footer className={`${CONTAINER} pt-2 pb-6`}>
        <div className="flex flex-col items-center gap-1.5 border-t border-line-soft pt-6 text-center text-xs text-ink-dim">
          <p>Zerei.app — seus dados ficam salvos neste navegador.</p>
          <p>
            Dados e capas de jogos: <a href="https://www.igdb.com" className="underline hover:text-ink">IGDB.com</a>.
            Projeto pessoal, sem fins lucrativos; marcas e capas pertencem aos respectivos donos.
          </p>
          <p>
            Catálogo com {pluralize(SEED_GAMES.length + CATALOG_TOTAL, 'jogo')}. Sem conta, sem
            nuvem, sem rastreio.
          </p>
        </div>
      </footer>

      <GameModal />
      <StatsModal />
      <Toaster />
    </main>
  );
}
