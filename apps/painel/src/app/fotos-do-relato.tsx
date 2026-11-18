import type { FotoDaCuradoria } from '@lumens/dominio';
import { MOTIVO_DE_FOTO_MAXIMO } from '@lumens/dominio';
import { Foto } from './arquivos';
import { Enviar } from './enviar';
import estilos from './painel.module.css';

/** Textos de retorno da recusa de foto, para as telas que a mostram. */
export const FEITO_DE_FOTO: Record<string, string> = {
  foto_recusada:
    'Foto recusada. Quem enviou recebe o motivo pelo bot; o texto do relato e as outras fotos seguem.',
};
export const ERRO_DE_FOTO: Record<string, string> = {
  foto_motivo_invalido: `Para recusar a foto, escreva o motivo: até ${String(MOTIVO_DE_FOTO_MAXIMO)} caracteres, numa linha só.`,
  foto_ja_recusada: 'Outra pessoa da curadoria já recusou esta foto.',
  foto_relato_recusado: 'O relato desta foto já foi recusado.',
  foto_foto_inexistente: 'A foto não foi encontrada.',
};

/**
 * As fotos de um relato (até três), cada uma com o seu botão de recusa. Recusar exige motivo, que
 * vai pelo bot a quem enviou. A foto recusada fica visível só aqui, com o motivo.
 */
export function FotosDoRelato({
  fotos,
  recusarFoto,
  voltar,
}: {
  fotos: Pick<FotoDaCuradoria, 'id' | 'chave' | 'moderacao' | 'motivoRecusa'>[];
  recusarFoto: (formulario: FormData) => Promise<void>;
  /** Para onde voltar depois de recusar: `/relatos` ou `/pautas/<id>`. */
  voltar: string;
}) {
  if (fotos.length === 0) return <p className={estilos.detalhes}>Sem foto</p>;
  return (
    <ul className={estilos.lista} aria-label="Fotos do relato">
      {fotos.map((foto, indice) => (
        <li key={foto.id}>
          <p className={estilos.detalhes}>
            Foto {indice + 1} de {fotos.length}
          </p>
          <Foto chave={foto.chave} />
          {foto.moderacao === 'recusado' ? (
            <p className={estilos.aviso}>Recusada. Motivo: {foto.motivoRecusa}</p>
          ) : (
            <details className={estilos.recusa}>
              <summary className={estilos.botaoSecundario}>Recusar só esta foto</summary>
              <form action={recusarFoto} className={estilos.formulario}>
                <input type="hidden" name="fotoId" value={foto.id} />
                <input type="hidden" name="voltar" value={voltar} />
                <label htmlFor={`motivo-foto-${foto.id}`}>
                  Motivo (vai pelo bot para quem enviou a foto)
                </label>
                <textarea
                  id={`motivo-foto-${foto.id}`}
                  name="motivo"
                  required
                  maxLength={MOTIVO_DE_FOTO_MAXIMO}
                />
                <Enviar className={estilos.botaoPerigo}>Confirmar recusa da foto</Enviar>
              </form>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
