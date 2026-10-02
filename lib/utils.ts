import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Padrão shadcn: junta classes condicionais e resolve conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Remove acentos e caixa para busca tolerante ("coracao" acha "Coração"). */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}


/** Plural pt-BR simples: pluralize(1, 'jogo') -> '1 jogo'. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Data ISO -> "12 de mar. de 2024". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Data ISO -> "há 3 dias". */
export function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secondsInUnit] of table) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(-Math.trunc(seconds / secondsInUnit), unit);
    }
  }
  return 'agora mesmo';
}

/** Debounce genérico com cancelamento (usado na busca global). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 220) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}

/** Ano atual — evita `new Date()` espalhado pelos componentes. */
export function currentYear(): number {
  return new Date().getFullYear();
}

/** Garante um número dentro de um intervalo. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Faixa horizontal compartilhada por cabeçalho, filtros e conteúdo. Se as três
 * não usarem exatamente a mesma classe, o logo desalinha da primeira coluna de
 * capas em telas largas. A classe vive em `app/globals.css`.
 */
export const CONTAINER = 'app-container';
