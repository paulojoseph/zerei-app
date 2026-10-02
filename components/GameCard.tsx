'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, EllipsisVertical, Trophy } from 'lucide-react';

import { CoverImage } from '@/components/ui/CoverImage';
import { StarRating } from '@/components/ui/StarRating';
import { statusOf } from '@/lib/games';
import { STATUS_META, STATUS_ORDER, categoryMeta, platformShort } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import { useGameProgress, useGameStore } from '@/stores/useGameStore';
import type { Game, GameStatus, UserGameProgress } from '@/types/game';

export interface GameCardProps {
  game: Game;
  priority?: boolean;
  /** Posição na grade (navegação por teclado). */
  index?: number;
  /** Só o card com foco entra na ordem do Tab (roving tabindex). */
  focusable?: boolean;
  onFocusCard?: (index: number) => void;
}

/** Tempo de toque longo que seleciona o card no celular. */
const LONG_PRESS_MS = 450;

/** Sem progresso salvo o card cai no mesmo caminho de `statusOf` do resto do app. */
const NO_PROGRESS: Record<string, UserGameProgress> = {};

/** Borda/brilho por status — Tailwind não aceita classe montada em runtime. */
const CARD_STATUS_CLASS: Record<GameStatus, string> = {
  beaten: 'border-neon/70 glow-neon',
  playing: 'border-cyan/60',
  backlog: 'border-gold/40',
  unplayed: 'border-line hover:border-ink-dim/50',
};

export function GameCard({ game, priority, index = 0, focusable = false, onFocusCard }: GameCardProps) {
  const progress = useGameProgress(game.id);
  const selected = useGameStore((s) => s.selection.includes(game.id));
  const selectionMode = useGameStore((s) => s.selection.length > 0);
  const toggleSelected = useGameStore((s) => s.toggleSelected);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const openGame = useGameStore((s) => s.openGame);
  const toggleBeaten = useGameStore((s) => s.toggleBeaten);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const pushToast = useGameStore((s) => s.pushToast);

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const status = statusOf(progress ? { [game.id]: progress } : NO_PROGRESS, game.id);
  const beaten = status === 'beaten';
  const accent = categoryMeta(game.category).color;
  const rating = progress?.rating ?? 0;
  // O ano sobrevive à troca de status (o dado fica guardado), mas só faz sentido exibir em jogo zerado.
  const completedYear = beaten ? progress?.completedYear : undefined;

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Menu aberto fecha no Escape e no clique fora (gatilho e menu contam como "dentro").
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const applyStatus = (next: GameStatus) => {
    setGameStatus(game.id, next);
    pushToast(`${game.title} → ${STATUS_META[next].label}`, next === 'beaten' ? 'success' : 'info');
    closeMenu(true);
  };

  return (
    <article
      data-card-index={index}
      data-game-id={game.id}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${game.title}, ${game.platform}${game.releaseYear ? `, ${game.releaseYear}` : ''} — ${STATUS_META[status].label}${selected ? ', selecionado' : ''}`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusCard?.(index);
      }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-line bg-panel transition-all duration-200',
        'outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        CARD_STATUS_CLASS[status],
        selected && 'ring-2 ring-gold ring-offset-2 ring-offset-bg',
      )}
    >
      {/* Região da capa: âncora dos elementos flutuantes e recorte do zoom no hover. */}
      <div className="relative overflow-hidden">
        <button
          type="button"
          onClick={(e) => {
            // Toque longo já selecionou: o "click" que vem depois não abre o jogo.
            if (longPress.current.fired) {
              longPress.current.fired = false;
              return;
            }
            // Shift+clique (ou qualquer clique com a seleção ativa) seleciona em vez de abrir.
            if (e.shiftKey || selectionMode) toggleSelected(game.id);
            else openGame(game.id);
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') return;
            longPress.current.fired = false;
            longPress.current.timer = setTimeout(() => {
              longPress.current.fired = true;
              toggleSelected(game.id);
              navigator.vibrate?.(15);
            }, LONG_PRESS_MS);
          }}
          onPointerUp={() => clearTimeout(longPress.current.timer ?? undefined)}
          onPointerLeave={() => clearTimeout(longPress.current.timer ?? undefined)}
          onPointerCancel={() => clearTimeout(longPress.current.timer ?? undefined)}
          onContextMenu={(e) => {
            // O menu de contexto do celular disputaria com o toque longo.
            if (longPress.current.fired) e.preventDefault();
          }}
          tabIndex={-1}
          aria-label={`Abrir detalhes de ${game.title}`}
          className="relative block w-full text-left"
        >
          <CoverImage
            game={game}
            priority={priority}
            className="transition-transform duration-300 group-hover:scale-[1.04]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent"
          />
        </button>

        {selected && (
          <span
            aria-hidden="true"
            className="animate-pop pointer-events-none absolute bottom-1.5 left-1.5 z-10 grid size-6 place-items-center rounded-md bg-gold text-bg-deep"
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        )}

        {beaten && (
          <span
            aria-hidden="true"
            className="animate-pop pointer-events-none absolute top-1.5 left-1.5 z-10 grid size-6 place-items-center rounded-full bg-neon text-bg-deep shadow-[0_0_18px_-4px_var(--color-neon)]"
          >
            <Trophy className="size-3.5" strokeWidth={2.4} />
          </span>
        )}

        <button
          ref={triggerRef}
          type="button"
          tabIndex={focusable ? 0 : -1}
          aria-label={`Mudar status de ${game.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setMenuOpen((open) => !open);
          }}
          className={cn(
            'absolute top-1 right-1 z-10 grid size-8 place-items-center rounded-lg transition-colors duration-200',
            // Fundo escurecido permanente: sem ele o ícone some sobre capa clara
            // (Alex Kidd, Top Gear e boa parte das box arts de SNES).
            'bg-bg/55 text-ink-soft backdrop-blur-sm hover:bg-bg/80 hover:text-ink',
            menuOpen && 'bg-bg/85 text-ink',
          )}
        >
          <EllipsisVertical className="size-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" />
        </button>

        {/* "Zerei!" no polegar: sempre visível no celular, revelado no hover no desktop. */}
        <button
          type="button"
          aria-pressed={beaten}
          tabIndex={focusable ? 0 : -1}
          aria-label={beaten ? 'Desmarcar zerado' : 'Marcar como zerado'}
          title={beaten ? 'Desmarcar zerado' : 'Marcar como zerado'}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleBeaten(game.id);
            pushToast(
              beaten ? `${game.title} → ${STATUS_META.unplayed.label}` : `${game.title} → Zerei!`,
              beaten ? 'info' : 'success',
            );
          }}
          className={cn(
            'absolute right-1.5 bottom-1.5 z-10 grid size-8 place-items-center rounded-full border transition-all duration-200',
            beaten
              ? 'animate-pop border-neon bg-neon text-bg-deep'
              : cn(
                  'border-line bg-bg/80 text-ink-soft backdrop-blur',
                  'hover:border-neon/60 hover:text-neon active:scale-95',
                  // Esconder por LARGURA deixaria a ação primária invisível — mas
                  // ainda clicável — em tablet e celular deitado, virando armadilha
                  // (o toque vira "zerei" em vez de abrir os detalhes). O gatilho
                  // certo é a capacidade de hover: só quem tem mouse vê o botão
                  // aparecer no hover.
                  '[@media(hover:hover)_and_(pointer:fine)]:opacity-0',
                  'group-hover:opacity-100 focus-visible:opacity-100',
                ),
          )}
        >
          <Check className="size-4" strokeWidth={2.6} />
        </button>
      </div>

      {/* Fora da capa para o `overflow-hidden` dela não cortar o menu em card estreito. */}
      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Status de ${game.title}`}
          className="animate-fade-in absolute top-9 right-1 z-30 w-40 max-w-[calc(100%_-_0.5rem)] rounded-xl border border-line bg-panel-2 p-1 shadow-2xl"
        >
          {STATUS_ORDER.map((option) => {
            const meta = STATUS_META[option];
            const active = option === status;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  applyStatus(option);
                }}
                className={cn(
                  'flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors duration-200',
                  active ? 'bg-panel-3 text-ink' : 'text-ink-soft hover:bg-panel-3 hover:text-ink',
                )}
              >
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', meta.dotClass)} />
                <span className="flex-1 truncate">{meta.label}</span>
                {active && <Check aria-hidden="true" className="size-3.5 shrink-0 text-neon" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-2">
        <h3
          title={game.title}
          className={cn(
            'line-clamp-2 min-h-[1.875rem] text-xs leading-[1.25] font-medium transition-colors duration-200',
            beaten ? 'text-neon' : 'text-ink',
          )}
        >
          {game.title}
        </h3>

        <div className="mt-1 flex h-4 items-center gap-1.5">
          {game.releaseYear > 0 && <span className="text-[11px] text-ink-dim">{game.releaseYear}</span>}
          <span
            className="font-display ml-auto shrink-0 rounded border px-1 py-0.5 text-[8px] leading-none"
            style={{
              color: accent,
              borderColor: `color-mix(in oklab, ${accent} 38%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
            }}
          >
            {platformShort(game.platform)}
          </span>
        </div>

        {(rating > 0 || completedYear !== undefined) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {rating > 0 && (
              // O `size="sm"` do primitivo (size-4) é largo demais pro rodapé em 2 colunas de celular:
              // encolhe o ícone aqui, sem tocar no StarRating.
              <StarRating value={rating} readOnly size="sm" className="gap-px [&_svg]:size-2.5" />
            )}
            {completedYear !== undefined && (
              <span className="ml-auto text-[10px] text-neon/80">Zerado em {completedYear}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
