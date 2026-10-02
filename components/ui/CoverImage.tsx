'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Gamepad2 } from 'lucide-react';

import type { Game } from '@/types/game';
import { categoryMeta, platformShort } from '@/lib/platforms';
import { cn } from '@/lib/utils';

/** Espelha `images.remotePatterns` do next.config.ts. */
const COVER_HOSTS = new Set([
  'thumbnails.libretro.com',
  'images.igdb.com',
  'upload.wikimedia.org',
  'cdn.cloudflare.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'images.unsplash.com',
]);

const DEFAULT_SIZES = '(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 180px';

/**
 * Capas que o navegador busca direto, sem passar pelo otimizador do Next:
 * - IGDB: o CDN deles já entrega no tamanho do card (264 px), com cache de um
 *   ano; passar pelo nosso servidor só gastaria CPU e criaria cópia nossa da
 *   arte (ADR 0004: hotlink, sem armazenar);
 * - Wikimedia: responde 429 à rajada que o otimizador dispara do servidor.
 */
function bypassOptimizer(url: string): boolean {
  return url.startsWith('https://images.igdb.com/') || url.startsWith('https://upload.wikimedia.org/');
}

/** Formato do wrapper — a capa gerada precisa ocupar exatamente o mesmo espaço. */
const FRAME = 'relative aspect-[3/4] w-full overflow-hidden bg-panel-2';

/**
 * A Press Start 2P é monoespaçada com avanço de 1em: a 10px cabem ~13 caracteres
 * por linha na largura útil de um card de celular (~150px em 2 colunas). Acima
 * desses limites o título pixelado quebraria no meio da palavra, então ele cai
 * para a fonte de texto — que é proporcional e rende mais que o dobro por linha.
 */
const PIXEL_TITLE_MAX_CHARS = 22;
const PIXEL_TITLE_MAX_WORD = 12;

function fitsPixelFont(title: string): boolean {
  if (title.length > PIXEL_TITLE_MAX_CHARS) return false;
  // Uma palavra longa sozinha já estoura a linha, mesmo em título curto.
  return title.split(/\s+/).every((word) => word.length <= PIXEL_TITLE_MAX_WORD);
}

/**
 * O <Image> do Next explode em runtime se o host não estiver liberado no
 * next.config. Como a capa pode vir da IGDB ou de um backup importado, só
 * entregamos ao otimizador o que sabemos que passa; o resto vira capa gerada.
 */
function isSupportedCover(url: string): boolean {
  // Caminho local em /public (mas não URL protocol-relative "//host/x.png").
  if (url.startsWith('/')) return !url.startsWith('//');
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && COVER_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export interface CoverImageProps {
  game: Game;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

export function CoverImage({ game, sizes, priority, className }: CoverImageProps) {
  const src = game.coverUrl;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Estado derivado de prop sem useEffect: guardamos a url usada e comparamos
  // durante o render (padrão oficial do React para "resetar ao trocar de item").
  const [renderedSrc, setRenderedSrc] = useState(src);

  if (renderedSrc !== src) {
    setRenderedSrc(src);
    setLoaded(false);
    setFailed(false);
  }

  if (!src || failed || !isSupportedCover(src)) {
    return <FallbackCover game={game} className={className} />;
  }

  return (
    <div className={cn(FRAME, className)}>
      {/* Esqueleto atrás da capa: some sozinho quando a imagem pinta por cima. */}
      {!loaded && <div aria-hidden className="animate-shimmer absolute inset-0" />}
      <Image
        // A visibilidade NUNCA depende do evento `load`: imagem que já está no
        // cache do navegador termina de carregar antes do React pendurar o
        // `onLoad`, e o evento simplesmente não chega — a capa ficaria invisível
        // para sempre em todo reload. O fade vem de uma animação de montagem, e
        // `onLoad`/`ref` servem só para tirar o esqueleto de trás quando dá.
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) setLoaded(true);
        }}
        src={src}
        alt={`Capa de ${game.title}`}
        fill
        sizes={sizes ?? DEFAULT_SIZES}
        // `priority` foi aposentado no Next 16: eager + fetchPriority é o substituto.
        loading={priority ? 'eager' : undefined}
        fetchPriority={priority ? 'high' : undefined}
        unoptimized={bypassOptimizer(src)}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className="animate-fade-in object-cover"
      />
    </div>
  );
}

/**
 * Capa gerada localmente. Não é um estado de erro: é box art de verdade,
 * pintada com a cor da geração do console.
 */
export function FallbackCover({ game, className }: { game: Game; className?: string }) {
  const meta = categoryMeta(game.category);
  const accent = meta.color;
  const pixelTitle = fitsPixelFont(game.title);

  const frameStyle: CSSProperties = {
    backgroundColor: '#101015',
    backgroundImage: [
      // escurecimento de baixo para cima primeiro: mantém o título legível
      'linear-gradient(180deg, rgba(5,5,7,0) 34%, rgba(5,5,7,0.92) 100%)',
      `radial-gradient(130% 80% at 50% -14%, color-mix(in oklab, ${accent} 48%, transparent), transparent 62%)`,
      `radial-gradient(85% 55% at 112% 106%, color-mix(in oklab, ${accent} 26%, transparent), transparent 66%)`,
    ].join(', '),
  };

  return (
    <div
      role="img"
      aria-label={`Capa de ${game.title}`}
      className={cn(FRAME, 'scanlines select-none', className)}
      style={frameStyle}
    >
      {/* faixa da geração, como o topo de uma caixa de console */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accent }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 border"
        style={{ borderColor: `color-mix(in oklab, ${accent} 24%, transparent)` }}
      />
      <Gamepad2
        aria-hidden
        strokeWidth={1.1}
        className="pointer-events-none absolute top-1/2 -right-6 size-32 -translate-y-[58%] text-ink opacity-[0.09] sm:size-40"
      />

      <div className="relative flex h-full flex-col p-2.5 sm:p-3">
        <span
          className="truncate text-[8px] font-semibold tracking-[0.16em] uppercase sm:text-[9px]"
          style={{ color: `color-mix(in oklab, ${accent} 72%, white)` }}
        >
          {meta.tabLabel}
        </span>

        <div className="mt-auto flex flex-col gap-2">
          <h3
            className={cn(
              'break-words text-ink [text-shadow:0_2px_10px_rgba(0,0,0,0.75)]',
              pixelTitle
                ? 'font-display line-clamp-3 text-[10px] leading-[1.6] sm:text-[11px]'
                : 'line-clamp-4 text-xs leading-snug font-semibold sm:text-sm',
            )}
          >
            {game.title}
          </h3>
          <div className="flex items-center justify-between gap-1.5">
            <span
              className="font-display rounded-md border bg-black/40 px-1.5 py-1 text-[7px] leading-none"
              style={{
                color: accent,
                borderColor: `color-mix(in oklab, ${accent} 38%, transparent)`,
              }}
            >
              {platformShort(game.platform)}
            </span>
            {game.releaseYear > 0 && (
              <span className="font-display text-[8px] leading-none text-ink-dim">{game.releaseYear}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
