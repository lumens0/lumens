/**
 * Onde fica o nome de cada prédio e quais nomes cabem na tela sem se atropelar (SCRUM-284).
 */

type Ponto = readonly [number, number];

/** Os contornos de um `d` só com M, L e Z, o formato que o `campus-osm.ts` gera. */
function contornos(d: string): Ponto[][] {
  return d
    .split('M')
    .filter((parte) => parte.trim() !== '')
    .map((parte) => {
      const n = parte.replace(/[LZ]/g, ' ').trim().split(/\s+/).map(Number);
      const pontos: Ponto[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pontos.push([n[i] ?? 0, n[i + 1] ?? 0]);
      return pontos;
    });
}

/**
 * Onde a reta `eixo = valor` corta as bordas, em ordem. Com a regra par-ímpar, cada par
 * (0 e 1, 2 e 3...) é um trecho dentro do prédio. `eixo` 1 é horizontal (y fixo); 0, vertical.
 */
function cortes(aneis: Ponto[][], eixo: 0 | 1, valor: number): number[] {
  const outro = eixo === 1 ? 0 : 1;
  const achados: number[] = [];
  for (const anel of aneis) {
    anel.forEach((a, i) => {
      const b = anel[(i + 1) % anel.length] ?? a;
      if (a[eixo] > valor === b[eixo] > valor) return;
      const t = (valor - a[eixo]) / (b[eixo] - a[eixo]);
      achados.push(a[outro] + t * (b[outro] - a[outro]));
    });
  }
  return achados.sort((x, y) => x - y);
}

/**
 * Ponto do nome: logo abaixo da parte mais larga do prédio, na borda de baixo dela. O pé da caixa
 * (o jeito antigo) cai fora de prédio em L ou em U, ao lado de outro prédio, e o nome parecia
 * ser do vizinho.
 */
export function pontoDoNome(d: string, caixa: readonly number[]): Ponto {
  const [x = 0, y = 0, largura = 0, altura = 0] = caixa;
  const aneis = contornos(d);
  let melhor = { x: x + largura / 2, y: y + altura / 2, largura: -1 };
  const faixas = 16;
  for (let i = 0; i < faixas; i++) {
    const yi = y + (altura * (i + 0.5)) / faixas;
    const xs = cortes(aneis, 1, yi);
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const a = xs[j] ?? 0;
      const b = xs[j + 1] ?? 0;
      if (b - a > melhor.largura) melhor = { x: (a + b) / 2, y: yi, largura: b - a };
    }
  }
  // Desce do ponto até a borda de baixo do mesmo trecho do prédio.
  const ys = cortes(aneis, 0, melhor.x);
  for (let j = 0; j + 1 < ys.length; j += 2) {
    const fundo = ys[j + 1] ?? 0;
    if ((ys[j] ?? 0) <= melhor.y && melhor.y <= fundo) return [melhor.x, fundo];
  }
  return [x + largura / 2, y + altura];
}

/** Um nome que pode ir para o mapa, no ponto `x`, `y` do desenho (metros). */
export interface Nome {
  id: string;
  texto: string;
  x: number;
  y: number;
  /** Onde o texto fica em relação ao ponto: o `dy` do `<text>`. */
  lado: 'abaixo' | 'centro' | 'acima';
}

/** Centro vertical do texto em relação ao ponto, em px da tela (fonte de 15 px). */
const CENTRO_DO_TEXTO = { abaixo: 13, centro: 0, acima: -17 } as const;
const ALTURA_DO_TEXTO = 18;
/** Folga entre dois nomes, em px, para não encostarem. */
// O contorno escuro das letras (0,22 em de traço) e o respiro entre nomes.
const FOLGA = 7;

// Largura de cada letra da fonte do site (peso 500) em 15 px, medida no navegador com
// `canvas.measureText`. Acento não muda a largura da letra-base. Letra fora da tabela vale `MEDIA`.
const LARGURAS: Record<string, number> = {
  ...Object.fromEntries(
    Object.entries({
      I: 3.8,
      G: 11.5,
      D: 11.3,
      E: 9.5,
      M: 13.5,
      A: 11,
      F: 9,
      S: 9.3,
      O: 11.8,
      C: 11.2,
      T: 9.8,
      H: 11,
      J: 6.6,
      B: 9.6,
      L: 8.8,
      N: 11,
      P: 9.9,
      Q: 11.9,
      R: 9.9,
      U: 10.6,
      V: 11,
      W: 16.3,
      X: 10.5,
      Y: 10.3,
      Z: 9.4,
      K: 10.5,
      a: 8.2,
      b: 9.2,
      c: 8.1,
      d: 9.2,
      e: 8.5,
      f: 5.4,
      g: 9.2,
      h: 9.1,
      i: 3.8,
      j: 3.8,
      k: 8.2,
      l: 3.8,
      m: 14,
      n: 9.1,
      o: 8.9,
      p: 9.2,
      q: 9.2,
      r: 5.7,
      s: 7.2,
      t: 5.9,
      u: 8.9,
      v: 7.9,
      w: 11.7,
      x: 8.5,
      y: 7.9,
      z: 7.6,
      ' ': 3,
      '-': 7.5,
      '.': 4,
      '0': 10.1,
      '1': 5.8,
      '2': 8.3,
      '3': 8.7,
      '4': 9.1,
      '5': 8.7,
      '6': 9.1,
      '7': 8.2,
      '8': 8.8,
      '9': 9.2,
    }),
  ),
};
const MEDIA = 9.5;

/** Largura do texto em 15 px, letra por letra (medida na fonte real; ver `LARGURAS`). */
export function larguraDoTexto(texto: string): number {
  let total = 0;
  for (const letra of texto.normalize('NFD').replace(/\p{M}/gu, '')) {
    total += LARGURAS[letra] ?? MEDIA;
  }
  return total;
}

/**
 * Os nomes que cabem na tela sem um cobrir o outro, na ordem dada: o primeiro da lista ganha a
 * disputa. O nome não gira nem muda de tamanho com o zoom; quem muda é a distância entre os
 * pontos na tela (`k` metros por pixel, mapa girado em `giro` radianos). Por isso, ao aproximar,
 * cabem mais nomes.
 */
export function nomesQueCabem(nomes: readonly Nome[], k: number, giro: number): Set<string> {
  const c = Math.cos(giro) / k;
  const s = Math.sin(giro) / k;
  const ocupadas: (readonly [number, number, number, number])[] = [];
  const cabem = new Set<string>();
  for (const nome of nomes) {
    const sx = c * nome.x - s * nome.y;
    const sy = s * nome.x + c * nome.y + CENTRO_DO_TEXTO[nome.lado];
    const meiaLargura = larguraDoTexto(nome.texto) / 2 + FOLGA / 2;
    const meiaAltura = ALTURA_DO_TEXTO / 2 + FOLGA / 2;
    const caixa = [sx - meiaLargura, sy - meiaAltura, sx + meiaLargura, sy + meiaAltura] as const;
    const bate = ocupadas.some(
      (o) => caixa[0] < o[2] && o[0] < caixa[2] && caixa[1] < o[3] && o[1] < caixa[3],
    );
    if (bate) continue;
    ocupadas.push(caixa);
    cabem.add(nome.id);
  }
  return cabem;
}
