import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { etapasDoFio, FioDeEtapas, posicaoNoFio } from './FioDeEtapas';

describe('posição no fio', () => {
  it('cada etapa cai na sua janela; entregue em parte e descumprida dividem a 4.ª', () => {
    expect(
      [
        'juntando_apoios',
        'meta_batida',
        'cobrando',
        'prometido',
        'entregue_em_parte',
        'descumprida',
        'conquistada',
      ].map(posicaoNoFio),
    ).toEqual([0, 1, 2, 3, 3, 3, 4]);
  });
});

describe('etapasDoFio', () => {
  const estados = (status: string) => etapasDoFio(status).map((j) => j.estado);

  it('acende até a etapa atual e apaga o resto', () => {
    expect(estados('juntando_apoios')).toEqual([
      'atual',
      'apagada',
      'apagada',
      'apagada',
      'apagada',
    ]);
    expect(estados('cobrando')).toEqual(['acesa', 'acesa', 'atual', 'apagada', 'apagada']);
    expect(estados('conquistada')).toEqual(['acesa', 'acesa', 'acesa', 'acesa', 'atual']);
  });

  it('descumprida é a 4.ª janela vazada, em vermelho; as anteriores seguem acesas', () => {
    const fio = etapasDoFio('descumprida');
    expect(fio.map((j) => j.estado)).toEqual(['acesa', 'acesa', 'acesa', 'vazada', 'apagada']);
    expect(fio[3]?.cor).toBe('#d0443b');
  });

  it('todas as janelas usam a cor do status da pauta, e a atual leva o rótulo do status', () => {
    const fio = etapasDoFio('entregue_em_parte');
    expect(fio[3]?.estado).toBe('atual');
    expect(new Set(fio.map((j) => j.cor))).toEqual(new Set(['#a98216']));
    expect(fio[3]?.rotulo).toBe('Entregue em parte');
  });
});

describe('FioDeEtapas', () => {
  it('é uma lista com o nome e o estado de cada etapa, para o leitor de tela', () => {
    const html = renderToStaticMarkup(<FioDeEtapas status="cobrando" />);
    expect(html).toContain('<ol');
    expect(html).toContain('aria-label="Etapas da pauta"');
    // A etapa atual leva o rótulo do status; as outras, o nome da etapa.
    for (const nome of ['Apoios', 'Meta', 'Cobrando', 'Promessa', 'Conquista']) {
      expect(html).toContain(nome);
    }
    expect(html).toContain('style="--cor:#c05b12;--f:0.5"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('etapa atual');
    expect(html).toContain('etapa que ainda não chegou');
  });
});
