'use client';

import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};

/*
 * Valores que só existem no navegador (origem do site, folha de
 * compartilhamento nativa). Ler direto no render divergia do HTML do servidor
 * — erro de hidratação que o React NÃO corrige (os links ficavam sem domínio).
 * O snapshot do servidor vale na hidratação; o do cliente, logo depois.
 */
export function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => '');
}

export function useCanShare(): boolean {
  return useSyncExternalStore(noSubscribe, () => typeof navigator.share === 'function', () => false);
}
