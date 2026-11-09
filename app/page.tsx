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

      {/* Hero on desktop only: on phones the screen belongs to the catalog, not the pitch. */}
      <div className="hidden md:block">
        <div className={`${CONTAINER} pt-8 pb-5`}>
          <h1 className="text-2xl font-semibold tracking-tight text-ink lg:text-[28px]">
            Every game you&apos;ve{' '}
            <span className="font-display text-glow text-[17px] text-neon lg:text-[19px]">
              beaten
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            From the living room Phantom System to the big TV PS5: mark what you finished, give it a score,
            keep the memory and see a whole lifetime collection in one place.
          </p>
        </div>
      </div>

      <Filters />

      <section className={`${CONTAINER} py-5`}>
        <GameGrid />
      </section>

      <footer className={`${CONTAINER} pt-2 pb-6`}>
        <div className="flex flex-col items-center gap-1.5 border-t border-line-soft pt-6 text-center text-xs text-ink-dim">
          <p>Zerei.app — your data stays saved in this browser.</p>
          <p>
            Game data and covers: <a href="https://www.igdb.com" className="underline hover:text-ink">IGDB.com</a>.
            Personal non-profit project; trademarks and covers belong to their respective owners.
          </p>
          <p>
            Catalog with {pluralize(SEED_GAMES.length + CATALOG_TOTAL, 'game')}. No account, no
            cloud, no tracking.
          </p>
        </div>
      </footer>

      <GameModal />
      <StatsModal />
      <Toaster />
    </main>
  );
}
