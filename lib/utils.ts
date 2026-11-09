import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn pattern: joins conditional classes and resolves Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strips accents and case for forgiving search ("pokemon" finds "Pokémon"). */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}


/** Simple English plural: pluralize(1, 'game') -> '1 game'. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** ISO date -> "Mar 12, 2024". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** ISO date -> "3 days ago". */
export function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
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
  return 'just now';
}

/** Generic debounce with cancel (used by the global search). */
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

/** Current year, so `new Date()` isn't scattered across components. */
export function currentYear(): number {
  return new Date().getFullYear();
}

/** Keeps a number inside a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Horizontal band shared by the header, filters and content. If the three don't
 * use exactly the same class, the logo drifts away from the first cover column
 * on wide screens. The class lives in `app/globals.css`.
 */
export const CONTAINER = 'app-container';
