import { describe, expect, it } from 'vitest';
import { ehMenuPrincipal, MENU_PRINCIPAL } from '../conversation/handlers';
import {
  botoes,
  dentroDosLimitesDaMeta,
  lista,
  type MensagemDeLista,
} from '../conversation/resposta';
import {
  DICA_DO_MENU,
  menuDoTurno,
  renderizarEmTexto,
  resolverEscolha,
  semMenuPrincipalDepoisDoMenu,
  type MenuEmTexto,
} from './menu-em-texto';

const LISTA = lista({
  corpo: 'Achei pautas parecidas:',
  botao: 'Ver pautas',
  linhas: [
    { id: 'pauta:1', titulo: 'Bebedouro quebrado', descricao: 'Bloco 12' },
    { id: 'pauta:2', titulo: 'Iluminação' },
    { id: 'outro', titulo: 'É outro problema' },
  ],
});
const BOTOES = botoes({
  corpo: 'Confirma?',
  botoes: [
    { id: 'sim', titulo: 'Sim' },
    { id: 'nao', titulo: 'Não' },
  ],
});
const MENU: MenuEmTexto = {
  opcoes: [
    { id: 'pauta:1', titulo: 'Bebedouro quebrado' },
    { id: 'pauta:2', titulo: 'Iluminação' },
    { id: 'outro', titulo: 'É outro problema' },
  ],
};

const MENU_COM_SAIDA: MenuEmTexto = {
  opcoes: [...MENU.opcoes, { id: 'menu', titulo: 'Voltar ao menu principal' }],
};

describe('renderizarEmTexto', () => {
  it('texto passa como veio', () => {
    expect(renderizarEmTexto('oi')).toBe('oi');
  });

  it('lista vira linhas numeradas, com a descrição, e a dica no fim', () => {
    expect(renderizarEmTexto(LISTA)).toBe(
      [
        'Achei pautas parecidas:',
        '',
        '*1.* Bebedouro quebrado — Bloco 12',
        '*2.* Iluminação',
        '*3.* É outro problema',
        '*0.* Voltar ao menu principal',
        '',
        DICA_DO_MENU,
      ].join('\n'),
    );
  });

  it('botões também viram linhas numeradas', () => {
    expect(renderizarEmTexto(BOTOES)).toBe(
      [
        'Confirma?',
        '',
        '*1.* Sim',
        '*2.* Não',
        '*0.* Voltar ao menu principal',
        '',
        DICA_DO_MENU,
      ].join('\n'),
    );
  });
});

describe('menuDoTurno', () => {
  it('vale o último menu do turno, mesmo com texto depois dele', () => {
    expect(menuDoTurno(['oi', BOTOES, LISTA, 'depois'])).toEqual(MENU_COM_SAIDA);
  });

  it('turno só de texto não deixa menu', () => {
    expect(menuDoTurno(['oi', 'tchau'])).toBeNull();
  });

  it('a imagem (card da pauta) não é menu nem apaga o menu antes dela', () => {
    const card = { tipo: 'imagem' as const, url: 'https://x/card.png', legenda: 'Veja a pauta' };
    expect(menuDoTurno([card])).toBeNull();
    expect(menuDoTurno([LISTA, card])).toEqual(MENU_COM_SAIDA);
    expect(renderizarEmTexto(card)).toBe('Veja a pauta');
  });
});

describe('semMenuPrincipalDepoisDoMenu', () => {
  const PRINCIPAL = 'O que você quer fazer?\n1 Relatar problema';
  const ehPrincipal = (r: unknown) => r === PRINCIPAL;

  it('tira o menu principal que vem depois dos botões (o "Vou ajudar" que volta ao menu)', () => {
    expect(semMenuPrincipalDepoisDoMenu(['antes', BOTOES, PRINCIPAL], ehPrincipal)).toEqual([
      'antes',
      BOTOES,
    ]);
  });

  it('mantém o menu principal quando não há menu numerado antes dele', () => {
    expect(semMenuPrincipalDepoisDoMenu(['Ok, cancelei.', PRINCIPAL], ehPrincipal)).toEqual([
      'Ok, cancelei.',
      PRINCIPAL,
    ]);
  });
});

describe('resolverEscolha', () => {
  it.each([
    ['2', 'pauta:2'],
    [' 3 ', 'outro'],
    ['1.', 'pauta:1'],
    ['2)', 'pauta:2'],
    ['iluminacao', 'pauta:2'],
    ['É OUTRO PROBLEMA', 'outro'],
  ])('"%s" escolhe %s', (digitado, id) => {
    expect(resolverEscolha(digitado, MENU)).toBe(id);
  });

  it.each(['0', '4', '12', 'bebedouro', '', 'menu'])('"%s" não escolhe nada', (digitado) => {
    expect(resolverEscolha(digitado, MENU)).toBeNull();
  });

  it('o 0 volta ao menu principal em qualquer menu com a saída; sem ela, não escolhe nada', () => {
    expect(resolverEscolha('0', MENU_COM_SAIDA)).toBe('menu');
    expect(resolverEscolha('Voltar ao menu principal', MENU_COM_SAIDA)).toBe('menu');
    expect(resolverEscolha('0', MENU)).toBeNull();
  });

  it.each([
    ['dois', 'pauta:2'],
    ['Três', 'outro'],
    ['um', 'pauta:1'],
    ['opção 2', 'pauta:2'],
    ['opcao dois', 'pauta:2'],
    ['a segunda', 'pauta:2'],
    ['número 3', 'outro'],
    ['n 1', 'pauta:1'],
    ['zero', 'menu'],
  ])('número escrito de outro jeito: "%s" escolhe %s', (digitado, id) => {
    expect(resolverEscolha(digitado, MENU_COM_SAIDA)).toBe(id);
  });

  it('palavra que só começa como número não escolhe nada ("nove" não vira "n" + "ove")', () => {
    expect(resolverEscolha('nove', MENU_COM_SAIDA)).toBeNull();
    expect(resolverEscolha('nada', MENU_COM_SAIDA)).toBeNull();
  });

  it('sem menu, "2" é só "2"', () => {
    expect(resolverEscolha('2', null)).toBeNull();
  });

  it('título cortado pelos limites da Meta casa sem as reticências', () => {
    const cortado = dentroDosLimitesDaMeta(
      lista({
        corpo: 'x',
        botao: 'y',
        linhas: [{ id: 'p', titulo: 'Bebedouro quebrado no bloco doze do campus' }],
      }),
    ) as MensagemDeLista;
    const menu = menuDoTurno([cortado]);
    const titulo = cortado.linhas[0]?.titulo ?? '';
    expect(titulo.endsWith('…')).toBe(true);
    expect(resolverEscolha(titulo.slice(0, -1), menu)).toBe('p');
  });
});

describe('menu principal como lista (SCRUM-340)', () => {
  it('é reconhecido depois de passar por JSON e sai no mesmo formato das outras listas', () => {
    const volta = JSON.parse(JSON.stringify(MENU_PRINCIPAL)) as typeof MENU_PRINCIPAL;
    expect(ehMenuPrincipal(volta)).toBe(true);
    expect(ehMenuPrincipal('texto')).toBe(false);
    const texto = renderizarEmTexto(MENU_PRINCIPAL);
    expect(texto).toContain('*1.* Relatar problema');
    expect(texto).toContain(DICA_DO_MENU);
  });
});
