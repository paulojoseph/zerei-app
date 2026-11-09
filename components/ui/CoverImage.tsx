'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Gamepad2 } from 'lucide-react';

import type { Game } from '@/types/game';
import { categoryMeta, platformShort } from '@/lib/platforms';
import { cn } from '@/lib/utils';

/** Mirrors `images.remotePatterns` from next.config.ts. */
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
 * Covers the browser fetches directly, skipping the Next optimizer:
 * - IGDB: their CDN already serves the card size (264px), cached for a
 *   year; going through our server would only burn CPU and create our own copy
 *   of the artwork (ADR 0004: hotlink, no storage);
 * - Wikimedia: answers 429 to the burst the optimizer fires from the server.
 */
function bypassOptimizer(url: string): boolean {
  return url.startsWith('https://images.igdb.com/') || url.startsWith('https://upload.wikimedia.org/');
}

/** Wrapper shape: the generated cover must take exactly the same space. */
const FRAME = 'relative aspect-[3/4] w-full overflow-hidden bg-panel-2';

/**
 * Press Start 2P is monospaced with a 1em advance: at 10px about 13 characters
 * fit per line in the usable width of a phone card (~150px in 2 columns). Past
 * those limits the pixel title would break mid-word, so it falls back to the
 * text font, which is proportional and fits more than twice as much per line.
 */
const PIXEL_TITLE_MAX_CHARS = 22;
const PIXEL_TITLE_MAX_WORD = 12;

function fitsPixelFont(title: string): boolean {
  if (title.length > PIXEL_TITLE_MAX_CHARS) return false;
  // A single long word already overflows the line, even in a short title.
  return title.split(/\s+/).every((word) => word.length <= PIXEL_TITLE_MAX_WORD);
}

/**
 * Next's <Image> blows up at runtime if the host isn't allowed in
 * next.config. Since the cover may come from IGDB or an imported backup, we
 * only hand the optimizer what we know passes; the rest becomes a generated cover.
 */
function isSupportedCover(url: string): boolean {
  // Local path in /public (but not a protocol-relative URL "//host/x.png").
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
  // Prop-derived state without useEffect: we keep the url we used and compare
  // during render (the official React pattern for "reset when the item changes").
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
      {/* Skeleton behind the cover: it disappears on its own once the image paints on top. */}
      {!loaded && <div aria-hidden className="animate-shimmer absolute inset-0" />}
      <Image
        // Visibility NEVER depends on the `load` event: an image already in the
        // browser cache finishes loading before React attaches `onLoad`, and the
        // event simply never arrives, so the cover would stay invisible forever on
        // every reload. The fade comes from a mount animation, and `onLoad`/`ref`
        // only serve to remove the skeleton from behind when possible.
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) setLoaded(true);
        }}
        src={src}
        alt={`Cover of ${game.title}`}
        fill
        sizes={sizes ?? DEFAULT_SIZES}
        // `priority` was retired in Next 16: eager + fetchPriority replaces it.
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
 * Locally generated cover. It's not an error state: it's real box art,
 * painted with the console generation color.
 */
export function FallbackCover({ game, className }: { game: Game; className?: string }) {
  const meta = categoryMeta(game.category);
  const accent = meta.color;
  const pixelTitle = fitsPixelFont(game.title);

  const frameStyle: CSSProperties = {
    backgroundColor: '#101015',
    backgroundImage: [
      // bottom-up darkening first: keeps the title readable
      'linear-gradient(180deg, rgba(5,5,7,0) 34%, rgba(5,5,7,0.92) 100%)',
      `radial-gradient(130% 80% at 50% -14%, color-mix(in oklab, ${accent} 48%, transparent), transparent 62%)`,
      `radial-gradient(85% 55% at 112% 106%, color-mix(in oklab, ${accent} 26%, transparent), transparent 66%)`,
    ].join(', '),
  };

  return (
    <div
      role="img"
      aria-label={`Cover of ${game.title}`}
      className={cn(FRAME, 'scanlines select-none', className)}
      style={frameStyle}
    >
      {/* generation strip, like the top of a console box */}
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
