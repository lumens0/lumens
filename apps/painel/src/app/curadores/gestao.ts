import type { ResultadoCurador } from '@lumens/dominio';
import { UUID } from '../pautas/[id]/decisoes';

export interface DependenciasDeGestao {
  /** Curador da sessão, conferido no banco (papel incluído). Sem ele nada é gravado. */
  curador: () => Promise<{ id: string; papel: 'curador' | 'administrador' } | undefined>;
  adicionar: (autorId: string, email: string, nome: string) => Promise<ResultadoCurador>;
  desativar: (autorId: string, alvoId: string) => Promise<ResultadoCurador>;
  reativar: (autorId: string, alvoId: string) => Promise<ResultadoCurador>;
}

/**
 * Adicionar, desativar e reativar curador pela tela (SCRUM-295). Cada função devolve para onde o
 * navegador vai depois; as server actions em `acoes.ts` só redirecionam. Separado delas para
 * testar sem o Auth.js e o banco.
 */
export function criarGestao({ curador, adicionar, desativar, reativar }: DependenciasDeGestao) {
  // Nas duas, a sessão e o papel são conferidos de novo: a action pode ser chamada direto, sem
  // passar pela tela.
  async function mudar(
    alvoId: string,
    agir: (autorId: string) => Promise<ResultadoCurador>,
    feito: 'desativado' | 'reativado',
  ): Promise<string> {
    const quem = await curador();
    if (!quem) return '/login';
    if (quem.papel !== 'administrador') return '/';
    if (!UUID.test(alvoId)) return '/curadores';

    const resultado = await agir(quem.id);
    return resultado.feito ? `/curadores?feito=${feito}` : `/curadores?erro=${resultado.motivo}`;
  }

  return {
    async adicionar(email: string, nome: string): Promise<string> {
      const quem = await curador();
      if (!quem) return '/login';
      if (quem.papel !== 'administrador') return '/';

      const resultado = await adicionar(quem.id, email, nome);
      return resultado.feito
        ? '/curadores?feito=adicionado'
        : `/curadores?erro=${resultado.motivo}`;
    },
    desativar: (alvoId: string) => mudar(alvoId, (autor) => desativar(autor, alvoId), 'desativado'),
    reativar: (alvoId: string) => mudar(alvoId, (autor) => reativar(autor, alvoId), 'reativado'),
  };
}
