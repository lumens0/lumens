import { MOTIVO_DE_EDICAO_MAXIMO, type PedidoDeEdicao } from '@lumens/dominio';
import Link from 'next/link';
import { Enviar } from '../enviar';
import estilos from '../painel.module.css';

/** Textos de retorno das decisões, para as telas que mostram pedidos. */
export const FEITO_DE_PEDIDO: Record<string, string> = {
  edicao_aprovada:
    'Mudança aprovada. O texto novo já está no site e quem pediu recebe o aviso pelo bot.',
  edicao_recusada:
    'Mudança recusada. O texto publicado continua o mesmo e quem pediu recebe o motivo pelo bot.',
};
export const ERRO_DE_PEDIDO: Record<string, string> = {
  edicao_motivo_invalido: `Para recusar, escreva o motivo: até ${String(MOTIVO_DE_EDICAO_MAXIMO)} caracteres, numa linha só.`,
  edicao_ja_decidido: 'Outra pessoa da curadoria já decidiu este pedido.',
  edicao_pedido_mudou:
    'O texto da pauta ou o pedido mudou depois que a tela abriu. Confira o antes e o depois de novo.',
  edicao_pedido_inexistente: 'O pedido não foi encontrado.',
};

const CAMPO = { titulo: 'Título', descricao: 'Descrição' };

export type PedidoNaTela = PedidoDeEdicao & { pautaTitulo?: string };

/**
 * Pedidos de mudança de título ou descrição de pautas já publicadas. Mostra o antes e o depois;
 * aprovar vale para o texto que está na tela, e recusar exige motivo, que vai pelo bot a quem pediu.
 */
export function PedidosDeEdicao({
  pedidos,
  aprovar,
  recusar,
  voltar,
}: {
  pedidos: PedidoNaTela[];
  aprovar: (formulario: FormData) => Promise<void>;
  recusar: (formulario: FormData) => Promise<void>;
  /** Para onde voltar depois de decidir: `/pedidos` ou `/pautas/<id>`. */
  voltar: string;
}) {
  return (
    <ul className={estilos.lista}>
      {pedidos.map((pedido) => (
        <li key={pedido.id} className={[estilos.cartao, estilos.relato].join(' ')}>
          <h3>
            {CAMPO[pedido.campo]}
            {pedido.pautaTitulo !== undefined && (
              <>
                {' '}
                da pauta <Link href={`/pautas/${pedido.pautaId}`}>{pedido.pautaTitulo}</Link>
              </>
            )}
          </h3>
          <dl className={estilos.ficha}>
            <dt>Antes (publicado)</dt>
            <dd className={estilos.textoDoRelato}>{pedido.antes}</dd>
            <dt>Depois (pedido)</dt>
            <dd className={estilos.textoDoRelato}>{pedido.depois}</dd>
          </dl>
          <p className={estilos.detalhes}>
            Confira: nada de nome de pessoa, ofensa ou dado pessoal. Aprovar publica o texto novo na
            hora.
          </p>
          <div className={estilos.acoesDoRelato}>
            <form action={aprovar}>
              <input type="hidden" name="pedidoId" value={pedido.id} />
              <input type="hidden" name="depoisVisto" value={pedido.depois} />
              <input type="hidden" name="voltar" value={voltar} />
              <Enviar className={estilos.botao}>Aprovar mudança</Enviar>
            </form>
          </div>
          <details className={estilos.recusa}>
            <summary className={estilos.botaoSecundario}>Recusar mudança</summary>
            <form action={recusar} className={estilos.formulario}>
              <input type="hidden" name="pedidoId" value={pedido.id} />
              <input type="hidden" name="voltar" value={voltar} />
              <label htmlFor={`motivo-pedido-${pedido.id}`}>
                Motivo (vai pelo bot para quem pediu)
              </label>
              <textarea
                id={`motivo-pedido-${pedido.id}`}
                name="motivo"
                required
                maxLength={MOTIVO_DE_EDICAO_MAXIMO}
              />
              <Enviar className={estilos.botaoPerigo}>Confirmar recusa</Enviar>
            </form>
          </details>
        </li>
      ))}
    </ul>
  );
}
