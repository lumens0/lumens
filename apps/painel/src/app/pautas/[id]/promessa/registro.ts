import { ErroDeRegra } from '@lumens/dominio';
import { UUID } from '../decisoes';

export interface CamposDaPromessa {
  resumo: string;
  fonte: string;
  /** `YYYY-MM-DD`, como o `<input type="date">` manda. */
  dataEntrega: string;
}

export interface DependenciasDoRegistro {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  registrar: (
    pautaId: string,
    curadorId: string,
    campos: CamposDaPromessa,
  ) => Promise<{ avisados: number }>;
  /** Hoje em Maceió, `YYYY-MM-DD`. Injetável para o teste. */
  hoje: () => string;
}

/** Hoje no fuso da curadoria (UTC−3, sem horário de verão). */
export const hojeEmMaceio = (agora = new Date()) =>
  new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Registrar a resposta oficial e a promessa pela tela (5.4, SCRUM-179). Devolve para onde o
 * navegador vai depois; a server action só redireciona. As regras de status e de data são do
 * domínio (`registrarPromessa`); aqui ficam a sessão e o que é só do formulário.
 */
export function criarRegistroDePromessa({ curador, registrar, hoje }: DependenciasDoRegistro) {
  return async function registrarPelaTela(
    pautaId: string,
    campos: CamposDaPromessa,
  ): Promise<string> {
    const quem = await curador();
    if (!quem) return '/login';
    if (!UUID.test(pautaId)) return '/pautas';

    const formulario = `/pautas/${pautaId}/promessa`;
    const limpos = {
      resumo: campos.resumo.trim(),
      fonte: campos.fonte.trim(),
      dataEntrega: campos.dataEntrega.trim(),
    };
    if (limpos.resumo === '' || limpos.fonte === '' || limpos.dataEntrega === '') {
      return `${formulario}?erro=campos_obrigatorios`;
    }
    // Promessa para o passado abriria a conferência "Foi feito?" na hora, sem ninguém esperar.
    if (limpos.dataEntrega < hoje()) return `${formulario}?erro=data_no_passado`;

    try {
      const { avisados } = await registrar(pautaId, quem.id, limpos);
      return `/pautas/${pautaId}?feito=promessa&avisados=${String(avisados)}`;
    } catch (erro) {
      // Recusas de regra (pauta fora de cobrança, data inexistente) voltam ao formulário.
      if (erro instanceof ErroDeRegra) return `${formulario}?erro=${erro.codigo}`;
      throw erro;
    }
  };
}
