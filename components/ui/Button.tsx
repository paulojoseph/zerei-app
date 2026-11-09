import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Zerei.app base button (shadcn pattern + cva).
 * No 'use client' on purpose: there's only styling here. Whoever has a handler
 * declares the client component.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] shrink-0',
  {
    variants: {
      variant: {
        neon: 'bg-neon text-bg-deep shadow-[0_0_20px_-8px_var(--color-neon)] hover:bg-[#63ffb8] hover:shadow-[0_0_26px_-6px_var(--color-neon)]',
        cyan: 'bg-cyan text-bg-deep shadow-[0_0_20px_-8px_var(--color-cyan)] hover:bg-[#5ce3f7] hover:shadow-[0_0_26px_-6px_var(--color-cyan)]',
        solid: 'bg-panel-3 text-ink border border-line hover:bg-panel-2',
        ghost: 'bg-transparent text-ink-soft hover:bg-panel-2 hover:text-ink',
        outline: 'border border-line bg-transparent text-ink hover:border-neon/50 hover:text-neon',
        danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10 hover:border-danger/70',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10 p-0',
        'icon-sm': 'size-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps): React.JSX.Element {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
