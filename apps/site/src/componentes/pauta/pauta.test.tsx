import type { PautaDetalhe } from '@lumens/contratos';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CabecalhoPauta } from './CabecalhoPauta';
import { ConteudoPauta } from './ConteudoPauta';
import { fixture } from '../../dados/pauta-detalhe-teste';
import { altDaFoto, urlFoto } from './foto';
import { LinhaDoTempo } from './LinhaDoTempo';
import { Relatos } from './Relatos';

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
