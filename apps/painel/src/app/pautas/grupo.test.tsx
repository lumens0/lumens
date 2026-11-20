import type { PautaComRelatosPendentes } from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PedidosPorPauta } from '../pedidos/pedidos';
import { Relatos } from '../relatos/relatos';
import { agruparPorPauta, seloDeQuantidade } from './grupo';

const acao = () => Promise.resolve();

describe('agruparPorPauta', () => {
  it('junta os itens da mesma pauta, na ordem em que cada pauta aparece pela primeira vez', () => {
    const grupos = agruparPorPauta([
      { pautaId: 'b', pautaTitulo: 'Pauta B', n: 1 },
      { pautaId: 'a', pautaTitulo: 'Pauta A', n: 2 },
      { pautaId: 'b', pautaTitulo: 'Pauta B', n: 3 },
    ]);
    expect(grupos.map((g) => [g.pautaId, g.itens.map((i) => i.n)])).toEqual([
      ['b', [1, 3]],
      ['a', [2]],
    ]);
  });

  it('lista vazia dá nenhum grupo', () => {
    expect(agruparPorPauta([])).toEqual([]);
  });

  it('o selo de quantidade usa o singular e o plural', () => {
    expect(seloDeQuantidade(1, 'relato', 'relatos')).toBe('1 relato');
    expect(seloDeQuantidade(3, 'pedido', 'pedidos')).toBe('3 pedidos');
  });
});

describe('Relatos: um bloco por pauta', () => {
  const relato = (id: string) => ({ id, texto: `Texto ${id}`, fotos: [], achados: [] });
  const pautas: PautaComRelatosPendentes[] = [
    {
      id: 'p1',
      titulo: 'Goteira no corredor',
      bloco: 'Bloco 12',
      relatos: [relato('r1'), relato('r2')],
    },
    { id: 'p2', titulo: 'Sem luz na escada', bloco: null, relatos: [relato('r3')] },
  ];
  const html = renderToStaticMarkup(
    <Relatos pautas={pautas} aprovar={acao} recusar={acao} recusarFoto={acao} />,
  );

  it('cada pauta tem o cabeçalho com rótulo, título em link, bloco e o selo de quantidade', () => {
    expect(html.match(/grupoDaPauta/g)).toHaveLength(2);
    expect(html).toContain('<a href="/pautas/p1">Goteira no corredor</a>');
    expect(html).toContain('Bloco 12');
    expect(html).toContain('Campus inteiro');
    expect(html).toContain('>2 relatos<');
    expect(html).toContain('>1 relato<');
  });

  it('cada relato fica no seu quadro, numerado dentro da pauta', () => {
    expect(html).toContain('Relato 1 de 2');
    expect(html).toContain('Relato 2 de 2');
    expect(html).toContain('Relato 1 de 1');
    expect(html.match(/rotuloDoItem/g)).toHaveLength(3);
  });
});

describe('Pedidos: um bloco por pauta', () => {
  const pedido = (id: string, pautaId: string, pautaTitulo: string) => ({
    id,
    pautaId,
    pautaTitulo,
    campo: 'titulo' as const,
    antes: 'Texto publicado',
    depois: 'Texto pedido',
    criadoEm: new Date('2026-11-09T12:00:00.000Z'),
    achados: [],
  });
  const html = renderToStaticMarkup(
    <PedidosPorPauta
      pedidos={[
        pedido('x1', 'p1', 'Goteira no corredor'),
        pedido('x2', 'p2', 'Sem luz na escada'),
        pedido('x3', 'p1', 'Goteira no corredor'),
      ]}
      aprovar={acao}
      recusar={acao}
      voltar="/pedidos"
    />,
  );

  it('agrupa os pedidos da mesma pauta sob um só cabeçalho, com o selo de quantidade', () => {
    expect(html.match(/grupoDaPauta/g)).toHaveLength(2);
    expect(html).toContain('>2 pedidos<');
    expect(html).toContain('>1 pedido<');
    expect(html).toContain('<a href="/pautas/p1">Goteira no corredor</a>');
  });

  it('mostra o publicado e o pedido lado a lado, e mantém Aprovar e Recusar com motivo obrigatório', () => {
    expect(html).toContain('Antes (publicado)');
    expect(html).toContain('Depois (pedido)');
    expect(html.match(/antesDepois/g)).toHaveLength(3);
    expect(html.match(/Aprovar mudança/g)).toHaveLength(3);
    expect(html).toMatch(/<textarea[^>]*name="motivo"[^>]*required/);
  });
});
