import type { PautaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../../painel.module.css';
import { dataHora, textoDoPrazo } from '../../prazo';
import { Foto } from '../../arquivos';
import { ACEITA_PROMESSA } from './promessa/formulario';

export const STATUS: Record<PautaDaCuradoria['status'], string> = {
  em_curadoria: 'Esperando decisão da curadoria',
  recusada: 'Recusada',
  juntando_apoios: 'Juntando apoios',
  meta_batida: 'Meta batida',
  cobrando: 'Em cobrança',
  prometido: 'Prometido',
  entregue_em_parte: 'Entregue em parte',
  descumprida: 'Promessa descumprida',
  conquistada: 'Conquistada',
};

const ERRO: Record<string, string> = {
  motivo_obrigatorio: 'Para recusar, escreva o motivo. Ele é enviado a quem criou a pauta.',
  ja_decidida: 'Outra pessoa da curadoria já decidiu esta pauta.',
};

type Acao = (formulario: FormData) => Promise<void>;

/** Tela da pauta para a curadoria (5.2, SCRUM-168): o que foi relatado e as duas decisões. */
export function Pauta({
  pauta,
  erro,
  avisados,
  aprovar,
  recusar,
}: {
  pauta: PautaDaCuradoria;
  erro?: string | undefined;
  /** Vem depois de registrar a promessa: quantos apoiadores entraram na fila de aviso. */
  avisados?: number | undefined;
  aprovar: Acao;
  recusar: Acao;
}) {
  const aviso = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <h1>{pauta.titulo}</h1>
      {avisados !== undefined && (
        <p className={estilos.aviso} role="status">
          Promessa registrada.{' '}
          {avisados === 1 ? '1 apoiador vai' : `${String(avisados)} apoiadores vão`} receber o aviso
          da resposta pelo WhatsApp.
        </p>
      )}
      {aviso !== undefined && (
        <p className={estilos.erro} role="alert">
          {aviso}
        </p>
      )}
      <dl className={estilos.ficha}>
        <dt>Situação</dt>
        <dd>{STATUS[pauta.status]}</dd>
        <dt>Onde</dt>
        <dd>{pauta.bloco ?? 'Campus inteiro'}</dd>
        <dt>Criada em</dt>
        <dd>{dataHora(pauta.criadaEm)}</dd>
        {pauta.status === 'em_curadoria' && (
          <>
            <dt>Prazo</dt>
            <dd className={pauta.restanteMs < 0 ? estilos.atrasada : undefined}>
              {dataHora(pauta.prazo)} ({textoDoPrazo(pauta.restanteMs)})
            </dd>
          </>
        )}
        <dt>Foto</dt>
        <dd>{pauta.fotoChave === null ? 'Sem foto' : <Foto chave={pauta.fotoChave} />}</dd>
        {pauta.motivoRecusa !== null && (
          <>
            <dt>Motivo da recusa</dt>
            <dd>{pauta.motivoRecusa}</dd>
          </>
        )}
      </dl>
      <p className={estilos.descricaoDaPauta}>{pauta.descricao}</p>

      <p>
        <Link href={`/pautas/${pauta.id}/linha-do-tempo`}>Ver a linha do tempo</Link>
      </p>

      {ACEITA_PROMESSA.includes(pauta.status) && (
        <Link className={estilos.acao} href={`/pautas/${pauta.id}/promessa`}>
          Registrar resposta e promessa
        </Link>
      )}

      {pauta.status === 'em_curadoria' && (
        <div className={estilos.decisoes}>
          <form action={aprovar} className={estilos.cartao}>
            <h2>Aprovar</h2>
            <p className={estilos.detalhes}>
              A pauta passa a aparecer no site e a juntar apoios. Confira antes se o texto não tem
              nome de pessoa, ofensa nem dado pessoal.
            </p>
            <input type="hidden" name="pautaId" value={pauta.id} />
            <button className={estilos.botao} type="submit" style={{ marginTop: 10 }}>
              Aprovar pauta
            </button>
          </form>
          <form action={recusar} className={estilos.cartao}>
            <h2>Recusar</h2>
            <input type="hidden" name="pautaId" value={pauta.id} />
            <label htmlFor="motivo">Motivo (vai pelo WhatsApp para quem criou a pauta)</label>
            <textarea id="motivo" name="motivo" required maxLength={500} />
            <button className={estilos.botaoPerigo} type="submit">
              Recusar pauta
            </button>
          </form>
        </div>
      )}
    </>
  );
}
