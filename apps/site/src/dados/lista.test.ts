import { describe, expect, it } from 'vitest';
import type { BlocoDaFolha } from './folha';
import {
  buscarNasPautas,
  janelaDePaginas,
  ordemDaUrl,
  ordenarPautas,
  paginaDaUrl,
  paginar,
  sugestoesDeBloco,
  urlDaLista,
} from './lista';
import type { Pauta, StatusPauta } from './tipos';

let n = 0;
const pauta = (status: StatusPauta, extra: Partial<Pauta> = {}): Pauta =>
  ({
    slug: `p-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    status,
    apoios: 10,
    urgente: false,
    criada_em: '2026-10-01T10:00:00Z',
    bloco_slug: 'ic',
    bloco_nome: 'Instituto de Computação',
    ...extra,
  }) as Pauta;

const rotulo = (s: StatusPauta) => (s === 'cobrando' ? 'Cobrando' : s);
const siglas = { ic: 'IC', ctec: 'CTEC' };

describe('ordenarPautas', () => {
  const lista = [
    pauta('conquistada', { titulo: 'a' }),
    pauta('juntando_apoios', { titulo: 'b', apoios: 99 }),
    pauta('cobrando', { titulo: 'c' }),
    pauta('descumprida', { titulo: 'd' }),
    pauta('juntando_apoios', { titulo: 'e', urgente: true, apoios: 1 }),
  ];

  it('"o que pede atenção" põe a urgente primeiro e depois segue a etapa', () => {
    expect(ordenarPautas(lista, 'atencao').map((p) => p.titulo)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('"mais apoios" ordena por apoios', () => {
    expect(ordenarPautas(lista, 'apoios')[0]?.titulo).toBe('b');
  });

  it('"mais recentes" ordena pela criação, da mais nova para a mais antiga', () => {
    const datas = [
      pauta('cobrando', { titulo: 'velha', criada_em: '2026-01-01T00:00:00Z' }),
      pauta('cobrando', { titulo: 'nova', criada_em: '2026-11-01T00:00:00Z' }),
    ];
    expect(ordenarPautas(datas, 'recentes').map((p) => p.titulo)).toEqual(['nova', 'velha']);
  });

  it('não muda a lista de entrada', () => {
    const copia = [...lista];
    ordenarPautas(lista, 'apoios');
    expect(lista).toEqual(copia);
  });

  it('ordem desconhecida na URL cai na padrão', () => {
    expect(ordemDaUrl('apoios')).toBe('apoios');
    expect(ordemDaUrl('xyz')).toBe('atencao');
    expect(ordemDaUrl(undefined)).toBe('atencao');
  });
});

describe('buscarNasPautas', () => {
  const lista = [
    pauta('cobrando', { titulo: 'Goteira no corredor' }),
    pauta('juntando_apoios', {
      titulo: 'Iluminação do estacionamento',
      bloco_slug: 'ctec',
      bloco_nome: 'Centro de Tecnologia',
      urgente: true,
    }),
  ];
  const buscar = (texto: string) =>
    buscarNasPautas(lista, texto, siglas, rotulo).map((p) => p.titulo);

  it('acha por título, sem acento e sem diferenciar maiúsculas', () => {
    expect(buscar('ILUMINACAO')).toEqual(['Iluminação do estacionamento']);
  });

  it('acha pelo nome e pela sigla do bloco', () => {
    expect(buscar('tecnologia')).toEqual(['Iluminação do estacionamento']);
    expect(buscar('ctec')).toEqual(['Iluminação do estacionamento']);
  });

  it('acha pela etapa', () => {
    expect(buscar('cobrando')).toEqual(['Goteira no corredor']);
  });

  it('"urgente" acha só as pautas urgentes', () => {
    expect(buscar('urgente')).toEqual(['Iluminação do estacionamento']);
  });

  it('todas as palavras precisam bater', () => {
    expect(buscar('goteira computação')).toEqual(['Goteira no corredor']);
    expect(buscar('goteira tecnologia')).toEqual([]);
  });

  it('busca vazia devolve tudo', () => {
    expect(buscar('  ')).toHaveLength(2);
  });
});

describe('sugestoesDeBloco', () => {
  const blocos: BlocoDaFolha[] = [
    { slug: 'ic', nome: 'Instituto de Computação', sigla: 'IC', pautas: 2 },
    { slug: 'ctec', nome: 'Centro de Tecnologia', sigla: 'CTEC', pautas: 1 },
    ...Array.from({ length: 8 }, (_, i) => ({
      slug: `cn${String(i)}`,
      nome: `Centro ${String(i)}`,
      sigla: `C${String(i)}`,
      pautas: 0,
    })),
  ];

  it('sugere o bloco pelo nome ou pela sigla exata, sem acento', () => {
    expect(sugestoesDeBloco(blocos, 'computacao', []).map((b) => b.slug)).toEqual(['ic']);
    expect(sugestoesDeBloco(blocos, 'CTEC', []).map((b) => b.slug)).toEqual(['ctec']);
  });

  it('no máximo 6, com pelo menos duas letras, e sem os já escolhidos', () => {
    expect(sugestoesDeBloco(blocos, 'centro', [])).toHaveLength(6);
    expect(sugestoesDeBloco(blocos, 'c', [])).toEqual([]);
    expect(sugestoesDeBloco(blocos, 'tecnologia', ['ctec'])).toEqual([]);
  });
});

describe('paginar', () => {
  const dez = Array.from({ length: 10 }, (_, i) => i);

  it('8 por página: 10 pautas dão 2 páginas, e a segunda mostra 9 a 10 de 10', () => {
    const p1 = paginar(dez, 1);
    expect(p1.itens).toHaveLength(8);
    expect(p1.paginas).toBe(2);
    expect([p1.de, p1.ate, p1.total]).toEqual([1, 8, 10]);
    const p2 = paginar(dez, 2);
    expect(p2.itens).toEqual([8, 9]);
    expect([p2.de, p2.ate]).toEqual([9, 10]);
  });

  it('página fora da faixa cai na última (ou na primeira)', () => {
    expect(paginar(dez, 99).pagina).toBe(2);
    expect(paginar(dez, 0).pagina).toBe(1);
  });

  it('lista vazia tem uma página e "0 a 0"', () => {
    const vazia = paginar([], 1);
    expect([vazia.pagina, vazia.paginas, vazia.de, vazia.ate]).toEqual([1, 1, 0, 0]);
  });

  it('lê a página da URL, ignorando o que não é inteiro positivo', () => {
    expect(paginaDaUrl('3')).toBe(3);
    expect(paginaDaUrl('0')).toBe(1);
    expect(paginaDaUrl('-2')).toBe(1);
    expect(paginaDaUrl('1.5')).toBe(1);
    expect(paginaDaUrl('abc')).toBe(1);
    expect(paginaDaUrl(undefined)).toBe(1);
  });
});

describe('urlDaLista', () => {
  it('tira o que é padrão: ordem "atenção" e página 1', () => {
    expect(urlDaLista({})).toBe('/pautas');
    expect(urlDaLista({ ordem: 'atencao', pagina: 1 })).toBe('/pautas');
  });

  it('junta busca, ordem, filtros e página', () => {
    expect(
      urlDaLista({
        q: ' goteira ',
        ordem: 'apoios',
        status: ['cobrando'],
        bloco: ['ic', 'ctec'],
        pagina: 2,
      }),
    ).toBe('/pautas?status=cobrando&bloco=ic,ctec&q=goteira&ordem=apoios&pagina=2');
  });

  it('só a busca também funciona', () => {
    expect(urlDaLista({ q: 'bloco 18' })).toBe('/pautas?q=bloco+18');
  });
});

describe('janelaDePaginas', () => {
  it('mostra todos os números até 7 páginas', () => {
    expect(janelaDePaginas(1, 1)).toEqual([1]);
    expect(janelaDePaginas(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('acima de 7, mantém a primeira, a última e a vizinhança, com reticências onde pula', () => {
    expect(janelaDePaginas(1, 20)).toEqual([1, 2, '…', 20]);
    expect(janelaDePaginas(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(janelaDePaginas(20, 20)).toEqual([1, '…', 19, 20]);
    expect(janelaDePaginas(3, 9)).toEqual([1, 2, 3, 4, '…', 9]);
  });
});
