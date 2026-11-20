import type { ResumoDaCuradoria, VisaoGeralDaCuradoria } from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Inicio, rotuloDaSemana, textoDoTempoMedio } from './inicio';
import { Moldura } from './moldura';

const resumo: ResumoDaCuradoria = {
  pautasADecidir: 3,
  pautasAtrasadas: 1,
  relatosAModerar: 2,
  pautasSemRespostaOficial: 4,
  conferenciasAbertas: 5,
};

const visao: VisaoGeralDaCuradoria = {
  pautasPertoDeVencer: 2,
  pautasPorStatus: [
    { status: 'em_curadoria', total: 3 },
    { status: 'juntando_apoios', total: 7 },
    { status: 'recusada', total: 0 },
  ],
  apoiosPorSemana: [
    { semana: '2030-01-07', apoios: 0 },
    { semana: '2030-01-14', apoios: 12 },
  ],
  tempoMedioAteDecisaoMs: 8 * 3_600_000,
  decisoesNoPeriodo: 5,
};

describe('início do painel de curadoria', () => {
  it('mostra o resumo com contagens e links, sem repetir links do menu nem o nome do cabeçalho', () => {
    const html = renderToStaticMarkup(
      <Moldura nome="Ana" sair={() => Promise.resolve()}>
        <Inicio resumo={resumo} visao={visao} />
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
      <Inicio resumo={{ ...resumo, pautasAtrasadas: 0, relatosAModerar: 1 }} visao={visao} />,
    );
    expect(html).toContain('<strong>1</strong> relato em pautas publicadas');
    expect(html).toContain('Nenhuma atrasada no prazo de 24 h');
  });

  it('mostra prazos, pautas por status com atalhos, apoios por semana e tempo médio', () => {
    const html = renderToStaticMarkup(<Inicio resumo={resumo} visao={visao} />);
    expect(html).toContain('2 vencem nas próximas 6 h');
    expect(html).toContain('Pautas por status');
    expect(html).toContain('href="/pautas?status=juntando_apoios">Juntando apoios</a>');
    expect(html).toMatch(/<strong class="[^"]*barrasNumero[^"]*">7<\/strong>/);
    expect(html).toContain('Semana de 14 jan');
    expect(html).toMatch(/<strong class="[^"]*barrasNumero[^"]*">12<\/strong>/);
    expect(html).toContain('Semana de 07 jan');
    expect(html).toContain('<strong>8,0 h</strong> em média');
    expect(html).toContain('5 decisões nos últimos 30 dias');
  });

  it('não repete o aviso de prazo próximo quando não há e explica a falta de decisões', () => {
    const html = renderToStaticMarkup(
      <Inicio
        resumo={resumo}
        visao={{
          ...visao,
          pautasPertoDeVencer: 0,
          tempoMedioAteDecisaoMs: null,
          decisoesNoPeriodo: 0,
        }}
      />,
    );
    expect(html).not.toContain('nas próximas 6 h');
    expect(html).toContain('Nenhuma decisão nos últimos 30 dias.');
  });

  it('formata o tempo médio e o rótulo da semana', () => {
    expect(textoDoTempoMedio(20 * 60_000)).toBe('20 min');
    expect(textoDoTempoMedio(90 * 60_000)).toBe('1,5 h');
    expect(textoDoTempoMedio(72 * 3_600_000)).toBe('3 dias');
    expect(rotuloDaSemana('2030-01-07')).toBe('07 jan');
  });
});

describe('início: indicadores na mesma pilha (E7)', () => {
  const html = renderToStaticMarkup(<Inicio resumo={resumo} visao={visao} />);
  const indicadores = html.match(/<li class="[^"]*indicador[^"]*">.*?<\/li>/g) ?? [];

  it('são quatro, sem cartão, e cada um é título, número, unidade e detalhe, nessa ordem', () => {
    expect(indicadores).toHaveLength(4);
    for (const item of indicadores) {
      expect(item).not.toContain('cartao');
      const posicoes = [item.indexOf('<h2>'), item.indexOf('<strong>'), item.indexOf('</strong>')];
      expect(posicoes.every((p) => p >= 0)).toBe(true);
      expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    }
  });

  it('o indicador com atraso vem marcado, e os outros não', () => {
    expect(indicadores.filter((i) => i.includes('indicadorAlerta'))).toHaveLength(1);
    expect(indicadores[0]).toContain('indicadorAlerta');
  });
});
