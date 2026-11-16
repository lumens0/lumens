import type { ResumoDaCuradoria } from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Inicio } from './inicio';
import { Moldura } from './moldura';

const resumo: ResumoDaCuradoria = {
  pautasADecidir: 3,
  pautasAtrasadas: 1,
  relatosAModerar: 2,
  pautasSemRespostaOficial: 4,
  conferenciasAbertas: 5,
};

describe('início do painel de curadoria', () => {
  it('mostra o resumo com contagens e links, sem repetir links do menu nem o nome do cabeçalho', () => {
    const html = renderToStaticMarkup(
      <Moldura nome="Ana" sair={() => Promise.resolve()}>
        <Inicio resumo={resumo} />
      </Moldura>,
    );

    expect(html).toContain('Painel de curadoria');
    expect(html).toContain('3 esperando decisão; 1 pauta atrasada no prazo de 24 h.');
    expect(html).toContain('2 relatos em pautas publicadas.');
    expect(html).toContain('4 pautas.');
    expect(html).toContain('5 conferências.');
    expect(html).toContain('href="/pautas?status=em_curadoria"');
    expect(html).toContain('href="/pautas?status=cobrando"');
    expect(html).toContain('href="/pautas?status=prometido"');
    expect(html).toContain('href="/relatos"');
    expect(html).toContain('Início');
    expect(html).toContain('href="/pautas">Pautas</a>');
    expect(html).toContain('Relatos em pautas publicadas');
    expect(html).not.toContain('Você entrou como');
    expect(html).not.toContain('Pautas novas');
    expect(html).not.toContain('Todas as pautas');
    expect(html).not.toContain('href="/curadores"');
    expect(html).toContain('Sair');
  });
});
