import { PREDIOS, siglaDe } from '../componentes/mapa/predios';
import { abreviar } from './skyline';
import type { Bloco } from './tipos';

/**
 * Sigla do bloco: a do prédio no mapa, quando há, ou a derivada do nome. Só no servidor: os
 * contornos do campus (`predios.ts`) são grandes e não devem ir para o pacote do navegador.
 */
export function siglaDoBloco(bloco: Pick<Bloco, 'slug' | 'nome'>): string {
  const predio = PREDIOS.find((p) => p.sigla !== '' && p.blocos.includes(bloco.slug));
  return abreviar(predio?.sigla ?? siglaDe(bloco.nome));
}

/** A sigla de cada bloco pelo slug, para passar a componentes de navegador. */
export function siglasDosBlocos(blocos: readonly Pick<Bloco, 'slug' | 'nome'>[]) {
  return Object.fromEntries(blocos.map((bloco) => [bloco.slug, siglaDoBloco(bloco)]));
}
