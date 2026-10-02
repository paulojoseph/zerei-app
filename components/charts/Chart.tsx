'use client';

import { useId, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

import type { CountStat } from '@/types/game';
import { cn, pluralize } from '@/lib/utils';

/*
 * Gráficos do painel em HTML/CSS puro — sem biblioteca: o painel inteiro
 * custa menos JavaScript que uma lib de gráficos sozinha.
 *
 * Regras (skill de dataviz): uma série = um tom só, validado contra a
 * superfície escura (#19b06a: L 0,66, contraste ≥ 3:1); a marca "acende" no
 * neon da marca ao passar o mouse ou focar; barras ≤ 24 px com ponta
 * arredondada de 4 px e base reta; valor na ponta; tooltip em hover E foco
 * (nunca só no hover); toda informação também existe na visão de tabela.
 * Texto sempre em tons de texto, nunca na cor da série.
 */

const MAX_ROWS = 10;

export interface ChartProps {
  title: string;
  /** Uma frase sobre o que o gráfico mostra (vira descrição acessível). */
  description?: string;
  data: CountStat[];
  /** Base do percentual no tooltip (ex.: total de zerados). */
  total: number;
  /** Rótulo da coluna de categoria na tabela. */
  categoryLabel: string;
  empty: string;
}

/** Top N + "Outros": nunca mais barras do que se consegue ler. */
function foldTail(data: CountStat[], max = MAX_ROWS): CountStat[] {
  if (data.length <= max) return data;
  const head = data.slice(0, max - 1);
  const rest = data.slice(max - 1).reduce((sum, d) => sum + d.count, 0);
  return [...head, { label: 'Outros', count: rest }];
}

const pct = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

function ChartFrame({
  title,
  description,
  table,
  children,
}: {
  title: string;
  description?: string;
  table: ReactNode;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined} className="rounded-2xl border border-line bg-panel-2/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <figcaption>
          <h3 id={`${id}-t`} className="text-sm font-semibold text-ink">
            {title}
          </h3>
          {description && (
            <p id={`${id}-d`} className="mt-0.5 text-xs text-ink-dim">
              {description}
            </p>
          )}
        </figcaption>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 text-xs text-ink-soft transition-colors duration-200 hover:text-ink"
        >
          {asTable ? <BarChart3 className="size-3.5" aria-hidden="true" /> : <Table2 className="size-3.5" aria-hidden="true" />}
          {asTable ? 'Gráfico' : 'Tabela'}
        </button>
      </div>
      {asTable ? table : children}
    </figure>
  );
}

function DataTable({ data, total, categoryLabel }: { data: CountStat[]; total: number; categoryLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-ink-dim">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              {categoryLabel}
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Zerados
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              %
            </th>
          </tr>
        </thead>
        <tbody className="text-ink-soft tabular-nums">
          {data.map((d) => (
            <tr key={d.label} className="border-t border-line-soft">
              <th scope="row" className="py-1.5 pr-3 font-normal text-ink">
                {d.label}
              </th>
              <td className="py-1.5 pr-3 text-right">{d.count}</td>
              <td className="py-1.5 text-right">{pct(d.count, total)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tooltip: valor em destaque, rótulo secundário (o leitor já sabe a série, quer o número). */
function Tip({ count, label, total, className }: { count: number; label: string; total: number; className?: string }) {
  return (
    <span
      role="presentation"
      className={cn(
        'pointer-events-none absolute z-10 hidden rounded-lg border border-line bg-panel-3 px-2 py-1 text-[11px] whitespace-nowrap shadow-xl',
        'group-hover/mark:block group-focus-visible/mark:block',
        className,
      )}
    >
      <strong className="text-ink">{pluralize(count, 'jogo')}</strong>
      <span className="text-ink-dim"> · {pct(count, total)}% · {label}</span>
    </span>
  );
}

const MARK = 'bg-[#19b06a] transition-colors duration-150 group-hover/mark:bg-neon group-focus-visible/mark:bg-neon';

/** Barras horizontais: magnitude entre categorias (gênero, console). */
export function BarList({ title, description, data, total, categoryLabel, empty }: ChartProps) {
  const rows = foldTail(data);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ChartFrame title={title} description={description} table={<DataTable data={rows} total={total} categoryLabel={categoryLabel} />}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-dim">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.label}
              tabIndex={0}
              aria-label={`${row.label}: ${pluralize(row.count, 'jogo')}, ${pct(row.count, total)}%`}
              className="group/mark relative grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-cyan sm:grid-cols-[minmax(0,9rem)_1fr]"
            >
              <span aria-hidden="true" className="truncate text-xs text-ink-soft">
                {row.label}
              </span>
              <span aria-hidden="true" className="relative flex items-center gap-2">
                {/* Base reta à esquerda, ponta arredondada (4 px) no valor. */}
                <span className={cn('h-3.5 rounded-r', MARK)} style={{ width: `${(row.count / max) * 100}%`, minWidth: 4 }} />
                <span className="text-xs font-medium text-ink tabular-nums">{row.count}</span>
                <Tip count={row.count} label={row.label} total={total} className="bottom-full left-0 mb-1" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  );
}

/** Colunas: magnitude em ordem (geração, década, ano). Valor rotulado só no pico. */
export function ColumnChart({ title, description, data, total, categoryLabel, empty }: ChartProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const peak = data.findIndex((d) => d.count === max);
  // Muitos anos: rótulo do eixo a cada N colunas para não encavalar.
  const every = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  return (
    <ChartFrame title={title} description={description} table={<DataTable data={data} total={total} categoryLabel={categoryLabel} />}>
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-dim">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <ul className="flex h-44 min-w-full items-end gap-0.5 border-b border-line pt-6" style={{ minWidth: data.length * 18 }}>
            {data.map((d, i) => (
              <li
                key={d.label}
                tabIndex={0}
                aria-label={`${d.label}: ${pluralize(d.count, 'jogo')}, ${pct(d.count, total)}%`}
                className="group/mark relative flex h-full flex-1 flex-col items-center justify-end outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              >
                {/* Coluna ≤ 24 px, topo arredondado, base reta na linha de base. O
                    rótulo do pico fica POR CIMA (absoluto): dentro do fluxo ele
                    roubaria altura e a coluna rotulada sairia mais baixa. */}
                <span
                  aria-hidden="true"
                  className={cn('relative w-full max-w-6 rounded-t', MARK)}
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: 3 }}
                >
                  {i === peak && (
                    <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-medium text-ink tabular-nums">
                      {d.count}
                    </span>
                  )}
                </span>
                <Tip count={d.count} label={d.label} total={total} className="bottom-full mb-1" />
              </li>
            ))}
          </ul>
          <div aria-hidden="true" className="flex gap-0.5 pt-1.5" style={{ minWidth: data.length * 18 }}>
            {data.map((d, i) => (
              <span key={d.label} className="flex-1 text-center text-[10px] text-ink-dim">
                {i % every === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}
