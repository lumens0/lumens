import type { FluxoEmCards } from '@lumens/marca/fluxo';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Foto } from './arquivos';
import { MostrarDesativados } from './curadores/mostrar-desativados';
import { FluxosDoManual } from './manual/fluxos-do-manual';
import { Navegacao } from './navegacao';
import { AjustesDeMeta } from './pautas/[id]/ajustes-de-meta';
import { MotivoDaRecusa } from './pautas/[id]/motivo-da-recusa';
import { FormularioDaConquista } from './pautas/[id]/conquista-formulario';
import { BuscaDaLista } from './pautas/busca';
import { COR_NO_PAINEL, STATUS } from './pautas/status';
import { mesmaBusca, urlDaLista } from './pautas/url-da-lista';

let caminho: string | null = '/pautas/123';
// O roteador do Next não existe fora do app: aqui só o que a tela desenha importa.
vi.mock('next/navigation', () => ({
  usePathname: () => caminho,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('urlDaLista', () => {
  it('sem filtro nenhum, volta a lista aberta em "todas"', () => {
    expect(urlDaLista({ situacoes: [], pendencias: [], q: '' })).toBe('/pautas?status=todas');
  });

  it('a situação padrão sozinha, sem busca, é só /pautas', () => {
    expect(urlDaLista({ situacoes: ['em_curadoria'], pendencias: [], q: '' })).toBe('/pautas');
  });

  it('a situação padrão com busca mantém só a busca', () => {
    expect(urlDaLista({ situacoes: ['em_curadoria'], pendencias: [], q: 'sala' })).toBe(
      '/pautas?q=sala',
    );
  });

  it('várias situações e pendências vão separadas por vírgula', () => {
    expect(
      urlDaLista({
        situacoes: ['cobrando', 'prometido'],
        pendencias: ['sem_resposta'],
        q: '',
      }),
    ).toBe('/pautas?status=cobrando,prometido&pendencia=sem_resposta');
  });

  it('a busca é aparada e codificada', () => {
    expect(urlDaLista({ situacoes: ['cobrando'], pendencias: [], q: '  água & luz ' })).toBe(
      `/pautas?status=cobrando&q=${encodeURIComponent('água & luz')}`,
    );
  });

  it('busca só de espaços não entra na URL', () => {
    expect(urlDaLista({ situacoes: ['cobrando'], pendencias: [], q: '   ' })).toBe(
      '/pautas?status=cobrando',
    );
  });
});

describe('mesmaBusca', () => {
  it('ignora os espaços das pontas, porque a URL guarda a busca aparada', () => {
    expect(mesmaBusca('sala ', 'sala')).toBe(true);
    expect(mesmaBusca(' sala', 'sala ')).toBe(true);
  });

  it('busca que chegou de fora (por exemplo, "Limpar filtros") é diferente da digitada', () => {
    expect(mesmaBusca('', 'sala')).toBe(false);
    expect(mesmaBusca('sala', 'sa la')).toBe(false);
  });
});

describe('cores do painel', () => {
  it('toda situação tem uma cor, inclusive as duas que o site nunca mostra', () => {
    for (const situacao of Object.keys(STATUS) as (keyof typeof STATUS)[]) {
      expect(COR_NO_PAINEL[situacao]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(COR_NO_PAINEL.em_curadoria).not.toBe(COR_NO_PAINEL.recusada);
  });
});

describe('Navegacao', () => {
  it('marca a seção da tela aberta, inclusive as telas dentro dela', () => {
    caminho = '/pautas/123';
    const html = renderToStaticMarkup(<Navegacao administrador={false} />);
    expect(html).toMatch(/aria-current="page"[^>]*>Pautas</);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('o Início só é marcado na raiz', () => {
    caminho = '/';
    const html = renderToStaticMarkup(<Navegacao administrador={false} />);
    expect(html).toMatch(/aria-current="page"[^>]*>Início</);
    caminho = '/relatos';
    expect(renderToStaticMarkup(<Navegacao administrador={false} />)).not.toMatch(
      /aria-current="page"[^>]*>Início</,
    );
  });

  it('só o administrador vê "Curadores"', () => {
    caminho = '/';
    expect(renderToStaticMarkup(<Navegacao administrador={false} />)).not.toContain('Curadores');
    expect(renderToStaticMarkup(<Navegacao administrador />)).toContain('Curadores');
  });

  it('fora do roteador, nenhuma seção fica marcada', () => {
    caminho = null;
    expect(renderToStaticMarkup(<Navegacao administrador />)).not.toContain('aria-current');
    caminho = '/pautas/123';
  });
});

describe('BuscaDaLista', () => {
  it('o campo mostra a busca atual e o formulário leva a situação, para quem está sem JavaScript', () => {
    const html = renderToStaticMarkup(
      <BuscaDaLista q="sala" situacoes={['cobrando', 'prometido']} pendencias={[]} />,
    );
    expect(html).toContain('role="search"');
    expect(html).toContain('value="sala"');
    expect(html).toContain('name="status" value="cobrando,prometido"');
    expect(html).not.toContain('name="pendencia"');
  });

  it('sem situação escolhida, o formulário pede "todas"; pendências vão junto', () => {
    const html = renderToStaticMarkup(
      <BuscaDaLista q="" situacoes={[]} pendencias={['sem_resposta']} />,
    );
    expect(html).toContain('name="status" value="todas"');
    expect(html).toContain('name="pendencia" value="sem_resposta"');
  });
});

describe('MotivoDaRecusa', () => {
  it('o campo é obrigatório, tem o limite e começa com o contador zerado', () => {
    const html = renderToStaticMarkup(<MotivoDaRecusa maximo={300} />);
    expect(html).toContain('required');
    expect(html).toContain('maxLength="300"');
    expect(html).toContain('0/300');
  });
});

describe('MostrarDesativados', () => {
  it('mostra o total quando há desativados, e a caixa reflete o filtro', () => {
    const marcado = renderToStaticMarkup(<MostrarDesativados marcado total={3} />);
    expect(marcado).toContain('checked');
    expect(marcado).toContain('Mostrar desativados (3)');
    const sem = renderToStaticMarkup(<MostrarDesativados marcado={false} total={0} />);
    expect(sem).not.toContain('checked');
    expect(sem).toContain('Mostrar desativados');
    expect(sem).not.toContain('(0)');
  });
});

describe('Foto', () => {
  it('abre a imagem inteira em outra aba, com texto alternativo', () => {
    const html = renderToStaticMarkup(<Foto chave="relatos/a.jpg" />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('alt="Foto enviada com o relato"');
    expect(html).toContain('loading="lazy"');
  });

  it('usa o rótulo dado como texto alternativo', () => {
    expect(renderToStaticMarkup(<Foto chave="relatos/a.jpg" rotulo="Foto 2 de 3" />)).toContain(
      'alt="Foto 2 de 3"',
    );
  });
});

describe('FormularioDaConquista', () => {
  const salvar = () => Promise.resolve();

  it('mostra o texto salvo com o contador e o botão para ver o card', () => {
    const html = renderToStaticMarkup(
      <FormularioDaConquista
        pautaId="p1"
        textoSalvo="Trocamos as lâmpadas."
        fotoAtual={null}
        urlDoCard="https://exemplo.test/p/x/card"
        salvar={salvar}
      />,
    );
    expect(html).toContain('Trocamos as lâmpadas.');
    expect(html).toContain('21/160');
    expect(html).toContain('Ver o card de conquista');
    expect(html).not.toContain('Tirar esta foto');
  });

  it('com foto salva, mostra a foto e oferece tirá-la; sem endereço do card, sem o botão', () => {
    const html = renderToStaticMarkup(
      <FormularioDaConquista
        pautaId="p1"
        textoSalvo=""
        fotoAtual="/curadoria/arquivos/a.jpg"
        urlDoCard={null}
        salvar={salvar}
      />,
    );
    expect(html).toContain('alt="Foto da conquista que está salva"');
    expect(html).toContain('Tirar esta foto');
    expect(html).not.toContain('Ver o card de conquista');
  });

  it('texto acima do limite mostra quanto tirar', () => {
    const html = renderToStaticMarkup(
      <FormularioDaConquista
        pautaId="p1"
        textoSalvo={'a'.repeat(165)}
        fotoAtual={null}
        urlDoCard={null}
        salvar={salvar}
      />,
    );
    expect(html).toContain('165/160');
    expect(html).toContain('tire 5 para salvar');
  });

  it('conta letras com acento e emoji como um caractere só', () => {
    const html = renderToStaticMarkup(
      <FormularioDaConquista
        pautaId="p1"
        textoSalvo="áé😀"
        fotoAtual={null}
        urlDoCard={null}
        salvar={salvar}
      />,
    );
    expect(html).toContain('3/160');
  });
});

describe('FluxosDoManual', () => {
  const fluxos: FluxoEmCards[] = [
    {
      id: 'curar',
      rotulo: 'Curar uma pauta',
      chamada: 'Para quem decide.',
      passos: [
        {
          titulo: 'Abrir a pauta',
          resumo: 'Leia o relato.',
          onde: 'painel',
          detalhe: 'Confira o bloco.',
          exemplo: [
            { de: 'voce', texto: 'oi' },
            { de: 'bot', texto: 'olá' },
          ],
        },
        { titulo: 'Avisar', resumo: 'O bot avisa.', onde: 'automatico' },
      ],
    },
    { id: 'outro', rotulo: 'Outro fluxo', chamada: 'x', passos: [] },
  ];

  it('abre no primeiro fluxo, com o chip marcado, a chamada e os passos', () => {
    const html = renderToStaticMarkup(<FluxosDoManual fluxos={fluxos} />);
    expect(html).toContain('Curar uma pauta');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Curar uma pauta</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Outro fluxo</);
    expect(html).toContain('Para quem decide.');
    expect(html).toContain('Abrir a pauta');
  });

  it('cada passo diz onde acontece, em texto', () => {
    const html = renderToStaticMarkup(<FluxosDoManual fluxos={fluxos} />);
    expect(html).toContain('<small>Painel</small>');
    expect(html).toContain('<small>Automático</small>');
  });

  it('mostra a conversa de exemplo e o "Saiba mais" só nos passos que têm', () => {
    const html = renderToStaticMarkup(<FluxosDoManual fluxos={fluxos} />);
    expect(html).toContain('oi');
    expect(html).toContain('olá');
    expect(html.match(/Saiba mais/g)).toHaveLength(1);
  });

  it('sem fluxo nenhum, não desenha nada', () => {
    expect(renderToStaticMarkup(<FluxosDoManual fluxos={[]} />)).toBe('');
  });
});

describe('AjustesDeMeta', () => {
  const acao = () => Promise.resolve();
  const blocos = [
    { id: 'b1', slug: 'ic', nome: 'Instituto de Computação' },
    { id: 'b2', slug: 'bc', nome: 'Biblioteca Central' },
  ];
  const desenhar = (extra: { erro?: string; feito?: string } = {}) =>
    renderToStaticMarkup(
      <AjustesDeMeta
        pautaId="p1"
        meta={120}
        blocoId="b2"
        blocos={blocos}
        corrigirBloco={acao}
        ajustarMeta={acao}
        {...extra}
      />,
    );

  it('traz a meta atual entre os limites do domínio e o bloco atual escolhido', () => {
    const html = desenhar();
    expect(html).toContain('value="120"');
    expect(html).toContain('min="30"');
    expect(html).toContain('max="300"');
    expect(html).toContain('Todo o campus');
    expect(html).toContain('Instituto de Computação');
    expect(html).toMatch(
      /<option value="b2" selected[^>]*>Biblioteca Central<\/option>|<option value="b2"[^>]*selected/,
    );
  });

  it('cada formulário exige um motivo de até 200 caracteres', () => {
    expect(
      desenhar().match(/name="motivo"[^>]*required[^>]*maxLength="200"|maxLength="200"/g),
    ).toHaveLength(2);
  });

  it('erro conhecido vira um alerta em português; erro desconhecido não aparece', () => {
    expect(desenhar({ erro: 'meta_abaixo_dos_apoios' })).toContain('role="alert"');
    expect(desenhar({ erro: 'meta_abaixo_dos_apoios' })).toContain('maior que o total de apoios');
    expect(desenhar({ erro: 'qualquer_coisa' })).not.toContain('role="alert"');
  });

  it('o aviso de feito diz o que foi feito', () => {
    expect(desenhar({ feito: 'bloco' })).toContain('Bloco corrigido e meta recalculada.');
    expect(desenhar({ feito: 'meta' })).toContain('Meta ajustada.');
    expect(desenhar()).not.toContain('role="status"');
  });
});
