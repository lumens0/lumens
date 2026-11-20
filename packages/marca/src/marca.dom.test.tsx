// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Fluxos, ROTULO_DO_ONDE, type FluxoEmCards } from './fluxo';
import { COR_DO_STATUS } from './index';

afterEach(cleanup);

const fluxos: FluxoEmCards[] = [
  {
    id: 'apoiar',
    rotulo: 'Apoiar',
    chamada: 'Para quem apoia.',
    passos: [
      {
        titulo: 'Mandar o comando',
        resumo: 'Pelo bot.',
        onde: 'bot',
        exemplo: [
          { de: 'voce', texto: 'apoiar bebedouros' },
          { de: 'bot', texto: 'Apoio registrado.' },
        ],
        detalhe: 'O comando usa o slug da pauta.',
      },
      { titulo: 'Ver no site', resumo: 'A pauta atualiza.', onde: 'site' },
    ],
  },
  {
    id: 'curar',
    rotulo: 'Curar',
    chamada: 'Para quem decide.',
    passos: [
      { titulo: 'Aprovar', resumo: 'No painel.', onde: 'painel' },
      { titulo: 'Avisar', resumo: 'Sozinho.', onde: 'automatico' },
    ],
  },
];

describe('Fluxos', () => {
  it('abre no primeiro fluxo, com o chip marcado, a chamada e os passos em ordem', () => {
    render(<Fluxos fluxos={fluxos} rotulo="Fluxos de uso" />);
    expect(screen.getByRole('group', { name: 'Fluxos de uso' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apoiar' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Curar' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByText('Para quem apoia.')).toBeTruthy();
    const passos = screen.getAllByRole('listitem');
    expect(passos).toHaveLength(2);
    expect(within(passos[0] as HTMLElement).getByText('Mandar o comando')).toBeTruthy();
  });

  it('cada passo diz onde acontece, em texto, e o do bot usa o nome do canal ativo', () => {
    const { unmount } = render(<Fluxos fluxos={fluxos} rotulo="x" />);
    expect(screen.getByText(ROTULO_DO_ONDE.bot)).toBeTruthy();
    expect(screen.getByText(ROTULO_DO_ONDE.site)).toBeTruthy();
    unmount();
    render(<Fluxos fluxos={fluxos} rotulo="x" rotuloDoBot="Telegram" />);
    expect(screen.getByText('Telegram')).toBeTruthy();
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });

  it('as falas de exemplo dizem quem fala, e o "Saiba mais" só existe no passo que tem detalhe', () => {
    render(<Fluxos fluxos={fluxos} rotulo="x" />);
    const conversa = screen.getByRole('group', { name: 'Exemplo da conversa' });
    expect(conversa.textContent).toContain('Você: apoiar bebedouros');
    expect(conversa.textContent).toContain('Bot: Apoio registrado.');
    expect(screen.getAllByText('Saiba mais')).toHaveLength(1);
    expect(screen.getByText('O comando usa o slug da pauta.')).toBeTruthy();
  });

  it('tocar noutro chip troca a chamada e os passos, e marca só ele', async () => {
    const usuario = userEvent.setup();
    render(<Fluxos fluxos={fluxos} rotulo="x" />);
    await usuario.click(screen.getByRole('button', { name: 'Curar' }));
    expect(screen.getByText('Para quem decide.')).toBeTruthy();
    expect(screen.getByText('Aprovar')).toBeTruthy();
    expect(screen.queryByText('Mandar o comando')).toBeNull();
    expect(screen.getByRole('button', { name: 'Curar' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Apoiar' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByText(ROTULO_DO_ONDE.painel)).toBeTruthy();
    expect(screen.getByText(ROTULO_DO_ONDE.automatico)).toBeTruthy();
  });

  it('sem fluxo nenhum, não desenha nada', () => {
    const { container } = render(<Fluxos fluxos={[]} rotulo="x" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('COR_DO_STATUS', () => {
  it('cada status tem uma cor hexadecimal, sem repetir entre as etapas', () => {
    const cores = Object.values(COR_DO_STATUS);
    for (const cor of cores) expect(cor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it('as nove situações da pauta estão cobertas', () => {
    expect(Object.keys(COR_DO_STATUS).sort()).toEqual(
      [
        'em_curadoria',
        'recusada',
        'juntando_apoios',
        'meta_batida',
        'cobrando',
        'prometido',
        'entregue_em_parte',
        'descumprida',
        'conquistada',
      ].sort(),
    );
  });
});
