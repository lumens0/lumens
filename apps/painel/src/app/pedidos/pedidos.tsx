import { MOTIVO_DE_EDICAO_MAXIMO, type PedidoDeEdicao } from '@lumens/dominio';
import Link from 'next/link';
import { Enviar } from '../enviar';
import { agruparPorPauta, CabecalhoDaPauta } from '../pautas/grupo';
import type { STATUS } from '../pautas/status';
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
  edicao_dado_pessoal:
    'O texto novo tem e-mail, telefone ou matrícula e não pode ser publicado. Recuse o pedido, com o motivo.',
};

const MOTIVO_ACHADO: Record<string, string> = {
  nome_conhecido: 'nome de quem participa',
  email: 'e-mail',
  telefone: 'telefone',
  matricula: 'matrícula',
  possivel_nome: 'possível nome de pessoa',
};

const CAMPO = { titulo: 'Título', descricao: 'Descrição' };

export type PedidoNaTela = PedidoDeEdicao & { pautaTitulo?: string };

/**
 * A fila de pedidos de todas as pautas, agrupada por pauta: um cabeçalho com "N pedidos" e,
 * embaixo, cada pedido no seu quadro. Cada pedido segue como em `PedidosDeEdicao`.
 */
export function PedidosPorPauta({
  pedidos,
  aprovar,
  recusar,
  voltar,
}: {
  pedidos: (PedidoDeEdicao & {
    pautaTitulo: string;
    pautaBloco?: string | null;
    pautaStatus?: keyof typeof STATUS;
  })[];
  aprovar: (formulario: FormData) => Promise<void>;
  recusar: (formulario: FormData) => Promise<void>;
  voltar: string;
}) {
  return (
    <>
      {agruparPorPauta(pedidos).map((grupo) => (
        <section
          key={grupo.pautaId}
          aria-label={`Pedidos da pauta ${grupo.titulo}`}
          className={estilos.grupoDaPauta}
        >
          <CabecalhoDaPauta
            pautaId={grupo.pautaId}
            titulo={grupo.titulo}
            status={grupo.status}
            onde={grupo.bloco === undefined ? undefined : (grupo.bloco ?? 'Campus inteiro')}
            quantidade={grupo.itens.length}
            um="pedido"
            varios="pedidos"
          />
          <PedidosDeEdicao
            pedidos={grupo.itens.map(
              ({ pautaTitulo: _titulo, pautaBloco: _bloco, pautaStatus: _status, ...pedido }) =>
                pedido,
            )}
            aprovar={aprovar}
            recusar={recusar}
            voltar={voltar}
          />
        </section>
      ))}
    </>
  );
}

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
    <ul className={estilos.quadros}>
      {pedidos.map((pedido) => {
        const bloqueado = pedido.achados.some((a) => a.severidade === 'bloqueio');
        return (
          <li key={pedido.id} className={estilos.quadro}>
            <p className={estilos.detalhes}>
              {CAMPO[pedido.campo]}
              {pedido.pautaTitulo !== undefined && (
                <>
                  {' da pauta '}
                  <Link href={`/pautas/${pedido.pautaId}`}>{pedido.pautaTitulo}</Link>
                </>
              )}
              {' · pedido de quem criou a pauta'}
            </p>
            <dl className={estilos.antesDepois}>
              <div>
                <dt>Publicado</dt>
                <dd>{pedido.antes}</dd>
              </div>
              <div>
                <dt>Pedido</dt>
                <dd>{pedido.depois}</dd>
              </div>
            </dl>
            {pedido.achados.length > 0 && (
              <ul className={estilos.achados}>
                {pedido.achados.map((achado) => (
                  <li
                    key={`${String(achado.inicio)}-${achado.motivo}`}
                    className={achado.severidade === 'bloqueio' ? estilos.barrar : estilos.conferir}
                  >
                    <b>{achado.severidade === 'bloqueio' ? 'Barrar' : 'Conferir'}</b>{' '}
                    {MOTIVO_ACHADO[achado.motivo]} ({achado.trecho})
                  </li>
                ))}
              </ul>
            )}
            <div className={estilos.acoesDoRelato}>
              <form action={aprovar} className={estilos.emGrade}>
                <input type="hidden" name="pedidoId" value={pedido.id} />
                <input type="hidden" name="depoisVisto" value={pedido.depois} />
                <input type="hidden" name="voltar" value={voltar} />
                {/* Dado pessoal no texto novo trava a aprovação: só dá para recusar (e o domínio confere). */}
                <Enviar className={estilos.botao} desabilitado={bloqueado}>
                  Aprovar
                </Enviar>
              </form>
              <details className={estilos.recusa}>
                <summary className={estilos.botaoSecundario}>Recusar…</summary>
                <form action={recusar} className={estilos.formulario}>
                  <input type="hidden" name="pedidoId" value={pedido.id} />
                  <input type="hidden" name="voltar" value={voltar} />
                  <label htmlFor={`motivo-pedido-${pedido.id}`}>
                    Motivo, enviado pelo bot (uma linha)
                  </label>
                  <input
                    id={`motivo-pedido-${pedido.id}`}
                    name="motivo"
                    required
                    maxLength={MOTIVO_DE_EDICAO_MAXIMO}
                  />
                  <Enviar className={estilos.botaoPerigo}>Confirmar recusa</Enviar>
                </form>
              </details>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
