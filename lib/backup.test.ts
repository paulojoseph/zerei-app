import { describe, expect, it } from 'vitest';

import { backupToCsv, backupToJson, parseBackupFile } from '@/lib/backup';
import { SEED_GAMES } from '@/lib/games';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupPayload, type UserGameProgress } from '@/types/game';

const [mario, zelda, alex] = SEED_GAMES;

function payload(progress: Record<string, UserGameProgress>): BackupPayload {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-10-02T00:00:00.000Z', progress, customGames: [] };
}

const progress: Record<string, UserGameProgress> = {
  [mario.id]: { gameId: mario.id, status: 'beaten', completedYear: 1994, rating: 5, notes: 'Zerei na locadora, "sem save"; com vírgula', updatedAt: '2026-01-01T00:00:00.000Z' },
  [zelda.id]: { gameId: zelda.id, status: 'playing', updatedAt: '2026-02-01T00:00:00.000Z' },
  [alex.id]: { gameId: alex.id, status: 'backlog', notes: '=HYPERLINK("http://mal.example")', updatedAt: '2026-03-01T00:00:00.000Z' },
};

describe('backup', () => {
  it('JSON: exportar e importar devolve o mesmo progresso', () => {
    const parsed = parseBackupFile('zerei.json', backupToJson(payload(progress)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.payload.progress).toEqual(progress);
  });

  it('CSV: exportar e importar preserva status, ano, nota e anotações (aspas, vírgulas, ;)', () => {
    const parsed = parseBackupFile('zerei.csv', backupToCsv(payload(progress), SEED_GAMES));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const [id, entry] of Object.entries(progress)) {
      const got = parsed.payload.progress[id];
      expect(got.status).toBe(entry.status);
      expect(got.completedYear).toBe(entry.completedYear);
      expect(got.rating).toBe(entry.rating);
      expect(got.notes).toBe(entry.notes);
    }
  });

  it('CSV: célula que começa com "=" não vira fórmula na planilha', () => {
    const csv = backupToCsv(payload(progress), SEED_GAMES);
    expect(csv).not.toMatch(/(^|[,;])"?=HYPERLINK/m);
  });

  it('aceita arquivo com BOM (Excel) e quebras de linha CRLF', () => {
    const csv = backupToCsv(payload(progress), SEED_GAMES).replace(/\n/g, '\r\n');
    const parsed = parseBackupFile('zerei.csv', `﻿${csv}`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.payload.progress).sort()).toEqual(Object.keys(progress).sort());
  });

  it('nunca lança: arquivo vazio, lixo e JSON truncado viram erro legível', () => {
    for (const [name, text] of [['a.json', ''], ['a.json', '{"format":'], ['a.csv', '\u0000\u0001lixo'], ['a.txt', 'oi']]) {
      const parsed = parseBackupFile(name, text);
      if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
    }
  });

  it('ignora chaves perigosas (__proto__) vindas de arquivo adulterado', () => {
    const evil = `{"format":"${BACKUP_FORMAT}","version":1,"exportedAt":"x","customGames":[],"progress":{"__proto__":{"gameId":"__proto__","status":"beaten","updatedAt":"x"}}}`;
    const parsed = parseBackupFile('evil.json', evil);
    expect(({} as Record<string, unknown>).status).toBeUndefined();
    if (parsed.ok) expect(Object.keys(parsed.payload.progress)).not.toContain('__proto__');
  });
});
