import { describe, expect, it } from 'vitest';
import { agruparEventosIguais, type EventoAgrupavel } from './agrupar-eventos';

const ev = (tipo: string, hora: string, dados = {}, origem = 'agendador'): EventoAgrupavel => ({
  tipo,
  dados,
  origem,
  criadoEm: new Date(`2026-11-15T${hora}Z`),
});

describe('agruparEventosIguais', () => {
  it('junta saídas iguais do mesmo minuto numa linha com a quantidade', () => {
    const grupos = agruparEventosIguais([
      ev('owner_removido', '15:40:01', { papel: 'owner' }),
      ev('owner_removido', '15:40:01', { papel: 'owner' }),
      ev('owner_removido', '15:40:30', { papel: 'owner' }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.quantidade).toBe(3);
  });

  it('papel, origem, minuto ou tipo diferentes mantêm linhas separadas', () => {
    const grupos = agruparEventosIguais([
      ev('owner_removido', '15:40:01', { papel: 'owner' }),
      ev('owner_removido', '15:40:02', { papel: 'co_owner' }),
      ev('owner_removido', '15:40:03', { papel: 'co_owner' }, 'bot'),
      ev('owner_removido', '15:41:00', { papel: 'co_owner' }, 'bot'),
      ev('owner_entrou', '15:41:01', { papel: 'co_owner' }, 'bot'),
    ]);
    expect(grupos.map((g) => g.quantidade)).toEqual([1, 1, 1, 1, 1]);
  });

  it('só junta vizinhos: outro evento no meio separa', () => {
    const grupos = agruparEventosIguais([
      ev('owner_removido', '15:40:01', { papel: 'owner' }),
      ev('pauta_urgente', '15:40:02', { urgente: true }),
      ev('owner_removido', '15:40:03', { papel: 'owner' }),
    ]);
    expect(grupos.map((g) => g.quantidade)).toEqual([1, 1, 1]);
  });

  it('eventos de outro tipo, mesmo idênticos, nunca se juntam (dois relatos aprovados)', () => {
    const grupos = agruparEventosIguais([
      ev('relato_aprovado', '15:40:01', {}, 'curadoria'),
      ev('relato_aprovado', '15:40:02', {}, 'curadoria'),
    ]);
    expect(grupos.map((g) => g.quantidade)).toEqual([1, 1]);
  });

  it('lista vazia dá lista vazia', () => {
    expect(agruparEventosIguais([])).toEqual([]);
  });
});
