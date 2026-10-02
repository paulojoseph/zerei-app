import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/id-aliases.json', () => ({
  default: { 'nes--rockman-2': 'g_megaman2', 'g_megaman2': 'g_megaman2x', 'loop-a': 'loop-b', 'loop-b': 'loop-a' },
}));

const { remapProgress, resolveGameId } = await import('@/lib/aliases');

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

  it('devolve o mesmo objeto quando nada muda (não dispara re-render)', () => {
    const progress = { 'snes--chrono-trigger': entry('snes--chrono-trigger', '2026-01-01') };
    expect(remapProgress(progress)).toBe(progress);
  });
});
