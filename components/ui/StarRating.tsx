'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';

import { clamp, cn } from '@/lib/utils';

export interface StarRatingProps {
  value?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
  className?: string;
}

type StarSize = NonNullable<StarRatingProps['size']>;

const STARS = [1, 2, 3, 4, 5] as const;

const ICON_SIZE: Record<StarSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
};

/** Área de toque: no md/lg o botão ganha folga pra dedo. */
const BUTTON_PADDING: Record<StarSize, string> = {
  sm: 'p-0.5',
  md: 'p-1',
  lg: 'p-1',
};

function ratingLabel(value: number): string {
  if (value <= 0) return 'Sem nota';
  return `Nota: ${value} de 5 estrelas`;
}

/** Nota de 1 a 5 estrelas. Sem `onChange` (ou com `readOnly`) vira só leitura. */
export function StarRating({
  value = 0,
  onChange,
  size = 'md',
  readOnly,
  className,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const current = clamp(Math.round(value), 0, 5);
  const interactive = !readOnly && typeof onChange === 'function';

  if (!interactive || !onChange) {
    return (
      <span
        role="img"
        aria-label={ratingLabel(current)}
        className={cn('inline-flex items-center gap-0.5', className)}
      >
        {STARS.map((star) => (
          <Star
            key={star}
            aria-hidden="true"
            className={cn(
              ICON_SIZE[size],
              star <= current ? 'fill-gold text-gold' : 'text-ink-dim',
            )}
          />
        ))}
      </span>
    );
  }

  // Durante o hover/foco a régua mostra o valor que será gravado no clique.
  const preview = hovered ?? current;

  return (
    <div
      className={cn('inline-flex items-center', className)}
      onMouseLeave={() => setHovered(null)}
    >
      {STARS.map((star) => {
        const isCurrent = star === current && current > 0;
        return (
          <button
            key={star}
            type="button"
            aria-label={`${star} estrela(s)`}
            aria-pressed={star <= current}
            title={isCurrent ? 'Clique de novo para remover a nota' : `Dar ${star} estrela(s)`}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(null)}
            onClick={() => onChange(isCurrent ? 0 : star)}
            className={cn(
              'rounded-lg transition-colors duration-200 touch-manipulation',
              'hover:bg-panel-3 active:bg-panel-3',
              BUTTON_PADDING[size],
            )}
          >
            <Star
              aria-hidden="true"
              className={cn(
                ICON_SIZE[size],
                'transition-colors duration-200',
                star <= preview ? 'fill-gold text-gold' : 'text-ink-dim',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
