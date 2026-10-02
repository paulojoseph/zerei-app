'use client';

import { ChartColumn, Download, FileText, Save, Search, Trophy, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  backupFilename,
  backupToCsv,
  backupToJson,
  downloadTextFile,
  parseBackupFile,
} from '@/lib/backup';
import { cn, debounce, pluralize, CONTAINER } from '@/lib/utils';
import { useAllGames, useBeatenCount, useGameStore, useHydrated } from '@/stores/useGameStore';
import type { BackupPayload, ImportMode } from '@/types/game';

/** Espera antes de empurrar o texto digitado para a store (a tela responde na hora). */
const SEARCH_DEBOUNCE_MS = 220;

/** Backup lido do arquivo, aguardando o usuário escolher como aplicar. */
interface PendingImport {
  payload: BackupPayload;
  filename: string;
  records: number;
  customGames: number;
}

export function Header() {
  /* ---------------------------------------------------------------- store -- */
  const hydrated = useHydrated();
  const beatenCount = useBeatenCount();
  const games = useAllGames();
  const storeSearch = useGameStore((s) => s.search);
  const setSearch = useGameStore((s) => s.setSearch);
  const setStatsOpen = useGameStore((s) => s.setStatsOpen);
  const importBackup = useGameStore((s) => s.importBackup);
  const pushToast = useGameStore((s) => s.pushToast);

  /* ------------------------------------------------------------ elementos -- */
  const headerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  /* --------------------------------------------------------------- estado -- */
  const [text, setText] = useState(storeSearch);
  const [syncedSearch, setSyncedSearch] = useState(storeSearch);
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  /* ------------------------------------------------------- busca (debounce) -- */

  // Uma única instância do debounce por montagem; recriar a cada tecla zeraria o timer.
  const pushSearch = useMemo(() => debounce(setSearch, SEARCH_DEBOUNCE_MS), [setSearch]);

  /**
   * Publica a altura real do cabeçalho em `--header-h`. A barra de filtros gruda
   * nesse offset — fixar o valor na mão desalinha assim que o header quebra em
   * duas linhas (celular e tablet), escondendo as abas de geração atrás dele.
   */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => pushSearch.cancel(), [pushSearch]);

  // Estado derivado com chave: se a store for limpa por fora (`resetFilters`, botão
  // "limpar filtros"), o input local acompanha — sem useEffect de espelho.
  if (storeSearch !== syncedSearch) {
    setSyncedSearch(storeSearch);
    setText(storeSearch);
    // Um envio pendente escreveria o texto antigo de volta logo em seguida.
    pushSearch.cancel();
  }

  const clearSearch = useCallback(
    (refocus: boolean) => {
      pushSearch.cancel();
      setText('');
      setSearch('');
      if (refocus) inputRef.current?.focus();
    },
    [pushSearch, setSearch],
  );

  // Atalho "/" para cair na busca de qualquer lugar da página.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;

      // Quem já está escrevendo em algum campo continua escrevendo uma barra.
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      // Diálogo aberto tem prioridade: a busca está atrás dele.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ------------------------------------------------------- menu de backup -- */

  // Fecha no clique fora e no Escape enquanto o popover estiver aberto.
  useEffect(() => {
    if (!exportOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && exportMenuRef.current?.contains(target)) return;
      setExportOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setExportOpen(false);
      exportButtonRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportOpen]);

  const handleExport = useCallback(
    (format: 'json' | 'csv') => {
      setExportOpen(false);

      const payload = useGameStore.getState().buildBackup();
      const records = Object.keys(payload.progress).length;

      if (records === 0) {
        pushToast('Nada para exportar ainda. Marque seu primeiro "Zerei!".', 'info');
        return;
      }

      if (format === 'json') {
        downloadTextFile(backupFilename('json'), 'application/json', backupToJson(payload));
      } else {
        downloadTextFile(backupFilename('csv'), 'text/csv', backupToCsv(payload, games));
      }

      pushToast(`Backup exportado: ${records} registro(s).`);
    },
    [games, pushToast],
  );

  /* ---------------------------------------------------------- importação -- */

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      // Zerar o valor agora permite escolher o mesmo arquivo de novo depois.
      input.value = '';
      if (!file) return;

      try {
        const result = parseBackupFile(file.name, await file.text());
        if (!result.ok) {
          pushToast(result.error, 'error');
          return;
        }
        setPendingImport({
          payload: result.payload,
          filename: file.name,
          records: Object.keys(result.payload.progress).length,
          customGames: result.payload.customGames.length,
        });
      } catch {
        pushToast('Não foi possível ler esse arquivo. Tente exportar de novo.', 'error');
      }
    },
    [pushToast],
  );

  const applyImport = useCallback(
    (mode: ImportMode) => {
      if (!pendingImport) return;
      const result = importBackup(pendingImport.payload, mode);
      setPendingImport(null);
      pushToast(result.message, result.ok ? 'success' : 'error');
    },
    [importBackup, pendingImport, pushToast],
  );

  /* -------------------------------------------------------- contador vivo -- */

  // `pluralize` devolve "12 jogos zerados"; o número sai fora para ganhar a fonte pixel.
  const phrase = pluralize(beatenCount, 'jogo zerado', 'jogos zerados');
  const beatenNoun = phrase.slice(phrase.indexOf(' ') + 1);

  // O `key={beatenCount}` remonta o badge a cada número novo e a classe `animate-pop`
  // reinicia junto. Guardar o valor anterior em estado (padrão oficial de "ajustar
  // estado quando uma prop muda") segura a animação na primeira pintura e na chegada
  // da hidratação, quando não houve mudança nenhuma para comemorar.
  const [shownCount, setShownCount] = useState<number | null>(null);
  const [popped, setPopped] = useState(false);
  if (hydrated && shownCount !== beatenCount) {
    setPopped(shownCount !== null);
    setShownCount(beatenCount);
  }

  const hasText = text.length > 0;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
    >
      <div className={cn(CONTAINER, 'flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 lg:flex-nowrap lg:gap-4 lg:py-3')}>
        {/* ---------------------------------------------------------- marca -- */}
        <div className="flex w-full min-w-0 items-center gap-2.5 lg:w-auto lg:shrink-0">
          <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-neon/30 bg-neon/10 scanlines">
            <Trophy aria-hidden="true" className="size-5 text-neon" />
          </span>

          <span className="font-display text-sm leading-none whitespace-nowrap sm:text-base">
            <span className="text-neon text-glow">Zerei</span>
            <span className="text-ink-soft">.app</span>
          </span>

          {/* badge ao vivo */}
          <div
            title="Jogos que você já zerou"
            className="ml-auto flex h-8 min-w-0 items-center rounded-xl border border-line bg-panel-2/60 px-2.5"
          >
            {hydrated ? (
              <span
                key={beatenCount}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-ink-soft',
                  popped && 'animate-pop',
                )}
              >
                {/* `font-normal`: a Press Start 2P só tem um peso, o negrito sintético borra. */}
                <b className="shrink-0 font-display font-normal text-neon">{beatenCount}</b>
                <span className="truncate">{beatenNoun}</span>
              </span>
            ) : (
              // Esqueleto no lugar do número: evita piscar "0" e o mismatch de hidratação.
              <span aria-hidden="true" className="h-3.5 w-24 rounded bg-panel-3 animate-shimmer" />
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------- busca -- */}
        {/* No celular a marca ocupa a faixa inteira, então busca e ações caem na de baixo. */}
        <div className="relative min-w-0 flex-1 lg:max-w-2xl">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
          />
          <input
            ref={inputRef}
            type="search"
            value={text}
            onChange={(event) => {
              const value = event.target.value;
              setText(value);
              pushSearch(value);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // Escape aqui não pode subir e fechar outra coisa: o foco é da busca.
              event.preventDefault();
              event.stopPropagation();
              clearSearch(false);
              inputRef.current?.blur();
            }}
            aria-label="Buscar jogos por título ou console"
            placeholder="Buscar por título ou console... (Mega Drive, PS1, fliperama)"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              'h-10 w-full appearance-none rounded-xl border border-line bg-panel-2 pl-9 text-[16px] text-ink outline-none',
              'placeholder:text-ink-dim transition-colors duration-200 hover:border-neon/25 focus:border-neon/50',
              '[&::-webkit-search-cancel-button]:appearance-none',
              hasText ? 'pr-11' : 'pr-3',
            )}
          />
          {hasText ? (
            <button
              type="button"
              onClick={() => clearSearch(true)}
              aria-label="Limpar busca"
              className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-xl text-ink-dim transition-colors duration-200 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        {/* ---------------------------------------------------------- ações -- */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:ml-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStatsOpen(true)}
            aria-label="Ver estatísticas"
            className="text-ink hover:border-cyan/50 hover:text-cyan sm:w-auto sm:px-3"
          >
            <ChartColumn aria-hidden="true" className="size-4" />
            <span className="hidden text-sm sm:inline">Estatísticas</span>
          </Button>

          {/* menu de exportação */}
          <div ref={exportMenuRef} className="relative">
            <Button
              ref={exportButtonRef}
              variant="outline"
              size="icon"
              onClick={() => setExportOpen((open) => !open)}
              aria-label="Exportar backup"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className={cn('sm:w-auto sm:px-3', exportOpen && 'border-neon/50 text-neon')}
            >
              <Download aria-hidden="true" className="size-4" />
              <span className="hidden text-sm sm:inline">Exportar</span>
            </Button>

            {exportOpen ? (
              <div
                role="menu"
                aria-label="Formato do backup"
                className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel-2 p-1 shadow-2xl animate-fade-in"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleExport('json')}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-200 hover:bg-panel-3"
                >
                  <Save aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon" />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">Exportar JSON</span>
                    <span className="block text-xs text-ink-dim">Backup completo, restaura tudo</span>
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleExport('csv')}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-200 hover:bg-panel-3"
                >
                  <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan" />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">Exportar CSV</span>
                    <span className="block text-xs text-ink-dim">Abre direto na planilha</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Importar backup"
            className="sm:w-auto sm:px-3"
          >
            <Upload aria-hidden="true" className="size-4" />
            <span className="hidden text-sm sm:inline">Importar</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            aria-label="Arquivo de backup para importar (JSON ou CSV)"
            className="hidden"
            accept=".json,.csv,application/json,text/csv"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* ------------------------------------------- como aplicar o backup -- */}
      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        labelledBy="import-mode-title"
        className="sm:max-w-md"
      >
        <div className="p-5 sm:p-6">
          <h2 id="import-mode-title" className="font-display text-xs leading-relaxed text-ink sm:text-sm">
            Importar backup
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Encontramos{' '}
            <b className="font-semibold text-ink">
              {pluralize(pendingImport?.records ?? 0, 'registro')}
            </b>{' '}
            no arquivo{' '}
            <span className="break-all text-ink-dim">{pendingImport?.filename}</span>.
            {pendingImport && pendingImport.customGames > 0
              ? ` Também vêm ${pluralize(pendingImport.customGames, 'jogo do catálogo pessoal', 'jogos do catálogo pessoal')}.`
              : ''}
          </p>

          <div className="mt-5 grid gap-2">
            <Button
              variant="outline"
              onClick={() => applyImport('merge')}
              className="h-auto w-full flex-col items-start justify-start gap-1 border-neon/40 px-4 py-3 text-left hover:border-neon hover:text-ink"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">Mesclar com meus dados</span>
                <span className="rounded-md border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[10px] font-medium text-neon">
                  recomendado
                </span>
              </span>
              <span className="text-xs font-normal text-ink-soft">
                Mantém o que já está aqui. Em caso de conflito, vence o registro mais recente.
              </span>
            </Button>

            <Button
              variant="danger"
              onClick={() => applyImport('replace')}
              className="h-auto w-full flex-col items-start justify-start gap-1 px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold">Substituir tudo</span>
              <span className="text-xs font-normal text-danger/80">
                Apaga o progresso atual e deixa só o que está no arquivo.
              </span>
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={() => setPendingImport(null)}
            className="mt-2 w-full"
          >
            Cancelar
          </Button>
        </div>
      </Modal>
    </header>
  );
}
