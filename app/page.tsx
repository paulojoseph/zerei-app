import { Filters } from '@/components/Filters';
import { GameGrid } from '@/components/GameGrid';
import { GameModal } from '@/components/GameModal';
import { Header } from '@/components/Header';
import { Showcase } from '@/components/Showcase';
import { Toaster } from '@/components/Toaster';
import { SEED_GAMES } from '@/lib/games';
import { CATALOG_TOTAL } from '@/lib/consoles';
import { pluralize, CONTAINER } from '@/lib/utils';


export default function HomePage() {
  return (
    <main className="min-h-dvh pb-[max(4rem,env(safe-area-inset-bottom))]">
      <Header />

      {/* Vitrine: fileiras temáticas. Some sozinha quando há busca ou filtro. */}
      <Showcase />

      {/* A grade completa. "Ver todos" das fileiras rola até aqui. */}
      <div id="catalogo" className="scroll-mt-[var(--header-h)]">
        <div className={`${CONTAINER} pt-6 pb-1`}>
          <h2 className="text-base font-semibold text-ink sm:text-lg">Todos os jogos</h2>
        </div>
        <Filters />
        <section className={`${CONTAINER} py-5`}>
          <GameGrid />
        </section>
      </div>

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
      <Toaster />
    </main>
  );
}
