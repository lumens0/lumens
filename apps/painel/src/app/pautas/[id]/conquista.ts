import { conferirOQueFoiFeito, type ResultadoDaConquista } from '@lumens/dominio';
import { UUID } from './decisoes';
import type { FotoPreparada, MotivoDaFoto } from './conquista-foto';

import { CAMPO_FOTO, CAMPO_TEXTO, CAMPO_TIRAR_FOTO } from './conquista-campos';

export interface DependenciasDaConquista {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  /** Confere, tira os metadados e devolve o JPEG (`prepararFotoDaConquista`). */
  preparar: (bytes: Buffer) => Promise<FotoPreparada>;
  /** Guarda o arquivo no storage e devolve a chave. Lança se o storage falhar. */
  guardar: (bytes: Buffer, contentType: string) => Promise<string>;
  /** Grava texto e foto numa transação (`salvarConquistaDaCuradoria`). */
  salvar: (campos: {
    pautaId: string;
    curadorId: string;
    texto: string;
    fotoChave?: string;
    removerFoto: boolean;
  }) => Promise<ResultadoDaConquista>;
  /** Põe na fila de remoção a foto que ficou no storage sem dono (a gravação foi recusada). */
  descartar: (chave: string) => Promise<void>;
  /** Registra falha de storage ou de fila, sem dados da pessoa. */
  avisar?: (mensagem: string) => void;
}

const ERRO_DA_FOTO: Record<MotivoDaFoto, string> = {
  formato: 'foto_formato',
  tamanho: 'foto_tamanho',
  invalida: 'foto_invalida',
};

/**
 * Salvar o "o que foi feito" pela tela (SCRUM-394). Devolve para onde o navegador vai depois; a
 * server action em `conquista-acoes.ts` só redireciona. Separado dela para testar sem o Auth.js,
 * o storage e o banco.
 *
 *   texto conferido ─▶ foto sem metadados ─▶ storage ─▶ transação (linha + evento)
 *   (antes de tudo)    (sharp)                 (chave)    se recusar: foto vai para a fila de remoção
 */
export function criarSalvarConquista({
  curador,
  preparar,
  guardar,
  salvar,
  descartar,
  avisar = () => undefined,
}: DependenciasDaConquista) {
  async function descartarSemFalhar(chave: string) {
    try {
      await descartar(chave);
    } catch (erro) {
      avisar(
        `conquista: foto sem dono não entrou na fila (${erro instanceof Error ? erro.name : 'erro'})`,
      );
    }
  }

  return async function salvarConquista(pautaId: string, formulario: FormData): Promise<string> {
    const quem = await curador();
    if (!quem) return '/login';
    if (!UUID.test(pautaId)) return '/fila';
    const voltar = (resultado: string) => `/pautas/${pautaId}?${resultado}#conquista-pauta`;

    const bruto = formulario.get(CAMPO_TEXTO);
    const texto = typeof bruto === 'string' ? bruto : '';
    // O texto é conferido antes de guardar a foto: texto recusado não deixa arquivo órfão.
    const conferido = conferirOQueFoiFeito(texto);
    if (!conferido.ok) return voltar(`erro=${conferido.motivo}`);

    const arquivo = formulario.get(CAMPO_FOTO);
    let fotoChave: string | undefined;
    if (arquivo instanceof File && arquivo.size > 0) {
      const foto = await preparar(Buffer.from(await arquivo.arrayBuffer()));
      if (!foto.ok) return voltar(`erro=${ERRO_DA_FOTO[foto.motivo]}`);
      try {
        fotoChave = await guardar(foto.bytes, foto.contentType);
      } catch (erro) {
        avisar(`conquista: storage falhou (${erro instanceof Error ? erro.name : 'erro'})`);
        return voltar('erro=foto_armazenamento');
      }
    }

    let resultado: ResultadoDaConquista;
    try {
      resultado = await salvar({
        pautaId,
        curadorId: quem.id,
        texto,
        ...(fotoChave === undefined ? {} : { fotoChave }),
        removerFoto: formulario.get(CAMPO_TIRAR_FOTO) === 'on',
      });
    } catch (erro) {
      if (fotoChave !== undefined) await descartarSemFalhar(fotoChave);
      throw erro;
    }
    if (!resultado.salva) {
      if (fotoChave !== undefined) await descartarSemFalhar(fotoChave);
      return resultado.motivo === 'pauta_inexistente'
        ? '/fila'
        : voltar(`erro=${resultado.motivo}`);
    }
    return voltar('feito=conquista');
  };
}
