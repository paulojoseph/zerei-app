import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { GameActions } from '@/components/game/GameActions';
import { Toaster } from '@/components/Toaster';
import { CONSOLES } from '@/lib/consoles';
import { getGameDetails, type GameDetails } from '@/lib/details';
import { CONTAINER, pluralize } from '@/lib/utils';

type Props = { params: Promise<{ id: string }> };

const CONSOLE_BY_ID = new Map(CONSOLES.map((c) => [c.id, c]));

/** Capa da IGDB em vários tamanhos (o CDN deles serve todos). */
function igdbSrcSet(url: string): string | undefined {
  if (!url.includes('images.igdb.com')) return undefined;
  const image = url.slice(url.lastIndexOf('/') + 1);
  return ['t_cover_small_2x 180w', 't_cover_big 264w', 't_cover_big_2x 528w']
    .map((s) => `https://images.igdb.com/igdb/image/upload/${s.split(' ')[0]}/${image} ${s.split(' ')[1]}`)
    .join(', ');
}

function describe(game: GameDetails): string {
  const consoles = game.p.map((p) => CONSOLE_BY_ID.get(p)?.label ?? p).join(', ');
  return `${game.t}${game.y ? ` (${game.y})` : ''} — ${consoles}. Marque se você zerou e veja jogos parecidos no Zerei.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await getGameDetails((await params).id);
  if (!game) return { title: 'Jogo não encontrado' };
  const title = `${game.t}${game.y ? ` (${game.y})` : ''}`;
  return {
    title,
    description: describe(game),
    alternates: { canonical: `/jogo/${game.id}` },
    openGraph: { title: `${title} · Zerei`, description: describe(game), images: game.c ? [{ url: game.c }] : undefined },
    twitter: { card: 'summary', title, images: game.c ? [game.c] : undefined },
  };
}

function Facts({ game }: { game: GameDetails }) {
  const rows: [string, string | undefined][] = [
    ['Desenvolvimento', game.dev?.join(', ')],
    ['Publicação', game.pub?.join(', ')],
    ['Série', game.fr?.join(', ')],
    ['Gêneros', game.g.join(', ') || undefined],
    ['Também conhecido como', game.alt?.join(' · ')],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-dim">{label}</dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * Página própria de cada jogo (M4): link compartilhável e indexável. Renderizada
 * no servidor a partir dos detalhes no R2; status e compartilhamento são a
 * única parte interativa.
 */
export default async function GamePage({ params }: Props) {
  const game = await getGameDetails((await params).id);
  if (!game) notFound();
  const consoles = game.p.map((p) => CONSOLE_BY_ID.get(p)).filter((c) => !!c);

  return (
    <main className={`${CONTAINER} min-h-dvh py-6 pb-[max(4rem,env(safe-area-inset-bottom))]`}>
      <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Catálogo
      </Link>

      <article className="mt-4 grid gap-6 md:grid-cols-[minmax(0,16rem)_1fr] md:gap-10">
        <div className="mx-auto w-48 md:mx-0 md:w-full">
          {game.c ? (
            // eslint-disable-next-line @next/next/no-img-element -- capa do CDN da IGDB/libretro, com srcset próprio
            <img
              src={game.c}
              srcSet={igdbSrcSet(game.c)}
              sizes="(max-width: 768px) 192px, 256px"
              alt={`Capa de ${game.t}`}
              width={264}
              height={352}
              fetchPriority="high"
              className="aspect-[3/4] w-full rounded-2xl border border-line object-cover shadow-2xl"
            />
          ) : (
            <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-line bg-panel-2 text-ink-dim">
              Sem capa
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-balance text-ink sm:text-4xl">{game.t}</h1>
          <p className="mt-2 text-sm text-ink-soft">{game.y ? `Lançado em ${game.y}` : 'Ano de lançamento desconhecido'}</p>

          <ul aria-label="Plataformas" className="mt-3 flex flex-wrap gap-1.5">
            {consoles.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/?console=${c.id}`}
                  className="inline-flex min-h-8 items-center rounded-md border border-line bg-panel-2 px-2.5 text-xs font-medium text-ink-soft hover:text-ink"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>

          {(game.cs || game.us) && (
            <dl className="mt-4 flex flex-wrap gap-2 text-xs">
              {game.cs ? (
                <div className="flex items-baseline gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
                  <dt className="text-ink-dim">Crítica</dt>
                  <dd className="text-lg font-semibold text-ink">{game.cs}</dd>
                  <dd className="text-ink-dim">{pluralize(game.cc ?? 0, 'crítica')}</dd>
                </div>
              ) : null}
              {game.us ? (
                <div className="flex items-baseline gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
                  <dt className="text-ink-dim">Público</dt>
                  <dd className="text-lg font-semibold text-ink">{game.us}</dd>
                  <dd className="text-ink-dim">{pluralize(game.uc ?? 0, 'voto')}</dd>
                </div>
              ) : null}
            </dl>
          )}

          <div className="mt-6">
            <GameActions id={game.id} title={game.t} consoleId={game.p[0]} />
          </div>

          {game.s && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-ink">Sobre o jogo</h2>
              {/* O resumo vem da IGDB, em inglês: dizemos isso em vez de fingir tradução. */}
              <p lang="en" className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
                {game.s}
              </p>
              <p className="mt-1 text-[11px] text-ink-dim">Resumo em inglês, da IGDB.</p>
            </section>
          )}

          <section className="mt-8">
            <Facts game={game} />
          </section>

          {game.igdb && (
            <a
              href={game.igdb}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1 text-xs text-ink-dim hover:text-ink"
            >
              Dados e capa: IGDB.com
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </article>

      {game.sim && game.sim.length > 0 && (
        <section className="mt-12" aria-labelledby="similares">
          <h2 id="similares" className="text-lg font-semibold text-ink">
            Se você gostou, experimente
          </h2>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {game.sim.map(([id, title, cover, year]) => (
              <li key={id}>
                <Link href={`/jogo/${id}`} className="group block">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- capa do CDN, já no tamanho do card
                    <img
                      src={cover}
                      srcSet={igdbSrcSet(cover)}
                      sizes="(max-width: 640px) 33vw, 150px"
                      alt=""
                      loading="lazy"
                      width={264}
                      height={352}
                      className="aspect-[3/4] w-full rounded-xl border border-line object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="aspect-[3/4] rounded-xl border border-line bg-panel-2" />
                  )}
                  <p className="mt-1.5 line-clamp-2 text-xs text-ink group-hover:text-neon">{title}</p>
                  {year > 0 && <p className="text-[11px] text-ink-dim">{year}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Toaster />
    </main>
  );
}
