import { PREDIOS, type Predio } from '../mapa/predios';

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\(ficticio\)/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Encontra o prédio no mapa pelo slug do bloco ou pelo nome (usado em Conquistas e Atividade, que
 * recebem o nome do bloco ou o slug da pauta). Retorna `undefined` para "Todo o campus" ou bloco
 * ainda sem prédio ligado.
 */
export function predioDoBloco(
  slug: string | null | undefined,
  nome?: string | null,
): Predio | undefined {
  if (slug) {
    const porSlug = PREDIOS.find((p) => p.blocos.includes(slug));
    if (porSlug) return porSlug;
  }
  if (!nome) return undefined;
  const alvo = normalizar(nome);
  if (!alvo) return undefined;

  const exato = PREDIOS.find(
    (p) =>
      normalizar(p.nome) === alvo ||
      (p.sigla && normalizar(p.sigla) === alvo) ||
      p.blocos.some((s) => normalizar(s) === alvo),
  );
  if (exato) return exato;

  // "IC - Instituto de Computação" começa pela sigla ou slug; "Bloco das Engenharias" contém o slug.
  const porTrecho = PREDIOS.find((p) => {
    const sigla = normalizar(p.sigla);
    if (sigla && (alvo === sigla || alvo.startsWith(`${sigla} `) || alvo.endsWith(` ${sigla}`))) {
      return true;
    }
    return p.blocos.some((s) => {
      const limpo = normalizar(s);
      return limpo.length >= 4 && alvo.includes(limpo);
    });
  });
  return porTrecho;
}
