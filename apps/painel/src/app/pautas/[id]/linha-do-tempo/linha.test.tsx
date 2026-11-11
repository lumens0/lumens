import { TIPOS_EVENTO, type EventoDaLinha } from '@lumens/dominio';
import { readdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LinhaDoTempo, detalheDoEvento, rotuloEvento } from './linha';

let n = 0;
const evento = (campos: Partial<EventoDaLinha> = {}): EventoDaLinha => ({
  id: `e${String(++n)}`,
  tipo: 'pauta_criada',
  dados: { status: 'em_curadoria' },
  origem: 'bot',
  publico: false,
  // 09:00 em Maceió (UTC-3).
  criadoEm: new Date('2026-11-09T12:00:00.000Z'),
  ...campos,
});

const tela = (eventos: EventoDaLinha[]) =>
  renderToStaticMarkup(
    <LinhaDoTempo
      pautaId="5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"
      titulo="Bebedouro quebrado no bloco 12"
      eventos={eventos}
    />,
  );

describe('tela da linha do tempo da pauta', () => {
  it('mostra todos os eventos na ordem recebida, com data de Maceió, origem e visibilidade', () => {
    const html = tela([
      evento(),
      evento({
        tipo: 'pauta_aprovada',
        dados: {},
        origem: 'curadoria',
        publico: true,
        criadoEm: new Date('2026-11-10T02:30:00.000Z'),
      }),
    ]);

    expect(html).toContain('Bebedouro quebrado no bloco 12');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html.indexOf('Pauta criada')).toBeGreaterThan(-1);
    expect(html.indexOf('Pauta criada')).toBeLessThan(html.indexOf('Pauta aprovada'));
    expect(html).toContain('dateTime="2026-11-09T12:00:00.000Z"');
    expect(html).toMatch(/09\/11\/2026,? 09:00/);
    // 02:30 UTC do dia 10 ainda é dia 9 em Maceió.
    expect(html).toMatch(/09\/11\/2026,? 23:30/);
    expect(html).toContain('Origem: Bot do WhatsApp');
    expect(html).toContain('Origem: Curadoria');
    expect(html).toContain('Só a curadoria vê');
    expect(html).toContain('Aparece no site');
  });

  it('não oferece nenhuma ação: sem formulário, botão ou campo', () => {
    const html = tela([evento(), evento({ tipo: 'pauta_recusada', dados: {} })]);

    expect(html).not.toMatch(/<(form|button|input|textarea|select)\b/);
    expect(html).toContain('nenhum evento pode ser editado ou apagado');
  });

  it('a pasta da tela não tem ação de servidor nem rota', () => {
    expect(readdirSync(import.meta.dirname).sort()).toEqual([
      'linha.module.css',
      'linha.test.tsx',
      'linha.tsx',
      'page.tsx',
    ]);
  });

  it('pauta sem eventos mostra o aviso em vez de lista vazia', () => {
    const html = tela([]);

    expect(html).toContain('ainda não tem nenhum evento');
    expect(html).not.toContain('<ol');
  });

  it('texto vindo do banco sai escapado', () => {
    const html = tela([
      evento({ tipo: 'protocolo_registrado', dados: { protocolo: '<script>x</script>' } }),
    ]);

    expect(html).not.toContain('<script>');
  });
});

describe('rótulo e detalhe do evento', () => {
  it('todo tipo do catálogo tem rótulo próprio', () => {
    for (const tipo of TIPOS_EVENTO) {
      expect(rotuloEvento(tipo), tipo).not.toBe(tipo.replaceAll('_', ' '));
    }
  });

  it('tipo fora do catálogo vira texto legível e mostra o dados cru', () => {
    expect(rotuloEvento('algo_novo')).toBe('algo novo');
    expect(detalheDoEvento('algo_novo', { x: 1 })).toBe('{"x":1}');
    expect(detalheDoEvento('algo_novo', {})).toBeUndefined();
  });

  it.each([
    [
      'status_alterado',
      { de: 'em_curadoria', para: 'recusada' },
      'De “Esperando decisão da curadoria” para “Recusada”.',
    ],
    ['meta_batida', { meta: 50, apoios: 52 }, '52 apoios, para uma meta de 50.'],
    ['caminho_aberto', { caminho_id: 'c1', tipo: 'falabr' }, 'Caminho: Fala.BR.'],
    [
      'protocolo_registrado',
      { caminho_id: 'c1', protocolo: '23546.01/2026' },
      'Protocolo 23546.01/2026.',
    ],
    [
      'promessa_registrada',
      {
        promessa_id: 'p1',
        data_entrega: '2026-12-01',
        resumo: 'Troca do bebedouro',
        fonte: 'Ofício 12',
      },
      'Troca do bebedouro · Entrega prometida para 01/12/2026 · Fonte: Ofício 12',
    ],
    [
      'conferencia_aberta',
      { promessa_id: 'p1', fecha_em: '2026-12-08T15:00:00.000Z' },
      expect.stringMatching(/^Fecha em 08\/12\/2026,? 12:00\.$/),
    ],
    [
      'conferencia_apurada',
      { promessa_id: 'p1', resultado: 'sem_quorum', total_respostas: 3 },
      'Resultado: sem quórum, com 3 respostas.',
    ],
    ['owner_entrou', { papel: 'owner' }, 'Papel: owner.'],
    ['pauta_criada', { status: 'em_curadoria' }, undefined],
    ['pauta_aprovada', {}, undefined],
  ])('%s', (tipo, dados, esperado) => {
    expect(detalheDoEvento(tipo, dados)).toEqual(esperado);
  });

  it('dados fora do formato esperado não derruba a tela', () => {
    expect(detalheDoEvento('status_alterado', {})).toBe('De “?” para “?”.');
    expect(detalheDoEvento('promessa_registrada', { data_entrega: 5, resumo: null })).toBe(
      '? · Entrega prometida para 5 · Fonte: ?',
    );
    expect(detalheDoEvento('conferencia_aberta', { fecha_em: 'amanhã' })).toBe('Fecha em amanhã.');
  });
});
