import { describe, expect, it } from 'vitest';

import { consoleIdOf, coverUrl } from '@/lib/catalog';

const covers = {
  i: 'https://images.igdb.com/igdb/image/upload/t_cover_big/',
  l: 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/',
  w: 'https://upload.wikimedia.org/wikipedia/',
};

describe('catalog v2', () => {
  it('builds the cover URL from its origin', () => {
    expect(coverUrl(covers, 'i:co1r76')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co1r76.jpg');
    expect(coverUrl(covers, 'l:Last Ninja, The (USA)')).toBe(`${covers.l}Last%20Ninja%2C%20The%20(USA).png`);
    expect(coverUrl(covers, 'w:en/a/ab/Cover.jpg')).toBe('https://upload.wikimedia.org/wikipedia/en/a/ab/Cover.jpg');
  });

  it('an IGDB game with no cover ("i:") and an unknown origin do not become a broken URL', () => {
    expect(coverUrl(covers, 'i:')).toBe('');
    expect(coverUrl(covers, '')).toBe('');
    expect(coverUrl(covers, 'x:algo')).toBe('');
  });

  it('finds the console from the old ID prefix', () => {
    expect(consoleIdOf('snes--chrono-trigger')).toBe('snes');
    expect(consoleIdOf('doesnotexist--game')).toBeUndefined();
    expect(consoleIdOf('g_abc12345')).toBeUndefined();
  });
});
