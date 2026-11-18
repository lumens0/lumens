import { describe, expect, it } from 'vitest';
import { criarLimitadorPorTelefone } from './limite-por-telefone';

const LIMITE = { max: 3, janelaMs: 1000 };

describe('limite de mensagens por pessoa', () => {
  it('aceita até o máximo na janela e recusa o excesso, avisando só na primeira recusa', () => {
    const t = 0;
    const limitador = criarLimitadorPorTelefone(LIMITE, () => t);
    expect([1, 2, 3].map(() => limitador.registrar('ana').permitida)).toEqual([true, true, true]);
    expect(limitador.registrar('ana')).toEqual({ permitida: false, primeiraRecusa: true });
    expect(limitador.registrar('ana')).toEqual({ permitida: false, primeiraRecusa: false });
  });

  it('uma pessoa no limite não atrapalha as outras', () => {
    const limitador = criarLimitadorPorTelefone(LIMITE, () => 0);
    for (let i = 0; i < 10; i++) limitador.registrar('spammer');
    expect(limitador.registrar('beto').permitida).toBe(true);
  });

  it('a recusada também conta: insistir mantém o bloqueio, e o ritmo normal libera', () => {
    let t = 0;
    const limitador = criarLimitadorPorTelefone(LIMITE, () => t);
    for (let i = 0; i < 5; i++) limitador.registrar('ana');
    // Ainda dentro da janela das 5 primeiras: continua bloqueada.
    t = 900;
    expect(limitador.registrar('ana').permitida).toBe(false);
    // Passada a janela, só a mensagem de 900 ms pesa: o ritmo voltou ao normal.
    t = 1500;
    expect(limitador.registrar('ana').permitida).toBe(true);
  });

  it('ritmo humano nunca é recusado', () => {
    let t = 0;
    const limitador = criarLimitadorPorTelefone({ max: 20, janelaMs: 60_000 }, () => t);
    for (let i = 0; i < 100; i++) {
      t += 5000;
      expect(limitador.registrar('ana').permitida).toBe(true);
    }
  });
});
