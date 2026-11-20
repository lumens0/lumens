import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PredioDoSkyline } from '../dados/skyline';
import type { Pauta, StatusPauta } from '../dados/tipos';
import { Cabecalho } from './Cabecalho';
import { AcaoDoInicio, NumerosDoCampus, PertoDaMetaSecao } from './inicio/Secoes';
import { BlocosFiltraveis, EtapasFiltraveis } from './inicio/FiltrosDoInicio';
import { nomeDaJanela, posicoesDasJanelas, Skyline } from './inicio/Skyline';
import { LinhaDePauta } from './lista/LinhaDePauta';
import { Voltar } from './pauta/Voltar';

// O roteador do Next não existe fora do app: aqui só o que a tela desenha importa.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/pautas',
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

let n = 0;
const pauta = (status: StatusPauta, extra: Partial<Pauta> = {}): Pauta =>
  ({
    slug: `pauta-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    descricao: 'Descrição da pauta.',
    categoria: 'infraestrutura',
    status,
    urgente: false,
    apoios: 40,
    meta: 100,
    bloco_slug: 'ic',
    bloco_nome: 'Instituto de Computação',
    criada_em: '2026-11-01T12:00:00.000Z',
    ...extra,
  }) as Pauta;

describe('Cabecalho', () => {
  it('tem a marca, o atalho para relatar e as abas, nesta ordem', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    const html = renderToStaticMarkup(<Cabecalho />);
    const marca = html.indexOf('Lumens');
    const relatar = html.indexOf('Relatar um problema');
    const abas = html.indexOf('Conquistas');
    expect(marca).toBeGreaterThan(-1);
    expect(relatar).toBeGreaterThan(marca);
    expect(abas).toBeGreaterThan(relatar);
    expect(html).toContain('href="/"');
  });

  it('sem número do bot, o atalho de relatar não aparece', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(renderToStaticMarkup(<Cabecalho />)).not.toContain('Relatar um problema');
  });
});

describe('Voltar', () => {
  it('sem JavaScript, o link leva à lista de pautas', () => {
    const html = renderToStaticMarkup(<Voltar />);
    expect(html).toContain('href="/pautas"');
    expect(html).toContain('Voltar');
  });
});

describe('LinhaDePauta', () => {
  it('fechada, mostra título, apoios, etapa, categoria e bloco; o resto fica inerte', () => {
    const html = renderToStaticMarkup(<LinhaDePauta pauta={pauta('cobrando', { apoios: 1 })} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('1 apoio<');
    expect(html).toContain('Cobrando');
    expect(html).toContain('Instituto de Computação');
    expect(html).toContain('inert');
    expect(html).toContain('Ver a pauta');
  });

  it('pauta sem bloco é do campus inteiro', () => {
    const html = renderToStaticMarkup(
      <LinhaDePauta pauta={pauta('cobrando', { bloco_slug: null, bloco_nome: null })} />,
    );
    expect(html).toContain('Todo o campus');
  });

  it('a pauta urgente leva o selo; a descumprida, a janela vazada', () => {
    const urgente = renderToStaticMarkup(
      <LinhaDePauta pauta={pauta('cobrando', { urgente: true })} />,
    );
    expect(urgente).toContain('Urgente');
    expect(renderToStaticMarkup(<LinhaDePauta pauta={pauta('cobrando')} />)).not.toContain(
      'Urgente',
    );
    const descumprida = renderToStaticMarkup(<LinhaDePauta pauta={pauta('descumprida')} />);
    expect(descumprida).toMatch(/class="[^"]*descumprida[^"]*"/);
  });

  it('só oferece "Apoiar pelo WhatsApp" a pauta que aceita apoio, e com o bot configurado', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    expect(renderToStaticMarkup(<LinhaDePauta pauta={pauta('juntando_apoios')} />)).toContain(
      'Apoiar pelo WhatsApp',
    );
    expect(renderToStaticMarkup(<LinhaDePauta pauta={pauta('conquistada')} />)).not.toContain(
      'Apoiar pelo WhatsApp',
    );
  });
});

describe('Skyline', () => {
  it('espalha as janelas acesas pelas células, não as amontoa no começo', () => {
    expect(posicoesDasJanelas(8, 2)).toEqual([null, null, 0, null, null, null, 1, null]);
    expect(posicoesDasJanelas(4, 4)).toEqual([0, 1, 2, 3]);
    expect(posicoesDasJanelas(6, 0)).toEqual([null, null, null, null, null, null]);
  });

  it('o nome da janela diz título, etapa e apoios (singular e plural)', () => {
    const janela = {
      slug: 'a',
      titulo: 'Wi-Fi',
      status: 'cobrando',
      apoios: 1,
      urgente: false,
      fora: false,
    } as const;
    expect(nomeDaJanela(janela)).toBe('Wi-Fi, Cobrando, 1 apoio');
    expect(nomeDaJanela({ ...janela, apoios: 12 })).toBe('Wi-Fi, Cobrando, 12 apoios');
  });

  const predio = (extra: Partial<PredioDoSkyline> = {}): PredioDoSkyline => ({
    slug: 'ic',
    nome: 'Instituto de Computação',
    sigla: 'IC',
    colunas: 2,
    linhas: 3,
    janelas: [
      { slug: 'p1', titulo: 'Pauta 1', status: 'cobrando', apoios: 5, urgente: false, fora: false },
      {
        slug: 'p2',
        titulo: 'Pauta 2',
        status: 'conquistada',
        apoios: 9,
        urgente: false,
        fora: true,
      },
    ],
    mais: 0,
    escolhido: false,
    pautas: 2,
    ...extra,
  });

  it('desenha um botão por pauta e as janelas apagadas como células vazias', () => {
    const html = renderToStaticMarkup(
      <Skyline predios={[predio()]} legenda="Toque numa janela." />,
    );
    expect(html.match(/data-janela/g)).toHaveLength(2);
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('aria-label="Instituto de Computação: 2 pautas"');
    expect(html).toContain('Toque numa janela.');
    expect(html).toContain('IC');
  });

  it('mostra quantas pautas não couberam e esmaece os outros prédios quando há escolhido', () => {
    const html = renderToStaticMarkup(
      <Skyline
        predios={[predio({ mais: 3, escolhido: true }), predio({ slug: 'bc', sigla: 'BC' })]}
        legenda="x"
      />,
    );
    expect(html).toContain('+3');
    expect(html).toMatch(/class="[^"]*esmaecido[^"]*"/);
    expect(html).toMatch(/class="[^"]*escolhido[^"]*"/);
  });

  it('um prédio com uma só pauta usa o singular no rótulo', () => {
    const html = renderToStaticMarkup(
      <Skyline
        predios={[predio({ pautas: 1, janelas: predio().janelas.slice(0, 1) })]}
        legenda="x"
      />,
    );
    expect(html).toContain('Instituto de Computação: 1 pauta"');
  });
});

describe('NumerosDoCampus', () => {
  const numeros = {
    abertas: 7,
    juntandoApoios: 3,
    apoios: 400,
    apoiosNaSemana: 12,
    percentualDoCampus: null,
    emCobranca: 2,
    descumpridas: 1,
    conquistas: 4,
    diasAteEntrega: 9,
  };

  it('mostra os quatro números, cada um com a sua frase de contexto', () => {
    const html = renderToStaticMarkup(<NumerosDoCampus numeros={numeros} />);
    for (const rotulo of ['Pautas abertas', 'Apoios', 'Em cobrança', 'Conquistas']) {
      expect(html).toContain(`<dt>${rotulo}</dt>`);
    }
    expect(html).toContain('3 juntando apoios');
    expect(html).toContain('+12 nesta semana');
    expect(html).toContain('1 promessa descumprida');
    expect(html).toContain('9 dias em média até a entrega');
  });

  it('só marca como atraso o "em cobrança" quando há promessa descumprida', () => {
    const com = renderToStaticMarkup(<NumerosDoCampus numeros={numeros} />);
    const sem = renderToStaticMarkup(<NumerosDoCampus numeros={{ ...numeros, descumpridas: 0 }} />);
    expect(com).toMatch(/numeroContexto[^"]* [^"]*atraso/);
    expect(sem).not.toMatch(/atraso/);
    expect(sem).toContain('Nenhuma promessa descumprida');
  });
});

describe('PertoDaMetaSecao', () => {
  it('sem pautas, a seção some', () => {
    expect(renderToStaticMarkup(<PertoDaMetaSecao pautas={[]} />)).toBe('');
  });

  it('lista as pautas com o bloco, os apoios e a barra proporcional, no máximo 100%', () => {
    const html = renderToStaticMarkup(
      <PertoDaMetaSecao
        pautas={[
          pauta('juntando_apoios', { apoios: 87, meta: 150 }),
          pauta('juntando_apoios', { apoios: 300, meta: 100, bloco_nome: null }),
        ]}
      />,
    );
    expect(html).toContain('Perto de bater a meta');
    expect(html).toContain('Instituto de Computação · 87 de 150 apoios');
    expect(html).toContain('Todo o campus · 300 de 100 apoios');
    expect(html).toContain('width:58%');
    expect(html).toContain('width:100%');
  });
});

describe('AcaoDoInicio', () => {
  const etiqueta = {
    texto: 'Cobrando',
    rotulo: 'Tirar o filtro de etapa Cobrando',
    href: '/?bloco=ic',
  };

  it('sem filtro, mostra a dica e o total de pautas', () => {
    const html = renderToStaticMarkup(
      <AcaoDoInicio etiquetas={[]} total={10} status={[]} bloco={[]} />,
    );
    expect(html).toContain('Toque em etapas e blocos para filtrar as pautas.');
    expect(html).toContain('Ver as 10 pautas');
    expect(html).not.toContain('Limpar tudo');
  });

  it('com filtro, lista as etiquetas com "×" e leva os filtros à lista', () => {
    const html = renderToStaticMarkup(
      <AcaoDoInicio etiquetas={[etiqueta]} total={1} status={['cobrando']} bloco={[]} />,
    );
    expect(html).toContain('aria-label="Filtros ativos"');
    expect(html).toContain('aria-label="Tirar o filtro de etapa Cobrando"');
    expect(html).toContain('Ver a pauta filtrada');
    expect(html).toContain('href="/pautas?status=cobrando"');
    expect(html).not.toContain('Limpar tudo');
  });

  it('com dois filtros ou mais, oferece "Limpar tudo"', () => {
    const html = renderToStaticMarkup(
      <AcaoDoInicio
        etiquetas={[etiqueta, { ...etiqueta, href: '/?status=cobrando' }]}
        total={4}
        status={['cobrando']}
        bloco={['ic']}
      />,
    );
    expect(html).toContain('Limpar tudo');
    expect(html).toContain('Ver as 4 pautas filtradas');
  });
});

describe('filtros do Início', () => {
  it('as etapas são botões de seleção múltipla, com a barra só como reforço', () => {
    const html = renderToStaticMarkup(
      <EtapasFiltraveis
        linhas={[
          { status: 'cobrando', total: 3, largura: 100 },
          { status: 'prometido', total: 1, largura: 33 },
        ]}
        atual={{ status: ['cobrando'], bloco: [] }}
      />,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html).toContain('Cobrando');
    expect(html).toContain('width:33%');
  });

  it('os blocos mostram os apoios em texto e marcam o escolhido', () => {
    const html = renderToStaticMarkup(
      <BlocosFiltraveis
        linhas={[
          { slug: 'ic', nome: 'Instituto de Computação', apoios: 433, largura: 100 },
          { slug: 'bc', nome: 'Biblioteca Central', apoios: 27, largura: 6 },
        ]}
        atual={{ status: [], bloco: ['bc'] }}
      />,
    );
    expect(html).toContain('433');
    expect(html).toContain('Biblioteca Central');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
