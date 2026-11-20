/** Largura da margem lateral onde o confete pode cair sem tocar o texto. */
const MARGEM = 56;

/** Uma peça de confete do card de conquista. */
export interface Peca {
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Graus. */
  giro: number;
  cor: string;
  redonda: boolean;
}

/** Hash simples e estável de um texto (FNV-1a), para a mesma pauta sempre ter o mesmo confete. */
function hash(texto: string): number {
  let h = 2166136261;
  for (const letra of texto) {
    h ^= letra.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function semente(valor: number): () => number {
  let a = valor;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * As peças de confete de uma pauta: posições, tamanhos e giros que só dependem do `slug`. O card
 * é gerado a cada pedido e guardado em cache; sem sorteio de verdade, duas gerações dão a mesma
 * imagem. Evita a faixa do meio (onde ficam o texto e a foto) e fica no alto e no entorno.
 */
export function confete(
  slug: string,
  quantidade: number,
  { largura, altura }: { largura: number; altura: number },
  cores: readonly string[],
): Peca[] {
  const sorteio = semente(hash(slug));
  return Array.from({ length: quantidade }, (_, i) => {
    const redonda = sorteio() < 0.35;
    const lado = 14 + Math.round(sorteio() * 22);
    // Faixa do alto (acima do texto) ou margens laterais: o meio fica livre para o texto, que
    // começa 96 px da borda. As margens têm 56 px, e as peças são giradas, então cabem folgadas.
    const noAlto = sorteio() < 0.3;
    const naEsquerda = sorteio() < 0.5;
    const x = noAlto
      ? Math.round(sorteio() * (largura - lado))
      : naEsquerda
        ? Math.round(sorteio() * Math.max(0, MARGEM - lado))
        : Math.round(largura - MARGEM + sorteio() * Math.max(0, MARGEM - lado));
    const y = Math.round(noAlto ? sorteio() * 90 : sorteio() * altura * 0.95);
    return {
      x,
      y,
      largura: redonda ? lado : lado,
      altura: redonda ? lado : Math.round(lado * (0.4 + sorteio() * 0.4)),
      giro: Math.round(sorteio() * 360),
      cor: cores[i % cores.length] ?? '#ffffff',
      redonda,
    };
  });
}
