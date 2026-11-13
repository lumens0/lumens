import { describe, expect, it } from 'vitest';
import { montarMensagemModelo, ParametrosInvalidosError } from './mensagem-modelo';

const TELEFONE = '5582999990000';

describe('montarMensagemModelo', () => {
  it('meta batida: corpo com título e meta, e o slug no botão "Ver a pauta"', () => {
    const mensagem = montarMensagemModelo(
      {
        tipo: 'meta_batida',
        aviso: 'pauta-1',
        modelo: 'lumens_meta_batida',
        parametros: ['Bebedouro do bloco 12', '120', 'bebedouro-bloco-12'],
      },
      TELEFONE,
    );

    expect(mensagem).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: TELEFONE,
      type: 'template',
      template: {
        name: 'lumens_meta_batida',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Bebedouro do bloco 12' },
              { type: 'text', text: '120' },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: 'bebedouro-bloco-12' }],
          },
        ],
      },
    });
  });

  it('vitória: o card da pauta no cabeçalho, por link, com o status na query string', () => {
    const mensagem = montarMensagemModelo(
      {
        tipo: 'vitoria',
        aviso: 'pauta-1',
        modelo: 'lumens_conquista',
        parametros: ['Bebedouro do bloco 12', 'bebedouro-bloco-12'],
      },
      TELEFONE,
      'https://lumens.exemplo.br',
    );

    expect(mensagem.template.components).toEqual([
      {
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: {
              link: 'https://lumens.exemplo.br/p/bebedouro-bloco-12/card.png?status=conquistada',
            },
          },
        ],
      },
      { type: 'body', parameters: [{ type: 'text', text: 'Bebedouro do bloco 12' }] },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'bebedouro-bloco-12' }],
      },
    ]);
  });

  it('sem imagem no modelo, nenhum cabeçalho', () => {
    const mensagem = montarMensagemModelo(
      {
        tipo: 'recusa',
        aviso: 'pauta-1',
        modelo: 'lumens_pauta_recusada',
        parametros: ['Bebedouro do bloco 12', 'duplicada'],
      },
      TELEFONE,
    );
    expect(mensagem.template.components.map((c) => c.type)).toEqual(['body']);
  });

  it('conferência: os botões de resposta levam o aviso, para saber a que promessa respondem', () => {
    const mensagem = montarMensagemModelo(
      {
        tipo: 'conferencia',
        aviso: 'promessa-7',
        modelo: 'lumens_conferencia',
        parametros: ['Mesas no RU', '20/11/2026', 'abrir 40 lugares', '26/11/2026'],
      },
      TELEFONE,
    );

    expect(mensagem.template.components.slice(1)).toEqual([
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '0',
        parameters: [{ type: 'payload', payload: 'conferencia:promessa-7:0' }],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '1',
        parameters: [{ type: 'payload', payload: 'conferencia:promessa-7:1' }],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '2',
        parameters: [{ type: 'payload', payload: 'conferencia:promessa-7:2' }],
      },
    ]);
  });

  it.each([
    ['parâmetro a menos', 'lumens_meta_batida', ['Bebedouro', '120']],
    ['parâmetro a mais', 'lumens_owner_inativo', ['Bebedouro', '01/10/2026', 'sobra']],
    ['parâmetro vazio', 'lumens_meta_batida', ['Bebedouro', ' ', 'slug']],
    ['modelo que não existe', 'lumens_inventado', ['x']],
  ])('recusa %s', (_caso, modelo, parametros) => {
    expect(() =>
      montarMensagemModelo({ tipo: 'meta_batida', aviso: 'p', modelo, parametros }, TELEFONE),
    ).toThrow(ParametrosInvalidosError);
  });
});
