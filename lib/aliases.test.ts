import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/id-aliases.json', () => ({
  default: { 'nes--rockman-2': 'g_megaman2', 'g_megaman2': 'g_megaman2x', 'loop-a': 'loop-b', 'loop-b': 'loop-a' },
}));

const { remapProgress, resolveGameId } = await import('@/lib/aliases');

const entry = (gameId: string, updatedAt: string) => ({ gameId, status: 'beaten' as const, updatedAt });

describe('ID aliases', () => {
  it('follows the chain up to the current ID', () => {
    expect(resolveGameId('nes--rockman-2')).toBe('g_megaman2x');
    expect(resolveGameId('no-alias')).toBe('no-alias');
  });

  it('does not loop on cyclic aliases', () => {
    expect(['loop-a', 'loop-b']).toContain(resolveGameId('loop-a'));
  });

  it('repoints progress and fixes the record gameId', () => {
    const out = remapProgress({ 'nes--rockman-2': entry('nes--rockman-2', '2026-01-01') });
    expect(out).toEqual({ g_megaman2x: entry('g_megaman2x', '2026-01-01') });
  });

  it('on a merge, the most recent record wins', () => {
    const out = remapProgress({
      'nes--rockman-2': entry('nes--rockman-2', '2026-05-01'),
      g_megaman2x: entry('g_megaman2x', '2026-01-01'),
    });
    expect(out.g_megaman2x.updatedAt).toBe('2026-05-01');
    expect(Object.keys(out)).toEqual(['g_megaman2x']);
  });

  it('returns the same object when nothing changes (no re-render)', () => {
    const progress = { 'snes--chrono-trigger': entry('snes--chrono-trigger', '2026-01-01') };
    expect(remapProgress(progress)).toBe(progress);
  });
});
