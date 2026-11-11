import { describe, expect, it } from 'vitest';
import { gerarCsv } from './csv';
import { PAUTAS_TESTE } from './pautas-teste';
import type { Pauta } from './tipos';

const base = PAUTAS_TESTE.find((p) => p.status === 'cobrando');
if (!base) throw new Error('fixture sem pauta em cobrança');

const ORIGEM = new URL('https://lumens.exemplo');
const csvDe = (pautas: Pauta[]) => gerarCsv(pautas, ORIGEM);

const linhas = (csv: string) => csv.slice(1).trimEnd().split('\r\n');

describe('CSV de dados abertos', () => {
  it('começa com BOM e usa ponto e vírgula, para o Excel em português abrir com acentos', () => {
    const csv = csvDe([base]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(linhas(csv)[0]).toBe(
      'pauta;endereco;categoria;bloco;situacao;apoios;meta;criada_em;aprovada_em;meta_batida_em',
    );
  });

  it('uma linha por pauta, com rótulo da situação, datas do dia e "Todo o campus" sem bloco', () => {
    const pauta: Pauta = {
      ...base,
      titulo: 'Iluminação no ponto',
      slug: 'iluminacao',
      bloco_nome: null,
      apoios: 84,
      meta: 300,
      criada_em: '2026-11-02T01:30:00.000Z',
      meta_batida_em: null,
    };

    expect(linhas(csvDe([pauta]))[1]).toBe(
      'Iluminação no ponto;https://lumens.exemplo/p/iluminacao;Infraestrutura;Todo o campus;Cobrando;84;300;2026-11-01;2026-10-01;',
    );
  });

  it('texto com ponto e vírgula, aspas ou quebra de linha vai entre aspas', () => {
    const csv = csvDe([{ ...base, titulo: 'Bebedouro "novo"; já' }]);
    expect(linhas(csv)[1]?.startsWith('"Bebedouro ""novo""; já";')).toBe(true);
  });

  it.each(['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)'])(
    'título que começa como fórmula (%s) vira texto',
    (titulo) => {
      const linha = linhas(csvDe([{ ...base, titulo }]))[1] ?? '';
      expect(linha.replace(/^"/, '').startsWith(`'${titulo.slice(0, 1)}`)).toBe(true);
    },
  );

  it('não leva descrição nem os cursos de quem está por trás da pauta', () => {
    const csv = csvDe([{ ...base, descricao: 'texto livre', cursos_responsaveis: ['Medicina'] }]);
    expect(csv).not.toContain('texto livre');
    expect(csv).not.toContain('Medicina');
  });

  it('o endereço sai absoluto, com a origem do site', () => {
    const linha = linhas(
      gerarCsv([{ ...base, slug: 'bebedouro' }], new URL('https://lumens.app/')),
    )[1];
    expect(linha?.split(';')[1]).toBe('https://lumens.app/p/bebedouro');
  });

  it('sem pautas, só o cabeçalho', () => {
    expect(linhas(csvDe([]))).toHaveLength(1);
  });
});
