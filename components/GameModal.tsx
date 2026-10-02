'use client';

import { Check, Clock, Flame, PartyPopper, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Button } from '@/components/ui/Button';
import { CoverImage } from '@/components/ui/CoverImage';
import { Modal } from '@/components/ui/Modal';
import { StarRating } from '@/components/ui/StarRating';
import { STATUS_META, STATUS_ORDER, categoryMeta } from '@/lib/platforms';
import { cn, currentYear, formatDate, timeAgo } from '@/lib/utils';
import { useAllGames, useGameProgress, useGameStore } from '@/stores/useGameStore';
import type { Game, GameStatus } from '@/types/game';

/** Pong é de 1972 — antes disso não tem o que zerar. */
const MIN_YEAR = 1972;
const NOTES_MAX = 2000;
/** Duração da micro-celebração e do selo "Salvo". */
const CELEBRATION_MS = 1100;
const SAVED_MS = 2000;

const RATING_HINT: Record<number, string> = {
  1: 'Não curti',
  2: 'Ok',
  3: 'Bom',
  4: 'Ótimo',
  5: 'Inesquecível',
};

/** Anel + brilho na cor do status/geração (cores vêm em hex, não em classe). */
function accentRing(color: string): CSSProperties {
  return {
    boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 60%, transparent), 0 0 22px -10px ${color}`,
  };
}

const SECTION = 'border-t border-line-soft px-4 py-4 sm:px-6 sm:py-5';
const SECTION_TITLE = 'text-xs font-semibold tracking-[0.14em] text-ink-dim uppercase';
const FIELD =
  'h-11 rounded-xl border border-line bg-panel-2 px-3 text-[16px] text-ink placeholder:text-ink-dim transition-colors duration-200 focus:border-neon/60 disabled:opacity-50';

export function GameModal() {
  const selectedGameId = useGameStore((s) => s.selectedGameId);
  const closeGame = useGameStore((s) => s.closeGame);
  const games = useAllGames();

  const game = useMemo(
    () => (selectedGameId ? games.find((item) => item.id === selectedGameId) : undefined),
    [games, selectedGameId],
  );

  return (
    <Modal open={!!game} onClose={closeGame} labelledBy="game-modal-title" className="sm:max-w-3xl">
      {/* `key` remonta o conteúdo a cada jogo: os rascunhos locais recarregam sozinhos. */}
      {game ? <GameModalContent key={game.id} game={game} /> : null}
    </Modal>
  );
}

function GameModalContent({ game }: { game: Game }) {
  const progress = useGameProgress(game.id);
  const closeGame = useGameStore((s) => s.closeGame);
  const updateProgress = useGameStore((s) => s.updateProgress);
  const setGameStatus = useGameStore((s) => s.setGameStatus);
  const clearProgress = useGameStore((s) => s.clearProgress);
  const pushToast = useGameStore((s) => s.pushToast);
  const removeCustomGame = useGameStore((s) => s.removeCustomGame);

  // `new Date()` só no cliente e uma única vez — nada de HTML instável.
  const maxYear = useMemo(() => currentYear(), []);

  const meta = categoryMeta(game.category);
  const status: GameStatus = progress?.status ?? 'unplayed';
  const storedYear = progress?.completedYear;
  const storedNotes = progress?.notes ?? '';
  const rating = progress?.rating ?? 0;

  const [yearDraft, setYearDraft] = useState(storedYear ? String(storedYear) : '');
  const [notesDraft, setNotesDraft] = useState(storedNotes);
  const [celebrating, setCelebrating] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  /** Último texto de ano já processado — evita gravar/avisar duas vezes (Enter + blur). */
  const lastYearCommit = useRef(yearDraft);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  /**
   * Fechar no Escape desmonta o campo que ainda estava focado, e o navegador não
   * dispara `blur` em elemento removido do DOM — sem este flush o ano e a memória
   * afetiva recém-digitados sumiriam calados. O ref é atualizado a cada render
   * (efeito sem deps) para o cleanup enxergar sempre o rascunho mais novo.
   */
  const flushDrafts = useRef<() => void>(undefined);
  useEffect(() => {
    flushDrafts.current = () => {
      commitYear();
      persistNotes();
    };
  });
  useEffect(() => () => flushDrafts.current?.(), []);

  /* ---------------------------------------------------------------- status */

  function handleStatus(next: GameStatus) {
    if (next === status) return;
    setGameStatus(game.id, next);

    if (next === 'beaten') {
      pushToast('Zerado! Mais um pra conta.');
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      setCelebrating(true);
      celebrationTimer.current = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    }
  }

  /* ------------------------------------------------------------------- ano */

  /**
   * A store mescla `undefined` como "mantém o valor atual", então apagar o ano
   * exige derrubar o registro e regravar o resto do progresso sem ele.
   */
  function clearCompletedYear() {
    if (!progress || progress.completedYear === undefined) return;
    clearProgress(game.id);
    updateProgress(game.id, {
      status: progress.status,
      rating: progress.rating,
      notes: progress.notes,
    });
  }

  function commitYear() {
    const raw = yearDraft.trim();
    if (raw === lastYearCommit.current) return;
    lastYearCommit.current = raw;

    if (!raw) {
      clearCompletedYear();
      return;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > maxYear) {
      pushToast(`Informe um ano entre ${MIN_YEAR} e ${maxYear}.`, 'error');
      return; // fora da faixa não grava — o texto fica lá pro usuário corrigir
    }

    const completedYear = parsed;
    updateProgress(game.id, { completedYear });
  }

  function fillCurrentYear() {
    const text = String(maxYear);
    setYearDraft(text);
    lastYearCommit.current = text;
    updateProgress(game.id, { completedYear: maxYear });
  }

  /* ---------------------------------------------------------------- notas */

  /** Grava as notas se mudaram. Devolve `true` quando houve escrita. */
  function persistNotes(): boolean {
    const notes = notesDraft.trim();
    if (notes === storedNotes) return false;
    updateProgress(game.id, { notes });
    return true;
  }

  function commitNotes() {
    if (!persistNotes()) return;

    if (savedTimer.current) clearTimeout(savedTimer.current);
    setNotesSaved(true);
    savedTimer.current = setTimeout(() => setNotesSaved(false), SAVED_MS);
  }

  /** Jogo que veio da busca online pode sair do catálogo — senão a adição é via de mão única. */
  function handleRemoveCustom() {
    clearProgress(game.id);
    removeCustomGame(game.id);
    closeGame();
    pushToast(`${game.title} saiu do seu catálogo.`, 'info');
  }

  /* ---------------------------------------------------------------- limpar */

  function handleClear() {
    clearProgress(game.id);
    setYearDraft('');
    setNotesDraft('');
    lastYearCommit.current = '';
    setNotesSaved(false);
    pushToast('Registro apagado. Esse jogo voltou pra estaca zero.', 'info');
  }

  // O campo de ano vive junto do "Zerei!", mas nunca esconde um ano já gravado.
  const showYear = status === 'beaten' || storedYear !== undefined;

  return (
    <div className="flex flex-col">
      {/* Fechar sempre ao alcance, mesmo com o painel rolado. */}
      <div className="sticky top-0 z-20 flex justify-end bg-panel/95 px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-3">
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={closeGame}>
          <X aria-hidden className="size-5" />
        </Button>
      </div>

      <header className="flex gap-4 px-4 pb-5 sm:gap-5 sm:px-6">
        <div className="w-28 shrink-0 overflow-hidden rounded-xl border border-line sm:w-44">
          <CoverImage game={game} sizes="200px" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 id="game-modal-title" className="text-xl font-semibold text-balance sm:text-2xl">
            {game.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-soft">
            <span className="font-medium text-ink">{game.platform}</span>
            {game.releaseYear > 0 && (
              <>
                <span aria-hidden className="text-ink-dim">
                  ·
                </span>
                <span>{game.releaseYear}</span>
              </>
            )}
            <span
              className="rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
              style={{
                color: meta.color,
                borderColor: `color-mix(in oklab, ${meta.color} 40%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
              }}
            >
              {meta.tabLabel}
            </span>
            {game.isBrazilClassic && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold uppercase"
                title="Marcou época nas locadoras e fliperamas do Brasil"
              >
                <Flame aria-hidden className="size-3" />
                Clássico BR
              </span>
            )}
          </div>

          {game.summary && (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{game.summary}</p>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------ status */}
      <section className={cn(SECTION, 'relative')}>
        <h3 className={SECTION_TITLE}>Situação</h3>

        {celebrating && (
          <span
            aria-hidden
            className="animate-pop pointer-events-none absolute top-2 right-4 z-10 sm:right-6"
          >
            <PartyPopper
              className="size-8 text-neon"
              style={{ filter: 'drop-shadow(0 0 12px color-mix(in oklab, var(--color-neon) 70%, transparent))' }}
            />
          </span>
        )}

        <div
          role="radiogroup"
          aria-label="Situação do jogo"
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {STATUS_ORDER.map((option) => {
            const optionMeta = STATUS_META[option];
            const selected = option === status;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                title={optionMeta.longLabel}
                onClick={() => handleStatus(option)}
                style={selected ? accentRing(optionMeta.color) : undefined}
                className={cn(
                  'flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors duration-200 active:scale-[0.98]',
                  selected
                    ? optionMeta.chipClass
                    : 'border-line bg-panel-2 text-ink-soft hover:border-line-soft hover:bg-panel-3 hover:text-ink',
                )}
              >
                <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', optionMeta.dotClass)} />
                <span className="truncate">{optionMeta.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------------- ano */}
      <div
        aria-hidden={!showYear}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          showYear ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <section className={SECTION}>
            <label htmlFor="zerei-completed-year" className={SECTION_TITLE}>
              Em que ano você zerou?
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                id="zerei-completed-year"
                type="number"
                inputMode="numeric"
                min={MIN_YEAR}
                max={maxYear}
                step={1}
                placeholder="Ex.: 1996"
                disabled={!showYear}
                value={yearDraft}
                onChange={(event) => setYearDraft(event.target.value)}
                onBlur={commitYear}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  commitYear();
                }}
                className={cn(FIELD, 'w-32')}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!showYear}
                onClick={fillCurrentYear}
              >
                Este ano
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-dim">
              Não lembra a data exata? Chute honesto vale — é a sua linha do tempo.
            </p>
          </section>
        </div>
      </div>

      {/* ---------------------------------------------------------- avaliação */}
      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>Sua nota</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <StarRating
            value={rating}
            onChange={(value) => updateProgress(game.id, { rating: value })}
            size="lg"
            className="-ml-1"
          />
          <span className={cn('text-sm', rating > 0 ? 'text-ink' : 'text-ink-dim')}>
            {rating > 0 ? RATING_HINT[rating] : 'Toque nas estrelas'}
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------- notas */}
      <section className={SECTION}>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="zerei-notes" className={SECTION_TITLE}>
            Memórias afetivas / anotações
          </label>
          <span role="status" aria-live="polite" className="text-xs text-neon">
            {notesSaved && (
              <span className="animate-fade-in inline-flex items-center gap-1">
                <Check aria-hidden className="size-3.5" />
                Salvo
              </span>
            )}
          </span>
        </div>

        <textarea
          id="zerei-notes"
          rows={4}
          maxLength={NOTES_MAX}
          placeholder="Alugava na locadora de sexta a segunda..."
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={commitNotes}
          className={cn(
            FIELD,
            'mt-3 block h-auto w-full resize-y py-2.5 leading-relaxed scrollbar-thin',
          )}
        />
        <p className="mt-1.5 text-right text-[11px] text-ink-dim tabular-nums">
          {notesDraft.length}/{NOTES_MAX}
        </p>
      </section>

      {/* ------------------------------------------------------------ rodapé */}
      {(progress || game.isCustom) && (
        <footer
          className={cn(
            SECTION,
            // Um valor só: `.safe-bottom` fica na mesma cascade layer das utilities
            // do Tailwind e é declarada depois, então venceria o `sm:pb-6`.
            'flex flex-wrap items-center justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6',
          )}
        >
          {progress ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-dim">
              <Clock aria-hidden className="size-3.5" />
              Atualizado{' '}
              <time dateTime={progress.updatedAt} title={formatDate(progress.updatedAt)}>
                {timeAgo(progress.updatedAt)}
              </time>
            </span>
          ) : (
            <span className="text-xs text-ink-dim">Adicionado por você pela busca online.</span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {game.isCustom && (
              <Button type="button" variant="outline" size="sm" onClick={handleRemoveCustom}>
                <Trash2 aria-hidden className="size-4" />
                Remover do catálogo
              </Button>
            )}
            {progress && (
              <Button type="button" variant="danger" size="sm" onClick={handleClear}>
                <Trash2 aria-hidden className="size-4" />
                Limpar registro
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
