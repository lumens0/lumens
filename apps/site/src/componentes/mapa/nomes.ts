/**
 * Onde fica o nome de cada prédio (SCRUM-284).
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

/** Regra par-ímpar: o ponto está dentro de algum dos anéis do prédio? */
function dentro(aneis: Ponto[][], px: number, py: number): boolean {
  let marcado = false;
  for (const anel of aneis) {
    anel.forEach((a, i) => {
      const b = anel[(i + 1) % anel.length] ?? a;
      if (a[1] > py !== b[1] > py && px < a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) {
        marcado = !marcado;
      }
    });
  }
  return marcado;
}

/** Distância do ponto à borda mais próxima do prédio. */
function folga(aneis: Ponto[][], px: number, py: number): number {
  let menor = Infinity;
  for (const anel of aneis) {
    anel.forEach((a, i) => {
      const b = anel[(i + 1) % anel.length] ?? a;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t =
        dx || dy
          ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)))
          : 0;
      menor = Math.min(menor, Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy)));
    });
  }
  return menor;
}

/**
 * Um ponto que está DENTRO do prédio, para o marcador (o pontinho que pisca). O meio da caixa vale
 * quando cai dentro; em prédio em U ou em L ele cai no vão, então usa o ponto mais afastado das
 * bordas, achado numa grade sobre a caixa.
 */
export function pontoDentro(d: string, caixa: readonly number[]): Ponto {
  const [x = 0, y = 0, largura = 0, altura = 0] = caixa;
  const aneis = contornos(d);
  const meio: Ponto = [x + largura / 2, y + altura / 2];
  if (dentro(aneis, meio[0], meio[1])) return meio;
  const passos = 24;
  let melhor: { p: Ponto; folga: number } | undefined;
  for (let i = 0; i < passos; i++) {
    for (let j = 0; j < passos; j++) {
      const px = x + (largura * (i + 0.5)) / passos;
      const py = y + (altura * (j + 0.5)) / passos;
      if (!dentro(aneis, px, py)) continue;
      const f = folga(aneis, px, py);
      if (!melhor || f > melhor.folga) melhor = { p: [px, py], folga: f };
    }
  }
  return melhor?.p ?? meio;
}

/** O ponto está dentro do prédio de contorno `d`? */
export function contem(d: string, px: number, py: number): boolean {
  return dentro(contornos(d), px, py);
}
