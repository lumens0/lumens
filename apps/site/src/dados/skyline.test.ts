import { describe, expect, it } from 'vitest';
import {
  abreviar,
  janelaVigente,
  legendaDoSkyline,
  montarSkyline,
  tamanhoDoPredio,
} from './skyline';
import type { Bloco, Pauta, StatusPauta } from './tipos';

const bloco = (slug: string, base = 1000): Bloco => ({
  slug,
  nome: `Bloco ${slug.toUpperCase()}`,
  base_estudantes: base,
});
const BLOCOS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => bloco(s));

let n = 0;
const pauta = (
  blocoSlug: string,
  status: StatusPauta = 'juntando_apoios',
  extra: Partial<Pauta> = {},
): Pauta =>
  ({
    slug: `p-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    status,
    apoios: 1,
    urgente: false,
    bloco_slug: blocoSlug,
    ...extra,
  }) as Pauta;

describe('abreviar', () => {
  it('encurta o nome para caber embaixo do prédio', () => {
    expect(abreviar('Bloco 18')).toBe('B18');
    expect(abreviar('IC')).toBe('IC');
    expect(abreviar('Novo CTEC')).toBe('CTEC');
    expect(abreviar('Biblioteca Central')).toBe('BC');
  });
});

describe('tamanhoDoPredio', () => {
  it('cresce com o número de estudantes, dentro de 2 a 3 colunas e 3 a 6 linhas', () => {
    expect(tamanhoDoPredio(120)).toEqual({ colunas: 2, linhas: 3 });
    expect(tamanhoDoPredio(1200)).toEqual({ colunas: 2, linhas: 4 });
    expect(tamanhoDoPredio(5000)).toEqual({ colunas: 3, linhas: 6 });
    expect(tamanhoDoPredio(99999).linhas).toBe(6);
  });
});

describe('montarSkyline', () => {
  const pautas = [
    ...[1, 2, 3].map(() => pauta('a')),
    ...[1, 2].map(() => pauta('b')),
    pauta('c'),
    pauta('d'),
    pauta('e'),
    pauta('f', 'conquistada'),
  ];

  it('mostra os 5 blocos com mais pautas abertas, do maior para o menor', () => {
    const predios = montarSkyline({ blocos: BLOCOS, pautas, escolhidos: [], status: [] });
    expect(predios.map((p) => p.slug)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('pauta conquistada não conta como aberta no ranque', () => {
    const predios = montarSkyline({ blocos: BLOCOS, pautas, escolhidos: [], status: [] });
    expect(predios.map((p) => p.slug)).not.toContain('f');
  });

  it('bloco escolhido fora dos 5 entra à esquerda e tira o último não escolhido', () => {
    const predios = montarSkyline({ blocos: BLOCOS, pautas, escolhidos: ['f'], status: [] });
    expect(predios.map((p) => p.slug)).toEqual(['f', 'a', 'b', 'c', 'd']);
    expect(predios[0]?.escolhido).toBe(true);
  });

  it('bloco escolhido já visível não muda a ordem e não tira ninguém', () => {
    const predios = montarSkyline({ blocos: BLOCOS, pautas, escolhidos: ['c'], status: [] });
    expect(predios.map((p) => p.slug)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('no máximo três blocos entram à esquerda; os escolhidos nunca saem', () => {
    const predios = montarSkyline({
      blocos: BLOCOS,
      pautas,
      escolhidos: ['a', 'f', 'g'],
      status: [],
    });
    expect(predios).toHaveLength(5);
    expect(predios.slice(0, 3).map((p) => p.slug)).toEqual(['f', 'g', 'a']);
    expect(predios.filter((p) => p.escolhido).map((p) => p.slug)).toEqual(['f', 'g', 'a']);
  });

  it('as janelas mais urgentes ocupam o prédio e o resto vira "+N"', () => {
    // Base 120: 2 colunas × 3 linhas = 6 janelas.
    const pequeno = bloco('z', 120);
    const lote = [
      ...Array.from({ length: 6 }, () => pauta('z')),
      pauta('z', 'descumprida'),
      pauta('z', 'juntando_apoios', { urgente: true, titulo: 'Urgente' }),
    ];
    const [predio] = montarSkyline({
      blocos: [pequeno],
      pautas: lote,
      escolhidos: [],
      status: [],
    });
    expect(predio?.janelas).toHaveLength(6);
    expect(predio?.mais).toBe(2);
    expect(predio?.janelas[0]?.titulo).toBe('Urgente');
    expect(predio?.janelas[1]?.status).toBe('descumprida');
  });

  it('com etapa filtrada, as outras janelas ficam "fora" e a contagem respeita o filtro', () => {
    const lote = [pauta('a', 'cobrando'), pauta('a', 'juntando_apoios')];
    const [predio] = montarSkyline({
      blocos: [bloco('a')],
      pautas: lote,
      escolhidos: [],
      status: ['cobrando'],
    });
    expect(predio?.janelas.filter((j) => j.fora)).toHaveLength(1);
    expect(predio?.pautas).toBe(1);
  });
});

describe('legendaDoSkyline', () => {
  it('sem seleção, convida a tocar numa janela', () => {
    expect(legendaDoSkyline([])).toBe('Cada janela acesa é uma pauta. Toque numa para ver qual.');
  });

  it('cita todos os escolhidos: um com pauta e outros sem', () => {
    expect(
      legendaDoSkyline([
        { nome: 'Bloco A', pautas: 3 },
        { nome: 'Bloco B', pautas: 1 },
        { nome: 'Bloco C', pautas: 0 },
        { nome: 'Bloco D', pautas: 0 },
      ]),
    ).toBe(
      'Blocos escolhidos: Bloco A (3 pautas), Bloco B (1 pauta). Bloco C e Bloco D ainda não têm pautas e aparecem apagados.',
    );
  });

  it('um bloco escolhido sem pauta fala no singular', () => {
    expect(legendaDoSkyline([{ nome: 'Bloco C', pautas: 0 }])).toBe(
      'Bloco C ainda não tem pauta e aparece apagado.',
    );
  });
});

describe('ranking do skyline concorda com "pauta aberta" dos totais', () => {
  it('entregue em parte não é aberta: bloco só com entregas parciais não passa à frente de quem tem pauta aberta', () => {
    const parciais = Array.from({ length: 4 }, () => pauta('a', 'entregue_em_parte'));
    const abertas = [pauta('b', 'cobrando'), pauta('b', 'prometido')];
    const predios = montarSkyline({
      blocos: [bloco('a'), bloco('b')],
      pautas: [...parciais, ...abertas],
      escolhidos: [],
      status: [],
      maximo: 1,
    });
    expect(predios.map((p) => p.slug)).toEqual(['b']);
  });
});

describe('janelaVigente', () => {
  const [predio] = montarSkyline({
    blocos: [bloco('a')],
    pautas: [pauta('a', 'cobrando', { slug: 'p-x' })],
    escolhidos: [],
    status: [],
  });
  if (!predio) throw new Error('sem prédio');
  const janela = predio.janelas[0];
  if (!janela) throw new Error('sem janela');
  const aberta = { predio, janela };

  it('mantém a janela enquanto o prédio e a pauta continuam no skyline', () => {
    expect(janelaVigente(aberta, [predio])).toBe(aberta);
    expect(janelaVigente(null, [predio])).toBeNull();
  });

  it('limpa a janela quando o prédio sai do skyline (outro bloco o substituiu)', () => {
    const outro = montarSkyline({
      blocos: [bloco('z')],
      pautas: [pauta('z', 'cobrando')],
      escolhidos: [],
      status: [],
    });
    expect(janelaVigente(aberta, outro)).toBeNull();
  });

  it('limpa a janela quando a pauta dela saiu do prédio (por exemplo, por outro filtro de etapa)', () => {
    const semAPauta = { ...predio, janelas: [] };
    expect(janelaVigente(aberta, [semAPauta])).toBeNull();
  });
});
