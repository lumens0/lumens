import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Bloco, Pauta } from '../../dados/tipos';
import { MapaDoCampus } from './MapaDoCampus';
import { nomesQueCabem, pontoDoNome, type Nome } from './nomes';
import { PREDIOS } from './predios';
import { marcadoresDoMapa } from './urgencia';

const nome = (id: string, x: number, y: number, texto = 'ICHCA'): Nome => ({
  id,
  texto,
  x,
  y,
  lado: 'abaixo',
});

describe('ponto do nome (SCRUM-284)', () => {
  it('num prédio em L, o nome fica sob a parte larga, não no vão do L', () => {
    // Barra de cima de 0 a 100 (10 de altura) e perna à direita, de 90 a 100, descendo até 60.
    const l = 'M0 0L100 0L100 60L90 60L90 10L0 10Z';
    const [x, y] = pontoDoNome(l, [0, 0, 100, 60]);
    expect(x).toBeCloseTo(50, 0);
    // Na borda de baixo da barra, e não no pé da caixa (60), que fica no vão.
    expect(y).toBeCloseTo(10, 5);
  });

  it('num retângulo, o nome fica no meio da borda de baixo, como antes', () => {
    expect(pontoDoNome('M10 20L50 20L50 40L10 40Z', [10, 20, 40, 20])).toEqual([30, 40]);
  });

  it('todo prédio do mapa tem o ponto do nome dentro da própria caixa', () => {
    for (const p of PREDIOS) {
      const [x = 0, y = 0, w = 0, h = 0] = p.caixa;
      expect(p.rotulo[0], p.nome).toBeGreaterThanOrEqual(x - 0.01);
      expect(p.rotulo[0], p.nome).toBeLessThanOrEqual(x + w + 0.01);
      expect(p.rotulo[1], p.nome).toBeGreaterThanOrEqual(y - 0.01);
      expect(p.rotulo[1], p.nome).toBeLessThanOrEqual(y + h + 0.01);
    }
  });
});

describe('nomes que cabem na tela (SCRUM-284)', () => {
  it('dois nomes no mesmo lugar: fica só o primeiro da lista', () => {
    const cabem = nomesQueCabem([nome('a', 0, 0), nome('b', 5, 0)], 1, 0);
    expect([...cabem]).toEqual(['a']);
  });

  it('aproximar o mapa abre espaço: os dois aparecem', () => {
    const lista = [nome('a', 0, 0), nome('b', 40, 0)];
    // Afastado (3 m por pixel), os 40 m viram 13 px: os nomes se cobririam.
    expect([...nomesQueCabem(lista, 3, 0)]).toEqual(['a']);
    // Perto (0,5 m por pixel), viram 80 px: cabem os dois.
    expect([...nomesQueCabem(lista, 0.5, 0)]).toEqual(['a', 'b']);
  });

  it('girar o mapa muda quem cabe: lado a lado viram um sobre o outro', () => {
    const lista = [nome('a', 0, 0), nome('b', 40, 0)];
    expect([...nomesQueCabem(lista, 1, 0)]).toEqual(['a']);
    // Girado 90°, os 40 px ficam na vertical, mais que a altura de um nome.
    expect([...nomesQueCabem(lista, 1, Math.PI / 2)]).toEqual(['a', 'b']);
  });
});

describe('brilho dos prédios (SCRUM-284)', () => {
  const pauta = { slug: 'p1', status: 'juntando_apoios', urgente: false, apoios: 1, meta: 30 };

  it('só o prédio com pauta ganha o halo; o bloco sem pauta fica apagado', () => {
    const blocos = [
      { slug: 'ic', nome: 'IC' },
      { slug: 'im', nome: 'IM' },
    ] as Bloco[];
    const marcadores = marcadoresDoMapa(blocos, [{ ...pauta, bloco_slug: 'ic' }] as Pauta[]);
    const html = renderToStaticMarkup(<MapaDoCampus marcadores={marcadores} />);
    expect(html.match(/class="[^"]*halo[^"]*"/g)).toHaveLength(1);
    expect(html.match(/class="[^"]*semPautas[^"]*"/g)).toHaveLength(1);
  });
});
