'use client';

import { X } from 'lucide-react';

import { STATUS_META, STATUS_ORDER } from '@/lib/platforms';
import { cn, pluralize } from '@/lib/utils';
import { useGameStore } from '@/stores/useGameStore';

/**
 * Barra da seleção múltipla: marca vários jogos de uma vez. Fica presa no
 * rodapé (respeitando a área segura do celular) enquanto há seleção.
 */
export function SelectionBar() {
  const selection = useGameStore((s) => s.selection);
  const setManyStatus = useGameStore((s) => s.setManyStatus);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const pushToast = useGameStore((s) => s.pushToast);

  if (selection.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={`Ações para ${pluralize(selection.length, 'jogo selecionado', 'jogos selecionados')}`}
      className="animate-slide-up fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-gold/50 bg-panel-2/95 p-1.5 shadow-2xl backdrop-blur-xl no-scrollbar">
        <span className="shrink-0 px-2 text-sm font-semibold whitespace-nowrap text-gold">
          {pluralize(selection.length, 'selecionado')}
        </span>
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status];
          return (
            <button
              key={status}
              type="button"
              onClick={() => {
                const count = setManyStatus(selection, status);
                pushToast(`${pluralize(count, 'jogo')} → ${meta.label}`, status === 'beaten' ? 'success' : 'info');
                clearSelection();
              }}
              className={cn(
                'flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                'border-line bg-panel-3 text-ink hover:border-ink-dim/60',
              )}
            >
              <span aria-hidden="true" className={cn('size-2 rounded-full', meta.dotClass)} />
              {meta.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Cancelar seleção"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-soft transition-colors duration-200 hover:bg-panel-3 hover:text-ink"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
