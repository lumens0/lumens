import type { ResultadoDecisao } from '@lumens/dominio';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de relato → ids das fotos pendentes que a tela mostrou (vazio é sem foto). */
export type FotosVistas = Record<string, string[]>;

/**
 * Campos do formulário de aprovação. `relatoVisto` (um por relato pendente na tela) diz que o relato
 * foi visto, mesmo sem foto; `fotoVista:<relatoId>` repete uma vez por foto pendente na tela.
 */
export const CAMPO_RELATO_VISTO = 'relatoVisto';
export const PREFIXO_FOTO_VISTA = 'fotoVista:';

/**
 * Campo do formulário de aprovação: a pessoa da curadoria marcou que conferiu texto, foto e relato
 * (nada de nome de pessoa, ofensa ou dado pessoal). Sem ele a aprovação não grava, mesmo que a
 * action seja chamada direto: o `required` do HTML sozinho não segura.
 */
export const CAMPO_CONFERIDO = 'conferido';

export const conferenciaMarcada = (formulario: FormData) =>
  formulario.get(CAMPO_CONFERIDO) === 'on';

export function fotosVistasDoFormulario(formulario: FormData): FotosVistas {
  const fotos: FotosVistas = {};
  for (const [campo, valor] of formulario.entries()) {
    if (typeof valor !== 'string' || valor === '') continue;
    if (campo === CAMPO_RELATO_VISTO) fotos[valor] ??= [];
    else if (campo.startsWith(PREFIXO_FOTO_VISTA)) {
      (fotos[campo.slice(PREFIXO_FOTO_VISTA.length)] ??= []).push(valor);
    }
  }
  return fotos;
}

export interface DependenciasDeDecisao {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  aprovar: (
    pautaId: string,
    curadorId: string,
    categoria: string,
    /** As fotos pendentes de cada relato pendente que a tela mostrou. */
    fotosVistas: FotosVistas,
    urgente?: boolean,
    /** A `versaoDoTexto` do título e da descrição que a tela mostrava. */
    textoVisto?: string,
  ) => Promise<ResultadoDecisao>;
  recusar: (pautaId: string, curadorId: string, motivo: string) => Promise<ResultadoDecisao>;
}

/**
 * Aprovar e recusar pela tela (5.2). Cada função devolve para onde o navegador vai depois; as
 * server actions em `acoes.ts` só redirecionam. Separado delas para testar sem o Auth.js e o banco.
 */
export function criarDecisoes({ curador, aprovar, recusar }: DependenciasDeDecisao) {
  async function decidir(
    pautaId: string,
    agir: (curadorId: string) => Promise<ResultadoDecisao>,
    feito: 'aprovada' | 'recusada',
    /** Devolve o destino se algo impede a decisão; roda depois da sessão e antes de gravar. */
    impedimento?: () => string | undefined,
  ): Promise<string> {
    // A sessão é conferida aqui de novo: a action pode ser chamada direto, sem passar pela tela.
    const quem = await curador();
    if (!quem) return '/login';
    if (!UUID.test(pautaId)) return '/fila';
    const barrada = impedimento?.();
    if (barrada !== undefined) return barrada;

    const resultado = await agir(quem.id);
    if (resultado.decidida) return `/pautas/${pautaId}?feito=${feito}`;
    return resultado.motivo === 'pauta_inexistente'
      ? '/fila'
      : `/pautas/${pautaId}?erro=${resultado.motivo}`;
  }

  return {
    aprovar: (
      pautaId: string,
      categoria: string,
      fotosVistas: FotosVistas,
      urgente = false,
      textoVisto = '',
      /** A confirmação extra: sem ela, nada é aprovado. */
      conferido = false,
    ) =>
      decidir(
        pautaId,
        (c) => aprovar(pautaId, c, categoria, fotosVistas, urgente, textoVisto),
        'aprovada',
        () => (conferido ? undefined : `/pautas/${pautaId}?erro=conferencia_pendente`),
      ),
    recusar: (pautaId: string, motivo: string) =>
      decidir(pautaId, (c) => recusar(pautaId, c, motivo), 'recusada'),
  };
}
