'use client';

import { useState } from 'react';
import { Check, Gamepad2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { CATALOG_COUNTS, CONSOLES, MINE_FILTER, type ConsoleMeta } from '@/lib/consoles';
import { CATEGORY_META } from '@/lib/platforms';
import { cn, pluralize } from '@/lib/utils';
import { useGameStore } from '@/stores/useGameStore';

/**
 * Ordem da persona de lançamento (nostálgico brasileiro, 25–45 anos): o que
 * estava na sala e na locadora vem primeiro; o resto segue por ano.
 */
const FEATURED = [
  'master-system',
  'mega-drive',
  'nes',
  'snes',
  'playstation',
  'n64',
  'ps2',
  'game-boy',
  'gba',
  'atari-2600',
  'arcade',
  'neo-geo',
  'dreamcast',
  'saturn',
  'gamecube',
  'xbox',
];

function orderedConsoles(): ConsoleMeta[] {
  const available = CONSOLES.filter((c) => (CATALOG_COUNTS[c.id] ?? 0) > 0);
  const rank = (c: ConsoleMeta) => {
    const featured = FEATURED.indexOf(c.id);
    return featured === -1 ? 100 + c.year : featured;
  };
  return available.sort((a, b) => rank(a) - rank(b));
}

const ORDERED = orderedConsoles();

/**
 * "Quais consoles você teve?" — três toques e a pessoa já está marcando jogos
 * do console da infância. Aparece uma vez; dá para pular.
 */
export function Onboarding() {
  const setMyConsoles = useGameStore((s) => s.setMyConsoles);
  const finishOnboarding = useGameStore((s) => s.finishOnboarding);
  const setPlatform = useGameStore((s) => s.setPlatform);
  const [picked, setPicked] = useState<string[]>([]);
  // 16 consoles da persona primeiro; o resto (modernos, portáteis) sob demanda.
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? ORDERED : ORDERED.slice(0, FEATURED.length);

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

  const start = () => {
    setMyConsoles(picked);
    finishOnboarding();
    const only = picked.length === 1 ? CONSOLES.find((c) => c.id === picked[0]) : undefined;
    setPlatform(only ? only.name : MINE_FILTER);
  };

  return (
    <section
      aria-labelledby="onboarding-title"
      className="animate-fade-in mb-6 rounded-2xl border border-line bg-panel/60 p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-neon/40 bg-neon/10 text-neon">
          <Gamepad2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="onboarding-title" className="text-base font-semibold text-ink sm:text-lg">
            Quais consoles você teve?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Escolha os da sua história. A gente mostra os jogos deles primeiro para você marcar os
            que zerou em segundos.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map((c) => {
          const active = picked.includes(c.id);
          const color = CATEGORY_META[c.category].color;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => toggle(c.id)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors duration-200',
                  active ? 'border-neon bg-neon/10' : 'border-line bg-panel-2/60 hover:border-ink-dim/60',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-md border',
                    active ? 'border-neon bg-neon text-bg-deep' : 'border-line',
                  )}
                >
                  {active && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{c.label}</span>
                  <span className="block text-[11px] text-ink-dim">
                    <span aria-hidden="true" className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ backgroundColor: color }} />
                    {c.year} · {pluralize(CATALOG_COUNTS[c.id] ?? 0, 'jogo')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 min-h-11 w-full rounded-xl border border-dashed border-line text-sm text-ink-soft transition-colors duration-200 hover:border-ink-dim/60 hover:text-ink"
        >
          Ver todos os consoles ({ORDERED.length})
        </button>
      )}

      {/* Preso no rodapé: com a lista aberta, o botão não some de vista no celular. */}
      <div className="sticky bottom-0 -mx-4 mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft bg-panel/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="solid" disabled={picked.length === 0} onClick={start}>
          {picked.length === 0
            ? 'Escolha pelo menos um'
            : `Começar a marcar (${pluralize(picked.length, 'console')})`}
        </Button>
        <button
          type="button"
          onClick={finishOnboarding}
          className="min-h-11 px-2 text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline"
        >
          Agora não
        </button>
      </div>
    </section>
  );
}
