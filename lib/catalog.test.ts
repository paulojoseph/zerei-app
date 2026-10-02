import { describe, expect, it } from 'vitest';

import { consoleIdOf, coverUrl } from '@/lib/catalog';

const covers = {
  i: 'https://images.igdb.com/igdb/image/upload/t_cover_big/',
  l: 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/',
  w: 'https://upload.wikimedia.org/wikipedia/',
};

describe('catálogo v2', () => {
  it('monta a URL da capa pela origem', () => {
    expect(coverUrl(covers, 'i:co1r76')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co1r76.jpg');
    expect(coverUrl(covers, 'l:Last Ninja, The (USA)')).toBe(`${covers.l}Last%20Ninja%2C%20The%20(USA).png`);
    expect(coverUrl(covers, 'w:en/a/ab/Capa.jpg')).toBe('https://upload.wikimedia.org/wikipedia/en/a/ab/Capa.jpg');
  });

  it('jogo da IGDB sem capa ("i:") e origem desconhecida não viram URL quebrada', () => {
    expect(coverUrl(covers, 'i:')).toBe('');
    expect(coverUrl(covers, '')).toBe('');
    expect(coverUrl(covers, 'x:algo')).toBe('');
  });

  it('descobre o console pelo prefixo dos IDs antigos', () => {
    expect(consoleIdOf('snes--chrono-trigger')).toBe('snes');
    expect(consoleIdOf('naoexiste--jogo')).toBeUndefined();
    expect(consoleIdOf('g_abc12345')).toBeUndefined();
  });
});
