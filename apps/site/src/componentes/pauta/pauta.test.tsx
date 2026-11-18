import type { Caminho, PautaDetalhe } from '@lumens/contratos';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProximaEtapa, RespostaOficial } from './Andamento';
import { CabecalhoPauta } from './CabecalhoPauta';
import { Caminhos, rotuloStatusCaminho } from './Caminhos';
import { ConteudoPauta } from './ConteudoPauta';
import { fixture } from '../../dados/pauta-detalhe-teste';
import { altDaFoto, urlFoto } from './foto';
import { LinhaDoTempo, rotuloDoPapel } from './LinhaDoTempo';
import { Relatos } from './Relatos';
import { PlacarDeApoios } from './CabecalhoPauta';
import { STATUS } from '../StatusPill';

const CAMINHO: Caminho = {
  tipo: 'comunidade',
  status: 'aberto',
  protocolo: null,
  prazo: null,
  prorrogado: false,
  aberto_em: '2026-02-09T12:00:00.000Z',
  descricao: null,
  pessoas_necessarias: null,
  voluntarios: null,
  executada_em: null,
};

/** O "hoje" dos testes: antes de todos os prazos de março em diante. */
const AGORA = new Date('2026-03-01T15:00:00.000Z');

const RELATO_COM_FOTO = {
  texto: 'A saída das aulas noturnas fica muito escura.',
  foto_chave: null,
  curso: 'Pedagogia',
  moderado_em: null,
};

describe('página da pauta: seções', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('cabeçalho mostra selo urgente junto do status', () => {
    const html = renderToStaticMarkup(<CabecalhoPauta pauta={{ ...fixture, urgente: true }} />);
    expect(html).toContain('Urgente');
  });

  it('mostra indicação junto ao placar quando a meta foi ajustada e textos dos novos eventos', () => {
    const meta = {
      tipo: 'meta_ajustada',
      dados: { metaAntes: 100, metaDepois: 80, motivo: 'Ajuste excepcional.' },
      criado_em: '2026-03-19T12:00:00.000Z',
    };
    const pauta = { ...fixture, linha_do_tempo: [meta] };
    const html = renderToStaticMarkup(<ConteudoPauta pauta={pauta} />);
    expect(html).toContain('Meta ajustada pela curadoria');
    expect(html).toContain('Meta ajustada pela curadoria de 100 para 80: Ajuste excepcional.');
    const bloco = renderToStaticMarkup(
      <LinhaDoTempo
        eventos={[
          {
            tipo: 'bloco_corrigido',
            dados: { blocoAntes: 'Bloco A', blocoDepois: 'Bloco B' },
            criado_em: '2026-03-19T12:00:00.000Z',
          },
        ]}
      />,
    );
    expect(bloco).toContain('Bloco corrigido pela curadoria: Bloco A → Bloco B');
  });

  it('cabeçalho mostra título, bloco, categoria e responsável só pelo curso', () => {
    const html = renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />);
    expect(html).toContain('<h1');
    expect(html).toContain('Iluminação no entorno do Bloco de Artes');
    expect(html).toContain('Segurança · Bloco de Artes');
    expect(html).toContain('Cobrando');
    expect(html).toContain('Responsável · Enfermagem');
    expect(html).toContain('Responsável · Jornalismo');
  });

  it('sem bloco, o cabeçalho mostra "Todo o campus", como o card', () => {
    const html = renderToStaticMarkup(
      <CabecalhoPauta pauta={{ ...fixture, bloco_nome: null, bloco_slug: null }} />,
    );
    expect(html).toContain('Segurança · Todo o campus');
  });

  it('"Apoiar" abre o bot com o slug, e some em pauta conquistada', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    expect(renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />)).toContain(
      'href="https://wa.me/5582999999999?text=apoiar%20iluminacao-no-bloco-de-artes"',
    );
    expect(
      renderToStaticMarkup(<CabecalhoPauta pauta={{ ...fixture, status: 'conquistada' }} />),
    ).not.toContain('wa.me');
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

  it('a foto do relato aprovado aponta para a rota /fotos do site, com o alt do relato', () => {
    expect(urlFoto('fotos/2026/11/abc-1.jpg')).toBe('/fotos/2026/11/abc-1.jpg');
    const relato = { ...RELATO_COM_FOTO, foto_chave: 'fotos/2026/11/abc-1.jpg' };
    const html = renderToStaticMarkup(<Relatos relatos={[relato]} />);
    expect(html).toContain('src="/fotos/2026/11/abc-1.jpg"');
    expect(html).toContain('alt="Foto do relato: A saída das aulas noturnas fica muito escura."');
  });

  it('chave fora do formato do bot não vira endereço, e relato sem foto não tem <img>', () => {
    for (const chave of [
      'relatos/1.jpg',
      'fotos/../x.jpg',
      'respostas/2026/11/a.pdf',
      '//evil.com/x',
      '',
    ]) {
      expect(urlFoto(chave)).toBeNull();
    }
    const relato = { ...RELATO_COM_FOTO, foto_chave: 'relatos/1.jpg' };
    expect(renderToStaticMarkup(<Relatos relatos={[relato]} />)).not.toContain('<img');
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

  it('entrada e saída de responsável aparecem pelo papel, sem "owner" (SCRUM-345)', () => {
    expect(rotuloDoPapel('owner_removido', { papel: 'owner' })).toBe('Responsável saiu');
    expect(rotuloDoPapel('owner_removido', { papel: 'co_owner' })).toBe('Corresponsável saiu');
    expect(rotuloDoPapel('owner_entrou', { papel: 'co_owner' })).toBe('Novo corresponsável');
    expect(rotuloDoPapel('owner_removido', { papel: 'owner', motivo: 'inatividade' })).toBe(
      'Responsável removido por inatividade',
    );
    expect(rotuloDoPapel('owner_removido', { papel: 'co_owner', motivo: 'inatividade' })).toBe(
      'Corresponsável removido por inatividade',
    );
    expect(rotuloDoPapel('owner_entrou', {})).toBeUndefined();
  });

  it('saídas iguais seguidas viram "N corresponsáveis saíram" (SCRUM-355)', () => {
    const saida = {
      tipo: 'owner_removido',
      dados: { papel: 'co_owner' },
      criado_em: '2026-11-15T18:40:00.000Z',
    };
    const html = renderToStaticMarkup(<LinhaDoTempo eventos={[saida, saida, saida]} />);
    expect(html).toContain('3 corresponsáveis saíram');
    expect(html.match(/<li/g)).toHaveLength(1);
  });

  it('dois relatos aprovados no mesmo minuto continuam em duas linhas', () => {
    const relato = { tipo: 'relato_aprovado', dados: {}, criado_em: '2026-11-15T18:40:00.000Z' };
    const html = renderToStaticMarkup(<LinhaDoTempo eventos={[relato, relato]} />);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html.match(/Relato publicado/g)).toHaveLength(2);
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

  it('cada tipo de caminho traz uma frase que o explica (SCRUM-382)', () => {
    const html = renderToStaticMarkup(
      <Caminhos
        caminhos={[
          { ...CAMINHO, tipo: 'falabr' },
          { ...CAMINHO, tipo: 'comunidade' },
          { ...CAMINHO, tipo: 'representante' },
          { ...CAMINHO, tipo: 'proposta', status: 'aberta' },
        ]}
        slug="x"
      />,
    );
    expect(html).toContain('Canal oficial do governo federal para registrar manifestações.');
    expect(html).toContain('Estudantes resolvendo o problema por conta própria.');
    expect(html).toContain('Alguém que representa os estudantes');
    expect(html).toContain('Precisa de voluntários: toque em Vou ajudar.');
    // O Fala.BR leva à seção do manual, e só ele; o link diz para onde vai.
    expect(html.match(/href="\/manual#fala-br"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Saiba mais sobre o Fala.BR"');
  });

  it('proposta já executada não pede voluntários nem cita o "Vou ajudar"', () => {
    const html = renderToStaticMarkup(
      <Caminhos caminhos={[{ ...CAMINHO, tipo: 'proposta', status: 'executada' }]} slug="x" />,
    );
    expect(html).toContain('Ideia de solução publicada por quem cuida da pauta.');
    expect(html).not.toContain('Vou ajudar');
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
        agora={AGORA}
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

  it('sem caminhos, explica que quem cuida da pauta ainda vai escolher', () => {
    const html = renderToStaticMarkup(<ConteudoPauta pauta={{ ...fixture, caminhos: [] }} />);
    expect(html).toContain('Caminhos</h2>');
    expect(html).toContain('Quem cuida da pauta ainda vai escolher os caminhos');
  });

  it('próxima etapa mostra o texto da API e o prazo do Fala.BR', () => {
    const pauta = {
      ...fixture,
      proxima_etapa: 'Aguardando resposta',
      caminhos: [{ ...CAMINHO, tipo: 'falabr' as const, prazo: '2026-03-10' }],
    };
    const html = renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={AGORA} />);
    expect(html).toContain('Próxima etapa</h2>');
    expect(html).toContain('Aguardando resposta');
    expect(html).toContain('Prazo de resposta do Fala.BR: 10/03/2026');
  });

  it('conferência aberta aparece com a data de fechamento, e some depois de apurada', () => {
    const aberta = {
      tipo: 'conferencia_aberta',
      dados: { fecha_em: '2026-04-08T12:00:00.000Z' },
      criado_em: '2026-04-01T12:00:00.000Z',
    };
    const comAberta = { ...fixture, linha_do_tempo: [aberta] };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={comAberta} agora={AGORA} />)).toContain(
      'Conferência aberta até',
    );
    const apurada = {
      tipo: 'conferencia_apurada',
      dados: {},
      criado_em: '2026-04-08T13:00:00.000Z',
    };
    const comApurada = { ...fixture, linha_do_tempo: [aberta, apurada] };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={comApurada} agora={AGORA} />)).not.toContain(
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
    expect(renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={AGORA} />)).not.toContain(
      '10/03/2026',
    );
    expect(renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={AGORA} />)).toContain(
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
      <ProximaEtapa pauta={{ ...fixture, caminhos, linha_do_tempo: [resposta] }} agora={AGORA} />,
    );
    expect(html).not.toContain('Prazo de resposta do Fala.BR');
  });

  it('sem resposta, mostra "aguardando resposta" com o prazo', () => {
    const pauta = {
      ...fixture,
      caminhos: [{ ...CAMINHO, tipo: 'falabr' as const, prazo: '2026-03-10' }],
    };
    expect(renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={AGORA} />)).toContain(
      'Aguardando resposta. Prazo: 10/03/2026.',
    );
    expect(renderToStaticMarkup(<RespostaOficial pauta={fixture} agora={AGORA} />)).toContain(
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
    const html = renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={AGORA} />);
    expect(html).not.toContain('Aguardando');
    expect(html).toContain('Recebida em');
    expect(html).toContain('01/03/2026');
    expect(html).toContain('entrega até 30/05/2026');
    expect(html).toContain('A prefeitura troca as luminárias até maio.');
    expect(html).toContain('href="https://ufal.br/noticia"');
  });

  it('mostra prazo prorrogado e data prometida remarcada na página', () => {
    const caminho = {
      ...CAMINHO,
      tipo: 'falabr' as const,
      prazo: '2026-12-20',
      prorrogado: true,
    };
    // Formato real de `v_linha_do_tempo`: sem chaves `*_id`.
    const linha_do_tempo = [
      {
        tipo: 'caminho_aberto',
        dados: { tipo: 'falabr' },
        criado_em: fixture.criada_em,
      },
      {
        tipo: 'prazo_prorrogado',
        dados: {
          data_antiga: '2026-12-01',
          data_nova: '2026-12-31',
          motivo: 'Aguardando material',
          fonte: 'Ofício 4',
        },
        criado_em: fixture.criada_em,
      },
      {
        tipo: 'promessa_registrada',
        dados: { data_entrega: '2026-12-10' },
        criado_em: fixture.criada_em,
      },
      {
        tipo: 'promessa_remarcada',
        dados: {
          data_antiga: '2026-12-10',
          data_nova: '2026-12-15',
          motivo: 'Entrega adiada',
          fonte: 'Comunicado',
        },
        criado_em: fixture.criada_em,
      },
    ];
    const pauta = { ...fixture, caminhos: [caminho], linha_do_tempo };
    expect(renderToStaticMarkup(<Caminhos caminhos={[caminho]} slug={fixture.slug} />)).toContain(
      'Prazo prorrogado',
    );
    expect(renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={AGORA} />)).toContain(
      'Prazo do Fala.BR prorrogado.',
    );
    expect(renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={AGORA} />)).toContain(
      'Promessa remarcada',
    );
    const timeline = renderToStaticMarkup(<LinhaDoTempo eventos={linha_do_tempo} />);
    expect(timeline).toContain('Promessa remarcada: 10/12/2026 → 15/12/2026');
    expect(timeline).toContain('Motivo: Entrega adiada. Fonte: Comunicado.');
  });

  it('prorrogação e remarcação antigas não vazam para novo Fala.BR nem para nova promessa', () => {
    const pauta = {
      ...fixture,
      caminhos: [
        {
          ...CAMINHO,
          tipo: 'falabr' as const,
          prazo: '2026-04-30',
          prorrogado: true,
          aberto_em: '2026-03-01T12:00:00.000Z',
        },
        {
          ...CAMINHO,
          tipo: 'falabr' as const,
          prazo: '2026-06-30',
          prorrogado: false,
          aberto_em: '2026-06-01T12:00:00.000Z',
        },
      ],
      linha_do_tempo: [
        {
          tipo: 'prazo_prorrogado',
          dados: { data_antiga: '2026-03-31', data_nova: '2026-04-30' },
          criado_em: '2026-03-20T12:00:00.000Z',
        },
        {
          tipo: 'promessa_registrada',
          dados: { data_entrega: '2026-05-01', resumo: 'Primeira promessa.' },
          criado_em: '2026-04-10T12:00:00.000Z',
        },
        {
          tipo: 'promessa_remarcada',
          dados: { data_antiga: '2026-05-01', data_nova: '2026-05-20' },
          criado_em: '2026-04-25T12:00:00.000Z',
        },
        {
          tipo: 'promessa_registrada',
          dados: { data_entrega: '2026-08-15', resumo: 'Segunda promessa.' },
          criado_em: '2026-06-10T12:00:00.000Z',
        },
      ],
    };
    const proxima = renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={AGORA} />);
    expect(proxima).toContain('Prazo de resposta do Fala.BR: 30/06/2026');
    expect(proxima).not.toContain('Prazo do Fala.BR prorrogado.');

    const resposta = renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={AGORA} />);
    expect(resposta).toContain('Segunda promessa.');
    expect(resposta).toContain('entrega até 15/08/2026');
    expect(resposta).not.toContain('Promessa remarcada');
    expect(resposta).not.toContain('20/05/2026');
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
    const oficio = renderToStaticMarkup(
      <RespostaOficial pauta={comFonte('Ofício 12/2026')} agora={AGORA} />,
    );
    expect(oficio).toContain('Fonte: Ofício 12/2026');
    expect(oficio).not.toContain('<a');
    expect(
      renderToStaticMarkup(
        <RespostaOficial pauta={comFonte('javascript:alert(1)')} agora={AGORA} />,
      ),
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

describe('placar de apoios (SCRUM-349)', () => {
  it.each(
    Object.keys(STATUS).filter(
      (s) => s !== 'em_curadoria' && s !== 'recusada',
    ) as PautaDetalhe['status'][],
  )('a barra de %s tem a cor do status e fica preenchida', (status) => {
    const html = renderToStaticMarkup(<PlacarDeApoios pauta={{ ...fixture, status }} />);
    // A mesma cor que o card da lista passa à barra, no preenchimento.
    expect(html).toContain(`background:${STATUS[status].ponto}`);
    expect(html).toContain('width:100%');
  });

  it('proporcional aos apoios e cheia (sem passar do trilho) acima da meta', () => {
    const meio = renderToStaticMarkup(
      <PlacarDeApoios pauta={{ ...fixture, apoios: 40, meta: 80 }} />,
    );
    expect(meio).toContain('width:50%');
    expect(meio).toContain('aria-valuenow="50"');
    const acima = renderToStaticMarkup(
      <PlacarDeApoios pauta={{ ...fixture, apoios: 84, meta: 80 }} />,
    );
    expect(acima).toContain('width:100%');
    expect(acima).toContain('aria-valuenow="100"');
    expect(acima).toContain('aria-valuetext="84 de 80 apoios"');
  });
});

describe('linha do tempo: mudança de status (SCRUM-353)', () => {
  const T = '2026-03-01T12:00:00.000Z';
  const status = (de: unknown, para: unknown, criado_em = T) => ({
    tipo: 'status_alterado',
    dados: { de, para },
    criado_em,
  });
  const texto = (eventos: PautaDetalhe['linha_do_tempo']) =>
    renderToStaticMarkup(<LinhaDoTempo eventos={eventos} />);

  it('mostra de qual status para qual, com os rótulos que o site usa', () => {
    const html = texto([status('juntando_apoios', 'cobrando')]);
    expect(html).toContain('De Juntando apoios para Cobrando');
    expect(html).not.toContain('Status alterado');
  });

  it('várias mudanças deixam de ter linhas idênticas', () => {
    const html = texto([
      status('juntando_apoios', 'meta_batida', '2026-03-01T12:00:00.000Z'),
      status('meta_batida', 'cobrando', '2026-03-02T12:00:00.000Z'),
      status('cobrando', 'prometido', '2026-03-03T12:00:00.000Z'),
    ]);
    const linhas = [...html.matchAll(/<p class="[^"]*">(De [^<]*)<\/p>/g)].map((m) => m[1]);
    expect(linhas).toEqual([
      'De Juntando apoios para Meta batida',
      'De Meta batida para Cobrando',
      'De Cobrando para Prometido',
    ]);
  });

  it('liga a mudança ao acontecimento do mesmo instante que a explica', () => {
    const html = texto([
      { tipo: 'meta_batida', dados: {}, criado_em: T },
      status('juntando_apoios', 'cobrando'),
    ]);
    expect(html).toContain('De Juntando apoios para Cobrando, porque a meta de apoios foi batida');
    // Evento de outro instante não explica a mudança.
    const outro = texto([
      { tipo: 'meta_batida', dados: {}, criado_em: '2026-02-01T12:00:00.000Z' },
      status('juntando_apoios', 'cobrando'),
    ]);
    expect(outro).not.toContain('porque');
  });

  it('de ou para ausente ou desconhecido não mostra "undefined" nem quebra', () => {
    const html = texto([
      status(undefined, 'cobrando'),
      status('cobrando', undefined),
      status(null, null),
      status('status_novo', 'outro_novo'),
      { tipo: 'status_alterado', dados: {}, criado_em: T },
    ]);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
    expect(html).toContain('Status alterado para Cobrando');
    expect(html).toContain('Status alterado a partir de Cobrando');
    expect(html).toContain('De status novo para outro novo');
  });
});

describe('prazos vencidos e seções coerentes (SCRUM-354)', () => {
  const HOJE = new Date('2026-11-18T15:00:00.000Z');
  const falabr = (extra: Partial<Caminho> = {}): Caminho => ({
    ...CAMINHO,
    tipo: 'falabr',
    prazo: '2026-03-20',
    ...extra,
  });
  const conquistada: PautaDetalhe = {
    ...fixture,
    status: 'conquistada',
    proxima_etapa: null,
    caminhos: [],
    linha_do_tempo: [],
  };

  it('pauta conquistada nunca diz que aguarda resposta nem que não tem caminho escolhido', () => {
    const html = renderToStaticMarkup(<ConteudoPauta pauta={conquistada} agora={HOJE} />);
    expect(html).not.toContain('Aguardando resposta');
    expect(html).not.toContain('ainda vai escolher os caminhos');
    expect(html).not.toContain('Próxima etapa');
    expect(html).not.toContain('O botão abre o');
  });

  it('Fala.BR respondido nunca convive com "Aguardando resposta"', () => {
    const pauta = { ...fixture, caminhos: [falabr({ status: 'respondido', protocolo: 'P-1' })] };
    const resposta = renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={HOJE} />);
    expect(resposta).not.toContain('Aguardando');
    expect(resposta).toContain('O Fala.BR já foi respondido (protocolo P-1).');
    // E o prazo de um Fala.BR respondido não vira "vencido" na próxima etapa nem no caminho.
    const proxima = renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={HOJE} />);
    expect(proxima).not.toContain('Prazo de resposta do Fala.BR');
    expect(
      renderToStaticMarkup(<Caminhos caminhos={pauta.caminhos} slug="x" agora={HOJE} />),
    ).toContain('Prazo de resposta: 20/03/2026');
  });

  it('prazo vencido mostra o ano e "venceu em", na próxima etapa, no caminho e na resposta', () => {
    const pauta = { ...fixture, caminhos: [falabr()] };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={HOJE} />)).toContain(
      'Prazo de resposta do Fala.BR venceu em 20/03/2026',
    );
    expect(
      renderToStaticMarkup(<Caminhos caminhos={pauta.caminhos} slug="x" agora={HOJE} />),
    ).toContain('Prazo de resposta venceu em 20/03/2026');
    expect(renderToStaticMarkup(<RespostaOficial pauta={pauta} agora={HOJE} />)).toContain(
      'Aguardando resposta. Prazo venceu em 20/03/2026.',
    );
  });

  it('não repete o prazo quando o texto da API já o traz', () => {
    const pauta = {
      ...fixture,
      proxima_etapa: 'Prazo do Fala.BR venceu em 20/03/2026',
      caminhos: [falabr()],
    };
    const html = renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={HOJE} />);
    expect(html.match(/20\/03\/2026/g)).toHaveLength(1);
  });

  it('o dia do prazo ainda conta como em dia; o dia seguinte, não', () => {
    const pauta = { ...fixture, caminhos: [falabr({ prazo: '2026-11-18' })] };
    expect(renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={HOJE} />)).toContain(
      'Prazo de resposta do Fala.BR: 18/11/2026',
    );
    const amanha = new Date('2026-11-19T15:00:00.000Z');
    expect(renderToStaticMarkup(<ProximaEtapa pauta={pauta} agora={amanha} />)).toContain(
      'venceu em 18/11/2026',
    );
  });

  it('promessa vencida mostra o ano e que venceu; em pauta conquistada, é a promessa cumprida', () => {
    const linha_do_tempo = [
      {
        tipo: 'promessa_registrada',
        dados: { data_entrega: '2026-04-30' },
        criado_em: '2026-03-02T15:00:00.000Z',
      },
    ];
    const prometido = { ...fixture, status: 'prometido' as const, linha_do_tempo };
    expect(renderToStaticMarkup(<RespostaOficial pauta={prometido} agora={HOJE} />)).toContain(
      'entrega prometida venceu em 30/04/2026',
    );
    const cumprida = { ...prometido, status: 'conquistada' as const };
    const html = renderToStaticMarkup(<RespostaOficial pauta={cumprida} agora={HOJE} />);
    expect(html).toContain('entrega até 30/04/2026');
    expect(html).not.toContain('venceu');
  });

  it('o texto do botão só aparece quando há botão de apoio', () => {
    expect(renderToStaticMarkup(<CabecalhoPauta pauta={fixture} />)).toContain('O botão abre o');
    expect(
      renderToStaticMarkup(<CabecalhoPauta pauta={{ ...fixture, status: 'conquistada' }} />),
    ).not.toContain('O botão abre o');
  });
});

describe('visão de conquista (SCRUM-352)', () => {
  const completa: PautaDetalhe = {
    ...fixture,
    status: 'conquistada',
    proxima_etapa: null,
    criada_em: '2026-02-10T12:00:00.000Z',
    caminhos: [
      {
        ...CAMINHO,
        tipo: 'proposta',
        status: 'executada',
        descricao: 'Mutirão de pintura dos laboratórios',
        executada_em: '2026-04-20T12:00:00.000Z',
      },
    ],
    linha_do_tempo: [
      { tipo: 'pauta_aprovada', dados: {}, criado_em: '2026-02-11T12:00:00.000Z' },
      { tipo: 'resposta_oficial_recebida', dados: {}, criado_em: '2026-03-01T12:00:00.000Z' },
      {
        tipo: 'status_alterado',
        dados: { de: 'cobrando', para: 'conquistada' },
        criado_em: '2026-04-21T12:00:00.000Z',
      },
    ],
  };

  it('mostra o destaque da vitória, a solução entregue e a linha do tempo', () => {
    const html = renderToStaticMarkup(<ConteudoPauta pauta={completa} />);
    expect(html).toContain('A comunidade conquistou esta pauta');
    expect(html).toContain('Conquistada em');
    expect(html).toContain('21/04/2026');
    expect(html).toContain('Da criação à entrega');
    expect(html).toContain('70 dias');
    expect(html).toContain('Solução entregue');
    expect(html).toContain('Solução da comunidade');
    expect(html).toContain('Mutirão de pintura dos laboratórios');
    expect(html).toContain('Executada em');
    expect(html).toContain('20/04/2026');
    expect(html).toContain('Linha do tempo');
    expect(html).toContain('De Cobrando para Conquistada');
    // Sem o convite para apoiar.
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('Próxima etapa');
  });

  it('pauta em outro status continua como estava', () => {
    const html = renderToStaticMarkup(<ConteudoPauta pauta={fixture} />);
    expect(html).not.toContain('conquistou esta pauta');
    expect(html).not.toContain('Solução entregue');
    expect(html).toContain('Próxima etapa');
  });

  it('sem solução, sem relatos e sem evento de conquista: nada de bloco vazio nem "NaN dias"', () => {
    const vazia: PautaDetalhe = { ...completa, caminhos: [], relatos: [], linha_do_tempo: [] };
    const html = renderToStaticMarkup(<ConteudoPauta pauta={vazia} />);
    expect(html).toContain('A comunidade conquistou esta pauta');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Solução entregue');
    expect(html).not.toContain('Conquistada em');
    expect(html).not.toContain('Da criação à entrega');
    expect(html).not.toContain('<dl');
  });

  it('solução sem descrição ou data não mostra "null"', () => {
    const pauta = {
      ...completa,
      caminhos: [{ ...CAMINHO, tipo: 'proposta' as const, status: 'executada' }],
    };
    const html = renderToStaticMarkup(<ConteudoPauta pauta={pauta} />);
    expect(html).toContain('A proposta da comunidade foi executada.');
    expect(html).not.toContain('null');
    expect(html).not.toContain('Executada em');
  });
});
