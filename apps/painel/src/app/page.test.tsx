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
    // Um número por cartão (SCRUM-358): o número em destaque e a unidade ao lado.
    expect(html).toContain('<strong>3</strong> esperando decisão');
    expect(html).toContain('1 pauta atrasada no prazo de 24 h');
    expect(html).toContain('<strong>2</strong> relatos em pautas publicadas');
    expect(html).toContain('<strong>4</strong> pautas');
    expect(html).toContain('<strong>5</strong> conferências');
    expect(html).toContain('href="/pautas?status=em_curadoria"');
    expect(html).toContain('href="/pautas?status=cobrando&amp;pendencia=sem_resposta_oficial"');
    expect(html).toContain('href="/pautas?status=todas&amp;pendencia=conferencia_aberta"');
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

  it('concorda no singular e avisa quando nada está atrasado', () => {
    const html = renderToStaticMarkup(
      <Inicio resumo={{ ...resumo, pautasAtrasadas: 0, relatosAModerar: 1 }} />,
    );
    expect(html).toContain('<strong>1</strong> relato em pautas publicadas');
    expect(html).toContain('Nenhuma atrasada no prazo de 24 h');
  });
});
