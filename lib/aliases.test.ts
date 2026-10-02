import { describe, expect, it } from 'vitest';

import { remapProgress as remap, resolveGameId as resolve, type AliasMap } from '@/lib/aliases';

const ALIASES: AliasMap = {
    'nes--rockman-2': 'g_megaman2',
    'g_megaman2': 'g_megaman2x',
    'loop-a': 'loop-b',
    'loop-b': 'loop-a',
    'ps3--gta-v': 'x360--gta-v',
    'ps4--gta-v': 'x360--gta-v',
};
const resolveGameId = (id: string) => resolve(id, ALIASES);
const remapProgress: (p: Parameters<typeof remap>[0]) => ReturnType<typeof remap> = (p) => remap(p, ALIASES);

const entry = (gameId: string, updatedAt: string) => ({ gameId, status: 'beaten' as const, updatedAt });

describe('aliases de ID', () => {
  it('segue a cadeia até o ID atual', () => {
    expect(resolveGameId('nes--rockman-2')).toBe('g_megaman2x');
    expect(resolveGameId('sem-alias')).toBe('sem-alias');
  });

  it('não entra em laço com aliases cíclicos', () => {
    expect(['loop-a', 'loop-b']).toContain(resolveGameId('loop-a'));
  });

  it('reaponta o progresso e corrige o gameId do registro', () => {
    const out = remapProgress({ 'nes--rockman-2': entry('nes--rockman-2', '2026-01-01') });
    expect(out).toEqual({ g_megaman2x: entry('g_megaman2x', '2026-01-01') });
  });

  it('na fusão, vence o registro mais recente', () => {
    const out = remapProgress({
      'nes--rockman-2': entry('nes--rockman-2', '2026-05-01'),
      g_megaman2x: entry('g_megaman2x', '2026-01-01'),
    });
    expect(out.g_megaman2x.updatedAt).toBe('2026-05-01');
    expect(Object.keys(out)).toEqual(['g_megaman2x']);
  });

  it('edições fundidas numa obra: "zerado" vence mesmo sendo mais antigo, e nada se perde', () => {
    const out = remapProgress({
      'ps3--gta-v': { gameId: 'ps3--gta-v', status: 'beaten', rating: 5, notes: 'zerei no PS3', consoleId: 'ps3', updatedAt: '2025-01-01' },
      'ps4--gta-v': { gameId: 'ps4--gta-v', status: 'backlog', notes: 'quero rejogar', consoleId: 'ps4', updatedAt: '2026-05-01' },
    });
    const gta = out['x360--gta-v'];
    expect(gta.status).toBe('beaten');
    expect(gta.rating).toBe(5);
    expect(gta.notes).toContain('zerei no PS3');
    expect(gta.notes).toContain('quero rejogar');
    // O console onde zerou fica registrado para o painel.
    expect(gta.playedOn).toBe('ps3');
  });

  it('devolve o mesmo objeto quando nada muda (não dispara re-render)', () => {
    const progress = { 'snes--chrono-trigger': entry('snes--chrono-trigger', '2026-01-01') };
    expect(remapProgress(progress)).toBe(progress);
  });
});
