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
const FOLGA = 4;

/** Largura aproximada do texto em 15 px: maiúscula e número são mais largos que minúscula. */
function larguraDoTexto(texto: string): number {
  const largas = (texto.match(/[A-Z0-9]/g) ?? []).length;
  return largas * 10 + (texto.length - largas) * 7.5;
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
