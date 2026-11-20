import { describe, expect, it } from 'vitest';
import exemplo from './blocos-teste.json';
import {
  alternar,
  blocosDaUrl,
  filtrarPautas,
  listaDaUrl,
  statusDaUrl,
  urlDeFiltros,
  urlDosFiltros,
} from './filtros';
import { PAUTAS_TESTE } from './pautas-teste';

const blocos = exemplo.blocos;

describe('urlDosFiltros', () => {
  it('monta a URL de /pautas com os filtros que existem', () => {
    expect(urlDosFiltros('prometido', 'bloco 18')).toBe(
      '/pautas?status=prometido&bloco=bloco%2018',
    );
    expect(urlDosFiltros(undefined, 'bloco-18')).toBe('/pautas?bloco=bloco-18');
    expect(urlDosFiltros('prometido')).toBe('/pautas?status=prometido');
    expect(urlDosFiltros()).toBe('/pautas');
  });
});

describe('listas na URL', () => {
  it('lê vírgulas e parâmetros repetidos, sem vazios nem repetidos', () => {
    expect(listaDaUrl('a,b')).toEqual(['a', 'b']);
    expect(listaDaUrl(['a', 'b,c', 'a'])).toEqual(['a', 'b', 'c']);
    expect(listaDaUrl(' a , ,b,')).toEqual(['a', 'b']);
    expect(listaDaUrl('')).toEqual([]);
    expect(listaDaUrl(undefined)).toEqual([]);
  });

  it('ignora etapa e bloco que não existem, e segue a ordem do caminho e do catálogo', () => {
    expect(statusDaUrl('conquistada,x,cobrando')).toEqual(['cobrando', 'conquistada']);
    expect(statusDaUrl('em_curadoria')).toEqual([]);
    expect(blocosDaUrl(blocos, 'bloco-b,nao-existe,bloco-a').map((b) => b.slug)).toEqual(
      blocos.filter((b) => ['bloco-a', 'bloco-b'].includes(b.slug)).map((b) => b.slug),
    );
    expect(blocosDaUrl(blocos, 'nao-existe')).toEqual([]);
  });

  it('ida e volta: o que sai de urlDeFiltros volta igual por listaDaUrl', () => {
    const url = urlDeFiltros('/pautas', { status: ['cobrando', 'prometido'], bloco: ['a', 'b'] });
    expect(url).toBe('/pautas?status=cobrando,prometido&bloco=a,b');
    const query = new URLSearchParams(url.split('?')[1]);
    expect(listaDaUrl(query.get('status') ?? undefined)).toEqual(['cobrando', 'prometido']);
    expect(listaDaUrl(query.get('bloco') ?? undefined)).toEqual(['a', 'b']);
    expect(urlDeFiltros('/', {})).toBe('/');
  });

  it('alternar liga e desliga sem mexer nos outros', () => {
    expect(alternar(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(alternar(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('filtrarPautas', () => {
  const pautas = [
    { status: 'cobrando', bloco_slug: 'a' },
    { status: 'prometido', bloco_slug: 'a' },
    { status: 'cobrando', bloco_slug: 'b' },
    { status: 'conquistada', bloco_slug: 'c' },
  ] as const;
  const modelo = blocos[0];
  if (!modelo) throw new Error('o exemplo de blocos está vazio');
  const bloco = (slug: string) => ({ ...modelo, slug });

  it('sem filtro, devolve tudo', () => {
    expect(filtrarPautas(pautas, { status: [], blocos: [] })).toHaveLength(4);
  });

  it('"ou" dentro do grupo: duas etapas sem bloco', () => {
    const r = filtrarPautas(pautas, { status: ['cobrando', 'conquistada'], blocos: [] });
    expect(r).toHaveLength(3);
  });

  it('"e" entre grupos: uma etapa e dois blocos', () => {
    const r = filtrarPautas(pautas, { status: ['cobrando'], blocos: [bloco('a'), bloco('b')] });
    expect(r.map((p) => p.bloco_slug)).toEqual(['a', 'b']);
  });

  it('bloco sem pauta resulta em lista vazia', () => {
    expect(filtrarPautas(pautas, { status: [], blocos: [bloco('sem-pauta')] })).toEqual([]);
  });

  it('funciona com as pautas de exemplo do site', () => {
    expect(filtrarPautas(PAUTAS_TESTE, { status: [], blocos: [] })).toHaveLength(
      PAUTAS_TESTE.length,
    );
  });
});
