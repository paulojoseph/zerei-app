import type { Metadata } from 'next';
import Link from 'next/link';

import { decodeDna } from '@/lib/dna';
import { pluralize } from '@/lib/utils';

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const codeOf = async (searchParams: Props['searchParams']) => {
  const d = (await searchParams).d;
  return typeof d === 'string' ? d : null;
};

/**
 * Página do link compartilhado. O importante para viralizar é a PRÉVIA: o
 * WhatsApp, o X e o Discord leem o og:image daqui e mostram o card.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const code = await codeOf(searchParams);
  const dna = decodeDna(code);
  const title = dna
    ? `${dna.archetype.label} — ${pluralize(dna.beaten, 'jogo zerado', 'jogos zerados')}`
    : 'Qual é o seu Gamer DNA?';
  const image = `/api/dna?d=${encodeURIComponent(dna && code ? code : '')}`;
  return {
    title,
    description: dna ? dna.archetype.line : 'Marque os jogos que você zerou e descubra o seu Gamer DNA.',
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, images: [image] },
    // Página de compartilhamento: não precisa entrar no índice de busca.
    robots: { index: false, follow: true },
  };
}

export default async function DnaPage({ searchParams }: Props) {
  const code = await codeOf(searchParams);
  const dna = decodeDna(code);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {dna && code ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem gerada na borda, já no tamanho final
        <img
          src={`/api/dna?d=${encodeURIComponent(code)}&f=story`}
          alt={`Gamer DNA: ${dna.archetype.label}, ${pluralize(dna.beaten, 'jogo zerado', 'jogos zerados')}`}
          width={1080}
          height={1920}
          className="h-auto w-full max-w-xs rounded-2xl border border-line shadow-2xl"
        />
      ) : (
        <h1 className="text-2xl font-semibold text-ink">Qual é o seu Gamer DNA?</h1>
      )}
      <p className="text-sm text-ink-soft">
        Marque os jogos que você zerou na vida, do Master System ao PS5, e descubra o seu.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-12 items-center rounded-xl bg-neon px-6 text-base font-semibold text-bg-deep hover:brightness-110"
      >
        Descobrir o meu Gamer DNA
      </Link>
    </main>
  );
}
