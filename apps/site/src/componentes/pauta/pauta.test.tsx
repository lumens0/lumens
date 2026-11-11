import type { Caminho, PautaDetalhe } from '@lumens/contratos';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProximaEtapa, RespostaOficial } from './Andamento';
import { CabecalhoPauta } from './CabecalhoPauta';
import { Caminhos, rotuloStatusCaminho } from './Caminhos';
import { ConteudoPauta } from './ConteudoPauta';
import { fixture } from '../../dados/pauta-detalhe-teste';
import { altDaFoto, urlFoto } from './foto';
import { LinhaDoTempo } from './LinhaDoTempo';
import { Relatos } from './Relatos';

const CAMINHO: Caminho = {
  tipo: 'comunidade',
  status: 'aberto',
  protocolo: null,
  prazo: null,
  aberto_em: '2026-02-09T12:00:00.000Z',
  descricao: null,
  pessoas_necessarias: null,
  voluntarios: null,
  executada_em: null,
};

describe('página da pauta: seções', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('cabeçalho mostra título, bloco, categoria e owner só pelo curso', () => {
    const html = renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />);
    expect(html).toContain('<h1');
    expect(html).toContain('Iluminação no entorno do Bloco de Artes');
    expect(html).toContain('seguranca · Bloco de Artes');
    expect(html).toContain('Cobrando');
    expect(html).toContain('Owner · Enfermagem');
    expect(html).toContain('Owner · Jornalismo');
  });

  it('sem bloco, o cabeçalho mostra "Todo o campus", como o card', () => {
    const html = renderToStaticMarkup(
      <CabecalhoPauta pauta={{ ...fixture, bloco_nome: null, bloco_slug: null }} />,
    );
    expect(html).toContain('seguranca · Todo o campus');
  });

  it('"Apoiar" abre o bot com o slug, e some em pauta conquistada', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    vi.stubEnv('NEXT_PUBLIC_FLAG_APOIAR', '1');
    expect(renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />)).toContain(
      'href="https://wa.me/5582999999999?text=apoiar%20iluminacao-no-bloco-de-artes"',
    );
    expect(
      renderToStaticMarkup(<CabecalhoPauta pauta={{ ...fixture, status: 'conquistada' }} />),
    ).not.toContain('wa.me');
    vi.stubEnv('NEXT_PUBLIC_FLAG_APOIAR', '');
    expect(renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />)).not.toContain('wa.me');
  });

  it('"Baixar card" aponta para o PNG da pauta, mesmo sem o bot configurado', () => {
    const html = renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />);
    expect(html).toContain('href="/p/iluminacao-no-bloco-de-artes/card.png"');
    expect(html).toContain('download="lumens-iluminacao-no-bloco-de-artes.png"');
    expect(html).toContain('>Baixar card</a>');
  });

  it('relato mostra texto e curso, sem autor; sem curso, nada no lugar', () => {
    const html = renderToStaticMarkup(<Relatos relatos={fixture.relatos} />);
    expect(html).toContain('A saída das aulas noturnas fica muito escura.');
    expect(html).toContain('Pedagogia');
    expect(html).toContain('Sem curso informado.');
    expect(html).not.toContain('null');
  });

  it('sem URL de foto (T20 pendente), não há <img>', () => {
    expect(urlFoto('relatos/1.jpg')).toBeNull();
    expect(renderToStaticMarkup(<Relatos relatos={fixture.relatos} />)).not.toContain('<img');
  });

  it('com URL de foto, a imagem tem alt tirado do relato', () => {
    const html = renderToStaticMarkup(
      <Relatos relatos={fixture.relatos} urlFoto={(c) => `https://fotos.exemplo/${c}`} />,
    );
    expect(html).toContain('src="https://fotos.exemplo/relatos/1.jpg"');
    expect(html).toContain('alt="Foto do relato: A saída das aulas noturnas fica muito escura."');
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it('alt longo é cortado com reticências', () => {
    const alt = altDaFoto('a'.repeat(300));
    expect(alt.length).toBeLessThan(150);
    expect(alt.endsWith('…')).toBe(true);
  });

  it('linha do tempo preserva a ordem da API, com rótulo e data em Maceió', () => {
    const html = renderToStaticMarkup(<LinhaDoTempo eventos={fixture.linha_do_tempo} />);
    expect(html.indexOf('Pauta aprovada')).toBeLessThan(html.indexOf('Meta de apoios batida'));
    expect(html).toContain('dateTime="2026-02-08T12:00:00.000Z"');
    // 12:00 UTC = 09:00 em Maceió (UTC-3).
    expect(html).toContain('08/02/2026');
    expect(html).toContain('09:00');
  });

  it('tipo fora do catálogo vira texto legível', () => {
    const html = renderToStaticMarkup(
      <LinhaDoTempo eventos={[{ tipo: 'algo_novo', dados: {}, criado_em: fixture.criada_em }]} />,
    );
    expect(html).toContain('algo novo');
  });

  it('estados vazios de relatos e linha do tempo', () => {
    expect(renderToStaticMarkup(<Relatos relatos={[]} />)).toContain(
      'Ainda não tem relato publicado nesta pauta.',
    );
    expect(renderToStaticMarkup(<LinhaDoTempo eventos={[]} />)).toContain(
      'Ainda não tem acontecimento registrado.',
    );
  });

  it('caminhos mostram o tipo e o status escrito, não só cor', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    const html = renderToStaticMarkup(
      <Caminhos
        caminhos={[
          { ...CAMINHO, tipo: 'falabr', protocolo: '2026-123', prazo: '2026-03-10' },
          {
            ...CAMINHO,
            tipo: 'proposta',
            status: 'aberta',
            aberto_em: null,
            descricao: 'Mutirão de pintura',
            pessoas_necessarias: 10,
            voluntarios: 4,
          },
          { ...CAMINHO, tipo: 'proposta', status: 'executada', descricao: 'Já feita' },
        ]}
        slug="faixa"
      />,
    );
    expect(html).toContain('Fala.BR');
    expect(html).toMatch(/<strong class="[^"]*">Em andamento<\/strong>/);
    expect(html).toContain('Protocolo 2026-123');
    expect(html).toContain('Prazo de resposta: 10/03/2026');
    expect(html).toContain('Proposta da comunidade');
    expect(html).toMatch(/<strong class="[^"]*">Juntando voluntários<\/strong>/);
    expect(html).toContain('4 de 10 voluntários');
    // Só a proposta aberta pede voluntário.
    expect(html.match(/\?text=ajudar%20faixa/g)).toHaveLength(1);
  });

  it('status de caminho desconhecido vira texto legível', () => {
    expect(rotuloStatusCaminho('aguardando_reuniao')).toBe('aguardando reuniao');
    expect(
      renderToStaticMarkup(
        <Caminhos caminhos={[{ ...CAMINHO, status: 'aguardando_reuniao' }]} slug="x" />,
      ),
    ).toMatch(/<strong class="[^"]*">aguardando reuniao<\/strong>/);
  });

  it('tem um "Voltar" que, sem histórico, leva para a lista de pautas', () => {
    const html = renderToStaticMarkup(<ConteudoPauta pauta={fixture} />);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>.*Voltar<\/a>/);
  });

  it('sem caminhos, explica que o owner ainda vai escolher', () => {
    const html = renderToStaticMarkup(<ConteudoPauta pauta={{ ...fixture, caminhos: [] }} />);
    expect(html).toContain('Caminhos</h2>');
    expect(html).toContain('O owner ainda vai escolher os caminhos');
  });

  it('próxima etapa mostra o texto da API e o prazo do Fala.BR', () => {
    const pauta = {
      ...fixture,
      proxima_etapa: 'Prazo do Fala.BR em 10/03',
      caminhos: [{ ...CAMINHO, tipo: 'falabr' as const, prazo: '2026-03-10' }],
    };
    const html = renderToStaticMarkup(<ProximaEtapa pauta={pauta} />);
    expect(html).toContain('Próxima etapa</h2>');
    expect(html).toContain('Prazo do Fala.BR em 10/03');
    expect(html).toContain('Prazo de resposta do Fala.BR: 10/03/2026');
  });

  it('conferência aberta aparece com a data de fechamento, e some depois de apurada', () => {
    const aberta = {
      tipo: 'conferencia_aberta',
      dados: { fecha_em: '2026-04-08T12:00:00.000Z' },
      criado_em: '2026-04-01T12:00:00.000Z',
    };
    const comAberta = { ...fixture, linha_do_tempo: [aberta] };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={comAberta} />)).toContain(
      'Conferência aberta até',
    );
    const apurada = {
      tipo: 'conferencia_apurada',
      dados: {},
      criado_em: '2026-04-08T13:00:00.000Z',
    };
    const comApurada = { ...fixture, linha_do_tempo: [aberta, apurada] };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={comApurada} />)).not.toContain(
      'Conferência aberta',
    );
  });

  it('usa o Fala.BR mais recente, mesmo sem prazo, e não o prazo de um anterior', () => {
    const pauta = {
      ...fixture,
      caminhos: [
        { ...CAMINHO, tipo: 'falabr' as const, prazo: '2026-03-10' },
        { ...CAMINHO, tipo: 'falabr' as const, prazo: null, aberto_em: '2026-04-01T12:00:00.000Z' },
      ],
    };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={pauta} />)).not.toContain('10/03/2026');
    expect(renderToStaticMarkup(<RespostaOficial pauta={pauta} />)).toContain(
      'Aguardando resposta, ainda sem prazo definido.',
    );
  });

  it('com resposta oficial depois do Fala.BR, a próxima etapa não mostra o prazo', () => {
    const caminhos = [{ ...CAMINHO, tipo: 'falabr' as const, prazo: '2026-03-10' }];
    const resposta = {
      tipo: 'resposta_oficial_recebida',
      dados: {},
      criado_em: '2026-03-01T15:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <ProximaEtapa pauta={{ ...fixture, caminhos, linha_do_tempo: [resposta] }} />,
    );
    expect(html).not.toContain('Prazo de resposta do Fala.BR');
  });

  it('sem resposta, mostra "aguardando resposta" com o prazo', () => {
    const pauta = {
      ...fixture,
      caminhos: [{ ...CAMINHO, tipo: 'falabr' as const, prazo: '2026-03-10' }],
    };
    expect(renderToStaticMarkup(<RespostaOficial pauta={pauta} />)).toContain(
      'Aguardando resposta. Prazo: 10/03/2026.',
    );
    expect(renderToStaticMarkup(<RespostaOficial pauta={fixture} />)).toContain(
      'Aguardando resposta, ainda sem prazo definido.',
    );
  });

  it('resposta com promessa mostra data, data prometida, resumo e fonte com link', () => {
    const pauta = {
      ...fixture,
      linha_do_tempo: [
        { tipo: 'resposta_oficial_recebida', dados: {}, criado_em: '2026-03-01T15:00:00.000Z' },
        {
          tipo: 'promessa_registrada',
          dados: {
            data_entrega: '2026-05-30',
            resumo: 'A prefeitura troca as luminárias até maio.',
            fonte: 'https://ufal.br/noticia',
          },
          criado_em: '2026-03-02T15:00:00.000Z',
        },
      ],
    };
    const html = renderToStaticMarkup(<RespostaOficial pauta={pauta} />);
    expect(html).not.toContain('Aguardando');
    expect(html).toContain('Recebida em');
    expect(html).toContain('01/03/2026');
    expect(html).toContain('entrega até 30/05/2026');
    expect(html).toContain('A prefeitura troca as luminárias até maio.');
    expect(html).toContain('href="https://ufal.br/noticia"');
  });

  it('fonte sem URL fica como texto, e `javascript:` nunca vira link', () => {
    const comFonte = (fonte: string) => ({
      ...fixture,
      linha_do_tempo: [
        {
          tipo: 'promessa_registrada',
          dados: { data_entrega: '2026-05-30', fonte },
          criado_em: fixture.criada_em,
        },
      ],
    });
    const oficio = renderToStaticMarkup(<RespostaOficial pauta={comFonte('Ofício 12/2026')} />);
    expect(oficio).toContain('Fonte: Ofício 12/2026');
    expect(oficio).not.toContain('<a');
    expect(
      renderToStaticMarkup(<RespostaOficial pauta={comFonte('javascript:alert(1)')} />),
    ).not.toContain('href');
  });

  it('anti-vazamento: campos extras de identidade na resposta não chegam ao HTML', () => {
    const comIdentidade = {
      ...fixture,
      telefone: '+55 82 99999-0000',
      email: 'a@b.com',
      estudante_id: 'f3b2c1d0-0000-0000-0000-000000000000',
      cursos_responsaveis: ['Enfermagem'],
      relatos: fixture.relatos.map((r) => ({
        ...r,
        telefone: '+55 82 99999-0000',
        email: 'a@b.com',
        estudante_id: 'x',
      })),
      linha_do_tempo: fixture.linha_do_tempo.map((e) => ({
        ...e,
        dados: { telefone: '+55 82 99999-0000', email: 'a@b.com' },
      })),
    } as PautaDetalhe;
    const html = renderToStaticMarkup(<ConteudoPauta pauta={comIdentidade} />);
    expect(html).not.toContain('@');
    expect(html).not.toMatch(/\d{4,5}-?\d{4}/);
    expect(html).not.toContain('estudante');
  });
});
