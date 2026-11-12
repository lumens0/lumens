import { describe, expect, it } from 'vitest';
import { botoes, lista } from '../conversation/resposta';
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
        '',
        DICA_DO_MENU,
      ].join('\n'),
    );
  });

  it('botões também viram linhas numeradas', () => {
    expect(renderizarEmTexto(BOTOES)).toBe(
      ['Confirma?', '', '*1.* Sim', '*2.* Não', '', DICA_DO_MENU].join('\n'),
    );
  });
});

describe('menuDoTurno', () => {
  it('vale o último menu do turno, mesmo com texto depois dele', () => {
    expect(menuDoTurno(['oi', BOTOES, LISTA, 'depois'])).toEqual(MENU);
  });

  it('turno só de texto não deixa menu', () => {
    expect(menuDoTurno(['oi', 'tchau'])).toBeNull();
  });
});

describe('semMenuPrincipalDepoisDoMenu', () => {
  const PRINCIPAL = 'O que você quer fazer?\n1 Relatar problema';

  it('tira o menu principal que vem depois dos botões (o "Vou ajudar" que volta ao menu)', () => {
    expect(semMenuPrincipalDepoisDoMenu(['antes', BOTOES, PRINCIPAL], PRINCIPAL)).toEqual([
      'antes',
      BOTOES,
    ]);
  });

  it('mantém o menu principal quando não há menu numerado antes dele', () => {
    expect(semMenuPrincipalDepoisDoMenu(['Ok, cancelei.', PRINCIPAL], PRINCIPAL)).toEqual([
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

  it('sem menu, "2" é só "2"', () => {
    expect(resolverEscolha('2', null)).toBeNull();
  });

  it('título cortado pelos limites da Meta casa sem as reticências', () => {
    const cortado = lista({
      corpo: 'x',
      botao: 'y',
      linhas: [{ id: 'p', titulo: 'Bebedouro quebrado no bloco doze do campus' }],
    });
    const menu = menuDoTurno([cortado]);
    const titulo = cortado.linhas[0]?.titulo ?? '';
    expect(titulo.endsWith('…')).toBe(true);
    expect(resolverEscolha(titulo.slice(0, -1), menu)).toBe('p');
  });
});
