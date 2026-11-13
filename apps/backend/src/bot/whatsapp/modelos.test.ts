import {
  MODELO_CONFERENCIA,
  MODELO_LEMBRETE_PRAZO,
  MODELO_META_BATIDA,
  MODELO_OWNER_INATIVO,
  MODELO_PAUTA_RECUSADA,
  MODELO_RESPOSTA_OFICIAL,
  MODELO_VITORIA,
} from '@lumens/dominio';
import { describe, expect, it } from 'vitest';
import { MODELOS, paraSubmissao, type ModeloMensagem } from './modelos';

const SITE = 'https://lumens.exemplo.com.br';
const HANDLE = '4::aW1hZ2VtLWRlLWV4ZW1wbG8=';
const modelos = Object.values(MODELOS);

function variaveis(texto: string): number[] {
  return [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
}

describe('MODELOS (RNF04)', () => {
  it('tem os cinco avisos da SCRUM-193, o de recusa da SCRUM-170 e o de vitória da SCRUM-241', () => {
    expect(Object.keys(MODELOS).sort()).toEqual([
      'lumens_conferencia',
      'lumens_conquista',
      'lumens_lembrete_prazo',
      'lumens_meta_batida',
      'lumens_owner_inativo',
      'lumens_pauta_recusada',
      'lumens_resposta_oficial',
    ]);
  });

  it('os nomes que o domínio enfileira são exatamente os do catálogo', () => {
    // O domínio não importa o back-end, então o nome é escrito dos dois lados. Se um deles
    // mudar sozinho, o disparo sai com um modelo que a Meta não conhece.
    expect(
      [
        MODELO_CONFERENCIA,
        MODELO_LEMBRETE_PRAZO,
        MODELO_META_BATIDA,
        MODELO_OWNER_INATIVO,
        MODELO_PAUTA_RECUSADA,
        MODELO_RESPOSTA_OFICIAL,
        MODELO_VITORIA,
      ].sort(),
    ).toEqual(Object.keys(MODELOS).sort());
  });

  it('a chave do catálogo é o nome do modelo', () => {
    for (const [chave, modelo] of Object.entries(MODELOS)) expect(modelo.nome).toBe(chave);
  });

  // As regras abaixo são as que fazem a Meta recusar a submissão. Pegar aqui
  // poupa a ida e volta de uma revisão que pode levar um dia.
  describe.each(modelos.map((m) => [m.nome, m] as const))('%s', (_nome, modelo: ModeloMensagem) => {
    it('nome só com minúsculas, dígitos e sublinhado', () => {
      expect(modelo.nome).toMatch(/^[a-z0-9_]{1,512}$/);
    });

    it('variáveis numeradas em sequência a partir de 1', () => {
      const usadas = [...new Set(variaveis(modelo.corpo))].sort((a, b) => a - b);
      expect(usadas).toEqual(usadas.map((_, i) => i + 1));
    });

    it('um exemplo para cada variável, nenhum vazio', () => {
      expect(modelo.exemplos).toHaveLength(new Set(variaveis(modelo.corpo)).size);
      for (const exemplo of modelo.exemplos) expect(exemplo.trim()).not.toBe('');
    });

    it('corpo não começa nem termina com variável', () => {
      expect(modelo.corpo).not.toMatch(/^\{\{\d+\}\}/);
      expect(modelo.corpo).not.toMatch(/\{\{\d+\}\}[.!?]?$/);
    });

    it('cabe nos limites de tamanho', () => {
      expect(modelo.corpo.length).toBeLessThanOrEqual(1024);
      expect(modelo.rodape.length).toBeLessThanOrEqual(60);
      for (const botao of modelo.botoes) expect(botao.texto.length).toBeLessThanOrEqual(25);
    });

    it('rodapé sem variável', () => {
      expect(variaveis(modelo.rodape)).toEqual([]);
    });

    it('utilitário em pt_BR, com o prefixo do projeto', () => {
      expect(modelo.categoria).toBe('UTILITY');
      expect(modelo.idioma).toBe('pt_BR');
      expect(modelo.nome).toMatch(/^lumens_/);
    });

    it('nenhuma variável colada na outra', () => {
      expect(modelo.corpo).not.toMatch(/\}\}\s*\{\{/);
    });

    it('corpo e exemplos sem tabulação, quebra de linha nem quatro espaços seguidos', () => {
      for (const texto of [modelo.corpo, modelo.rodape, ...modelo.exemplos]) {
        expect(texto).not.toMatch(/[\t\n\r]| {4}/);
      }
    });

    it('sem apelo de campanha: a Meta reclassificaria como marketing', () => {
      expect(modelo.corpo).not.toMatch(/compartilh|divulg|convid|promo|!/i);
    });

    it('botões dentro do que a Meta aceita', () => {
      const textos = modelo.botoes.map((b) => b.texto);
      const tipos = modelo.botoes.map((b) => b.tipo);
      expect(new Set(textos).size).toBe(textos.length);
      for (const texto of textos) expect(texto).not.toMatch(/\{\{|[\t\n\r]/);
      expect(tipos.filter((t) => t === 'QUICK_REPLY').length).toBeLessThanOrEqual(10);
      expect(tipos.filter((t) => t === 'URL').length).toBeLessThanOrEqual(2);
      // Respostas rápidas e links não se misturam: cada tipo fica num bloco só.
      expect(tipos).toEqual([...tipos].sort());
    });
  });

  it('a conferência oferece exatamente as três respostas da RN10', () => {
    expect(MODELOS.lumens_conferencia.botoes.map((b) => b.texto)).toEqual([
      'Sim',
      'Em parte',
      'Não',
    ]);
  });
});

describe('paraSubmissao', () => {
  it('monta o pedido no formato da Graph API', () => {
    expect(paraSubmissao(MODELOS.lumens_resposta_oficial, SITE)).toEqual({
      name: 'lumens_resposta_oficial',
      language: 'pt_BR',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: MODELOS.lumens_resposta_oficial.corpo,
          example: {
            body_text: [
              [
                'Bebedouro quebrado no bloco 12',
                'Pró-Reitoria de Gestão Institucional',
                'a troca do bebedouro do térreo está prevista para 15/12.',
              ],
            ],
          },
        },
        { type: 'FOOTER', text: 'Lumens · pautas estudantis da UFAL' },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Ver a pauta',
              url: 'https://lumens.exemplo.com.br/p/{{1}}',
              example: ['https://lumens.exemplo.com.br/p/bebedouro-quebrado-bloco-12'],
            },
          ],
        },
      ],
    });
  });

  // O que a Meta confere em cada pedido de criação, para os seis modelos.
  describe.each(modelos.map((m) => [m.nome, m] as const))('pedido de %s', (_nome, modelo) => {
    const pedido = paraSubmissao(modelo, SITE, { imagemDeExemplo: HANDLE });

    it('leva nome, idioma e categoria do catálogo', () => {
      expect(pedido).toMatchObject({ name: modelo.nome, language: 'pt_BR', category: 'UTILITY' });
    });

    it('o corpo vai com uma linha de exemplos, um por variável', () => {
      const corpo = pedido.components.find((c) => c.type === 'BODY');
      if (corpo?.type !== 'BODY') throw new Error('o pedido não tem corpo');
      expect(corpo.text).toBe(modelo.corpo);
      expect(corpo.example.body_text).toEqual([[...modelo.exemplos]]);
      expect(corpo.example.body_text[0]).toHaveLength(new Set(variaveis(modelo.corpo)).size);
    });

    it('cabeçalho só com imagem no modelo, e bloco de botões só com botão', () => {
      expect(pedido.components.map((c) => c.type)).toEqual([
        ...(modelo.cabecalho ? ['HEADER'] : []),
        'BODY',
        'FOOTER',
        ...(modelo.botoes.length > 0 ? ['BUTTONS'] : []),
      ]);
    });

    it('link com uma variável só, no fim, e exemplo já resolvido', () => {
      const botoes = pedido.components.flatMap((c) => (c.type === 'BUTTONS' ? c.buttons : []));
      for (const botao of botoes) {
        if (botao.type !== 'URL') continue;
        expect(botao.url).toMatch(/^https:\/\/[^{]+\{\{1\}\}$/);
        expect(botao.example).toHaveLength(1);
        expect(botao.example[0]).toMatch(/^https:\/\/[^{}]+$/);
      }
    });
  });

  it('card de vitória: imagem no cabeçalho com o handle do exemplo, e o link da pauta', () => {
    const { components } = paraSubmissao(MODELOS.lumens_conquista, SITE, {
      imagemDeExemplo: HANDLE,
    });
    expect(components[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: [HANDLE] },
    });
    expect(components.at(-1)).toMatchObject({
      type: 'BUTTONS',
      buttons: [{ type: 'URL', url: 'https://lumens.exemplo.com.br/p/{{1}}' }],
    });
  });

  it('modelo com imagem no cabeçalho não é submetido sem o handle do exemplo', () => {
    expect(() => paraSubmissao(MODELOS.lumens_conquista, SITE)).toThrow(/handle/);
    expect(() => paraSubmissao(MODELOS.lumens_conquista, SITE, { imagemDeExemplo: ' ' })).toThrow(
      RangeError,
    );
  });

  it('respostas rápidas vão só com o texto', () => {
    const { components } = paraSubmissao(MODELOS.lumens_conferencia, SITE);
    expect(components.at(-1)).toEqual({
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sim' },
        { type: 'QUICK_REPLY', text: 'Em parte' },
        { type: 'QUICK_REPLY', text: 'Não' },
      ],
    });
  });

  it.each([
    ['barra no fim', 'https://lumens.exemplo.com.br/'],
    ['com caminho', 'https://lumens.exemplo.com.br/site'],
    ['sem https', 'http://lumens.exemplo.com.br'],
    ['que não é URL', 'lumens.exemplo.com.br'],
  ])('recusa siteUrl %s', (_caso, siteUrl) => {
    expect(() => paraSubmissao(MODELOS.lumens_meta_batida, siteUrl)).toThrow(RangeError);
  });
});
