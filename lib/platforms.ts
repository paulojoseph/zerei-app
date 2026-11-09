import type { GameStatus, PlatformCategory, StatusFilter } from '@/types/game';
import { normalize } from '@/lib/utils';
import { consoleByName } from '@/lib/consoles';

/* -------------------------------------------------------------------------- */
/*  Generations                                                                */
/* -------------------------------------------------------------------------- */

export interface CategoryMeta {
  id: PlatformCategory;
  /** Short label used in the tabs. */
  tabLabel: string;
  /** Full label used in titles and stats. */
  label: string;
  /** Example consoles, shown as subtitle/tooltip. */
  examples: string;
  /** Generation accent hex (used in badges, bars and borders). */
  color: string;
}

export const CATEGORY_ORDER: PlatformCategory[] = [
  '8-bit',
  '16-bit',
  '32/64-bit',
  '128-bit',
  'modern',
];

export const CATEGORY_META: Record<PlatformCategory, CategoryMeta> = {
  '8-bit': {
    id: '8-bit',
    tabLabel: '8-Bit',
    label: '8-Bit Era',
    examples: 'Phantom System/NES, Master System, Atari, MSX',
    color: '#f59e0b',
  },
  '16-bit': {
    id: '16-bit',
    tabLabel: '16-Bit',
    label: '16-Bit Era',
    examples: 'Mega Drive, Super Nintendo, Amiga',
    color: '#22d3ee',
  },
  '32/64-bit': {
    id: '32/64-bit',
    tabLabel: '32/64-Bit & Arcades',
    label: '32/64-Bit & Arcade Era',
    examples: 'PlayStation, Saturn, Nintendo 64, Neo Geo, Arcades',
    color: '#a78bfa',
  },
  '128-bit': {
    id: '128-bit',
    tabLabel: '128-Bit & 2000s',
    label: '128-Bit & 2000s Era',
    examples: 'PlayStation 2, Xbox, GameCube, Dreamcast, GBA, Classic PC',
    color: '#fb7185',
  },
  modern: {
    id: 'modern',
    tabLabel: 'Modern',
    label: 'Modern Era',
    examples: 'PS3/PS4/PS5, Xbox One/Series, Switch, Modern PC',
    color: '#39ff9e',
  },
};

export function categoryMeta(category: PlatformCategory): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.modern;
}

/* -------------------------------------------------------------------------- */
/*  Status                                                                     */
/* -------------------------------------------------------------------------- */

export interface StatusMeta {
  id: GameStatus;
  /** Short label (filter chips and menus). */
  label: string;
  /** Full sentence used in the modal. */
  longLabel: string;
  color: string;
  /** Utility classes spelled out (Tailwind doesn't allow dynamic classes). */
  chipClass: string;
  dotClass: string;
}

export const STATUS_ORDER: GameStatus[] = ['beaten', 'playing', 'backlog', 'unplayed'];

export const STATUS_META: Record<GameStatus, StatusMeta> = {
  beaten: {
    id: 'beaten',
    label: 'Beat it!',
    longLabel: 'I beat this game',
    color: '#39ff9e',
    chipClass: 'border-neon/60 bg-neon/15 text-neon',
    dotClass: 'bg-neon',
  },
  playing: {
    id: 'playing',
    label: 'Playing',
    longLabel: "I'm playing it now",
    color: '#22d3ee',
    chipClass: 'border-cyan/60 bg-cyan/15 text-cyan',
    dotClass: 'bg-cyan',
  },
  backlog: {
    id: 'backlog',
    label: 'Want to play',
    longLabel: "It's in my backlog",
    color: '#fbbf24',
    chipClass: 'border-gold/60 bg-gold/15 text-gold',
    dotClass: 'bg-gold',
  },
  unplayed: {
    id: 'unplayed',
    label: 'Not played',
    longLabel: "I haven't played it yet",
    color: '#6f6f7d',
    chipClass: 'border-line bg-panel-3 text-ink-soft',
    dotClass: 'bg-ink-dim',
  },
};

/** Labels for the status filter chips (includes "All"). */
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  beaten: 'Beaten',
  playing: 'Playing',
  backlog: 'Backlog',
  unplayed: 'Not played',
};


/* -------------------------------------------------------------------------- */
/*  Platforms                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Abbreviation shown on the card badge. The key is the canonical name used in the seed.
 */
export const PLATFORM_SHORT: Record<string, string> = {
  'Phantom System / NES': 'NES',
  'Nintendo Entertainment System': 'NES',
  'Master System': 'SMS',
  'Mega Drive': 'MD',
  'Super Nintendo': 'SNES',
  'Neo Geo': 'NEO',
  'Arcade': 'ARC',
  'Atari 2600': '2600',
  'MSX': 'MSX',
  'Amiga': 'AMI',
  'PlayStation': 'PS1',
  'PlayStation 2': 'PS2',
  'PlayStation 3': 'PS3',
  'PlayStation 4': 'PS4',
  'PlayStation 5': 'PS5',
  'Sega Saturn': 'SAT',
  'Nintendo 64': 'N64',
  'Dreamcast': 'DC',
  'GameCube': 'NGC',
  'Game Boy Advance': 'GBA',
  'Game Boy': 'GB',
  'Nintendo DS': 'NDS',
  'Nintendo Switch': 'NSW',
  'Xbox': 'XBOX',
  'Xbox 360': 'X360',
  'Xbox One': 'XONE',
  'Xbox Series X|S': 'XSX',
  'PC': 'PC',
  'PC (MS-DOS)': 'DOS',
  'PSP': 'PSP',
  'Mega Drive / Master System': 'SEGA',
};

export function platformShort(platform: string): string {
  const known = consoleByName(platform);
  if (known) return known.short;
  if (PLATFORM_SHORT[platform]) return PLATFORM_SHORT[platform];
  const trimmed = platform.trim();
  if (trimmed.length <= 5) return trimmed.toUpperCase();
  return trimmed
    .split(/[\s/]+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

/**
 * Keywords per platform so the global search accepts nicknames:
 * "megadrive", "genesis", "snes", "playstation 1", "arcade"... Brazilian
 * Portuguese nicknames ("nintendinho", "fliperama", "computador") stay on
 * purpose, because that's how the core audience searches.
 */
const PLATFORM_ALIASES: Record<string, string[]> = {
  'Phantom System / NES': ['nes', 'phantom', 'phantom system', 'nintendinho', 'famicom', '8 bits', 'turbo game', 'dynavision'],
  'Master System': ['master system', 'sms', 'tectoy', 'tec toy', 'sega'],
  'Mega Drive': ['mega drive', 'megadrive', 'genesis', 'sega', 'tectoy', 'tec toy'],
  'Super Nintendo': ['snes', 'super nintendo', 'super nes', 'super famicom'],
  'Neo Geo': ['neo geo', 'neogeo', 'snk', 'fliperama', 'arcade', 'mvs'],
  Arcade: ['arcade', 'fliperama', 'fliperamas', 'moeda'],
  'Atari 2600': ['atari', '2600', 'polyvox'],
  MSX: ['msx', 'expert', 'gradiente', 'hotbit'],
  Amiga: ['amiga', 'commodore'],
  PlayStation: ['ps1', 'psx', 'playstation 1', 'playstation one', 'psone', 'sony'],
  'PlayStation 2': ['ps2', 'playstation 2', 'sony'],
  'PlayStation 3': ['ps3', 'playstation 3', 'sony'],
  'PlayStation 4': ['ps4', 'playstation 4', 'sony'],
  'PlayStation 5': ['ps5', 'playstation 5', 'sony'],
  'Sega Saturn': ['saturn', 'sega saturn', 'sega'],
  'Nintendo 64': ['n64', 'nintendo 64'],
  Dreamcast: ['dreamcast', 'dc', 'sega'],
  GameCube: ['gamecube', 'ngc', 'game cube'],
  'Game Boy Advance': ['gba', 'game boy advance', 'advance'],
  'Game Boy': ['game boy', 'gameboy', 'gb'],
  'Nintendo DS': ['nds', 'nintendo ds', 'ds'],
  'Nintendo Switch': ['switch', 'nintendo switch', 'nsw'],
  Xbox: ['xbox', 'xbox classic', 'microsoft'],
  'Xbox 360': ['xbox 360', 'x360', '360', 'microsoft'],
  'Xbox One': ['xbox one', 'xone', 'microsoft'],
  'Xbox Series X|S': ['xbox series', 'series x', 'series s', 'xsx', 'microsoft'],
  PC: ['pc', 'computador', 'steam', 'windows'],
  'PC (MS-DOS)': ['dos', 'ms-dos', 'pc', 'computador'],
  PSP: ['psp', 'playstation portable'],
  'Game Boy Color': ['gbc', 'game boy color', 'gameboy color', 'game boy'],
  'Game Gear': ['game gear', 'gamegear', 'gg', 'sega', 'tectoy', 'tec toy'],
  'PC Engine / TurboGrafx-16': ['pc engine', 'turbografx', 'tg16', 'pce', 'nec'],
  'Sega CD': ['sega cd', 'mega cd', 'mega-cd', 'sega'],
  '32X': ['32x', 'sega 32x', 'mega 32x', 'sega'],
  Wii: ['wii', 'nintendo wii'],
  'Wii U': ['wii u', 'wiiu', 'nintendo'],
  'Nintendo 3DS': ['3ds', 'nintendo 3ds'],
  'PS Vita': ['vita', 'ps vita', 'playstation vita', 'sony'],
  'Nintendo Switch 2': ['switch 2', 'nintendo switch 2', 'ns2'],
};

/** Searchable text for a platform (name + nicknames + abbreviation). */
export function platformSearchTerms(platform: string): string {
  const aliases = PLATFORM_ALIASES[platform] ?? [];
  return normalize([platform, platformShort(platform), ...aliases].join(' '));
}

/** Works out the generation from the platform name (used by the IGDB import). */
export function inferCategory(platform: string): PlatformCategory {
  const p = normalize(platform);
  const has = (...needles: string[]) => needles.some((n) => p.includes(n));

  if (has('nes', 'famicom', 'phantom', 'master system', 'atari', 'msx', 'colecovision', 'odyssey', 'game boy color', 'game gear'))
    return '8-bit';
  if (has('mega drive', 'megadrive', 'genesis', 'snes', 'super nintendo', 'super famicom', 'amiga', 'turbografx', 'pc engine'))
    return '16-bit';
  if (has('playstation 1', 'playstation one', 'psx', 'ps1', 'saturn', 'nintendo 64', 'n64', 'neo geo', 'arcade', 'fliperama', 'jaguar', '3do'))
    return '32/64-bit';
  if (has('playstation 2', 'ps2', 'dreamcast', 'gamecube', 'game boy advance', 'gba', 'ms-dos', 'dos', 'nintendo ds', 'psp'))
    return '128-bit';
  if (has('playstation 3', 'playstation 4', 'playstation 5', 'ps3', 'ps4', 'ps5', 'xbox 360', 'xbox one', 'xbox series', 'switch', 'wii', 'steam deck'))
    return 'modern';
  // Plain "PlayStation" and plain "Xbox" land here, so break the tie explicitly.
  if (p === 'playstation') return '32/64-bit';
  if (p === 'xbox') return '128-bit';
  if (has('pc', 'windows', 'linux', 'mac')) return 'modern';
  return 'modern';
}
