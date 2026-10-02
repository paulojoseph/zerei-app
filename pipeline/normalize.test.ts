import { describe, expect, it } from 'vitest';

import { matchKeys, normKey } from './normalize.mts';

const same = (a: string, b: string) => matchKeys(a).some((k) => matchKeys(b).includes(k));

describe('casamento de títulos do pipeline', () => {
  it('ignora acento, caixa, artigo e pontuação', () => {
    expect(normKey('The Legend of Zelda: A Link to the Past')).toBe(normKey('Legend of Zelda - A Link to the Past'));
    expect(normKey('Mônica no Castelo do Dragão')).toBe('monicanocastelododragao');
  });

  it('casa romanizações japonesas diferentes', () => {
    expect(same('Ninja Ryuuken Den', 'Ninja Ryukenden')).toBe(true);
    expect(same('Takahashi Meijin no Bouken-jima', 'Takahashi Meijin no Boken-jima')).toBe(true);
  });

  it('remove sufixos de revisão e versão do TOSEC', () => {
    expect(same('Platoon Rev PRG1', 'Platoon')).toBe(true);
    expect(same('Solar Wars v1.5', 'Solar Wars')).toBe(true);
    expect(same('Super Mario Bros. 3 Rev PRG0', 'Super Mario Bros. 3')).toBe(true);
  });

  // Regressão: a redução de vogais dobradas também transformava "ii" em "i",
  // fundindo sequências diferentes e mandando o progresso para o jogo errado.
  it('NUNCA confunde números de sequência', () => {
    expect(same('Final Fantasy II', 'Final Fantasy')).toBe(false);
    expect(same('Final Fantasy II', 'Final Fantasy I')).toBe(false);
    expect(same('Dragon Warrior III', 'Dragon Warrior II')).toBe(false);
    expect(same('Back to the Future Part II', 'Back to the Future Part III')).toBe(false);
    expect(same('The Legend of Heroes: Trails of Cold Steel III', 'The Legend of Heroes: Trails of Cold Steel II')).toBe(false);
  });
});
