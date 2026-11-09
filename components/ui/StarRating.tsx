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

/** Touch area: on md/lg the button gets finger-friendly padding. */
const BUTTON_PADDING: Record<StarSize, string> = {
  sm: 'p-0.5',
  md: 'p-1',
  lg: 'p-1',
};

function ratingLabel(value: number): string {
  if (value <= 0) return 'No score';
  return `Score: ${value} of 5 stars`;
}

/** Score from 1 to 5 stars. Without `onChange` (or with `readOnly`) it becomes read-only. */
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

  // During hover/focus the bar shows the value that will be saved on click.
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
            aria-label={`${star} star(s)`}
            aria-pressed={star <= current}
            title={isCurrent ? 'Click again to remove the score' : `Give ${star} star(s)`}
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
