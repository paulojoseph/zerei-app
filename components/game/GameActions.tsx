'use client';

import { ShareButtons } from '@/components/game/ShareButtons';
import { STATUS_META, STATUS_ORDER } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import { useGameProgress, useGameStore, useHydrated } from '@/stores/useGameStore';

/**
 * Status e compartilhamento na página do jogo. A página é renderizada no
 * servidor (igual para todo mundo); só esta parte lê o progresso local.
 */
export function GameActions({ id, title, consoleId }: { id: string; title: string; consoleId?: string }) {
  const hydrated = useHydrated();
  const progress = useGameProgress(id);
  const updateProgress = useGameStore((s) => s.updateProgress);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const pushToast = useGameStore((s) => s.pushToast);
  const status = progress?.status ?? 'unplayed';

  const beaten = status === 'beaten';

  const choose = (next: (typeof STATUS_ORDER)[number]) => {
    if (next === 'unplayed') setGameStatus(id, next);
    else updateProgress(id, { status: next, consoleId });
    pushToast(`${title} → ${STATUS_META[next].label}`, next === 'beaten' ? 'success' : 'info');
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Situação do jogo" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUS_ORDER.map((option) => {
          const meta = STATUS_META[option];
          const active = hydrated && option === status;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(option)}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors duration-200',
                active ? meta.chipClass : 'border-line bg-panel-2/60 text-ink-soft hover:text-ink',
              )}
            >
              <span aria-hidden="true" className={cn('size-2 rounded-full', meta.dotClass)} />
              {meta.label}
            </button>
          );
        })}
      </div>

      <ShareButtons id={id} title={title} beaten={beaten} />
    </div>
  );
}
