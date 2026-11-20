import {
  DIAS_DE_CONFERENCIA,
  META_MAXIMA,
  META_MINIMA,
  MOTIVO_RECUSA_MAXIMO,
  PRAZO_DE_CURADORIA_MS,
  QUORUM_MINIMO,
} from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FLUXO_DE_ADMINISTRACAO, FLUXOS_DA_CURADORIA } from './fluxos';
import { ManualDaCuradoria } from './manual';

const texto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('manual da curadoria', () => {
  it('mostra as abas dos fluxos e o primeiro, com o primeiro passo aberto', () => {
    const html = renderToStaticMarkup(<ManualDaCuradoria administrador={false} />);
    for (const fluxo of FLUXOS_DA_CURADORIA) expect(html).toContain(`>${fluxo.rotulo}</button>`);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Abra a fila');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Regras que valem sempre');
  });

  it('só o administrador vê o fluxo de gerir curadores', () => {
    const comum = renderToStaticMarkup(<ManualDaCuradoria administrador={false} />);
    const admin = renderToStaticMarkup(<ManualDaCuradoria administrador />);
    expect(comum).not.toContain(FLUXO_DE_ADMINISTRACAO.rotulo);
    expect(admin).toContain(FLUXO_DE_ADMINISTRACAO.rotulo);
  });

  it('os números escritos são os do sistema', () => {
    const tudo = JSON.stringify([...FLUXOS_DA_CURADORIA, FLUXO_DE_ADMINISTRACAO]);
    expect(tudo).toContain(`até ${String(PRAZO_DE_CURADORIA_MS / 3_600_000)} horas`);
    expect(tudo).toContain(`até ${String(MOTIVO_RECUSA_MAXIMO)} caracteres`);
    expect(tudo).toContain(`de ${String(META_MINIMA)} a ${String(META_MAXIMA)}`);
    expect(tudo).toContain(`por ${String(DIAS_DE_CONFERENCIA)} dias`);
    expect(tudo).toContain(`${String(QUORUM_MINIMO * 100)}% de quem apoiou`);
  });

  it('cita a caixa de conferência que a aprovação exige', () => {
    expect(texto(renderToStaticMarkup(<ManualDaCuradoria administrador={false} />))).toContain(
      'A caixa “Conferi…” é obrigatória',
    );
  });
});

describe('manual da curadoria: a categoria (E7)', () => {
  it('diz que a categoria vem marcada com a de quem relatou, e não que é obrigatória', () => {
    const tudo = JSON.stringify([...FLUXOS_DA_CURADORIA]);
    expect(tudo).toContain('Confira a categoria');
    expect(tudo).toContain('já vem marcada com a de quem relatou');
    expect(tudo).not.toContain('Obrigatória para aprovar');
    expect(tudo).not.toContain('Escolha a categoria');
  });
});
