'use client';

import { useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';

import { useCanShare, useOrigin } from '@/lib/browser';
import { useGameStore } from '@/stores/useGameStore';

const ACTION =
  'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 px-3 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink-dim/60';

/** Compartilhar um jogo: folha nativa (celular), WhatsApp, X e copiar link. */
export function ShareButtons({ id, title, beaten }: { id: string; title: string; beaten: boolean }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const pushToast = useGameStore((s) => s.pushToast);
  const [copied, setCopied] = useState(false);
  const link = `${origin}/jogo/${id}`;
  const text = beaten ? `Zerei ${title}! E você, já zerou?` : `${title} — você já zerou?`;

  const share = async () => {
    try {
      await navigator.share({ title, text, url: link });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        pushToast('Não deu para abrir o compartilhamento. Use os outros botões.', 'error');
      }
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canShare && (
        <button type="button" onClick={() => void share()} className={ACTION}>
          <Share2 className="size-4" aria-hidden="true" />
          Compartilhar
        </button>
      )}
      <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noopener noreferrer" className={ACTION}>
        WhatsApp
      </a>
      <a
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={ACTION}
      >
        Postar no X
      </a>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(link).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            },
            () => pushToast('Não deu para copiar o link.', 'error'),
          )
        }
        className={ACTION}
      >
        {copied ? <Check className="size-4 text-neon" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
        {copied ? 'Link copiado!' : 'Copiar link'}
      </button>
    </div>
  );
}
