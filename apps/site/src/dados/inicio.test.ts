import { describe, expect, it } from 'vitest';
import { contextoDosNumeros, numerosDoInicio, pertoDaMeta } from './inicio';
import type { Pauta, StatusPauta } from './tipos';

const pauta = (status: StatusPauta, apoios = 10, meta = 100, titulo: string = status): Pauta =>
  ({ slug: titulo, titulo, status, apoios, meta, urgente: false, bloco_slug: 'a' }) as Pauta;

const conquista = (criada: string, entregue: string | null) => ({
  pauta_slug: 'x',
  titulo: 'x',
  bloco_nome: null,
  conquistada_em: entregue,
  apoios: 1,
  proposta_executada: true,
  criada_em: criada,
});

const semanas = [
  { semana: '2026-11-09', apoios: 4 },
  { semana: '2026-11-16', apoios: 7 },
];

describe('numerosDoInicio', () => {
  const pautas = [
    pauta('juntando_apoios'),
    pauta('juntando_apoios'),
    pauta('cobrando'),
    pauta('prometido'),
    pauta('entregue_em_parte'),
    pauta('descumprida'),
    pauta('conquistada'),
  ];

  it('conta pautas abertas, apoios e "em cobrança" somando as quatro etapas', () => {
    const n = numerosDoInicio({
      pautas,
      campus: pautas,
      semanas,
      conquistas: [],
      recortePorBloco: false,
    });
    expect(n.abertas).toBe(4);
    expect(n.juntandoApoios).toBe(2);
    expect(n.apoios).toBe(70);
    expect(n.emCobranca).toBe(4);
    expect(n.descumpridas).toBe(1);
    expect(n.conquistas).toBe(1);
    expect(n.apoiosNaSemana).toBe(7);
    expect(n.percentualDoCampus).toBeNull();
  });

  it('média de dias até a entrega, ignorando conquista sem data', () => {
    const n = numerosDoInicio({
      pautas,
      campus: pautas,
      semanas,
      conquistas: [
        conquista('2026-10-01T12:00:00Z', '2026-10-11T12:00:00Z'),
        conquista('2026-10-01T12:00:00Z', '2026-10-21T12:00:00Z'),
        conquista('2026-10-01T12:00:00Z', null),
      ],
      recortePorBloco: false,
    });
    expect(n.diasAteEntrega).toBe(15);
  });

  it('com blocos escolhidos, mostra a fatia dos apoios do campus em vez da semana', () => {
    const n = numerosDoInicio({
      pautas: pautas.slice(0, 2),
      campus: pautas,
      semanas,
      conquistas: [],
      recortePorBloco: true,
    });
    expect(n.apoiosNaSemana).toBeNull();
    expect(n.percentualDoCampus).toBe(29);
    expect(contextoDosNumeros(n)[1]).toBe('29% dos apoios do campus');
  });
});

describe('contextoDosNumeros', () => {
  const base = {
    abertas: 0,
    juntandoApoios: 1,
    apoios: 0,
    apoiosNaSemana: 5,
    percentualDoCampus: null,
    emCobranca: 0,
    descumpridas: 0,
    conquistas: 0,
    diasAteEntrega: null,
  };

  it('diz "Nenhuma promessa descumprida" quando zero, e "Ainda nenhuma" sem entrega', () => {
    const [juntando, semana, descumpridas, dias] = contextoDosNumeros(base);
    expect(juntando).toBe('1 juntando apoio');
    expect(semana).toBe('+5 nesta semana');
    expect(descumpridas).toBe('Nenhuma promessa descumprida');
    expect(dias).toBe('Ainda nenhuma');
  });

  it('usa o plural e a média de dias', () => {
    const ctx = contextoDosNumeros({ ...base, descumpridas: 2, diasAteEntrega: 12 });
    expect(ctx[2]).toBe('2 promessas descumpridas');
    expect(ctx[3]).toBe('12 dias em média até a entrega');
  });
});

describe('pertoDaMeta', () => {
  it('traz até 3 pautas juntando apoios, da mais perto da meta para a mais longe', () => {
    const lista = [
      pauta('juntando_apoios', 10, 100, 'a'),
      pauta('juntando_apoios', 90, 100, 'b'),
      pauta('juntando_apoios', 50, 100, 'c'),
      pauta('juntando_apoios', 70, 100, 'd'),
      pauta('cobrando', 99, 100, 'e'),
    ];
    expect(pertoDaMeta(lista).map((p) => p.slug)).toEqual(['b', 'd', 'c']);
  });

  it('ignora pauta sem meta', () => {
    expect(pertoDaMeta([pauta('juntando_apoios', 5, 0)])).toEqual([]);
  });
});
