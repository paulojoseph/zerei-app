'use client';

import { useMemo, useState } from 'react';
import { Check, Download, Link2, Share2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { computeDna, encodeDna } from '@/lib/dna';
import { pluralize } from '@/lib/utils';
import { useGameStore } from '@/stores/useGameStore';
import type { StatsSummary } from '@/types/game';

/** Ícones de marca desenhados à mão (lucide não traz logos de terceiros). */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}

const ACTION =
  'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-3 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink-dim/60';

/**
 * "Compartilhar meu Gamer DNA": o card vira imagem (story para Instagram e
 * WhatsApp) e link com prévia. Tudo sem conta: o DNA viaja na própria URL.
 */
export function DnaShare({ stats }: { stats: StatsSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const pushToast = useGameStore((s) => s.pushToast);

  const dna = useMemo(() => computeDna(stats), [stats]);
  const code = useMemo(() => encodeDna(dna), [dna]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const link = `${origin}/dna?d=${code}`;
  const storyUrl = `/api/dna?d=${code}&f=story`;
  const text = `Meu Gamer DNA no Zerei: ${dna.archetype.label}, ${pluralize(dna.beaten, 'jogo zerado', 'jogos zerados')}. Descubra o seu:`;

  /** No celular, a folha nativa compartilha a IMAGEM (vai direto para o story). */
  const shareNative = async () => {
    try {
      const blob = await (await fetch(storyUrl)).blob();
      const file = new File([blob], 'gamer-dna-zerei.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${link}` });
        return;
      }
      await navigator.share({ title: 'Meu Gamer DNA', text, url: link });
    } catch (error) {
      // Cancelar a folha de compartilhamento não é erro.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      pushToast('Não deu para abrir o compartilhamento. Use os botões abaixo.', 'error');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast('Não deu para copiar. Selecione o link e copie à mão.', 'error');
    }
  };

  const canShareNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <>
      <Button variant="solid" onClick={() => setOpen(true)} className="min-h-11">
        <Share2 className="size-4" aria-hidden="true" />
        Compartilhar meu Gamer DNA
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="dna-title" className="sm:max-w-2xl">
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="absolute top-3 right-3 grid size-10 place-items-center rounded-xl text-ink-soft hover:bg-panel-3 hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada pela rota /api/dna */}
          <img
            src={storyUrl}
            alt={`Gamer DNA: ${dna.archetype.label}, ${pluralize(dna.beaten, 'jogo zerado', 'jogos zerados')}`}
            width={1080}
            height={1920}
            className="mx-auto h-auto w-44 shrink-0 rounded-xl border border-line sm:w-56"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="text-xs tracking-widest text-neon uppercase">Seu Gamer DNA</p>
              <h2 id="dna-title" className="mt-1 text-2xl font-semibold text-ink">
                {dna.archetype.label}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">{dna.archetype.line}</p>
            </div>

            {canShareNative && (
              <Button variant="solid" onClick={() => void shareNative()} className="min-h-11">
                <Share2 className="size-4" aria-hidden="true" />
                Compartilhar a imagem
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={ACTION}
              >
                <WhatsAppIcon />
                WhatsApp
              </a>
              <a
                href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={ACTION}
              >
                <span aria-hidden="true" className="text-base leading-none font-bold">
                  𝕏
                </span>
                Postar no X
              </a>
              <button type="button" onClick={() => void copyLink()} className={ACTION}>
                {copied ? <Check className="size-4 text-neon" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
                {copied ? 'Link copiado!' : 'Copiar link'}
              </button>
              <a href={storyUrl} download="gamer-dna-zerei.png" className={ACTION}>
                <Download className="size-4" aria-hidden="true" />
                Baixar imagem
              </a>
            </div>
            <p className="text-xs text-ink-dim">
              O link mostra o seu card na prévia do WhatsApp e das redes. Nada sobre você fica guardado no servidor: os
              números vão no próprio link.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
