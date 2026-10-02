import type { Metadata } from 'next';

import { Painel } from '@/components/Painel';
import { Toaster } from '@/components/Toaster';

export const metadata: Metadata = {
  title: 'Seu painel',
  description: 'Seus jogos zerados por gênero, console, geração e década — a linha do tempo da sua vida gamer.',
};

export default function PainelPage() {
  return (
    <>
      <Painel />
      <Toaster />
    </>
  );
}
