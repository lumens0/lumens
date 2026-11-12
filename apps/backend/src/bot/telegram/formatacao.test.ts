import { describe, expect, it } from 'vitest';
import { dividirFormatado, negritoDoWhatsapp } from './formatacao';

describe('negritoDoWhatsapp', () => {
  it('tira os asteriscos e marca o trecho como negrito', () => {
    expect(negritoDoWhatsapp('Responda *menu* para voltar.')).toEqual({
      text: 'Responda menu para voltar.',
      entities: [{ type: 'bold', offset: 9, length: 4 }],
    });
  });

  it('conta a posição em unidades UTF-16: emoji antes do negrito vale 2', () => {
    const { text, entities } = negritoDoWhatsapp('🔒 *Sua privacidade* ✅ e *sair*');

    expect(text).toBe('🔒 Sua privacidade ✅ e sair');
    expect(entities).toEqual([
      { type: 'bold', offset: 3, length: 15 },
      { type: 'bold', offset: 23, length: 4 },
    ]);
    for (const e of entities) {
      expect(['Sua privacidade', 'sair']).toContain(text.slice(e.offset, e.offset + e.length));
    }
  });

  it('emoji dentro do negrito entra no tamanho', () => {
    const { text, entities } = negritoDoWhatsapp('*Pronto ✅*');
    expect(text).toBe('Pronto ✅');
    expect(entities).toEqual([{ type: 'bold', offset: 0, length: 'Pronto ✅'.length }]);
  });

  it('vários negritos na mesma linha e em linhas diferentes', () => {
    const { text, entities } = negritoDoWhatsapp('*a* e *bc*\n*def*');
    expect(text).toBe('a e bc\ndef');
    expect(entities.map((e) => text.slice(e.offset, e.offset + e.length))).toEqual([
      'a',
      'bc',
      'def',
    ]);
  });

  it.each([
    ['asterisco solto', 'nota 5 * 3'],
    ['espaço logo depois do primeiro', 'isso * não* é'],
    ['espaço logo antes do segundo', 'isso *não * é'],
    ['par que cruza a linha', '*começo\nfim*'],
    ['asteriscos colados', 'a ** b'],
    ['um só no fim', 'nota*'],
  ])('%s fica como está', (_caso, texto) => {
    expect(negritoDoWhatsapp(texto)).toEqual({ text: texto, entities: [] });
  });

  it('o título digitado é texto: sem parse_mode, nada além do *…* vira formatação', () => {
    // Limitação conhecida: `*a*` num título também sai em negrito. `_x_`, `<b>` e `[l](u)` não.
    const { text, entities } = negritoDoWhatsapp('A pauta "_x_ <b>y</b> [l](u) *a*"');
    expect(text).toBe('A pauta "_x_ <b>y</b> [l](u) a"');
    expect(entities).toHaveLength(1);
  });
});

describe('dividirFormatado', () => {
  it('recalcula a posição do negrito em cada parte', () => {
    const { text, entities } = negritoDoWhatsapp(`${'x'.repeat(8)}\n*negrito*`);
    const partes = dividirFormatado({ text, entities }, 10);

    expect(partes).toEqual([
      { text: 'xxxxxxxx', entities: [] },
      { text: 'negrito', entities: [{ type: 'bold', offset: 0, length: 7 }] },
    ]);
  });

  it('negrito que cruzaria o corte vira um em cada parte, sem passar de uma para a outra', () => {
    const partes = dividirFormatado(
      { text: 'abcdefghij', entities: [{ type: 'bold', offset: 2, length: 6 }] },
      5,
    );

    expect(partes).toEqual([
      { text: 'abcde', entities: [{ type: 'bold', offset: 2, length: 3 }] },
      { text: 'fghij', entities: [{ type: 'bold', offset: 0, length: 3 }] },
    ]);
    for (const p of partes) {
      for (const e of p.entities) expect(e.offset + e.length).toBeLessThanOrEqual(p.text.length);
    }
  });

  it('não parte emoji ao meio e conta o emoji em UTF-16 no corte', () => {
    const partes = dividirFormatado(
      { text: 'abcd🔒ef', entities: [{ type: 'bold', offset: 4, length: 4 }] },
      5,
    );

    expect(partes.map((p) => p.text)).toEqual(['abcd', '🔒ef']);
    expect(partes[1]?.entities).toEqual([{ type: 'bold', offset: 0, length: 4 }]);
  });
});
